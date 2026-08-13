import { describe, expect, it } from 'vitest'
import type { ChatPreset, Lorebook } from '../sillytavern/types'
import { parseWorkshopPackage } from './package-schema'

const lorebook: Lorebook = {
  id: 'local-book',
  name: '林间传说',
  description: '测试世界书',
  entries: [{
    id: 'entry-1', keys: ['森林'], secondaryKeys: [], content: '森林深处住着古老的精灵。',
    order: 100, position: 'after_char', selective: false, selectiveLogic: 'not_all',
    constant: false, probability: 100, addMemo: false,
  }],
  recursiveScanning: false, caseSensitive: false, matchWholeWords: false,
  createdAt: 1, updatedAt: 1,
}

const preset: ChatPreset = {
  id: 'local-preset', name: '细腻叙事', description: '测试预设',
  settings: { main: '以细腻、克制的方式描写当前场景。' }, createdAt: 1, updatedAt: 1,
}

const base = {
  schemaVersion: 1 as const,
  title: '林间传说资料包',
  description: '包含一册可直接用于性撸谷叙事的世界书。',
  version: '1.0.0',
  tags: ['剧情', '森林'],
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
}

describe('创意工坊资源包结构', () => {
  it('接受世界书、预设和连续好感区间立绘组', () => {
    expect(parseWorkshopPackage({ ...base, kind: 'lorebook', payload: { lorebook } }).kind).toBe('lorebook')
    expect(parseWorkshopPackage({ ...base, kind: 'preset', payload: { preset } }).kind).toBe('preset')
    expect(parseWorkshopPackage({
      ...base,
      kind: 'portrait-pack',
      payload: {
        characters: [{
          npcId: 'cow-girl', name: '牛奶娘',
          portraitSlots: [
            { id: 'low', minAffinity: 0, maxAffinity: 69, source: 'data:image/png;base64,aGVsbG8=' },
            { id: 'high', minAffinity: 70, maxAffinity: 100, source: 'data:image/webp;base64,aGVsbG8=' },
          ],
        }],
      },
    }).kind).toBe('portrait-pack')
  })

  it('拒绝仍指向第三方服务器的远端立绘地址', () => {
    expect(() => parseWorkshopPackage({
      ...base, kind: 'portrait-pack', payload: { characters: [{ npcId: 'cow-girl', name: '牛奶娘', portraitSlots: [
        { id: 'all', minAffinity: 0, maxAffinity: 100, source: 'https://private.example/image.png?token=secret' },
      ] }] },
    })).toThrow(/图片来源/)
  })

  it('拒绝不安全图片、重叠区间、越界元数据与私密字段', () => {
    expect(() => parseWorkshopPackage({
      ...base, kind: 'portrait-pack',
      payload: { characters: [{ npcId: 'cow-girl', name: '牛奶娘', portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: 'javascript:alert(1)' }] }] },
    })).toThrow(/图片来源/)
    expect(() => parseWorkshopPackage({
      ...base, kind: 'portrait-pack',
      payload: { characters: [{ npcId: 'cow-girl', name: '牛奶娘', portraitSlots: [
        { id: 'one', minAffinity: 0, maxAffinity: 70, source: '' },
        { id: 'two', minAffinity: 70, maxAffinity: 100, source: '' },
      ] }] },
    })).toThrow(/重叠/)
    expect(() => parseWorkshopPackage({ ...base, title: ' ', kind: 'lorebook', payload: { lorebook } })).toThrow(/标题/)
    expect(() => parseWorkshopPackage({ ...base, tags: Array.from({ length: 9 }, (_, index) => `标签${index}`), kind: 'preset', payload: { preset } })).toThrow(/标签/)
    expect(() => parseWorkshopPackage({ ...base, apiKey: 'secret', kind: 'preset', payload: { preset } })).toThrow(/不允许字段/)
    expect(() => parseWorkshopPackage({ ...base, kind: 'preset', payload: { preset: { ...preset, settings: { provider: { access_token: 'secret' } } } } })).toThrow(/敏感凭据/)
  })

  it('按 UTF-8 字节而非字符串长度执行体积预算', () => {
    const large = { ...base, description: '月'.repeat(80), kind: 'preset', payload: { preset } }
    expect(() => parseWorkshopPackage(large, 220)).toThrow(/大小上限/)
  })
})
