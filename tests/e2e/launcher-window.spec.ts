import { _electron as electron, expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
  await electronApp.firstWindow()
  const launcher = await launcherWindow()
  await launcher.evaluate(async () => {
    await window.launcher?.updateSettings?.({ onboardingCompleted: true })
  })
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) {
      const url = window.webContents.getURL()
      if (url && new URL(url).searchParams.get('window') === 'settings') window.hide()
    }
  })
  await launcher.evaluate(() => window.launcher?.refreshApplications?.())
})

test.afterEach(async () => {
  await electronApp.close()
  await rm(userDataDirectory, { recursive: true, force: true })
})

async function showLauncher(): Promise<Page> {
  const launcher = await launcherWindow()
  await electronApp.evaluate(({ app }) => app.emit('activate'))
  await expect(launcher.getByRole('combobox')).toBeFocused()
  return launcher
}

async function launcherWindow(): Promise<Page> {
  await expect.poll(() => electronApp.windows().some((page) => new URL(page.url()).searchParams.get('window') !== 'settings')).toBe(true)
  const launcher = electronApp.windows().find((page) => new URL(page.url()).searchParams.get('window') !== 'settings')
  if (!launcher) throw new Error('Launcher window was not created')
  return launcher
}

async function settingsWindow(): Promise<Page | undefined> {
  for (const window of electronApp.windows()) {
    if (new URL(window.url()).searchParams.get('window') === 'settings') return window
  }
  return undefined
}

async function openSettingsWith(action: () => Promise<void>): Promise<Page> {
  const existingWindow = await settingsWindow()
  const newWindow = existingWindow ? undefined : electronApp.waitForEvent('window')
  await action()
  return existingWindow ?? await newWindow!
}

test('opens the independent settings window and keeps focus after hide/show', async () => {
  const launcher = await showLauncher()
  const input = launcher.getByRole('combobox')

  await input.press('Escape')
  await expect.poll(() => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible() ?? false)).toBe(false)
  await electronApp.evaluate(({ app }) => app.emit('activate'))
  await expect(input).toBeFocused()

  await input.fill('setting')
  const settings = await openSettingsWith(() => input.press('Enter'))
  await expect(settings.getByRole('heading', { name: '常规设置' })).toBeVisible()
})

test('manages built-in application templates from settings', async () => {
  const launcher = await showLauncher()
  await launcher.getByRole('combobox').fill('setting')
  const settingsWindow = await openSettingsWith(() => launcher.getByRole('combobox').press('Enter'))

  await settingsWindow.getByRole('button', { name: '软件模板' }).click()
  await expect(settingsWindow.getByRole('heading', { name: '软件模板', exact: true })).toBeVisible()
  const chromeToggle = settingsWindow.getByRole('checkbox', { name: '启用 Google Chrome' })
  await expect(chromeToggle).toBeChecked()
  await chromeToggle.click()
  await expect(chromeToggle).not.toBeChecked()
})

test('refreshes the application index from the templates page', async () => {
  const launcher = await showLauncher()
  await launcher.getByRole('combobox').fill('setting')
  const settingsPage = await openSettingsWith(() => launcher.getByRole('combobox').press('Enter'))

  await settingsPage.getByRole('button', { name: '软件模板' }).click()
  const refreshButton = settingsPage.getByRole('button', { name: '刷新应用索引' })
  await expect(refreshButton).toBeEnabled()
  const beforeSnapshotVersion = await settingsPage.evaluate(async () => (await window.launcher?.getCatalog?.())?.snapshotVersion ?? 0)

  await refreshButton.click()

  await expect.poll(async () => settingsPage.evaluate(async () => (await window.launcher?.getCatalog?.())?.snapshotVersion ?? 0)).toBeGreaterThan(beforeSnapshotVersion)
  await expect(refreshButton).toBeEnabled()
})

test('opens a command package from the file association entry point', async () => {
  const packagePath = join(userDataDirectory, 'team.quickcmd.json')
  await writeFile(packagePath, JSON.stringify({
    schemaVersion: 1,
    packageId: 'team.shortcuts',
    name: '团队快捷入口',
    version: '1.0.0',
    apps: [],
    commands: [{ id: 'docs', keyword: 'docs', type: 'open_url', url: 'https://example.com/docs' }],
  }))

  const settingsWindow = await openSettingsWith(() => electronApp.evaluate(({ app }, path) => {
    app.emit('open-file', { preventDefault: () => undefined }, path)
  }, packagePath))

  await expect(settingsWindow.getByRole('heading', { name: '团队快捷入口' })).toBeVisible()
  await expect(settingsWindow.getByText('包含 1 条命令')).toBeVisible()
  await writeFile(packagePath, JSON.stringify({
    schemaVersion: 1,
    packageId: 'team.shortcuts',
    name: '被替换的命令包',
    version: '1.0.0',
    apps: [],
    commands: [{ id: 'other', keyword: 'other', type: 'open_url', url: 'https://example.com/other' }],
  }))
  await settingsWindow.getByRole('button', { name: '确认导入' }).click()
  await expect(settingsWindow.getByText('命令包文件在预览后发生变化，请重新选择并预览。')).toBeVisible()
})

test('opens a command package passed to a cold-start process', async () => {
  const packagePath = join(userDataDirectory, 'cold-start.quickcmd.json')
  await writeFile(packagePath, JSON.stringify({
    schemaVersion: 1,
    packageId: 'cold-start.shortcuts',
    name: '冷启动命令包',
    version: '1.0.0',
    apps: [],
    commands: [{ id: 'cold-start-docs', keyword: 'cold-start', type: 'open_url', url: 'https://example.com/cold-start' }],
  }))

  await electronApp.close()
  electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, resolve('out/main/index.js'), packagePath],
    env: { ...process.env, QUICK_LAUNCHER_E2E: '1' },
  })
  await electronApp.firstWindow()
  await expect.poll(async () => Boolean(await settingsWindow())).toBe(true)
  const settingsPage = await settingsWindow()
  if (!settingsPage) throw new Error('Cold-start settings window was not created')

  await expect(settingsPage.getByRole('heading', { name: '冷启动命令包' })).toBeVisible()
  await expect(settingsPage.getByText('包含 1 条命令')).toBeVisible()
})

test('restores an imported command after restarting the desktop process', async () => {
  const packagePath = join(userDataDirectory, 'restart.quickcmd.json')
  await writeFile(packagePath, JSON.stringify({
    schemaVersion: 1,
    packageId: 'restart.shortcuts',
    name: '重启验证命令',
    version: '1.0.0',
    apps: [],
    commands: [{ id: 'restart-docs', keyword: 'restart-docs', type: 'open_url', url: 'https://example.com/restarted' }],
  }))

  const settingsWindow = await openSettingsWith(() => electronApp.evaluate(({ app }, path) => {
    app.emit('open-file', { preventDefault: () => undefined }, path)
  }, packagePath))
  await expect(settingsWindow.getByRole('heading', { name: '重启验证命令' })).toBeVisible()
  await settingsWindow.getByRole('button', { name: '确认导入' }).click()
  await expect(settingsWindow.getByText('重启验证命令 · restart-docs')).toBeVisible()

  await electronApp.close()
  electronApp = await electron.launch({
    args: [`--user-data-dir=${userDataDirectory}`, resolve('out/main/index.js')],
    env: { ...process.env, QUICK_LAUNCHER_E2E: '1' },
  })
  const restartedLauncher = await launcherWindow()
  await restartedLauncher.evaluate(async () => {
    await window.launcher?.refreshApplications?.()
  })
  await restartedLauncher.getByRole('combobox').fill('restart-docs')
  await expect(restartedLauncher.getByRole('option', { name: /重启验证命令/ })).toBeVisible()
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

test('keeps the macOS native window fitted to the launcher panel', async () => {
  test.skip(process.platform !== 'darwin')
  const launcher = await showLauncher()
  const panel = launcher.getByRole('main')
  const measuredWindowHeight = async (): Promise<number> => {
    const panelHeight = await panel.evaluate((element) => element.getBoundingClientRect().height)
    return Math.ceil(panelHeight + 20)
  }
  const nativeWindow = (): Promise<{ height: number; hasShadow: boolean }> => electronApp.evaluate(({ BrowserWindow }) => {
    const searchWindow = BrowserWindow.getAllWindows().find((candidate) => new URL(candidate.webContents.getURL()).searchParams.get('window') !== 'settings')
    return { height: searchWindow?.getBounds().height ?? 0, hasShadow: searchWindow?.hasShadow() ?? true }
  })
  const nativeWindowHeight = async (): Promise<number> => (await nativeWindow()).height

  await expect.poll(nativeWindowHeight).toBe(await measuredWindowHeight())
  const emptyHeight = await nativeWindowHeight()
  expect((await nativeWindow()).hasShadow).toBe(false)

  await launcher.getByRole('combobox').fill('quick-launcher-no-local-match')
  await expect(launcher.getByRole('listbox')).toBeVisible()
  await expect.poll(nativeWindowHeight).toBe(await measuredWindowHeight())
  expect(await nativeWindowHeight()).toBeGreaterThan(emptyHeight)
})

test('hydrates real macOS application icons before publishing the final catalog', async () => {
  test.skip(process.platform !== 'darwin')
  const launcher = await showLauncher()
  const iconSummary = async (): Promise<{ applications: number; icons: number }> => launcher.evaluate(async () => {
    const catalog = await window.launcher?.getCatalog?.()
    const applications = catalog?.items.filter((item) => item.kind === 'application') ?? []
    return {
      applications: applications.length,
      icons: applications.filter((item) => item.iconData?.startsWith('data:image/') === true).length,
    }
  })

  await expect.poll(async () => (await iconSummary()).applications).toBeGreaterThan(0)
  await expect.poll(async () => {
    const summary = await iconSummary()
    return summary.applications > 0 && summary.icons === summary.applications
  }, { timeout: 30_000 }).toBe(true)
})
