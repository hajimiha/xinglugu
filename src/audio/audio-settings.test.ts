import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS, sanitizeAudioSettings } from './audio-settings'

describe('音频设置', () => {
  it('限制音量范围并保留静音状态', () => {
    expect(sanitizeAudioSettings({ masterVolume: 1.7, bgmVolume: -1, sfxVolume: 0.35, muted: true })).toEqual({
      masterVolume: 1,
      bgmVolume: 0,
      sfxVolume: 0.35,
      muted: true,
    })
  })

  it('损坏数据回退为默认设置', () => {
    expect(sanitizeAudioSettings(null)).toEqual(DEFAULT_AUDIO_SETTINGS)
  })
})
