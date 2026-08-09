import { scaleReward } from './rules'
import type { ElementType, LocationId, MachineId, MonsterPartnerId, Season } from './types'

export type ItemCategory = 'seed' | 'crop' | 'material' | 'ore' | 'ingot' | 'product' | 'food' | 'bait' | 'tool' | 'potion' | 'gift'
export type RetailCategory = 'seed' | 'material' | 'bait' | 'tool' | 'potion' | 'gift'

export interface ItemDefinition {
  id: string
  name: string
  category: ItemCategory
  sellPrice: number
  description: string
  sources: string[]
  uses: string[]
  price?: number
  retailCategory?: RetailCategory
  season?: Season
  growthDays?: number
  element?: ElementType
  festivalId?: string
  festivalLocationId?: LocationId
}

const defineCatalog = <T extends Record<string, ItemDefinition>>(catalog: T): { [K in keyof T]: ItemDefinition } => catalog

export const ITEM_CATALOG = defineCatalog({
  'moon-radish-seed': { id: 'moon-radish-seed', name: '月铃萝卜种子', category: 'seed', retailCategory: 'seed', price: 38, sellPrice: 18, season: '春', growthDays: 3, description: '春季种子，成熟迅速。', sources: ['杂货店常规售卖'], uses: ['在农场播种月铃萝卜'] },
  'mist-bean-seed': { id: 'mist-bean-seed', name: '雾荚豆种子', category: 'seed', retailCategory: 'seed', price: 55, sellPrice: 26, season: '春', growthDays: 3, description: '春季攀藤作物种子。', sources: ['杂货店常规售卖', '新游戏初始物资'], uses: ['在农场播种雾荚豆'] },
  'sun-wheat-seed': { id: 'sun-wheat-seed', name: '夕照麦种子', category: 'seed', retailCategory: 'seed', price: 62, sellPrice: 30, season: '秋', growthDays: 4, description: '秋季谷物种子。', sources: ['杂货店常规售卖'], uses: ['在农场播种夕照麦'] },
  'ember-berry-seed': { id: 'ember-berry-seed', name: '余烬莓种子', category: 'seed', retailCategory: 'seed', price: 95, sellPrice: 42, season: '秋', growthDays: 5, festivalId: 'feather-forge-festival', festivalLocationId: 'smithy', description: '只在羽火锻造祭售卖的秋季种子。', sources: ['9月9日羽火锻造祭限定售卖'], uses: ['在农场播种余烬莓'] },
  'tide-lotus-seed': { id: 'tide-lotus-seed', name: '潮汐莲种子', category: 'seed', retailCategory: 'seed', price: 110, sellPrice: 50, season: '夏', growthDays: 6, festivalId: 'long-day-fishing-festival', festivalLocationId: 'fisher-home', description: '只在长昼垂钓祭售卖的夏季种子。', sources: ['6月21日长昼垂钓祭限定售卖'], uses: ['在农场播种潮汐莲'] },
  'stone-pumpkin-seed': { id: 'stone-pumpkin-seed', name: '岩纹南瓜种子', category: 'seed', retailCategory: 'seed', price: 135, sellPrice: 62, season: '秋', growthDays: 7, festivalId: 'moon-harvest-festival', festivalLocationId: 'general-store', description: '只在月收庆典售卖的秋季种子。', sources: ['8月15日月收庆典限定售卖'], uses: ['在农场播种岩纹南瓜'] },

  'moon-radish': { id: 'moon-radish', name: '月铃萝卜', category: 'crop', season: '春', growthDays: 56 / 24, sellPrice: 90, description: '成熟时根须会发出风铃般的轻响。', sources: ['种植并收获月铃萝卜'], uses: ['出售换取金币', '赠送给喜欢该作物的角色'] },
  'mist-bean': { id: 'mist-bean', name: '雾荚豆', category: 'crop', season: '春', growthDays: 3, sellPrice: 110, description: '雨天收成更好的攀藤豆。', sources: ['种植并收获雾荚豆'], uses: ['完成雾后新芽委托', '出售换取金币'] },
  'sun-wheat': { id: 'sun-wheat', name: '夕照麦', category: 'crop', season: '秋', growthDays: 4, sellPrice: 135, description: '麦芒会储存傍晚最后一束光。', sources: ['种植并收获夕照麦'], uses: ['投入磨粉机制作面粉', '出售或赠礼'] },
  'ember-berry': { id: 'ember-berry', name: '余烬莓', category: 'crop', season: '秋', growthDays: 5, sellPrice: 185, description: '带有温热果香的节庆作物。', sources: ['种植并收获余烬莓'], uses: ['制作莓果挞', '出售换取金币'] },
  'tide-lotus': { id: 'tide-lotus', name: '潮汐莲', category: 'crop', season: '夏', growthDays: 6, sellPrice: 220, description: '只在水汽充足的田地开放。', sources: ['种植并收获潮汐莲'], uses: ['出售换取金币', '作为珍贵礼物'] },
  'stone-pumpkin': { id: 'stone-pumpkin', name: '岩纹南瓜', category: 'crop', season: '秋', growthDays: 7, sellPrice: 260, description: '表皮坚硬、果肉绵甜的节庆作物。', sources: ['种植并收获岩纹南瓜'], uses: ['出售换取金币', '作为珍贵礼物'] },

  moonflower: { id: 'moonflower', name: '月铃花', category: 'gift', sellPrice: 120, description: '开拓荒地时偶尔发现的清亮花朵。', sources: ['开拓农场田地时概率获得'], uses: ['完成月下回信委托', '赠送给偏爱花朵的角色'] },
  'silver-carp': { id: 'silver-carp', name: '银鳞鲫', category: 'product', sellPrice: 95, description: '雾灯谷河湾常见的银色鱼类。', sources: ['在渔家消耗精力钓鱼'], uses: ['完成逆潮的银光委托', '出售或赠礼'] },
  wood: { id: 'wood', name: '木头', category: 'material', sellPrice: 12, description: '清理农场荒地得到的结实木料。', sources: ['开拓农场田地'], uses: ['建造转动磨粉机'] },
  stone: { id: 'stone', name: '石头', category: 'material', sellPrice: 10, description: '可用于砌筑生产设施的石材。', sources: ['开拓农场田地', '矿洞挖矿'], uses: ['建造熔炉', '建造转动磨粉机'] },
  'copper-ore': { id: 'copper-ore', name: '铜矿石', category: 'ore', retailCategory: 'material', price: 120, sellPrice: 55, description: '浅层矿脉中常见的金属矿石。', sources: ['矿洞各层挖矿', '杂货店材料柜'], uses: ['投入熔炉烧制铜锭', '完成羽火试炉委托'] },
  'iron-ore': { id: 'iron-ore', name: '铁矿石', category: 'ore', retailCategory: 'material', price: 210, sellPrice: 95, description: '第五层起可稳定采集的坚硬矿石。', sources: ['矿洞第五层起挖矿', '杂货店材料柜'], uses: ['投入熔炉烧制铁锭'] },
  'diamond-ore': { id: 'diamond-ore', name: '钻石矿', category: 'ore', sellPrice: 260, description: '第十层起出现的稀有晶矿。', sources: ['矿洞第十层起挖矿'], uses: ['投入熔炉烧制钻石锭'] },
  'copper-ingot': { id: 'copper-ingot', name: '铜锭', category: 'ingot', sellPrice: 115, description: '熔炉炼出的基础金属锭。', sources: ['熔炉烧制铜矿石'], uses: ['在铁匠铺打造铜制工具与装备', '赠送给偏爱金属的角色'] },
  'iron-ingot': { id: 'iron-ingot', name: '铁锭', category: 'ingot', sellPrice: 210, description: '可承受高强度锻打的金属锭。', sources: ['熔炉烧制铁矿石'], uses: ['在铁匠铺打造铁制工具与装备', '赠送给偏爱金属的角色'] },
  'diamond-ingot': { id: 'diamond-ingot', name: '钻石锭', category: 'ingot', sellPrice: 560, description: '由稀有晶矿烧制的最高级锻造材料。', sources: ['熔炉烧制钻石矿'], uses: ['在铁匠铺打造钻石工具与装备'] },

  milk: { id: 'milk', name: '牛奶', category: 'product', sellPrice: 90, description: '牛奶娘每日提供的新鲜牛奶。', sources: ['牛奶娘入驻共生牧场后每日生产'], uses: ['制作莓果挞', '赠送给偏爱乳品的角色', '出售换取金币'] },
  honey: { id: 'honey', name: '蜂蜜', category: 'product', sellPrice: 110, description: '蜂娘采集花蜜酿成的甜蜜产物。', sources: ['蜂娘入驻共生牧场后每日生产'], uses: ['制作莓果挞', '赠送给偏爱甜味的角色', '出售换取金币'] },
  'thread-ball': { id: 'thread-ball', name: '线团', category: 'product', sellPrice: 105, description: '蜘蛛娘纺成的柔韧丝线。', sources: ['蜘蛛娘入驻共生牧场后每日生产'], uses: ['赠送给绮萝', '出售换取金币'] },
  'slime-gel': { id: 'slime-gel', name: '史莱姆粘液', category: 'product', sellPrice: 82, description: '火史莱姆娘和水史莱姆娘都会产生的炼金材料。', sources: ['火史莱姆娘或水史莱姆娘每日生产'], uses: ['赠送给喜欢魔物素材的角色', '出售换取金币'] },
  flour: { id: 'flour', name: '面粉', category: 'material', sellPrice: 95, description: '夕照麦经过磨粉机加工得到的细粉。', sources: ['转动磨粉机加工夕照麦'], uses: ['制作莓果挞'] },
  'berry-tart': { id: 'berry-tart', name: '莓果挞', category: 'food', sellPrice: 420, description: '余烬莓、蜂蜜、面粉与牛奶烘成的节庆点心。', sources: ['使用余烬莓、蜂蜜、面粉和牛奶制作'], uses: ['出售换取金币', '赠送给偏爱甜点的角色'] },

  'moss-fertilizer': { id: 'moss-fertilizer', name: '苔肥', category: 'material', retailCategory: 'material', price: 80, sellPrice: 35, description: '令作物提前八小时成熟。', sources: ['杂货店材料柜'], uses: ['缩短田地作物成熟时间'] },
  'reed-bait': { id: 'reed-bait', name: '苇心鱼饵', category: 'bait', retailCategory: 'bait', price: 25, sellPrice: 10, description: '适合河湾常见鱼类。', sources: ['渔家购买'], uses: ['钓鱼时作为消耗品'] },
  'tide-rod': { id: 'tide-rod', name: '潮汐钓竿', category: 'tool', retailCategory: 'tool', price: 980, sellPrice: 420, description: '扩大钓鱼时机判定区域。', sources: ['渔家购买'], uses: ['提高钓鱼体验与收益'] },
  'energy-tonic': { id: 'energy-tonic', name: '金盏恢复剂', category: 'potion', retailCategory: 'potion', price: 260, sellPrice: 110, description: '战斗中恢复生命。', sources: ['魔女之家购买'], uses: ['战斗中恢复生命值'] },
  'mana-potion': { id: 'mana-potion', name: '蓝雾魔力剂', category: 'potion', retailCategory: 'potion', price: 320, sellPrice: 140, element: 'water', description: '战斗中恢复魔力。', sources: ['魔女之家购买'], uses: ['战斗中恢复魔力值'] },
  'fire-potion': { id: 'fire-potion', name: '流火瓶', category: 'potion', retailCategory: 'potion', price: 380, sellPrice: 165, element: 'fire', description: '造成火属性伤害。', sources: ['魔女之家购买'], uses: ['战斗中造成火属性伤害', '赠送给偏爱火焰的角色'] },
  'amber-tea': { id: 'amber-tea', name: '琥珀茶', category: 'gift', retailCategory: 'gift', price: 145, sellPrice: 65, description: '多数村民都喜欢的温暖饮品。', sources: ['杂货店购买'], uses: ['赠送给偏爱茶饮的角色'] },
})

export type ItemId = keyof typeof ITEM_CATALOG

export interface MachineRecipe {
  id: string
  machine: MachineId
  name: string
  inputItemId: ItemId
  inputPerBatch: number
  outputItemId: ItemId
  outputPerBatch: number
  minutesPerBatch: number
  requiredElement: 'fire' | 'water'
}

export interface BuildRecipe {
  id: MachineId
  name: string
  materials: Partial<Record<ItemId, number>>
  money: number
}

export interface ForgeRecipe {
  id: string
  kind: 'hoe' | 'pickaxe' | 'sword' | 'armor'
  targetLevel: 2 | 3 | 4
  name: string
  ingotId: 'copper-ingot' | 'iron-ingot' | 'diamond-ingot'
  ingotQuantity: number
  money: number
  bonus: number
}

export interface MonsterPartnerDefinition {
  id: MonsterPartnerId
  name: string
  role: string
  price?: number
  dailyProduct?: { itemId: ItemId; quantity: number }
  machineAssist?: MachineId
  acquisition: string
  ability: string
}

export interface FestivalSeedOffer {
  itemId: 'ember-berry-seed' | 'tide-lotus-seed' | 'stone-pumpkin-seed'
  festivalId: string
  locationId: LocationId
  price: number
}

export const MACHINE_RECIPES: Record<string, MachineRecipe> = {
  'smelt-copper': { id: 'smelt-copper', machine: 'furnace', name: '烧制铜锭', inputItemId: 'copper-ore', inputPerBatch: 3, outputItemId: 'copper-ingot', outputPerBatch: 1, minutesPerBatch: 120, requiredElement: 'fire' },
  'smelt-iron': { id: 'smelt-iron', machine: 'furnace', name: '烧制铁锭', inputItemId: 'iron-ore', inputPerBatch: 3, outputItemId: 'iron-ingot', outputPerBatch: 1, minutesPerBatch: 240, requiredElement: 'fire' },
  'smelt-diamond': { id: 'smelt-diamond', machine: 'furnace', name: '烧制钻石锭', inputItemId: 'diamond-ore', inputPerBatch: 3, outputItemId: 'diamond-ingot', outputPerBatch: 1, minutesPerBatch: 480, requiredElement: 'fire' },
  'mill-flour': { id: 'mill-flour', machine: 'mill', name: '研磨面粉', inputItemId: 'sun-wheat', inputPerBatch: 2, outputItemId: 'flour', outputPerBatch: 1, minutesPerBatch: 90, requiredElement: 'water' },
}

export const BUILD_RECIPES: Record<MachineId, BuildRecipe> = {
  furnace: { id: 'furnace', name: '石砌熔炉', materials: { stone: 25 }, money: 0 },
  mill: { id: 'mill', name: '转动磨粉机', materials: { wood: 20, stone: 15 }, money: 600 },
}

const toolTier = [
  { targetLevel: 2 as const, ingotId: 'copper-ingot' as const, quantity: 4, toolMoney: 500, swordMoney: 700, armorMoney: 900 },
  { targetLevel: 3 as const, ingotId: 'iron-ingot' as const, quantity: 6, toolMoney: 1000, swordMoney: 1400, armorMoney: 1800 },
  { targetLevel: 4 as const, ingotId: 'diamond-ingot' as const, quantity: 8, toolMoney: 2200, swordMoney: 3000, armorMoney: 3800 },
]

export const FORGE_RECIPES: Record<string, ForgeRecipe> = Object.fromEntries(
  toolTier.flatMap((tier) => [
    { id: `hoe-${tier.targetLevel}`, kind: 'hoe' as const, targetLevel: tier.targetLevel, name: `${ITEM_CATALOG[tier.ingotId].name}锄头`, ingotId: tier.ingotId, ingotQuantity: tier.quantity, money: tier.toolMoney, bonus: tier.targetLevel },
    { id: `pickaxe-${tier.targetLevel}`, kind: 'pickaxe' as const, targetLevel: tier.targetLevel, name: `${ITEM_CATALOG[tier.ingotId].name}镐`, ingotId: tier.ingotId, ingotQuantity: tier.quantity, money: tier.toolMoney, bonus: tier.targetLevel },
    { id: `sword-${tier.targetLevel}`, kind: 'sword' as const, targetLevel: tier.targetLevel, name: `${ITEM_CATALOG[tier.ingotId].name}长剑`, ingotId: tier.ingotId, ingotQuantity: tier.targetLevel === 2 ? 4 : tier.targetLevel === 3 ? 5 : 6, money: tier.swordMoney, bonus: tier.targetLevel === 2 ? 2 : tier.targetLevel === 3 ? 5 : 10 },
    { id: `armor-${tier.targetLevel}`, kind: 'armor' as const, targetLevel: tier.targetLevel, name: `${ITEM_CATALOG[tier.ingotId].name}护甲`, ingotId: tier.ingotId, ingotQuantity: tier.targetLevel === 2 ? 6 : tier.targetLevel === 3 ? 8 : 10, money: tier.armorMoney, bonus: tier.targetLevel === 2 ? 6 : tier.targetLevel === 3 ? 14 : 30 },
  ].map((recipe) => [recipe.id, recipe])),
)

export const MONSTER_PARTNERS: Record<MonsterPartnerId, MonsterPartnerDefinition> = {
  'cow-girl': { id: 'cow-girl', name: '牛奶娘', role: '乳品伙伴', price: 1500, dailyProduct: { itemId: 'milk', quantity: 1 }, acquisition: '共生牧场商店购买', ability: '每日生产一份牛奶。' },
  'bee-girl': { id: 'bee-girl', name: '蜂娘', role: '花蜜伙伴', price: 1400, dailyProduct: { itemId: 'honey', quantity: 1 }, acquisition: '共生牧场商店购买', ability: '每日生产一份蜂蜜。' },
  'spider-girl': { id: 'spider-girl', name: '蜘蛛娘', role: '纺丝伙伴', price: 1600, dailyProduct: { itemId: 'thread-ball', quantity: 1 }, acquisition: '共生牧场商店购买', ability: '每日生产一份线团。' },
  'fire-slime-girl': { id: 'fire-slime-girl', name: '火史莱姆娘', role: '熔炉伙伴', price: 2200, dailyProduct: { itemId: 'slime-gel', quantity: 1 }, machineAssist: 'furnace', acquisition: '共生牧场商店购买', ability: '每日生产史莱姆粘液，并可免精力为熔炉点火。' },
  'water-slime-girl': { id: 'water-slime-girl', name: '水史莱姆娘', role: '磨坊伙伴', price: 2200, dailyProduct: { itemId: 'slime-gel', quantity: 1 }, machineAssist: 'mill', acquisition: '共生牧场商店购买', ability: '每日生产史莱姆粘液，并可免精力驱动磨粉机。' },
  'dragon-girl': { id: 'dragon-girl', name: '龙娘', role: '矿脉守望者', acquisition: '击败矿洞第20层龙娘，或支付20000金币邀请', ability: '入驻后提高第十层起钻石矿收获。' },
}

export const FESTIVAL_SEED_OFFERS: FestivalSeedOffer[] = [
  { itemId: 'tide-lotus-seed', festivalId: 'long-day-fishing-festival', locationId: 'fisher-home', price: 110 },
  { itemId: 'stone-pumpkin-seed', festivalId: 'moon-harvest-festival', locationId: 'general-store', price: 135 },
  { itemId: 'ember-berry-seed', festivalId: 'feather-forge-festival', locationId: 'smithy', price: 95 },
]

export const CRAFT_RECIPES = {
  'berry-tart': {
    id: 'berry-tart',
    name: '制作莓果挞',
    materials: { 'ember-berry': 2, honey: 1, flour: 1, milk: 1 } satisfies Partial<Record<ItemId, number>>,
    outputItemId: 'berry-tart' as const,
    outputQuantity: 1,
  },
}

export const getItemName = (id: string) => ITEM_CATALOG[id as ItemId]?.name ?? '未鉴定物品'

export interface FarmExpansionReward {
  plotCount: number
  wood: number
  stone: number
  moonflower: number
  moonflowerChance: number
}

export function getFarmExpansion(hoeLevel: number, roll: number, dropMultiplier: number): FarmExpansionReward {
  const safeLevel = Math.min(4, Math.max(1, Math.floor(hoeLevel)))
  const plotCount = [6, 8, 10, 12][safeLevel - 1]
  const moonflowerChance = [0.12, 0.2, 0.28, 0.36][safeLevel - 1]
  const foundMoonflower = Number.isFinite(roll) && roll >= 0 && roll < moonflowerChance
  return {
    plotCount,
    wood: scaleReward(6 + 2 * safeLevel, dropMultiplier),
    stone: scaleReward(4 + safeLevel, dropMultiplier),
    moonflower: foundMoonflower ? scaleReward(1, dropMultiplier) : 0,
    moonflowerChance,
  }
}

export const MINE_MAX_FLOOR = 20

export interface MineYield {
  'copper-ore': number
  'iron-ore': number
  stone: number
  'diamond-ore': number
}

export function getMineYield(floor: number, pickaxeLevel: number, dropMultiplier: number, hasDragon = false): MineYield {
  const safeFloor = Math.min(MINE_MAX_FLOOR, Math.max(1, Math.floor(floor)))
  const safeLevel = Math.min(4, Math.max(1, Math.floor(pickaxeLevel)))
  const toolMultiplier = [1, 1.25, 1.5, 1.75][safeLevel - 1]
  const amount = (base: number) => base > 0 ? scaleReward(Math.round(base * toolMultiplier), dropMultiplier) : 0

  return {
    'copper-ore': amount(1 + Math.floor(safeFloor / 3)),
    'iron-ore': amount(safeFloor >= 5 ? Math.max(1, Math.floor(safeFloor / 5)) : 0),
    stone: amount(2 + Math.floor(safeFloor / 4)),
    'diamond-ore': amount(safeFloor >= 10 ? Math.max(1, Math.floor((safeFloor - 5) / 5)) + (hasDragon ? 1 : 0) : 0),
  }
}
