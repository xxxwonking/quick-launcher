import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildInfo } from '../../../shared/build-info'
import { SettingsPage } from './settings-page'

afterEach(() => {
  delete window.launcher
})

describe('SettingsPage', () => {
  const DEFAULT_SETTINGS_FOR_TEST = {
    schemaVersion: 1,
    onboardingCompleted: false,
    hotkey: 'Alt+Space',
    autostart: false,
    showRecent: false,
    clipboardHistoryEnabled: false,
    fileHistoryEnabled: true,
    fileSearchRoots: [],
    disabledBaseAppIds: [],
    theme: 'system' as const,
    searchEngine: { kind: 'bing' as const },
    activeHotkey: 'Alt+Space',
    hotkeyConflict: false,
  }

  it('labels the global shortcut as Option on macOS', () => {
    const originalPlatform = window.navigator.platform
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' })

    try {
      render(<SettingsPage />)

      expect(screen.getByText('Option + Space')).toBeInTheDocument()
    } finally {
      Object.defineProperty(window.navigator, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('records a shortcut from the window and uses the Windows modifier name', async () => {
    const user = userEvent.setup()
    const originalPlatform = window.navigator.platform
    const setHotkeyRecording = vi.fn().mockResolvedValue(undefined)
    const updateSettings = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      hotkey: 'Super+K',
      autostart: false,
      showRecent: false,
      clipboardHistoryEnabled: false,
      fileHistoryEnabled: true,
      theme: 'system',
      searchEngine: { kind: 'bing' },
      activeHotkey: 'Super+K',
      hotkeyConflict: false,
    })
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'Win32' })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        clipboardHistoryEnabled: false,
        fileHistoryEnabled: true,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
      setHotkeyRecording,
    } as unknown as NonNullable<typeof window.launcher>

    try {
      render(<SettingsPage />)
      const hotkeyButton = await screen.findByRole('button', { name: '录入全局快捷键' })
      await user.click(hotkeyButton)
      expect(hotkeyButton).toHaveTextContent('请按键…')

      fireEvent.keyDown(window, { key: 'k', code: 'KeyK', metaKey: true })

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ hotkey: 'Super+K' }))
      expect(setHotkeyRecording).toHaveBeenNthCalledWith(1, true)
      expect(setHotkeyRecording).toHaveBeenNthCalledWith(2, false)
      expect(hotkeyButton).not.toHaveTextContent('请按键…')
    } finally {
      Object.defineProperty(window.navigator, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('restores the previous shortcut when the system rejects a newly recorded combination', async () => {
    const user = userEvent.setup()
    const originalPlatform = window.navigator.platform
    const setHotkeyRecording = vi.fn().mockResolvedValue(undefined)
    const updateSettings = vi.fn().mockRejectedValue(new Error('HOTKEY_CONFLICT'))
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'Win32' })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS_FOR_TEST,
        activeHotkey: 'Alt+Space',
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
      setHotkeyRecording,
    } as unknown as NonNullable<typeof window.launcher>

    try {
      render(<SettingsPage />)
      const hotkeyButton = await screen.findByRole('button', { name: '录入全局快捷键' })
      await user.click(hotkeyButton)
      fireEvent.keyDown(window, { key: 'k', code: 'KeyK', ctrlKey: true })

      await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ hotkey: 'Control+K' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('快捷键已被其他应用占用，请换一个组合键。')
      expect(hotkeyButton).not.toHaveTextContent('请按键…')
      expect(hotkeyButton).toHaveTextContent('Alt + Space')
    } finally {
      Object.defineProperty(window.navigator, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('renders punctuation and numpad shortcut names in a readable form', async () => {
    const originalPlatform = window.navigator.platform
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'Win32' })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        ...DEFAULT_SETTINGS_FOR_TEST,
        hotkey: 'Alt+Plus',
        activeHotkey: 'Alt+Plus',
      }),
      getCommands: vi.fn().mockResolvedValue([]),
    } as unknown as NonNullable<typeof window.launcher>

    try {
      render(<SettingsPage />)
      expect(await screen.findByRole('button', { name: '录入全局快捷键' })).toHaveTextContent('Alt + +')
    } finally {
      Object.defineProperty(window.navigator, 'platform', { configurable: true, value: originalPlatform })
    }
  })

  it('installs only one keyboard listener while recording a shortcut', async () => {
    const user = userEvent.setup()
    const addEventListener = vi.spyOn(window, 'addEventListener')

    try {
      render(<SettingsPage />)
      await user.click(await screen.findByRole('button', { name: '录入全局快捷键' }))

      expect(addEventListener.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1)
    } finally {
      addEventListener.mockRestore()
    }
  })

  it('updates the theme preference immediately', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    window.launcher = {
      updateSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        clipboardHistoryEnabled: false,
        fileHistoryEnabled: true,
        disabledBaseAppIds: [],
        theme: 'dark',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage themePreference="system" onThemeChange={onThemeChange} />)

    await user.selectOptions(screen.getByLabelText('外观主题'), 'dark')

    expect(onThemeChange).toHaveBeenCalledWith('dark')
    expect(onThemeChange).toHaveBeenCalledTimes(1)
  })

  it('offers the guided tutorial entry', async () => {
    const user = userEvent.setup()
    const onOpenTutorial = vi.fn()
    render(<SettingsPage onOpenTutorial={onOpenTutorial} />)

    await user.click(screen.getByRole('button', { name: /使用教程/ }))

    expect(onOpenTutorial).toHaveBeenCalledOnce()
  })

  it('starts the tour when a reused settings view receives a tutorial request', () => {
    const { rerender } = render(<SettingsPage tutorialOpen={false} />)

    rerender(<SettingsPage tutorialOpen />)

    expect(screen.getByRole('dialog', { name: '使用教程' })).toBeInTheDocument()
  })

  it('persists onboarding completion when the first-run tour is skipped', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      onboardingCompleted: true,
      hotkey: 'Alt+Space',
      autostart: false,
      showRecent: false,
      clipboardHistoryEnabled: false,
      fileHistoryEnabled: true,
      disabledBaseAppIds: [],
      theme: 'system',
      searchEngine: { kind: 'bing' },
      activeHotkey: 'Alt+Space',
      hotkeyConflict: false,
    })
    window.launcher = { updateSettings } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage tutorialOpen />)
    await user.click(screen.getByRole('button', { name: '跳过教程' }))

    expect(updateSettings).toHaveBeenCalledWith({ onboardingCompleted: true })
  })

  it('switches between settings sections', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '快捷命令' }))

    expect(screen.getByRole('heading', { name: '快捷命令' })).toBeInTheDocument()
  })

  it('keeps each general setting in its own horizontal row', () => {
    const { container } = render(<SettingsPage />)

    expect(container.querySelector('.settings-general-grid')).not.toBeInTheDocument()
    expect(container.querySelectorAll('.settings-option-row')).toHaveLength(4)
    expect(screen.getByLabelText('开机自动启动').closest('.settings-option-row')).toBeInTheDocument()
    expect(screen.getByLabelText('记录最近文件').closest('.settings-option-row')).toBeInTheDocument()
  })

  it('adds and removes a custom file-search directory through the native picker', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn().mockImplementation(async (patch: { fileSearchRoots?: string[] }) => ({
      ...DEFAULT_SETTINGS_FOR_TEST,
      ...patch,
    }))
    const selectFileSearchRoot = vi.fn().mockResolvedValue('/Users/alice/Projects')
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS_FOR_TEST),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
      selectFileSearchRoot,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)
    const addRootButton = await screen.findByRole('button', { name: '添加文件搜索目录' })
    expect(addRootButton).toHaveClass('settings-inline-action')
    await user.click(addRootButton)

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ fileSearchRoots: ['/Users/alice/Projects'] }))
    expect(screen.getByText('/Users/alice/Projects')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '移除文件搜索目录 /Users/alice/Projects' }))

    await waitFor(() => expect(updateSettings).toHaveBeenCalledWith({ fileSearchRoots: [] }))
    expect(selectFileSearchRoot).toHaveBeenCalledOnce()
  })

  it('fills defaults when an older settings snapshot omits newer options', async () => {
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: true,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)

    await waitFor(() => expect(screen.getByRole('checkbox', { name: '显示最近使用' })).toBeChecked())
    expect(screen.getByRole('checkbox', { name: '记录最近文件' })).toBeChecked()
  })

  it('shows the application identity in the about section', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '关于' }))

    expect(screen.getByRole('heading', { name: '关于 Quick Launcher' })).toBeInTheDocument()
    expect(screen.getByText(buildInfo.version)).toBeInTheDocument()
    expect(screen.getByText(`v${buildInfo.version}`)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Quick Launcher 图标' })).toBeInTheDocument()
  })

  it('shows built-in application templates and persists their enabled state', async () => {
    const user = userEvent.setup()
    const snapshot = {
      catalogVersion: '2026.09',
      apps: [{
        id: 'chrome',
        displayName: 'Google Chrome',
        defaultAliases: ['chrome'],
        platforms: { macos: { bundleIds: ['com.google.Chrome'] } },
      }],
      disabledAppIds: [],
    }
    const setBaseAppEnabled = vi.fn().mockResolvedValue(snapshot)
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        clipboardHistoryEnabled: false,
        fileHistoryEnabled: true,
        disabledBaseAppIds: [],
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      getBaseCatalog: vi.fn().mockResolvedValue(snapshot),
      setBaseAppEnabled,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '软件模板' }))

    expect(screen.getByRole('heading', { name: '软件模板' })).toBeInTheDocument()
    expect(screen.getByText('Google Chrome')).toBeInTheDocument()
    const toggle = screen.getByRole('checkbox', { name: '启用 Google Chrome' })
    expect(toggle).toBeChecked()
    await user.click(toggle)

    expect(setBaseAppEnabled).toHaveBeenCalledWith('chrome', false)
  })

  it('refreshes the application index from the templates section', async () => {
    const user = userEvent.setup()
    const refreshApplications = vi.fn().mockResolvedValue({ count: 42 })
    const snapshot = {
      catalogVersion: '2026.09.2',
      apps: [],
      disabledAppIds: [],
    }
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS_FOR_TEST),
      getCommands: vi.fn().mockResolvedValue([]),
      getBaseCatalog: vi.fn().mockResolvedValue(snapshot),
      refreshApplications,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '软件模板' }))
    await user.click(await screen.findByRole('button', { name: '刷新应用索引' }))

    expect(refreshApplications).toHaveBeenCalledOnce()
  })

  it('distinguishes template loading failures from an empty catalog and retries successfully', async () => {
    const user = userEvent.setup()
    const getBaseCatalog = vi.fn().mockRejectedValueOnce(new Error('IPC unavailable')).mockResolvedValue({ catalogVersion: 'test', apps: [], disabledAppIds: [] })
    window.launcher = { getBaseCatalog } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '软件模板' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('软件模板加载失败')
    expect(screen.queryByText('暂无内置软件模板')).not.toBeInTheDocument()
    expect(screen.queryByText('已同步')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '重试加载' }))
    expect(await screen.findByText('暂无内置软件模板')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getBaseCatalog).toHaveBeenCalledTimes(2)
  })

  it('updates template icons after hydration, falls back on decode errors, and unsubscribes on leaving the page', async () => {
    const user = userEvent.setup()
    const app = { id: 'chrome', displayName: 'Google Chrome', defaultAliases: ['chrome'], platforms: { macos: { bundleIds: ['com.google.Chrome'] } } }
    const snapshot = { catalogVersion: 'test', apps: [app], disabledAppIds: ['chrome'] }
    const getBaseCatalog = vi.fn().mockResolvedValue(snapshot)
    let onChanged: (() => void) | undefined
    const unsubscribe = vi.fn()
    window.launcher = {
      getBaseCatalog,
      onCatalogChanged: vi.fn((listener: () => void) => { onChanged = listener; return unsubscribe }),
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '软件模板' }))
    await screen.findByText('Google Chrome')
    expect(screen.queryByRole('img', { name: 'Google Chrome 图标' })).not.toBeInTheDocument()
    const iconData = 'data:image/png;base64,Y2hyb21l'
    getBaseCatalog.mockResolvedValue({ ...snapshot, apps: [{ ...app, iconData }] })
    await act(async () => { onChanged?.() })
    const icon = await screen.findByRole('img', { name: 'Google Chrome 图标' })
    expect(icon).toHaveAttribute('src', iconData)
    expect(screen.getByRole('checkbox', { name: '启用 Google Chrome' })).not.toBeChecked()
    fireEvent.error(icon)
    expect(screen.queryByRole('img', { name: 'Google Chrome 图标' })).not.toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
    getBaseCatalog.mockResolvedValue({ ...snapshot, apps: [{ ...app, iconData: `${iconData}Mg==` }] })
    await act(async () => { onChanged?.() })
    expect(await screen.findByRole('img', { name: 'Google Chrome 图标' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '常规设置' }))
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('persists the autostart preference from the general section', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      hotkey: 'Alt+Space',
      autostart: true,
      theme: 'system',
      searchEngine: { kind: 'bing' },
      activeHotkey: 'Alt+Space',
      hotkeyConflict: false,
    })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    const checkbox = await screen.findByRole('checkbox', { name: '开机自动启动' })
    await user.click(checkbox)

    expect(updateSettings).toHaveBeenCalledWith({ autostart: true })
  })

  it('persists the recent usage visibility preference', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      hotkey: 'Alt+Space',
      autostart: false,
      showRecent: true,
      theme: 'system',
      searchEngine: { kind: 'bing' },
      activeHotkey: 'Alt+Space',
      hotkeyConflict: false,
    })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(await screen.findByRole('checkbox', { name: '显示最近使用' }))

    expect(updateSettings).toHaveBeenCalledWith({ showRecent: true })
  })

  it('keeps clipboard history opt-in and allows recent-file history to be disabled', async () => {
    const user = userEvent.setup()
    const snapshot = {
      schemaVersion: 1 as const,
      hotkey: 'Alt+Space',
      autostart: false,
      showRecent: false,
      clipboardHistoryEnabled: false,
      fileHistoryEnabled: true,
      theme: 'system' as const,
      searchEngine: { kind: 'bing' as const },
      activeHotkey: 'Alt+Space',
      hotkeyConflict: false,
    }
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => ({ ...snapshot, ...patch }))
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue(snapshot),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(await screen.findByRole('checkbox', { name: '记录剪贴板历史' }))
    await user.click(screen.getByRole('checkbox', { name: '记录最近文件' }))

    expect(updateSettings).toHaveBeenCalledWith({ clipboardHistoryEnabled: true })
    expect(updateSettings).toHaveBeenCalledWith({ fileHistoryEnabled: false })
  })

  it('clears clipboard history through the dedicated action without toggling the setting', async () => {
    const user = userEvent.setup()
    const clearHistory = vi.fn().mockResolvedValue(undefined)
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS_FOR_TEST }),
      getCommands: vi.fn().mockResolvedValue([]),
      clearHistory,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(await screen.findByRole('button', { name: '清空剪贴板历史' }))

    expect(clearHistory).toHaveBeenCalledWith('clipboard')
    expect(screen.getByRole('checkbox', { name: '记录剪贴板历史' })).toBeInTheDocument()
  })

  it('shows an actionable high-contrast message when settings cannot be written', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn().mockRejectedValue(new Error('EACCES: permission denied'))
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(await screen.findByRole('checkbox', { name: '显示最近使用' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('设置文件没有写入权限')
    expect(alert).toHaveClass('settings-error')
    expect(screen.getByRole('checkbox', { name: '显示最近使用' })).not.toBeChecked()
  })

  it('explains when macOS requires login-item approval', async () => {
    const user = userEvent.setup()
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        clipboardHistoryEnabled: false,
        fileHistoryEnabled: true,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings: vi.fn().mockRejectedValue(new Error('AUTOSTART_APPROVAL_REQUIRED')),
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(await screen.findByRole('checkbox', { name: '开机自动启动' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('系统设置的“登录项”')
    expect(screen.getByRole('checkbox', { name: '开机自动启动' })).not.toBeChecked()
  })

  it('keeps a custom search template editable and saves it after a valid blur', async () => {
    const user = userEvent.setup()
    const updateSettings = vi.fn(async (patch: Record<string, unknown>) => ({
      ...DEFAULT_SETTINGS_FOR_TEST,
      ...patch,
    }))
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS_FOR_TEST),
      getCommands: vi.fn().mockResolvedValue([]),
      updateSettings,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)

    await user.selectOptions(await screen.findByLabelText('搜索引擎'), 'custom')
    const template = await screen.findByLabelText('自定义搜索模板')
    await user.clear(template)
    fireEvent.change(template, { target: { value: 'https://search.example/?q={query}' } })

    expect(template).toHaveValue('https://search.example/?q={query}')
    expect(updateSettings).toHaveBeenCalledTimes(1)

    await user.tab()

    await waitFor(() => expect(updateSettings).toHaveBeenLastCalledWith({
      searchEngine: { kind: 'custom', template: 'https://search.example/?q={query}' },
    }))
  })

  it('creates a custom web command', async () => {
    const user = userEvent.setup()
    const createCommand = vi.fn().mockResolvedValue({
      id: 'docs', keyword: 'docs', title: '项目文档', type: 'open-url', target: 'https://example.com/docs', enabled: true,
    })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      createCommand,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '快捷命令' }))
    await user.click(screen.getByRole('button', { name: '新增命令' }))
    expect(screen.getByLabelText('命令关键词').closest('.settings-command-field-row')).toBeInTheDocument()
    expect(screen.getByLabelText('命令名称').closest('.settings-command-field-row')).toBeInTheDocument()
    expect(screen.getByLabelText('命令类型').closest('.settings-command-field-row')).toBeInTheDocument()
    expect(screen.getByLabelText('目标地址').closest('.settings-command-field-row')).toBeInTheDocument()
    await user.type(screen.getByLabelText('命令关键词'), 'docs')
    await user.type(screen.getByLabelText('命令名称'), '项目文档')
    await user.type(screen.getByLabelText('目标地址'), 'https://example.com/docs')
    await user.click(screen.getByRole('button', { name: '保存命令' }))

    expect(createCommand).toHaveBeenCalledWith({
      id: 'docs', keyword: 'docs', title: '项目文档', type: 'open-url', target: 'https://example.com/docs', enabled: true,
    })
  })

  it('creates a configurable site-search command', async () => {
    const user = userEvent.setup()
    const createCommand = vi.fn().mockResolvedValue({
      id: 'douyin', keyword: '抖音', title: '抖音', type: 'site-search', target: 'https://www.douyin.com/search/{query}?type=general', enabled: true,
    })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      createCommand,
    } as unknown as NonNullable<typeof window.launcher>
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '快捷命令' }))
    await user.click(screen.getByRole('button', { name: '新增命令' }))
    await user.type(screen.getByLabelText('命令关键词'), '抖音')
    await user.type(screen.getByLabelText('命令名称'), '抖音')
    await user.selectOptions(screen.getByLabelText('命令类型'), 'site-search')
    fireEvent.change(screen.getByLabelText('搜索地址模板'), { target: { value: 'https://www.douyin.com/search/{query}?type=general' } })
    await user.click(screen.getByRole('button', { name: '保存命令' }))

    expect(createCommand).toHaveBeenCalledWith({
      id: expect.stringMatching(/^cmd-/u), keyword: '抖音', title: '抖音', type: 'site-search', target: 'https://www.douyin.com/search/{query}?type=general', enabled: true,
    })
  })

  it('previews a command package and commits a conflict decision', async () => {
    const user = userEvent.setup()
    const preview = {
      previewId: 'preview-1',
      packageDigest: 'digest',
      expectedConfigVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      commands: [{ id: 'docs', keyword: 'docs', title: '项目文档', type: 'open-url' as const, target: 'https://example.com/docs', enabled: true }],
      conflicts: [{ kind: 'command-id' as const, incomingId: 'docs', existingId: 'docs' }],
    }
    const selectCommandPackage = vi.fn().mockResolvedValue(preview)
    const commitCommandPackage = vi.fn().mockResolvedValue(preview.commands)
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        hotkey: 'Alt+Space',
        autostart: false,
        showRecent: false,
        clipboardHistoryEnabled: false,
        fileHistoryEnabled: true,
        disabledBaseAppIds: [],
        theme: 'system',
        searchEngine: { kind: 'bing' },
        activeHotkey: 'Alt+Space',
        hotkeyConflict: false,
      }),
      getCommands: vi.fn().mockResolvedValue([]),
      selectCommandPackage,
      commitCommandPackage,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '快捷命令' }))
    await user.click(screen.getByRole('button', { name: '导入命令包' }))
    expect(await screen.findByText('团队命令')).toBeInTheDocument()
    expect(screen.getByText('发现 1 个冲突')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('处理 项目文档'), 'replace')
    await user.click(screen.getByRole('button', { name: '确认导入' }))

    expect(selectCommandPackage).toHaveBeenCalledOnce()
    expect(commitCommandPackage).toHaveBeenCalledWith('preview-1', [{ incomingId: 'docs', action: 'replace' }])
  })

  it('offers to relocate an unavailable package application', async () => {
    const user = userEvent.setup()
    const appRef = 'package:team.shortcuts/editor'
    const preview = {
      previewId: 'preview-app',
      packageDigest: 'digest',
      expectedConfigVersion: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      packageId: 'team.shortcuts',
      name: '团队命令',
      version: '1.0.0',
      commands: [{ id: 'open-editor', keyword: 'editor', title: '打开编辑器', type: 'launch-app' as const, target: appRef, enabled: true }],
      conflicts: [],
      unavailableAppRefs: [appRef],
    }
    const selectCommandPackage = vi.fn().mockResolvedValue(preview)
    const relocateApplication = vi.fn().mockResolvedValue({ status: 'bound', appRef })
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({ ...DEFAULT_SETTINGS_FOR_TEST }),
      getCommands: vi.fn().mockResolvedValue([]),
      selectCommandPackage,
      relocateApplication,
    } as unknown as NonNullable<typeof window.launcher>

    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: '快捷命令' }))
    await user.click(screen.getByRole('button', { name: '导入命令包' }))
    await user.click(await screen.findByRole('button', { name: '重新定位 打开编辑器' }))

    expect(relocateApplication).toHaveBeenCalledWith(appRef)
    await waitFor(() => expect(screen.getByText('可导入')).toBeInTheDocument())
  })
})
