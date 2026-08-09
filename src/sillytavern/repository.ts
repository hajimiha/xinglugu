import { CALENDAR_FESTIVALS_ID, createMistvaleDefaults, DEFAULT_CONTENT_VERSION, MONSTER_GIRL_CARD_IDS, PRODUCTION_PARTNERS_ID } from './defaults'
import { normalizeTavernSettings } from './api-config'
import type { MistvaleTavernDatabase } from './database'
import { tavernDatabase } from './database'
import type { CharacterCard, ChatPreset, ChatSession, Lorebook, TavernSettings } from './types'
import { loadRepositoryContentPack, mergeById, type TavernContentPack } from './content-pack'
import { createDefaultPortraitSlots, legacyPortraitsToSlots, parsePortraitSlots } from './portrait-slots'

export type TavernContentPackLoader = () => Promise<TavernContentPack | null>
const defaultContentPackLoader: TavernContentPackLoader = import.meta.env.MODE === 'test'
  ? async () => null
  : loadRepositoryContentPack

function normalizeStoredCharacter(value: CharacterCard): CharacterCard {
  const raw = value as CharacterCard & { portraitSlots?: unknown; portraitByAffinity?: unknown }
  let portraitSlots
  try {
    portraitSlots = raw.portraitSlots === undefined
      ? legacyPortraitsToSlots(raw.portraitByAffinity)
      : parsePortraitSlots(raw.portraitSlots)
  } catch {
    try {
      portraitSlots = legacyPortraitsToSlots(raw.portraitByAffinity)
    } catch {
      portraitSlots = createDefaultPortraitSlots()
    }
  }

  const { portraitByAffinity: _legacyPortraits, portraitSlots: _rawSlots, ...character } = raw
  return { ...character, portraitSlots }
}

export interface TavernRepository {
  initialize(): Promise<void>
  listLorebooks(): Promise<Lorebook[]>
  getLorebook(id: string): Promise<Lorebook | undefined>
  saveLorebook(value: Lorebook): Promise<void>
  deleteLorebook(id: string): Promise<void>
  listPresets(): Promise<ChatPreset[]>
  getPreset(id: string): Promise<ChatPreset | undefined>
  savePreset(value: ChatPreset): Promise<void>
  deletePreset(id: string): Promise<void>
  listCharacters(): Promise<CharacterCard[]>
  getCharacter(id: string): Promise<CharacterCard | undefined>
  saveCharacter(value: CharacterCard): Promise<void>
  deleteCharacter(id: string): Promise<void>
  listSessions(): Promise<ChatSession[]>
  getSession(id: string): Promise<ChatSession | undefined>
  saveSession(value: ChatSession): Promise<void>
  deleteSession(id: string): Promise<void>
  getSettings(): Promise<TavernSettings>
  saveSettings(value: TavernSettings): Promise<void>
}

class DexieTavernRepository implements TavernRepository {
  constructor(
    private readonly database: MistvaleTavernDatabase,
    private readonly contentPackLoader: TavernContentPackLoader,
  ) {}

  async initialize(): Promise<void> {
    const defaults = createMistvaleDefaults()
    const contentPack = await this.contentPackLoader()
    await this.database.transaction(
      'rw',
      this.database.lorebooks,
      this.database.presets,
      this.database.characters,
      this.database.sessions,
      this.database.settings,
      async () => {
        const storedSettings = await this.database.settings.get('mistvale-settings')
        const shouldPublishPack = Boolean(contentPack && storedSettings?.contentPackVersion !== contentPack.contentVersion)
        const storedContentVersion = storedSettings?.defaultContentVersion ?? 1
        const shouldMigrateCalendar = storedContentVersion < 2
        const shouldMigrateProduction = storedContentVersion < 3
        const shouldMigratePortraitSlots = storedContentVersion < 4
        const shouldMigratePresetBinding = storedContentVersion < 5
        const shouldMigrateDefaults = storedContentVersion < DEFAULT_CONTENT_VERSION
        const migrationLorebookIds = [
          ...(shouldMigrateCalendar ? [CALENDAR_FESTIVALS_ID] : []),
          ...(shouldMigrateProduction ? [PRODUCTION_PARTNERS_ID] : []),
        ]
        if ((await this.database.lorebooks.count()) === 0 && !storedSettings) {
          await this.database.lorebooks.bulkAdd(mergeById(defaults.lorebooks, contentPack?.lorebooks ?? []))
        } else {
          if (shouldMigrateDefaults) {
            const existingIds = new Set((await this.database.lorebooks.toArray()).map((book) => book.id))
            const missingMigrationBooks = defaults.lorebooks.filter((book) => migrationLorebookIds.includes(book.id) && !existingIds.has(book.id))
            if (missingMigrationBooks.length) await this.database.lorebooks.bulkAdd(missingMigrationBooks)
          }
          if (shouldPublishPack && contentPack?.lorebooks.length) await this.database.lorebooks.bulkPut(contentPack.lorebooks)
        }
        if ((await this.database.presets.count()) === 0) {
          await this.database.presets.bulkAdd(mergeById(defaults.presets, contentPack?.presets ?? []))
        } else if (shouldPublishPack && contentPack?.presets.length) {
          await this.database.presets.bulkPut(contentPack.presets)
        }
        if ((await this.database.characters.count()) === 0) {
          await this.database.characters.bulkAdd(mergeById(defaults.characters, contentPack?.characters ?? []))
        } else {
          if (shouldPublishPack && contentPack?.characters.length) await this.database.characters.bulkPut(contentPack.characters)
          if (shouldMigrateDefaults) {
            const defaultCharacterIds = new Set(defaults.characters.map((card) => card.id))
            const migratedCharacters = (await this.database.characters.toArray())
              .filter((card) => defaultCharacterIds.has(card.id) && migrationLorebookIds.some((id) => !card.lorebookIds.includes(id)))
              .map((card) => ({ ...card, lorebookIds: Array.from(new Set([...card.lorebookIds, ...migrationLorebookIds])) }))
            if (migratedCharacters.length) await this.database.characters.bulkPut(migratedCharacters)
            if (shouldMigrateProduction) {
              const existingIds = new Set((await this.database.characters.toArray()).map((card) => card.id))
              const missingPartnerCards = defaults.characters.filter((card) => MONSTER_GIRL_CARD_IDS.includes(card.id) && !existingIds.has(card.id))
              if (missingPartnerCards.length) await this.database.characters.bulkAdd(missingPartnerCards)
            }
            if (shouldMigratePortraitSlots) {
              const migratedPortraits = (await this.database.characters.toArray()).map(normalizeStoredCharacter)
              if (migratedPortraits.length) await this.database.characters.bulkPut(migratedPortraits)
            }
          }
        }
        if ((await this.database.sessions.count()) === 0 && defaults.sessions.length > 0) {
          await this.database.sessions.bulkAdd(defaults.sessions)
        } else if (shouldMigrateDefaults) {
          const defaultNpcIds = new Set(defaults.characters.map((card) => card.npcId))
          const storedSessions = await this.database.sessions.toArray()
          const migratedSessions = storedSessions
            .map((session) => {
              const shouldAddLorebooks = Boolean(
                session.npcId
                && defaultNpcIds.has(session.npcId)
                && migrationLorebookIds.some((id) => !session.lorebookIds.includes(id)),
              )
              const next = {
                ...session,
                ...(shouldAddLorebooks
                  ? { lorebookIds: Array.from(new Set([...session.lorebookIds, ...migrationLorebookIds])) }
                  : {}),
                ...(shouldMigratePresetBinding && !session.presetBinding
                  ? { presetId: null, presetBinding: { mode: 'follow-active' as const } }
                  : {}),
              }
              return JSON.stringify(next) === JSON.stringify(session) ? null : next
            })
            .filter((session): session is ChatSession => Boolean(session))
          if (migratedSessions.length) await this.database.sessions.bulkPut(migratedSessions)
        }
        if ((await this.database.settings.count()) === 0) {
          await this.database.settings.add({ ...defaults.settings, contentPackVersion: contentPack?.contentVersion, defaultContentVersion: DEFAULT_CONTENT_VERSION })
        } else if (shouldPublishPack || shouldMigrateDefaults) {
          await this.database.settings.update('mistvale-settings', {
            ...(shouldPublishPack && contentPack ? { contentPackVersion: contentPack.contentVersion } : {}),
            ...(shouldMigrateDefaults ? {
              defaultContentVersion: DEFAULT_CONTENT_VERSION,
              activeLorebookIds: Array.from(new Set([...(storedSettings?.activeLorebookIds ?? []), ...migrationLorebookIds])),
            } : {}),
          })
        }
      },
    )
  }

  listLorebooks = () => this.database.lorebooks.orderBy('updatedAt').reverse().toArray()
  getLorebook = (id: string) => this.database.lorebooks.get(id)
  async saveLorebook(value: Lorebook) { await this.database.lorebooks.put(value) }
  async deleteLorebook(id: string) { await this.database.lorebooks.delete(id) }

  listPresets = () => this.database.presets.orderBy('updatedAt').reverse().toArray()
  getPreset = (id: string) => this.database.presets.get(id)
  async savePreset(value: ChatPreset) { await this.database.presets.put(value) }
  async deletePreset(id: string) { await this.database.presets.delete(id) }

  listCharacters = () => this.database.characters.orderBy('name').toArray()
  getCharacter = (id: string) => this.database.characters.get(id)
  async saveCharacter(value: CharacterCard) { await this.database.characters.put(value) }
  async deleteCharacter(id: string) { await this.database.characters.delete(id) }

  listSessions = () => this.database.sessions.orderBy('updatedAt').reverse().toArray()
  getSession = (id: string) => this.database.sessions.get(id)
  async saveSession(value: ChatSession) { await this.database.sessions.put(value) }
  async deleteSession(id: string) { await this.database.sessions.delete(id) }

  async getSettings(): Promise<TavernSettings> {
    const current = await this.database.settings.get('mistvale-settings')
    if (current) {
      const normalized = normalizeTavernSettings(current)
      if (JSON.stringify(normalized) !== JSON.stringify(current)) await this.database.settings.put(normalized)
      return normalized
    }
    const defaults = createMistvaleDefaults().settings
    await this.database.settings.put(defaults)
    return defaults
  }

  async saveSettings(value: TavernSettings): Promise<void> {
    await this.database.settings.put(normalizeTavernSettings(value))
  }
}

export function createTavernRepository(
  database: MistvaleTavernDatabase = tavernDatabase,
  contentPackLoader: TavernContentPackLoader = defaultContentPackLoader,
): TavernRepository {
  return new DexieTavernRepository(database, contentPackLoader)
}

export const tavernRepository = createTavernRepository()
