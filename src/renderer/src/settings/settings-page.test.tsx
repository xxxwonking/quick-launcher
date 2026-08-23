import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './settings-page'

describe('SettingsPage', () => {
  it('updates the theme preference immediately', async () => {
    const user = userEvent.setup()
    const onThemeChange = vi.fn()
    render(<SettingsPage themePreference="system" onThemeChange={onThemeChange} />)

    await user.selectOptions(screen.getByLabelText('外观主题'), 'dark')

    expect(onThemeChange).toHaveBeenCalledWith('dark')
  })

  it('offers the guided tutorial entry', async () => {
    const user = userEvent.setup()
    const onOpenTutorial = vi.fn()
    render(<SettingsPage onOpenTutorial={onOpenTutorial} />)

    await user.click(screen.getByRole('button', { name: /使用教程/ }))

    expect(onOpenTutorial).toHaveBeenCalledOnce()
  })

  it('starts the tour when a reused settings view receives a tutorial request', () => {
    const { rerender } = render(<SettingsPage tutorialOpen={false} />)

    rerender(<SettingsPage tutorialOpen />)

    expect(screen.getByRole('dialog', { name: '使用教程' })).toBeInTheDocument()
  })
})
