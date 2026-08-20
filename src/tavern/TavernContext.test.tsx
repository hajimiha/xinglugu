import 'fake-indexeddb/auto'
import '../test/setup'
import { render, waitFor } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSessionApiKey, setSessionApiKey } from '../sillytavern/api-credentials'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../sillytavern/database'
import { createTavernRepository } from '../sillytavern/repository'
import * as apiAdapter from '../sillytavern/api-adapter'
import type { ChatSession, TavernApiAdapter } from '../sillytavern/types'
import { TavernProvider, useTavern } from './TavernContext'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  clearSessionApiKey()
  vi.unstubAllGlobals()
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

function response(text: string, variables = '{}'): Response {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: `<maintext>${text}</maintext><vars>${variables}</vars>` } }] })}\n\ndata: [DONE]\n\n`, {
    headers: { 'content-type': 'text/event-stream' },
  })
}

function Probe({ onOpened }: { onOpened: (session: ChatSession, tavern: ReturnType<typeof useTavern>) => void }) {
  const tavern = useTavern()
  const opened = useRef(false)
  if (tavern.status === 'ready' && !opened.current) {
    opened.current = true
    void tavern.openNpcSession('loran', { incoming: 'yes' }).then((session) => onOpened(session, tavern))
  }
  return null
}

async function openProvider(repository = createTavernRepository(database!)) {
  await repository.initialize()
  setSessionApiKey('test-secret')
  let opened!: { session: ChatSession; tavern: ReturnType<typeof useTavern> }
  render(<TavernProvider repository={repository}><Probe onOpened={(session, tavern) => { opened = { session, tavern } }} /></TavernProvider>)
  await waitFor(() => expect(opened.session).toBeDefined())
  return { repository, ...opened }
}

describe('酒馆会话持久化边界', () => {
  it('initializes a new NPC session with the primary participant', async () => {
    database = createTavernDatabase(`mistvale-context-participant-${crypto.randomUUID()}`)

    const { repository, session } = await openProvider()

    expect(session.participantNpcIds).toEqual(['loran'])
    expect((await repository.getSession(session.id))?.participantNpcIds).toEqual(['loran'])
  })

  it('feeds saved group participants, runtime identity and participant lorebooks into one turn', async () => {
    database = createTavernDatabase(`mistvale-context-group-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const characters = await repository.listCharacters()
    const loran = characters.find((candidate) => candidate.npcId === 'loran')!
    const freya = characters.find((candidate) => candidate.npcId === 'freya')!
    const baseBook = (await repository.listLorebooks())[0]
    const groupBook = {
      ...structuredClone(baseBook),
      id: 'group-participant-lorebook',
      name: '受邀角色专属设定',
      entries: [{
        ...structuredClone(baseBook.entries[0]),
        id: 'group-participant-entry',
        content: 'GROUP-PARTICIPANT-LORE-SENTINEL',
        keys: [],
        secondaryKeys: [],
        constant: true,
        disabled: false,
        excluded: false,
      }],
      createdAt: 1,
      updatedAt: 1,
    }
    await repository.saveLorebook(groupBook)
    await repository.saveCharacter({
      ...freya,
      description: 'GROUP-FREYA-PROFILE-SENTINEL',
      lorebookIds: [groupBook.id],
    })
    await repository.saveSession({
      id: 'group-session',
      name: '多人会话',
      npcId: 'loran',
      participantNpcIds: ['loran', 'freya'],
      characterId: loran.id,
      characterName: loran.name,
      userName: '云岚',
      presetId: null,
      presetBinding: { mode: 'follow-active' },
      lorebookIds: [...loran.lorebookIds],
      variables: {},
      messages: [{ id: 'opening', role: 'assistant', content: loran.firstMessage, timestamp: 1 }],
      createdAt: 1,
      updatedAt: Date.now() + 100,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('多人回应')))

    const { session, tavern } = await openProvider(repository)
    const next = await tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: '一起讨论药草园。' })

    const audit = (await repository.listRequestAudits())[0]
    const preparedText = audit.preparedRequest.messages.map((message) => message.content).join('\n')
    expect(preparedText).toContain('GROUP-FREYA-PROFILE-SENTINEL')
    expect(preparedText).toContain('GROUP-PARTICIPANT-LORE-SENTINEL')
    expect(preparedText).toContain('允许发言的 NPC 姓名')
    expect(audit.characterName).toBe('洛岚、芙蕾雅')
    expect(next.messages.at(-2)?.variables).toMatchObject({
      dialogueMode: 'multi-character',
      dialogueParticipantNames: '洛岚、芙蕾雅',
      dialogueParticipantCount: 2,
    })
  })

  it('persists merged variables for an existing opening and retains them after reload', async () => {
    database = createTavernDatabase(`mistvale-context-opening-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const card = (await repository.listCharacters()).find((candidate) => candidate.npcId === 'loran')!
    const existing: ChatSession = {
      id: 'existing-opening', name: '已有会话', npcId: 'loran', characterId: card.id, characterName: card.name,
      userName: '旅行者', presetId: null, presetBinding: { mode: 'follow-active' }, lorebookIds: card.lorebookIds,
      variables: { keep: 'yes' }, messages: [{ id: 'opening', role: 'assistant', content: card.firstMessage, timestamp: 1 }], createdAt: 1, updatedAt: Date.now() + 100,
    }
    await repository.saveSession(existing)

    const { session } = await openProvider(repository)

    expect(session.variables).toEqual({ keep: 'yes', incoming: 'yes' })
    expect((await repository.getSession(existing.id))?.variables).toEqual({ keep: 'yes', incoming: 'yes' })
  })

  it('serializes same-session turns and preserves both committed assistant messages', async () => {
    database = createTavernDatabase(`mistvale-context-queue-${crypto.randomUUID()}`)
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response('first response'))
      .mockResolvedValueOnce(response('second response'))
    vi.stubGlobal('fetch', fetchMock)
    const { repository, session, tavern } = await openProvider()
    const originalCommit = repository.commitTurn.bind(repository)
    let release!: () => void
    const deferred = new Promise<void>((resolve) => { release = resolve })
    let commits = 0
    vi.spyOn(repository, 'commitTurn').mockImplementation(async (next, audit) => {
      commits += 1
      if (commits === 1) await deferred
      await originalCommit(next, audit)
    })

    const first = tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: 'first' })
    await waitFor(() => expect(commits).toBe(1))
    const second = tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: 'second' })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect((await repository.getSession(session.id))?.messages.map((message) => message.content).filter((content) => content.includes('response')))
      .toEqual(['first response', 'second response'])
  })

  it('does not expose a successful turn when the atomic commit fails', async () => {
    database = createTavernDatabase(`mistvale-context-commit-failure-${crypto.randomUUID()}`)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response('not committed')))
    const { repository, session, tavern } = await openProvider()
    vi.spyOn(repository, 'commitTurn').mockRejectedValue(new Error('audit write failed'))

    await expect(tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: 'commit failure' })).rejects.toThrow('audit write failed')
    expect((await repository.getSession(session.id))?.messages).toHaveLength(session.messages.length)
  })

  it('原子提交已声明的全局与会话变量，并拒绝游戏镜像和未知字段', async () => {
    database = createTavernDatabase(`mistvale-context-variable-transaction-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const settings = await repository.getSettings()
    await repository.saveSettings({
      ...settings,
      globalVariables: [{ key: 'worldMood', label: '世界气氛', type: 'number', scope: 'global', value: 2, min: 0, max: 10 }],
    })
    const card = (await repository.listCharacters()).find((candidate) => candidate.npcId === 'loran')!
    await repository.saveSession({
      id: 'defined-variable-session', name: '变量会话', npcId: 'loran', characterId: card.id,
      characterName: card.name, userName: '旅行者', presetId: null, presetBinding: { mode: 'follow-active' },
      lorebookIds: card.lorebookIds, variables: { topic: '初见', legacyShadow: 'remove-me' },
      variableDefinitions: [{ key: 'topic', label: '话题', type: 'string', scope: 'session', value: '初见' }],
      messages: [{ id: 'opening-vars', role: 'assistant', content: card.firstMessage, timestamp: 1 }],
      createdAt: 1, updatedAt: Date.now() + 100,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(
      '变量已核对。',
      JSON.stringify({ worldMood: '99', topic: 42, money: 999999, invented: '污染' }),
    )))

    const { session, tavern } = await openProvider(repository)
    const next = await tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: '更新变量', variables: { money: 500 } })

    expect(next.variables).toEqual({ topic: '42' })
    expect(next.variableDefinitions).toEqual([expect.objectContaining({ key: 'topic', value: '42' })])
    expect((await repository.getSettings()).globalVariables).toEqual([
      expect.objectContaining({ key: 'worldMood', value: 10 }),
    ])
    expect((await repository.getSession(session.id))?.variables).toEqual({ topic: '42' })
    expect((await repository.listRequestAudits())[0].diagnostics).toEqual(expect.arrayContaining([
      expect.stringContaining('worldMood'),
      expect.stringContaining('money'),
      expect.stringContaining('invented'),
    ]))
  })

  it.each([
    ['provider failure', new Error('provider failure')],
    ['abort', new DOMException('aborted', 'AbortError')],
  ])('preserves the original %s when failed-audit persistence fails', async (_label, originalError) => {
    database = createTavernDatabase(`mistvale-context-error-${crypto.randomUUID()}`)
    const adapter: TavernApiAdapter = {
      mode: 'remote', label: 'fake',
      prepare: (request) => ({ id: 'fake-request', request, status: 'preview', createdAt: 1 }),
      inspect: () => ({ url: 'https://fake.test', method: 'POST', headers: {}, body: {} }),
      async *stream() { throw originalError },
    }
    vi.spyOn(apiAdapter, 'createRemoteTavernApi').mockReturnValue(adapter)
    const { repository, session, tavern } = await openProvider()
    vi.spyOn(repository, 'saveRequestAudit').mockRejectedValue(new Error('audit failure'))
    const controller = new AbortController()
    if (originalError instanceof DOMException) controller.abort()

    await expect(tavern.sendTurn({ sessionId: session.id, npcId: 'loran', playerText: 'error', signal: controller.signal }))
      .rejects.toBe(originalError)
  })
})
