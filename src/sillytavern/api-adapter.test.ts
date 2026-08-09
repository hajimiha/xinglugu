import { describe, expect, it, vi } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import {
  createDisabledTavernApi,
  createRemoteTavernApi,
  limitRequestToContext,
  TavernApiRequestError,
  testTavernApiConnection,
} from './api-adapter'

async function collect<T>(source: AsyncIterable<T>) {
  const result: T[] = []
  for await (const event of source) result.push(event)
  return result
}

describe('本地优先酒馆 API 适配器', () => {
  it('只生成请求预览且不会发出网络请求', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const api = createDisabledTavernApi()

    const preview = api.prepare({
      task: 'story',
      messages: [{ role: 'user', content: '你好' }],
    })

    expect(api.mode).toBe('disabled')
    expect(preview.status).toBe('preview')
    expect(preview.request.messages[0].content).toBe('你好')
    await expect(collect(api.stream(preview))).rejects.toMatchObject({
      code: 'TAVERN_API_DISABLED',
    })
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('以 OpenAI-compatible 格式发送请求并解析 SSE 增量', async () => {
    const config = createMistvaleDefaults().settings.api
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'data: {"choices":[{"delta":{"reasoning_content":"先读取记忆"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"洛岚"}}]}',
      '',
      'data: {"choices":[{"delta":{"content":"向你点头。"}}]}',
      '',
      'data: [DONE]',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } }))
    const api = createRemoteTavernApi(config, 'secret-key', fetchMock)
    const preview = api.prepare({
      task: 'story',
      messages: [{ role: 'user', content: '早上好' }],
    })

    expect(await collect(api.stream(preview))).toEqual([
      { type: 'reasoning-delta', text: '先读取记忆' },
      { type: 'content-delta', text: '洛岚' },
      { type: 'content-delta', text: '向你点头。' },
      { type: 'done' },
    ])
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/chat/completions', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer secret-key' }),
    }))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body).toMatchObject({ model: 'deepseek-v4-flash', stream: true, temperature: 0.8, max_tokens: 1200 })
    expect(body.messages).toEqual([{ role: 'user', content: '早上好' }])
  })

  it('兼容不支持流式返回的普通 JSON 响应', async () => {
    const config = { ...createMistvaleDefaults().settings.api, streaming: false }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: '普通响应正文' } }],
    }), { headers: { 'content-type': 'application/json' } }))
    const api = createRemoteTavernApi(config, 'secret-key', fetchMock)

    const events = await collect(api.stream(api.prepare({
      task: 'story',
      messages: [{ role: 'user', content: '继续' }],
    })))

    expect(events).toEqual([{ type: 'content-delta', text: '普通响应正文' }, { type: 'done' }])
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toMatchObject({ stream: false })
  })

  it('按上下文长度保留系统消息与最近对话', () => {
    const request = limitRequestToContext({
      task: 'story',
      messages: [
        { role: 'system', content: '必须保留的系统规则' },
        { role: 'user', content: '较早问题'.repeat(20) },
        { role: 'assistant', content: '较早回答'.repeat(20) },
        { role: 'user', content: '最新问题' },
      ],
    }, 16)

    expect(request.messages[0]).toMatchObject({ role: 'system' })
    expect(request.messages.at(-1)).toMatchObject({ content: '最新问题' })
    expect(request.messages).toHaveLength(2)
  })

  it('为回复预留上下文并裁剪超长系统消息与最新消息', () => {
    const request = limitRequestToContext({
      task: 'story',
      messages: [
        { role: 'system', content: 'S'.repeat(200) },
        { role: 'user', content: 'U'.repeat(200) },
      ],
    }, 100, 40)

    const estimate = (content: string) => Math.max(1, Math.ceil(Array.from(content).reduce((total, character) => total + (/^[\x00-\x7F]$/.test(character) ? 0.25 : 1), 0)))
    const estimated = request.messages.reduce((total, message) => total + estimate(message.content), 0)
    expect(estimated).toBeLessThanOrEqual(60)
    expect(request.messages.some((message) => message.role === 'system')).toBe(true)
    expect(request.messages.some((message) => message.role === 'user')).toBe(true)
    expect(() => limitRequestToContext({ task: 'story', messages: [{ role: 'user', content: 'hi' }] }, 100, 100)).toThrow(/上下文/)
  })

  it('按中文至少一字一词符的保守预算限制提示长度', () => {
    const request = limitRequestToContext({
      task: 'story',
      messages: [
        { role: 'system', content: '雾灯谷世界规则'.repeat(30) },
        { role: 'user', content: '请继续描述当前场景'.repeat(30) },
      ],
    }, 100, 40)
    const chineseCharacters = request.messages.reduce((total, message) => total + Array.from(message.content).length, 0)

    expect(chineseCharacters).toBeLessThanOrEqual(60)
    expect(request.messages.map((message) => message.role)).toEqual(['system', 'user'])
  })

  it('按 Claude 协议解析命名 SSE 事件', async () => {
    const config = {
      ...createMistvaleDefaults().settings.api,
      provider: 'claude' as const,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4-8',
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'event: content_block_delta',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"远程正文"}}',
      '',
      'event: message_stop',
      'data: {"type":"message_stop"}',
      '',
    ].join('\n'), { headers: { 'content-type': 'text/event-stream' } }))
    const api = createRemoteTavernApi(config, 'secret-key', fetchMock)

    expect(await collect(api.stream(api.prepare({ task: 'story', messages: [{ role: 'user', content: '继续' }] })))).toEqual([
      { type: 'content-delta', text: '远程正文' },
      { type: 'done' },
    ])
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.anthropic.com/v1/messages')
  })

  it('通过模型列表端点测试连接并返回可用模型', async () => {
    const config = createMistvaleDefaults().settings.api
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
    }), { headers: { 'content-type': 'application/json' } }))

    const result = await testTavernApiConnection(config, 'secret-key', fetchMock)

    expect(result.models).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({ Authorization: 'Bearer secret-key' }),
    }))
  })

  it.each([
    [401, 'TAVERN_API_UNAUTHORIZED'],
    [429, 'TAVERN_API_RATE_LIMITED'],
  ])('将 HTTP %s 映射为可执行的中文错误', async (status, code) => {
    const config = createMistvaleDefaults().settings.api
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'provider detail' } }), {
      status,
      headers: { 'content-type': 'application/json' },
    }))
    const api = createRemoteTavernApi(config, 'secret-key', fetchMock)

    await expect(collect(api.stream(api.prepare({ task: 'story', messages: [{ role: 'user', content: '测试' }] })))).rejects.toMatchObject({
      name: 'TavernApiRequestError',
      code,
      status,
    })
  })

  it('缺少密钥时在请求前中止', async () => {
    const config = createMistvaleDefaults().settings.api
    const fetchMock = vi.fn()
    const api = createRemoteTavernApi(config, '', fetchMock)

    await expect(collect(api.stream(api.prepare({ task: 'story', messages: [{ role: 'user', content: '测试' }] })))).rejects.toEqual(expect.objectContaining({
      code: 'TAVERN_API_KEY_MISSING',
    } satisfies Partial<TavernApiRequestError>))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
