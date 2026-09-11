import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultImageGenerationSettings, normalizeImageGenerationSettings } from './image-generation/config'
import { importImageLlmPresets, exportImageLlmPreset, buildImageLlmMessages } from './image-generation/llm-presets'
import { createImagePromptApi } from './image-generation/prompt-api'
import { setImagePromptCredential, resolveImagePromptCredential, clearImagePromptCredential } from './image-generation/credentials'
import { buildImagePromptContext, generateStructuredImagePrompt } from './image-generation/prompt-service'
import { createRemoteTavernApi } from './api-adapter'
import type { TavernApiProvider } from './types'
import { createMistvaleDefaults } from './defaults'

afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear() })

describe('绘图提示词独立配置', () => {
  it('迁移旧系统指令，保留固定画风预设，重复读取不丢失条目', () => {
    const original = createDefaultImageGenerationSettings()
    const migrated = normalizeImageGenerationSettings({ ...original, prompt: { systemTemplate: 'old custom system', presets: original.prompt.presets } })
    expect(migrated.prompt.llmPresets[0].entries[0].content).toBe('old custom system')
    expect(migrated.prompt.presets).toEqual(original.prompt.presets)
    expect(normalizeImageGenerationSettings(migrated).prompt.llmPresets).toEqual(migrated.prompt.llmPresets)
    expect(migrated.prompt.api.enabled).toBe(false)
  })

  it('导入 st-chatu8 命名上下文预设，保留顺序、角色与触发规则，导出不携带密钥', () => {
    const [preset] = importImageLlmPresets({ illustration: { api_key: 'must-not-import', entries: [
      { role: 'system', content: 'compose scene', enabled: true },
      { role: 'assistant', content: 'few shot', enabled: false },
      { role: 'user', content: 'wet street', enabled: true, triggerMode: 'trigger', triggerWords: '雨,雪', andTriggerWords: '村庄,街道' },
    ] } })
    expect(preset.name).toBe('illustration')
    expect(buildImageLlmMessages(preset, '村庄下雨')).toEqual([{ role: 'system', content: 'compose scene' }, { role: 'user', content: 'wet street' }])
    expect(buildImageLlmMessages(preset, '晴天村庄')).toEqual([{ role: 'system', content: 'compose scene' }])
    expect(exportImageLlmPreset(preset)).not.toContain('must-not-import')
    const [roundTrip] = importImageLlmPresets(JSON.parse(exportImageLlmPreset(preset)))
    expect(roundTrip.entries.map(({ role, content, enabled }) => ({ role, content, enabled }))).toEqual(preset.entries.map(({ role, content, enabled }) => ({ role, content, enabled })))
    expect(roundTrip.id).not.toBe(preset.id)
  })

  it('导入请求类型包及旧 history 格式，拒绝错误格式或超长文本而非静默截断', () => {
    const imported = importImageLlmPresets({ context_presets: { old: { history: [{ user: 'example', assistant: 'tags' }] } } })
    expect(imported[0].entries.map((entry) => entry.role)).toEqual(['user', 'assistant'])
    expect(() => importImageLlmPresets({ name: 'style', prefix: 'pixel', suffix: '', negative: '' })).toThrow()
    expect(() => importImageLlmPresets({ broken: { entries: [{ role: 'tool', content: 'x' }] } })).toThrow()
    expect(() => importImageLlmPresets({ huge: { entries: [{ role: 'system', content: 'x'.repeat(100001) }] } })).toThrow()
  })

  it('独立配置只接受白名单字段，密钥按接口隔离且可显式清除', () => {
    const settings = createDefaultImageGenerationSettings()
    const api = settings.prompt.api
    setImagePromptCredential(api, 'private-key', true)
    expect(resolveImagePromptCredential(api)).toBe('private-key')
    expect(resolveImagePromptCredential({ ...api, baseUrl: 'https://elsewhere.test' })).toBe('')
    const normalized = normalizeImageGenerationSettings({ ...settings, prompt: { ...settings.prompt, api: { ...api, apiKey: 'private-key', persistedApiKey: 'private-key', providerOptions: { secret: 'private-key' } } } })
    expect(JSON.stringify(normalized)).not.toContain('private-key')
    clearImagePromptCredential(api)
    expect(resolveImagePromptCredential(api)).toBe('')
  })

  it('关闭独立接口使用正文配置，开启后只发送到独立接口且不会回退正文密钥', async () => {
    const story = createMistvaleDefaults().settings.api
    story.baseUrl = 'https://story.test/v1'; story.model = 'story-model'; story.streaming = false
    const prompt = createDefaultImageGenerationSettings().prompt
    prompt.api = { ...prompt.api, provider: 'openai-compatible', baseUrl: 'https://prompt.test/v1', model: 'prompt-model', streaming: false }
    const requests: Array<{ url: string; key: string | null; model: string }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, key: new Headers(init.headers).get('authorization'), model: JSON.parse(String(init.body)).model })
      return Response.json({ choices: [{ message: { content: 'scene' } }] })
    }))
    const run = async () => {
      const api = createImagePromptApi(story, 'story-key', prompt.api)
      for await (const event of api.stream(api.prepare({ task: 'image-prompt', messages: [{ role: 'user', content: 'scene' }] }))) void event
    }
    await run()
    prompt.api.enabled = true
    await expect(run()).rejects.toThrow(/独立.*密钥/)
    setImagePromptCredential(prompt.api, 'prompt-key', false)
    await run()
    expect(requests).toEqual([
      { url: 'https://story.test/v1/chat/completions', key: 'Bearer story-key', model: 'story-model' },
      { url: 'https://prompt.test/v1/chat/completions', key: 'Bearer prompt-key', model: 'prompt-model' },
    ])
    clearImagePromptCredential(prompt.api)
  })

  it('历史深度为零不把整个会话发给提示词模型', () => {
    const defaults = createMistvaleDefaults()
    const settings = createDefaultImageGenerationSettings()
    settings.prompt.historyDepth = 0
    const result = buildImagePromptContext({ settings, character: defaults.characters[0], lorebooks: [], session: {
      id: 'test', userName: 'player', variables: {}, messages: [{ id: 'a', role: 'user', content: 'must-not-send', createdAt: 1 }],
    } as never })
    expect(result).not.toContain('must-not-send')
  })

  it.each(['claude', 'google-ai-studio', 'google-vertex-ai', 'cohere', 'openai-compatible'] as TavernApiProvider[])('提示词真实请求兼容 %s 的系统消息顺序，并使用玩家补充要求触发条目', async (provider) => {
    const defaults = createMistvaleDefaults()
    const settings = createDefaultImageGenerationSettings()
    settings.prompt.llmPresets = importImageLlmPresets({ rain: { entries: [
      { role: 'system', content: 'rain-specific-style {{正文}} {{用户需求}} {{getvar::season}} {{user}}', triggerMode: 'trigger', triggerWords: '雨', andTriggerWords: '村庄' },
      { role: 'user', content: 'example-input' },
      { role: 'assistant', content: 'example-tags' },
    ] } })
    settings.prompt.activeLlmPresetId = settings.prompt.llmPresets[0].id
    const payloads: string[] = []
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      payloads.push(String(init?.body))
      const content = '<image_prompt><title>雨中村庄</title><positive>rain</positive><negative>blur</negative></image_prompt>'
      if (provider === 'claude') return Response.json({ content: [{ type: 'text', text: content }] })
      if (provider.includes('google')) return Response.json({ candidates: [{ content: { parts: [{ text: content }] } }] })
      if (provider === 'cohere') return Response.json({ message: { content: [{ type: 'text', text: content }] } })
      return Response.json({ choices: [{ message: { content } }] })
    })
    const api = createRemoteTavernApi({ ...defaults.settings.api, provider, model: 'test-model', streaming: false, topP: 0.9, providerOptions: { projectId: 'test-project', location: 'global' } }, 'test-key', fetchImpl)
    const result = await generateStructuredImagePrompt(api, { settings, character: defaults.characters[0], lorebooks: [], instruction: '下雨', sourceText: '村庄晴朗', session: {
      id: 'test', userName: 'player', variables: { season: 'spring-variable' }, messages: [],
    } as never })
    expect(result.positive).toBe('rain')
    expect(payloads).toHaveLength(1)
    expect(payloads[0]).toContain('rain-specific-style')
    expect(payloads[0]).toContain('rain-specific-style 村庄晴朗 下雨 spring-variable player')
    expect(payloads[0]).not.toContain('{{正文}}')
  })
})
