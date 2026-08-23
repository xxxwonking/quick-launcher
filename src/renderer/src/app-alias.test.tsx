import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from '@renderer/app'

describe('renderer alias', () => {
  it('resolves renderer modules through @renderer', () => {
    render(<App />)

    expect(screen.getByText('Quick Launcher')).toBeInTheDocument()
  })
})
