export function shouldSimulateOsOpen(e2eMode: string | undefined, isPackaged: boolean): boolean {
  return e2eMode === '1' && !isPackaged
}

export function resolveDevelopmentRendererUrl(value: string | undefined, isPackaged: boolean): string | undefined {
  if (!value || isPackaged) return undefined
  try {
    const url = new URL(value)
    const localHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !localHosts.has(url.hostname)) return undefined
    return url.origin
  } catch {
    return undefined
  }
}

export async function openExternalSafely(
  url: string,
  openExternal: (url: string) => Promise<void>,
  simulate: boolean,
): Promise<boolean> {
  if (simulate) return true
  try {
    await openExternal(url)
    return true
  } catch {
    return false
  }
}

export async function openPathSafely(
  path: string,
  openPath: (path: string) => Promise<string>,
  simulate: boolean,
): Promise<boolean> {
  if (simulate) return true
  try {
    return (await openPath(path)).length === 0
  } catch {
    return false
  }
}
