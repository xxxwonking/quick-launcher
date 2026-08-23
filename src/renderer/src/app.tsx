import { useState } from 'react'
import { LauncherWindow } from './components/launcher-window'
import { searchLauncher, type LauncherItem } from './search/search-catalog'
import { SettingsPage } from './settings/settings-page'
import { useThemeController } from './theme/use-theme'

type AppView = 'launcher' | 'settings'

const isSettingsWindow = (): boolean => new URLSearchParams(window.location.search).get('window') === 'settings'

export function App(): React.JSX.Element {
  const theme = useThemeController()
  const [view, setView] = useState<AppView>(isSettingsWindow() ? 'settings' : 'launcher')
  const [tutorialOpen, setTutorialOpen] = useState(new URLSearchParams(window.location.search).get('tutorial') === '1')

  if (view === 'settings') {
    return <SettingsPage onOpenTutorial={() => setTutorialOpen(true)} onThemeChange={theme.setPreference} themePreference={theme.preference} tutorialOpen={tutorialOpen} />
  }

  const execute = async (item: LauncherItem): Promise<void | string> => {
    if (window.launcher?.execute) return window.launcher.execute(item)
    if (item.action.type === 'web-search') return `将在浏览器中搜索“${item.action.query}”`
    return `已模拟打开 ${item.title}`
  }

  const openSettings = ({ tutorial }: { tutorial: boolean }): void => {
    if (tutorial) {
      if (window.launcher?.openTutorial) void window.launcher.openTutorial()
      else {
        setView('settings')
        setTutorialOpen(true)
      }
      return
    }
    if (window.launcher?.openSettings) void window.launcher.openSettings()
    else setView('settings')
  }

  return <LauncherWindow onExecute={execute} onHide={() => void window.launcher?.hideLauncher()} onOpenSettings={openSettings} />
}

export { searchLauncher }
