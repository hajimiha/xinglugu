import { describe, expect, it } from 'vitest'
import { npcs } from './data'
import {
  advanceCalendarClock,
  festivals,
  formatGameDate,
  getCalendarDate,
  getDayOfYear,
  getFestivalOnDay,
  getFestivalOffers,
  getNpcPresence,
  getNpcSchedule,
  getNpcsAtLocation,
  getSeasonForDay,
  getWeekday,
  isNpcBirthday,
  MAX_GAME_YEAR,
} from './calendar'

describe('雾灯谷日历', () => {
  it('以春季开年并按365天换算月份、星期与跨年', () => {
    expect(getCalendarDate(1, 1)).toMatchObject({ year: 1, month: 1, date: 1, season: '春', weekday: '周一' })
    expect(getCalendarDate(1, 60)).toMatchObject({ month: 3, date: 1, season: '春' })
    expect(getCalendarDate(1, 91)).toMatchObject({ month: 4, date: 1, season: '夏' })
    expect(getCalendarDate(2, 1).weekday).toBe('周二')
    expect(getDayOfYear(12, 31)).toBe(365)
    expect(getSeasonForDay(365)).toBe('冬')
    expect(getWeekday(1, 7)).toBe('周日')
    expect(formatGameDate(2, 365)).toBe('第2年12月31日')
    expect(advanceCalendarClock(1, 365, 23 * 60 + 50, 20)).toEqual({ year: 2, day: 1, minutes: 10 })
    expect(advanceCalendarClock(MAX_GAME_YEAR, 365, 1430, 60)).toEqual({ year: MAX_GAME_YEAR, day: 365, minutes: 1439 })
  })

  it('为每个月配置一个具有三项活动的独立节日', () => {
    expect(festivals).toHaveLength(12)
    expect(new Set(festivals.map((festival) => festival.month)).size).toBe(12)
    expect(festivals.every((festival) => festival.activities.length === 3)).toBe(true)
    expect(getFestivalOnDay(getDayOfYear(1, 12))?.name).toBe('迎岁灯会')
    expect(getFestivalOnDay(getDayOfYear(12, 31))?.name).toBe('守夜落雪宴')
  })

  it('只在指定节日与会场供应对应的限定种子', () => {
    expect(getFestivalOffers(getDayOfYear(6, 21), 'fisher-home')).toEqual([
      expect.objectContaining({ itemId: 'tide-lotus-seed' }),
    ])
    expect(getFestivalOffers(getDayOfYear(8, 15), 'general-store')).toEqual([
      expect.objectContaining({ itemId: 'stone-pumpkin-seed' }),
    ])
    expect(getFestivalOffers(getDayOfYear(9, 9), 'smithy')).toEqual([
      expect.objectContaining({ itemId: 'ember-berry-seed' }),
    ])
    expect(getFestivalOffers(getDayOfYear(6, 20), 'fisher-home')).toEqual([])
    expect(getFestivalOffers(getDayOfYear(6, 21), 'general-store')).toEqual([])
  })

  it('为十五位角色配置有效且互不重复的生日', () => {
    expect(npcs).toHaveLength(15)
    expect(new Set(npcs.map((npc) => `${npc.birthday.month}-${npc.birthday.day}`)).size).toBe(15)
    expect(npcs.every((npc) => npc.birthday.month >= 1 && npc.birthday.month <= 12)).toBe(true)
    expect(isNpcBirthday('liuan', getDayOfYear(4, 12))).toBe(true)
    expect(isNpcBirthday('liuan', getDayOfYear(4, 13))).toBe(false)
  })

  it('每份基础日程完整覆盖一天且不重叠', () => {
    for (const npc of npcs) {
      const schedule = getNpcSchedule(npc.id, 1, 1)
      expect(schedule[0]?.startMinute, npc.name).toBe(0)
      expect(schedule.at(-1)?.endMinute, npc.name).toBe(1440)
      for (let index = 1; index < schedule.length; index += 1) {
        expect(schedule[index].startMinute, npc.name).toBe(schedule[index - 1].endMinute)
      }
    }
  })

  it('按工作与休闲时段解析NPC实际所在地', () => {
    expect(getNpcPresence('liuan', 1, 1, 10 * 60)).toMatchObject({ locationId: 'general-store', activity: '整理货架并经营柜台' })
    expect(getNpcPresence('liuan', 1, 1, 19 * 60)).toMatchObject({ locationId: 'library', activity: '核对商路旧账' })
    expect(getNpcsAtLocation('library', 1, 1, 19 * 60).map((npc) => npc.id)).toContain('liuan')
    expect(getNpcsAtLocation('general-store', 1, 1, 19 * 60).map((npc) => npc.id)).not.toContain('liuan')
  })

  it('节日活动时段覆盖参与角色的普通行程', () => {
    const festivalDay = getDayOfYear(1, 12)
    expect(getNpcPresence('loran', 1, festivalDay, 19 * 60)).toMatchObject({
      locationId: 'mayor-home',
      activity: '主持迎岁灯会',
      festivalId: 'first-light-festival',
    })
    expect(getNpcPresence('loran', 1, festivalDay, 7 * 60).festivalId).toBeUndefined()
  })
})
