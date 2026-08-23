import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from './app'

describe('App', () => {
  afterEach(() => {
    delete window.launcher
  })

  it('shows the product name', () => {
    render(<App />)

    expect(screen.getByText('Quick Launcher')).toBeInTheDocument()
  })

  it('opens the local settings view from the reserved setting command when the preload API is absent', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'setting')
    await user.keyboard('{Enter}')

    expect(screen.getByRole('heading', { name: '常规设置' })).toBeInTheDocument()
  })

  it('continues the guided tour from the reserved tutorial command', async () => {
    const user = userEvent.setup()
    render(<App />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'tutorial')
    await user.keyboard('{Enter}')

    expect(screen.getByRole('dialog', { name: '使用教程' })).toBeInTheDocument()
    expect(screen.getByText(/第 1 步/)).toBeInTheDocument()
  })

  it('uses only the reserved preload methods when the Electron bridge is available', async () => {
    const user = userEvent.setup()
    const openSettings = vi.fn()
    const hideLauncher = vi.fn()
    window.launcher = {
      openSettings,
      openTutorial: vi.fn(),
      hideLauncher,
      getTheme: vi.fn().mockResolvedValue('system'),
      setTheme: vi.fn(),
      onThemeChanged: vi.fn(),
    }
    render(<App />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'setting')
    await user.keyboard('{Enter}{Escape}')

    expect(openSettings).toHaveBeenCalledOnce()
    expect(hideLauncher).toHaveBeenCalledOnce()
  })

  it('loads the main-process catalog before searching installed applications', async () => {
    const user = userEvent.setup()
    window.launcher = {
      openSettings: vi.fn(),
      openTutorial: vi.fn(),
      hideLauncher: vi.fn(),
      getTheme: vi.fn().mockResolvedValue('system'),
      setTheme: vi.fn(),
      onThemeChanged: vi.fn(),
      getCatalog: vi.fn().mockResolvedValue({
        snapshotVersion: 2,
        items: [{
          id: 'shortcut:quark',
          title: '夸克网盘',
          subtitle: '应用程序',
          aliases: ['夸克网盘', 'kuakewangpan', 'kkwp'],
          icon: 'folder',
          kind: 'application',
          action: { type: 'launch-indexed', targetId: 'shortcut:quark' },
        }],
      }),
    }
    render(<App />)
    await user.type(await screen.findByRole('combobox'), 'kkwp')

    expect(await screen.findByRole('option', { name: /夸克网盘/ })).toBeInTheDocument()
  })

  it('updates installed applications when the main process publishes a refreshed catalog', async () => {
    const user = userEvent.setup()
    let catalogListener: ((catalog: {
      snapshotVersion: number
      items: Array<{
        id: string
        title: string
        subtitle: string
        aliases: string[]
        icon: 'folder'
        kind: 'application'
        action: { type: 'launch-indexed'; targetId: string }
      }>
    }) => void) | undefined
    window.launcher = {
      openSettings: vi.fn(),
      openTutorial: vi.fn(),
      hideLauncher: vi.fn(),
      getTheme: vi.fn().mockResolvedValue('system'),
      setTheme: vi.fn(),
      onThemeChanged: vi.fn(),
      getCatalog: vi.fn().mockResolvedValue({ snapshotVersion: 1, items: [] }),
      onCatalogChanged: vi.fn((listener) => {
        catalogListener = listener
        return vi.fn()
      }),
    }
    render(<App />)
    await act(async () => Promise.resolve())

    act(() => catalogListener?.({
      snapshotVersion: 2,
      items: [{
        id: 'shortcut:quark',
        title: '夸克网盘',
        subtitle: '应用程序',
        aliases: ['夸克网盘', 'kuakewangpan', 'kkwp'],
        icon: 'folder',
        kind: 'application',
        action: { type: 'launch-indexed', targetId: 'shortcut:quark' },
      }],
    }))
    await user.type(screen.getByRole('combobox'), 'kkwp')

    expect(await screen.findByRole('option', { name: /夸克网盘/ })).toBeInTheDocument()
  })
})
