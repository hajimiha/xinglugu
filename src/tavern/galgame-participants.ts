import type { Npc, Relationship } from '../game/types'
import { MAX_CHAT_PARTICIPANTS } from '../sillytavern/session-participants'

export function getEligibleGalgameInvitees<T extends Pick<Npc, 'id' | 'name'>>(
  residents: readonly T[],
  relationships: Readonly<Record<string, Relationship | undefined>>,
  participantNpcIds: readonly string[],
): T[] {
  if (participantNpcIds.length >= MAX_CHAT_PARTICIPANTS) return []

  const participants = new Set(participantNpcIds)
  return residents
    .filter((npc) => !participants.has(npc.id) && (relationships[npc.id]?.affinity ?? 0) > 70)
    .sort((left, right) => {
      const affinityDifference = relationships[right.id]!.affinity - relationships[left.id]!.affinity
      return affinityDifference || left.name.localeCompare(right.name, 'zh-CN')
    })
}
