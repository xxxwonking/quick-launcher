import { BookOpen, Command, Keyboard, Palette, Rocket, Settings2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ThemePreference } from '../theme/theme'
import { GuidedTour, type TourStep } from '../tutorial/guided-tour'

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

const NAV_ITEMS = [
  { label: '常规设置', icon: Settings2 },
  { label: '快捷命令', icon: Command },
  { label: '外观', icon: Palette },
  { label: '教程与帮助', icon: BookOpen },
]

export function SettingsPage({
  themePreference = 'system',
  onThemeChange = () => undefined,
  onOpenTutorial = () => undefined,
  tutorialOpen = false,
}: SettingsPageProps): React.JSX.Element {
  const [tourOpen, setTourOpen] = useState(tutorialOpen)

  useEffect(() => {
    setTourOpen(tutorialOpen)
  }, [tutorialOpen])

  const beginTutorial = (): void => {
    setTourOpen(true)
    onOpenTutorial()
  }

  return (
    <main className="settings-shell min-h-screen bg-settings text-primary">
      <aside className="settings-sidebar border-r border-divider" data-tour="settings-navigation">
        <div className="flex items-center gap-3 px-5 pb-7 pt-6">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-white shadow-accent"><Rocket className="size-5" /></span>
          <div><strong className="block text-sm">Quick Launcher</strong><span className="text-xs text-secondary">偏好设置</span></div>
        </div>
        <nav aria-label="设置导航" className="space-y-1 px-3">
          {NAV_ITEMS.map(({ label, icon: Icon }, index) => (
            <button className={`settings-nav-item ${index === 0 ? 'settings-nav-active' : ''}`} key={label} type="button">
              <Icon aria-hidden="true" className="size-4" />{label}
            </button>
          ))}
        </nav>
        <p className="mt-auto px-5 pb-5 text-[11px] text-muted">Quick Launcher · M1 Preview</p>
      </aside>

      <section className="h-screen overflow-y-auto px-9 py-8">
        <header className="mb-7"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Settings</p><h1 className="mt-1 text-2xl font-bold">常规设置</h1></header>
        <div className="mx-auto max-w-[720px] space-y-5">
          <section className="settings-card" data-tour="settings-hotkey">
            <div className="settings-card-icon"><Keyboard className="size-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="settings-card-title">全局快捷键</h2><p className="settings-card-description">从任何位置快速打开搜索窗口</p></div>
            <kbd className="hotkey-chip">Alt + Space</kbd>
          </section>

          <section className="settings-card items-start" data-tour="settings-commands">
            <div className="settings-card-icon"><Command className="size-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="settings-card-title">快捷命令</h2><p className="settings-card-description">使用简短别名启动应用或网页搜索</p><div className="mt-4 grid grid-cols-3 gap-2 text-xs"><span className="command-example"><b>wx</b>微信</span><span className="command-example"><b>cursor</b>Cursor</span><span className="command-example"><b>llq</b>网页搜索</span></div></div>
            <button className="secondary-button" type="button">管理命令</button>
          </section>

          <section className="settings-card" data-tour="settings-appearance">
            <div className="settings-card-icon"><Palette className="size-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="settings-card-title">外观主题</h2><p className="settings-card-description">跟随电脑当前颜色配置，或手动覆盖</p></div>
            <label className="sr-only" htmlFor="theme-preference">外观主题</label>
            <select className="theme-select" id="theme-preference" onChange={(event) => onThemeChange(event.target.value as ThemePreference)} value={themePreference}>
              <option value="system">跟随系统</option><option value="light">浅色</option><option value="dark">深色</option>
            </select>
          </section>

          <section className="settings-card" data-tour="settings-tutorial">
            <div className="settings-card-icon"><BookOpen className="size-5" /></div>
            <div className="min-w-0 flex-1"><h2 className="settings-card-title">漫游式使用教程</h2><p className="settings-card-description">逐步高亮真实控件，每一步由你确认后继续</p></div>
            <button className="primary-button" onClick={beginTutorial} type="button">开始使用教程</button>
          </section>
        </div>
      </section>
      <GuidedTour onClose={() => setTourOpen(false)} onComplete={() => setTourOpen(false)} onSkip={() => setTourOpen(false)} open={tourOpen} steps={SETTINGS_TOUR} />
    </main>
  )
}
