import { createMistvaleDefaults, createMistvaleLorebookSections, DEFAULT_CONTENT_VERSION, DEFAULT_PRESET_ID, MONSTER_GIRL_CARD_IDS, refreshCharacterProfileEntries } from './defaults'
import { normalizeTavernSettings } from './api-config'
import type { MistvaleTavernDatabase } from './database'
import { tavernDatabase } from './database'
import type { CharacterCard, ChatMessage, ChatPreset, ChatSession, Lorebook, ParsedTags, PromptTraceSegment, TavernRequestAudit, TavernSettings } from './types'
import { createImageGenerationRepository, type ImageGenerationRepository } from './image-generation/repository'
import { loadRepositoryContentPack, mergeById, type TavernContentPack } from './content-pack'
import { createDefaultPortraitSlots, legacyPortraitsToSlots, parsePortraitSlots } from './portrait-slots'
import { parseVariableDefinitions } from './variable-definitions'
import { migrateSystemBranding } from './branding-migration'
import {
  CALENDAR_FESTIVALS_ID,
  consolidateMistvaleLorebooks,
  LEGACY_MISTVALE_LOREBOOK_IDS,
  mapConsolidatedLorebookIds,
  PRODUCTION_PARTNERS_ID,
  WORLD_RULES_ID,
} from './lorebook-consolidation'

export type TavernContentPackLoader = () => Promise<TavernContentPack | null>
const defaultContentPackLoader: TavernContentPackLoader = import.meta.env.MODE === 'test'
  ? async () => null
  : loadRepositoryContentPack

let defaultCharacterCache: CharacterCard[] | undefined

function getDefaultCharacter(raw: Record<string, unknown>): CharacterCard | undefined {
  defaultCharacterCache ??= createMistvaleDefaults().characters
  return defaultCharacterCache.find((card) => (
    (typeof raw.id === 'string' && card.id === raw.id)
    || (typeof raw.npcId === 'string' && card.npcId === raw.npcId)
  ))
}

function normalizeStoredCharacter(value: CharacterCard): CharacterCard {
  const raw = value as CharacterCard & { portraitSlots?: unknown; portraitByAffinity?: unknown }
  const fallback = getDefaultCharacter(raw as unknown as Record<string, unknown>)
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
  const safeText = (candidate: unknown, fallbackValue = '') => typeof candidate === 'string' ? candidate : fallbackValue
  const safeList = (candidate: unknown, fallbackValue: string[] = []) => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string')
    : [...fallbackValue]
  const safeTime = (candidate: unknown, fallbackValue: number) => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0
    ? candidate
    : fallbackValue
  const createdAt = safeTime(raw.createdAt, fallback?.createdAt ?? Date.now())
  return {
    ...character,
    id: safeText(raw.id, fallback?.id ?? `recovered-character-${createdAt}`),
    npcId: safeText(raw.npcId, fallback?.npcId ?? 'unknown-npc'),
    name: safeText(raw.name, fallback?.name ?? '恢复的角色'),
    role: safeText(raw.role, fallback?.role ?? '女性居民'),
    locationId: safeText(raw.locationId, fallback?.locationId ?? 'farm'),
    description: safeText(raw.description, fallback?.description),
    personality: safeText(raw.personality, fallback?.personality),
    scenario: safeText(raw.scenario, fallback?.scenario),
    firstMessage: safeText(raw.firstMessage, fallback?.firstMessage),
    exampleDialogue: safeText(raw.exampleDialogue, fallback?.exampleDialogue),
    lorebookIds: safeList(raw.lorebookIds, fallback?.lorebookIds),
    tags: safeList(raw.tags, fallback?.tags),
    portraitSlots,
    createdAt,
    updatedAt: safeTime(raw.updatedAt, fallback?.updatedAt ?? createdAt),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function finiteTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').slice(0, 500) : []
}

function normalizeParsedTags(value: unknown): ParsedTags | undefined {
  if (!isRecord(value)) return undefined
  const rawCommands = isRecord(value.varsCommands) && isRecord(value.varsCommands.merge)
    ? value.varsCommands.merge
    : {}
  const rawUnknown = isRecord(value.unknown) ? value.unknown : {}
  return {
    thinking: typeof value.thinking === 'string' ? value.thinking : '',
    maintext: typeof value.maintext === 'string' ? value.maintext : '',
    options: stringArray(value.options),
    sum: typeof value.sum === 'string' ? value.sum : '',
    varsRaw: typeof value.varsRaw === 'string' ? value.varsRaw : '',
    varsCommands: { merge: { ...rawCommands } },
    unknown: Object.fromEntries(Object.entries(rawUnknown).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
  }
}

function normalizeStoredMessage(value: unknown, index: number, fallbackTimestamp: number): ChatMessage | null {
  if (!isRecord(value) || typeof value.content !== 'string') return null
  if (value.role !== 'system' && value.role !== 'user' && value.role !== 'assistant') return null
  const timestamp = finiteTimestamp(value.timestamp, fallbackTimestamp + index)
  const metadata = isRecord(value.metadata)
    ? {
        ...(typeof value.metadata.tokenCount === 'number' && Number.isFinite(value.metadata.tokenCount) ? { tokenCount: value.metadata.tokenCount } : {}),
        ...(Array.isArray(value.metadata.lorebookEntries) ? { lorebookEntries: stringArray(value.metadata.lorebookEntries) } : {}),
        ...(typeof value.metadata.processingTime === 'number' && Number.isFinite(value.metadata.processingTime) ? { processingTime: value.metadata.processingTime } : {}),
        ...(typeof value.metadata.providerReasoning === 'string' ? { providerReasoning: value.metadata.providerReasoning } : {}),
      }
    : undefined
  const parsed = normalizeParsedTags(value.parsed)
  const messageVariables = isRecord(value.variables)
    ? Object.fromEntries(Object.entries(value.variables).filter((entry): entry is [string, string | number] => typeof entry[1] === 'string' || typeof entry[1] === 'number'))
    : undefined
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id : `legacy-message-${timestamp}-${index}`,
    role: value.role,
    content: value.content,
    timestamp,
    ...(messageVariables ? { variables: messageVariables } : {}),
    ...(metadata ? { metadata } : {}),
    ...(parsed ? { parsed } : {}),
    ...(isRecord(value.variablesAfter) ? { variablesAfter: { ...value.variablesAfter } } : {}),
    ...(value.apiUsed === 'local' || value.apiUsed === 'remote' ? { apiUsed: value.apiUsed } : {}),
  }
}

export function normalizeStoredSession(value: ChatSession): ChatSession {
  const raw = value as ChatSession & Record<string, unknown>
  const now = Date.now()
  const createdAt = finiteTimestamp(raw.createdAt, now)
  const messages = Array.isArray(raw.messages)
    ? raw.messages.map((message, index) => normalizeStoredMessage(message, index, createdAt)).filter((message): message is ChatMessage => Boolean(message))
    : []
  let variableDefinitions
  try {
    variableDefinitions = raw.variableDefinitions === undefined
      ? undefined
      : parseVariableDefinitions(raw.variableDefinitions)
        .filter((definition) => definition.scope === 'session')
  } catch {
    variableDefinitions = undefined
  }
  return {
    ...value,
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `legacy-session-${createdAt}`,
    name: typeof raw.name === 'string' ? raw.name : '恢复的旧会话',
    messages,
    ...(typeof raw.characterId === 'string' ? { characterId: raw.characterId } : { characterId: undefined }),
    ...(typeof raw.npcId === 'string' ? { npcId: raw.npcId } : { npcId: undefined }),
    ...(typeof raw.branchFromSessionId === 'string' ? { branchFromSessionId: raw.branchFromSessionId } : { branchFromSessionId: undefined }),
    characterName: typeof raw.characterName === 'string' ? raw.characterName : '未知角色',
    userName: typeof raw.userName === 'string' ? raw.userName : '旅行者',
    presetId: typeof raw.presetId === 'string' ? raw.presetId : null,
    ...(isRecord(raw.presetBinding) && raw.presetBinding.mode === 'pinned' && typeof raw.presetBinding.presetId === 'string'
      ? { presetBinding: { mode: 'pinned' as const, presetId: raw.presetBinding.presetId } }
      : isRecord(raw.presetBinding) && raw.presetBinding.mode === 'follow-active'
        ? { presetBinding: { mode: 'follow-active' as const } }
        : { presetBinding: undefined }),
    lorebookIds: stringArray(raw.lorebookIds),
    variables: isRecord(raw.variables) ? { ...raw.variables } : {},
    createdAt,
    updatedAt: finiteTimestamp(raw.updatedAt, createdAt),
    ...(variableDefinitions ? { variableDefinitions } : { variableDefinitions: undefined }),
  }
}

function normalizeStoredAudit(value: TavernRequestAudit): TavernRequestAudit {
  return {
    ...value,
    segments: value.segments.map((segment) => {
      const legacy = segment as PromptTraceSegment & { messageIndex?: unknown }
      return {
        ...segment,
        messageIndex: typeof legacy.messageIndex === 'number' && Number.isInteger(legacy.messageIndex)
          ? legacy.messageIndex
          : null,
        sent: Boolean(segment.sent),
      }
    }),
  }
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
  saveCharacters(values: CharacterCard[]): Promise<void>
  deleteCharacter(id: string): Promise<void>
  listSessions(): Promise<ChatSession[]>
  getSession(id: string): Promise<ChatSession | undefined>
  saveSession(value: ChatSession): Promise<void>
  commitTurn(session: ChatSession, audit: TavernRequestAudit, settings?: TavernSettings): Promise<void>
  deleteSession(id: string): Promise<void>
  getSettings(): Promise<TavernSettings>
  saveSettings(value: TavernSettings): Promise<void>
  listRequestAudits(): Promise<TavernRequestAudit[]>
  saveRequestAudit(value: TavernRequestAudit): Promise<void>
  clearRequestAudits(): Promise<void>
  getImageGenerationRepository(): ImageGenerationRepository
}

class DexieTavernRepository implements TavernRepository {
  constructor(
    private readonly database: MistvaleTavernDatabase,
    private readonly contentPackLoader: TavernContentPackLoader,
  ) {}

  getImageGenerationRepository(): ImageGenerationRepository {
    return createImageGenerationRepository(this.database)
  }

  async initialize(): Promise<void> {
    const defaults = createMistvaleDefaults()
    const defaultLorebookSections = createMistvaleLorebookSections()
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
        const shouldMigrateFishingAndGifts = storedContentVersion < 6
        const shouldConsolidateLorebooks = storedContentVersion < 7
        const shouldMigrateBranding = storedContentVersion < 8
        const shouldMigrateGeneratedPortraits = storedContentVersion < 9
        const shouldMigrateCharacterProfiles = storedContentVersion < 10
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
            const missingMigrationBooks = defaultLorebookSections.filter((book) => migrationLorebookIds.includes(book.id) && !existingIds.has(book.id))
            if (missingMigrationBooks.length) await this.database.lorebooks.bulkAdd(missingMigrationBooks)
          }
          if (shouldMigrateFishingAndGifts) {
            const storedBook = await this.database.lorebooks.get(WORLD_RULES_ID)
            const defaultBook = defaultLorebookSections.find((book) => book.id === WORLD_RULES_ID)
            if (storedBook && defaultBook) {
              const existingEntryIds = new Set(storedBook.entries.map((item) => item.id))
              const newEntries = defaultBook.entries.filter((item) => (
                ['mistvale-rule-gifts', 'mistvale-rule-fishing'].includes(item.id) && !existingEntryIds.has(item.id)
              ))
              if (newEntries.length) {
                await this.database.lorebooks.put({
                  ...storedBook,
                  entries: [...storedBook.entries, ...newEntries],
                  updatedAt: Date.now(),
                })
              }
            }
          }
          if (shouldPublishPack && contentPack?.lorebooks.length) await this.database.lorebooks.bulkPut(contentPack.lorebooks)
          if (shouldConsolidateLorebooks) {
            const storedSections = (await this.database.lorebooks.bulkGet([...LEGACY_MISTVALE_LOREBOOK_IDS]))
              .filter((book): book is Lorebook => Boolean(book))
            const merged = consolidateMistvaleLorebooks(storedSections)
            if (merged) {
              await this.database.lorebooks.put(merged)
              await this.database.lorebooks.bulkDelete(
                LEGACY_MISTVALE_LOREBOOK_IDS.filter((id) => id !== WORLD_RULES_ID),
              )
            }
          }
        }
        if (shouldMigrateBranding) {
          const systemBook = await this.database.lorebooks.get(WORLD_RULES_ID)
          if (systemBook) await this.database.lorebooks.put(migrateSystemBranding(systemBook))
        }
        if (shouldMigrateCharacterProfiles) {
          const systemBook = await this.database.lorebooks.get(WORLD_RULES_ID)
          if (systemBook) await this.database.lorebooks.put(refreshCharacterProfileEntries(systemBook, defaultLorebookSections))
        }
        if ((await this.database.presets.count()) === 0) {
          await this.database.presets.bulkAdd(mergeById(defaults.presets, contentPack?.presets ?? []))
        } else if (shouldPublishPack && contentPack?.presets.length) {
          await this.database.presets.bulkPut(contentPack.presets)
        }
        if (shouldMigrateBranding) {
          const systemPreset = await this.database.presets.get(DEFAULT_PRESET_ID)
          if (systemPreset) await this.database.presets.put(migrateSystemBranding(systemPreset))
        }
        if ((await this.database.characters.count()) === 0) {
          await this.database.characters.bulkAdd(mergeById(defaults.characters, contentPack?.characters ?? []))
        } else {
          const normalizedCharacters = (await this.database.characters.toArray()).map(normalizeStoredCharacter)
          if (normalizedCharacters.length) await this.database.characters.bulkPut(normalizedCharacters)
          if (shouldPublishPack && contentPack?.characters.length) {
            const existingById = new Map(normalizedCharacters.map((card) => [card.id, card]))
            const publishedCharacters = contentPack.characters.map((card) => {
              const existing = existingById.get(card.id)
              return existing?.portraitSlots.some((slot) => Boolean(slot.source))
                ? { ...card, portraitSlots: existing.portraitSlots.map((slot) => ({ ...slot })) }
                : card
            })
            await this.database.characters.bulkPut(publishedCharacters)
          }
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
            if (shouldMigrateGeneratedPortraits) {
              const defaultById = new Map(defaults.characters.map((card) => [card.id, card]))
              const generatedPortraits = (await this.database.characters.toArray())
                .filter((card) => defaultById.has(card.id) && card.portraitSlots.every((slot) => !slot.source))
                .map((card) => ({
                  ...card,
                  portraitSlots: defaultById.get(card.id)!.portraitSlots.map((slot) => ({ ...slot })),
                  updatedAt: Date.now(),
                }))
              if (generatedPortraits.length) await this.database.characters.bulkPut(generatedPortraits)
            }
            if (shouldConsolidateLorebooks) {
              const consolidatedCharacters = (await this.database.characters.toArray())
                .map((card) => ({ ...card, lorebookIds: mapConsolidatedLorebookIds(card.lorebookIds) }))
              if (consolidatedCharacters.length) await this.database.characters.bulkPut(consolidatedCharacters)
            }
          }
        }
        if (shouldMigrateBranding) {
          const defaultCharacterIds = new Set(defaults.characters.map((card) => card.id))
          const systemCharacters = (await this.database.characters.toArray())
            .filter((card) => defaultCharacterIds.has(card.id))
            .map((card) => migrateSystemBranding(card))
          if (systemCharacters.length) await this.database.characters.bulkPut(systemCharacters)
        }
        if ((await this.database.sessions.count()) === 0 && defaults.sessions.length > 0) {
          await this.database.sessions.bulkAdd(defaults.sessions)
        } else if (shouldMigrateDefaults) {
          const defaultNpcIds = new Set(defaults.characters.map((card) => card.npcId))
          const rawSessions = await this.database.sessions.toArray()
          const migratedSessions = rawSessions
            .map((rawSession) => {
              const session = normalizeStoredSession(rawSession)
              const shouldAddLorebooks = Boolean(
                session.npcId
                && defaultNpcIds.has(session.npcId)
                && migrationLorebookIds.some((id) => !session.lorebookIds.includes(id)),
              )
              const next = {
                ...session,
                lorebookIds: shouldConsolidateLorebooks
                  ? mapConsolidatedLorebookIds([
                      ...session.lorebookIds,
                      ...(shouldAddLorebooks ? migrationLorebookIds : []),
                    ])
                  : (shouldAddLorebooks
                      ? Array.from(new Set([...session.lorebookIds, ...migrationLorebookIds]))
                      : session.lorebookIds),
                ...(shouldMigratePresetBinding && !session.presetBinding
                  ? { presetId: null, presetBinding: { mode: 'follow-active' as const } }
                  : {}),
              }
              return JSON.stringify(next) === JSON.stringify(rawSession) ? null : next
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
              activeLorebookIds: shouldConsolidateLorebooks
                ? mapConsolidatedLorebookIds([...(storedSettings?.activeLorebookIds ?? []), ...migrationLorebookIds])
                : Array.from(new Set([...(storedSettings?.activeLorebookIds ?? []), ...migrationLorebookIds])),
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
  async deletePreset(id: string) {
    await this.database.transaction(
      'rw',
      this.database.presets,
      this.database.sessions,
      this.database.settings,
      async () => {
        await this.database.presets.delete(id)
        const now = Date.now()
        const pinnedSessions = (await this.database.sessions.toArray()).filter((session) => (
          session.presetBinding?.mode === 'pinned' && session.presetBinding.presetId === id
        ))
        if (pinnedSessions.length) {
          await this.database.sessions.bulkPut(pinnedSessions.map((session) => ({
            ...session,
            presetId: null,
            presetBinding: { mode: 'follow-active' as const },
            updatedAt: now,
          })))
        }
        const currentSettings = await this.database.settings.get('mistvale-settings')
        if (currentSettings?.activePresetId === id) {
          const fallback = await this.database.presets.orderBy('updatedAt').reverse().first()
          await this.database.settings.update('mistvale-settings', {
            activePresetId: fallback?.id ?? null,
            updatedAt: now,
          })
        }
      },
    )
  }

  async listCharacters() {
    return (await this.database.characters.orderBy('name').toArray()).map(normalizeStoredCharacter)
  }

  async getCharacter(id: string) {
    const character = await this.database.characters.get(id)
    return character ? normalizeStoredCharacter(character) : undefined
  }

  async saveCharacter(value: CharacterCard) {
    await this.database.characters.put(normalizeStoredCharacter(value))
  }
  async saveCharacters(values: CharacterCard[]) {
    await this.database.transaction('rw', this.database.characters, async () => {
      await this.database.characters.bulkPut(values.map(normalizeStoredCharacter))
    })
  }
  async deleteCharacter(id: string) { await this.database.characters.delete(id) }

  async listSessions() { return (await this.database.sessions.orderBy('updatedAt').reverse().toArray()).map(normalizeStoredSession) }
  async getSession(id: string) { const value = await this.database.sessions.get(id); return value ? normalizeStoredSession(value) : undefined }
  async saveSession(value: ChatSession) {
    await this.database.sessions.put(normalizeStoredSession(value))
  }
  async commitTurn(session: ChatSession, audit: TavernRequestAudit, settings?: TavernSettings): Promise<void> {
    const normalizedSession = normalizeStoredSession(session)
    await this.database.transaction('rw', this.database.sessions, this.database.requestAudits, this.database.settings, async () => {
      await this.database.sessions.put(normalizedSession)
      if (settings) await this.database.settings.put(normalizeTavernSettings(settings))
      await this.database.requestAudits.put(audit)
      const expired = await this.database.requestAudits.orderBy('createdAt').reverse().offset(20).primaryKeys()
      if (expired.length) await this.database.requestAudits.bulkDelete(expired)
    })
  }
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

  async listRequestAudits() {
    return (await this.database.requestAudits.orderBy('createdAt').reverse().toArray()).map(normalizeStoredAudit)
  }
  async saveRequestAudit(value: TavernRequestAudit): Promise<void> {
    await this.database.requestAudits.put(value)
    const expired = await this.database.requestAudits.orderBy('createdAt').reverse().offset(20).primaryKeys()
    if (expired.length) await this.database.requestAudits.bulkDelete(expired)
  }
  async clearRequestAudits(): Promise<void> { await this.database.requestAudits.clear() }
}

export function createTavernRepository(
  database: MistvaleTavernDatabase = tavernDatabase,
  contentPackLoader: TavernContentPackLoader = defaultContentPackLoader,
): TavernRepository {
  return new DexieTavernRepository(database, contentPackLoader)
}

export const tavernRepository = createTavernRepository()
