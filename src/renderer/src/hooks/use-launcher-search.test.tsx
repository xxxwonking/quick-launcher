import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useLauncherSearch, type SearchResponse } from './use-launcher-search'

describe('useLauncherSearch', () => {
  it('ignores a slower response for an older query', async () => {
    let resolveOld: ((response: SearchResponse) => void) | undefined
    let resolveNew: ((response: SearchResponse) => void) | undefined
    const provider = (query: string): Promise<SearchResponse> => new Promise((resolve) => {
      if (query === 'old') resolveOld = resolve
      else resolveNew = resolve
    })
    const hook = renderHook(({ query }) => useLauncherSearch(query, provider), { initialProps: { query: 'old' } })

    hook.rerender({ query: 'new' })
    resolveNew?.({ queryId: 2, snapshotVersion: 3, items: [{ id: 'new', title: 'New', subtitle: '', aliases: [], icon: 'globe', kind: 'web', action: { type: 'web-search', query: 'new' } }] })
    await waitFor(() => expect(hook.result.current.items[0]?.id).toBe('new'))

    resolveOld?.({ queryId: 1, snapshotVersion: 3, items: [{ id: 'old', title: 'Old', subtitle: '', aliases: [], icon: 'globe', kind: 'web', action: { type: 'web-search', query: 'old' } }] })
    await waitFor(() => expect(hook.result.current.items[0]?.id).toBe('new'))
  })
})
