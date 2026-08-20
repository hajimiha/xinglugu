export const MAX_CHAT_PARTICIPANTS = 5

export function normalizeSessionParticipantIds(
  primaryNpcId: string | undefined,
  value: unknown,
): string[] {
  const candidates = Array.isArray(value) ? value : []
  const ids = [primaryNpcId, ...candidates]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())

  return [...new Set(ids)].slice(0, MAX_CHAT_PARTICIPANTS)
}
