import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './settings-page'

afterEach(() => {
  delete window.launcher
})

describe('SettingsPage', () => {
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

  it('updates the theme preference immediately', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    render(<SettingsPage themePreference="system" onThemeChange={onThemeChange} />)

    await user.selectOptions(screen.getByLabelText('外观主题'), 'dark')

    expect(onThemeChange).toHaveBeenCalledWith('dark')
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

  it('switches between settings sections', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    await user.click(screen.getByRole('button', { name: '快捷命令' }))

    expect(screen.getByRole('heading', { name: '快捷命令' })).toBeInTheDocument()
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
    await user.type(screen.getByLabelText('命令关键词'), 'docs')
    await user.type(screen.getByLabelText('命令名称'), '项目文档')
    await user.type(screen.getByLabelText('目标地址'), 'https://example.com/docs')
    await user.click(screen.getByRole('button', { name: '保存命令' }))

    expect(createCommand).toHaveBeenCalledWith({
      id: 'docs', keyword: 'docs', title: '项目文档', type: 'open-url', target: 'https://example.com/docs', enabled: true,
    })
  })
})
