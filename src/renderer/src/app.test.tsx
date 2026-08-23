import { render, screen } from '@testing-library/react'
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
})
