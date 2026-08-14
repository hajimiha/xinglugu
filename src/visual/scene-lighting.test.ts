import { afterEach, describe, expect, it, vi } from 'vitest'
import { getScenePeriod, preloadSceneAssets, resolveSceneAsset, type SceneAssetSet } from './scene-lighting'

const assets: SceneAssetSet = {
  day: '/scene-day.webp',
  dusk: '/scene-dusk.webp',
  night: '/scene-night.webp',
}

afterEach(() => vi.unstubAllGlobals())

describe('getScenePeriod', () => {
  it.each([
    [0, 'night'],
    [359, 'night'],
    [360, 'day'],
    [1019, 'day'],
    [1020, 'dusk'],
    [1199, 'dusk'],
    [1200, 'night'],
    [1439, 'night'],
  ] as const)('maps minute %i to %s', (minutes, expected) => {
    expect(getScenePeriod(minutes)).toBe(expected)
  })

  it('normalizes negative, overflow and non-finite minute values', () => {
    expect(getScenePeriod(-1)).toBe('night')
    expect(getScenePeriod(1440 + 360)).toBe('day')
    expect(getScenePeriod(Number.NaN)).toBe('night')
    expect(getScenePeriod(Number.POSITIVE_INFINITY)).toBe('night')
  })
})

describe('resolveSceneAsset', () => {
  it('uses the matching period asset', () => {
    expect(resolveSceneAsset(assets, 8 * 60)).toBe(assets.day)
    expect(resolveSceneAsset(assets, 18 * 60)).toBe(assets.dusk)
    expect(resolveSceneAsset(assets, 23 * 60)).toBe(assets.night)
  })

  it('preloads only the current and next period instead of all large variants', () => {
    const sources: string[] = []
    class FakeImage {
      decoding = ''
      onload: null = null
      onerror: null = null
      set src(value: string) { sources.push(value) }
    }
    vi.stubGlobal('Image', FakeImage)
    const cleanup = preloadSceneAssets(assets, 8 * 60)
    expect(sources).toEqual([assets.day, assets.dusk])
    expect(sources).not.toContain(assets.night)
    cleanup()
  })
})
