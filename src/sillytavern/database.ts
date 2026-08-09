import Dexie, { type EntityTable } from 'dexie'
import type { CharacterCard, ChatPreset, ChatSession, Lorebook, TavernRequestAudit, TavernSettings } from './types'

export class MistvaleTavernDatabase extends Dexie {
  lorebooks!: EntityTable<Lorebook, 'id'>
  presets!: EntityTable<ChatPreset, 'id'>
  characters!: EntityTable<CharacterCard, 'id'>
  sessions!: EntityTable<ChatSession, 'id'>
  settings!: EntityTable<TavernSettings, 'key'>
  requestAudits!: EntityTable<TavernRequestAudit, 'id'>

  constructor(name = 'mistvale-tavern') {
    super(name)
    this.version(1).stores({
      lorebooks: 'id, name, updatedAt',
      presets: 'id, name, updatedAt',
      characters: 'id, npcId, name, locationId, updatedAt',
      sessions: 'id, characterName, updatedAt',
      settings: 'key, updatedAt',
    })
    this.version(2).stores({
      lorebooks: 'id, name, updatedAt',
      presets: 'id, name, updatedAt',
      characters: 'id, npcId, name, locationId, updatedAt',
      sessions: 'id, characterName, updatedAt',
      settings: 'key, updatedAt',
      requestAudits: 'id, createdAt, sessionId, presetId, status',
    })
  }
}

export function createTavernDatabase(name?: string): MistvaleTavernDatabase {
  return new MistvaleTavernDatabase(name)
}

export const tavernDatabase = createTavernDatabase()
