export interface AudioSettings {
  masterVolume: number
  bgmVolume: number
  sfxVolume: number
  muted: boolean
}

export const AUDIO_SETTINGS_STORAGE_KEY = 'mistvale-audio-settings-v1'
export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  masterVolume: 0.8,
  bgmVolume: 0.45,
  sfxVolume: 0.55,
  muted: false,
}

const volume = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value)
  ? Math.min(1, Math.max(0, value))
  : fallback

export function sanitizeAudioSettings(value: unknown): AudioSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULT_AUDIO_SETTINGS }
  const candidate = value as Record<string, unknown>
  return {
    masterVolume: volume(candidate.masterVolume, DEFAULT_AUDIO_SETTINGS.masterVolume),
    bgmVolume: volume(candidate.bgmVolume, DEFAULT_AUDIO_SETTINGS.bgmVolume),
    sfxVolume: volume(candidate.sfxVolume, DEFAULT_AUDIO_SETTINGS.sfxVolume),
    muted: typeof candidate.muted === 'boolean' ? candidate.muted : DEFAULT_AUDIO_SETTINGS.muted,
  }
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY)
    return raw ? sanitizeAudioSettings(JSON.parse(raw)) : { ...DEFAULT_AUDIO_SETTINGS }
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS }
  }
}

export function saveAudioSettings(settings: AudioSettings) {
  try {
    window.localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // 隐私模式或站点存储被禁用时，音频仍可在当前标签页使用。
  }
}

