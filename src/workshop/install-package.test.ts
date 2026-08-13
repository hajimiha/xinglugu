import { describe, expect, it, vi } from 'vitest'
import type { CharacterCard, ChatPreset, Lorebook } from '../sillytavern/types'
import type { WorkshopPackage } from './types'
import { installWorkshopPackage, previewWorkshopInstall } from './install-package'

const book: Lorebook = {
  id: 'remote-book', name: '林间传说', entries: [], recursiveScanning: false, caseSensitive: false, matchWholeWords: false, createdAt: 1, updatedAt: 1,
}
const preset: ChatPreset = { id: 'remote-preset', name: '细腻叙事', settings: { main: '规则' }, createdAt: 1, updatedAt: 1 }
const character = (npcId: string): CharacterCard => ({
  id: `card-${npcId}`, npcId, name: npcId, role: '', locationId: 'farm', description: '', personality: '', scenario: '', firstMessage: '', exampleDialogue: '', lorebookIds: [], tags: [],
  portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: '/old.png' }], createdAt: 1, updatedAt: 1,
})
const base = { schemaVersion: 1 as const, title: '资源', description: '这是一份用于安装测试的完整资源简介。', version: '1', tags: [], createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' }

describe('创意工坊本地安装事务', () => {
  it('世界书和预设使用新 ID，不覆盖远端或同名本地对象', async () => {
    const saveLorebook = vi.fn(async (_value: Lorebook) => undefined)
    const savePreset = vi.fn(async (_value: ChatPreset) => undefined)
    const adapter = { lorebooks: [book], presets: [preset], characters: [], saveLorebook, savePreset, saveCharacters: vi.fn(async (_values: CharacterCard[]) => undefined) }
    await installWorkshopPackage({ ...base, kind: 'lorebook', payload: { lorebook: book } }, adapter)
    await installWorkshopPackage({ ...base, kind: 'preset', payload: { preset } }, adapter)
    expect(saveLorebook.mock.calls[0]?.[0]?.id).not.toBe(book.id)
    expect(savePreset.mock.calls[0]?.[0]?.id).not.toBe(preset.id)
    expect(saveLorebook.mock.calls[0]?.[0]?.name).toContain('工坊')
  })

  it('立绘组只修改匹配角色并通过一次原子写入提交', async () => {
    const cow = character('cow-girl')
    const bee = character('bee-girl')
    const saveCharacters = vi.fn(async (_values: CharacterCard[]) => undefined)
    const pkg: WorkshopPackage = { ...base, kind: 'portrait-pack', payload: { characters: [
      { npcId: 'cow-girl', name: '牛奶娘', portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: 'data:image/png;base64,bmV3LWNvdw==' }] },
      { npcId: 'bee-girl', name: '蜂娘', portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: 'data:image/png;base64,bmV3LWJlZQ==' }] },
      { npcId: 'missing', name: '不存在', portraitSlots: [{ id: 'all', minAffinity: 0, maxAffinity: 100, source: 'data:image/png;base64,bWlzc2luZw==' }] },
    ] } }
    const adapter = { lorebooks: [], presets: [], characters: [cow, bee], saveLorebook: vi.fn(async (_value: Lorebook) => undefined), savePreset: vi.fn(async (_value: ChatPreset) => undefined), saveCharacters }
    expect(previewWorkshopInstall(pkg, adapter)).toMatchObject({ matchedCharacters: 2, skippedCharacters: ['不存在'] })
    await installWorkshopPackage(pkg, adapter)
    expect(saveCharacters).toHaveBeenCalledTimes(1)
    expect(saveCharacters.mock.calls[0]?.[0]).toHaveLength(2)
    expect(saveCharacters.mock.calls[0]?.[0]?.map((value) => value.npcId)).toEqual(['cow-girl', 'bee-girl'])
  })
})
