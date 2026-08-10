import type { PlayerProfile } from './types'

export const DEFAULT_PLAYER_NAME = '旅行者'
export const MAX_PLAYER_NAME_LENGTH = 20

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u

export function normalizePlayerName(value: unknown): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTER_PATTERN.test(value)) return null
  const name = value.trim()
  if (!name || Array.from(name).length > MAX_PLAYER_NAME_LENGTH) return null
  return name
}

export function sanitizePlayerProfile(value: unknown): PlayerProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { name: DEFAULT_PLAYER_NAME, hasConfirmedName: false }
  }
  const candidate = value as Record<string, unknown>
  const name = normalizePlayerName(candidate.name)
  if (!name || candidate.hasConfirmedName !== true) {
    return { name: name ?? DEFAULT_PLAYER_NAME, hasConfirmedName: false }
  }
  return { name, hasConfirmedName: true }
}
