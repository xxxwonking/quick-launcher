import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ResultList } from './result-list'

describe('ResultList', () => {
  it('does not reserve vertical space when there are no results', () => {
    render(<ResultList items={[]} onExecute={vi.fn()} onSelect={vi.fn()} selectedIndex={-1} />)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
