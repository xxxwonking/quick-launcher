import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LauncherWindow } from './launcher-window'

describe('LauncherWindow', () => {
  afterEach(() => {
    delete window.launcher
  })

  it('keeps the input focused while arrow keys move the active result', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow />)
    const input = screen.getByRole('combobox')

    await user.click(input)
    await user.keyboard('{ArrowDown}')

    expect(input).toHaveFocus()
    expect(screen.getByRole('option', { name: /微信/ })).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', 'launcher-result-app-wechat')
  })

  it('executes a selected application with Enter and hides on Escape', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    const onHide = vi.fn()
    render(<LauncherWindow onExecute={onExecute} onHide={onHide} />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'wx')
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')

    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'app:wechat' }))
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('shows and activates the settings command', async () => {
    const user = userEvent.setup()
    const onOpenSettings = vi.fn()
    render(<LauncherWindow onOpenSettings={onOpenSettings} />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'setting')
    await user.keyboard('{Enter}')

    expect(onOpenSettings).toHaveBeenCalledWith({ tutorial: false })
  })

  it('automatically selects the web fallback when no local app matches', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow />)
    const input = screen.getByRole('combobox')

    await user.type(input, '陌生关键词')

    expect(screen.getByRole('option', { name: /使用必应搜索/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('visually separates the web fallback from local results', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow />)

    await user.type(screen.getByRole('combobox'), 'wx')

    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('executes the web fallback with Ctrl+Enter without changing input focus', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    render(<LauncherWindow onExecute={onExecute} />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'wx')
    await user.keyboard('{Control>}{Enter}{/Control}')

    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({
      id: 'web:fallback',
      action: { type: 'web-search', query: 'wx' },
    }))
    expect(input).toHaveFocus()
  })

  it('clears and refocuses the input for every main-process focus request', async () => {
    const user = userEvent.setup()
    let focusListener: (() => void) | undefined
    window.launcher = {
      openSettings: vi.fn(),
      openTutorial: vi.fn(),
      hideLauncher: vi.fn(),
      getTheme: vi.fn().mockResolvedValue('system'),
      setTheme: vi.fn(),
      onThemeChanged: vi.fn(),
      onFocusRequested: vi.fn((listener) => { focusListener = listener }),
    }
    render(<LauncherWindow />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'wx')
    await user.click(screen.getByRole('button', { name: '清空搜索' }))
    await user.type(input, 'cursor')
    screen.getByRole('button', { name: '清空搜索' }).focus()
    focusListener?.()

    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('clears the previous query and restores focus when the main process requests a show', async () => {
    const user = userEvent.setup()
    let focusListener: (() => void) | undefined
    window.launcher = {
      onFocusRequested: (listener) => {
        focusListener = listener
        return () => { focusListener = undefined }
      },
      openSettings: () => undefined,
      openTutorial: () => undefined,
      hideLauncher: () => undefined,
      getTheme: () => 'system',
      setTheme: () => undefined,
      onThemeChanged: () => undefined,
    }
    render(<LauncherWindow />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'wx')
    input.blur()

    focusListener?.()
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })
})
