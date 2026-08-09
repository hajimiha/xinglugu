import { describe, expect, it } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import { createContentPack, parseContentPack } from './content-pack'
import repositoryContentPack from '../../public/content/mistvale-content-pack.json'

describe('仓库酒馆内容包', () => {
  it('导出世界书、预设、角色卡与可发布版本号', () => {
    const defaults = createMistvaleDefaults()
    const pack = createContentPack({
      contentVersion: '2026.08.08.2',
      lorebooks: defaults.lorebooks,
      presets: defaults.presets,
      characters: defaults.characters,
    })

    expect(pack).toMatchObject({ schemaVersion: 1, contentVersion: '2026.08.08.2' })
    expect(pack.lorebooks).toHaveLength(4)
    expect(pack.lorebooks.map((book) => book.id)).toContain('mistvale-calendar-festivals')
    expect(pack.presets).toHaveLength(1)
    expect(pack.characters).toHaveLength(21)
  })

  it('拒绝缺少版本号或包含非图像立绘的仓库包', () => {
    expect(() => parseContentPack({ schemaVersion: 1, contentVersion: '', lorebooks: [], presets: [], characters: [] })).toThrow(/版本/)
    const defaults = createMistvaleDefaults()
    const { portraitSlots: _slots, ...legacyCharacter } = defaults.characters[0]
    expect(() => createContentPack({
      contentVersion: 'bad-portrait',
      lorebooks: [],
      presets: [],
      characters: [{ ...legacyCharacter, portraitByAffinity: { stranger: 'javascript:alert(1)' } } as never],
    })).toThrow(/角色卡|立绘/)
  })

  it('允许单张内嵌立绘超过 512 KB，只按整包发布预算校验', () => {
    const defaults = createMistvaleDefaults()
    const largePortrait = `data:image/webp;base64,${'A'.repeat(800_000)}`

    expect(() => createContentPack({
      contentVersion: 'large-portrait',
      lorebooks: [],
      presets: [],
      characters: [{ ...defaults.characters[0], portraitSlots: [{ id: 'large', minAffinity: 0, maxAffinity: 100, source: largePortrait }] }],
    })).not.toThrow()
  })

  it('仍拒绝超过 12 MB 发布预算的整包内嵌立绘', () => {
    const defaults = createMistvaleDefaults()
    const oversizedPortrait = `data:image/png;base64,${'A'.repeat(13 * 1024 * 1024)}`

    expect(() => createContentPack({
      contentVersion: 'oversized-pack',
      lorebooks: [],
      presets: [],
      characters: [{ ...defaults.characters[0], portraitSlots: [{ id: 'oversized', minAffinity: 0, maxAffinity: 100, source: oversizedPortrait }] }],
    })).toThrow(/12 MB/)
  })

  it('拒绝会污染所有客户端的畸形世界书、预设与角色卡', () => {
    const base = { schemaVersion: 1, contentVersion: 'bad-shape', exportedAt: new Date().toISOString() }
    expect(() => parseContentPack({ ...base, lorebooks: [null], presets: [], characters: [] })).toThrow(/世界书/)
    expect(() => parseContentPack({ ...base, lorebooks: [], presets: [{ id: 'bad', name: {}, settings: {} }], characters: [] })).toThrow(/预设/)
    expect(() => parseContentPack({ ...base, lorebooks: [], presets: [], characters: [{ id: 'bad', portraitByAffinity: {} }] })).toThrow(/角色卡/)
  })

  it('导入旧五阶段角色卡时转为连续区间并只导出新结构', () => {
    const defaults = createMistvaleDefaults()
    const { portraitSlots: _slots, ...legacyCharacter } = defaults.characters[0]
    const pack = createContentPack({
      contentVersion: 'legacy-portrait-migration',
      lorebooks: [],
      presets: [],
      characters: [{
        ...legacyCharacter,
        portraitByAffinity: { stranger: '/early.webp', trusted: '/trusted.webp', bonded: '/bonded.webp' },
      } as never],
    })

    expect(pack.characters[0].portraitSlots).toEqual([
      { id: 'portrait-legacy-stranger', minAffinity: 0, maxAffinity: 44, source: '/early.webp' },
      { id: 'portrait-legacy-trusted', minAffinity: 45, maxAffinity: 99, source: '/trusted.webp' },
      { id: 'portrait-legacy-bonded', minAffinity: 100, maxAffinity: 100, source: '/bonded.webp' },
    ])
    expect(pack.characters[0]).not.toHaveProperty('portraitByAffinity')
  })

  it('拒绝重叠或留空洞的新版立绘槽位', () => {
    const defaults = createMistvaleDefaults()
    expect(() => createContentPack({
      contentVersion: 'overlapping-slots', lorebooks: [], presets: [],
      characters: [{ ...defaults.characters[0], portraitSlots: [
        { id: 'one', minAffinity: 0, maxAffinity: 70, source: '' },
        { id: 'two', minAffinity: 70, maxAffinity: 100, source: '' },
      ] }],
    })).toThrow(/立绘区间|角色卡/)
  })

  it('允许发布带角色槽位分组的 SillyTavern 官方预设', () => {
    const defaults = createMistvaleDefaults()
    const groupedPreset = {
      ...defaults.presets[0],
      settings: {
        prompts: [{ identifier: 'main', name: '主提示词', role: 'system', content: '正文' }],
        prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
      },
    }
    const pack = createContentPack({ contentVersion: 'grouped-preset', lorebooks: [], presets: [groupedPreset], characters: [] })
    expect(pack.presets[0].settings.prompt_order).toEqual(groupedPreset.settings.prompt_order)
  })

  it('仓库内置内容包可解析并发布六位共生伙伴', () => {
    const pack = parseContentPack(repositoryContentPack)
    expect(pack.lorebooks.map((book) => book.id)).toContain('mistvale-production-partners')
    expect(pack.characters).toHaveLength(6)
    expect(pack.characters.every((card) => card.tags.includes('共生伙伴'))).toBe(true)
  })
})
