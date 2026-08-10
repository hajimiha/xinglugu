import type { Quest, QuestTemplate } from './types'

export const DAILY_QUEST_REFRESH_CHANCE = 0.65

export function getAbsoluteGameDay(year: number, day: number): number {
  return (Math.max(1, Math.floor(year)) - 1) * 365 + Math.max(1, Math.floor(day))
}

function seededUnit(seed: number, day: number, salt = 0): number {
  const value = Math.abs(Math.floor(seed) + day * 9301 + salt * 49297) % 233280
  return value / 233280
}

export function createQuestInstance(template: QuestTemplate, postedDay: number): Quest {
  return {
    ...template,
    id: `quest-${postedDay}-${template.id}`,
    templateId: template.id,
    postedDay,
    status: 'available',
  }
}

export function acceptQuest(quest: Quest, acceptedDay: number): Quest {
  if (quest.status !== 'available') return quest
  return {
    ...quest,
    status: 'active',
    acceptedDay,
    deadlineDay: acceptedDay + quest.expiresInDays - 1,
  }
}

export interface QuestRefreshResult {
  quests: Quest[]
  posted?: Quest
  expiredCount: number
}

export function refreshQuestsForDay(
  current: Quest[],
  templates: QuestTemplate[],
  absoluteDay: number,
  worldSeed: number,
): QuestRefreshResult {
  let expiredCount = 0
  const retained = current.filter((quest) => {
    if (quest.status === 'available') return quest.postedDay >= absoluteDay
    if ((quest.status === 'active' || quest.status === 'ready') && quest.deadlineDay !== undefined && quest.deadlineDay < absoluteDay) {
      expiredCount += 1
      return false
    }
    return true
  })

  const shouldPost = absoluteDay === 1 || seededUnit(worldSeed, absoluteDay) < DAILY_QUEST_REFRESH_CHANCE
  if (!shouldPost || retained.some((quest) => quest.status === 'available') || templates.length === 0) {
    return { quests: retained, expiredCount }
  }

  const occupiedTemplateIds = new Set(retained
    .filter((quest) => quest.status === 'active' || quest.status === 'ready')
    .map((quest) => quest.templateId))
  const candidates = templates.filter((template) => !occupiedTemplateIds.has(template.id))
  if (candidates.length === 0) return { quests: retained, expiredCount }
  const index = absoluteDay === 1
    ? 0
    : Math.min(candidates.length - 1, Math.floor(seededUnit(worldSeed, absoluteDay, 1) * candidates.length))
  const posted = createQuestInstance(candidates[index], absoluteDay)
  return { quests: [...retained, posted], posted, expiredCount }
}

