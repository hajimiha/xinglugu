import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import villageMapDay from '../../assets/pixel/village-map-day.webp'
import villageMapDusk from '../../assets/pixel/village-map-dusk.webp'
import villageMapNight from '../../assets/pixel/village-map.webp'
import { advanceCalendarClock, getNpcsAtLocation } from '../../game/calendar'
import { locations } from '../../game/data'
import { useGame } from '../../game/GameContext'
import type { Location } from '../../game/types'
import { GameIcon } from '../icons/GameIcon'
import { clampMapOffset, offsetForPoint, type MapPoint, type MapSize } from './mapViewport'
import { BRAND_ATLAS, WORLD_NAME } from '../../branding'
import { getScenePeriod, preloadSceneAssets, resolveSceneAsset, scenePeriodLabels, type SceneAssetSet } from '../../visual/scene-lighting'

const MAP_ASPECT_RATIO = 1672 / 941
const PAN_STEP = 56
const DRAG_THRESHOLD = 6
const DEFAULT_VIEWPORT: MapSize = { width: 760, height: 210 }
const DEFAULT_WORLD: MapSize = { width: 1120, height: 1120 / MAP_ASPECT_RATIO }
const villageMapAssets: SceneAssetSet = { day: villageMapDay, dusk: villageMapDusk, night: villageMapNight }

interface DragState {
  pointerId: number
  startX: number
  startY: number
  origin: MapPoint
  moved: boolean
}

export function VillageMap() {
  const { state, dispatch } = useGame()
  const scenePeriod = getScenePeriod(state.minutes)
  const villageMapImage = resolveSceneAsset(villageMapAssets, state.minutes)
  const [destination, setDestination] = useState<Location | null>(null)
  const [viewportSize, setViewportSize] = useState<MapSize>(DEFAULT_VIEWPORT)
  const [worldSize, setWorldSize] = useState<MapSize>(DEFAULT_WORLD)
  const arrival = destination
    ? advanceCalendarClock(state.year, state.day, state.minutes, destination.travelMinutes)
    : null
  const expectedNpcs = destination && arrival
    ? getNpcsAtLocation(destination.id, arrival.year, arrival.day, arrival.minutes)
    : []
  const [offset, setOffset] = useState<MapPoint>(() => clampMapOffset({ x: -180, y: -120 }, DEFAULT_VIEWPORT, DEFAULT_WORLD))
  const [isDragging, setIsDragging] = useState(false)
  const viewportRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const suppressHotspotClickRef = useRef(false)
  const suppressClickTimerRef = useRef<number | null>(null)
  const frameRef = useRef<number | null>(null)
  const pendingOffsetRef = useRef<MapPoint | null>(null)
  const mapLocations = locations.filter((location) => location.mapPosition)
  const currentLocation = locations.find((location) => location.id === state.location)
  const destinationIsCurrent = destination?.id === state.location

  const commitOffset = useCallback((nextOffset: MapPoint) => {
    setOffset(clampMapOffset(nextOffset, viewportSize, worldSize))
  }, [viewportSize, worldSize])

  const scheduleOffset = useCallback((nextOffset: MapPoint) => {
    pendingOffsetRef.current = nextOffset
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      if (pendingOffsetRef.current) commitOffset(pendingOffsetRef.current)
      pendingOffsetRef.current = null
    })
  }, [commitOffset])

  const resetView = useCallback(() => {
    commitOffset({
      x: (viewportSize.width - worldSize.width) / 2,
      y: (viewportSize.height - worldSize.height) / 2,
    })
  }, [commitOffset, viewportSize, worldSize])

  const centerLocation = useCallback((location?: Location) => {
    if (!location?.mapPosition) {
      resetView()
      return
    }
    const point = {
      x: worldSize.width * (location.mapPosition.x + location.mapPosition.w / 2) / 100,
      y: worldSize.height * (location.mapPosition.y + location.mapPosition.h / 2) / 100,
    }
    commitOffset(offsetForPoint(point, viewportSize, worldSize))
  }, [commitOffset, resetView, viewportSize, worldSize])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const updateDimensions = () => {
      const bounds = viewport.getBoundingClientRect()
      if (!bounds.width || !bounds.height) return
      const nextViewport = { width: bounds.width, height: bounds.height }
      const minimumWidth = bounds.width < 600 ? 780 : 1120
      const nextWorldWidth = Math.max(minimumWidth, bounds.width, bounds.height * MAP_ASPECT_RATIO)
      const nextWorld = { width: nextWorldWidth, height: nextWorldWidth / MAP_ASPECT_RATIO }
      setViewportSize(nextViewport)
      setWorldSize(nextWorld)
      setOffset((current) => clampMapOffset(current, nextViewport, nextWorld))
    }

    updateDimensions()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateDimensions)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [])

  useEffect(() => preloadSceneAssets(villageMapAssets, state.minutes), [scenePeriod])

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current)
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
  }, [])

  const panMap = (deltaX: number, deltaY: number) => {
    commitOffset({ x: offset.x + deltaX, y: offset.y + deltaY })
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const deltaByKey: Record<string, MapPoint> = {
      ArrowLeft: { x: -PAN_STEP, y: 0 },
      ArrowRight: { x: PAN_STEP, y: 0 },
      ArrowUp: { x: 0, y: -PAN_STEP },
      ArrowDown: { x: 0, y: PAN_STEP },
    }
    const delta = deltaByKey[event.key]
    if (delta) {
      event.preventDefault()
      panMap(delta.x, delta.y)
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      resetView()
    }
    if (event.key.toLowerCase() === 'c') {
      event.preventDefault()
      centerLocation(currentLocation)
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    if (suppressClickTimerRef.current !== null) window.clearTimeout(suppressClickTimerRef.current)
    suppressClickTimerRef.current = null
    suppressHotspotClickRef.current = false
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: offset,
      moved: false,
    }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
      drag.moved = true
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setIsDragging(true)
    }
    if (drag.moved) scheduleOffset({ x: drag.origin.x + deltaX, y: drag.origin.y + deltaY })
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    suppressHotspotClickRef.current = drag.moved
    if (drag.moved) {
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressHotspotClickRef.current = false
        suppressClickTimerRef.current = null
      }, 0)
    }
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }
    setIsDragging(false)
  }

  const chooseDestination = (location: Location) => {
    if (suppressHotspotClickRef.current) {
      suppressHotspotClickRef.current = false
      return
    }
    setDestination(location)
  }

  const confirmTravel = () => {
    if (!destination) return
    dispatch({ type: 'TRAVEL_TO_LOCATION', location: destination.id, minutes: destination.travelMinutes })
    dispatch({ type: 'ADD_TOAST', toast: { tone: 'success', title: '行程完成', message: `你已抵达${destination.name}，时间过去了 ${destination.travelMinutes} 分钟。` } })
    setDestination(null)
  }

  return (
    <nav className="village-map panel-frame" aria-labelledby="village-map-title">
      <header className="village-map-header">
        <div className="map-title-group">
          <GameIcon name="map" size={22} weight="duotone" />
          <div><p className="eyebrow">{BRAND_ATLAS}</p><h2 id="village-map-title">村庄地图</h2></div>
        </div>
        <p><span className="map-current-dot" aria-hidden="true" /> 当前：{currentLocation?.name}</p>
        <span className="map-hint">拖动地图，选择建筑预览行程</span>
      </header>

      <div
        ref={viewportRef}
        id="village-map-viewport"
        className={`village-map-canvas ${isDragging ? 'is-dragging' : ''}`}
        role="application"
        aria-label={`可拖动的${WORLD_NAME}地图`}
        aria-describedby="map-navigation-help"
        tabIndex={0}
        data-offset-x={offset.x}
        data-offset-y={offset.y}
        onKeyDown={handleKeyDown}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <span id="map-navigation-help" className="sr-only">按住并拖动地图查看全部地点；也可使用方向键移动，按 C 定位当前地点，按 Home 重置视野。</span>
        <div
          className="village-map-world"
          style={{
            width: worldSize.width,
            height: worldSize.height,
            transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
          }}
        >
          <img key={scenePeriod} src={villageMapImage} width="1672" height="941" alt={`${WORLD_NAME}${scenePeriodLabels[scenePeriod]}地图，森林、村庄、矿山与海岸由道路相连`} data-scene-period={scenePeriod} draggable="false" />
          {mapLocations.map((location) => (
            <button
              key={location.id}
              id={`map-location-${location.id}`}
              className={`map-hotspot ${state.location === location.id ? 'is-current' : ''}`}
              style={{
                '--map-x': `${location.mapPosition?.x ?? 50}%`,
                '--map-y': `${location.mapPosition?.y ?? 50}%`,
                '--map-w': `${location.mapPosition?.w ?? 10}%`,
                '--map-h': `${location.mapPosition?.h ?? 10}%`,
              } as CSSProperties}
              type="button"
              aria-label={`前往${location.name}`}
              aria-current={state.location === location.id ? 'location' : undefined}
              onClick={() => chooseDestination(location)}
            >
              <span className="map-hotspot-label"><strong>{location.name}</strong><small>{state.location === location.id ? '当前位置' : `${location.travelMinutes} 分钟`}</small></span>
            </button>
          ))}
        </div>

        <div className="map-controls" aria-label="地图视野控制">
          <button id="map-center-current" className="map-control-center" type="button" aria-label="定位当前地点" onClick={() => centerLocation(currentLocation)}><GameIcon name="crosshair" size={16} weight="duotone" /></button>
          <button id="map-reset-view" className="map-control-reset" type="button" aria-label="重置地图视野" onClick={resetView}><GameIcon name="reset" size={15} weight="duotone" /></button>
        </div>
      </div>

      <details className="map-mobile-list">
        <summary id="map-mobile-toggle">查看地点列表</summary>
        <div>
          {mapLocations.map((location) => <button id={`map-list-${location.id}`} key={location.id} type="button" aria-label={`从地点列表选择${location.name}`} onClick={() => setDestination(location)}><span>{location.name}</span><small>{state.location === location.id ? '当前位置' : `${location.travelMinutes} 分钟`}</small></button>)}
        </div>
      </details>

      {destination && (
        <section className="travel-popover" role="dialog" aria-modal="false" aria-labelledby="travel-dialog-title">
          <div className="travel-heading">
            <div><span>行程预览</span><h3 id="travel-dialog-title">前往{destination.name}</h3></div>
            <button id={`travel-cancel-${destination.id}`} className="icon-button" type="button" aria-label={`取消前往${destination.name}`} onClick={() => setDestination(null)}><GameIcon name="close" size={17} /></button>
          </div>
          <p>{destination.description}</p>
          <dl>
            <div><dt>路程</dt><dd>{destination.travelMinutes} 分钟</dd></div>
            <div><dt>开放</dt><dd>{destination.hours}</dd></div>
            <div><dt>预计在场</dt><dd>{expectedNpcs.length ? expectedNpcs.map((npc) => npc.name).join('、') : '暂无人物'}</dd></div>
          </dl>
          <button id={`travel-confirm-${destination.id}`} className="primary-button travel-confirm" type="button" disabled={destinationIsCurrent} aria-label={destinationIsCurrent ? `已在${destination.name}` : `确认前往${destination.name}`} onClick={confirmTravel}>{destinationIsCurrent ? '已在此处' : '确认出发'}</button>
        </section>
      )}
    </nav>
  )
}
