import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findApplicationIconPath, findApplicationIconPaths, parseMacIconNamesFromXml } from './application-icon-path'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('application icon paths', () => {
  it('finds the icon inside a wrapped application bundle', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'Shadowrocket.app')
    const iconPath = join(applicationPath, 'Wrapper', 'Shadowrocket.app', 'AppIcon60x60@2x.png')
    await mkdir(join(applicationPath, 'Wrapper', 'Shadowrocket.app'), { recursive: true })
    await writeFile(iconPath, 'test icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })

  it('prefers the bundle icns icon over a generic png resource', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'Example.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const iconPath = join(resourcesPath, 'AppIcon.icns')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(join(resourcesPath, 'icon.png'), 'generic icon')
    await writeFile(iconPath, 'bundle icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })

  it('uses an app-declared-style icns file even when it has a custom name', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'QQMiniApp.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const iconPath = join(resourcesPath, 'electron.icns')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(iconPath, 'bundle icon')

    await expect(findApplicationIconPath(applicationPath)).resolves.toBe(iconPath)
  })

  it('keeps multiple icon candidates so a broken first resource can fall back to another one', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'WrappedApp.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const brokenIconPath = join(resourcesPath, 'AppIcon.icns')
    const fallbackIconPath = join(resourcesPath, 'AppIcon60x60@2x.png')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(brokenIconPath, 'broken icon')
    await writeFile(fallbackIconPath, 'fallback icon')

    await expect(findApplicationIconPaths(applicationPath)).resolves.toEqual([brokenIconPath, fallbackIconPath])
  })

  it('prioritizes icon files declared by the nested bundle Info.plist', async () => {
    const directory = await mkdtemp(join('/tmp', 'quick-launcher-icon-'))
    temporaryDirectories.push(directory)
    const applicationPath = join(directory, 'CatalystApp.app')
    const resourcesPath = join(applicationPath, 'Contents', 'Resources')
    const declaredIconPath = join(resourcesPath, 'BrandMark@2x.png')
    const genericIconPath = join(resourcesPath, 'icon.png')
    await mkdir(resourcesPath, { recursive: true })
    await writeFile(join(applicationPath, 'Contents', 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleIcons</key><dict><key>CFBundlePrimaryIcon</key><dict>
<key>CFBundleIconFiles</key><array><string>BrandMark</string></array>
</dict></dict>
</dict></plist>`)
    await writeFile(declaredIconPath, 'declared icon')
    await writeFile(genericIconPath, 'generic icon')

    const infoPlist = await readFile(join(applicationPath, 'Contents', 'Info.plist'), 'utf8')
    expect(parseMacIconNamesFromXml(infoPlist)).toEqual(['BrandMark'])
    await expect(findApplicationIconPaths(applicationPath)).resolves.toEqual([declaredIconPath, genericIconPath])
  })
})
