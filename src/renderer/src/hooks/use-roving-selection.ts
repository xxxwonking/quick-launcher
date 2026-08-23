import { useCallback, useEffect, useState } from 'react'

export type SelectionDirection = 'next' | 'previous'

export function moveSelection(current: number, length: number, direction: SelectionDirection): number {
  if (length <= 0) return -1
  if (direction === 'next') return (current + 1 + length) % length
  return (current - 1 + length) % length
}

export function useRovingSelection(length: number): {
  selectedIndex: number
  selectNext: () => void
  selectPrevious: () => void
  resetSelection: () => void
  selectIndex: (index: number) => void
} {
  const [selectedIndex, setSelectedIndex] = useState(length > 0 ? 0 : -1)

  useEffect(() => {
    setSelectedIndex((current) => {
      if (length <= 0) return -1
      return Math.min(Math.max(current, 0), length - 1)
    })
  }, [length])

  const selectNext = useCallback(() => {
    setSelectedIndex((current) => moveSelection(current, length, 'next'))
  }, [length])
  const selectPrevious = useCallback(() => {
    setSelectedIndex((current) => moveSelection(current, length, 'previous'))
  }, [length])
  const resetSelection = useCallback(() => {
    setSelectedIndex(length > 0 ? 0 : -1)
  }, [length])
  const selectIndex = useCallback((index: number) => {
    setSelectedIndex(index >= 0 && index < length ? index : -1)
  }, [length])

  return { selectedIndex, selectNext, selectPrevious, resetSelection, selectIndex }
}
