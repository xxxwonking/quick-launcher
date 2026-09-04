import { randomBytes } from 'node:crypto'

const TOKEN_BYTES = 16
const TOKEN_PATTERN = /^[a-f0-9]{32}$/u
const DEFAULT_TTL_MS = 5 * 60 * 1000

type GeneratedUrlRecord = {
  url: string
  webContentsId: number
  expiresAt: number
}

export type GeneratedUrlConsumeResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid' | 'expired' }

export type GeneratedUrlRegistryOptions = {
  now?: () => number
  createToken?: () => string
  ttlMs?: number
}

export type GeneratedUrlRegistry = {
  issue: (url: string, webContentsId: number) => string
  consume: (token: string, webContentsId: number) => GeneratedUrlConsumeResult
  removeWindow: (webContentsId: number) => void
  size: () => number
}

export function createGeneratedUrlRegistry(options: GeneratedUrlRegistryOptions = {}): GeneratedUrlRegistry {
  const now = options.now ?? Date.now
  const createToken = options.createToken ?? (() => randomBytes(TOKEN_BYTES).toString('hex'))
  const ttlMs = Number.isFinite(options.ttlMs) && (options.ttlMs ?? 0) > 0 ? Math.floor(options.ttlMs as number) : DEFAULT_TTL_MS
  const records = new Map<string, GeneratedUrlRecord>()

  const removeExpired = (): void => {
    const timestamp = now()
    for (const [token, record] of records) {
      if (record.expiresAt <= timestamp) records.delete(token)
    }
  }

  const issue = (url: string, webContentsId: number): string => {
    removeExpired()
    let token = ''
    do {
      token = createToken()
    } while (!TOKEN_PATTERN.test(token) || records.has(token))
    records.set(token, { url, webContentsId, expiresAt: now() + ttlMs })
    return token
  }

  const consume = (token: string, webContentsId: number): GeneratedUrlConsumeResult => {
    if (!TOKEN_PATTERN.test(token)) return { ok: false, reason: 'invalid' }
    const record = records.get(token)
    if (!record || record.webContentsId !== webContentsId) return { ok: false, reason: 'invalid' }
    records.delete(token)
    if (record.expiresAt <= now()) return { ok: false, reason: 'expired' }
    removeExpired()
    return { ok: true, url: record.url }
  }

  return {
    issue,
    consume,
    removeWindow: (webContentsId) => {
      for (const [token, record] of records) if (record.webContentsId === webContentsId) records.delete(token)
    },
    size: () => records.size,
  }
}
