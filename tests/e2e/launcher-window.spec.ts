import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

let electronApp: ElectronApplication
let userDataDirectory: string

test.beforeEach(async () => {
  userDataDirectory = await mkdtemp(join(tmpdir(), 'quick-launcher-e2e-'))
  electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, resolve('out/main/index.js')],
    env: { ...process.env, QUICK_LAUNCHER_E2E: '1' },
  })
})

test.afterEach(async () => {
  await electronApp.close()
  await rm(userDataDirectory, { recursive: true, force: true })
})

async function showLauncher(): Promise<Page> {
  const launcher = await electronApp.firstWindow()
  await electronApp.evaluate(({ app }) => app.emit('activate'))
  await expect(launcher.getByRole('combobox')).toBeFocused()
  return launcher
}

test('opens the independent settings window and keeps focus after hide/show', async () => {
  const launcher = await showLauncher()
  const input = launcher.getByRole('combobox')

  await input.press('Escape')
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)).toBe(false)
  await electronApp.evaluate(({ app }) => app.emit('activate'))
  await expect(input).toBeFocused()

  await input.fill('setting')
  const settingsWindowPromise = electronApp.waitForEvent('window')
  await input.press('Enter')
  const settingsWindow = await settingsWindowPromise
  await expect(settingsWindow.getByRole('heading', { name: '常规设置' })).toBeVisible()
})

test('executes web search through the preload API without exposing Node', async () => {
  const launcher = await showLauncher()
  await launcher.getByRole('combobox').fill('llq 抖音')
  await launcher.getByRole('combobox').press('Enter')

  await expect(launcher.getByRole('status')).toContainText('正在搜索')
  expect(await launcher.evaluate(() => ({
    hasLauncher: typeof window.launcher === 'object',
    hasRequire: 'require' in window,
    hasProcess: 'process' in window,
  }))).toEqual({ hasLauncher: true, hasRequire: false, hasProcess: false })
})
