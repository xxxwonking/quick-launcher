import { describe, expect, it } from 'vitest'
import { buildIndexedApplicationCatalog } from './indexed-application-catalog'

describe('indexed application catalog', () => {
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

  it('preserves display-name casing and adds known product aliases', () => {
    const catalog = buildIndexedApplicationCatalog([
      { displayName: 'Visual Studio Code.lnk', path: 'C:\\Start\\Visual Studio Code.lnk' },
    ], 1)

    expect(catalog.payload.items[0]).toMatchObject({
      title: 'Visual Studio Code',
      aliases: expect.arrayContaining(['vscode', 'vsc', 'visual studio code']),
    })
  })
})
