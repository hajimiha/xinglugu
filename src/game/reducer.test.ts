import { describe, expect, it } from 'vitest'
import { getDayOfYear } from './calendar'
import { npcs } from './data'
import { gameReducer, initialGameState } from './reducer'
import { DEFAULT_GAME_RULES } from './rules'

describe('游戏状态变更', () => {
  it('以刚抵达小镇的新手数据开始游戏', () => {
    expect(initialGameState).toMatchObject({
      year: 1,
      day: 1,
      season: '春',
      weekday: '周一',
      minutes: 6 * 60 + 30,
      location: 'farm',
      money: 500,
      energy: 5,
      maxEnergy: 5,
    })
    expect(initialGameState.inventory).toEqual({
      'moon-radish-seed': 8,
      'mist-bean-seed': 4,
    })
    expect(initialGameState.plots).toHaveLength(24)
    expect(initialGameState.plots.every((plot) => !plot.cropId && !plot.ready)).toBe(true)
    expect(Object.values(initialGameState.skills).every((skill) => skill.level === 1 && skill.experience === 0)).toBe(true)
    expect(Object.values(initialGameState.relationships).every((relationship) => (
      relationship.affinity === 0
      && relationship.stage === 'stranger'
      && relationship.memoryTags.length === 0
    ))).toBe(true)
    expect(initialGameState.quests.every((quest) => quest.status === 'available')).toBe(true)
    expect(initialGameState.knownSpells).toEqual([])
    expect(initialGameState.mine).toEqual({ currentFloor: 1, highestFloor: 1, unlockedElevators: [] })
  })

  it('合法行动消耗指定精力', () => {
    const next = gameReducer(initialGameState, {
      type: 'SPEND_ENERGY',
      amount: 1,
      reason: '钓鱼',
    })

    expect(next.energy).toBe(4)
  })

  it('精力不足时不产生负数并创建内部警告', () => {
    const next = gameReducer(
      { ...initialGameState, energy: 0, toasts: [] },
      { type: 'SPEND_ENERGY', amount: 1, reason: '聊天' },
    )

    expect(next.energy).toBe(0)
    expect(next.toasts.at(-1)?.message).toBe('精力不足，无法聊天')
    expect(next.toasts.at(-1)?.tone).toBe('warning')
  })

  it('更新与恢复规则时执行边界规范化', () => {
    const changed = gameReducer(initialGameState, {
      type: 'UPDATE_GAME_RULES',
      rules: { experienceMultiplier: 2.12, affinityMultiplier: 9 },
    })
    expect(changed.rules.experienceMultiplier).toBe(2)
    expect(changed.rules.affinityMultiplier).toBe(3)
    expect(gameReducer(changed, { type: 'RESET_GAME_RULES' }).rules).toEqual(DEFAULT_GAME_RULES)
  })

  it('将经验、好感、掉落、金币与双倍精力规则应用到行动', () => {
    const configured = gameReducer(initialGameState, {
      type: 'UPDATE_GAME_RULES',
      rules: {
        experienceMultiplier: 2,
        affinityMultiplier: 1.5,
        dropMultiplier: 2,
        moneyMultiplier: 1.5,
        energyCostMode: 'double',
      },
    })
    const chatted = gameReducer(configured, { type: 'CHAT_WITH_NPC', npcId: 'loran' })
    expect(chatted.energy).toBe(3)
    expect(chatted.relationships.loran.affinity).toBe(9)

    const trained = gameReducer(configured, { type: 'TRAIN_COMBAT' })
    expect(trained.skills.combat.experience).toBe(36)
    expect(trained.energy).toBe(3)

    const mined = gameReducer(configured, { type: 'MINE_ORE', floor: 5 })
    expect(mined.inventory['copper-ore']).toBe(4)
    expect(mined.inventory['iron-ore']).toBe(2)
    expect(mined.skills.mining.experience).toBe(34)

    const quest = configured.quests[0]
    const submitted = gameReducer({
      ...configured,
      inventory: { ...configured.inventory, [quest.requiredItemId]: quest.requiredAmount },
    }, { type: 'SUBMIT_QUEST', questId: quest.id })
    expect(submitted.money).toBe(500 + Math.round(quest.rewardMoney * 1.5))
    expect(submitted.relationships[quest.issuerId].affinity).toBe(Math.round(quest.rewardAffinity * 1.5))

    const sold = gameReducer({ ...configured, inventory: { ...configured.inventory, stone: 3 } }, {
      type: 'SELL_ITEM', itemId: 'stone', quantity: 1, total: 40,
    })
    expect(sold.money).toBe(560)
  })

  it('将玩家伤害、敌方伤害与恢复倍率应用到战斗和医院', () => {
    const configured = gameReducer({
      ...initialGameState,
      energy: 0,
      stats: { ...initialGameState.stats, health: 10 },
      inventory: { ...initialGameState.inventory, 'energy-tonic': 1 },
    }, {
      type: 'UPDATE_GAME_RULES',
      rules: { playerDamageMultiplier: 2, enemyDamageMultiplier: 0.5, recoveryMultiplier: 2 },
    })
    const battleState = gameReducer(configured, { type: 'START_BATTLE', floor: 1 })
    const attacked = gameReducer(battleState, { type: 'BATTLE_ACTION', action: 'physical' })
    expect(attacked.battle?.enemyHealth).toBe(9)
    expect(attacked.stats.health).toBe(7)

    const healed = gameReducer(battleState, { type: 'BATTLE_ACTION', action: 'item' })
    expect(healed.stats.health).toBe(17)

    const hospital = gameReducer(configured, { type: 'USE_HOSPITAL' })
    expect(hospital.energy).toBe(4)
  })

  it('在空地播下当季种子并按生长倍率计算成熟时间', () => {
    const configured = gameReducer(initialGameState, {
      type: 'UPDATE_GAME_RULES', rules: { cropGrowthMultiplier: 2 },
    })
    const planted = gameReducer(configured, {
      type: 'PLANT_PLOT', plotId: 'plot-1-1', seedId: 'moon-radish-seed',
    })
    expect(planted.inventory['moon-radish-seed']).toBe(7)
    expect(planted.plots[0]).toMatchObject({
      cropId: 'moon-radish', remainingHours: 28, watered: false, fertilized: false, ready: false,
    })
    expect(planted.plots[0].plantedAt).toBeTypeOf('number')
  })

  it('旅行经过的时间会推进作物成长并在倒计时归零时成熟', () => {
    const growing = {
      ...initialGameState,
      plots: initialGameState.plots.map((plot) => plot.id === 'plot-1-1'
        ? { ...plot, cropId: 'moon-radish', remainingHours: 1, ready: false }
        : plot),
    }
    const halfway = gameReducer(growing, { type: 'TRAVEL_TO_LOCATION', location: 'general-store', minutes: 30 })
    expect(halfway.plots[0]).toMatchObject({ remainingHours: 0.5, ready: false })

    const mature = gameReducer(halfway, { type: 'TRAVEL_TO_LOCATION', location: 'farm', minutes: 30 })
    expect(mature.plots[0]).toMatchObject({ remainingHours: 0, ready: true })
  })

  it('拒绝在已种地块、错季种子或无库存时播种并给出内部提示', () => {
    const plantedPlotState = {
      ...initialGameState,
      plots: initialGameState.plots.map((plot) => plot.id === 'plot-1-1' ? { ...plot, cropId: 'moon-radish' } : plot),
    }
    expect(gameReducer(plantedPlotState, { type: 'PLANT_PLOT', plotId: 'plot-1-1', seedId: 'moon-radish-seed' }).inventory['moon-radish-seed']).toBe(8)
    expect(gameReducer(initialGameState, { type: 'PLANT_PLOT', plotId: 'plot-1-1', seedId: 'sun-wheat-seed' }).toasts.at(-1)?.title).toBe('播种未完成')
    expect(gameReducer({ ...initialGameState, inventory: {} }, { type: 'PLANT_PLOT', plotId: 'plot-1-1', seedId: 'moon-radish-seed' }).plots[0].cropId).toBeUndefined()
  })

  it('旅行跨过午夜时同步推进日期、星期和每日状态', () => {
    const state = {
      ...initialGameState,
      minutes: 23 * 60 + 50,
      energy: 1,
      hospitalUsedToday: true,
      relationships: {
        ...initialGameState.relationships,
        loran: { ...initialGameState.relationships.loran, chattedToday: true, giftedToday: true },
      },
    }
    const crossed = gameReducer(state, { type: 'TRAVEL_TO_LOCATION', location: 'library', minutes: 20 })

    expect(crossed).toMatchObject({ year: 1, day: 2, minutes: 10, weekday: '周二', season: '春', energy: 5, hospitalUsedToday: false })
    expect(crossed.relationships.loran).toMatchObject({ chattedToday: false, giftedToday: false })
  })

  it('消磨多日时一次推进作物、恢复每日状态并生成单条摘要', () => {
    const state = {
      ...initialGameState,
      energy: 1,
      hospitalUsedToday: true,
      plots: initialGameState.plots.map((plot, index) => index === 0 ? { ...plot, cropId: 'moon-radish', remainingHours: 50, ready: false } : plot),
      relationships: {
        ...initialGameState.relationships,
        loran: { ...initialGameState.relationships.loran, chattedToday: true },
      },
      toasts: [],
    }
    const action = { type: 'ADVANCE_TIME', minutes: 2 * 1440 + 180, reason: '整理农场手记' } as unknown as Parameters<typeof gameReducer>[1]
    const later = gameReducer(state, action)

    expect(later).toMatchObject({ year: 1, day: 3, minutes: 570, energy: 5, hospitalUsedToday: false })
    expect(later.relationships.loran.chattedToday).toBe(false)
    expect(later.plots[0]).toMatchObject({ remainingHours: 0, ready: true })
    expect(later.toasts).toHaveLength(1)
    expect(later.toasts[0].title).toBe('时间流逝')
  })

  it('战斗期间拒绝从非界面入口消磨时间', () => {
    const fighting = {
      ...initialGameState,
      battle: { floor: 1, enemyName: '穴居史莱姆', enemyElement: 'earth' as const, enemyHealth: 20, enemyMaxHealth: 20, turn: 1, log: [] },
    }
    const unchanged = gameReducer(fighting, { type: 'ADVANCE_TIME', minutes: 60, reason: '错误调用' })
    expect(unchanged).toBe(fighting)
  })

  it('生日当天偏爱礼物获得双倍基础好感，其他日期保持原收益', () => {
    const liuan = npcs.find((npc) => npc.id === 'liuan')!
    const birthday = getDayOfYear(liuan.birthday.month, liuan.birthday.day)
    const giftState = { ...initialGameState, inventory: { ...initialGameState.inventory, 'amber-tea': 2 } }
    const birthdayResult = gameReducer({ ...giftState, day: birthday }, { type: 'GIVE_GIFT', npcId: 'liuan', itemId: 'amber-tea', affinity: 14 })
    const ordinaryResult = gameReducer({ ...giftState, day: birthday + 1 }, { type: 'GIVE_GIFT', npcId: 'liuan', itemId: 'amber-tea', affinity: 14 })

    expect(birthdayResult.relationships.liuan.affinity).toBe(28)
    expect(birthdayResult.toasts.at(-1)?.message).toContain('生日心意')
    expect(ordinaryResult.relationships.liuan.affinity).toBe(14)
  })

  it('合并连续重复通知并把通知队列限制为三条', () => {
    const repeated = { type: 'ADD_TOAST', toast: { tone: 'success', title: '播种完成', message: '月铃萝卜将在 56 小时后成熟。' } } as const
    const once = gameReducer({ ...initialGameState, toasts: [] }, repeated)
    const twice = gameReducer(once, repeated)
    expect(twice.toasts).toHaveLength(1)
    expect(twice.toasts[0].id).toBe(once.toasts[0].id)

    const filled = ['一', '二', '三', '四'].reduce<Parameters<typeof gameReducer>[0]>((state, title) => gameReducer(state, {
      type: 'ADD_TOAST', toast: { tone: 'info', title, message: `${title}号通知` },
    }), { ...initialGameState, toasts: [] })
    expect(filled.toasts.map((toast) => toast.title)).toEqual(['二', '三', '四'])
  })

  it('开拓田地按锄头等级增加一行并获得木头、石头与概率月铃花', () => {
    const levelOne = gameReducer(initialGameState, { type: 'EXPAND_FARM', roll: 0.11 } as never)
    expect(levelOne.energy).toBe(4)
    expect(levelOne.plots).toHaveLength(30)
    expect(levelOne.plots.slice(-6).map((plot) => plot.id)).toEqual([
      'plot-5-1', 'plot-5-2', 'plot-5-3', 'plot-5-4', 'plot-5-5', 'plot-5-6',
    ])
    expect(levelOne.inventory).toMatchObject({ wood: 8, stone: 5, moonflower: 1 })

    const levelTwo = gameReducer({ ...initialGameState, tools: { ...initialGameState.tools, hoe: 2 } }, { type: 'EXPAND_FARM', roll: 0.21 } as never)
    expect(levelTwo.plots).toHaveLength(32)
    expect(levelTwo.inventory).toMatchObject({ wood: 10, stone: 6 })
    expect(levelTwo.inventory.moonflower ?? 0).toBe(0)

    const levelFour = gameReducer({ ...initialGameState, tools: { ...initialGameState.tools, hoe: 4 } }, { type: 'EXPAND_FARM', roll: 0.37 } as never)
    expect(levelFour.plots).toHaveLength(36)
    expect(levelFour.plots.at(-1)?.id).toBe('plot-5-12')
  })

  it('开拓田地遵循精力和掉落倍率并限制为三十行', () => {
    const multiplied = gameReducer({
      ...initialGameState,
      rules: { ...initialGameState.rules, dropMultiplier: 2 },
    }, { type: 'EXPAND_FARM', roll: 0.01 } as never)
    expect(multiplied.inventory).toMatchObject({ wood: 16, stone: 10, moonflower: 2 })

    const exhausted = { ...initialGameState, energy: 0 }
    expect(gameReducer(exhausted, { type: 'EXPAND_FARM', roll: 0 } as never).plots).toBe(exhausted.plots)

    const rows = Array.from({ length: 30 }, (_, row) => ({
      id: `plot-${row + 1}-1`, row: row + 1, column: 1, watered: false, fertilized: false, ready: false,
    }))
    const full = { ...initialGameState, plots: rows }
    expect(gameReducer(full, { type: 'EXPAND_FARM', roll: 0 } as never).plots).toBe(rows)
  })
})
