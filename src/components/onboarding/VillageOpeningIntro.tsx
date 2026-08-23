import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import villageMapDay from '../../assets/pixel/village-map-day.webp'
import { locations } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { GameIcon } from '../icons/GameIcon'
import { calculateOpeningCamera } from './opening-camera'
import { VILLAGE_OPENING_BEATS, formatVillageOpeningText } from './village-opening-story'

const MAP_ASPECT_RATIO = 1672 / 941
const LORAN_PORTRAIT = './assets/portraits/generated/loran.png'

type CameraStyle = CSSProperties & {
  '--village-intro-camera-x': string
  '--village-intro-camera-y': string
  '--village-intro-camera-scale': string
}

function currentViewport() {
  return {
    width: typeof window === 'undefined' ? 1440 : Math.max(1, window.innerWidth),
    height: typeof window === 'undefined' ? 900 : Math.max(1, window.innerHeight),
  }
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest('button, a, input, textarea, select'))
}

export function VillageOpeningIntro() {
  const { state, dispatch } = useGame()
  const [beatIndex, setBeatIndex] = useState(0)
  const [confirmingSkip, setConfirmingSkip] = useState(false)
  const [portraitFailed, setPortraitFailed] = useState(false)
  const [viewport, setViewport] = useState(currentViewport)
  const completedRef = useRef(false)
  const skipButtonRef = useRef<HTMLButtonElement>(null)
  const continueWatchingRef = useRef<HTMLButtonElement>(null)
  const confirmSkipRef = useRef<HTMLButtonElement>(null)
  const beat = VILLAGE_OPENING_BEATS[beatIndex]
  const location = beat.focusLocationId
    ? locations.find((candidate) => candidate.id === beat.focusLocationId)
    : undefined
  const mapPosition = location?.mapPosition
  const camera = useMemo(() => calculateOpeningCamera({
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    mapAspectRatio: MAP_ASPECT_RATIO,
    focusRect: mapPosition,
  }), [mapPosition, viewport.height, viewport.width])
  const cameraStyle: CameraStyle = {
    '--village-intro-camera-x': `${camera.x}px`,
    '--village-intro-camera-y': `${camera.y}px`,
    '--village-intro-camera-scale': String(camera.scale),
  }

  const complete = useCallback(() => {
    if (completedRef.current) return
    completedRef.current = true
    dispatch({ type: 'COMPLETE_VILLAGE_INTRO' })
  }, [dispatch])

  const advance = useCallback(() => {
    if (beatIndex >= VILLAGE_OPENING_BEATS.length - 1) {
      complete()
      return
    }
    setBeatIndex((current) => Math.min(current + 1, VILLAGE_OPENING_BEATS.length - 1))
  }, [beatIndex, complete])

  const cancelSkip = useCallback(() => {
    setConfirmingSkip(false)
    skipButtonRef.current?.focus()
  }, [])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [])

  useEffect(() => {
    const handleResize = () => setViewport(currentViewport())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    if (confirmingSkip) continueWatchingRef.current?.focus()
  }, [confirmingSkip])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (confirmingSkip) {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelSkip()
          return
        }
        if (event.key === 'Tab') {
          const first = continueWatchingRef.current
          const last = confirmSkipRef.current
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last?.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first?.focus()
          }
          return
        }
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowRight') event.preventDefault()
        return
      }
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || isInteractiveTarget(event.target)) return
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowRight') return
      event.preventDefault()
      advance()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [advance, cancelSkip, confirmingSkip])

  const handleDialogueClick = (event: MouseEvent<HTMLElement>) => {
    if (!isInteractiveTarget(event.target)) advance()
  }
  const advanceLabel = beatIndex === 0
    ? '开始村庄介绍'
    : beatIndex === VILLAGE_OPENING_BEATS.length - 1
      ? '进入性撸谷'
      : '继续'

  return (
    <section
      className={`village-intro ${beat.speaker === 'loran' ? 'is-loran-speaking' : 'is-narrating'}`}
      data-testid="village-opening-intro"
      aria-labelledby="village-opening-title"
    >
      <div className="village-intro__ambient" style={{ backgroundImage: `url(${villageMapDay})` }} aria-hidden="true" />
      <div
        className="village-intro__camera"
        data-testid="village-opening-camera"
        data-camera-scale={camera.scale}
        data-focus-location={location?.id ?? 'overview'}
        style={cameraStyle}
        aria-hidden="true"
      >
        <img src={villageMapDay} alt="" draggable="false" />
        {mapPosition && <span
          className="village-intro__map-focus"
          style={{
            left: `${mapPosition.x}%`,
            top: `${mapPosition.y}%`,
            width: `${mapPosition.w}%`,
            height: `${mapPosition.h}%`,
          }}
        />}
      </div>
      <div className="village-intro__shade" aria-hidden="true" />

      <header className="village-intro__topbar">
        <div className="village-intro__heading">
          <GameIcon name="map" size={20} weight="duotone" />
          <div><small>VILLAGE PROLOGUE</small><h1 id="village-opening-title">初见性撸谷</h1></div>
        </div>
        <button ref={skipButtonRef} className="village-intro__skip" type="button" onClick={() => setConfirmingSkip(true)}>
          <GameIcon name="close" size={18} />
          跳过剧情
        </button>
      </header>

      <div className="village-intro__location" aria-hidden="true">
        <GameIcon name="location" size={16} weight="fill" />
        {location?.name ?? '性撸谷全景'}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {location ? `正在介绍：${location.name}` : '村庄全景'}
      </span>

      <figure className="village-intro__character">
        {portraitFailed
          ? <div className="village-intro__portrait-fallback" role="img" aria-label="村长洛岚立绘加载失败"><span>洛岚</span></div>
          : <img src={LORAN_PORTRAIT} alt="村长洛岚立绘" onError={() => setPortraitFailed(true)} draggable="false" />}
      </figure>

      <article className="village-intro__dialogue" onClick={handleDialogueClick}>
        <header className="village-intro__speaker-row">
          <div>
            <small>{beat.speaker === 'narrator' ? 'SCENE NARRATION' : 'VILLAGE MAYOR'}</small>
            <strong data-testid="village-opening-speaker">{beat.speaker === 'narrator' ? '旁白' : '洛岚'}</strong>
          </div>
          <output className="village-intro__progress" aria-label="剧情进度">{beatIndex + 1} / {VILLAGE_OPENING_BEATS.length}</output>
        </header>
        {location && <span className="village-intro__place-name">{location.name}</span>}
        <p key={beat.id}>{formatVillageOpeningText(beat.text, state.playerProfile.name)}</p>
        <button className="village-intro__advance" data-testid="village-opening-advance" type="button" onClick={advance}>
          {advanceLabel}
          <GameIcon name="panRight" size={18} weight="bold" />
        </button>
      </article>

      {confirmingSkip && <div className="village-intro__confirm-scrim">
        <section className="village-intro__confirm" role="dialog" aria-modal="true" aria-labelledby="village-intro-skip-title" aria-describedby="village-intro-skip-description">
          <div className="village-intro__confirm-icon"><GameIcon name="warning" size={26} weight="duotone" /></div>
          <h2 id="village-intro-skip-title">跳过村庄介绍</h2>
          <p id="village-intro-skip-description">确定跳过村庄介绍吗？之后将直接进入游戏。</p>
          <div className="village-intro__confirm-actions">
            <button ref={continueWatchingRef} type="button" onClick={cancelSkip}>继续观看</button>
            <button ref={confirmSkipRef} className="is-destructive" type="button" onClick={complete}>确认跳过</button>
          </div>
        </section>
      </div>}
    </section>
  )
}
