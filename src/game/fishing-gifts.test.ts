import { describe, expect, it } from 'vitest'
import { FISH_CATALOG, UNIVERSAL_GIFT_IDS } from './economy'
import { npcs } from './data'
import { gameReducer, initialGameState } from './reducer'

describe('渔获与礼物平衡', () => {
  it('提供两种小型、两种中型与一种大型鱼类，并为每种鱼指定获取方式与用途', () => {
    expect(Object.keys(FISH_CATALOG)).toHaveLength(5)
    expect(Object.values(FISH_CATALOG).map((fish) => fish.size).sort()).toEqual(['large', 'medium', 'medium', 'small', 'small'])
    for (const fish of Object.values(FISH_CATALOG)) {
      expect(fish.sources.length).toBeGreaterThan(0)
      expect(fish.uses.length).toBeGreaterThan(0)
    }
  })

  it('能钓起大型雾湾巨鲶并按体型给予更高经验', () => {
    const started = gameReducer({ ...initialGameState, inventory: { ...initialGameState.inventory, 'reed-bait': 1 } }, { type: 'START_FISHING' })
    const caught = gameReducer(started, { type: 'CATCH_FISH', result: 'mist-catfish' })
    expect(caught.inventory['mist-catfish']).toBe(1)
    expect(caught.skills.fishing.experience).toBe(30)
    expect(caught.fishing.lastCatch).toBe('mist-catfish')
  })

  it('莓果挞是通用礼物，月铃花只保留两位偏爱者', () => {
    expect(UNIVERSAL_GIFT_IDS).toContain('berry-tart')
    expect(npcs.every((npc) => !npc.preferredGifts.includes('berry-tart'))).toBe(true)
    expect(npcs.filter((npc) => npc.preferredGifts.includes('moonflower')).map((npc) => npc.id)).toEqual(['loran', 'freya'])
    for (const fishId of Object.keys(FISH_CATALOG)) {
      expect(npcs.some((npc) => npc.preferredGifts.includes(fishId))).toBe(true)
    }
  })
})
