import { describe, expect, it } from 'vitest'
import {
  createDefaultPortraitSlots,
  insertPortraitSlot,
  legacyPortraitsToSlots,
  parsePortraitSlots,
  removePortraitSlot,
  resolvePortraitSlot,
} from './portrait-slots'

describe('好感度区间立绘槽位', () => {
  it('新角色只创建一个覆盖 0—100 的立绘槽位', () => {
    expect(createDefaultPortraitSlots()).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '' },
    ])
  })

  it('新增 70—100 时把原 0—100 自动收缩为 0—69', () => {
    expect(insertPortraitSlot(createDefaultPortraitSlots('/portraits/base.webp'), {
      id: 'portrait-70-100', minAffinity: 70, maxAffinity: 100, source: '',
    })).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 69, source: '/portraits/base.webp' },
      { id: 'portrait-70-100', minAffinity: 70, maxAffinity: 100, source: '' },
    ])
  })

  it('在旧槽中间新增区间时分裂两侧并继承原图', () => {
    expect(insertPortraitSlot(createDefaultPortraitSlots('/portraits/base.webp'), {
      id: 'portrait-40-60', minAffinity: 40, maxAffinity: 60, source: '',
    })).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 39, source: '/portraits/base.webp' },
      { id: 'portrait-40-60', minAffinity: 40, maxAffinity: 60, source: '' },
      { id: 'portrait-0-100-right-61', minAffinity: 61, maxAffinity: 100, source: '/portraits/base.webp' },
    ])
  })

  it('跨越多个槽位新增区间时删除完整覆盖项并裁剪两端', () => {
    const slots = [
      { id: 'low', minAffinity: 0, maxAffinity: 29, source: '/low.webp' },
      { id: 'middle', minAffinity: 30, maxAffinity: 69, source: '/middle.webp' },
      { id: 'high', minAffinity: 70, maxAffinity: 100, source: '/high.webp' },
    ]
    expect(insertPortraitSlot(slots, { id: 'override', minAffinity: 20, maxAffinity: 80, source: '' })).toEqual([
      { id: 'low', minAffinity: 0, maxAffinity: 19, source: '/low.webp' },
      { id: 'override', minAffinity: 20, maxAffinity: 80, source: '' },
      { id: 'high-right-81', minAffinity: 81, maxAffinity: 100, source: '/high.webp' },
    ])
  })

  it('删除自定义槽位时由相邻槽位接管范围且不能删除唯一槽位', () => {
    const slots = insertPortraitSlot(createDefaultPortraitSlots('/base.webp'), {
      id: 'high', minAffinity: 70, maxAffinity: 100, source: '/high.webp',
    })
    expect(removePortraitSlot(slots, 'high')).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '/base.webp' },
    ])
    expect(() => removePortraitSlot(createDefaultPortraitSlots(), 'portrait-0-100')).toThrow(/唯一/)
  })

  it('按闭区间选择立绘并将范围外好感夹在 0—100', () => {
    const slots = [
      { id: 'low', minAffinity: 0, maxAffinity: 69, source: '/low.webp' },
      { id: 'high', minAffinity: 70, maxAffinity: 100, source: '/high.webp' },
    ]
    expect(resolvePortraitSlot(slots, -5)?.id).toBe('low')
    expect(resolvePortraitSlot(slots, 69)?.id).toBe('low')
    expect(resolvePortraitSlot(slots, 70)?.id).toBe('high')
    expect(resolvePortraitSlot(slots, 150)?.id).toBe('high')
  })

  it('拒绝反向、重叠、留空洞和不安全来源的区间', () => {
    expect(() => insertPortraitSlot(createDefaultPortraitSlots(), {
      id: 'bad', minAffinity: 70, maxAffinity: 40, source: '',
    })).toThrow(/起始/)
    expect(() => parsePortraitSlots([
      { id: 'one', minAffinity: 0, maxAffinity: 60, source: '' },
      { id: 'two', minAffinity: 60, maxAffinity: 100, source: '' },
    ])).toThrow(/重叠/)
    expect(() => parsePortraitSlots([
      { id: 'one', minAffinity: 0, maxAffinity: 59, source: '' },
      { id: 'two', minAffinity: 61, maxAffinity: 100, source: '' },
    ])).toThrow(/连续/)
    expect(() => parsePortraitSlots([
      { id: 'one', minAffinity: 0, maxAffinity: 100, source: 'javascript:alert(1)' },
    ])).toThrow(/图片来源/)
  })

  it('把空或单图五阶段旧数据折叠为一个 0—100 槽位', () => {
    expect(legacyPortraitsToSlots({ stranger: '', acquainted: '', trusted: '', intimate: '', bonded: '' }))
      .toEqual(createDefaultPortraitSlots())
    expect(legacyPortraitsToSlots({ trusted: '/trusted.webp' })).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '/trusted.webp' },
    ])
  })

  it('把多图五阶段旧数据转为连续区间并保留所有图片', () => {
    expect(legacyPortraitsToSlots({
      stranger: '/early.webp', trusted: '/trusted.webp', bonded: '/bonded.webp',
    })).toEqual([
      { id: 'portrait-legacy-stranger', minAffinity: 0, maxAffinity: 44, source: '/early.webp' },
      { id: 'portrait-legacy-trusted', minAffinity: 45, maxAffinity: 99, source: '/trusted.webp' },
      { id: 'portrait-legacy-bonded', minAffinity: 100, maxAffinity: 100, source: '/bonded.webp' },
    ])
  })
})
