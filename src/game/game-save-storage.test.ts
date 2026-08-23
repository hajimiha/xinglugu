import { beforeEach, describe, expect, it } from 'vitest'
import { MAX_GAME_YEAR } from './calendar'
import { initialGameState } from './reducer'
import {
  GAME_SAVE_SCHEMA_VERSION,
  GAME_SAVE_STORAGE_KEY,
  clearGameSave,
  loadGameSave,
  parseGameSave,
  saveGameState,
  sanitizeGameState,
  serializeGameSave,
} from './game-save-storage'

describe('版本化游戏自动存档', () => {
  beforeEach(() => localStorage.clear())

  it('保存进度并移除模态、选中项和通知等临时界面状态', () => {
    saveGameState({
      ...initialGameState,
      day: 4,
      location: 'mine',
      money: 2345,
      activeModal: 'mine',
      selectedNpcId: 'rin',
      toasts: [{ id: 'notice-1', tone: 'info', title: '提示', message: '临时消息' }],
    }, localStorage, 123456)

    const loaded = loadGameSave(localStorage)
    expect(loaded).toMatchObject({ schemaVersion: 3, savedAt: 123456 })
    expect(loaded?.state).toMatchObject({ day: 4, location: 'mine', money: 2345, activeModal: null, toasts: [] })
    expect(loaded?.state.selectedNpcId).toBeUndefined()
  })

  it('支持可移植导出和导入，并在损坏内容时安全拒绝', () => {
    const exported = serializeGameSave({ ...initialGameState, day: 7, money: 8765 }, 777)
    expect(parseGameSave(exported)).toMatchObject({ savedAt: 777, state: { day: 7, money: 8765 } })
    expect(parseGameSave('{bad json')).toBeNull()
    expect(parseGameSave(JSON.stringify({ schemaVersion: 99, state: {} }))).toBeNull()
  })

  it('把 v1 存档迁移为 v3 并要求玩家首次确认姓名', () => {
    const legacy = parseGameSave(JSON.stringify({
      schemaVersion: 1,
      savedAt: 456,
      state: { ...initialGameState, playerProfile: undefined, money: 3456 },
    }))
    expect(legacy).toMatchObject({
      schemaVersion: 3,
      savedAt: 456,
      state: { money: 3456, playerProfile: { name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false } },
    })
  })

  it('把 v2 已命名旧档视为已经看过开场，未命名旧档仍需播放', () => {
    expect(GAME_SAVE_SCHEMA_VERSION).toBe(3)
    const named = parseGameSave(JSON.stringify({
      schemaVersion: 2,
      savedAt: 456,
      state: { ...initialGameState, playerProfile: { name: '旧玩家', hasConfirmedName: true } },
    }))
    const unnamed = parseGameSave(JSON.stringify({
      schemaVersion: 2,
      savedAt: 457,
      state: { ...initialGameState, playerProfile: { name: '旅行者', hasConfirmedName: false } },
    }))

    expect(named?.state.playerProfile).toEqual({ name: '旧玩家', hasConfirmedName: true, hasCompletedVillageIntro: true })
    expect(unnamed?.state.playerProfile).toEqual({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })
  })

  it('保存并恢复已经确认的玩家姓名', () => {
    const named = { ...initialGameState, playerProfile: { name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: false } }
    expect(parseGameSave(serializeGameSave(named))?.state.playerProfile).toEqual(named.playerProfile)
  })

  it('可清除自动存档', () => {
    saveGameState(initialGameState)
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).not.toBeNull()
    clearGameSave()
    expect(localStorage.getItem(GAME_SAVE_STORAGE_KEY)).toBeNull()
  })

  it('导入旧版或损坏字段时回退到安全的初始状态', () => {
    const imported = parseGameSave(JSON.stringify({
      schemaVersion: 1,
      savedAt: 888,
      state: {
        location: 'nowhere',
        day: -4,
        minutes: Number.NaN,
        energy: 99,
        maxEnergy: 5,
        money: -300,
        skills: { farming: 'broken' },
        inventory: { 'moon-radish-seed': -2, exploit: Number.POSITIVE_INFINITY },
        plots: [{ id: 'unknown-plot' }],
        relationships: { loran: 'broken' },
        mine: { currentFloor: 0, highestFloor: -1, unlockedElevators: ['five'] },
        battle: { floor: 99 },
        fishing: { active: true },
      },
    }))

    expect(imported?.state.location).toBe(initialGameState.location)
    expect(imported?.state.day).toBe(1)
    expect(imported?.state.minutes).toBe(initialGameState.minutes)
    expect(imported?.state.energy).toBe(5)
    expect(imported?.state.money).toBe(initialGameState.money)
    expect(imported?.state.skills.farming).toEqual(initialGameState.skills.farming)
    expect(imported?.state.inventory).toEqual({})
    expect(imported?.state.plots).toEqual(initialGameState.plots)
    expect(imported?.state.relationships.loran).toEqual(initialGameState.relationships.loran)
    expect(imported?.state.mine).toEqual(initialGameState.mine)
    expect(imported?.state.battle).toBeUndefined()
    expect(imported?.state.fishing.active).toBe(false)
  })

  it('为旧存档补入第一年并将异常日历字段钳制到有效范围', () => {
    const legacyState = { ...initialGameState } as unknown as Record<string, unknown>
    delete legacyState.year
    const legacy = parseGameSave(JSON.stringify({ schemaVersion: 1, savedAt: 1, state: legacyState }))
    expect((legacy?.state as unknown as { year?: number })?.year).toBe(1)

    const sanitized = sanitizeGameState({
      ...initialGameState,
      year: -2,
      day: 999,
      minutes: 99999,
      season: '春',
      weekday: '周一',
    } as never)
    expect(sanitized).toMatchObject({ year: 1, day: 365, minutes: 1439, season: '冬', weekday: '周一' })

    const extreme = sanitizeGameState({ ...initialGameState, year: Number.MAX_VALUE } as never)
    expect(extreme.year).toBe(MAX_GAME_YEAR)
    expect(extreme.weekday).toMatch(/^周[一二三四五六日]$/)
  })

  it('浏览器拒绝存储访问时不会中断游戏，也不会伪报保存成功', () => {
    const blockedStorage = {
      getItem: () => { throw new DOMException('blocked', 'SecurityError') },
      setItem: () => { throw new DOMException('blocked', 'SecurityError') },
      removeItem: () => { throw new DOMException('blocked', 'SecurityError') },
    } as unknown as Storage

    expect(loadGameSave(blockedStorage)).toBeNull()
    expect(saveGameState(initialGameState, blockedStorage)).toBeNull()
    expect(() => clearGameSave(blockedStorage)).not.toThrow()
  })

  it('完整保留动态田地、牧场伙伴、机器队列、装备与二十层矿洞进度', () => {
    const expandedPlots = [
      ...initialGameState.plots,
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `plot-5-${index + 1}`,
        row: 5,
        column: index + 1,
        ...(index === 0 ? { cropId: 'ember-berry', plantedAt: 123, remainingHours: 12 } : {}),
        watered: index === 0,
        fertilized: false,
        ready: false,
      })),
    ]
    const sanitized = sanitizeGameState({
      ...initialGameState,
      inventory: { milk: 3, 'month-mushroom': 8, 'moss-herb': 4, unknown: 99 },
      plots: expandedPlots,
      ownsMonsterRanch: true,
      ranch: { owned: true, residents: ['cow-girl', 'cow-girl', 'fire-slime-girl', 'dragon-girl'], dragonStatus: 'resident' },
      machines: {
        furnace: { built: true, job: { recipeId: 'smelt-iron', batches: 2, outputItemId: 'iron-ingot', outputQuantity: 2, completesAt: 9876, poweredBy: 'partner' } },
        mill: { built: true },
      },
      mine: { currentFloor: 20, highestFloor: 20, unlockedElevators: [5, 10, 15] },
      tools: { hoe: 4, rod: 2, pickaxe: 3 },
      equipment: { sword: 3, armor: 4 },
    } as never)

    expect(sanitized.plots).toHaveLength(32)
    expect(sanitized.plots.at(-8)).toMatchObject({ id: 'plot-5-1', cropId: 'ember-berry', remainingHours: 12 })
    expect(sanitized.inventory).toEqual({ milk: 3 })
    expect(sanitized.ranch).toEqual({ owned: true, residents: ['cow-girl', 'fire-slime-girl', 'dragon-girl'], dragonStatus: 'resident' })
    expect(sanitized.ownsMonsterRanch).toBe(true)
    expect(sanitized.machines.furnace.job).toMatchObject({ recipeId: 'smelt-iron', batches: 2, outputItemId: 'iron-ingot', outputQuantity: 2, completesAt: 9876 })
    expect(sanitized.mine).toEqual({ currentFloor: 20, highestFloor: 20, unlockedElevators: [5, 10, 15] })
    expect(sanitized.equipment).toEqual({ sword: 3, armor: 4 })
  })

  it('迁移旧牧场布尔值并修复龙娘约定状态', () => {
    const legacy = sanitizeGameState({
      ...initialGameState,
      ownsMonsterRanch: true,
      ranch: undefined,
    } as never)
    expect(legacy.ranch).toEqual({ owned: true, residents: [], dragonStatus: 'wild' })

    const promised = sanitizeGameState({
      ...initialGameState,
      ownsMonsterRanch: false,
      ranch: { owned: false, residents: ['dragon-girl'], dragonStatus: 'resident' },
    } as never)
    expect(promised.ranch).toEqual({ owned: false, residents: [], dragonStatus: 'promised' })
  })

  it('拒绝断行、重复或超过三十行的田地并净化伪造生产状态', () => {
    const corruptPlots = [
      ...initialGameState.plots,
      { id: 'plot-6-1', row: 6, column: 1, watered: false, fertilized: false, ready: false },
      { id: 'plot-6-1', row: 6, column: 1, watered: false, fertilized: false, ready: false },
      { id: 'plot-31-1', row: 31, column: 1, watered: false, fertilized: false, ready: false },
    ]
    const sanitized = sanitizeGameState({
      ...initialGameState,
      plots: corruptPlots,
      mine: { currentFloor: 88, highestFloor: 99, unlockedElevators: [5, 10, 15, 20, 25] },
      machines: {
        furnace: { built: true, job: { recipeId: 'mill-flour', batches: -2, outputItemId: 'diamond-ingot', outputQuantity: 999, completesAt: Number.POSITIVE_INFINITY, poweredBy: 'partner' } },
        mill: { built: false, job: { recipeId: 'mill-flour', batches: 1, outputItemId: 'flour', outputQuantity: 1, completesAt: 100, poweredBy: 'magic' } },
      },
      equipment: { sword: 99, armor: 0 },
    } as never)

    expect(sanitized.plots).toEqual(initialGameState.plots)
    expect(sanitized.mine).toEqual({ currentFloor: 20, highestFloor: 20, unlockedElevators: [5, 10, 15] })
    expect(sanitized.machines).toEqual({ furnace: { built: true }, mill: { built: false } })
    expect(sanitized.equipment).toEqual({ sword: 4, armor: 1 })
  })
})
