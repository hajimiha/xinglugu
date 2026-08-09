import { crops, locations, spells } from './data'
import { getSeasonForDay, getWeekday, MAX_GAME_YEAR } from './calendar'
import { ITEM_CATALOG, MACHINE_RECIPES, MINE_MAX_FLOOR, MONSTER_PARTNERS } from './economy'
import { initialGameState } from './reducer'
import { normalizeGameRules } from './rules'
import type { AffinityStage, FarmMachineState, GameState, LocationId, MachineId, MonsterPartnerId, Plot, Relationship, SkillId } from './types'

export const GAME_SAVE_STORAGE_KEY = 'mistvale-game-save-v1'
export const GAME_SAVE_SCHEMA_VERSION = 1 as const

export interface GameSaveEnvelope {
  schemaVersion: typeof GAME_SAVE_SCHEMA_VERSION
  savedAt: number
  state: GameState
}

export function getBrowserGameStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function sanitizeGameState(value: Partial<GameState>): GameState {
  const number = (candidate: unknown, fallback: number, minimum = 0) =>
    typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= minimum ? candidate : fallback
  const integer = (candidate: unknown, fallback: number, minimum = 0) => Math.floor(number(candidate, fallback, minimum))
  const boolean = (candidate: unknown, fallback: boolean) => typeof candidate === 'boolean' ? candidate : fallback
  const stringList = (candidate: unknown) => Array.isArray(candidate)
    ? candidate.filter((item): item is string => typeof item === 'string').slice(0, 200)
    : []

  const validLocations = new Set(locations.map((location) => location.id))
  const location = validLocations.has(value.location as LocationId) ? value.location as LocationId : initialGameState.location
  const maxEnergy = integer(value.maxEnergy, initialGameState.maxEnergy, 1)
  const rawStats: Record<string, unknown> = isObject(value.stats) ? value.stats : {}
  const maxHealth = integer(rawStats.maxHealth, initialGameState.stats.maxHealth, 1)
  const maxMana = integer(rawStats.maxMana, initialGameState.stats.maxMana, 1)

  const skillIds = Object.keys(initialGameState.skills) as SkillId[]
  const rawSkills: Record<string, unknown> = isObject(value.skills) ? value.skills : {}
  const skills = Object.fromEntries(skillIds.map((id) => {
    const fallback = initialGameState.skills[id]
    const raw: Record<string, unknown> = isObject(rawSkills[id]) ? rawSkills[id] : {}
    return [id, {
      level: integer(raw.level, fallback.level, 1),
      experience: integer(raw.experience, fallback.experience),
      nextLevel: integer(raw.nextLevel, fallback.nextLevel, 1),
    }]
  })) as GameState['skills']

  const knownItemIds = new Set(Object.keys(ITEM_CATALOG))
  const inventory = Object.fromEntries(Object.entries(isObject(value.inventory) ? value.inventory : {})
    .filter((entry): entry is [string, number] => knownItemIds.has(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1]) && entry[1] >= 0)
    .map(([id, amount]) => [id, Math.floor(amount)]))

  const fallbackPlots = () => initialGameState.plots.map((plot) => ({ ...plot }))
  const knownCropIds = new Set(crops.map((crop) => crop.id))
  const sanitizePlots = (): Plot[] => {
    if (!Array.isArray(value.plots) || value.plots.length < initialGameState.plots.length) return fallbackPlots()
    const seen = new Set<string>()
    const parsed: Plot[] = []
    for (const candidate of value.plots) {
      if (!isObject(candidate)) return fallbackPlots()
      const { id, row, column } = candidate
      if (typeof id !== 'string' || !Number.isInteger(row) || !Number.isInteger(column)) return fallbackPlots()
      const safeRow = row as number
      const safeColumn = column as number
      const coordinate = `${safeRow}-${safeColumn}`
      if (safeRow < 1 || safeRow > 30 || safeColumn < 1 || safeColumn > 12 || id !== `plot-${coordinate}` || seen.has(coordinate)) return fallbackPlots()
      seen.add(coordinate)
      const cropId = typeof candidate.cropId === 'string' && knownCropIds.has(candidate.cropId) ? candidate.cropId : undefined
      parsed.push({
        id,
        row: safeRow,
        column: safeColumn,
        ...(cropId ? { cropId } : {}),
        ...(cropId && typeof candidate.plantedAt === 'number' && Number.isFinite(candidate.plantedAt) && candidate.plantedAt >= 0 ? { plantedAt: candidate.plantedAt } : {}),
        ...(cropId && typeof candidate.remainingHours === 'number' && Number.isFinite(candidate.remainingHours) && candidate.remainingHours >= 0 ? { remainingHours: candidate.remainingHours } : {}),
        watered: boolean(candidate.watered, false),
        fertilized: boolean(candidate.fertilized, false),
        ready: cropId ? boolean(candidate.ready, false) : false,
      })
    }

    const maxRow = Math.max(...parsed.map((plot) => plot.row))
    for (let row = 1; row <= maxRow; row += 1) {
      const columns = parsed.filter((plot) => plot.row === row).map((plot) => plot.column).sort((a, b) => a - b)
      const validLength = row <= 4 ? columns.length === 6 : [6, 8, 10, 12].includes(columns.length)
      if (!validLength || columns.some((column, index) => column !== index + 1)) return fallbackPlots()
    }
    return parsed.sort((left, right) => left.row - right.row || left.column - right.column)
  }
  const plots = sanitizePlots()

  const affinityStages = new Set<AffinityStage>(['stranger', 'acquainted', 'trusted', 'intimate', 'bonded'])
  const rawRelationships: Record<string, unknown> = isObject(value.relationships) ? value.relationships : {}
  const relationships = Object.fromEntries(Object.entries(initialGameState.relationships).map(([id, fallback]) => {
    const raw: Record<string, unknown> = isObject(rawRelationships[id]) ? rawRelationships[id] : {}
    const relationship: Relationship = {
      affinity: integer(raw.affinity, fallback.affinity),
      stage: affinityStages.has(raw.stage as AffinityStage) ? raw.stage as AffinityStage : fallback.stage,
      chattedToday: boolean(raw.chattedToday, fallback.chattedToday),
      giftedToday: boolean(raw.giftedToday, fallback.giftedToday),
      memoryTags: stringList(raw.memoryTags),
    }
    return [id, relationship]
  })) as GameState['relationships']

  const rawQuests = Array.isArray(value.quests) ? value.quests : []
  const questStatuses = new Set(['available', 'active', 'ready', 'completed'])
  const quests = initialGameState.quests.map((fallback) => {
    const raw = rawQuests.find((quest) => isObject(quest) && quest.id === fallback.id)
    return { ...fallback, status: isObject(raw) && questStatuses.has(String(raw.status)) ? raw.status as typeof fallback.status : fallback.status }
  })

  const rawMine: Record<string, unknown> = isObject(value.mine) ? value.mine : {}
  const highestFloor = Math.min(MINE_MAX_FLOOR, integer(rawMine.highestFloor, initialGameState.mine.highestFloor, 1))
  const currentFloor = Math.min(MINE_MAX_FLOOR, integer(rawMine.currentFloor, initialGameState.mine.currentFloor, 1), highestFloor)
  const unlockedElevators = Array.isArray(rawMine.unlockedElevators)
    ? [...new Set(rawMine.unlockedElevators.filter((floor: unknown): floor is number => typeof floor === 'number' && Number.isInteger(floor) && [5, 10, 15].includes(floor) && floor <= highestFloor))].sort((a, b) => a - b)
    : []

  const rawTools: Record<string, unknown> = isObject(value.tools) ? value.tools : {}
  const toolLevel = (candidate: unknown, fallback: number) => Math.min(4, integer(candidate, fallback, 1))
  const rawEquipment: Record<string, unknown> = isObject(value.equipment) ? value.equipment : {}
  const rawRanch: Record<string, unknown> = isObject(value.ranch) ? value.ranch : {}
  const legacyRanchOwned = boolean(value.ownsMonsterRanch, initialGameState.ownsMonsterRanch)
  const ranchOwned = boolean(rawRanch.owned, legacyRanchOwned)
  const partnerIds = new Set(Object.keys(MONSTER_PARTNERS) as MonsterPartnerId[])
  let residents = ranchOwned
    ? [...new Set(stringList(rawRanch.residents).filter((id): id is MonsterPartnerId => partnerIds.has(id as MonsterPartnerId)))]
    : []
  const dragonStates = new Set(['wild', 'promised', 'resident'])
  let dragonStatus = dragonStates.has(String(rawRanch.dragonStatus))
    ? rawRanch.dragonStatus as GameState['ranch']['dragonStatus']
    : 'wild'
  if (!ranchOwned && dragonStatus === 'resident') dragonStatus = 'promised'
  if (ranchOwned && (dragonStatus === 'resident' || dragonStatus === 'promised' || residents.includes('dragon-girl'))) {
    dragonStatus = 'resident'
    if (!residents.includes('dragon-girl')) residents.push('dragon-girl')
  } else if (dragonStatus !== 'resident') {
    residents = residents.filter((id) => id !== 'dragon-girl')
  }
  const ranch: GameState['ranch'] = { owned: ranchOwned, residents, dragonStatus }

  const rawMachines: Record<string, unknown> = isObject(value.machines) ? value.machines : {}
  const sanitizeMachine = (machineId: MachineId): FarmMachineState => {
    const raw: Record<string, unknown> = isObject(rawMachines[machineId]) ? rawMachines[machineId] as Record<string, unknown> : {}
    const built = boolean(raw.built, initialGameState.machines[machineId].built)
    if (!built || !isObject(raw.job)) return { built }
    const recipe = typeof raw.job.recipeId === 'string' ? MACHINE_RECIPES[raw.job.recipeId] : undefined
    const batches = raw.job.batches
    const completesAt = raw.job.completesAt
    const poweredBy = raw.job.poweredBy
    if (!recipe || recipe.machine !== machineId || !Number.isInteger(batches) || (batches as number) < 1 || (batches as number) > 999 || typeof completesAt !== 'number' || !Number.isFinite(completesAt) || completesAt < 0 || (poweredBy !== 'magic' && poweredBy !== 'partner')) return { built }
    const outputQuantity = recipe.outputPerBatch * (batches as number)
    if (raw.job.outputItemId !== recipe.outputItemId || raw.job.outputQuantity !== outputQuantity) return { built }
    return { built, job: { recipeId: recipe.id, batches: batches as number, outputItemId: recipe.outputItemId, outputQuantity, completesAt, poweredBy } }
  }
  const machines: GameState['machines'] = { furnace: sanitizeMachine('furnace'), mill: sanitizeMachine('mill') }
  const rawFishing: Record<string, unknown> = isObject(value.fishing) ? value.fishing : {}
  const knownSpellIds = new Set(spells.map((spell) => spell.id))
  const year = Math.min(MAX_GAME_YEAR, integer(value.year, initialGameState.year, 1))
  const day = Math.min(365, integer(value.day, initialGameState.day, 1))

  return {
    ...initialGameState,
    year,
    day,
    season: getSeasonForDay(day),
    weekday: getWeekday(year, day),
    minutes: Math.min(1439, integer(value.minutes, initialGameState.minutes)),
    weather: (['薄雾', '晴', '雨'] as const).includes(value.weather as GameState['weather']) ? value.weather as GameState['weather'] : initialGameState.weather,
    location,
    energy: Math.min(integer(value.energy, initialGameState.energy), maxEnergy),
    maxEnergy,
    money: integer(value.money, initialGameState.money),
    rules: normalizeGameRules(isObject(value.rules) ? value.rules : initialGameState.rules),
    skills,
    stats: {
      health: Math.min(integer(rawStats.health, initialGameState.stats.health), maxHealth),
      maxHealth,
      attack: integer(rawStats.attack, initialGameState.stats.attack),
      mana: Math.min(integer(rawStats.mana, initialGameState.stats.mana), maxMana),
      maxMana,
      magicDamage: integer(rawStats.magicDamage, initialGameState.stats.magicDamage),
    },
    inventory,
    plots,
    relationships,
    quests,
    knownSpells: stringList(value.knownSpells).filter((id) => knownSpellIds.has(id)),
    mine: { currentFloor, highestFloor, unlockedElevators },
    hospitalUsedToday: boolean(value.hospitalUsedToday, initialGameState.hospitalUsedToday),
    ownsMonsterRanch: ranchOwned,
    ranch,
    machines,
    battle: undefined,
    tools: {
      hoe: toolLevel(rawTools.hoe, initialGameState.tools.hoe),
      rod: toolLevel(rawTools.rod, initialGameState.tools.rod),
      pickaxe: toolLevel(rawTools.pickaxe, initialGameState.tools.pickaxe),
    },
    equipment: {
      sword: toolLevel(rawEquipment.sword, initialGameState.equipment.sword),
      armor: toolLevel(rawEquipment.armor, initialGameState.equipment.armor),
    },
    fishing: {
      active: false,
      ...(typeof rawFishing.lastCatch === 'string' ? { lastCatch: rawFishing.lastCatch } : {}),
    },
    activeModal: null,
    selectedNpcId: undefined,
    selectedPlotId: undefined,
    toasts: [],
  }
}

export function createGameSaveEnvelope(state: GameState, savedAt = Date.now()): GameSaveEnvelope {
  return { schemaVersion: GAME_SAVE_SCHEMA_VERSION, savedAt, state: sanitizeGameState(state) }
}

export function serializeGameSave(state: GameState, savedAt = Date.now()): string {
  return JSON.stringify(createGameSaveEnvelope(state, savedAt), null, 2)
}

export function parseGameSave(raw: string): GameSaveEnvelope | null {
  try {
    const candidate = JSON.parse(raw) as unknown
    if (!isObject(candidate) || candidate.schemaVersion !== GAME_SAVE_SCHEMA_VERSION || !isObject(candidate.state)) return null
    const savedAt = typeof candidate.savedAt === 'number' && Number.isFinite(candidate.savedAt) ? candidate.savedAt : Date.now()
    return { schemaVersion: GAME_SAVE_SCHEMA_VERSION, savedAt, state: sanitizeGameState(candidate.state as Partial<GameState>) }
  } catch {
    return null
  }
}

export function loadGameSave(storage: Storage | undefined = getBrowserGameStorage()): GameSaveEnvelope | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(GAME_SAVE_STORAGE_KEY)
    return raw ? parseGameSave(raw) : null
  } catch {
    return null
  }
}

export function saveGameState(state: GameState, storage: Storage | undefined = getBrowserGameStorage(), savedAt = Date.now()): GameSaveEnvelope | null {
  if (!storage) return null
  const envelope = createGameSaveEnvelope(state, savedAt)
  try {
    storage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify(envelope))
    return envelope
  } catch {
    return null
  }
}

export function clearGameSave(storage: Storage | undefined = getBrowserGameStorage()): void {
  try { storage?.removeItem(GAME_SAVE_STORAGE_KEY) } catch { /* 保持当前会话可玩 */ }
}
