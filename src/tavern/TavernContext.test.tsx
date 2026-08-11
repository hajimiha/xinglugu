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

function response(text: string): Response {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: `<maintext>${text}</maintext><vars>{}</vars>` } }] })}\n\ndata: [DONE]\n\n`, {
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
