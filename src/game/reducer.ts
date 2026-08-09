import { createInitialPlots, crops, getFarmExpansion, npcs, quests, shopItems, spells } from './data'
import { advanceCalendarClock, formatGameDate, getSeasonForDay, getWeekday, isNpcBirthday } from './calendar'
import {
  DEFAULT_GAME_RULES,
  canSpendEnergy,
  elementAdvantage,
  getEnergyCost,
  normalizeGameRules,
  scaleDamage,
  scaleGrowthHours,
  scaleReward,
} from './rules'
import type { GameAction, GameState, Relationship, ToastMessage } from './types'

let toastSequence = 0
const makeToast = (toast: Omit<ToastMessage, 'id'>): ToastMessage => ({
  ...toast,
  id: `notice-${Date.now()}-${toastSequence++}`,
})

const initialRelationships = Object.fromEntries(
  npcs.map((npc) => [npc.id, {
    affinity: 0,
    stage: 'stranger',
    chattedToday: false,
    giftedToday: false,
    memoryTags: [],
  } satisfies Relationship]),
)

function affinityStage(affinity: number): Relationship['stage'] {
  if (affinity >= 110) return 'bonded'
  if (affinity >= 75) return 'intimate'
  if (affinity >= 45) return 'trusted'
  if (affinity >= 20) return 'acquainted'
  return 'stranger'
}

function advancePlots(state: GameState, elapsedMinutes: number): GameState['plots'] {
  if (elapsedMinutes <= 0) return state.plots
  const elapsedHours = elapsedMinutes / 60
  return state.plots.map((plot) => {
    if (!plot.cropId || plot.ready || plot.remainingHours === undefined) return plot
    const remainingHours = Math.max(0, Number((plot.remainingHours - elapsedHours).toFixed(2)))
    return { ...plot, remainingHours, ready: remainingHours === 0 }
  })
}

export const initialGameState: GameState = {
  year: 1,
  day: 1,
  season: '春',
  weekday: '周一',
  minutes: 6 * 60 + 30,
  weather: '晴',
  location: 'farm',
  energy: 5,
  maxEnergy: 5,
  money: 500,
  rules: { ...DEFAULT_GAME_RULES },
  skills: {
    fishing: { level: 1, experience: 0, nextLevel: 60 },
    farming: { level: 1, experience: 0, nextLevel: 60 },
    mining: { level: 1, experience: 0, nextLevel: 60 },
    combat: { level: 1, experience: 0, nextLevel: 60 },
    magic: { level: 1, experience: 0, nextLevel: 60 },
  },
  stats: { health: 20, maxHealth: 20, attack: 4, mana: 10, maxMana: 10, magicDamage: 3 },
  inventory: {
    'moon-radish-seed': 8,
    'mist-bean-seed': 4,
  },
  plots: createInitialPlots(),
  relationships: initialRelationships,
  quests: quests.map((quest) => ({ ...quest, status: 'available' })),
  knownSpells: [],
  mine: { currentFloor: 1, highestFloor: 1, unlockedElevators: [] },
  hospitalUsedToday: false,
  ownsMonsterRanch: false,
  tools: { hoe: 1, rod: 1, pickaxe: 1 },
  fishing: { active: false },
  activeModal: null,
  toasts: [],
}

export function advanceGameClock(state: GameState, elapsedMinutes: number): GameState {
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes <= 0) return state
  const elapsed = Math.floor(elapsedMinutes)
  const target = advanceCalendarClock(state.year, state.day, state.minutes, elapsed)
  const crossedDays = (target.year - state.year) * 365 + target.day - state.day
  const actualElapsed = crossedDays * 1440 + target.minutes - state.minutes
  if (actualElapsed <= 0) return state
  const relationships = crossedDays > 0
    ? Object.fromEntries(Object.entries(state.relationships).map(([id, relationship]) => [id, {
      ...relationship,
      chattedToday: false,
      giftedToday: false,
    }])) as GameState['relationships']
    : state.relationships

  return {
    ...state,
    year: target.year,
    day: target.day,
    minutes: target.minutes,
    season: getSeasonForDay(target.day),
    weekday: getWeekday(target.year, target.day),
    energy: crossedDays > 0 ? state.maxEnergy : state.energy,
    hospitalUsedToday: crossedDays > 0 ? false : state.hospitalUsedToday,
    relationships,
    plots: advancePlots(state, actualElapsed),
  }
}

function reduceGameState(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'REPLACE_GAME_STATE':
      return action.state
    case 'UPDATE_GAME_RULES':
      return { ...state, rules: normalizeGameRules({ ...state.rules, ...action.rules }) }
    case 'RESET_GAME_RULES':
      return { ...state, rules: { ...DEFAULT_GAME_RULES } }
    case 'SPEND_ENERGY': {
      const cost = getEnergyCost(action.amount, state.rules.energyCostMode)
      const permission = canSpendEnergy(state, cost)
      if (!permission.allowed) {
        return {
          ...state,
          toasts: [...state.toasts, makeToast({
            tone: 'warning',
            title: '行动受阻',
            message: `精力不足，无法${action.reason}`,
          })],
        }
      }
      return { ...state, energy: state.energy - cost }
    }
    case 'EXPAND_FARM': {
      const currentRow = Math.max(0, ...state.plots.map((plot) => plot.row))
      if (currentRow >= 30) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'info', title: '田地已达上限', message: '南坡田区最多可以开拓三十行。' })] }
      }
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '精力不足', message: `需要 ${cost} 点精力才能开拓新田垄。` })] }
      }
      const reward = getFarmExpansion(state.tools.hoe, action.roll, state.rules.dropMultiplier)
      const row = currentRow + 1
      const plots = Array.from({ length: reward.plotCount }, (_, index) => ({
        id: `plot-${row}-${index + 1}`,
        row,
        column: index + 1,
        watered: false,
        fertilized: false,
        ready: false,
      }))
      const inventory = {
        ...state.inventory,
        wood: (state.inventory.wood ?? 0) + reward.wood,
        stone: (state.inventory.stone ?? 0) + reward.stone,
        ...(reward.moonflower > 0 ? { moonflower: (state.inventory.moonflower ?? 0) + reward.moonflower } : {}),
      }
      const flowerMessage = reward.moonflower > 0 ? `，并发现月铃花 ${reward.moonflower} 朵` : ''
      return {
        ...state,
        energy: state.energy - cost,
        inventory,
        plots: [...state.plots, ...plots],
        toasts: [...state.toasts, makeToast({
          tone: 'success',
          title: '新田垄开拓完成',
          message: `新增 ${reward.plotCount} 格，获得木头 ${reward.wood}、石头 ${reward.stone}${flowerMessage}。`,
        })],
      }
    }
    case 'ADD_TOAST':
      return { ...state, toasts: [...state.toasts, makeToast(action.toast)] }
    case 'DISMISS_TOAST':
      return { ...state, toasts: state.toasts.filter((toast) => toast.id !== action.id) }
    case 'OPEN_MODAL':
      return { ...state, activeModal: action.modal, selectedNpcId: action.npcId, selectedPlotId: action.plotId }
    case 'CLOSE_MODAL':
      return { ...state, activeModal: null, selectedNpcId: undefined, selectedPlotId: undefined }
    case 'TRAVEL_TO_LOCATION': {
      const advanced = advanceGameClock(state, action.minutes)
      return { ...advanced, location: action.location }
    }
    case 'ADVANCE_TIME': {
      if (state.battle) return state
      if (!Number.isFinite(action.minutes) || action.minutes <= 0) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '无法消磨时间', message: '请选择大于零的有效时长。' })] }
      }
      const elapsed = Math.min(Math.floor(action.minutes), 365 * 1440)
      const advanced = advanceGameClock(state, elapsed)
      return {
        ...advanced,
        toasts: [...advanced.toasts, makeToast({
          tone: 'info',
          title: '时间流逝',
          message: `${action.reason}。现在是${formatGameDate(advanced.year, advanced.day)} ${String(Math.floor(advanced.minutes / 60)).padStart(2, '0')}:${String(advanced.minutes % 60).padStart(2, '0')}。`,
        })],
      }
    }
    case 'PLANT_PLOT': {
      const plot = state.plots.find((item) => item.id === action.plotId)
      const seed = shopItems.find((item) => item.id === action.seedId && item.category === 'seed')
      const cropId = action.seedId.endsWith('-seed') ? action.seedId.slice(0, -5) : ''
      const crop = crops.find((item) => item.id === cropId)
      let message = ''
      if (!plot || !seed || !crop) message = '这不是可以播种的有效种子。'
      else if (plot.cropId) message = '该地块已经种有作物。'
      else if (seed.season !== state.season || crop.season !== state.season) message = `这种作物不适合在${state.season}季播种。`
      else if ((state.inventory[action.seedId] ?? 0) < 1) message = '背包里没有这包种子。'
      if (message || !plot || !seed || !crop) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '播种未完成', message })] }
      }
      const remainingHours = scaleGrowthHours(crop.growthHours, state.rules.cropGrowthMultiplier)
      return {
        ...state,
        inventory: { ...state.inventory, [action.seedId]: state.inventory[action.seedId] - 1 },
        plots: state.plots.map((item) => item.id === plot.id ? {
          ...item,
          cropId: crop.id,
          plantedAt: ((state.year - 1) * 365 + state.day - 1) * 1440 + state.minutes,
          remainingHours,
          watered: false,
          fertilized: false,
          ready: false,
        } : item),
        toasts: [...state.toasts, makeToast({ tone: 'success', title: '播种完成', message: `${crop.name}将在 ${remainingHours} 小时后成熟。` })],
      }
    }
    case 'WATER_PLOT':
      return {
        ...state,
        plots: state.plots.map((plot) => plot.id === action.plotId ? { ...plot, watered: true } : plot),
      }
    case 'FERTILIZE_PLOT': {
      if ((state.inventory['moss-fertilizer'] ?? 0) < 1) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '苔肥不足', message: '背包里没有可用的苔肥。' })] }
      }
      return {
        ...state,
        inventory: { ...state.inventory, 'moss-fertilizer': state.inventory['moss-fertilizer'] - 1 },
        plots: state.plots.map((plot) => {
          if (plot.id !== action.plotId || !plot.cropId || plot.fertilized) return plot
          const remainingHours = Math.max(0, (plot.remainingHours ?? 0) - 8)
          return { ...plot, fertilized: true, remainingHours, ready: remainingHours === 0 }
        }),
      }
    }
    case 'HARVEST_PLOT': {
      const plot = state.plots.find((item) => item.id === action.plotId)
      if (!plot?.cropId || !plot.ready) return state
      const harvestAmount = scaleReward(3, state.rules.dropMultiplier)
      const farmingExperience = scaleReward(10, state.rules.experienceMultiplier)
      return {
        ...state,
        inventory: { ...state.inventory, [plot.cropId]: (state.inventory[plot.cropId] ?? 0) + harvestAmount },
        plots: state.plots.map((item) => item.id === action.plotId
          ? { id: item.id, row: item.row, column: item.column, watered: false, fertilized: false, ready: false }
          : item),
        skills: {
          ...state.skills,
          farming: { ...state.skills.farming, experience: state.skills.farming.experience + farmingExperience },
        },
        toasts: [...state.toasts, makeToast({ tone: 'success', title: '收获完成', message: `已将 ${harvestAmount} 份作物收入背包。` })],
      }
    }
    case 'CHAT_WITH_NPC': {
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '精力不足', message: '今天已经没有精力继续交谈。' })] }
      const relationship = state.relationships[action.npcId]
      const gain = relationship.chattedToday ? 0 : scaleReward(6, state.rules.affinityMultiplier)
      const affinity = relationship.affinity + gain
      return {
        ...state,
        energy: state.energy - cost,
        relationships: { ...state.relationships, [action.npcId]: { ...relationship, affinity, stage: affinityStage(affinity), chattedToday: true } },
      }
    }
    case 'GIVE_GIFT': {
      const relationship = state.relationships[action.npcId]
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost || (state.inventory[action.itemId] ?? 0) < 1 || relationship.giftedToday) {
        const message = state.energy < cost ? '精力不足，无法赠礼。' : relationship.giftedToday ? '今天已经向她赠过礼物。' : '背包里没有这件礼物。'
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '赠礼未完成', message })] }
      }
      const birthday = isNpcBirthday(action.npcId, state.day)
      const affinityGain = scaleReward(action.affinity * (birthday ? 2 : 1), state.rules.affinityMultiplier)
      const affinity = relationship.affinity + affinityGain
      return {
        ...state,
        energy: state.energy - cost,
        inventory: { ...state.inventory, [action.itemId]: state.inventory[action.itemId] - 1 },
        relationships: { ...state.relationships, [action.npcId]: { ...relationship, affinity, stage: affinityStage(affinity), giftedToday: true, memoryTags: [...relationship.memoryTags, '收到用心挑选的礼物'] } },
        toasts: [...state.toasts, makeToast({ tone: 'success', title: '心意送达', message: birthday ? `生日心意让好感提升了 ${affinityGain} 点。` : `好感提升了 ${affinityGain} 点。` })],
      }
    }
    case 'SUBMIT_QUEST': {
      const quest = state.quests.find((item) => item.id === action.questId)
      if (!quest || quest.status === 'completed' || (state.inventory[quest.requiredItemId] ?? 0) < quest.requiredAmount) {
        return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '无法提交', message: '任务物品数量不足，或委托已经完成。' })] }
      }
      const issuer = state.relationships[quest.issuerId]
      const mayor = state.relationships.loran
      const rewardMoney = scaleReward(quest.rewardMoney, state.rules.moneyMultiplier)
      const issuerGain = scaleReward(quest.rewardAffinity, state.rules.affinityMultiplier)
      const mayorGain = scaleReward(quest.mayorAffinity, state.rules.affinityMultiplier)
      const issuerAffinity = issuer.affinity + issuerGain
      const mayorAffinity = mayor.affinity + mayorGain
      return {
        ...state,
        money: state.money + rewardMoney,
        inventory: { ...state.inventory, [quest.requiredItemId]: state.inventory[quest.requiredItemId] - quest.requiredAmount },
        quests: state.quests.map((item) => item.id === quest.id ? { ...item, status: 'completed' } : item),
        relationships: {
          ...state.relationships,
          [quest.issuerId]: { ...issuer, affinity: issuerAffinity, stage: affinityStage(issuerAffinity), memoryTags: [...issuer.memoryTags, `完成委托「${quest.title}」`] },
          loran: { ...mayor, affinity: mayorAffinity, stage: affinityStage(mayorAffinity) },
        },
        toasts: [...state.toasts, makeToast({ tone: 'success', title: '委托完成', message: `获得 ${rewardMoney} 金币，发布者与村长的好感都提升了。` })],
      }
    }
    case 'ACCEPT_QUEST':
      return { ...state, quests: state.quests.map((quest) => quest.id === action.questId && quest.status === 'available' ? { ...quest, status: 'active' } : quest) }
    case 'BUY_ITEM': {
      if (action.quantity < 1 || state.money < action.total) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '交易未完成', message: '金币不足，无法购买所选商品。' })] }
      return { ...state, money: state.money - action.total, inventory: { ...state.inventory, [action.itemId]: (state.inventory[action.itemId] ?? 0) + action.quantity }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '购买完成', message: '商品已经放入背包。' })] }
    }
    case 'SELL_ITEM': {
      const protectedByQuest = state.quests.some((quest) => quest.status === 'active' && quest.requiredItemId === action.itemId)
      if (action.quantity < 1 || (state.inventory[action.itemId] ?? 0) < action.quantity || protectedByQuest) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '无法出售', message: protectedByQuest ? '任务物品受到保护，完成或放弃委托后才能出售。' : '持有数量不足。' })] }
      const income = scaleReward(action.total, state.rules.moneyMultiplier)
      return { ...state, money: state.money + income, inventory: { ...state.inventory, [action.itemId]: state.inventory[action.itemId] - action.quantity }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '出售完成', message: `获得 ${income} 金币。` })] }
    }
    case 'USE_HOSPITAL': {
      if (state.hospitalUsedToday || state.money < 180 || state.energy >= state.maxEnergy) return state
      const recovery = scaleReward(2, state.rules.recoveryMultiplier)
      return { ...state, money: state.money - 180, energy: Math.min(state.maxEnergy, state.energy + recovery), hospitalUsedToday: true, toasts: [...state.toasts, makeToast({ tone: 'success', title: '治疗完成', message: `草药热敷让你恢复了 ${recovery} 点精力。` })] }
    }
    case 'BUY_RANCH':
      if (state.ownsMonsterRanch || state.money < 2800) return state
      return { ...state, money: state.money - 2800, ownsMonsterRanch: true, toasts: [...state.toasts, makeToast({ tone: 'success', title: '牧场合同生效', message: '现在可以邀请魔物娘经营伙伴入住了。' })] }
    case 'TRAIN_COMBAT': {
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '精力不足', message: `需要 ${cost} 点精力才能完成训练。` })] }
      const experience = scaleReward(18, state.rules.experienceMultiplier)
      return { ...state, energy: state.energy - cost, skills: { ...state.skills, combat: { ...state.skills.combat, experience: state.skills.combat.experience + experience } }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '训练完成', message: `战斗经验提升 ${experience} 点。` })] }
    }
    case 'LEARN_SPELL': {
      const spell = spells.find((item) => item.id === action.spellId)
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (!spell || state.knownSpells.includes(spell.id) || spell.requiredLevel > state.skills.magic.level || state.energy < cost) return state
      const experience = scaleReward(10, state.rules.experienceMultiplier)
      return { ...state, energy: state.energy - cost, knownSpells: [...state.knownSpells, spell.id], skills: { ...state.skills, magic: { ...state.skills.magic, experience: state.skills.magic.experience + experience } }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '法术习得', message: `你掌握了「${spell.name}」。` })] }
    }
    case 'ENTER_MINE_FLOOR': {
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost || action.floor < 1 || action.floor > state.mine.highestFloor + 1) return state
      const highestFloor = Math.max(state.mine.highestFloor, action.floor)
      const unlockedElevators = action.floor % 5 === 0 && !state.mine.unlockedElevators.includes(action.floor) ? [...state.mine.unlockedElevators, action.floor] : state.mine.unlockedElevators
      return { ...state, energy: state.energy - cost, mine: { currentFloor: action.floor, highestFloor, unlockedElevators }, toasts: [...state.toasts, makeToast({ tone: 'info', title: `抵达第 ${action.floor} 层`, message: action.floor % 5 === 0 ? '这里是安全电梯层，没有魔物，但仍可挖矿。' : '黑暗里传来魔物移动的回声。' })] }
    }
    case 'MINE_ORE': {
      const cost = getEnergyCost(1, state.rules.energyCostMode)
      if (state.energy < cost) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '精力不足', message: `需要 ${cost} 点精力才能开采矿脉。` })] }
      const copper = scaleReward(1 + Math.floor(action.floor / 3), state.rules.dropMultiplier)
      const baseIron = action.floor >= 5 ? Math.floor(action.floor / 5) : 0
      const iron = baseIron > 0 ? scaleReward(baseIron, state.rules.dropMultiplier) : 0
      const experience = scaleReward(12 + action.floor, state.rules.experienceMultiplier)
      return { ...state, energy: state.energy - cost, inventory: { ...state.inventory, 'copper-ore': (state.inventory['copper-ore'] ?? 0) + copper, 'iron-ore': (state.inventory['iron-ore'] ?? 0) + iron }, skills: { ...state.skills, mining: { ...state.skills.mining, experience: state.skills.mining.experience + experience } }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '矿脉开采完成', message: `获得铜矿石 ${copper}${iron ? `、铁矿石 ${iron}` : ''}。` })] }
    }
    case 'START_BATTLE': {
      if (action.floor % 5 === 0) return state
      const elements = ['earth', 'wood', 'water', 'fire', 'metal'] as const
      const names = ['岩壳史莱姆', '蔓影獾', '潮穴水灵', '烬角蜥', '白铁蝠']
      const index = (action.floor - 1) % elements.length
      const enemyMaxHealth = 14 + action.floor * 3
      return { ...state, activeModal: 'battle', battle: { floor: action.floor, enemyName: names[index], enemyElement: elements[index], enemyHealth: enemyMaxHealth, enemyMaxHealth, turn: 1, log: [`第 ${action.floor} 层的${names[index]}挡住了去路。`] } }
    }
    case 'BATTLE_ACTION': {
      const battle = state.battle
      if (!battle || battle.ended) return state
      if (action.action === 'flee') return { ...state, activeModal: 'mine', battle: undefined, toasts: [...state.toasts, makeToast({ tone: 'info', title: '安全撤离', message: '你退回了本层入口，没有失去物品。' })] }
      let enemyHealth = battle.enemyHealth
      let playerHealth = state.stats.health
      let playerMana = state.stats.mana
      let inventory = state.inventory
      const log = [...battle.log]
      let damage = 0
      if (action.action === 'physical') { damage = scaleDamage(state.stats.attack, state.rules.playerDamageMultiplier); log.push(`你挥出武器，造成 ${damage} 点物理伤害。`) }
      if (action.action === 'spell') {
        const spell = spells.find((item) => item.id === action.spellId)
        if (!spell || !state.knownSpells.includes(spell.id) || playerMana < spell.manaCost) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '无法施法', message: '魔力不足或尚未掌握该法术。' })] }
        playerMana -= spell.manaCost
        const multiplier = elementAdvantage(spell.element, battle.enemyElement)
        damage = scaleDamage((spell.power + state.stats.magicDamage) * multiplier, state.rules.playerDamageMultiplier)
        log.push(`你施放「${spell.name}」，五行倍率 ${multiplier}，造成 ${damage} 点伤害。`)
      }
      if (action.action === 'item') {
        if ((inventory['energy-tonic'] ?? 0) < 1) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '道具不足', message: '背包里没有金盏恢复剂。' })] }
        const recovery = scaleReward(10, state.rules.recoveryMultiplier)
        playerHealth = Math.min(state.stats.maxHealth, playerHealth + recovery)
        inventory = { ...inventory, 'energy-tonic': inventory['energy-tonic'] - 1 }
        log.push(`你使用金盏恢复剂，恢复 ${recovery} 点生命。`)
      }
      enemyHealth = Math.max(0, enemyHealth - damage)
      if (enemyHealth <= 0) {
        const experience = scaleReward(14 + battle.floor, state.rules.experienceMultiplier)
        return { ...state, stats: { ...state.stats, health: playerHealth, mana: playerMana }, inventory, battle: { ...battle, enemyHealth: 0, ended: 'victory', log: [...log, `${battle.enemyName}化作散落的灵光，战斗胜利。`] }, skills: { ...state.skills, combat: { ...state.skills.combat, experience: state.skills.combat.experience + experience } } }
      }
      const baseEnemyDamage = action.action === 'defend' ? 2 : 5 + Math.floor(battle.floor / 4)
      const enemyDamage = scaleDamage(baseEnemyDamage, state.rules.enemyDamageMultiplier)
      playerHealth = Math.max(0, playerHealth - enemyDamage)
      log.push(action.action === 'defend' ? `你架起防御，只受到 ${enemyDamage} 点伤害。` : `${battle.enemyName}反击，造成 ${enemyDamage} 点伤害。`)
      return { ...state, stats: { ...state.stats, health: playerHealth, mana: playerMana }, inventory, battle: { ...battle, enemyHealth, turn: battle.turn + 1, ended: playerHealth <= 0 ? 'defeat' : undefined, log } }
    }
    case 'PLAYER_DEFEATED': {
      const awakened = advanceGameClock(state, Math.max(0, 24 * 60 - state.minutes) + 6 * 60 + 30)
      return { ...awakened, location: 'farm', energy: state.maxEnergy, stats: { ...state.stats, health: state.stats.maxHealth, mana: state.stats.maxMana }, mine: { ...state.mine, currentFloor: 1 }, hospitalUsedToday: false, activeModal: null, battle: undefined, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '翌日苏醒', message: '你在农场床上醒来，精力、生命与魔力已经恢复。' })] }
    }
    case 'START_FISHING':
      if (state.energy < getEnergyCost(1, state.rules.energyCostMode)) return { ...state, toasts: [...state.toasts, makeToast({ tone: 'warning', title: '精力不足', message: `需要 ${getEnergyCost(1, state.rules.energyCostMode)} 点精力才能抛竿。` })] }
      return { ...state, energy: state.energy - getEnergyCost(1, state.rules.energyCostMode), fishing: { active: true } }
    case 'CATCH_FISH': {
      if (!state.fishing.active) return state
      if (action.result === 'silver-carp') {
        const amount = scaleReward(1, state.rules.dropMultiplier)
        const experience = scaleReward(16, state.rules.experienceMultiplier)
        return { ...state, fishing: { active: false, lastCatch: 'silver-carp' }, inventory: { ...state.inventory, 'silver-carp': (state.inventory['silver-carp'] ?? 0) + amount, 'reed-bait': Math.max(0, (state.inventory['reed-bait'] ?? 0) - 1) }, skills: { ...state.skills, fishing: { ...state.skills.fishing, experience: state.skills.fishing.experience + experience } }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '钓到银鳞鲫', message: `钓鱼经验 +${experience}，获得鱼获 ${amount} 份。` })] }
      }
      if (action.result === 'water-grass') {
        const experience = scaleReward(4, state.rules.experienceMultiplier)
        return { ...state, fishing: { active: false, lastCatch: 'water-grass' }, inventory: { ...state.inventory, 'reed-bait': Math.max(0, (state.inventory['reed-bait'] ?? 0) - 1) }, skills: { ...state.skills, fishing: { ...state.skills.fishing, experience: state.skills.fishing.experience + experience } } }
      }
      return { ...state, fishing: { active: false, lastCatch: 'empty' }, inventory: { ...state.inventory, 'reed-bait': Math.max(0, (state.inventory['reed-bait'] ?? 0) - 1) } }
    }
    case 'UPGRADE_TOOL': {
      if (state.money < action.price || state.tools[action.tool] >= 4) return state
      return { ...state, money: state.money - action.price, tools: { ...state.tools, [action.tool]: state.tools[action.tool] + 1 }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '工具升级完成', message: '羽纹火花沿着新刃口亮起。' })] }
    }
    case 'REFINE_ORE':
      if ((state.inventory['copper-ore'] ?? 0) < 3) return state
      return { ...state, inventory: { ...state.inventory, 'copper-ore': state.inventory['copper-ore'] - 3, 'iron-ore': (state.inventory['iron-ore'] ?? 0) + 1 }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '精炼完成', message: '3 块铜矿石精炼为 1 块铁矿石。' })] }
    case 'BUY_PERMANENT_UPGRADE':
      if (state.money < action.price) return state
      return action.upgrade === 'energy'
        ? { ...state, money: state.money - action.price, maxEnergy: state.maxEnergy + 1, energy: state.energy + 1, toasts: [...state.toasts, makeToast({ tone: 'success', title: '精力上限提升', message: '最大精力永久增加 1 点。' })] }
        : { ...state, money: state.money - action.price, stats: { ...state.stats, maxMana: state.stats.maxMana + 3, mana: state.stats.mana + 3 }, toasts: [...state.toasts, makeToast({ tone: 'success', title: '魔力上限提升', message: '最大魔力永久增加 3 点。' })] }
    default:
      return state
  }
}

function sameToastContent(left: ToastMessage, right: ToastMessage) {
  return left.tone === right.tone && left.title === right.title && left.message === right.message
}

function reconcileToastQueue(previous: GameState, next: GameState): GameState {
  if (next.toasts === previous.toasts) return next
  const nextIds = new Set(next.toasts.map((toast) => toast.id))
  const previousIds = new Set(previous.toasts.map((toast) => toast.id))
  let queue = previous.toasts.filter((toast) => nextIds.has(toast.id)).slice(-3)
  const added = next.toasts.filter((toast) => !previousIds.has(toast.id))
  for (const toast of added) {
    if (queue.length && sameToastContent(queue[queue.length - 1], toast)) continue
    queue = [...queue, toast].slice(-3)
  }
  return { ...next, toasts: queue }
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  const next = reduceGameState(state, action)
  if (action.type === 'REPLACE_GAME_STATE') return next
  return reconcileToastQueue(state, next)
}
