import { describe, expect, it } from 'vitest'
import { getTavernApiPreset } from './api-config'
import { buildProviderRequest, extractProviderContent, extractProviderSseContent } from './protocol-adapters'
import type { TavernApiConfig, TavernApiProvider, TavernRequest } from './types'

const request: TavernRequest = {
  task: 'story',
  messages: [
    { role: 'system', content: '世界规则' },
    { role: 'user', content: '早上好' },
    { role: 'assistant', content: '早安' },
  ],
}

function config(provider: TavernApiProvider, patch: Partial<TavernApiConfig> = {}): TavernApiConfig {
  return {
    ...getTavernApiPreset(provider),
    temperature: 0.7,
    contextLength: 32000,
    maxResponseLength: 512,
    streaming: true,
    frequencyPenalty: 0.25,
    presencePenalty: -0.5,
    topP: 0.85,
    rememberKey: false,
    providerOptions: {},
    ...patch,
  }
}

describe('供应商协议适配', () => {
  it('构造 OpenAI 与 Azure 的不同鉴权请求', () => {
    const openai = buildProviderRequest(config('deepseek'), 'secret', request, true)
    expect(openai.url).toBe('https://api.deepseek.com/chat/completions')
    expect(openai.init.headers).toMatchObject({ Authorization: 'Bearer secret' })
    expect(JSON.parse(openai.init.body as string)).toMatchObject({
      stream: true,
      max_tokens: 512,
      frequency_penalty: 0.25,
      presence_penalty: -0.5,
      top_p: 0.85,
    })

    const azure = buildProviderRequest(config('azure-openai', {
      baseUrl: 'https://mistvale.openai.azure.com/openai/v1',
      model: 'story-deployment',
    }), 'azure-secret', request, true)
    expect(azure.url).toBe('https://mistvale.openai.azure.com/openai/v1/chat/completions')
    expect(azure.init.headers).toMatchObject({ 'api-key': 'azure-secret' })
    expect(azure.init.headers).not.toHaveProperty('Authorization')
  })

  it('构造 Claude Messages 请求并解析 JSON/SSE', () => {
    const built = buildProviderRequest(config('claude'), 'claude-secret', request, true)
    const body = JSON.parse(built.init.body as string)
    expect(built.url).toBe('https://api.anthropic.com/v1/messages')
    expect(built.init.headers).toMatchObject({ 'x-api-key': 'claude-secret', 'anthropic-version': '2023-06-01' })
    expect(body).toMatchObject({ system: '世界规则', stream: true, max_tokens: 512, top_p: 0.85 })
    expect(body).not.toHaveProperty('frequency_penalty')
    expect(body.messages).toEqual([
      { role: 'user', content: '早上好' },
      { role: 'assistant', content: '早安' },
    ])
    expect(extractProviderContent('anthropic-messages', {
      content: [
        { type: 'thinking', thinking: '先核对人物记忆' },
        { type: 'text', text: '完整正文' },
      ],
    })).toEqual({ content: '完整正文', reasoning: '先核对人物记忆' })
    expect(extractProviderSseContent('anthropic-messages', {
      type: 'content_block_delta',
      delta: { type: 'thinking_delta', thinking: '流式推理' },
    })).toEqual({ content: '', reasoning: '流式推理' })
    expect(extractProviderSseContent('anthropic-messages', {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: '增量' },
    })).toEqual({ content: '增量', reasoning: '' })
  })

  it('构造 AI Studio 与 Vertex Gemini 请求并解析候选文本', () => {
    const studio = buildProviderRequest(config('google-ai-studio'), 'google-key', request, true)
    const studioBody = JSON.parse(studio.init.body as string)
    expect(studio.url).toContain('/models/gemini-2.5-flash:streamGenerateContent?alt=sse')
    expect(studio.init.headers).toMatchObject({ 'x-goog-api-key': 'google-key' })
    expect(studioBody.systemInstruction.parts[0].text).toBe('世界规则')
    expect(studioBody.generationConfig).toMatchObject({
      maxOutputTokens: 512,
      topP: 0.85,
      frequencyPenalty: 0.25,
      presencePenalty: -0.5,
    })
    expect(studioBody.contents[1]).toEqual({ role: 'model', parts: [{ text: '早安' }] })

    const vertex = buildProviderRequest(config('google-vertex-ai', {
      providerOptions: { projectId: 'mistvale-project', location: 'global' },
    }), 'oauth-token', request, true)
    expect(vertex.url).toContain('/projects/mistvale-project/locations/global/publishers/google/models/gemini-2.5-flash:streamGenerateContent?alt=sse')
    expect(vertex.init.headers).toMatchObject({ Authorization: 'Bearer oauth-token' })
    const payload = { candidates: [{ content: { parts: [{ thought: true, text: '候选推理' }, { text: '候选正文' }] } }] }
    expect(extractProviderContent('gemini', payload)).toEqual({ content: '候选正文', reasoning: '候选推理' })
    expect(extractProviderSseContent('vertex-gemini', payload)).toEqual({ content: '候选正文', reasoning: '候选推理' })
  })

  it('构造 Cohere 与 Cloudflare 请求并解析各自响应', () => {
    const cohere = buildProviderRequest(config('cohere', {
      temperature: 0.7,
      frequencyPenalty: 0.25,
      presencePenalty: 0,
    }), 'cohere-key', request, true)
    expect(cohere.url).toBe('https://api.cohere.ai/v2/chat')
    const cohereBody = JSON.parse(cohere.init.body as string)
    expect(cohereBody).toMatchObject({ messages: request.messages, stream: true, frequency_penalty: 0.25 })
    expect(cohereBody).not.toHaveProperty('presence_penalty')
    expect(extractProviderContent('cohere-v2', { message: { content: [{ type: 'text', text: 'Cohere 正文' }] } })).toEqual({ content: 'Cohere 正文', reasoning: '' })
    expect(extractProviderSseContent('cohere-v2', { type: 'content-delta', delta: { message: { content: { text: '流片段' } } } })).toEqual({ content: '流片段', reasoning: '' })

    const cloudflare = buildProviderRequest(config('cloudflare-workers-ai', {
      providerOptions: { accountId: 'account-123' },
    }), 'cf-token', request, false)
    expect(cloudflare.url).toBe('https://api.cloudflare.com/client/v4/accounts/account-123/ai/run/@cf/meta/llama-3.1-8b-instruct')
    expect(extractProviderContent('cloudflare-workers-ai', { result: { response: 'Cloudflare 正文' } })).toEqual({ content: 'Cloudflare 正文', reasoning: '' })
  })

  it('分离 OpenAI 兼容接口的 reasoning_content 与正文', () => {
    expect(extractProviderContent('openai-chat', {
      choices: [{ message: { reasoning_content: '完整推理', content: '完整正文' } }],
    })).toEqual({ content: '完整正文', reasoning: '完整推理' })
    expect(extractProviderSseContent('openai-chat', {
      choices: [{ delta: { reasoning_content: '增量推理', content: '' } }],
    })).toEqual({ content: '', reasoning: '增量推理' })
  })

  it('rejects malformed provider response shapes without inventing content', () => {
    for (const protocol of ['openai-chat', 'azure-openai', 'anthropic-messages', 'gemini', 'vertex-gemini', 'cohere-v2', 'cloudflare-workers-ai'] as const) {
      expect(extractProviderContent(protocol, { error: { message: 'provider failure' } })).toEqual({ content: '', reasoning: '' })
    }
  })

  it('constructs provider paths structurally without inheriting base URL query or fragment', () => {
    const built = buildProviderRequest(config('deepseek', {
      baseUrl: 'https://api.example.test/root?api_key=secret#fragment',
    }), 'secret', request, true)

    expect(built.url).toBe('https://api.example.test/root/chat/completions')
  })

  it('omits zero Cohere penalties and rejects incompatible sampling values before fetch', () => {
    const zeroPenalty = buildProviderRequest(config('cohere', {
      temperature: 0.6,
      frequencyPenalty: 0,
      presencePenalty: 0,
    }), 'cohere-key', request, false)
    const body = JSON.parse(zeroPenalty.init.body as string)
    expect(body).not.toHaveProperty('frequency_penalty')
    expect(body).not.toHaveProperty('presence_penalty')

    expect(() => buildProviderRequest(config('cohere', {
      frequencyPenalty: 0.2,
      presencePenalty: 0.3,
    }), 'cohere-key', request, false)).toThrow('不能同时设置')
    expect(() => buildProviderRequest(config('cohere', {
      frequencyPenalty: -0.1,
      presencePenalty: 0,
    }), 'cohere-key', request, false)).toThrow('0 到 1')
    expect(() => buildProviderRequest(config('cohere', {
      temperature: 1.1,
      frequencyPenalty: 0,
      presencePenalty: 0,
    }), 'cohere-key', request, false)).toThrow('温度')
  })

  it.each(['claude', 'google-ai-studio', 'cohere'] as const)(
    'rejects post-history system prompts for %s instead of silently reordering them',
    (provider) => {
      const ordered: TavernRequest = {
        task: 'story',
        messages: [
          { role: 'system', content: '历史前规则' },
          { role: 'user', content: '历史' },
          { role: 'system', content: '历史后规则' },
          { role: 'user', content: '本轮' },
        ],
      }
      expect(() => buildProviderRequest(config(provider, {
        temperature: provider === 'cohere' ? 0.7 : 0.8,
        frequencyPenalty: 0,
        presencePenalty: 0,
      }), 'secret', ordered, true)).toThrow('无法保持当前预设的系统提示词顺序')
    },
  )
})
