import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { App } from './app'

describe('App', () => {
  it('shows the product name', () => {
    render(<App />)

    expect(screen.getByText('Quick Launcher')).toBeInTheDocument()
  })
})
