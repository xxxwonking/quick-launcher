export type LoginItemSnapshot = {
  openAtLogin?: boolean
  status?: string
}

export type AutostartAdapter = {
  platform: string
  packaged: boolean
  setLoginItemSettings?: (enabled: boolean) => void
  getLoginItemSettings?: () => LoginItemSnapshot
}

export type AutostartResult =
  | { ok: true }
  | { ok: false; reason: 'approval-required' | 'permission-denied' | 'verification-failed' }

export function configureAutostart(enabled: boolean, adapter: AutostartAdapter): AutostartResult {
  if (adapter.platform === 'darwin' && !adapter.packaged) return { ok: true }
  if (!adapter.setLoginItemSettings) return { ok: true }

  try {
    adapter.setLoginItemSettings(enabled)
  } catch {
    return { ok: false, reason: 'permission-denied' }
  }
  if (!adapter.getLoginItemSettings) return { ok: true }

  let snapshot: LoginItemSnapshot
  try {
    snapshot = adapter.getLoginItemSettings()
  } catch {
    return { ok: false, reason: 'verification-failed' }
  }
  if (enabled && snapshot.status === 'requires-approval') return { ok: false, reason: 'approval-required' }
  if (snapshot.openAtLogin !== undefined && snapshot.openAtLogin !== enabled) return { ok: false, reason: 'verification-failed' }
  if (enabled && snapshot.status !== undefined && snapshot.status !== 'enabled') return { ok: false, reason: 'verification-failed' }
  return { ok: true }
}
