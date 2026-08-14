import { describe, expect, it } from 'vitest'
import { getLocationBackground, getLocationSceneAssets } from './location-scenes'

describe('location scene asset selection', () => {
  it('selects day, dusk and night variants from game time', () => {
    const assets = getLocationSceneAssets('smithy')
    expect(getLocationBackground('smithy', 8 * 60)).toBe(assets.day)
    expect(getLocationBackground('smithy', 18 * 60)).toBe(assets.dusk)
    expect(getLocationBackground('smithy', 22 * 60)).toBe(assets.night)
    expect(new Set(Object.values(assets))).toHaveLength(3)
  })

  it('uses the shared atlas family for locations without a dedicated source image', () => {
    expect(getLocationSceneAssets('general-store')).toBe(getLocationSceneAssets('witch-home'))
    expect(getLocationBackground('general-store', 9 * 60)).toBe(getLocationSceneAssets('general-store').day)
  })
})
