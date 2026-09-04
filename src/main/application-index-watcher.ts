import { watch as fsWatch } from 'node:fs'

export type ApplicationWatchEvent = 'rename' | 'change'
export type ApplicationWatchListener = (event: ApplicationWatchEvent, fileName: string | Buffer | null) => void
export type ApplicationWatchChange = {
  root: string
  event: ApplicationWatchEvent
  fileName: string | Buffer | null
}
export type DirectoryWatcher = {
  close: () => void
  on?: (event: 'error', listener: (error: unknown) => void) => unknown
}
export type WatchDirectory = (root: string, options: { recursive: boolean }, listener: ApplicationWatchListener) => DirectoryWatcher

const DEFAULT_DEBOUNCE_MS = 250
const DEFAULT_RETRY_MS = 2_000

const defaultWatchDirectory: WatchDirectory = (root, options, listener) => {
  return fsWatch(root, { recursive: options.recursive }, (event, fileName) => listener(event, fileName))
}

export type ApplicationIndexWatcher = {
  close: () => void
}

export function createApplicationIndexWatcher(
  roots: readonly string[],
  onChange: (changes: readonly ApplicationWatchChange[]) => void,
  watchDirectory: WatchDirectory = defaultWatchDirectory,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  retryMs = DEFAULT_RETRY_MS,
): ApplicationIndexWatcher {
  const uniqueRoots: string[] = []
  const seenRoots = new Set<string>()
  for (const root of roots) {
    if (!root) continue
    const key = root.toLocaleLowerCase()
    if (seenRoots.has(key)) continue
    seenRoots.add(key)
    uniqueRoots.push(root)
  }
  type RootWatchState = {
    root: string
    watcher: DirectoryWatcher | undefined
    retryTimer: ReturnType<typeof setTimeout> | null
  }

  const rootStates: RootWatchState[] = uniqueRoots.map((root) => ({ root, watcher: undefined, retryTimer: null }))
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  const pendingChanges: ApplicationWatchChange[] = []

  const scheduleRefresh = (change: ApplicationWatchChange): void => {
    if (disposed) return
    pendingChanges.push(change)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      if (disposed) return
      const changes = pendingChanges.splice(0)
      try {
        onChange(changes)
      } catch {
        // A watcher callback must never take down the main process.
      }
    }, Math.max(0, Math.floor(debounceMs)))
    timer.unref?.()
  }

  const scheduleRetry = (state: RootWatchState): void => {
    if (disposed || state.watcher || state.retryTimer) return
    state.retryTimer = setTimeout(() => {
      state.retryTimer = null
      if (attach(state)) scheduleRefresh({ root: state.root, event: 'rename', fileName: null })
    }, Math.max(0, Math.floor(retryMs)))
    state.retryTimer.unref?.()
  }

  const handleWatcherError = (state: RootWatchState, watcher: DirectoryWatcher): void => {
    if (disposed || state.watcher !== watcher) return
    state.watcher = undefined
    try {
      watcher.close()
    } catch {
      // A failed watcher may already be closed.
    }
    scheduleRefresh({ root: state.root, event: 'rename', fileName: null })
    scheduleRetry(state)
  }

  function attach(state: RootWatchState): boolean {
    if (disposed || state.watcher) return false
    try {
      const watcher = watchDirectory(state.root, { recursive: true }, (event, fileName) => scheduleRefresh({ root: state.root, event, fileName }))
      state.watcher = watcher
      watcher.on?.('error', () => handleWatcherError(state, watcher))
      return true
    } catch {
      // Missing or inaccessible roots are retried without keeping the process alive.
      scheduleRetry(state)
      return false
    }
  }

  for (const state of rootStates) attach(state)

  return {
    close: () => {
      if (disposed) return
      disposed = true
      if (timer) clearTimeout(timer)
      timer = null
      pendingChanges.length = 0
      for (const state of rootStates) {
        if (state.retryTimer) clearTimeout(state.retryTimer)
        state.retryTimer = null
        const watcher = state.watcher
        state.watcher = undefined
        if (!watcher) continue
        try {
          watcher.close()
        } catch {
          // A partially closed watcher should not block application shutdown.
        }
      }
    },
  }
}
