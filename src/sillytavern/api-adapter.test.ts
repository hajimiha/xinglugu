import { describe, expect, it, vi } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import {
  createDisabledTavernApi,
  createRemoteTavernApi,
  TavernApiRequestError,
  testTavernApiConnection,
  redactRequestInspection,
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
    const inspection = api.inspect(preview)
    expect(inspection.url).toBe('https://api.deepseek.com/chat/completions')
    expect(inspection.body).toMatchObject({ model: 'deepseek-v4-flash', messages: [{ role: 'user', content: '早上好' }] })
    expect(JSON.stringify(inspection)).not.toContain('secret-key')
    expect(inspection.headers.Authorization).toBe('[已隐藏]')
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

  it('拒绝已经超出预算的编译请求，不在适配器中重排或二次裁剪', () => {
    const config = { ...createMistvaleDefaults().settings.api, contextLength: 20, maxResponseLength: 5 }
    const api = createRemoteTavernApi(config, 'secret-key', vi.fn())
    const messages = [
      { role: 'system' as const, content: '系统规则'.repeat(10) },
      { role: 'user' as const, content: '当前输入' },
    ]

    expect(() => api.prepare({ task: 'story', messages })).toThrowError(expect.objectContaining({
      code: 'TAVERN_API_CONTEXT_OVERFLOW',
    }))
  })

  it('对预算内的编译消息原样透传，保持系统、历史和当前输入顺序', () => {
    const config = { ...createMistvaleDefaults().settings.api, contextLength: 100, maxResponseLength: 10 }
    const api = createRemoteTavernApi(config, 'secret-key', vi.fn())
    const request = {
      task: 'story' as const,
      messages: [
        { role: 'system' as const, content: '规则' },
        { role: 'assistant' as const, content: '历史' },
        { role: 'user' as const, content: '当前' },
      ],
    }

    expect(api.prepare(request).request).toEqual(request)
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

  it('在请求检查持久化前移除 URL 敏感组件和所有凭据形状的请求头', () => {
    const redacted = redactRequestInspection({
      url: 'https://user:password@example.test/v1/chat?token=url-secret#fragment-secret',
      method: 'POST',
      headers: {
        Authorization: 'Bearer header-secret',
        'X-Api-Key': 'api-secret',
        Cookie: 'session=cookie-secret',
        'X-Auth-Token': 'token-secret',
        'Content-Type': 'application/json',
      },
      body: { messages: [{ role: 'user', content: 'safe prompt' }] },
    })

    expect(redacted.url).toBe('https://example.test/v1/chat')
    expect(redacted.headers).toMatchObject({
      Authorization: '[已隐藏]',
      'X-Api-Key': '[已隐藏]',
      Cookie: '[已隐藏]',
      'X-Auth-Token': '[已隐藏]',
      'Content-Type': 'application/json',
    })
    expect(JSON.stringify(redacted)).not.toMatch(/password|url-secret|fragment-secret|header-secret|api-secret|cookie-secret|token-secret/)
  })

  it('frames split provider JSON and accepts a complete EOF event without DONE', async () => {
    const config = createMistvaleDefaults().settings.api
    const fetchMock = vi.fn().mockResolvedValue(new Response([
      'event: message\ndata: {"choices":[{"delta":{"content":"第一',
      '段"}}]}\n\n',
    ].join(''), { headers: { 'content-type': 'text/event-stream' } }))
    const api = createRemoteTavernApi(config, 'secret-key', fetchMock)

    expect(await collect(api.stream(api.prepare({ task: 'story', messages: [{ role: 'user', content: '继续' }] })))).toEqual([
      { type: 'content-delta', text: '第一段' },
      { type: 'done' },
    ])
  })
})
