export const SEARCH_WINDOW_WIDTH = 760
export const SEARCH_WINDOW_MIN_HEIGHT = 120
export const SEARCH_WINDOW_EMPTY_HEIGHT = 138
export const SEARCH_WINDOW_MAX_HEIGHT = 560

export function normalizeSearchWindowHeight(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return Math.min(SEARCH_WINDOW_MAX_HEIGHT, Math.max(SEARCH_WINDOW_MIN_HEIGHT, Math.ceil(value)))
}
