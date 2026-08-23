import { describe, expect, it } from 'vitest'
import { locations } from '../../game/data'
import { VILLAGE_OPENING_BEATS, formatVillageOpeningText } from './village-opening-story'

describe('村庄开场剧情', () => {
  it('以全景开合并恰好介绍全部十一处地点一次', () => {
    const focused = VILLAGE_OPENING_BEATS.flatMap((beat) => beat.focusLocationId ? [beat.focusLocationId] : [])

    expect(VILLAGE_OPENING_BEATS).toHaveLength(15)
    expect(VILLAGE_OPENING_BEATS[0].camera).toBe('overview')
    expect(VILLAGE_OPENING_BEATS.at(-1)?.camera).toBe('overview')
    expect(focused).toHaveLength(locations.length)
    expect(new Set(focused).size).toBe(locations.length)
    expect([...focused].sort()).toEqual(locations.map((location) => location.id).sort())
  })

  it('只替换玩家姓名占位符并保留姓名原文', () => {
    expect(formatVillageOpeningText('欢迎，{{playerName}}。{{playerName}}，请看这里。', '<云岚>')).toBe('欢迎，<云岚>。<云岚>，请看这里。')
  })

  it('所有地点镜头都使用有效地点模式和唯一节拍编号', () => {
    expect(new Set(VILLAGE_OPENING_BEATS.map((beat) => beat.id)).size).toBe(VILLAGE_OPENING_BEATS.length)
    expect(VILLAGE_OPENING_BEATS.filter((beat) => beat.focusLocationId).every((beat) => beat.camera === 'location')).toBe(true)
  })
})
