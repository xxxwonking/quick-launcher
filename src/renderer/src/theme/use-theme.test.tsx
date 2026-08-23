import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LauncherThemePayload } from '../global'
import { useThemeController } from './use-theme'

function ThemeHarness(): React.JSX.Element {
  const theme = useThemeController()
  return (
    <div>
      <output>{theme.preference}:{theme.resolved}</output>
      <button onClick={() => theme.setPreference('dark')} type="button">dark</button>
    </div>
  )
}

describe('useThemeController', () => {
  afterEach(() => {
    delete window.launcher
    delete document.documentElement.dataset.theme
  })

  it('loads the system preference, applies updates, and forwards manual changes', async () => {
    const user = userEvent.setup()
    const setTheme = vi.fn()
    let themeListener: ((payload: LauncherThemePayload) => void) | undefined
    window.launcher = {
      openSettings: vi.fn(),
      openTutorial: vi.fn(),
      hideLauncher: vi.fn(),
      getTheme: vi.fn().mockResolvedValue({ preference: 'system', resolved: 'light' }),
      setTheme,
      onThemeChanged: vi.fn((listener) => { themeListener = listener }),
    }

    render(<ThemeHarness />)

    await waitFor(() => expect(screen.getByText('system:light')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'dark' }))
    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    themeListener?.({ preference: 'light', resolved: 'light' })
    await waitFor(() => expect(screen.getByText('light:light')).toBeInTheDocument())
  })
})
