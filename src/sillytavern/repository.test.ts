import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MistvaleTavernDatabase } from './database'
import { createTavernDatabase } from './database'
import { createTavernRepository } from './repository'
import { createContentPack } from './content-pack'
import {
  createMistvaleDefaults,
  createMistvaleLorebookSections,
  DEFAULT_CONTENT_VERSION,
  LEGACY_MISTVALE_LOREBOOK_IDS,
  PRODUCTION_PARTNERS_ID,
  WORLD_RULES_ID,
} from './defaults'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

describe('雾灯谷酒馆仓储', () => {
  it('仅为空表写入默认内容，保留玩家修改', async () => {
    database = createTavernDatabase(`mistvale-test-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()

    const characters = await repository.listCharacters()
    expect(characters).toHaveLength(21)
    const edited = { ...characters[0], personality: '玩家自定义性格', updatedAt: Date.now() + 1 }
    await repository.saveCharacter(edited)

    await repository.initialize()
    expect((await repository.getCharacter(edited.id))?.personality).toBe('玩家自定义性格')
    expect(await repository.listLorebooks()).toHaveLength(1)
    const settings = await repository.getSettings()
    expect(settings).not.toHaveProperty('adapterMode')
    expect(settings.api.model).toBe('deepseek-v4-flash')
  })

  it('把版本六的四册默认世界书逐字段合并并迁移全部绑定', async () => {
    database = createTavernDatabase(`mistvale-consolidation-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    const loran = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    const sourceBooks = createMistvaleLorebookSections(100).map((book, index) => ({
      ...book,
      updatedAt: 200 + index,
      entries: [
        ...book.entries,
        { ...book.entries[0], id: `player-entry-${index}`, comment: `玩家条目 ${index}`, content: `玩家保留正文 ${index}` },
      ],
    }))
    const expectedEntries = structuredClone(sourceBooks.flatMap((book) => book.entries))
    const playerBook = {
      ...sourceBooks[0],
      id: 'player-custom-book',
      name: '玩家自建世界书',
      entries: [{ ...sourceBooks[0].entries[0], id: 'player-only-entry', content: '不得被迁移修改。' }],
    }

    await database.lorebooks.clear()
    await database.lorebooks.bulkPut([...sourceBooks, playerBook])
    await database.characters.put({
      ...loran,
      lorebookIds: [...LEGACY_MISTVALE_LOREBOOK_IDS, 'player-custom-book', WORLD_RULES_ID],
    })
    await database.sessions.put({
      id: 'consolidation-session', name: '合册会话', npcId: 'loran', characterId: loran.id, characterName: '洛岚', userName: '旅行者', presetId: null,
      lorebookIds: [...LEGACY_MISTVALE_LOREBOOK_IDS, 'player-custom-book', WORLD_RULES_ID], variables: {}, messages: [], createdAt: 1, updatedAt: 1,
    })
    await database.settings.put({
      ...settings,
      defaultContentVersion: 6,
      activeLorebookIds: [...LEGACY_MISTVALE_LOREBOOK_IDS, 'player-custom-book', WORLD_RULES_ID],
    })

    await repository.initialize()

    const merged = (await repository.getLorebook(WORLD_RULES_ID))!
    expect(merged.name).toBe('雾灯谷·全域设定集')
    expect(merged.entries).toEqual(expectedEntries)
    expect(await repository.getLorebook('mistvale-village-archive')).toBeUndefined()
    expect(await repository.getLorebook('mistvale-calendar-festivals')).toBeUndefined()
    expect(await repository.getLorebook('mistvale-production-partners')).toBeUndefined()
    expect((await repository.getLorebook('player-custom-book'))?.entries[0].content).toBe('不得被迁移修改。')
    expect((await repository.getCharacter(loran.id))?.lorebookIds).toEqual([WORLD_RULES_ID, 'player-custom-book'])
    expect((await repository.getSession('consolidation-session'))?.lorebookIds).toEqual([WORLD_RULES_ID, 'player-custom-book'])
    expect((await repository.getSettings()).activeLorebookIds).toEqual([WORLD_RULES_ID, 'player-custom-book'])
    expect((await repository.getSettings()).defaultContentVersion).toBe(DEFAULT_CONTENT_VERSION)
  })

  it('合册时不会复活版本六玩家主动删除的默认册', async () => {
    database = createTavernDatabase(`mistvale-consolidation-deleted-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    const sourceBooks = createMistvaleLorebookSections(100).filter((book) => book.id !== 'mistvale-calendar-festivals')

    await database.lorebooks.clear()
    await database.lorebooks.bulkPut(sourceBooks)
    await database.settings.put({ ...settings, defaultContentVersion: 6 })
    await repository.initialize()

    const mergedIds = (await repository.getLorebook(WORLD_RULES_ID))!.entries.map((entry) => entry.id)
    expect(mergedIds.some((id) => id.startsWith('mistvale-festival-'))).toBe(false)
    expect(await repository.getLorebook('mistvale-calendar-festivals')).toBeUndefined()
  })

  it('读取旧版设置时补全 API 配置且不会凭空保存密钥', async () => {
    database = createTavernDatabase(`mistvale-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const current = await database.settings.get('mistvale-settings')
    await database.settings.put({ ...current!, adapterMode: 'disabled', api: undefined } as never)

    const migrated = await repository.getSettings()

    expect(migrated).not.toHaveProperty('adapterMode')
    expect(migrated.api).toMatchObject({ provider: 'deepseek', model: 'deepseek-v4-flash' })
    expect(migrated.api.persistedApiKey).toBeUndefined()
  })

  it('为世界书和会话提供对称的保存与删除操作', async () => {
    database = createTavernDatabase(`mistvale-test-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()

    const book = (await repository.listLorebooks())[0]
    await repository.saveLorebook({ ...book, name: '改名后的世界书' })
    expect((await repository.getLorebook(book.id))?.name).toBe('改名后的世界书')
    await repository.deleteLorebook(book.id)
    expect(await repository.getLorebook(book.id)).toBeUndefined()

    const now = Date.now()
    await repository.saveSession({
      id: 'session-test',
      name: '测试会话',
      messages: [],
      characterName: '洛岚',
      userName: '旅行者',
      presetId: null,
      lorebookIds: [],
      variables: {},
      createdAt: now,
      updatedAt: now,
    })
    expect(await repository.getSession('session-test')).toBeDefined()
    await repository.deleteSession('session-test')
    expect(await repository.getSession('session-test')).toBeUndefined()
  })

  it('仓库内容包仅在版本升级时更新同 ID 默认内容并保留本机新增内容', async () => {
    database = createTavernDatabase(`mistvale-content-pack-${crypto.randomUUID()}`)
    const defaults = createMistvaleDefaults()
    const card = defaults.characters[0]
    const packV1 = createContentPack({
      contentVersion: 'v1', lorebooks: [], presets: [], characters: [{ ...card, personality: '仓库版本一' }],
    })
    const repositoryV1 = createTavernRepository(database, async () => packV1)
    await repositoryV1.initialize()
    expect((await repositoryV1.getCharacter(card.id))?.personality).toBe('仓库版本一')

    await repositoryV1.saveCharacter({ ...card, personality: '本机修改', updatedAt: Date.now() + 10 })
    await repositoryV1.saveCharacter({ ...card, id: 'local-custom-character', personality: '本机新增', updatedAt: Date.now() + 11 })
    await repositoryV1.initialize()
    expect((await repositoryV1.getCharacter(card.id))?.personality).toBe('本机修改')

    const packV2 = createContentPack({
      contentVersion: 'v2', lorebooks: [], presets: [], characters: [{ ...card, personality: '仓库版本二' }],
    })
    const repositoryV2 = createTavernRepository(database, async () => packV2)
    await repositoryV2.initialize()
    expect((await repositoryV2.getCharacter(card.id))?.personality).toBe('仓库版本二')
    expect((await repositoryV2.getCharacter('local-custom-character'))?.personality).toBe('本机新增')
  })

  it('只迁移一次旧设备的岁时世界书绑定并保留原有自定义内容', async () => {
    database = createTavernDatabase(`mistvale-calendar-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const calendarId = 'mistvale-calendar-festivals'
    const settings = await repository.getSettings()
    const loran = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    const customPersonality = '玩家保留的自定义性格'
    await database.lorebooks.bulkDelete([calendarId, 'mistvale-world-rules', 'mistvale-village-archive'])
    await database.settings.put({
      ...settings,
      activeLorebookIds: settings.activeLorebookIds.filter((id) => id !== calendarId),
      defaultContentVersion: 1,
    } as never)
    await database.characters.put({ ...loran, personality: customPersonality, lorebookIds: loran.lorebookIds.filter((id) => id !== calendarId) })
    await database.sessions.put({
      id: 'legacy-session', name: '旧会话', npcId: 'loran', characterId: loran.id, characterName: '洛岚', userName: '旅行者', presetId: null,
      lorebookIds: loran.lorebookIds.filter((id) => id !== calendarId), variables: {}, messages: [], createdAt: 1, updatedAt: 1,
    })

    await repository.initialize()

    const merged = await repository.getLorebook(WORLD_RULES_ID)
    expect(merged).toBeDefined()
    expect(merged?.entries.some((entry) => entry.id.startsWith('mistvale-festival-'))).toBe(true)
    expect(await repository.getLorebook(calendarId)).toBeUndefined()
    expect(await repository.getLorebook('mistvale-village-archive')).toBeUndefined()
    expect((await repository.getCharacter(loran.id))?.lorebookIds).toContain(WORLD_RULES_ID)
    expect((await repository.getCharacter(loran.id))?.personality).toBe(customPersonality)
    expect((await repository.getSettings()).activeLorebookIds).toContain(WORLD_RULES_ID)
    expect((await repository.getSession('legacy-session'))?.lorebookIds).toContain(WORLD_RULES_ID)
  })

  it('从内容版本二只补入生产世界书与六位伙伴，并保留删除和自定义内容', async () => {
    database = createTavernDatabase(`mistvale-production-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const defaults = createMistvaleDefaults()
    const partnerCardIds = defaults.characters.filter((card) => card.tags.includes('共生伙伴')).map((card) => card.id)
    const settings = await repository.getSettings()
    const loran = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    await database.lorebooks.bulkDelete([PRODUCTION_PARTNERS_ID, 'mistvale-world-rules', 'mistvale-village-archive'])
    await database.characters.bulkDelete(partnerCardIds)
    await database.characters.put({
      ...loran,
      personality: '玩家自定义且必须保留',
      portraitSlots: [{ id: 'custom', minAffinity: 0, maxAffinity: 100, source: '/portraits/custom-loran.webp' }],
      lorebookIds: loran.lorebookIds.filter((id) => id !== PRODUCTION_PARTNERS_ID),
    })
    await database.sessions.put({
      id: 'v2-session', name: '版本二会话', npcId: 'loran', characterId: loran.id, characterName: '洛岚', userName: '旅行者', presetId: null,
      lorebookIds: loran.lorebookIds.filter((id) => id !== PRODUCTION_PARTNERS_ID), variables: {}, messages: [], createdAt: 1, updatedAt: 1,
    })
    await database.settings.put({
      ...settings,
      defaultContentVersion: 2,
      activeLorebookIds: settings.activeLorebookIds.filter((id) => id !== PRODUCTION_PARTNERS_ID),
    })

    await repository.initialize()

    const merged = await repository.getLorebook(WORLD_RULES_ID)
    expect(merged).toBeDefined()
    expect(merged?.entries.find((entry) => entry.id === 'mistvale-production-chain')).toBeDefined()
    expect(await repository.getLorebook(PRODUCTION_PARTNERS_ID)).toBeUndefined()
    expect(await repository.getLorebook('mistvale-village-archive')).toBeUndefined()
    expect((await repository.listCharacters()).filter((card) => card.tags.includes('共生伙伴'))).toHaveLength(6)
    expect((await repository.getCharacter(loran.id))?.personality).toBe('玩家自定义且必须保留')
    expect((await repository.getCharacter(loran.id))?.portraitSlots[0].source).toBe('/portraits/custom-loran.webp')
    expect((await repository.getCharacter(loran.id))?.lorebookIds).toContain(WORLD_RULES_ID)
    expect((await repository.getSettings()).activeLorebookIds).toContain(WORLD_RULES_ID)
    expect((await repository.getSession('v2-session'))?.lorebookIds).toContain(WORLD_RULES_ID)
  })

  it('从内容版本三迁移旧五阶段立绘并保留角色自定义资料', async () => {
    database = createTavernDatabase(`mistvale-portrait-slot-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    const loran = (await repository.listCharacters()).find((card) => card.npcId === 'loran')!
    const { portraitSlots: _slots, ...legacyLoran } = loran
    await database.characters.put({
      ...legacyLoran,
      personality: '保留这段玩家自定义性格',
      portraitByAffinity: { stranger: '/portraits/legacy-loran.webp' },
    } as never)
    await database.settings.put({ ...settings, defaultContentVersion: 3 })

    await repository.initialize()

    const migrated = await repository.getCharacter(loran.id)
    expect(migrated?.personality).toBe('保留这段玩家自定义性格')
    expect(migrated?.portraitSlots).toEqual([
      { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '/portraits/legacy-loran.webp' },
    ])
    expect(migrated).not.toHaveProperty('portraitByAffinity')
    expect((await repository.getSettings()).defaultContentVersion).toBe(DEFAULT_CONTENT_VERSION)
  })

  it('将旧会话迁移为跟随当前激活预设，避免继续发送创建会话时的旧预设', async () => {
    database = createTavernDatabase(`mistvale-preset-binding-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    await database.sessions.put({
      id: 'legacy-preset-session',
      name: '旧预设会话',
      characterName: '测试角色',
      userName: '旅行者',
      presetId: 'stale-preset-id',
      lorebookIds: [],
      variables: {},
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await database.settings.put({ ...settings, defaultContentVersion: 4 })

    await repository.initialize()

    expect(await repository.getSession('legacy-preset-session')).toMatchObject({
      presetId: null,
      presetBinding: { mode: 'follow-active' },
    })
  })

  it('为版本五存档补入鱼类与礼物规则，同时保留玩家的自定义世界书条目', async () => {
    database = createTavernDatabase(`mistvale-fishing-gift-migration-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    const sourceBooks = createMistvaleLorebookSections(100)
    const worldRules = sourceBooks.find((book) => book.id === WORLD_RULES_ID)!
    const villageArchive = sourceBooks.find((book) => book.id === 'mistvale-village-archive')!
    const customEntry = { ...worldRules.entries[0], id: 'player-custom-rule', comment: '玩家自定义规则', content: '必须保留这条内容。' }
    const customAffinity = { ...worldRules.entries.find((item) => item.id === 'mistvale-rule-affinity')!, content: '玩家重写的关系规则也必须保留。' }
    const customMina = { ...villageArchive.entries.find((item) => item.id === 'mistvale-person-mina')!, content: '玩家重写的弥奈人物档案也必须保留。' }

    await database.lorebooks.clear()
    await database.lorebooks.bulkPut(sourceBooks.map((book) => book.id === WORLD_RULES_ID
      ? {
          ...worldRules,
          entries: [...worldRules.entries.filter((item) => !['mistvale-rule-fishing', 'mistvale-rule-gifts', 'mistvale-rule-affinity'].includes(item.id)), customAffinity, customEntry],
        }
      : book.id === villageArchive.id
        ? {
            ...villageArchive,
            entries: [...villageArchive.entries.filter((item) => item.id !== 'mistvale-person-mina'), customMina, { ...customEntry, id: 'player-custom-person', comment: '玩家自定义人物' }],
          }
        : book))
    await database.settings.put({ ...settings, defaultContentVersion: 5 })

    await repository.initialize()

    const migratedRules = (await repository.getLorebook('mistvale-world-rules'))!
    expect(migratedRules.entries.find((item) => item.id === 'mistvale-rule-fishing')?.content).toContain('雾湾巨鲶')
    expect(migratedRules.entries.find((item) => item.id === 'mistvale-rule-gifts')?.content).toContain('莓果挞')
    expect(migratedRules.entries.find((item) => item.id === 'mistvale-rule-affinity')?.content).toBe('玩家重写的关系规则也必须保留。')
    expect(migratedRules.entries.find((item) => item.id === 'player-custom-rule')?.content).toBe('必须保留这条内容。')
    expect(migratedRules.entries.find((item) => item.id === 'mistvale-rule-gifts')?.content).toContain('弥奈：月尾鱼、潮纹鲈')
    expect(migratedRules.entries.find((item) => item.id === 'mistvale-person-mina')?.content).toBe('玩家重写的弥奈人物档案也必须保留。')
    expect(migratedRules.entries.find((item) => item.id === 'player-custom-person')).toBeDefined()
    expect((await repository.getSettings()).defaultContentVersion).toBe(DEFAULT_CONTENT_VERSION)
  })

  it('只保留最近二十条无密钥的出站请求审计', async () => {
    database = createTavernDatabase(`mistvale-audit-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    for (let index = 0; index < 23; index += 1) {
      await repository.saveRequestAudit({
        id: `audit-${index}`,
        createdAt: index,
        status: 'succeeded',
        sessionId: 'session',
        characterName: '洛岚',
        presetId: 'preset',
        presetName: '测试预设',
        presetBinding: 'follow-active',
        provider: 'deepseek',
        model: 'deepseek-v4-flash',
        preparedRequest: { task: 'story', messages: [{ role: 'user', content: String(index) }] },
        providerRequest: { url: 'https://api.deepseek.com/chat/completions', method: 'POST', headers: { Authorization: '[已隐藏]' }, body: {} },
        segments: [],
        macroOperations: [],
        matchedLorebookEntries: [],
        diagnostics: [],
      })
    }

    const audits = await repository.listRequestAudits()
    expect(audits).toHaveLength(20)
    expect(audits[0].id).toBe('audit-22')
    expect(audits.at(-1)?.id).toBe('audit-3')
  })

  it('读取没有 messageIndex 的旧请求审计时保留原有片段发送状态', async () => {
    database = createTavernDatabase(`mistvale-audit-legacy-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    await database.requestAudits.put({
      id: 'legacy-audit', createdAt: 1, status: 'succeeded', sessionId: 'session', characterName: '洛岚',
      presetId: 'preset', presetName: '旧预设', presetBinding: 'follow-active', provider: 'deepseek', model: 'model',
      preparedRequest: { task: 'story', messages: [{ role: 'system', content: 'system' }] },
      providerRequest: { url: 'https://example.test', method: 'POST', headers: {}, body: {} },
      segments: [
        { id: 'legacy-sent', source: 'preset', identifier: 'legacy-sent', role: 'system', raw: 'system', compiled: 'system', sent: true, tokenEstimate: 1, diagnostics: [] },
        { id: 'legacy-omitted', source: 'history', identifier: 'legacy-omitted', role: 'assistant', raw: 'old', compiled: 'old', sent: false, tokenEstimate: 1, diagnostics: [] },
      ],
      macroOperations: [], matchedLorebookEntries: [], diagnostics: [],
    } as never)

    const [audit] = await repository.listRequestAudits()

    expect(audit.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'legacy-sent', sent: true, messageIndex: null }),
      expect.objectContaining({ id: 'legacy-omitted', sent: false, messageIndex: null }),
    ]))
  })

  it('在同一事务中提交会话和回合审计', async () => {
    database = createTavernDatabase(`mistvale-commit-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const session = {
      id: 'durable-session', name: '持久会话', messages: [], characterName: '洛岚', userName: '玩家', presetId: null,
      lorebookIds: [], variables: { hp: 8 }, createdAt: 1, updatedAt: 2,
    }
    const audit = {
      id: 'durable-audit', createdAt: 2, status: 'succeeded' as const, sessionId: session.id, characterName: '洛岚',
      presetId: 'preset', presetName: '预设', presetBinding: 'follow-active' as const, provider: 'deepseek' as const,
      model: 'model', preparedRequest: { task: 'story' as const, messages: [] },
      providerRequest: { url: 'https://example.test', method: 'POST', headers: {}, body: {} }, segments: [], macroOperations: [],
      matchedLorebookEntries: [], diagnostics: [],
    }

    await repository.commitTurn(session, audit)

    expect(await repository.getSession(session.id)).toMatchObject({ variables: { hp: 8 } })
    expect((await repository.listRequestAudits())[0]).toMatchObject({ id: audit.id, sessionId: session.id })
  })

  it('迁移事务失败时保留旧内容版本', async () => {
    database = createTavernDatabase(`mistvale-migration-rollback-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    await database.settings.put({ ...settings, defaultContentVersion: 1 })
    const beforeLorebooks = await database.lorebooks.toArray()
    const beforeCharacters = await database.characters.toArray()
    const beforeSessions = await database.sessions.toArray()
    vi.spyOn(database.settings, 'update').mockRejectedValueOnce(new Error('写入失败'))

    await expect(repository.initialize()).rejects.toThrow('写入失败')
    expect(await database.lorebooks.toArray()).toEqual(beforeLorebooks)
    expect(await database.characters.toArray()).toEqual(beforeCharacters)
    expect(await database.sessions.toArray()).toEqual(beforeSessions)
    expect((await database.settings.get('mistvale-settings'))?.defaultContentVersion).toBe(1)
    await repository.initialize()
    expect((await database.settings.get('mistvale-settings'))?.defaultContentVersion).toBe(DEFAULT_CONTENT_VERSION)
  })
})
