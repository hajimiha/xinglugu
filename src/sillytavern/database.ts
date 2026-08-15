import Dexie, { type EntityTable } from 'dexie'
import type { CharacterCard, ChatPreset, ChatSession, Lorebook, TavernRequestAudit, TavernSettings } from './types'
import type { ImageGenerationJob, StoredImageGenerationAsset, StoredImageGenerationReference } from './image-generation/types'

export class MistvaleTavernDatabase extends Dexie {
  lorebooks!: EntityTable<Lorebook, 'id'>
  presets!: EntityTable<ChatPreset, 'id'>
  characters!: EntityTable<CharacterCard, 'id'>
  sessions!: EntityTable<ChatSession, 'id'>
  settings!: EntityTable<TavernSettings, 'key'>
  requestAudits!: EntityTable<TavernRequestAudit, 'id'>
  imageJobs!: EntityTable<ImageGenerationJob, 'id'>
  imageAssets!: EntityTable<StoredImageGenerationAsset, 'id'>
  imageReferences!: EntityTable<StoredImageGenerationReference, 'id'>

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
    this.version(3).stores({
      lorebooks: 'id, name, updatedAt',
      presets: 'id, name, updatedAt',
      characters: 'id, npcId, name, locationId, updatedAt',
      sessions: 'id, characterName, updatedAt',
      settings: 'key, updatedAt',
      requestAudits: 'id, createdAt, sessionId, presetId, status',
      imageJobs: 'id, sessionId, npcId, messageId, status, provider, assetId, createdAt, updatedAt',
      imageAssets: 'id, jobId, sessionId, npcId, messageId, createdAt',
    })
    this.version(4).stores({
      lorebooks: 'id, name, updatedAt',
      presets: 'id, name, updatedAt',
      characters: 'id, npcId, name, locationId, updatedAt',
      sessions: 'id, characterName, updatedAt',
      settings: 'key, updatedAt',
      requestAudits: 'id, createdAt, sessionId, presetId, status',
      imageJobs: 'id, sessionId, npcId, messageId, status, provider, assetId, createdAt, updatedAt',
      imageAssets: 'id, jobId, sessionId, npcId, messageId, createdAt',
      imageReferences: 'id, kind, enabled, createdAt',
    })
  }
}

export function createTavernDatabase(name?: string): MistvaleTavernDatabase {
  return new MistvaleTavernDatabase(name)
}

export const tavernDatabase = createTavernDatabase()
