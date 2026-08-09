import { describe, expect, it } from 'vitest'
import * as data from './data'

describe('集中式物品与生产目录', () => {
  it('公开一份覆盖新生产链的物品目录', () => {
    const catalog = (data as unknown as { ITEM_CATALOG?: Record<string, { name: string; sources: string[]; uses: string[] }> }).ITEM_CATALOG

    expect(catalog).toEqual(expect.objectContaining({
      wood: expect.objectContaining({ name: '木头' }),
      stone: expect.objectContaining({ name: '石头' }),
      'diamond-ore': expect.objectContaining({ name: '钻石矿' }),
      'copper-ingot': expect.objectContaining({ name: '铜锭' }),
      milk: expect.objectContaining({ name: '牛奶' }),
      'thread-ball': expect.objectContaining({ name: '线团' }),
      flour: expect.objectContaining({ name: '面粉' }),
      'ember-berry-seed': expect.objectContaining({ name: '余烬莓种子' }),
      'tide-lotus-seed': expect.objectContaining({ name: '潮汐莲种子' }),
      'stone-pumpkin-seed': expect.objectContaining({ name: '岩纹南瓜种子' }),
    }))
  })

  it('移除月影菇和苔藓药草并迁移对应礼物偏好', () => {
    expect(JSON.stringify({ names: data.itemDisplayNames, items: data.shopItems, npcs: data.npcs })).not.toMatch(/mushroom|moss-herb|月影菇|苔藓药草/)
    expect(data.npcs.find((npc) => npc.id === 'qiluo')?.preferredGifts).toContain('thread-ball')
    for (const id of ['freya', 'mira', 'chaoyin', 'weina']) {
      expect(data.npcs.find((npc) => npc.id === id)?.preferredGifts).toContain('milk')
    }
    expect(data.npcs.find((npc) => npc.id === 'taomi')?.preferredGifts).toContain('copper-ingot')
    for (const id of ['yanque', 'rin']) {
      expect(data.npcs.find((npc) => npc.id === id)?.preferredGifts).toContain('iron-ingot')
    }
  })

  it('为每件物品声明至少一个实际来源和用途', () => {
    const catalog = (data as unknown as { ITEM_CATALOG?: Record<string, { sources: string[]; uses: string[] }> }).ITEM_CATALOG ?? {}
    const incomplete = Object.entries(catalog)
      .filter(([, item]) => item.sources.length === 0 || item.uses.length === 0)
      .map(([id]) => id)

    expect(Object.keys(catalog).length).toBeGreaterThan(30)
    expect(incomplete).toEqual([])
  })

  it('矿洞在第十层起掉落钻石矿且镐等级会提高全部矿物收益', () => {
    const economy = data as unknown as {
      MINE_MAX_FLOOR?: number
      getMineYield?: (floor: number, pickaxeLevel: number, dropMultiplier: number, hasDragon?: boolean) => Record<string, number>
    }

    expect(economy.MINE_MAX_FLOOR).toBe(20)
    expect(economy.getMineYield).toBeTypeOf('function')
    if (!economy.getMineYield) return

    expect(economy.getMineYield(1, 1, 1)).toEqual({
      'copper-ore': 1,
      'iron-ore': 0,
      stone: 2,
      'diamond-ore': 0,
    })
    expect(economy.getMineYield(10, 1, 1)).toEqual({
      'copper-ore': 4,
      'iron-ore': 2,
      stone: 4,
      'diamond-ore': 1,
    })
    expect(economy.getMineYield(10, 4, 1)).toEqual({
      'copper-ore': 7,
      'iron-ore': 4,
      stone: 7,
      'diamond-ore': 2,
    })
    expect(economy.getMineYield(20, 1, 1, true)['diamond-ore']).toBe(4)
  })

  it('登记机器、建筑、锻造、节日种子与六位共生伙伴', () => {
    const economy = data as unknown as Record<string, unknown>
    expect(economy.MACHINE_RECIPES).toEqual(expect.objectContaining({
      'smelt-copper': expect.objectContaining({ inputItemId: 'copper-ore', outputItemId: 'copper-ingot', inputPerBatch: 3 }),
      'smelt-iron': expect.objectContaining({ inputItemId: 'iron-ore', outputItemId: 'iron-ingot', inputPerBatch: 3 }),
      'smelt-diamond': expect.objectContaining({ inputItemId: 'diamond-ore', outputItemId: 'diamond-ingot', inputPerBatch: 3 }),
      'mill-flour': expect.objectContaining({ inputItemId: 'sun-wheat', outputItemId: 'flour', inputPerBatch: 2 }),
    }))
    expect(economy.BUILD_RECIPES).toEqual(expect.objectContaining({
      furnace: expect.objectContaining({ materials: { stone: 25 } }),
      mill: expect.objectContaining({ materials: { wood: 20, stone: 15 }, money: 600 }),
    }))
    expect(Object.keys(economy.FORGE_RECIPES as object)).toHaveLength(12)
    expect(Object.keys(economy.MONSTER_PARTNERS as object)).toEqual([
      'cow-girl', 'bee-girl', 'spider-girl', 'fire-slime-girl', 'water-slime-girl', 'dragon-girl',
    ])
    expect(economy.FESTIVAL_SEED_OFFERS).toHaveLength(3)
  })
})
