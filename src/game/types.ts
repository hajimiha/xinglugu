import type { ReactNode } from 'react'

export type ElementType = 'metal' | 'wood' | 'water' | 'fire' | 'earth'
export type Season = '春' | '夏' | '秋' | '冬'
export type Weather = '薄雾' | '晴' | '雨'
export type LocationId =
  | 'farm'
  | 'mayor-home'
  | 'general-store'
  | 'smithy'
  | 'monster-market'
  | 'witch-home'
  | 'hunter-camp'
  | 'mine'
  | 'fisher-home'
  | 'library'
  | 'hospital'

export type AffinityStage = 'stranger' | 'acquainted' | 'trusted' | 'intimate' | 'bonded'
export type NpcAction = 'chat' | 'gift' | 'trade' | 'quest' | 'profile'
export type SkillId = 'fishing' | 'farming' | 'mining' | 'combat' | 'magic'
export type EnergyCostMode = 'free' | 'normal' | 'double'
export type MonsterPartnerId = 'cow-girl' | 'bee-girl' | 'spider-girl' | 'fire-slime-girl' | 'water-slime-girl' | 'dragon-girl'

export interface GameRuleSettings {
  experienceMultiplier: number
  affinityMultiplier: number
  dropMultiplier: number
  moneyMultiplier: number
  cropGrowthMultiplier: number
  playerDamageMultiplier: number
  enemyDamageMultiplier: number
  recoveryMultiplier: number
  energyCostMode: EnergyCostMode
}

export interface SkillProgress {
  level: number
  experience: number
  nextLevel: number
}

export interface Npc {
  id: string
  name: string
  role: string
  locationId: LocationId
  description: string
  availableActions: NpcAction[]
  preferredGifts: string[]
  portraitByAffinity: Partial<Record<AffinityStage, string>>
  birthday: { month: number; day: number }
}

export interface ScheduleSegment {
  startMinute: number
  endMinute: number
  locationId: LocationId
  activity: string
}

export interface NpcDailySchedule {
  npcId: string
  defaultSegments: ScheduleSegment[]
  weeklyOverrides?: Partial<Record<number, ScheduleSegment[]>>
}

export interface FestivalActivity {
  id: string
  name: string
  description: string
  startMinute: number
  endMinute: number
}

export interface Festival {
  id: string
  name: string
  month: number
  date: number
  locationId: LocationId
  startMinute: number
  endMinute: number
  participantIds: string[]
  description: string
  activities: [FestivalActivity, FestivalActivity, FestivalActivity]
}

export interface Location {
  id: LocationId
  name: string
  subtitle: string
  description: string
  hours: string
  travelMinutes: number
  npcIds: string[]
  mapPosition?: { x: number; y: number; w: number; h: number }
  category: 'home' | 'village' | 'forest' | 'mountain' | 'coast'
}

export interface Crop {
  id: string
  name: string
  season: Season
  growthHours: number
  sellPrice: number
  color: string
  description: string
}

export interface Plot {
  id: string
  row: number
  column: number
  cropId?: string
  plantedAt?: number
  remainingHours?: number
  watered: boolean
  fertilized: boolean
  ready: boolean
}

export interface ShopItem {
  id: string
  name: string
  category: 'seed' | 'material' | 'bait' | 'tool' | 'potion' | 'gift'
  price: number
  sellPrice: number
  description: string
  season?: Season
  growthDays?: number
  element?: ElementType
  festivalId?: string
  festivalLocationId?: LocationId
}

export interface Quest {
  id: string
  title: string
  issuerId: string
  description: string
  requiredItemId: string
  requiredAmount: number
  rewardMoney: number
  rewardAffinity: number
  mayorAffinity: number
  expiresInDays: number
  status: 'available' | 'active' | 'ready' | 'completed'
}

export interface Spell {
  id: string
  name: string
  element: ElementType
  requiredLevel: number
  manaCost: number
  power: number
  kind: 'damage' | 'heal' | 'guard'
  description: string
}

export interface Relationship {
  affinity: number
  stage: AffinityStage
  chattedToday: boolean
  giftedToday: boolean
  memoryTags: string[]
}

export interface ToastMessage {
  id: string
  tone: 'success' | 'info' | 'warning' | 'danger'
  title: string
  message: string
}

export interface BattleState {
  floor: number
  enemyName: string
  enemyElement: ElementType
  enemyHealth: number
  enemyMaxHealth: number
  turn: number
  ended?: 'victory' | 'defeat'
  log: string[]
}

export type ModalType =
  | 'inventory'
  | 'character'
  | 'journal'
  | 'settings'
  | 'tavern'
  | 'calendar'
  | 'plot'
  | 'npc'
  | 'dialogue'
  | 'trade'
  | 'quest-board'
  | 'ranch'
  | 'hunter'
  | 'hospital'
  | 'library'
  | 'mine'
  | 'battle'
  | 'fishing'
  | null

export interface GameState {
  year: number
  day: number
  season: Season
  weekday: string
  minutes: number
  weather: Weather
  location: LocationId
  energy: number
  maxEnergy: number
  money: number
  rules: GameRuleSettings
  skills: Record<SkillId, SkillProgress>
  stats: { health: number; maxHealth: number; attack: number; mana: number; maxMana: number; magicDamage: number }
  inventory: Record<string, number>
  plots: Plot[]
  relationships: Record<string, Relationship>
  quests: Quest[]
  knownSpells: string[]
  mine: { currentFloor: number; highestFloor: number; unlockedElevators: number[] }
  hospitalUsedToday: boolean
  ownsMonsterRanch: boolean
  ranch: {
    owned: boolean
    residents: MonsterPartnerId[]
    dragonStatus: 'wild' | 'promised' | 'resident'
  }
  battle?: BattleState
  tools: { hoe: number; rod: number; pickaxe: number }
  fishing: { active: boolean; lastCatch?: string }
  activeModal: ModalType
  selectedNpcId?: string
  selectedPlotId?: string
  toasts: ToastMessage[]
}

export type GameAction =
  | { type: 'SPEND_ENERGY'; amount: number; reason: string }
  | { type: 'ADD_TOAST'; toast: Omit<ToastMessage, 'id'> }
  | { type: 'DISMISS_TOAST'; id: string }
  | { type: 'OPEN_MODAL'; modal: Exclude<ModalType, null>; npcId?: string; plotId?: string }
  | { type: 'CLOSE_MODAL' }
  | { type: 'TRAVEL_TO_LOCATION'; location: LocationId; minutes: number }
  | { type: 'ADVANCE_TIME'; minutes: number; reason: string }
  | { type: 'EXPAND_FARM'; roll: number }
  | { type: 'PLANT_PLOT'; plotId: string; seedId: string }
  | { type: 'WATER_PLOT'; plotId: string }
  | { type: 'FERTILIZE_PLOT'; plotId: string }
  | { type: 'HARVEST_PLOT'; plotId: string }
  | { type: 'BUY_ITEM'; itemId: string; quantity: number; total: number }
  | { type: 'SELL_ITEM'; itemId: string; quantity: number; total: number }
  | { type: 'CHAT_WITH_NPC'; npcId: string }
  | { type: 'GIVE_GIFT'; npcId: string; itemId: string; affinity: number }
  | { type: 'SUBMIT_QUEST'; questId: string }
  | { type: 'ACCEPT_QUEST'; questId: string }
  | { type: 'TRAIN_COMBAT' }
  | { type: 'USE_HOSPITAL' }
  | { type: 'BUY_RANCH' }
  | { type: 'BUY_MONSTER_PARTNER'; partnerId: MonsterPartnerId }
  | { type: 'INVITE_DRAGON'; method: 'battle' | 'coins' }
  | { type: 'LEARN_SPELL'; spellId: string }
  | { type: 'ENTER_MINE_FLOOR'; floor: number }
  | { type: 'MINE_ORE'; floor: number }
  | { type: 'START_BATTLE'; floor: number }
  | { type: 'BATTLE_ACTION'; action: 'physical' | 'spell' | 'defend' | 'item' | 'flee'; spellId?: string }
  | { type: 'START_FISHING' }
  | { type: 'CATCH_FISH'; result: 'silver-carp' | 'water-grass' | 'empty' }
  | { type: 'UPGRADE_TOOL'; tool: 'hoe' | 'rod' | 'pickaxe'; price: number }
  | { type: 'REFINE_ORE' }
  | { type: 'BUY_PERMANENT_UPGRADE'; upgrade: 'energy' | 'mana'; price: number }
  | { type: 'PLAYER_DEFEATED' }
  | { type: 'UPDATE_GAME_RULES'; rules: Partial<GameRuleSettings> }
  | { type: 'RESET_GAME_RULES' }
  | { type: 'REPLACE_GAME_STATE'; state: GameState }

export interface GameProviderProps { children: ReactNode; initialState?: GameState; storage?: Storage | null }
