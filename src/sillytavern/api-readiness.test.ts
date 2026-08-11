import { describe, expect, it } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import { getTavernApiReadiness } from './api-readiness'
import type { TavernSettings } from './types'

function settings(overrides: Partial<TavernSettings['api']> = {}): TavernSettings {
  const base = createMistvaleDefaults().settings
  return { ...base, api: { ...base.api, persistedApiKey: 'test-key', ...overrides } }
}

describe('酒馆 API 就绪契约', () => {
  it('拒绝缺少密钥、地址或模型的配置', () => {
    expect(getTavernApiReadiness(settings({ persistedApiKey: undefined }))).toMatchObject({ ready: false })
    expect(getTavernApiReadiness(settings({ baseUrl: 'not-a-url' }))).toMatchObject({ ready: false })
    expect(getTavernApiReadiness(settings({ model: ' ' }))).toMatchObject({ ready: false })
  })

  it('拒绝缺少供应商专属账户、项目或区域字段的配置', () => {
    expect(getTavernApiReadiness(settings({ provider: 'cloudflare-workers-ai', providerOptions: {} }))).toMatchObject({ ready: false })
    expect(getTavernApiReadiness(settings({ provider: 'google-vertex-ai', providerOptions: { projectId: 'project' } }))).toMatchObject({ ready: false })
    expect(getTavernApiReadiness(settings({ provider: 'google-vertex-ai', providerOptions: { projectId: 'project', location: 'global' } }))).toMatchObject({ ready: true })
  })

  it('接受完整配置并返回空错误', () => {
    expect(getTavernApiReadiness(settings())).toEqual({ ready: true, error: null })
  })
})
