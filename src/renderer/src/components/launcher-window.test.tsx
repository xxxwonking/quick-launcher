import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherItem } from '../../../shared/launcher-item'
import { LauncherWindow, RECENT_ITEM_IDS_STORAGE_KEY, selectionIndexForQuery } from './launcher-window'

const runtimeWechat: LauncherItem = {
  id: 'shortcut:wechat',
  title: '微信',
  subtitle: '应用程序',
  aliases: ['wx', 'wechat', 'weixin', '微信'],
  icon: 'message',
  kind: 'application',
  action: { type: 'launch-indexed', targetId: 'shortcut:wechat' },
}

const nativeLocalStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')

function stubLocalStorage(values: Map<string, string>): void {
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    clear: () => values.clear(),
  } as unknown as Storage
  Object.defineProperty(window, 'localStorage', { configurable: true, value: storage })
}

describe('LauncherWindow', () => {
  afterEach(() => {
    delete window.launcher
    window.localStorage?.clear()
    if (nativeLocalStorageDescriptor) Object.defineProperty(window, 'localStorage', nativeLocalStorageDescriptor)
    vi.unstubAllGlobals()
  })

  it('does not carry the previous selected index into the first render of a new query', () => {
    expect(selectionIndexForQuery(2, 'docker', 'd', 4)).toBe(0)
    expect(selectionIndexForQuery(2, 'docker', 'docker', 4)).toBe(2)
    expect(selectionIndexForQuery(2, 'docker', 'z', 0)).toBe(-1)
  })

  it('requests a native window height matching the rendered panel', () => {
    const resizeSearchWindow = vi.fn()
    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback
      }

      observe(target: Element): void {
        this.callback([{
          borderBoxSize: [{ blockSize: 118, inlineSize: 740 }],
          contentBoxSize: [{ blockSize: 116, inlineSize: 738 }],
          contentRect: target.getBoundingClientRect(),
          devicePixelContentBoxSize: [],
          target,
        }], this as unknown as ResizeObserver)
      }

      disconnect(): void {}
      unobserve(): void {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock)
    window.launcher = {
      openSettings: vi.fn(),
      openTutorial: vi.fn(),
      hideLauncher: vi.fn(),
      getTheme: vi.fn().mockResolvedValue('system'),
      setTheme: vi.fn(),
      onThemeChanged: vi.fn(),
      resizeSearchWindow,
    }

    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)

    expect(resizeSearchWindow).toHaveBeenCalledWith(138)
  })

  it('keeps the input focused while arrow keys move the active result', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
    const input = screen.getByRole('combobox')

    await user.click(input)
    await user.type(input, 'wx')
    await user.keyboard('{ArrowDown}')

    expect(input).toHaveFocus()
    expect(screen.getByRole('option', { name: /使用必应搜索/ })).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', 'launcher-result-web-fallback')
  })

  it('scrolls the newly selected result into view when moving with arrow keys', async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
    await user.type(screen.getByRole('combobox'), 'wx')
    scrollIntoView.mockClear()

    await user.keyboard('{ArrowDown}')

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
  })

  it('exposes a draggable surface without blocking interactive controls', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
    await user.type(screen.getByRole('combobox'), 'wx')

    expect(screen.getByRole('main')).toHaveClass('launcher-drag-region')
    expect(screen.getByRole('combobox')).toHaveClass('launcher-no-drag')
    expect(screen.getByRole('option', { name: /微信/ })).toHaveClass('launcher-no-drag')
  })

  it('executes a selected application with Enter and hides on Escape', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    const onHide = vi.fn()
    render(<LauncherWindow onExecute={onExecute} onHide={onHide} runtimeItems={[runtimeWechat]} />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'wx')
    await user.keyboard('{Enter}')
    await user.keyboard('{Escape}')

    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'shortcut:wechat' }))
    expect(onHide).toHaveBeenCalledOnce()
  })

  it('restores recently used applications after the launcher remounts', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn().mockResolvedValue('微信 已打开')
    const values = new Map<string, string>()
    stubLocalStorage(values)
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({ showRecent: true }),
    } as unknown as NonNullable<typeof window.launcher>

    const firstRender = render(<LauncherWindow onExecute={onExecute} runtimeItems={[runtimeWechat]} />)
    await user.type(screen.getByRole('combobox'), 'wx')
    await user.keyboard('{Enter}')
    expect(onExecute).toHaveBeenCalledWith(expect.objectContaining({ id: 'shortcut:wechat' }))

    firstRender.unmount()
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)

    await waitFor(() => expect(values.get(RECENT_ITEM_IDS_STORAGE_KEY)).toBe(JSON.stringify(['shortcut:wechat'])))
    expect(await screen.findByRole('option', { name: /微信/ })).toBeInTheDocument()
  })

  it('removes recently used IDs that are no longer in the runtime catalog', async () => {
    const values = new Map<string, string>([[RECENT_ITEM_IDS_STORAGE_KEY, JSON.stringify(['shortcut:missing', 'shortcut:wechat'])]])
    stubLocalStorage(values)
    window.launcher = {
      getSettings: vi.fn().mockResolvedValue({ showRecent: true }),
    } as unknown as NonNullable<typeof window.launcher>

    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)

    await waitFor(() => expect(values.get(RECENT_ITEM_IDS_STORAGE_KEY)).toBe(JSON.stringify(['shortcut:wechat'])))
    expect(await screen.findByRole('option', { name: /微信/ })).toBeInTheDocument()
    expect(values.get(RECENT_ITEM_IDS_STORAGE_KEY)).toBe(JSON.stringify(['shortcut:wechat']))
    expect(screen.queryByRole('option', { name: /missing/ })).not.toBeInTheDocument()
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
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
    const input = screen.getByRole('combobox')

    await user.type(input, '陌生关键词')

    expect(screen.getByRole('option', { name: /使用必应搜索/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('shows a disabled hint and does not open an empty web search for llq', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    render(<LauncherWindow onExecute={onExecute} />)
    const input = screen.getByRole('combobox')

    await user.type(input, 'llq')
    expect(screen.getByRole('option', { name: /请输入搜索内容/ })).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Enter}')

    expect(onExecute).not.toHaveBeenCalled()
  })

  it('offers a one-time copy action when opening a browser URL fails', async () => {
    const user = userEvent.setup()
    const onCopyGeneratedUrl = vi.fn().mockResolvedValue('网址已复制')
    const onExecute = vi.fn().mockResolvedValue({ message: '浏览器打开失败，请检查默认浏览器设置', copyToken: 'a'.repeat(32) })
    const webItem: LauncherItem = {
      id: 'web:example',
      title: '打开示例网页',
      subtitle: '固定网址',
      aliases: ['example'],
      icon: 'globe',
      kind: 'web',
      action: { type: 'open-url', url: 'https://example.com' },
    }
    render(<LauncherWindow onCopyGeneratedUrl={onCopyGeneratedUrl} onExecute={onExecute} runtimeItems={[webItem]} />)

    await user.type(screen.getByRole('combobox'), 'example')
    await user.keyboard('{Enter}')
    const copyButton = await screen.findByRole('button', { name: '复制网址' })
    await user.click(copyButton)

    expect(onCopyGeneratedUrl).toHaveBeenCalledWith('a'.repeat(32))
    expect(screen.queryByRole('button', { name: '复制网址' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('网址已复制')
  })

  it('visually separates the web fallback from local results', async () => {
    const user = userEvent.setup()
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)

    await user.type(screen.getByRole('combobox'), 'wx')

    expect(screen.getByRole('separator')).toBeInTheDocument()
  })

  it('executes the web fallback with Ctrl+Enter without changing input focus', async () => {
    const user = userEvent.setup()
    const onExecute = vi.fn()
    render(<LauncherWindow onExecute={onExecute} runtimeItems={[runtimeWechat]} />)
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
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
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
    render(<LauncherWindow runtimeItems={[runtimeWechat]} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'wx')
    input.blur()

    focusListener?.()
    expect(input).toHaveValue('')
    expect(input).toHaveFocus()
  })

  it('never executes a stale result when Enter follows an input event immediately', () => {
    const onOpenSettings = vi.fn()
    const onExecute = vi.fn()
    render(<LauncherWindow onExecute={onExecute} onOpenSettings={onOpenSettings} />)
    const input = screen.getByRole('combobox')

    fireEvent.change(input, { target: { value: 'setting' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onOpenSettings).toHaveBeenCalledWith({ tutorial: false })
    expect(onExecute).not.toHaveBeenCalled()
  })
})
