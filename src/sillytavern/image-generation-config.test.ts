import { beforeEach, describe, expect, it } from 'vitest'
import {
  createDefaultImageGenerationSettings,
  normalizeImageGenerationSettings,
  validateImageGenerationSettings,
} from './image-generation/config'
import {
  clearImageProviderCredential,
  resolveImageProviderCredential,
  setImageProviderCredential,
} from './image-generation/credentials'

describe('酒馆绘图配置', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    clearImageProviderCredential('novelai')
  })

  it('为旧设备补全安全默认值并丢弃未知字段和内嵌密钥', () => {
    const normalized = normalizeImageGenerationSettings({
      enabled: true,
      provider: 'stable-diffusion',
      auto: { enabled: true, everyNthAssistantMessage: 0 },
      stableDiffusion: { baseUrl: ' http://127.0.0.1:7860/// ', steps: 999, apiKey: 'secret' },
      unexpected: 'drop-me',
    })

    expect(normalized.enabled).toBe(true)
    expect(normalized.provider).toBe('stable-diffusion')
    expect(normalized.auto.everyNthAssistantMessage).toBe(1)
    expect(normalized.stableDiffusion.baseUrl).toBe('http://127.0.0.1:7860')
    expect(normalized.stableDiffusion.steps).toBe(150)
    expect(normalized).not.toHaveProperty('unexpected')
    expect(normalized.stableDiffusion).not.toHaveProperty('apiKey')
  })

  it('保留完整后端配置并对非法 URL、尺寸和缓存预算给出字段错误', () => {
    const defaults = createDefaultImageGenerationSettings()
    expect(defaults.provider).toBe('stable-diffusion')
    expect(defaults.prompt.triggerStart).toBe('image###')
    expect(defaults.prompt.triggerEnd).toBe('###')
    expect(defaults.providers).toEqual(['stable-diffusion', 'comfyui', 'novelai', 'openai-image'])

    const invalid = normalizeImageGenerationSettings({
      ...defaults,
      stableDiffusion: { ...defaults.stableDiffusion, baseUrl: 'file:///tmp/model', width: 7 },
      cache: { ...defaults.cache, maxEntries: 0, maxBytes: 12 },
    })
    expect(validateImageGenerationSettings(invalid)).toMatchObject({
      'stableDiffusion.baseUrl': expect.any(String),
      'stableDiffusion.width': expect.any(String),
      'cache.maxEntries': expect.any(String),
      'cache.maxBytes': expect.any(String),
    })
  })

  it('把供应商密钥仅保存在本机指定存储，不进入配置对象', () => {
    setImageProviderCredential('novelai', ' session-key ', false)
    expect(resolveImageProviderCredential('novelai')).toBe('session-key')
    expect(sessionStorage.getItem('xinglugu:image-credential:novelai')).toContain('session-key')

    setImageProviderCredential('novelai', 'local-key', true)
    expect(resolveImageProviderCredential('novelai')).toBe('local-key')
    expect(localStorage.getItem('xinglugu:image-credential:novelai')).toContain('local-key')
    expect(createDefaultImageGenerationSettings().novelAI).not.toHaveProperty('apiKey')

    clearImageProviderCredential('novelai')
    expect(resolveImageProviderCredential('novelai')).toBe('')
  })
})

