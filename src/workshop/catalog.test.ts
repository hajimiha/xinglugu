import { describe, expect, it } from 'vitest'
import { foldWorkshopCatalog, sortWorkshopItems, type WorkshopCatalogEvent } from './catalog'

const item = {
  packageId: 'gist-a', kind: 'lorebook' as const, title: '林间传说', description: '一册森林主题世界书。',
  version: '1.0.0', tags: ['森林'], author: { publisherId: 'publisher-alice', login: 'alice', avatarUrl: 'https://example.com/a.png' },
  createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z', revision: 1,
  gistVersion: 'version-a', stats: { entryCount: 4, bytes: 1200 },
}

const event = (patch: Partial<WorkshopCatalogEvent> = {}): WorkshopCatalogEvent => ({
  schemaVersion: 1, eventId: crypto.randomUUID(), action: 'publish', actorKey: 'publisher-alice', actor: 'alice', packageId: 'gist-a',
  occurredAt: '2026-08-10T00:00:00.000Z', revision: 1, item, ...patch,
} as WorkshopCatalogEvent)

describe('创意工坊目录事件', () => {
  it('只允许作者更新和撤回，并拒绝过期修订', () => {
    const catalog = foldWorkshopCatalog([
      event(),
      event({ action: 'update', actorKey: 'publisher-mallory', actor: 'mallory', revision: 2, expectedRevision: 1, item: { ...item, revision: 2, title: '伪造更新' } }),
      event({ action: 'update', revision: 2, expectedRevision: 0, item: { ...item, revision: 2, title: '过期更新' } }),
      event({ action: 'update', revision: 2, expectedRevision: 1, item: { ...item, revision: 2, title: '林间传说·修订版' } }),
      event({ action: 'withdraw', actorKey: 'publisher-mallory', actor: 'mallory', revision: 3, expectedRevision: 2, item: undefined }),
    ])
    expect(catalog.items).toHaveLength(1)
    expect(catalog.items[0]).toMatchObject({ title: '林间传说·修订版', revision: 2 })
    expect(catalog.rejected).toHaveLength(3)

    const withdrawn = foldWorkshopCatalog([...catalog.accepted, event({ action: 'withdraw', revision: 3, expectedRevision: 2, item: undefined })])
    expect(withdrawn.items).toHaveLength(0)
  })

  it('作者改名后仍由不可变 GitHub 用户 ID 识别所有权', () => {
    const renamed = foldWorkshopCatalog([
      event(),
      event({ action: 'update', actor: 'alice-renamed', revision: 2, expectedRevision: 1, item: { ...item, author: { ...item.author, login: 'alice-renamed' }, revision: 2, gistVersion: 'version-b' } }),
    ])
    expect(renamed.items[0]).toMatchObject({ revision: 2, gistVersion: 'version-b', author: { publisherId: 'publisher-alice', login: 'alice-renamed' } })
  })

  it('对每个账号的收藏去重并支持四种稳定排序', () => {
    const second = { ...item, packageId: 'gist-b', title: '新预设', kind: 'preset' as const, author: { ...item.author, publisherId: 'publisher-bob', login: 'bob' }, createdAt: '2026-08-12T00:00:00.000Z', updatedAt: '2026-08-12T00:00:00.000Z' }
    const events: WorkshopCatalogEvent[] = [
      event(),
      event({ packageId: 'gist-b', actorKey: 'publisher-bob', actor: 'bob', item: second }),
      event({ action: 'favorite', actorKey: 'publisher-carol', actor: 'carol', packageId: 'gist-a', revision: undefined, item: undefined }),
      event({ action: 'favorite', actorKey: 'publisher-carol', actor: 'carol', packageId: 'gist-a', revision: undefined, item: undefined }),
      event({ action: 'favorite', actorKey: 'publisher-dave', actor: 'dave', packageId: 'gist-a', revision: undefined, item: undefined }),
      event({ action: 'favorite', actorKey: 'publisher-carol', actor: 'carol', packageId: 'gist-b', revision: undefined, item: undefined }),
    ]
    const items = foldWorkshopCatalog(events).items
    expect(items.find((entry) => entry.packageId === 'gist-a')?.favoriteCount).toBe(2)
    expect(sortWorkshopItems(items, 'popular')[0].packageId).toBe('gist-a')
    expect(sortWorkshopItems(items, 'newest')[0].packageId).toBe('gist-b')
    expect(sortWorkshopItems(items, 'updated')[0].packageId).toBe('gist-b')
    expect(sortWorkshopItems(items, 'trending', new Date('2026-08-13T00:00:00.000Z').getTime())[0].packageId).toBe('gist-a')
  })
})
