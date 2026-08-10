import { describe, expect, it } from 'vitest'
import { npcs } from '../game/data'
import { DEFAULT_TAGS } from './types'
import { createMistvaleDefaults, DEFAULT_CONTENT_VERSION, PRODUCTION_PARTNERS_ID } from './defaults'

describe('雾灯谷酒馆默认内容', () => {
  it('创建完整且默认等待模型密钥的酒馆种子', () => {
    const defaults = createMistvaleDefaults()
    const comments = defaults.lorebooks.flatMap((book) => book.entries.map((entry) => entry.comment))

    expect(defaults.characters).toHaveLength(21)
    expect(defaults.lorebooks).toHaveLength(4)
    expect(defaults.characters.slice(0, 15).map((card) => card.npcId)).toEqual(npcs.map((npc) => npc.id))
    expect(defaults.characters.every((card) => card.id === `mistvale-character-${card.npcId}`)).toBe(true)
    expect(comments).toEqual(expect.arrayContaining(['五行克制', '每日精力', '地点营业']))
    expect(defaults.settings).not.toHaveProperty('adapterMode')
    expect(defaults.settings.api).toMatchObject({
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      rememberKey: false,
    })
    expect(defaults.settings.api.persistedApiKey).toBeUndefined()
    expect(defaults.settings.customTags).toEqual([...DEFAULT_TAGS])
    expect(defaults.presets[0].settings).not.toHaveProperty('apiKey')
    expect(defaults.presets[0].description).toContain('模型')
    expect(defaults.presets[0].description).not.toContain('本地剧情引擎')
    expect(DEFAULT_CONTENT_VERSION).toBe(6)
  })

  it('把完整鱼类图鉴、通用礼物与每位角色的偏爱写入世界书', () => {
    const defaults = createMistvaleDefaults()
    const worldRules = defaults.lorebooks.find((book) => book.id === 'mistvale-world-rules')
    const villageArchive = defaults.lorebooks.find((book) => book.id === 'mistvale-village-archive')
    const fishingEntry = worldRules?.entries.find((entry) => entry.id === 'mistvale-rule-fishing')
    const affinityEntry = worldRules?.entries.find((entry) => entry.id === 'mistvale-rule-affinity')
    const minaEntry = villageArchive?.entries.find((entry) => entry.id === 'mistvale-person-mina')

    expect(fishingEntry?.content).toContain('银鳞鲫')
    expect(fishingEntry?.content).toContain('雾湾巨鲶')
    expect(affinityEntry?.content).toContain('莓果挞是所有角色都认可的通用礼物')
    expect(affinityEntry?.content).toContain('月铃花只属于洛岚与芙蕾雅')
    expect(minaEntry?.content).toContain('月尾鱼')
    expect(minaEntry?.content).toContain('潮纹鲈')
  })

  it('提供六位共生伙伴角色卡与完整生产世界书', () => {
    const defaults = createMistvaleDefaults()
    const productionBook = defaults.lorebooks.find((book) => book.id === PRODUCTION_PARTNERS_ID)
    const partnerIds = ['cow-girl', 'bee-girl', 'spider-girl', 'fire-slime-girl', 'water-slime-girl', 'dragon-girl']
    const partnerCards = defaults.characters.filter((card) => partnerIds.includes(card.npcId))

    expect(productionBook?.entries.map((item) => item.comment)).toEqual(expect.arrayContaining([
      '牛奶娘', '蜂娘', '蜘蛛娘', '火史莱姆娘', '水史莱姆娘', '龙娘', '农场生产链',
    ]))
    expect(productionBook?.entries.find((item) => item.comment === '蜘蛛娘')?.content).toContain('线团')
    expect(productionBook?.entries.find((item) => item.comment === '龙娘')?.content).toContain('第20层')
    expect(partnerCards).toHaveLength(6)
    expect(partnerCards.every((card) => card.tags.includes('女性角色') && card.tags.includes('共生伙伴'))).toBe(true)
    expect(partnerCards.every((card) => card.lorebookIds.includes(PRODUCTION_PARTNERS_ID))).toBe(true)
    expect(partnerCards.every((card) => card.portraitSlots.length === 1)).toBe(true)
    expect(partnerCards.every((card) => card.portraitSlots[0].minAffinity === 0 && card.portraitSlots[0].maxAffinity === 100)).toBe(true)
    expect(defaults.characters.every((card) => card.lorebookIds.includes(PRODUCTION_PARTNERS_ID))).toBe(true)
    expect(defaults.settings.activeLorebookIds).toContain(PRODUCTION_PARTNERS_ID)
  })

  it('提供完整岁时世界书并挂载到每张角色卡', () => {
    const defaults = createMistvaleDefaults()
    const calendarBook = defaults.lorebooks.find((book) => book.id === 'mistvale-calendar-festivals')

    expect(calendarBook?.entries.filter((entry) => entry.id.startsWith('mistvale-festival-'))).toHaveLength(12)
    expect(calendarBook?.entries.find((entry) => entry.comment === '迎岁灯会')?.content).toContain('点灯祈愿')
    expect(calendarBook?.entries.find((entry) => entry.comment === '迎岁灯会')?.content).toContain('壁炉共餐')
    expect(defaults.characters.every((card) => card.lorebookIds.includes('mistvale-calendar-festivals'))).toBe(true)
    expect(defaults.settings.activeLorebookIds).toContain('mistvale-calendar-festivals')
    expect(defaults.lorebooks.find((book) => book.id === 'mistvale-village-archive')?.entries.find((entry) => entry.comment === '柳安档案')?.content).toContain('4月12日')
  })

  it('为角色卡绑定所在地、首句和世界书', () => {
    const defaults = createMistvaleDefaults()
    const loran = defaults.characters.find((card) => card.npcId === 'loran')

    expect(loran).toMatchObject({
      id: 'mistvale-character-loran',
      name: '洛岚',
      locationId: 'mayor-home',
    })
    expect(loran?.firstMessage).toContain('雾灯谷')
    expect(loran?.lorebookIds).toEqual(expect.arrayContaining(['mistvale-world-rules']))
    expect(loran?.portraitSlots).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '' },
    ])
    expect(loran).not.toHaveProperty('portraitByAffinity')
  })
})
