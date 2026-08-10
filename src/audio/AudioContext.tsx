import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_AUDIO_SETTINGS, loadAudioSettings, saveAudioSettings, sanitizeAudioSettings, type AudioSettings } from './audio-settings'
import { createAudioStorage, type AudioStorage, type StoredBgm } from './audio-storage'

type SoundKind = 'click' | 'confirm' | 'danger'

interface AudioContextValue {
  settings: AudioSettings
  bgmName: string
  updateSettings(patch: Partial<AudioSettings>): void
  uploadBgm(file: File): Promise<void>
  clearBgm(): Promise<void>
  playSound(kind?: SoundKind): void
}

const fallbackValue: AudioContextValue = {
  settings: DEFAULT_AUDIO_SETTINGS,
  bgmName: '',
  updateSettings: () => undefined,
  uploadBgm: async () => undefined,
  clearBgm: async () => undefined,
  playSound: () => undefined,
}

const AudioSettingsContext = createContext<AudioContextValue>(fallbackValue)

function createAudioElement() {
  if (typeof Audio === 'undefined') return null
  const audio = new Audio()
  audio.loop = true
  audio.preload = 'auto'
  return audio
}

function pauseAudio(audio: HTMLAudioElement) {
  try { audio.pause() } catch { /* 浏览器媒体实现不可用时保持静默。 */ }
}

function startAudio(audio: HTMLAudioElement) {
  try {
    const pending = audio.play()
    if (pending && typeof pending.catch === 'function') void pending.catch(() => undefined)
  } catch {
    // 自动播放策略或测试环境不支持播放时，等待下一次用户手势。
  }
}

export function AudioProvider({ children, storage }: { children: React.ReactNode; storage?: AudioStorage }) {
  const [settings, setSettings] = useState(loadAudioSettings)
  const [bgmName, setBgmName] = useState('')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const objectUrlRef = useRef('')
  const storageRef = useRef(storage ?? createAudioStorage())

  const applyAsset = useCallback((asset?: StoredBgm) => {
    const audio = audioRef.current ?? (asset ? createAudioElement() : null)
    audioRef.current = audio
    if (objectUrlRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrlRef.current)
    objectUrlRef.current = ''
    setBgmName(asset?.name ?? '')
    if (!audio) return
    pauseAudio(audio)
    audio.removeAttribute('src')
    if (!asset || typeof URL.createObjectURL !== 'function') return
    const objectUrl = URL.createObjectURL(asset.blob)
    objectUrlRef.current = objectUrl
    audio.src = objectUrl
    audio.load()
  }, [])

  useEffect(() => {
    let active = true
    void storageRef.current.load().then((asset) => { if (active) applyAsset(asset) }).catch(() => undefined)
    return () => { active = false }
  }, [applyAsset])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    audio.volume = settings.muted ? 0 : settings.masterVolume * settings.bgmVolume
  }, [settings])

  useEffect(() => {
    const unlock = () => {
      const audio = audioRef.current
      if (audio?.src && !settings.muted) startAudio(audio)
    }
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [bgmName, settings.muted])

  useEffect(() => () => {
    if (audioRef.current) pauseAudio(audioRef.current)
    if (objectUrlRef.current && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(objectUrlRef.current)
  }, [])

  const updateSettings = useCallback((patch: Partial<AudioSettings>) => {
    setSettings((current) => {
      const next = sanitizeAudioSettings({ ...current, ...patch })
      saveAudioSettings(next)
      return next
    })
  }, [])

  const playSound = useCallback((kind: SoundKind = 'click') => {
    if (settings.muted || settings.masterVolume === 0 || settings.sfxVolume === 0) return
    const Context = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Context) return
    const context = new Context()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    const now = context.currentTime
    const frequencies: Record<SoundKind, [number, number]> = { click: [620, 520], confirm: [540, 760], danger: [280, 190] }
    const [start, end] = frequencies[kind]
    oscillator.type = kind === 'danger' ? 'square' : 'sine'
    oscillator.frequency.setValueAtTime(start, now)
    oscillator.frequency.exponentialRampToValueAtTime(end, now + 0.065)
    gain.gain.setValueAtTime(Math.max(0.0001, settings.masterVolume * settings.sfxVolume * 0.075), now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.075)
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start(now)
    oscillator.stop(now + 0.08)
    oscillator.addEventListener('ended', () => { void context.close() }, { once: true })
  }, [settings])

  useEffect(() => {
    const handleClick = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target.closest('button, [role="button"]') : null
      if (!target || target.getAttribute('aria-disabled') === 'true' || (target as HTMLButtonElement).disabled) return
      playSound(target.classList.contains('danger-button') || target.classList.contains('danger-ghost') ? 'danger' : target.classList.contains('primary-button') ? 'confirm' : 'click')
    }
    document.addEventListener('pointerup', handleClick)
    return () => document.removeEventListener('pointerup', handleClick)
  }, [playSound])

  const uploadBgm = useCallback(async (file: File) => {
    if (!file.type.startsWith('audio/')) throw new Error('请选择有效的音频文件。')
    if (file.size > 30 * 1024 * 1024) throw new Error('单个背景音乐文件请控制在 30 MB 以内。')
    const asset: StoredBgm = { id: 'active-bgm', name: file.name, type: file.type, blob: file, updatedAt: Date.now() }
    await storageRef.current.save(asset)
    applyAsset(asset)
    const audio = audioRef.current
    if (audio && !settings.muted) startAudio(audio)
  }, [applyAsset, settings.muted])

  const clearBgm = useCallback(async () => {
    await storageRef.current.clear()
    applyAsset(undefined)
  }, [applyAsset])

  const value = useMemo(() => ({ settings, bgmName, updateSettings, uploadBgm, clearBgm, playSound }), [settings, bgmName, updateSettings, uploadBgm, clearBgm, playSound])
  return <AudioSettingsContext.Provider value={value}>{children}</AudioSettingsContext.Provider>
}

export function useAudio() {
  return useContext(AudioSettingsContext)
}
