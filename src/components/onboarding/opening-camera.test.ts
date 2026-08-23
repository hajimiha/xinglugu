import { describe, expect, it } from 'vitest'
import { locations } from '../../game/data'
import { calculateOpeningCamera } from './opening-camera'

const MAP_ASPECT_RATIO = 1672 / 941

describe('村庄开场地图镜头', () => {
  it('没有有效地点时安全返回完整全景', () => {
    expect(calculateOpeningCamera({ viewportWidth: 1440, viewportHeight: 900, mapAspectRatio: MAP_ASPECT_RATIO })).toEqual({ scale: 1, x: 0, y: 0 })
    expect(calculateOpeningCamera({ viewportWidth: 0, viewportHeight: 900, mapAspectRatio: MAP_ASPECT_RATIO, focusRect: locations[0].mapPosition })).toEqual({ scale: 1, x: 0, y: 0 })
    expect(calculateOpeningCamera({ viewportWidth: 375, viewportHeight: 667, mapAspectRatio: MAP_ASPECT_RATIO, focusRect: { x: 10, y: 10, w: 0, h: 20 } })).toEqual({ scale: 1, x: 0, y: 0 })
    expect(calculateOpeningCamera({ viewportWidth: 375, viewportHeight: 667, mapAspectRatio: MAP_ASPECT_RATIO, focusRect: { x: 95, y: 10, w: 10, h: 20 } })).toEqual({ scale: 1, x: 0, y: 0 })
  })

  it('在四档视口为全部地点产生有限且受限的放大镜头', () => {
    const viewports = [
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]

    for (const viewport of viewports) {
      for (const location of locations) {
        const result = calculateOpeningCamera({
          viewportWidth: viewport.width,
          viewportHeight: viewport.height,
          mapAspectRatio: MAP_ASPECT_RATIO,
          focusRect: location.mapPosition,
        })
        expect([result.scale, result.x, result.y].every(Number.isFinite), `${viewport.width}px ${location.name}`).toBe(true)
        expect(result.scale, `${viewport.width}px ${location.name}`).toBeGreaterThan(1)
        expect(result.scale, `${viewport.width}px ${location.name}`).toBeLessThanOrEqual(viewport.width < 600 ? 1.85 : 2.35)
      }
    }
  })

  it('移动方向与地点方位一致并保持计算确定性', () => {
    const input = { viewportWidth: 1440, viewportHeight: 900, mapAspectRatio: MAP_ASPECT_RATIO }
    const farm = locations.find((location) => location.id === 'farm')!
    const mine = locations.find((location) => location.id === 'mine')!
    const market = locations.find((location) => location.id === 'monster-market')!

    const farmCamera = calculateOpeningCamera({ ...input, focusRect: farm.mapPosition })
    expect(farmCamera.x).toBeGreaterThan(0)
    expect(farmCamera.y).toBeLessThan(0)
    expect(calculateOpeningCamera({ ...input, focusRect: mine.mapPosition }).y).toBeGreaterThan(0)
    expect(calculateOpeningCamera({ ...input, focusRect: market.mapPosition }).x).toBeLessThan(0)
    expect(calculateOpeningCamera({ ...input, focusRect: farm.mapPosition })).toEqual(farmCamera)
  })
})
