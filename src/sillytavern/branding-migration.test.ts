import { describe, expect, it } from 'vitest'
import { migrateSystemBranding } from './branding-migration'

describe('默认酒馆内容品牌迁移', () => {
  it('深度替换系统正文，但保持 SillyTavern 原始兼容载荷不变', () => {
    const source = {
      name: '雾灯谷·全域设定集',
      entries: [{ comment: '雾灯谷礼物偏好', content: '欢迎来到雾灯谷。' }],
      compatibility: { raw: { name: '雾灯谷原始导出', nested: ['MISTVALE'] } },
    }

    expect(migrateSystemBranding(source)).toEqual({
      name: '性撸谷·全域设定集',
      entries: [{ comment: '性撸谷礼物偏好', content: '欢迎来到性撸谷。' }],
      compatibility: source.compatibility,
    })
    expect(source.name).toBe('雾灯谷·全域设定集')
  })
})
