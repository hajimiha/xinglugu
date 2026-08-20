import { describe, expect, it } from 'vitest'
import { MAX_CHAT_PARTICIPANTS, normalizeSessionParticipantIds } from './session-participants'

describe('session participant normalization', () => {
  it('keeps the primary NPC first while removing invalid and duplicate IDs', () => {
    expect(normalizeSessionParticipantIds('loran', ['freya', 'loran', 'freya', '', '  ', 4])).toEqual([
      'loran',
      'freya',
    ])
  })

  it('caps the complete group at five participants including the primary NPC', () => {
    expect(normalizeSessionParticipantIds('loran', ['freya', 'mina', 'liuan', 'taomi', 'yanque'])).toEqual([
      'loran',
      'freya',
      'mina',
      'liuan',
      'taomi',
    ])
    expect(MAX_CHAT_PARTICIPANTS).toBe(5)
  })

  it('treats a legacy missing participant list as a single-primary session', () => {
    expect(normalizeSessionParticipantIds('loran', undefined)).toEqual(['loran'])
  })
})
