import { describe, expect, it } from 'vitest'
import { buildIndexedApplicationCatalog, matchesBaseTemplate, withBaseTemplateIcons } from './indexed-application-catalog'
import type { BaseAppTemplate } from '../shared/base-catalog'

describe('indexed application catalog', () => {
  it.each(['macos', 'windows'] as const)('reuses hydrated %s icons for templates even when their aliases are disabled', (platform) => {
    const apps: BaseAppTemplate[] = [{
      id: 'chrome', displayName: 'Google Chrome', defaultAliases: ['chrome'],
      platforms: { macos: { bundleIds: ['com.google.Chrome'] }, windows: { executables: ['chrome.exe'] } },
    }, { id: 'missing', displayName: 'Missing App', defaultAliases: [], platforms: { macos: { bundleIds: ['test.missing'] } } }]
    const entries = [{
      displayName: 'Google Chrome', path: platform === 'macos' ? '/Applications/Chrome.app' : 'C:/Chrome/chrome.exe',
      metadata: { platform, bundleId: 'com.google.Chrome', executableName: 'chrome.exe' },
    }]
    const indexed = buildIndexedApplicationCatalog(entries, 1, [])
    const iconData = 'data:image/png;base64,Y2hyb21l'
    const hydrated = { ...indexed.payload, items: indexed.payload.items.map((item) => ({ ...item, iconData })) }
    const templates = withBaseTemplateIcons(apps, entries, hydrated)
    expect(templates[0]?.iconData).toBe(iconData)
    expect(templates[1]).not.toHaveProperty('iconData')
    expect(JSON.stringify(templates)).not.toContain(entries[0]!.path)
    expect(withBaseTemplateIcons(apps, [], { snapshotVersion: 2, items: [] })[0]).not.toHaveProperty('iconData')
  })

  it('creates opaque launch actions and keeps shortcut paths in the main process', () => {
    const catalog = buildIndexedApplicationCatalog([
      { displayName: 'Cursor.lnk', path: 'C:\\Users\\me\\Desktop\\Cursor.lnk' },
    ], 4)

    expect(catalog.payload).toMatchObject({
      snapshotVersion: 4,
      items: [expect.objectContaining({
        title: 'Cursor',
        aliases: expect.arrayContaining(['cursor']),
        action: { type: 'launch-indexed', targetId: expect.stringMatching(/^shortcut:/u) },
      })],
    })
    const targetId = catalog.payload.items[0]?.action.type === 'launch-indexed' ? catalog.payload.items[0].action.targetId : ''
    expect(catalog.targets.get(targetId)).toBe('C:\\Users\\me\\Desktop\\Cursor.lnk')
    expect(JSON.stringify(catalog.payload)).not.toContain('C:\\Users')
  })

  it('precomputes Chinese full pinyin and initials and removes duplicate display names', () => {
    const catalog = buildIndexedApplicationCatalog([
      { displayName: '夸克网盘.lnk', path: 'D:\\Start\\夸克网盘.lnk' },
      { displayName: '夸克网盘.lnk', path: 'C:\\Start\\夸克网盘.lnk' },
    ], 1)

    expect(catalog.payload.items).toHaveLength(1)
    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['kuakewangpan', 'kkwp']))
    expect([...catalog.targets.values()]).toEqual(['C:\\Start\\夸克网盘.lnk'])
  })

  it('preserves display-name casing and adds enabled template aliases', () => {
    const catalog = buildIndexedApplicationCatalog([
      { displayName: 'Visual Studio Code.lnk', path: 'C:\\Start\\Visual Studio Code.lnk' },
    ], 1, [{ id: 'vscode', displayName: 'Visual Studio Code', defaultAliases: ['vscode', 'vsc', 'code'], platforms: { windows: { executables: ['Code.exe'] } } }])

    expect(catalog.payload.items[0]).toMatchObject({
      title: 'Visual Studio Code',
      aliases: expect.arrayContaining(['vscode', 'vsc', 'visual studio code']),
    })
  })

  it('removes legacy hardcoded aliases when a template is disabled or fails identity matching', () => {
    const entry = { displayName: 'Visual Studio Code', path: '/Applications/Code.app', metadata: { platform: 'macos' as const, bundleId: 'another.app' } }
    const template: BaseAppTemplate = { id: 'vscode', displayName: 'Visual Studio Code', defaultAliases: ['vscode', 'vsc', 'code'], platforms: { macos: { bundleIds: ['com.microsoft.VSCode'] } } }
    for (const templates of [[], [template]]) {
      const app = buildIndexedApplicationCatalog([entry], 1, templates).payload.items[0]!
      expect(app.title).toBe('Visual Studio Code')
      expect(app.aliases).toContain('visual studio code')
      expect(app.aliases).not.toContain('vscode')
      expect(app.aliases).not.toContain('vsc')
      expect(app.aliases).not.toContain('code')
    }
  })

  it('adds aliases from the shared base catalog without exposing platform metadata', () => {
    const baseApps: BaseAppTemplate[] = [{
      id: 'chrome',
      displayName: 'Google Chrome',
      defaultAliases: ['chrome', 'googlechrome'],
      platforms: { macos: { bundleIds: ['com.google.Chrome'] } },
    }]
    const catalog = buildIndexedApplicationCatalog([
      { displayName: 'Google Chrome', path: '/Applications/Google Chrome.app' },
    ], 2, baseApps)

    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['chrome', 'googlechrome']))
    expect(JSON.stringify(catalog.payload)).not.toContain('com.google.Chrome')
    expect(catalog.templateTargets.get('chrome')).toBe(catalog.payload.items[0]?.action.type === 'launch-indexed' ? catalog.payload.items[0].action.targetId : undefined)
  })

  it('matches a base template by macOS bundle id when the display name differs', () => {
    const baseApps: BaseAppTemplate[] = [{
      id: 'chrome',
      displayName: 'Google Chrome',
      defaultAliases: ['chrome', 'googlechrome'],
      platforms: { macos: { bundleIds: ['com.google.Chrome'] } },
    }]
    const catalog = buildIndexedApplicationCatalog([
      {
        displayName: '浏览器',
        path: '/Applications/Browser.app',
        metadata: { platform: 'macos', bundleId: 'com.google.Chrome' },
      },
    ], 3, baseApps)

    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['chrome', 'googlechrome']))
  })

  it('adds the template display name as an alias when the system title is localized differently', () => {
    const baseApps: BaseAppTemplate[] = [{
      id: 'activity-monitor',
      displayName: '活动监视器',
      defaultAliases: ['activitymonitor'],
      platforms: { macos: { bundleIds: ['com.apple.ActivityMonitor'] } },
    }]
    const catalog = buildIndexedApplicationCatalog([
      {
        displayName: 'Activity Monitor',
        path: '/System/Applications/Utilities/Activity Monitor.app',
        metadata: { platform: 'macos', bundleId: 'com.apple.ActivityMonitor' },
      },
    ], 4, baseApps)

    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['activitymonitor', '活动监视器']))
  })

  it('matches a base template by Windows executable name when the display name differs', () => {
    const baseApps: BaseAppTemplate[] = [{
      id: 'chrome',
      displayName: 'Google Chrome',
      defaultAliases: ['chrome'],
      platforms: { windows: { executables: ['chrome.exe'] } },
    }]
    const catalog = buildIndexedApplicationCatalog([
      {
        displayName: '浏览器快捷方式',
        path: 'C:\\Start\\Browser.lnk',
        metadata: { platform: 'windows', executableName: 'chrome.exe', publisher: 'Google LLC' },
      },
    ], 4, baseApps)

    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['chrome']))
  })

  it('does not bind a generic Windows executable without a publisher when the name differs', () => {
    const app: BaseAppTemplate = {
      id: 'chrome',
      displayName: 'Google Chrome',
      defaultAliases: ['chrome'],
      platforms: { windows: { executables: ['chrome.exe'], publishers: ['Google LLC'] } },
    }

    expect(matchesBaseTemplate('浏览器快捷方式', { platform: 'windows', executableName: 'chrome.exe' }, app)).toBe(false)
    expect(matchesBaseTemplate('浏览器快捷方式', { platform: 'windows', executableName: 'chrome.exe', publisher: 'Google LLC' }, app)).toBe(true)
    expect(matchesBaseTemplate('浏览器快捷方式', { platform: 'windows', executableName: 'chrome.exe', publisher: 'Unknown' }, app)).toBe(false)
  })

  it('requires a declared publisher when a Windows template uses publisher disambiguation', () => {
    const app: BaseAppTemplate = {
      id: 'wechat',
      displayName: '微信',
      defaultAliases: ['wechat'],
      platforms: { windows: { executables: ['WeChat.exe'], publishers: ['Tencent'] } },
    }

    expect(matchesBaseTemplate('聊天快捷方式', { platform: 'windows', executableName: 'WeChat.exe' }, app)).toBe(false)
  })

  it('does not fall back from a mismatched Windows AppUserModelID to weaker signals', () => {
    const app: BaseAppTemplate = {
      id: 'photos',
      displayName: 'Photos',
      defaultAliases: ['photos'],
      platforms: { windows: {
        executables: ['Photos.exe'],
        publishers: ['Microsoft Corporation'],
        appUserModelIds: ['Microsoft.Windows.Photos_8wekyb3d8bbwe!App'],
      } },
    }

    expect(matchesBaseTemplate('照片快捷方式', {
      platform: 'windows',
      executableName: 'Photos.exe',
      publisher: 'Microsoft Corporation',
      appUserModelId: 'Contoso.Photos_123!App',
    }, app)).toBe(false)
  })

  it('does not apply a macOS-only template to a Windows entry with the same title', () => {
    const app: BaseAppTemplate = {
      id: 'notes',
      displayName: 'Notes',
      defaultAliases: ['notes'],
      platforms: { macos: { bundleIds: ['com.example.notes'] } },
    }

    expect(matchesBaseTemplate('Notes', { platform: 'windows', executableName: 'Notes.exe' }, app)).toBe(false)
  })

  it('accepts a matching Windows AppUserModelID even when the shortcut target is generic', () => {
    const app: BaseAppTemplate = {
      id: 'photos',
      displayName: 'Photos',
      defaultAliases: ['photos'],
      platforms: { windows: { appUserModelIds: ['Microsoft.Windows.Photos_8wekyb3d8bbwe!App'] } },
    }

    expect(matchesBaseTemplate('照片快捷方式', {
      platform: 'windows',
      executableName: 'explorer.exe',
      appUserModelId: 'microsoft.windows.photos_8wekyb3d8bbwe!app',
    }, app)).toBe(true)
  })

  it('does not match a Windows Store template when its AppUserModelID is missing', () => {
    const app: BaseAppTemplate = {
      id: 'photos',
      displayName: 'Photos',
      defaultAliases: ['photos'],
      platforms: { windows: { appUserModelIds: ['Microsoft.Windows.Photos_8wekyb3d8bbwe!App'] } },
    }

    expect(matchesBaseTemplate('Photos', { platform: 'windows' }, app)).toBe(false)
  })

  it('maps a manually bound package app even when the scanned metadata cannot identify it', () => {
    const packageApp: BaseAppTemplate = {
      id: 'package:team.shortcuts/editor',
      displayName: '团队编辑器',
      defaultAliases: ['editor'],
      platforms: { windows: { executables: ['editor.exe'], publishers: ['Contoso'], appUserModelIds: ['Team.Editor_123!App'] } },
    }
    const catalog = buildIndexedApplicationCatalog([], 5, [packageApp], {
      'package:team.shortcuts/editor': {
        platform: 'windows',
        kind: 'windows-executable',
        path: 'C:\\Apps\\editor.exe',
      },
    })

    expect(catalog.templateTargets.get('package:team.shortcuts/editor')).toMatch(/^shortcut:/u)
    expect([...catalog.targets.values()]).toEqual(['C:\\Apps\\editor.exe'])
    expect(catalog.payload.items[0]?.aliases).toEqual(expect.arrayContaining(['editor']))
  })
})
