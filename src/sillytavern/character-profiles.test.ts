import { describe, expect, it } from 'vitest'
import { CHARACTER_PROFILES, formatCharacterProfileForLorebook, getCharacterProfile } from './character-profiles'
import { createMistvaleDefaults } from './defaults'

const EXCLUSIVE_TEXT_FIELDS = ['age', 'appearance', 'style', 'signature', 'background', 'interaction'] as const

describe('角色人物表格', () => {
  it('覆盖酒馆中的全部二十一位角色，并且每一项都填写完整', () => {
    const defaults = createMistvaleDefaults()

    expect(CHARACTER_PROFILES).toHaveLength(21)
    expect(CHARACTER_PROFILES.map((profile) => profile.npcId).sort()).toEqual(
      defaults.characters.map((card) => card.npcId).sort(),
    )
    for (const profile of CHARACTER_PROFILES) {
      expect(profile.name.trim(), `${profile.npcId} 缺少姓名`).not.toBe('')
      expect(profile.identity.trim(), `${profile.npcId} 缺少身份`).not.toBe('')
      expect(profile.relation, `${profile.npcId} 关系未使用 {{user}}`).toContain('{{user}}')
      expect(profile.appearance.trim(), `${profile.npcId} 缺少外貌`).not.toBe('')
      expect(profile.style.trim(), `${profile.npcId} 缺少穿衣风格`).not.toBe('')
      expect(profile.signature.trim(), `${profile.npcId} 缺少标志性细节`).not.toBe('')
      expect(profile.background.trim(), `${profile.npcId} 缺少背景`).not.toBe('')
      expect(profile.interaction.trim(), `${profile.npcId} 缺少互动方式`).not.toBe('')
      expect(profile.background, `${profile.npcId} 背景过于沉重`).not.toMatch(/战死|去世|失去|流亡|孤儿|灭门|复仇|背叛/)
    }
  })

  it('拒绝特征同质化：年龄与各文本字段全局唯一', () => {
    for (const field of EXCLUSIVE_TEXT_FIELDS) {
      const values = CHARACTER_PROFILES.map((profile) => profile[field])
      expect(new Set(values).size, `${field} 存在重复内容`).toBe(values.length)
    }
  })

  it('格式化为可以注入世界书条目的紧凑人物速写', () => {
    const loran = getCharacterProfile('loran')
    const dragon = getCharacterProfile('dragon-girl')

    expect(loran?.name).toBe('洛岚')
    expect(dragon?.name).toBe('龙娘')
    expect(formatCharacterProfileForLorebook(loran!)).toContain('人物速写：洛岚，34，女，村长')
    expect(formatCharacterProfileForLorebook(loran!)).toContain('黄铜叶脉书签')
    expect(formatCharacterProfileForLorebook(dragon!)).toContain('矿脉守望者')
  })

  it('人物表格已应用到对应世界书条目', () => {
    const defaults = createMistvaleDefaults()
    const book = defaults.lorebooks[0]

    expect(book.entries.find((entry) => entry.id === 'mistvale-person-loran')?.content).toContain('黄铜叶脉书签')
    expect(book.entries.find((entry) => entry.id === 'mistvale-person-sujin')?.content).toContain('热敷草包')
    expect(book.entries.find((entry) => entry.id === 'mistvale-partner-cow')?.content).toContain('金色牛铃')
    expect(book.entries.find((entry) => entry.id === 'mistvale-partner-dragon')?.content).toContain('数矿脉')
  })
})
