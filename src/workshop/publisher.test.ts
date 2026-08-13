import { describe, expect, it, vi } from 'vitest'
import type { CharacterCard, ChatPreset, Lorebook } from '../sillytavern/types'
import { buildWorkshopPackage, stampWorkshopPackageDates } from './publisher'

const lorebook: Lorebook = { id: 'book', name: '森林志', entries: [], recursiveScanning: false, caseSensitive: false, matchWholeWords: false, createdAt: 1, updatedAt: 1 }
const preset: ChatPreset = { id: 'preset', name: '叙事预设', settings: {}, createdAt: 1, updatedAt: 1 }
const character: CharacterCard = { id: 'cow', npcId: 'cow-girl', name: '牛奶娘', role: '伙伴', locationId: 'ranch', description: '', personality: '', scenario: '', firstMessage: '', exampleDialogue: '', lorebookIds: [], portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: '/assets/cow.webp' }], tags: [], createdAt: 1, updatedAt: 1 }
const meta = { title: '森林故事资源', description: '可供所有玩家安装的完整森林叙事资源。', version: '1.0.0', tags: ['剧情'] }

describe('创意工坊发布包构建器', () => {
  it('只打包选中的世界书或预设，不携带会话与密钥', async () => {
    const bookPackage = await buildWorkshopPackage({ ...meta, kind: 'lorebook', resourceIds: ['book'] }, { lorebooks: [lorebook], presets: [preset], characters: [] })
    expect(bookPackage.kind).toBe('lorebook')
    expect(JSON.stringify(bookPackage)).not.toMatch(/apiKey|sessions|chatHistory/)
  })

  it('把本地立绘地址内嵌为可跨设备安装的图片数据', async () => {
    const fetcher = vi.fn(async () => new Response(new Uint8Array([82, 73, 70, 70]), { headers: { 'Content-Type': 'image/webp' } }))
    const result = await buildWorkshopPackage({ ...meta, kind: 'portrait-pack', resourceIds: ['cow-girl'] }, { lorebooks: [], presets: [], characters: [character] }, fetcher)
    expect(result.kind).toBe('portrait-pack')
    if (result.kind === 'portrait-pack') expect(result.payload.characters[0]?.portraitSlots[0]?.source).toMatch(/^data:image\/webp;base64,/)
    expect(fetcher).toHaveBeenCalledWith('/assets/cow.webp', expect.objectContaining({ credentials: 'same-origin' }))
  })

  it('也会抓取 HTTPS 立绘而不是把玩家私有远端地址公开出去', async () => {
    const remote = { ...character, portraitSlots: [{ ...character.portraitSlots[0], source: 'https://private.example/portrait.png?signature=secret' }] }
    const fetcher = vi.fn(async () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } }))
    const result = await buildWorkshopPackage({ ...meta, kind: 'portrait-pack', resourceIds: ['cow-girl'] }, { lorebooks: [], presets: [], characters: [remote] }, fetcher)
    expect(result.kind).toBe('portrait-pack')
    if (result.kind === 'portrait-pack') expect(result.payload.characters[0]?.portraitSlots[0]?.source).toMatch(/^data:image\/png;base64,/)
    expect(fetcher).toHaveBeenCalledWith(remote.portraitSlots[0].source, expect.objectContaining({ credentials: 'omit' }))
  })

  it('由服务端覆盖发布时间，更新时保留首次创建时间', () => {
    const forged = { schemaVersion: 1 as const, ...meta, tags: meta.tags, kind: 'preset' as const, createdAt: '2099-01-01T00:00:00.000Z', updatedAt: '2099-01-01T00:00:00.000Z', payload: { preset } }
    const stamped = stampWorkshopPackageDates(forged, '2026-08-01T00:00:00.000Z', '2026-08-13T10:00:00.000Z')
    expect(stamped.createdAt).toBe('2026-08-01T00:00:00.000Z')
    expect(stamped.updatedAt).toBe('2026-08-13T10:00:00.000Z')
  })
})
