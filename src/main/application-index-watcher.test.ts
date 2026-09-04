import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApplicationIndexWatcher } from './application-index-watcher'

type WatchListener = (event: 'rename' | 'change', fileName: string | Buffer | null) => void

describe('application index watcher', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('coalesces bursts of filesystem changes and closes every watcher', () => {
    vi.useFakeTimers()
    const listeners = new Map<string, WatchListener>()
    const close = vi.fn()
    const watchDirectory = vi.fn((root: string, _options: { recursive: boolean }, listener: WatchListener) => {
      listeners.set(root, listener)
      return { close }
    })
    const onChange = vi.fn()
    const watcher = createApplicationIndexWatcher(['/Applications', '/Users/alice/Applications'], onChange, watchDirectory)

    listeners.get('/Applications')?.('rename', 'New.app')
    listeners.get('/Users/alice/Applications')?.('change', 'Old.app')
    vi.advanceTimersByTime(249)
    expect(onChange).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith([
      { root: '/Applications', event: 'rename', fileName: 'New.app' },
      { root: '/Users/alice/Applications', event: 'change', fileName: 'Old.app' },
    ])

    watcher.close()
    expect(close).toHaveBeenCalledTimes(2)
    listeners.get('/Applications')?.('rename', 'Later.app')
    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('continues when one root cannot be watched', () => {
    const availableListener = vi.fn()
    const watchDirectory = vi.fn((root: string, _options: { recursive: boolean }, listener: WatchListener) => {
      if (root === '/missing') throw new Error('ENOENT')
      availableListener.mockImplementation(listener)
      return { close: vi.fn() }
    })
    const watcher = createApplicationIndexWatcher(['/missing', '/Applications'], vi.fn(), watchDirectory)

    expect(watchDirectory).toHaveBeenCalledTimes(2)
    expect(availableListener).toHaveBeenCalledTimes(0)
    watcher.close()
  })

  it('retries a root that was unavailable when watching started', () => {
    vi.useFakeTimers()
    let attempts = 0
    const onChange = vi.fn()
    const watchDirectory = vi.fn((_root: string, _options: { recursive: boolean }, _listener: WatchListener) => {
      attempts += 1
      if (attempts === 1) throw new Error('ENOENT')
      return { close: vi.fn() }
    })
    const watcher = createApplicationIndexWatcher(['/Applications'], onChange, watchDirectory, 250, 2_000)

    expect(watchDirectory).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_999)
    expect(watchDirectory).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1)
    expect(watchDirectory).toHaveBeenCalledTimes(2)
    vi.advanceTimersByTime(250)
    expect(onChange).toHaveBeenCalledWith([
      { root: '/Applications', event: 'rename', fileName: null },
    ])
    watcher.close()
  })

  it('turns asynchronous watcher errors into a debounced full-refresh change', () => {
    vi.useFakeTimers()
    let errorListener: ((error: unknown) => void) | undefined
    const watchDirectory = vi.fn((_root: string, _options: { recursive: boolean }, _listener: WatchListener) => ({
      on: (_event: 'error', listener: (error: unknown) => void) => { errorListener = listener },
      close: vi.fn(),
    }))
    const onChange = vi.fn()
    const watcher = createApplicationIndexWatcher(['/Applications'], onChange, watchDirectory)

    expect(errorListener).toBeTypeOf('function')
    expect(() => errorListener?.(new Error('directory removed'))).not.toThrow()
    vi.advanceTimersByTime(250)
    expect(onChange).toHaveBeenCalledWith([
      { root: '/Applications', event: 'rename', fileName: null },
    ])
    vi.advanceTimersByTime(2_000)
    expect(watchDirectory).toHaveBeenCalledTimes(2)
    watcher.close()
  })
})
