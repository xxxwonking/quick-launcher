import { BookOpen, Boxes, Check, Command, FolderOpen, Info, Keyboard, Palette, Pencil, Plus, RefreshCw, Rocket, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { buildInfo } from '../../../shared/build-info'
import { launcherHotkeyForPlatform } from '../../../shared/platform-hotkey'
import type { BaseCatalogSnapshot, CommandImportDecision, CommandPackagePreview, LauncherSettingsSnapshot, SearchEngine, UserCommand, UserCommandDraft, UserCommandPatch, UserCommandType } from '../../../shared/launcher-ipc'
import type { ThemePreference } from '../theme/theme'
import { GuidedTour, type TourStep } from '../tutorial/guided-tour'
import { eventToAccelerator } from './hotkey-accelerator'

type SettingsSection = 'general' | 'commands' | 'templates' | 'appearance' | 'tutorial' | 'about'

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
  { target: 'settings-templates', title: '软件模板', body: '为已安装的软件提供常用别名。模板不会创建虚假应用，也可以随时关闭。' },
  { target: 'settings-appearance', title: '跟随系统主题', body: '默认自动跟随电脑浅色或深色配置，也可以手动固定。' },
  { target: 'settings-tutorial', title: '随时重新学习', body: '以后输入 tutorial、help、教程或帮助，也能回到这套漫游引导。' },
]

const NAV_ITEMS: Array<{ id: SettingsSection; label: string; icon: typeof Settings2; tourTarget: string }> = [
  { id: 'general', label: '常规设置', icon: Settings2, tourTarget: 'settings-navigation' },
  { id: 'commands', label: '快捷命令', icon: Command, tourTarget: 'settings-commands' },
  { id: 'templates', label: '软件模板', icon: Boxes, tourTarget: 'settings-templates' },
  { id: 'appearance', label: '外观', icon: Palette, tourTarget: 'settings-appearance' },
  { id: 'tutorial', label: '教程与帮助', icon: BookOpen, tourTarget: 'settings-tutorial' },
  { id: 'about', label: '关于', icon: Info, tourTarget: 'settings-about' },
]

const DEFAULT_SETTINGS: LauncherSettingsSnapshot = {
  schemaVersion: 1,
  onboardingCompleted: false,
  hotkey: launcherHotkeyForPlatform(/mac/i.test(window.navigator.platform) ? 'darwin' : 'other').accelerator,
  autostart: false,
  showRecent: false,
  clipboardHistoryEnabled: false,
  fileHistoryEnabled: true,
  fileSearchRoots: [],
  disabledBaseAppIds: [],
  theme: 'system',
  searchEngine: { kind: 'bing' },
  activeHotkey: null,
  hotkeyConflict: false,
}

function normalizeSettingsSnapshot(value: LauncherSettingsSnapshot): LauncherSettingsSnapshot {
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    disabledBaseAppIds: value.disabledBaseAppIds ?? DEFAULT_SETTINGS.disabledBaseAppIds,
    searchEngine: value.searchEngine ? { ...DEFAULT_SETTINGS.searchEngine, ...value.searchEngine } : { ...DEFAULT_SETTINGS.searchEngine },
  }
}

const EMPTY_DRAFT: UserCommandDraft = { id: '', keyword: '', title: '', type: 'open-url', target: '', enabled: true }
const DEFAULT_CUSTOM_SEARCH_TEMPLATE = 'https://www.google.com/search?q={query}'

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (message.includes('HOTKEY_CONFLICT')) return '快捷键已被其他应用占用，请换一个组合键。'
  if (message.includes('AUTOSTART_APPROVAL_REQUIRED')) return '保存失败：请在系统设置的“登录项”中允许 Quick Launcher 后再试。'
  if (message.includes('AUTOSTART_PERMISSION_DENIED')) return '保存失败：系统拒绝了开机启动设置，请检查应用权限。'
  if (message.includes('AUTOSTART_FAILED')) return '保存失败：系统拒绝了开机启动设置，请在系统设置中允许 Quick Launcher。'
  if (message.includes('COMMAND_CONFLICT')) return '命令关键词或 ID 已存在。'
  if (message.includes('COMMAND_NOT_FOUND')) return '命令已不存在，请刷新后重试。'
  if (message.includes('INVALID_COMMAND')) return '命令格式无效，请检查关键词和目标内容。'
  if (message.includes('BASE_APP_NOT_FOUND')) return '软件模板不存在，请刷新设置后重试。'
  if (message.includes('INVALID_BASE_APP')) return '软件模板状态无效，请刷新设置后重试。'
  if (message.includes('IMPORT_UNAVAILABLE')) return '导入功能当前不可用，请重新打开设置窗口。'
  if (message.includes('INVALID_PACKAGE_FILE')) return '请选择 .quickcmd.json 命令包文件。'
  if (message.includes('PACKAGE_TOO_LARGE')) return '命令包超过 256 KiB 大小限制。'
  if (message.includes('PACKAGE_CHANGED')) return '命令包文件在预览后发生变化，请重新选择并预览。'
  if (message.includes('INVALID_PACKAGE')) return '命令包格式或内容无效，请检查后重试。'
  if (message.includes('INVALID_PACKAGE_APP_REF')) return '命令包引用了未知应用，请检查 appRef 是否对应内置或包内应用。'
  if (message.includes('BINDING_UNAVAILABLE')) return '重新定位功能当前不可用，请重新打开设置窗口。'
  if (message.includes('BINDING_UNSUPPORTED')) return /mac/i.test(window.navigator.platform) ? '请选择 macOS 应用（.app）。' : '请选择 Windows 应用（.exe 或 .lnk）。'
  if (message.includes('BINDING_NOT_FILE')) return '请选择一个真实的 Windows 应用文件。'
  if (message.includes('BINDING_NOT_BUNDLE')) return '请选择完整的 macOS 应用（.app）。'
  if (message.includes('BINDING_NOT_FOUND')) return '所选应用不存在，请重新选择。'
  if (message.includes('BINDING_UNREADABLE')) return '无法读取所选应用，请检查文件权限后重试。'
  if (message.includes('BINDING_INVALID') || message.includes('INVALID_BINDING') || message.includes('INVALID_APP_REF')) return '应用引用无效，请重新预览命令包。'
  if (message.includes('IMPORT_EXPIRED')) return '导入预览已过期，请重新选择命令包。'
  if (message.includes('CONFIG_CONFLICT')) return '设置已发生变化，请重新预览后再导入。'
  if (message.includes('PACKAGE_ALREADY_IMPORTED')) return '这个命令包已经导入，文件内容没有变化。'
  if (message.includes('PACKAGE_VERSION_OLD')) return '命令包版本低于已安装版本，已拒绝降级。'
  if (message.includes('PACKAGE_VERSION_CONFLICT')) return '相同版本的命令包内容不同，请先提升包版本后再导入。'
  if (message.includes('INVALID_IMPORT')) return '导入决策无效，请重新预览命令包。'
  if (message.includes('FILE_SEARCH_ROOT_UNAVAILABLE')) return '文件搜索目录选择器当前不可用，请重新打开设置窗口。'
  if (message.includes('FILE_SEARCH_ROOT_NOT_FOUND')) return '所选搜索目录不存在，请重新选择。'
  if (message.includes('FILE_SEARCH_ROOT_INVALID') || message.includes('INVALID_FILE_SEARCH_ROOTS')) return '文件搜索目录无效或重复，请重新选择。'
  if (message.includes('INVALID_HISTORY_TYPE')) return '历史类型无效，请刷新设置后重试。'
  if (message.includes('HISTORY_UNAVAILABLE')) return '历史记录服务尚未就绪，请重新打开设置窗口。'
  if (message.includes('SETTINGS_UNAVAILABLE')) return '保存失败：设置服务尚未就绪，请重新打开设置窗口。'
  if (/INVALID_(SETTINGS|ONBOARDING|HOTKEY|AUTOSTART|SHOW_RECENT|CLIPBOARD_HISTORY|FILE_HISTORY|THEME|SEARCH_ENGINE)/u.test(message)) return '保存失败：设置内容无效，请重新选择后再试。'
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
    if (part === 'Plus') return '+'
    if (part === 'Capslock') return 'Caps Lock'
    if (part === 'Numlock') return 'Num Lock'
    if (part === 'Scrolllock') return 'Scroll Lock'
    if (/^num[0-9]$/u.test(part)) return `Num ${part.slice(3)}`
    if (part === 'numdec') return 'Num .'
    if (part === 'numadd') return 'Num +'
    if (part === 'numsub') return 'Num -'
    if (part === 'nummult') return 'Num *'
    if (part === 'numdiv') return 'Num /'
    if (part === 'Escape') return 'Esc'
    return part
  }).join(' + ')
}

function isSearchEngine(value: SearchEngine['kind']): value is SearchEngine['kind'] {
  return value === 'bing' || value === 'baidu' || value === 'google' || value === 'custom'
}

function isValidSiteSearchTemplate(value: string): boolean {
  if ((value.match(/\{query\}/g) ?? []).length !== 1) return false
  try {
    const url = new URL(value.replace('{query}', 'query'))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function SettingsPage({ themePreference = 'system', onThemeChange = () => undefined, onOpenTutorial = () => undefined, tutorialOpen = false }: SettingsPageProps): React.JSX.Element {
  const [section, setSection] = useState<SettingsSection>('general')
  const [settings, setSettings] = useState<LauncherSettingsSnapshot>(DEFAULT_SETTINGS)
  const [commands, setCommands] = useState<UserCommand[]>([])
  const [baseCatalog, setBaseCatalog] = useState<BaseCatalogSnapshot>({ catalogVersion: 'empty', apps: [], disabledAppIds: [] })
  const [packagePreview, setPackagePreview] = useState<CommandPackagePreview | null>(null)
  const [packageDecisions, setPackageDecisions] = useState<Record<string, CommandImportDecision>>({})
  const [relocatingAppRef, setRelocatingAppRef] = useState<string | null>(null)
  const [tourOpen, setTourOpen] = useState(tutorialOpen)
  const [recordingHotkey, setRecordingHotkey] = useState(false)
  const [commandFormOpen, setCommandFormOpen] = useState(false)
  const [editingCommandId, setEditingCommandId] = useState<string | null>(null)
  const [commandDraft, setCommandDraft] = useState<UserCommandDraft>(EMPTY_DRAFT)
  const [customSearchTemplate, setCustomSearchTemplate] = useState(DEFAULT_CUSTOM_SEARCH_TEMPLATE)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [refreshingApplications, setRefreshingApplications] = useState(false)
  const api = window.launcher
  const platformHotkey = launcherHotkeyForPlatform(/mac/i.test(window.navigator.platform) ? 'darwin' : 'other')

  useEffect(() => {
    let disposed = false
    const load = async (): Promise<void> => {
      try {
        const [loadedSettings, loadedCommands, loadedBaseCatalog] = await Promise.all([api?.getSettings?.(), api?.getCommands?.(), api?.getBaseCatalog?.()])
        if (disposed) return
        if (loadedSettings) {
          const normalizedSettings = normalizeSettingsSnapshot(loadedSettings)
          setSettings(normalizedSettings)
          if (normalizedSettings.searchEngine.kind === 'custom') setCustomSearchTemplate(normalizedSettings.searchEngine.template)
        }
        if (loadedCommands) setCommands(loadedCommands)
        if (loadedBaseCatalog) setBaseCatalog(loadedBaseCatalog)
      } catch (loadError) {
        if (!disposed) setError(errorMessage(loadError))
      }
    }
    void load()
    return () => { disposed = true }
  }, [api])

  useEffect(() => { setTourOpen(tutorialOpen) }, [tutorialOpen])

  useEffect(() => {
    if (settings.searchEngine.kind === 'custom') setCustomSearchTemplate(settings.searchEngine.template)
  }, [settings.searchEngine.kind, settings.searchEngine.kind === 'custom' ? settings.searchEngine.template : undefined])

  const updateSettings = async (patch: NonNullable<NonNullable<typeof api>['updateSettings']> extends (patch: infer T) => unknown ? T : never): Promise<void> => {
    const previousSettings = settings
    setSettings((current) => ({ ...current, ...patch, searchEngine: patch.searchEngine ? { ...patch.searchEngine } : current.searchEngine }))
    if (!api?.updateSettings) return
    setSaving(true)
    setError(null)
    try {
      const next = await api.updateSettings(patch)
      setSettings(normalizeSettingsSnapshot(next))
    } catch (updateError) {
      setSettings(previousSettings)
      if (patch.theme) onThemeChange(previousSettings.theme)
      setError(errorMessage(updateError))
    } finally {
      setSaving(false)
    }
  }

  const clearHistory = async (type: 'clipboard' | 'file'): Promise<void> => {
    if (!api?.clearHistory) return
    setSaving(true)
    setError(null)
    try {
      await api.clearHistory(type)
    } catch (clearError) {
      setError(errorMessage(clearError))
    } finally {
      setSaving(false)
    }
  }

  const refreshApplicationIndex = async (): Promise<void> => {
    if (!api?.refreshApplications) return
    setRefreshingApplications(true)
    setError(null)
    try {
      await api.refreshApplications()
    } catch (refreshError) {
      setError(errorMessage(refreshError))
    } finally {
      setRefreshingApplications(false)
    }
  }

  const saveCustomSearchTemplate = (): void => {
    if (!isValidSiteSearchTemplate(customSearchTemplate)) {
      setError('自定义搜索模板必须以 http:// 或 https:// 开头，并且恰好包含一个 {query}。')
      return
    }
    if (settings.searchEngine.kind === 'custom' && settings.searchEngine.template === customSearchTemplate) return
    void updateSettings({ searchEngine: { kind: 'custom', template: customSearchTemplate } })
  }

  const finishHotkeyRecording = (accelerator?: string): void => {
    setRecordingHotkey(false)
    const save = (): void => {
      if (accelerator) void updateSettings({ hotkey: accelerator })
    }
    if (!api?.setHotkeyRecording) {
      save()
      return
    }
    void api.setHotkeyRecording(false).then(save).catch((recordingError) => setError(errorMessage(recordingError)))
  }

  const beginHotkeyRecording = (): void => {
    setError(null)
    setRecordingHotkey(true)
    if (!api?.setHotkeyRecording) return
    void api.setHotkeyRecording(true).catch((recordingError) => {
      setRecordingHotkey(false)
      setError(errorMessage(recordingError))
    })
  }

  const beginTutorial = (): void => { setTourOpen(true); onOpenTutorial() }

  const finishOnboarding = (): void => {
    setTourOpen(false)
    if (!settings.onboardingCompleted) void updateSettings({ onboardingCompleted: true })
  }

  useEffect(() => {
    if (!recordingHotkey) return
    const record = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        finishHotkeyRecording()
        return
      }
      const accelerator = eventToAccelerator(event, window.navigator.platform)
      if (!accelerator) return
      event.preventDefault()
      event.stopPropagation()
      finishHotkeyRecording(accelerator)
    }
    window.addEventListener('keydown', record, true)
    return () => window.removeEventListener('keydown', record, true)
  }, [api, recordingHotkey])

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
    if (draft.type === 'site-search' && !isValidSiteSearchTemplate(draft.target)) { setError('搜索地址模板必须以 http:// 或 https:// 开头，并且恰好包含一个 {query}。'); return }
    if (draft.type === 'launch-app' && !/^[A-Za-z0-9._-]+$|^package:[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/u.test(draft.target)) { setError('应用引用格式无效，请填写应用 ID 或 package:包ID/应用ID。'); return }
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

  const setBaseAppEnabled = async (id: string, enabled: boolean): Promise<void> => {
    if (!api?.setBaseAppEnabled) return
    setSaving(true)
    setError(null)
    try {
      setBaseCatalog(await api.setBaseAppEnabled(id, enabled))
    } catch (toggleError) {
      setError(errorMessage(toggleError))
    } finally {
      setSaving(false)
    }
  }

  const addFileSearchRoot = async (): Promise<void> => {
    if (!api?.selectFileSearchRoot) return
    setError(null)
    try {
      const selectedRoot = await api.selectFileSearchRoot()
      if (!selectedRoot) return
      if (settings.fileSearchRoots.some((root) => root.toLocaleLowerCase() === selectedRoot.toLocaleLowerCase())) {
        setError('这个文件搜索目录已经添加。')
        return
      }
      await updateSettings({ fileSearchRoots: [...settings.fileSearchRoots, selectedRoot] })
    } catch (rootError) {
      setError(errorMessage(rootError))
    }
  }

  const removeFileSearchRoot = (root: string): void => {
    void updateSettings({ fileSearchRoots: settings.fileSearchRoots.filter((candidate) => candidate !== root) })
  }

  const applyPackagePreview = (preview: CommandPackagePreview): void => {
    setSection('commands')
    setPackagePreview(preview)
    setPackageDecisions(Object.fromEntries(preview.conflicts.map((conflict) => [conflict.incomingId, {
      incomingId: conflict.incomingId,
      action: 'skip',
    }])))
  }

  const previewCommandPackage = async (): Promise<void> => {
    if (!api?.selectCommandPackage) return
    setSaving(true)
    setError(null)
    try {
      const preview = await api.selectCommandPackage()
      if (!preview) return
      applyPackagePreview(preview)
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setSaving(false)
    }
  }

  const relocateApplication = async (appRef: string): Promise<void> => {
    if (!api?.relocateApplication) return
    setRelocatingAppRef(appRef)
    setError(null)
    try {
      const result = await api.relocateApplication(appRef)
      if (result.status !== 'bound') return
      setPackagePreview((current) => current ? {
        ...current,
        unavailableAppRefs: current.unavailableAppRefs.filter((candidate) => candidate !== result.appRef),
      } : current)
    } catch (relocateError) {
      setError(errorMessage(relocateError))
    } finally {
      setRelocatingAppRef(null)
    }
  }

  useEffect(() => {
    if (!api?.consumePendingCommandPackage) return undefined
    let disposed = false
    const consume = async (): Promise<void> => {
      try {
        const preview = await api.consumePendingCommandPackage?.()
        if (!disposed && preview) applyPackagePreview(preview)
      } catch (pendingError) {
        if (!disposed) setError(errorMessage(pendingError))
      }
    }
    void consume()
    const unsubscribe = api.onCommandPackagePending?.(() => { void consume() })
    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [api])

  const commitCommandPackage = async (): Promise<void> => {
    if (!api?.commitCommandPackage || !packagePreview) return
    const hasUnresolvedDecision = packagePreview.conflicts.some((conflict) => {
      const decision = packageDecisions[conflict.incomingId]
      return !decision || (decision.action === 'rename' && !decision.keyword)
    })
    if (hasUnresolvedDecision) {
      setError('请处理所有冲突后再确认导入。')
      return
    }
    setSaving(true)
    setError(null)
    try {
      setCommands(await api.commitCommandPackage(packagePreview.previewId, Object.values(packageDecisions)))
      setPackagePreview(null)
      setPackageDecisions({})
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setSaving(false)
    }
  }

  const sectionTitle = NAV_ITEMS.find((item) => item.id === section)?.label ?? '常规设置'

  return (
    <main className="settings-shell min-h-screen text-primary">
      <aside className="settings-sidebar border-r border-divider" data-tour="settings-navigation">
        <div className="settings-brand">
          <span className="settings-brand-mark settings-brand-image">
            <img alt="" src="quick-launcher-icon.png" />
          </span>
          <div>
            <strong className="settings-brand-title">Quick Launcher</strong>
            <span className="settings-brand-caption">偏好设置 / CONTROL DECK</span>
          </div>
        </div>

        <nav aria-label="设置导航" className="settings-nav">
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
        <div className="settings-sidebar-footer">
          <span className="settings-status-dot" />
          <span>本地运行正常</span>
          <span className="settings-version">v{buildInfo.version}</span>
        </div>
      </aside>

      <section className="settings-content">
        <header className="settings-header">
          <div>
            <p className="settings-eyebrow">QUICK LAUNCHER / SETTINGS</p>
            <h1 className="settings-page-title">{sectionTitle}</h1>
            <p className="settings-header-description">配置你的快速入口，让搜索窗口保持轻、快、顺手。</p>
          </div>
          <div className="settings-sync-status" aria-live="polite">
            <span className="settings-status-dot" />
            <span>{saving ? '保存中' : refreshingApplications ? '索引刷新中' : '已同步'}</span>
          </div>
        </header>
        {error && <p className="settings-error" role="alert">{error}</p>}
        <div className="settings-content-inner">
          {section === 'general' && (
            <div className="settings-general-list">
              <section className="settings-card settings-setting-row settings-hotkey-row" data-tour="settings-hotkey">
                <div className="settings-card-icon settings-card-icon-accent"><Keyboard className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">全局快捷键</h2>
                  <p className="settings-card-description">从任何位置快速打开搜索窗口</p>
                  <p className="settings-card-meta">{settings.hotkeyConflict ? '当前快捷键冲突' : settings.activeHotkey ? '快捷键已启用' : '点击右侧按键后录入新的组合键'}</p>
                </div>
                <button
                  aria-label="录入全局快捷键"
                  aria-pressed={recordingHotkey}
                  className={`hotkey-chip settings-hotkey-control ${recordingHotkey ? 'ring-2 ring-accent animate-pulse shadow-[0_0_15px_var(--accent-glow)]' : ''}`}
                  onClick={beginHotkeyRecording}
                  type="button"
                >
                  {recordingHotkey ? '请按键…' : hotkeyLabel(settings.hotkey || platformHotkey.accelerator)}
                </button>
              </section>

              <section className="settings-card settings-setting-group">
                <div className="settings-setting-group-heading">
                  <div className="settings-card-icon"><Rocket className="size-5" /></div>
                  <div className="min-w-0">
                  <h2 className="settings-card-title">启动与列表</h2>
                  <p className="settings-card-description">控制登录启动行为和搜索框为空时是否显示最近使用</p>
                  </div>
                </div>
                <div className="settings-option-list">
                  <label className="settings-option-row">
                    <span className="settings-option-copy"><strong>开机自动启动</strong><small>登录系统后自动运行 Quick Launcher</small></span>
                    <input
                      aria-label="开机自动启动"
                      className="settings-checkbox-control"
                      checked={settings.autostart}
                      disabled={saving}
                      onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, autostart: checked })); void updateSettings({ autostart: checked }) }}
                      type="checkbox"
                    />
                  </label>
                  <label className="settings-option-row">
                    <span className="settings-option-copy"><strong>显示最近使用</strong><small>搜索框为空时展示成功打开过的应用</small></span>
                    <input
                      aria-label="显示最近使用"
                      className="settings-checkbox-control"
                      checked={settings.showRecent}
                      disabled={saving}
                      onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, showRecent: checked })); void updateSettings({ showRecent: checked }) }}
                      type="checkbox"
                    />
                  </label>
                  <div className="settings-option-row">
                    <label className="settings-option-label">
                      <span className="settings-option-copy"><strong>记录剪贴板历史</strong><small>允许从搜索框找回最近复制的文本</small></span>
                      <input
                        aria-label="记录剪贴板历史"
                        className="settings-checkbox-control"
                        checked={settings.clipboardHistoryEnabled}
                        disabled={saving}
                        onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, clipboardHistoryEnabled: checked })); void updateSettings({ clipboardHistoryEnabled: checked }) }}
                        type="checkbox"
                      />
                    </label>
                    <button aria-label="清空剪贴板历史" className="settings-history-clear" disabled={saving || !api?.clearHistory} onClick={() => void clearHistory('clipboard')} type="button">清空</button>
                  </div>
                  <div className="settings-option-row">
                    <label className="settings-option-label">
                      <span className="settings-option-copy"><strong>记录最近文件</strong><small>允许从搜索框找回最近打开的文件</small></span>
                      <input
                        aria-label="记录最近文件"
                        className="settings-checkbox-control"
                        checked={settings.fileHistoryEnabled}
                        disabled={saving}
                        onChange={(event) => { const checked = event.target.checked; setSettings((current) => ({ ...current, fileHistoryEnabled: checked })); void updateSettings({ fileHistoryEnabled: checked }) }}
                        type="checkbox"
                      />
                    </label>
                    <button aria-label="清空最近文件历史" className="settings-history-clear" disabled={saving || !api?.clearHistory} onClick={() => void clearHistory('file')} type="button">清空</button>
                  </div>
                </div>
              </section>

              <section className="settings-card settings-setting-group">
                <div className="settings-setting-group-heading">
                  <div className="settings-card-icon"><FolderOpen className="size-5" /></div>
                  <div className="min-w-0">
                    <h2 className="settings-card-title">文件搜索目录</h2>
                    <p className="settings-card-description">指定需要被快速检索的本地目录；未配置时使用桌面、文档和下载目录</p>
                  </div>
                </div>
                <div className="settings-file-root-list">
                  {settings.fileSearchRoots.length === 0 ? (
                    <p className="settings-file-root-empty">当前使用默认目录</p>
                  ) : settings.fileSearchRoots.map((root) => (
                    <div className="settings-file-root-row" key={root}>
                      <span className="min-w-0 truncate" title={root}>{root}</span>
                      <button aria-label={`移除文件搜索目录 ${root}`} className="icon-button text-rose-500 hover:border-rose-500/50 hover:bg-rose-500/10" disabled={saving} onClick={() => removeFileSearchRoot(root)} type="button"><Trash2 className="size-3.5" /></button>
                    </div>
                  ))}
                  <button aria-label="添加文件搜索目录" className="secondary-button self-start" disabled={saving || !api?.selectFileSearchRoot} onClick={() => void addFileSearchRoot()} type="button"><Plus className="size-3.5" />添加目录</button>
                </div>
              </section>

              <section className="settings-card settings-setting-row settings-search-row">
                <div className="settings-card-icon"><Command className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">搜索引擎</h2>
                  <p className="settings-card-description">网页搜索命令将使用这个搜索引擎</p>
                </div>
                <div className="settings-setting-control settings-search-controls">
                  <select
                    aria-label="搜索引擎"
                      className="theme-select"
                      onChange={(event) => {
                        const kind = event.target.value as SearchEngine['kind']
                        if (!isSearchEngine(kind)) return
                        if (kind === 'custom') setCustomSearchTemplate(DEFAULT_CUSTOM_SEARCH_TEMPLATE)
                        void updateSettings(kind === 'custom' ? { searchEngine: { kind, template: DEFAULT_CUSTOM_SEARCH_TEMPLATE } } : { searchEngine: { kind } })
                      }}
                    value={settings.searchEngine.kind}
                  >
                    <option value="bing">Bing</option>
                    <option value="baidu">百度</option>
                    <option value="google">Google</option>
                    <option value="custom">自定义</option>
                  </select>
                  {settings.searchEngine.kind === 'custom' && (
                    <input
                      aria-label="自定义搜索模板"
                      className="settings-input settings-search-template"
                      onBlur={saveCustomSearchTemplate}
                      onChange={(event) => { setCustomSearchTemplate(event.target.value); if (error) setError(null) }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter') return
                        event.preventDefault()
                        saveCustomSearchTemplate()
                      }}
                      placeholder="https://example.com/search?q={query}"
                      value={customSearchTemplate}
                    />
                  )}
                </div>
              </section>

              <section className="settings-card settings-setting-row" data-tour="settings-appearance">
                <div className="settings-card-icon"><Palette className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">外观主题</h2>
                  <p className="settings-card-description">跟随电脑当前颜色配置，或手动覆盖</p>
                </div>
                <label className="sr-only" htmlFor="theme-preference-general">外观主题</label>
                <select
                  aria-label="外观主题"
                  className="theme-select settings-setting-control"
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

              <section className="settings-card settings-setting-row" data-tour="settings-tutorial">
                <div className="settings-card-icon"><BookOpen className="size-5" /></div>
                <div className="min-w-0 flex-1">
                  <h2 className="settings-card-title">漫游式使用教程</h2>
                  <p className="settings-card-description">逐步高亮真实控件，每一步由你确认后继续</p>
                </div>
                <button className="primary-button" onClick={beginTutorial} type="button">开始使用教程</button>
              </section>
            </div>
          )}

          {section === 'commands' && (
            <section className="space-y-4" data-tour="settings-commands">
              <div className="settings-command-toolbar flex items-center justify-between px-1">
                <p className="text-xs font-medium text-secondary">创建固定网址、网页搜索或“关键词 + 内容”的站点搜索命令。</p>
                <div className="flex shrink-0 items-center gap-2">
                  <button className="secondary-button" disabled={saving || !api?.selectCommandPackage} onClick={() => void previewCommandPackage()} type="button">导入命令包</button>
                  <button className="primary-button flex items-center gap-1.5" onClick={openNewCommand} type="button">
                    <Plus className="size-4" />新增命令
                  </button>
                </div>
              </div>
              {packagePreview && (
                <section className="settings-card settings-import-preview" aria-label="命令包预览">
                  <div className="settings-import-header">
                    <div>
                      <p className="settings-template-kicker">IMPORT PREVIEW · {packagePreview.version}</p>
                      <h2 className="settings-card-title">{packagePreview.name}</h2>
                      <p className="settings-card-description">{packagePreview.packageStatus === 'upgrade' ? `将升级自 ${packagePreview.previousVersion} · ` : ''}包含 {packagePreview.commands.length} 条命令 · 包 ID：{packagePreview.packageId}</p>
                    </div>
                    <span className={`settings-template-count ${packagePreview.conflicts.length > 0 || (packagePreview.unavailableAppRefs?.length ?? 0) > 0 ? 'settings-import-count-warning' : ''}`}>
                      {packagePreview.packageStatus === 'already-imported' ? '已是最新版本' : packagePreview.packageStatus === 'downgrade' ? '版本过旧' : packagePreview.packageStatus === 'version-conflict' ? '版本冲突' : packagePreview.conflicts.length > 0 ? `发现 ${packagePreview.conflicts.length} 个冲突` : (packagePreview.unavailableAppRefs?.length ?? 0) > 0 ? `有 ${packagePreview.unavailableAppRefs?.length} 个应用待发现` : packagePreview.packageStatus === 'upgrade' ? '可升级' : '未发现冲突'}
                    </span>
                  </div>
                  {(packagePreview.changes ?? []).length > 0 && (
                    <div className="settings-import-changes" aria-label="命令包变更摘要">
                      <span className="settings-import-changes-label">变更</span>
                      <div className="settings-import-changes-list">
                        {(packagePreview.changes ?? []).slice(0, 12).map((change) => (
                          <span className="settings-import-change" key={`${change.kind}-${change.action}-${change.id}`}>
                            <span className={`settings-import-change-mark settings-import-change-${change.action}`}>{change.action === 'added' ? '+' : change.action === 'removed' ? '−' : '•'}</span>
                            {change.kind === 'app' ? '应用' : '命令'} · {change.label}
                          </span>
                        ))}
                        {(packagePreview.changes ?? []).length > 12 && <span className="settings-import-change settings-import-change-more">还有 {(packagePreview.changes ?? []).length - 12} 项</span>}
                      </div>
                    </div>
                  )}
                  <div className="settings-import-list">
                    {packagePreview.commands.map((command) => {
                      const conflict = packagePreview.conflicts.find((candidate) => candidate.incomingId === command.id)
                      const unavailable = command.type === 'launch-app' && packagePreview.unavailableAppRefs?.includes(command.target)
                      const decision = packageDecisions[command.id]
                      return (
                        <div className="settings-import-row" key={command.id}>
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <kbd className="hotkey-chip px-2 py-0.5 font-bold">{command.keyword}</kbd>
                              <strong className="truncate text-sm">{command.title}</strong>
                            </div>
                            <p className="settings-card-description mt-1 truncate">{command.type === 'open-url' ? command.target : command.type === 'launch-app' ? `启动应用：${command.target}` : `站点搜索：${command.target}`}</p>
                          </div>
                          {conflict ? (
                            <div className="settings-import-decision">
                              <label className="sr-only" htmlFor={`import-decision-${command.id}`}>处理 {command.title}</label>
                              <select
                                aria-label={`处理 ${command.title}`}
                                className="settings-input settings-import-select"
                                id={`import-decision-${command.id}`}
                                onChange={(event) => setPackageDecisions((current) => ({
                                  ...current,
                                  [command.id]: { incomingId: command.id, action: event.target.value as CommandImportDecision['action'] },
                                }))}
                                value={decision?.action ?? 'skip'}
                              >
                                <option value="skip">跳过</option>
                                {conflict.kind === 'command-id' && <option value="replace">替换现有命令</option>}
                                {conflict.kind === 'keyword' && <option value="rename">重命名关键词</option>}
                              </select>
                              {decision?.action === 'rename' && (
                                <input
                                  aria-label={`重命名 ${command.title}`}
                                  className="settings-input settings-import-rename"
                                  onChange={(event) => setPackageDecisions((current) => ({
                                    ...current,
                                    [command.id]: { incomingId: command.id, action: 'rename', keyword: event.target.value.trim() },
                                  }))}
                                  placeholder="新关键词"
                                  value={decision.keyword ?? ''}
                                />
                              )}
                            </div>
                          ) : unavailable ? (
                            <div className="settings-import-unavailable-wrap">
                              <span className="settings-import-unavailable">待发现应用</span>
                              <button
                                aria-label={`重新定位 ${command.title}`}
                                className="settings-import-relocate"
                                disabled={saving || relocatingAppRef === command.target || !api?.relocateApplication}
                                onClick={() => void relocateApplication(command.target)}
                                type="button"
                              >
                                <FolderOpen className="size-3" />
                                {relocatingAppRef === command.target ? '选择中…' : '重新定位'}
                              </button>
                            </div>
                          ) : <span className="settings-import-safe">可导入</span>}
                        </div>
                      )
                    })}
                  </div>
                  <div className="settings-import-actions">
                    <button className="secondary-button" onClick={() => { setPackagePreview(null); setPackageDecisions({}) }} type="button">取消</button>
                    <button className="primary-button" disabled={saving || ['already-imported', 'downgrade', 'version-conflict'].includes(packagePreview.packageStatus)} onClick={() => void commitCommandPackage()} type="button">{packagePreview.packageStatus === 'already-imported' ? '无需导入' : packagePreview.packageStatus === 'upgrade' ? '确认升级' : packagePreview.packageStatus === 'downgrade' ? '版本过旧' : packagePreview.packageStatus === 'version-conflict' ? '请提升版本' : '确认导入'}</button>
                  </div>
                </section>
              )}
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
                    <p className="settings-card-description mt-1.5 truncate">{command.type === 'open-url' ? command.target : command.type === 'site-search' ? `站点搜索：${command.target}` : command.type === 'launch-app' ? `启动应用：${command.target}` : `搜索：${command.target}`}</p>
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
                <form className="settings-card settings-command-form space-y-4" onSubmit={(event) => void saveCommand(event)}>
                  <div className="flex items-center justify-between border-b border-divider pb-3">
                    <h2 className="settings-card-title">{editingCommandId ? '编辑命令' : '新增命令'}</h2>
                    <button className="text-xs font-semibold text-secondary hover:text-primary" onClick={() => setCommandFormOpen(false)} type="button">取消</button>
                  </div>
                  <div className="settings-command-fields">
                    <label className="settings-command-field-row">
                      <span className="settings-command-field-label">命令关键词</span>
                      <input
                        aria-label="命令关键词"
                        className="settings-input"
                        disabled={Boolean(editingCommandId)}
                        onChange={(event) => setCommandDraft((current) => ({ ...current, keyword: event.target.value, id: current.id === '' || current.id === current.keyword ? event.target.value : current.id }))}
                        value={commandDraft.keyword}
                      />
                    </label>
                    <label className="settings-command-field-row">
                      <span className="settings-command-field-label">命令名称</span>
                      <input
                        aria-label="命令名称"
                        className="settings-input"
                        onChange={(event) => setCommandDraft((current) => ({ ...current, title: event.target.value }))}
                        value={commandDraft.title}
                      />
                    </label>
                    <label className="settings-command-field-row">
                      <span className="settings-command-field-label">命令类型</span>
                      <select
                        aria-label="命令类型"
                        className="settings-input"
                        onChange={(event) => setCommandDraft((current) => ({ ...current, type: event.target.value as UserCommandType }))}
                        value={commandDraft.type}
                      >
                        <option value="open-url">打开固定网址</option>
                        <option value="web-search">网页搜索</option>
                        <option value="site-search">站点搜索模板</option>
                        <option value="launch-app">启动应用</option>
                      </select>
                    </label>
                    <label className="settings-command-field-row">
                      <span className="settings-command-field-label">
                        {commandDraft.type === 'open-url' ? '目标地址' : commandDraft.type === 'site-search' ? '搜索地址模板' : commandDraft.type === 'launch-app' ? '应用引用' : '搜索内容'}
                      </span>
                      <input
                        aria-label={commandDraft.type === 'open-url' ? '目标地址' : commandDraft.type === 'site-search' ? '搜索地址模板' : commandDraft.type === 'launch-app' ? '应用引用' : '搜索内容'}
                        className="settings-input"
                        onChange={(event) => setCommandDraft((current) => ({ ...current, target: event.target.value }))}
                        placeholder={commandDraft.type === 'open-url' ? 'https://example.com' : commandDraft.type === 'site-search' ? 'https://example.com/search?q={query}' : commandDraft.type === 'launch-app' ? 'cursor 或 package:团队包/cursor' : '例如：我的项目文档'}
                        value={commandDraft.target}
                      />
                    </label>
                  </div>
                  <div className="pt-2">
                    <button className="primary-button flex items-center gap-1.5" disabled={saving} type="submit">
                      <Check className="size-4" />保存命令
                    </button>
                  </div>
                </form>
              )}
            </section>
          )}

          {section === 'templates' && (
            <section className="settings-template-section" data-tour="settings-templates">
              <div className="settings-template-intro">
                <div>
                  <p className="settings-template-kicker">BUILT-IN CATALOG · {baseCatalog.catalogVersion}</p>
                  <h2 className="settings-card-title">已安装软件的快捷别名</h2>
                  <p className="settings-card-description">模板只会增强已发现的应用匹配，不会向搜索列表添加未安装的软件。</p>
                </div>
                <div className="settings-template-actions">
                  <span className="settings-template-count">
                    {baseCatalog.apps.filter((app) => !baseCatalog.disabledAppIds.includes(app.id)).length}/{baseCatalog.apps.length} 已启用
                  </span>
                  <button
                    aria-label="刷新应用索引"
                    className="secondary-button settings-refresh-button"
                    disabled={saving || refreshingApplications || !api?.refreshApplications}
                    onClick={() => void refreshApplicationIndex()}
                    type="button"
                  >
                    <RefreshCw className={`size-3.5 ${refreshingApplications ? 'animate-spin' : ''}`} />
                    {refreshingApplications ? '刷新中…' : '刷新应用索引'}
                  </button>
                </div>
              </div>
              {baseCatalog.apps.length === 0 && (
                <div className="settings-card justify-center py-10 text-center">
                  <div>
                    <h2 className="settings-card-title">暂无内置软件模板</h2>
                    <p className="settings-card-description mt-1">请刷新应用索引，或检查应用资源目录。</p>
                  </div>
                </div>
              )}
              <div className="settings-template-list">
                {baseCatalog.apps.map((app) => {
                  const enabled = !baseCatalog.disabledAppIds.includes(app.id)
                  const platforms = [app.platforms.macos ? 'macOS' : '', app.platforms.windows ? 'Windows' : ''].filter(Boolean).join(' · ')
                  return (
                    <article className={`settings-template-card ${enabled ? 'settings-template-enabled' : ''}`} key={app.id}>
                      <div className="settings-template-mark" aria-hidden="true">{app.displayName.slice(0, 1)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="settings-template-title-row">
                          <h2 className="settings-card-title">{app.displayName}</h2>
                          <span className="settings-template-platform">{platforms}</span>
                        </div>
                        <p className="settings-card-description">别名：{app.defaultAliases.join(' · ')}</p>
                      </div>
                      <label className="settings-template-toggle">
                        <input
                          aria-label={`启用 ${app.displayName}`}
                          checked={enabled}
                          disabled={saving || !api?.setBaseAppEnabled}
                          onChange={(event) => void setBaseAppEnabled(app.id, event.target.checked)}
                          type="checkbox"
                        />
                        <span>{enabled ? '已启用' : '已关闭'}</span>
                      </label>
                    </article>
                  )
                })}
              </div>
            </section>
          )}

          {section === 'appearance' && (
            <section className="settings-card settings-setting-row" data-tour="settings-appearance">
              <div className="settings-card-icon"><Palette className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="settings-card-title">外观主题</h2>
                <p className="settings-card-description">跟随电脑当前颜色配置，或手动覆盖</p>
              </div>
              <label className="sr-only" htmlFor="theme-preference">外观主题</label>
              <select
                className="theme-select settings-setting-control"
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
            <section className="settings-card settings-setting-row" data-tour="settings-tutorial">
              <div className="settings-card-icon"><BookOpen className="size-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="settings-card-title">漫游式使用教程</h2>
                <p className="settings-card-description">逐步高亮真实控件，每一步由你确认后继续</p>
              </div>
              <button className="primary-button" onClick={beginTutorial} type="button">开始使用教程</button>
            </section>
          )}

          {section === 'about' && (
            <section className="settings-about-card" data-tour="settings-about">
              <div className="settings-about-icon">
                <img alt="Quick Launcher 图标" src="quick-launcher-icon.png" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="settings-about-kicker">QUICK LAUNCHER</p>
                <h2 className="settings-about-title">关于 Quick Launcher</h2>
                <p className="settings-about-description">一个安静常驻、用键盘把应用和常用动作带到手边的快速启动器。</p>
                <div className="settings-about-meta">
                  <span><small>版本</small><strong>{buildInfo.version}</strong></span>
                  <span><small>平台</small><strong>{/mac/i.test(window.navigator.platform) ? 'macOS' : 'Windows'}</strong></span>
                  <span><small>运行方式</small><strong>本地优先</strong></span>
                </div>
              </div>
            </section>
          )}
        </div>
      </section>
      <GuidedTour onClose={() => setTourOpen(false)} onComplete={finishOnboarding} onSkip={finishOnboarding} open={tourOpen} steps={SETTINGS_TOUR} />
    </main>
  )
}
