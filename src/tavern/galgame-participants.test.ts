import { describe, expect, it } from 'vitest'
import type { Npc, Relationship } from '../game/types'
import { getEligibleGalgameInvitees } from './galgame-participants'

type InviteNpc = Pick<Npc, 'id' | 'name'>

const resident = (id: string, name: string): InviteNpc => ({ id, name })
const relationship = (affinity: number): Relationship => ({
  affinity,
  stage: 'trusted',
  chattedToday: false,
  giftedToday: false,
  memoryTags: [],
})

describe('GAL invite eligibility', () => {
  const residents = [
    resident('loran', '洛岚'),
    resident('freya', '芙蕾雅'),
    resident('mina', '弥奈'),
    resident('alpha', 'A'),
    resident('beta', 'B'),
    resident('unknown', '无关系角色'),
  ]
  const relationships: Record<string, Relationship> = {
    loran: relationship(100),
    freya: relationship(71),
    mina: relationship(70),
    alpha: relationship(85),
    beta: relationship(85),
  }

  it('requires affinity strictly above 70 and sorts by affinity then name', () => {
    expect(getEligibleGalgameInvitees(residents, relationships, ['loran']).map((item) => item.id)).toEqual([
      'alpha',
      'beta',
      'freya',
    ])
  })

  it('excludes current participants and residents without a relationship record', () => {
    expect(getEligibleGalgameInvitees(residents, relationships, ['loran', 'alpha']).map((item) => item.id)).toEqual([
      'beta',
      'freya',
    ])
  })

  it('returns no candidates once the five-person table is full', () => {
    expect(getEligibleGalgameInvitees(residents, relationships, ['loran', 'freya', 'mina', 'alpha', 'beta'])).toEqual([])
  })
})
