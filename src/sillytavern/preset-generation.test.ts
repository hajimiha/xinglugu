import { describe, expect, it } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import { applyPresetGenerationSettings } from './preset-generation'

describe('SillyTavern 预设生成参数', () => {
  it('把预设采样与上下文参数应用到实际供应商配置', () => {
    const base = createMistvaleDefaults().settings.api
    const result = applyPresetGenerationSettings(base, {
      temperature: 1,
      top_p: 0.91,
      frequency_penalty: -0.25,
      presence_penalty: 0.4,
      openai_max_context: 2000000,
      openai_max_tokens: 32000,
      stream_openai: false,
    })

    expect(result).toMatchObject({
      temperature: 1,
      topP: 0.91,
      frequencyPenalty: -0.25,
      presencePenalty: 0.4,
      contextLength: 2000000,
      maxResponseLength: 32000,
      streaming: false,
    })
  })

  it('忽略无效预设字段并保留接口页配置', () => {
    const base = createMistvaleDefaults().settings.api
    expect(applyPresetGenerationSettings(base, {
      temperature: 'not-a-number', top_p: 9, openai_max_tokens: -1,
    })).toEqual(base)
  })
})
