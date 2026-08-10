import { describe, expect, it } from 'vitest'
import { quests as questTemplates } from './data'
import {
  acceptQuest,
  createQuestInstance,
  getAbsoluteGameDay,
  refreshQuestsForDay,
} from './quest-engine'

describe('限时委托引擎', () => {
  it('第一天固定提供一条委托，后续每天最多刷新一条', () => {
    const dayOne = refreshQuestsForDay([], questTemplates, 1, 840517)
    expect(dayOne.quests).toHaveLength(1)
    expect(dayOne.quests[0]).toMatchObject({
      templateId: questTemplates[0].id,
      postedDay: 1,
      status: 'available',
    })

    const next = refreshQuestsForDay(dayOne.quests, questTemplates, 2, 840517)
    expect(next.quests.filter((quest) => quest.status === 'available')).toHaveLength(0)
    expect(next.quests).toHaveLength(0)
  })

  it('接取时写入绝对日期截止日，并在截止日之后移除未完成委托', () => {
    const available = createQuestInstance(questTemplates[1], 31)
    const active = acceptQuest(available, 31)
    expect(active).toMatchObject({ status: 'active', acceptedDay: 31, deadlineDay: 34 })

    const deadline = refreshQuestsForDay([active], questTemplates, 34, 2)
    expect(deadline.quests.some((quest) => quest.id === active.id)).toBe(true)

    const expired = refreshQuestsForDay(deadline.quests, questTemplates, 35, 2)
    expect(expired.quests.some((quest) => quest.id === active.id)).toBe(false)
    expect(expired.expiredCount).toBe(1)
  })

  it('使用跨年连续的绝对日期计算期限', () => {
    expect(getAbsoluteGameDay(1, 365)).toBe(365)
    expect(getAbsoluteGameDay(2, 1)).toBe(366)
  })
})
