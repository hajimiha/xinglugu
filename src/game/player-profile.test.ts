import { describe, expect, it } from 'vitest'
import { normalizePlayerName, sanitizePlayerProfile } from './player-profile'

describe('玩家姓名', () => {
  it('清理首尾空白并保留中文、拉丁字母与常用符号', () => {
    expect(normalizePlayerName('  林·秋  ')).toBe('林·秋')
    expect(normalizePlayerName('Aster 7')).toBe('Aster 7')
  })

  it('拒绝空姓名、控制字符与超过二十个字符的姓名', () => {
    expect(normalizePlayerName('   ')).toBeNull()
    expect(normalizePlayerName('旅\u0000人')).toBeNull()
    expect(normalizePlayerName('一二三四五六七八九十一二三四五六七八九十一')).toBeNull()
  })

  it('净化旧存档并让缺少档案的玩家完成首次登记', () => {
    expect(sanitizePlayerProfile(undefined)).toEqual({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })
    expect(sanitizePlayerProfile({ name: '  云岚 ', hasConfirmedName: true })).toEqual({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true })
    expect(sanitizePlayerProfile({ name: '   ', hasConfirmedName: true })).toEqual({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })
  })

  it('保留新存档显式的开场完成状态并拒绝畸形真值', () => {
    expect(sanitizePlayerProfile({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: false })).toEqual({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: false })
    expect(sanitizePlayerProfile({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true })).toEqual({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true })
    expect(sanitizePlayerProfile({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: 'false' })).toEqual({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true })
  })
})
