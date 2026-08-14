export type ScenePeriod = 'day' | 'dusk' | 'night'

export interface SceneAssetSet {
  day: string
  dusk: string
  night: string
}

const MINUTES_PER_DAY = 24 * 60
const DAY_START = 6 * 60
const DUSK_START = 17 * 60
const NIGHT_START = 20 * 60

export const scenePeriodLabels: Record<ScenePeriod, string> = {
  day: '白昼',
  dusk: '黄昏',
  night: '夜晚',
}

function normalizeMinute(minutes: number): number {
  if (!Number.isFinite(minutes)) return 0
  const whole = Math.floor(minutes)
  return ((whole % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
}

export function getScenePeriod(minutes: number): ScenePeriod {
  const minute = normalizeMinute(minutes)
  if (minute >= NIGHT_START || minute < DAY_START) return 'night'
  if (minute >= DUSK_START) return 'dusk'
  return 'day'
}

export function resolveSceneAsset(assets: SceneAssetSet, minutes: number): string {
  return assets[getScenePeriod(minutes)] || assets.night
}

const nextPeriod: Record<ScenePeriod, ScenePeriod> = {
  day: 'dusk',
  dusk: 'night',
  night: 'day',
}

export function preloadSceneAssets(assets: SceneAssetSet, minutes: number): () => void {
  if (typeof Image === 'undefined') return () => undefined
  const period = getScenePeriod(minutes)
  const sources = [assets[period], assets[nextPeriod[period]]]
  const loaders = sources.map((source) => {
    const image = new Image()
    image.decoding = 'async'
    image.src = source
    return image
  })
  return () => loaders.forEach((image) => {
    image.onload = null
    image.onerror = null
  })
}
