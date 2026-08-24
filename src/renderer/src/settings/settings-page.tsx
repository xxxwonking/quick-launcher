import { BookOpen, Check, Command, Keyboard, Palette, Pencil, Plus, Rocket, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { launcherHotkeyForPlatform } from '../../../shared/platform-hotkey'
import type { LauncherSettingsSnapshot, SearchEngine, UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from '../../../shared/launcher-ipc'
import type { ThemePreference } from '../theme/theme'
import { GuidedTour, type TourStep } from '../tutorial/guided-tour'

type SettingsSection = 'general' | 'commands' | 'appearance' | 'tutorial'

type SettingsPageProps = {
  themePreference?: ThemePreference
  onThemeChange?: (preference: ThemePreference) => void
  onOpenTutorial?: () => void
  tutorialOpen?: boolean
}
const SETTINGS_TOUR: TourStep[] = [
  { target: 'settings-navigation', title: '设置导航', body: '常规、快捷命令、外观和教程都集中在这里。' },
  { target: 'settings-hotkey', title: '快速唤起', body: '默认使用 Alt + Space。遇到冲突时，可以在这里重新录入。' },
  { target: 'settings-commands', title: '自定义快捷命令', body: '例如 wx 打开微信，cursor 打开 Cursor，llq + 关键词进行网页搜索。' },
  { target: 'settings-appearance', title: '跟随系统主题', body: '默认自动跟随电脑浅色或深色配置，也可以手动固定。' },
  { target: 'settings-tutorial', title: '随时重新学习', body: '以后输入 tutorial、help、教程或帮助，也能回到这套漫游引导。' },
]

const NAV_ITEMS: Array<{ id: SettingsSection; label: string; icon: typeof Settings2; tourTarget: string }> = [
  { id: 'general', label: '常规设置', icon: Settings2, tourTarget: 'settings-navigation' },
  { id: 'commands', label: '快捷命令', icon: Command, tourTarget: 'settings-commands' },
  { id: 'appearance', label: '外观', icon: Palette, tourTarget: 'settings-appearance' },
  { id: 'tutorial', label: '教程与帮助', icon: BookOpen, tourTarget: 'settings-tutorial' },
]

const DEFAULT_SETTINGS: LauncherSettingsSnapshot = {
  schemaVersion: 1,
  hotkey: launcherHotkeyForPlatform(/mac/i.test(window.navigator.platform) ? 'darwin' : 'other').accelerator,
  autostart: false,
  showRecent: false,
  theme: 'system',
  searchEngine: { kind: 'bing' },
  activeHotkey: null,
  hotkeyConflict: false,
}

const EMPTY_DRAFT: UserCommandDraft = { id: '', keyword: '', title: '', type: 'open-url', target: '', enabled: true }

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('HOTKEY_CONFLICT')) return '快捷键已被其他应用占用，请换一个组合键。'
  if (message.includes('AUTOSTART_FAILED')) return '保存失败：系统拒绝了开机启动设置，请在系统设置中允许 Quick Launcher。'
  if (message.includes('COMMAND_CONFLICT')) return '命令关键词或 ID 已存在。'
  if (message.includes('COMMAND_NOT_FOUND')) return '命令已不存在，请刷新后重试。'
  if (message.includes('SETTINGS_UNAVAILABLE')) return '保存失败：设置服务尚未就绪，请重新打开设置窗口。'
  if (/INVALID_(SETTINGS|HOTKEY|AUTOSTART|SHOW_RECENT|THEME|SEARCH_ENGINE)/u.test(message)) return '保存失败：设置内容无效，请重新选择后再试。'
  if (/EACCES|EPERM|permission denied/i.test(message)) return '保存失败：设置文件没有写入权限，请检查应用数据目录权限。'
  if (/ENOENT|ENOTDIR|EISDIR|ENOSPC|EBUSY/u.test(message)) return '保存失败：设置文件所在目录不可用，请检查磁盘和应用数据目录。'
  return '保存失败：设置服务暂时不可用，请稍后重试。'
}

function hotkeyLabel(accelerator: string): string {
  const mac = /mac/i.test(window.navigator.platform)
  return accelerator.split('+').map((part) => {
    if (part === 'Alt') return mac ? 'Option' : 'Alt'
    if (part === 'Control') return 'Ctrl'
    if (part === 'Command' || part === 'Super') return mac ? 'Command' : 'Win'
    if (part === 'Escape') return 'Esc'
    return part
  }).join(' + ')
}

function eventAccelerator(event: React.KeyboardEvent<HTMLButtonElement>): string | undefined {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return undefined
  const parts: string[] = []
  if (event.ctrlKey) parts.push('Control')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (event.metaKey) parts.push('Command')
  if (parts.length === 0) return undefined
  const normalizedKey = event.key === ' ' ? 'Space' : event.key.length === 1 ? event.key.toUpperCase() : event.key
  return [...parts, normalizedKey].join('+')
}

function isSearchEngine(value: SearchEngine['kind']): value is SearchEngine['kind'] {
  return value === 'bing' || value === 'baidu' || value === 'google' || value === 'custom'
}

export function SettingsPage({ themePreference = 'system', onThemeChange = () => undefined, onOpenTutorial = () => undefined, tutorialOpen = false }: SettingsPageProps): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('general')
  const [settings, setSettings] = useState<LauncherSettingsSnapshot>(DEFAULT_SETTINGS)
  const [commands, setCommands] = useState<UserCommand[]>([])
  const [tourOpen, setTourOpen] = useState(tutorialOpen)
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [commandFormOpen, setCommandFormOpen] = useState(false)
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null)
  const [commandDraft, setCommandDraft] = useState<UserCommandDraft>(EMPTY_DRAFT)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const api = window.launcher
  const platformHotkey = launcherHotkeyForPlatform(/mac/i.test(window.navigator.platform) ? 'darwin' : 'other')

  useEffect(() => {
    let disposed = false
    const load = async (): Promise<void> => {
      try {
        const [loadedSettings, loadedCommands] = await Promise.all([api?.getSettings?.(), api?.getCommands?.()])
        if (disposed) return
        if (loadedSettings) setSettings(loadedSettings)
        if (loadedCommands) setCommands(loadedCommands)
      } catch (loadError) {
        if (!disposed) setError(errorMessage(loadError))
      }
    }
    void load()
    return () => { disposed = true }
  }, [api])

  useEffect(() => { setTourOpen(tutorialOpen) }, [tutorialOpen])

  const updateSettings = async (patch: NonNullable<NonNullable<typeof api>['updateSettings']> extends (patch: infer T) => unknown ? T : never): Promise<void> => {
    setSettings((current) => ({ ...current, ...patch, searchEngine: patch.searchEngine ? { ...patch.searchEngine } : current.searchEngine }))
    if (!api?.updateSettings) return
    setSaving(true)
    setError(null)
    try {
      const next = await api.updateSettings(patch)
      setSettings(next)
      if (patch.theme) onThemeChange(patch.theme)
    } catch (updateError) {
      setError(errorMessage(updateError))
    } finally {
      setSaving(false)
    }
  }

  const beginTutorial = (): void => { setTourOpen(true); onOpenTutorial() }

  const recordHotkey = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    const accelerator = eventAccelerator(event)
    if (!accelerator) return
    event.preventDefault()
    setRecordingHotkey(false)
    void updateSettings({ hotkey: accelerator })
  }

  const openNewCommand = (): void => { setEditingCommandId(null); setCommandDraft({ ...EMPTY_DRAFT }); setCommandFormOpen(true); setError(null) }
  const openEditCommand = (command: UserCommand): void => { setEditingCommandId(command.id); setCommandDraft({ ...command }); setCommandFormOpen(true); setError(null) }

  const saveCommand = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!api) return
    const keyword = commandDraft.keyword.trim()
    const draft = { ...commandDraft, keyword, id: /^[A-Za-z0-9._-]+$/u.test(commandDraft.id) ? commandDraft.id : `cmd-${Date.now().toString(36)}` }
    if (!draft.keyword.trim() || !draft.title.trim() || !draft.target.trim()) { setError('请填写完整的命令信息。'); return }
    if (!/^[\p{L}\p{N}\p{Script=Han}_-]+$/u.test(draft.keyword)) { setError('关键词只能包含中文、字母、数字、下划线或连字符。'); return }
    if (draft.type === 'open-url' && !/^https?:\/\//i.test(draft.target)) { setError('固定网址必须以 http:// 或 https:// 开头。'); return }
    setSaving(true)
    setError(null)
    try {
      const saved = editingCommandId
        ? await api.updateCommand?.(editingCommandId, { keyword: draft.keyword, title: draft.title, type: draft.type, target: draft.target, enabled: draft.enabled } as UserCommandPatch)
        : await api.createCommand?.(draft)
      if (!saved) return
      setCommands((current) => editingCommandId ? current.map((command) => command.id === saved.id ? saved : command) : [...current, saved])
      setCommandFormOpen(false)
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving(false)
    }
  }

  const setCommandEnabled = async (command: UserCommand, enabled: boolean): Promise<void> => {
    if (!api?.setCommandEnabled) return
    try {
      const updated = await api.setCommandEnabled(command.id, enabled)
      setCommands((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate))
    } catch (toggleError) { setError(errorMessage(toggleError)) }
  }

  const deleteCommand = async (command: UserCommand): Promise<void> => {
    if (!api?.deleteCommand) return
    try {
      await api.deleteCommand(command.id)
      setCommands((current) => current.filter((candidate) => candidate.id !== command.id))
    } catch (deleteError) { setError(errorMessage(deleteError)) }
  }

  const sectionTitle = NAV_ITEMS.find((item) => item.id === section)?.label ?? '常规设置'

  return (
    <main className="settings-shell min-h-screen text-primary">
      <aside className="settings-sidebar border-r border-divider" data-tour="settings-navigation">
        <div className="flex items-center gap-3.5 px-6 pb-8 pt-7">
          <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white dark:bg-zinc-100 dark:text-zinc-950 shadow-md shadow-slate-900/10">
            <Rocket className="size-5" />
          </span>
          <div>
            <strong className="block text-[15px] font-bold tracking-tight">Quick Launcher</strong>
            <span className="text-[12px] font-medium text-secondary">偏好设置</span>
          </div>
        </div>

        <nav aria-label="设置导航" className="space-y-1 px-3.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon, tourTarget }) => (
            <button
              aria-current={section === id ? 'page' : undefined}
              className={`settings-nav-item ${section === id ? 'settings-nav-active' : ''}`}
              data-tour={tourTarget}
              key={id}
              onClick={() => setSection(id)}
              type="button"
            >
              <Icon aria-hidden="true" className="size-4 shrink-0" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <p className="mt-auto px-6 pb-6 text-[11px] font-medium text-muted">Quick Launcher · M1 Preview</p>
      </aside>

      <section className="h-screen overflow-y-auto px-10 py-9">
        <header className="mb-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">Settings</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{sectionTitle}</h1>
        </header>
        {error && <p className="settings-error mx-auto mb-6 max-w-[720px] rounded-xl px-4 py-3 text-sm" role="alert">{error}</p>}
        <div className="mx-auto max-w-[720px] space-y-5">
          {section === 'general' && (
            <>
              <section className="settings-card" data-tour="settings-hotkey">
                <div className="settings-card-icon"><Keyboard className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">全局快捷键</h2>
                  <p className="settings-card-description">从任何位置快速打开搜索窗口</p>
                  <p className="mt-1.5 text-[11.5px] font-medium text-secondary">{settings.hotkeyConflict ? '当前快捷键冲突' : settings.activeHotkey ? '快捷键已启用' : '点击按钮后按下新的组合键'}</p>
                </div>
                <button
                  aria-label="录入全局快捷键"
                  aria-pressed={recordingHotkey}
                  className={`hotkey-chip ${recordingHotkey ? 'ring-2 ring-accent animate-pulse shadow-[0_0_15px_var(--accent-glow)]' : ''}`}
                  onClick={() => setRecordingHotkey(true)}
                  onKeyDown={recordHotkey}
                  type="button"
                >
                  {recordingHotkey ? '请按键…' : hotkeyLabel(settings.hotkey || platformHotkey.accelerator)}
                </button>
              </section>

              <section className="settings-card">
                <div className="settings-card-icon"><Rocket className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">启动与列表</h2>
                  <p className="settings-card-description">控制登录启动行为和搜索框为空时是否显示最近使用</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2.5 text-sm font-medium">
                  <label className="flex cursor-pointer items-center gap-2.5 hover:text-accent transition-colors">
                    <input
                      aria-label="开机自动启动"
                      className="accent-accent scale-105"
                      checked={settings.autostart}
                      disabled={saving}
                      onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, autostart: checked })); void updateSettings({ autostart: checked }) }}
                      type="checkbox"
                    />
                    <span>开机自动启动</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2.5 hover:text-accent transition-colors">
                    <input
                      aria-label="显示最近使用"
                      className="accent-accent scale-105"
                      checked={settings.showRecent}
                      disabled={saving}
                      onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, showRecent: checked })); void updateSettings({ showRecent: checked }) }}
                      type="checkbox"
                    />
                    <span>显示最近使用</span>
                  </label>
                </div>
              </section>

              <section className="settings-card items-start">
                <div className="settings-card-icon"><Command className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">搜索引擎</h2>
                  <p className="settings-card-description">网页搜索命令将使用这个搜索引擎</p>
                  {settings.searchEngine.kind === 'custom' && (
                    <input
                      aria-label="自定义搜索模板"
                      className="settings-input mt-3 w-full"
                      onChange={(event) => void updateSettings({ searchEngine: { kind: 'custom', template: event.target.value } })}
                      placeholder="https://example.com/search?q={query}"
                      value={settings.searchEngine.template}
                    />
                  )}
                </div>
                <select
                  aria-label="搜索引擎"
                  className="theme-select"
                  onChange={(event) => {
                    const kind = event.target.value as SearchEngine['kind']
                    if (isSearchEngine(kind)) void updateSettings(kind === 'custom' ? { searchEngine: { kind, template: 'https://www.google.com/search?q={query}' } } : { searchEngine: { kind } })
                  }}
                  value={settings.searchEngine.kind}
                >
                  <option value="bing">Bing</option>
                  <option value="baidu">百度</option>
                  <option value="google">Google</option>
                  <option value="custom">自定义</option>
                </select>
              </section>

              <section className="settings-card" data-tour="settings-appearance">
                <div className="settings-card-icon"><Palette className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">外观主题</h2>
                  <p className="settings-card-description">跟随电脑当前颜色配置，或手动覆盖</p>
                </div>
                <label className="sr-only" htmlFor="theme-preference-general">外观主题</label>
                <select
                  aria-label="外观主题"
                  className="theme-select"
                  id="theme-preference-general"
                  onChange={(event) => {
                    const preference = event.target.value as ThemePreference
                    onThemeChange(preference)
                    void updateSettings({ theme: preference })
                  }}
                  value={themePreference}
                >
                  <option value="system">跟随系统</option>
                  <option value="light">浅色</option>
                  <option value="dark">深色</option>
                </select>
              </section>

              <section className="settings-card" data-tour="settings-tutorial">
                <div className="settings-card-icon"><BookOpen className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">漫游式使用教程</h2>
                  <p className="settings-card-description">逐步高亮真实控件，每一步由你确认后继续</p>
                </div>
                <button className="primary-button" onClick={beginTutorial} type="button">开始使用教程</button>
              </section>
            </>
          )}

          {section === 'commands' && (
            <section className="space-y-4" data-tour="settings-commands">
              <div className="flex items-center justify-between px-1">
                <p className="text-xs font-medium text-secondary">创建固定网址或网页搜索命令，保存后会立即出现在搜索结果中。</p>
                <button className="primary-button flex items-center gap-1.5" onClick={openNewCommand} type="button">
                  <Plus className="size-4" />新增命令
                </button>
              </div>
              {commands.length === 0 && (
                <div className="settings-card justify-center py-10 text-center">
                  <div>
                    <h2 className="settings-card-title">还没有自定义命令</h2>
                    <p className="settings-card-description mt-1">例如输入 docs 就能打开你的项目文档。</p>
                  </div>
                </div>
              )}
              {commands.map((command) => (
                <div className="settings-card" key={command.id}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2.5">
                      <kbd className="hotkey-chip px-2.5 py-0.5 font-bold">{command.keyword}</kbd>
                      <h2 className="settings-card-title">{command.title}</h2>
                    </div>
                    <p className="settings-card-description mt-1.5 truncate">{command.type === 'open-url' ? command.target : `搜索：${command.target}`}</p>
                  </div>
                  <label className="mr-2 flex items-center gap-2 text-xs font-medium text-secondary">
                    <input
                      aria-label={`启用 ${command.title}`}
                      className="accent-accent scale-105"
                      checked={command.enabled}
                      onChange={(event) => void setCommandEnabled(command, event.target.checked)}
                      type="checkbox"
                    />
                    <span>启用</span>
                  </label>
                  <button aria-label={`编辑 ${command.title}`} className="icon-button" onClick={() => openEditCommand(command)} type="button">
                    <Pencil className="size-4" />
                  </button>
                  <button aria-label={`删除 ${command.title}`} className="icon-button text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/10" onClick={() => void deleteCommand(command)} type="button">
                    <Trash2 className="size-4" />
                  </button>
                </div>
              ))}
              {commandFormOpen && (
                <form className="settings-card block space-y-4" onSubmit={(event) => void saveCommand(event)}>
                  <div className="flex items-center justify-between border-b border-divider pb-3">
                    <h2 className="settings-card-title">{editingCommandId ? '编辑命令' : '新增命令'}</h2>
                    <button className="text-xs font-semibold text-secondary hover:text-primary" onClick={() => setCommandFormOpen(false)} type="button">取消</button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold text-secondary">
                      命令关键词
                      <input
                        aria-label="命令关键词"
                        className="settings-input"
                        disabled={Boolean(editingCommandId)}
                        onChange={(event) => setCommandDraft((current) => ({ ...current, keyword: event.target.value, id: current.id === '' || current.id === current.keyword ? event.target.value : current.id }))}
                        value={commandDraft.keyword}
                      />
                    </label>
                    <label className="text-xs font-semibold text-secondary">
                      命令名称
                      <input
                        aria-label="命令名称"
                        className="settings-input"
                        onChange={(event) => setCommandDraft((current) => ({ ...current, title: event.target.value }))}
                        value={commandDraft.title}
                      />
                    </label>
                  </div>
                  <label className="block text-xs font-semibold text-secondary">
                    命令类型
                    <select
                      aria-label="命令类型"
                      className="settings-input"
                      onChange={(event) => setCommandDraft((current) => ({ ...current, type: event.target.value as UserCommandType }))}
                      value={commandDraft.type}
                    >
                      <option value="open-url">打开固定网址</option>
                      <option value="web-search">网页搜索</option>
                    </select>
                  </label>
                  <label className="block text-xs font-semibold text-secondary">
                    {commandDraft.type === 'open-url' ? '目标地址' : '搜索内容'}
                    <input
                      aria-label={commandDraft.type === 'open-url' ? '目标地址' : '搜索内容'}
                      className="settings-input"
                      onChange={(event) => setCommandDraft((current) => ({ ...current, target: event.target.value }))}
                      placeholder={commandDraft.type === 'open-url' ? 'https://example.com' : '例如：我的项目文档'}
                      value={commandDraft.target}
                    />
                  </label>
                  <div className="pt-2">
                    <button className="primary-button flex items-center gap-1.5" disabled={saving} type="submit">
                      <Check className="size-4" />保存命令
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {section === 'appearance' && (
            <section className="settings-card" data-tour="settings-appearance">
              <div className="settings-card-icon"><Palette className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="settings-card-title">外观主题</h2>
                <p className="settings-card-description">跟随电脑当前颜色配置，或手动覆盖</p>
              </div>
              <label className="sr-only" htmlFor="theme-preference">外观主题</label>
              <select
                className="theme-select"
                id="theme-preference"
                onChange={(event) => {
                  const preference = event.target.value as ThemePreference
                  onThemeChange(preference)
                  void updateSettings({ theme: preference })
                }}
                value={themePreference}
              >
                <option value="system">跟随系统</option>
                <option value="light">浅色</option>
                <option value="dark">深色</option>
              </select>
            </section>
          )}

          {section === 'tutorial' && (
            <section className="settings-card" data-tour="settings-tutorial">
              <div className="settings-card-icon"><BookOpen className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="settings-card-title">漫游式使用教程</h2>
                <p className="settings-card-description">逐步高亮真实控件，每一步由你确认后继续</p>
              </div>
              <button className="primary-button" onClick={beginTutorial} type="button">开始使用教程</button>
            </section>
          )}
        </div>
      </section>
      <GuidedTour onClose={() => setTourOpen(false)} onComplete={() => setTourOpen(false)} onSkip={() => setTourOpen(false)} open={tourOpen} steps={SETTINGS_TOUR} />
    </main>
  )
}
