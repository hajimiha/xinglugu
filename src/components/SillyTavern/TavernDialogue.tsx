import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGame } from '../../game/GameContext'
import { formatClock, formatGameDate, getCalendarDate, getFestivalOnDay, getNpcPresence } from '../../game/calendar'
import { locations, npcs } from '../../game/data'
import type { GameState, Npc } from '../../game/types'
import type { ChatSession } from '../../sillytavern/types'
import { resolveSessionResources } from '../../sillytavern/prompt-compiler'
import { resolvePortraitSlot } from '../../sillytavern/portrait-slots'
import { applyRegexScripts, getRuntimePresetRegexScripts } from '../../sillytavern/regex-engine'
import { useTavern } from '../../tavern/TavernContext'
import { parseGalgameSegments, type GalgameSegment } from '../../tavern/galgame-dialogue'
import { GameIcon } from '../icons/GameIcon'
import { getLocationBackground } from '../stage/location-scenes'
import { HistoryDrawer } from './HistoryDrawer'
import { DialogueImageGallery } from './DialogueImageGallery'
import { extractTaggedImagePrompt } from '../../sillytavern/image-generation/prompt'
import { MAX_CHAT_PARTICIPANTS, normalizeSessionParticipantIds } from '../../sillytavern/session-participants'
import { getEligibleGalgameInvitees } from '../../tavern/galgame-participants'

const openingOptions: Record<string, string[]> = {
  loran: ['询问今日委托', '聊聊村庄近况', '暂时告辞'],
  daifu: ['请教五行魔法', '询问药剂配方', '暂时告辞'],
  rin: ['请求战斗指导', '询问魔物踪迹', '暂时告辞'],
}

interface DialogueFrame extends GalgameSegment {
  id: string
}

function extractStreamingMaintext(raw: string): string {
  const marker = '<maintext>'
  const start = raw.indexOf(marker)
  if (start < 0) return ''
  const content = raw.slice(start + marker.length)
  const end = content.indexOf('</maintext>')
  return (end >= 0 ? content.slice(0, end) : content).trimStart()
}

function createDialogueVariables(state: GameState, npc: Npc, affinity: number) {
  const date = getCalendarDate(state.year, state.day)
  const festival = getFestivalOnDay(state.day)
  const presence = getNpcPresence(npc.id, state.year, state.day, state.minutes)
  return {
    playerName: state.playerProfile.name,
    userName: state.playerProfile.name,
    affinity,
    money: state.money,
    energy: state.energy,
    year: state.year,
    day: state.day,
    dayOfYear: state.day,
    date: formatGameDate(state.year, state.day),
    time: formatClock(state.minutes),
    weekday: date.weekday,
    season: date.season,
    weather: state.weather,
    location: state.location,
    playerLocation: locations.find((location) => location.id === state.location)?.name ?? state.location,
    currentFestival: festival?.name ?? '无节日',
    npcLocation: locations.find((location) => location.id === presence.locationId)?.name ?? presence.locationId,
    npcActivity: presence.activity,
  }
}

export function TavernDialogue({ npc }: { npc: Npc }) {
  const { state, dispatch } = useGame()
  const tavern = useTavern()
  const relationship = state.relationships[npc.id]
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionSnapshot, setSessionSnapshot] = useState<ChatSession | null>(null)
  const [input, setInput] = useState('')
  const [working, setWorking] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [streamingReasoning, setStreamingReasoning] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [cinemaMode, setCinemaMode] = useState(false)
  const cinemaModeRef = useRef(false)
  const [interactionOpen, setInteractionOpen] = useState(false)
  const [interactionTab, setInteractionTab] = useState<'conversation' | 'invite' | 'gallery'>('conversation')
  const [invitingNpcId, setInvitingNpcId] = useState<string | null>(null)
  const [inviteStatus, setInviteStatus] = useState<string | null>(null)
  const interactionOpenRef = useRef(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const openingRef = useRef(false)
  const autoIntentRef = useRef<string | null>(null)
  const autoImageAttemptedRef = useRef(new Set<string>())
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const dialogueRef = useRef<HTMLElement | null>(null)
  const interactionToggleRef = useRef<HTMLButtonElement | null>(null)
  const inviteEntryRef = useRef<HTMLButtonElement | null>(null)
  const interactionCloseRef = useRef<HTMLButtonElement | null>(null)
  const interactionReturnFocusRef = useRef<'interaction' | 'invite'>('interaction')
  const focusBeforeCinemaRef = useRef<HTMLElement | null>(null)
  const dialogueVariables = useMemo(
    () => createDialogueVariables(state, npc, relationship.affinity),
    [state, npc, relationship.affinity],
  )

  useEffect(() => {
    if (tavern.status !== 'ready' || openingRef.current) return
    openingRef.current = true
    void tavern.openNpcSession(npc.id, dialogueVariables)
      .then((session) => { setSessionId(session.id); setSessionSnapshot(session) })
      .catch((caught) => {
        openingRef.current = false
        setError(caught instanceof Error ? caught.message : '会话初始化失败')
      })
  }, [tavern.status, tavern.openNpcSession, npc.id, dialogueVariables])

  useEffect(() => () => abortRef.current?.abort(), [])

  const closeInteraction = () => {
    interactionOpenRef.current = false
    setInteractionOpen(false)
    requestAnimationFrame(() => {
      const target = interactionReturnFocusRef.current === 'invite' ? inviteEntryRef : interactionToggleRef
      target.current?.focus()
    })
  }

  const toggleInteraction = () => {
    const next = !interactionOpenRef.current
    if (next) interactionReturnFocusRef.current = 'interaction'
    interactionOpenRef.current = next
    setInteractionOpen(next)
  }

  const openInvitation = () => {
    interactionReturnFocusRef.current = 'invite'
    interactionOpenRef.current = true
    setInteractionTab('invite')
    setInteractionOpen(true)
    setInviteStatus(null)
  }

  useEffect(() => {
    if (!interactionOpen || cinemaMode) return
    requestAnimationFrame(() => interactionCloseRef.current?.focus())
  }, [interactionOpen, cinemaMode])

  useEffect(() => {
    if (!interactionOpen || !cinemaMode) return
    requestAnimationFrame(() => interactionCloseRef.current?.focus())
  }, [interactionOpen, cinemaMode])

  useEffect(() => {
    const closeTopLayerOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (interactionOpenRef.current) {
        event.preventDefault()
        closeInteraction()
      } else if (cinemaModeRef.current) {
        event.preventDefault()
        cinemaModeRef.current = false
        setCinemaMode(false)
      }
    }
    document.addEventListener('keydown', closeTopLayerOnEscape)
    return () => document.removeEventListener('keydown', closeTopLayerOnEscape)
  }, [])

  useEffect(() => {
    if (!cinemaMode) return
    const previousOverflow = document.body.style.overflow
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !dialogueRef.current) return
      const focusable = Array.from(dialogueRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'))
        .filter((element) => !element.closest('[inert]'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (document.activeElement === dialogueRef.current || !dialogueRef.current.contains(document.activeElement)) {
        event.preventDefault()
        const wrapTarget = event.shiftKey ? last : first
        wrapTarget.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => dialogueRef.current?.focus())
    document.addEventListener('keydown', trapFocus)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', trapFocus)
      const previousId = focusBeforeCinemaRef.current?.id
      requestAnimationFrame(() => {
        if (previousId) document.getElementById(previousId)?.focus()
      })
    }
  }, [cinemaMode])

  const session = tavern.sessions.find((candidate) => candidate.id === sessionId) ?? sessionSnapshot
  const participantNpcIds = useMemo(
    () => normalizeSessionParticipantIds(npc.id, session?.participantNpcIds),
    [npc.id, session?.participantNpcIds],
  )
  const participants = useMemo(() => participantNpcIds.flatMap((participantId) => {
    const resident = participantId === npc.id ? npc : npcs.find((candidate) => candidate.id === participantId)
    const participantRelationship = state.relationships[participantId]
    if (!resident || !participantRelationship) return []
    const participantCard = tavern.characters.find((candidate) => candidate.npcId === participantId)
    return [{
      npc: resident,
      relationship: participantRelationship,
      card: participantCard,
      portraitSource: participantCard
        ? resolvePortraitSlot(participantCard.portraitSlots, participantRelationship.affinity)?.source
        : undefined,
    }]
  }), [participantNpcIds, npc, state.relationships, tavern.characters])
  const eligibleInvitees = useMemo(() => getEligibleGalgameInvitees(
    npcs,
    state.relationships,
    participantNpcIds,
  ).filter((candidate) => tavern.characters.some((card) => card.npcId === candidate.id)), [state.relationships, participantNpcIds, tavern.characters])
  const participantNames = useMemo(() => participants.map((participant) => participant.npc.name), [participants])
  const effectiveDialogueVariables = useMemo(() => participants.length > 1 ? {
    ...dialogueVariables,
    dialogueMode: 'multi-character',
    dialogueParticipantNames: participantNames.join('、'),
    dialogueParticipantCount: participants.length,
  } : dialogueVariables, [dialogueVariables, participantNames, participants.length])

  const inviteParticipant = async (invitee: Npc) => {
    if (!session || working || invitingNpcId) return
    const currentIds = normalizeSessionParticipantIds(npc.id, session.participantNpcIds)
    const stillEligible = getEligibleGalgameInvitees(npcs, state.relationships, currentIds)
      .some((candidate) => candidate.id === invitee.id)
    const inviteeCard = tavern.characters.find((candidate) => candidate.npcId === invitee.id)
    if (!stillEligible || !inviteeCard) {
      setInviteStatus(null)
      setError('该角色当前不满足邀约条件，可能是好感变化或席位已满。')
      return
    }
    const nextParticipantIds = normalizeSessionParticipantIds(npc.id, [...currentIds, invitee.id])
    if (nextParticipantIds.length === currentIds.length) {
      setInviteStatus(null)
      setError('该角色已经在当前对话中，或五个席位已经坐满。')
      return
    }

    setInvitingNpcId(invitee.id)
    setInviteStatus(null)
    setError(null)
    const nextSession = {
      ...session,
      participantNpcIds: nextParticipantIds,
      lorebookIds: [...new Set([...session.lorebookIds, ...inviteeCard.lorebookIds])],
      updatedAt: Date.now(),
    }
    try {
      await tavern.saveSession(nextSession)
      setSessionSnapshot(nextSession)
      setInviteStatus(`${invitee.name}已加入对话，接下来的回复会把她纳入同一场景。`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '邀约保存失败，请稍后重试。')
    } finally {
      setInvitingNpcId(null)
    }
  }
  const lastAssistant = [...(session?.messages ?? [])].reverse().find((message) => message.role === 'assistant')
  const options = lastAssistant?.parsed?.options.length ? lastAssistant.parsed.options : (openingOptions[npc.id] ?? ['继续交谈', '询问她的近况', '暂时告辞'])
  const card = participants.find((participant) => participant.npc.id === npc.id)?.card
  const activeResources = useMemo(() => {
    if (!session || !tavern.settings || tavern.presets.length === 0) return null
    return resolveSessionResources(session, tavern.settings, tavern.presets, tavern.lorebooks)
  }, [session, tavern.settings, tavern.presets, tavern.lorebooks])
  const displayScripts = useMemo(() => [
    ...(tavern.settings?.regexScripts ?? []),
    ...(activeResources ? getRuntimePresetRegexScripts(activeResources.preset.settings) : []),
  ], [tavern.settings?.regexScripts, activeResources])
  const displayedMessages = useMemo(() => (session?.messages ?? []).map((message, index, messages) => ({
    ...message,
    displayContent: applyRegexScripts(message.content, displayScripts, {
      stage: 'display',
      target: message.role === 'user' ? 'user' : 'assistant',
      depth: messages.length - index - 1,
      macroContext: {
        userName: session?.userName ?? '旅行者',
        characterName: card?.name ?? npc.name,
        original: message.content,
        lastUserMessage: [...messages.slice(0, index)].reverse().find((item) => item.role === 'user')?.content ?? '',
        lastCharacterMessage: [...messages.slice(0, index)].reverse().find((item) => item.role === 'assistant')?.content ?? '',
      },
      variables: { ...(session?.variables ?? {}), ...effectiveDialogueVariables },
    }).text,
  })), [session?.messages, session?.userName, session?.variables, displayScripts, card?.name, npc.name, effectiveDialogueVariables])
  const dialogueFrames = useMemo<DialogueFrame[]>(() => displayedMessages.flatMap((message) => {
    const segments = message.role === 'user'
      ? [{ speaker: 'player' as const, name: state.playerProfile.name, text: message.displayContent.trim() }]
      : parseGalgameSegments(message.displayContent, { npcName: npc.name, npcNames: participantNames, playerName: state.playerProfile.name })
    return segments.filter((segment) => segment.text).map((segment, index) => ({ ...segment, id: `${message.id}-${index}` }))
  }), [displayedMessages, npc.name, participantNames, state.playerProfile.name])
  const streamingFrames = useMemo<DialogueFrame[]>(() => {
    if (!working || !streamingText.trim()) return []
    return parseGalgameSegments(streamingText, { npcName: npc.name, npcNames: participantNames, playerName: state.playerProfile.name })
      .map((segment, index) => ({ ...segment, id: `streaming-${index}` }))
  }, [working, streamingText, npc.name, participantNames, state.playerProfile.name])
  const frames = streamingFrames.length ? [...dialogueFrames, ...streamingFrames] : dialogueFrames
  const activeFrame = frames[Math.min(frameIndex, Math.max(0, frames.length - 1))]
  const activeParticipant = activeFrame?.speaker === 'npc'
    ? participants.find((participant) => participant.npc.name === activeFrame.name)
    : undefined
  const portraitSource = participants.find((participant) => participant.npc.id === npc.id)?.portraitSource
  const textboxPortrait = activeParticipant?.portraitSource ?? (participants.length === 1 ? portraitSource : undefined)
  const sceneBackground = getLocationBackground(state.location, state.minutes)

  useEffect(() => {
    const imageSettings = tavern.settings?.imageGeneration
    if (!session || !lastAssistant || lastAssistant.apiUsed !== 'remote' || !imageSettings?.enabled || !imageSettings.auto.enabled) return
    if (autoImageAttemptedRef.current.has(lastAssistant.id) || tavern.imageJobs.some((job) => job.messageId === lastAssistant.id)) return
    const remoteReplies = session.messages.filter((message) => message.role === 'assistant' && message.apiUsed === 'remote').length
    if (remoteReplies % imageSettings.auto.everyNthAssistantMessage !== 0) return
    if (imageSettings.auto.requireTaggedPrompt && !extractTaggedImagePrompt(lastAssistant.content, imageSettings.prompt.triggerStart, imageSettings.prompt.triggerEnd)) return
    autoImageAttemptedRef.current.add(lastAssistant.id)
    void tavern.generateDialogueImage({ sessionId: session.id, npcId: npc.id, messageId: lastAssistant.id, sourceText: lastAssistant.content })
      .catch(() => undefined)
  }, [session, lastAssistant, tavern.settings?.imageGeneration, tavern.imageJobs, tavern.generateDialogueImage, npc.id])

  useEffect(() => {
    if (frames.length) setFrameIndex(frames.length - 1)
  }, [frames.length])

  const send = async (text: string, behavior: { requireEnergy?: boolean; settleChat?: boolean } = {}) => {
    const message = text.trim()
    if (!message || working || !session) return
    const requireEnergy = behavior.requireEnergy ?? true
    const settleChat = behavior.settleChat ?? true
    if (requireEnergy && state.energy < 1) {
      setError('精力不足，今天无法继续与 NPC 互动。可以休息到明天，或前往医院恢复精力。')
      return
    }
    if (!tavern.apiReady) {
      setError(tavern.apiReadinessError ?? '接口尚未就绪，请先完成模型连接配置。')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setWorking(true)
    setStreamingText('')
    setStreamingReasoning('')
    setError(null)
    setInput('')
    try {
      const next = await tavern.sendTurn({
        sessionId: session.id,
        npcId: npc.id,
        playerText: message,
        variables: effectiveDialogueVariables,
        affinity: relationship.affinity,
        memoryTags: relationship.memoryTags,
        signal: controller.signal,
        onDelta: (raw) => setStreamingText(extractStreamingMaintext(raw)),
        onReasoningDelta: setStreamingReasoning,
      })
      setSessionSnapshot(next)
      if (settleChat) dispatch({ type: 'CHAT_WITH_NPC', npcId: npc.id })
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError(caught instanceof Error ? caught.message : '叙事生成失败，请检查接口设置。')
      }
      setInput(message)
    } finally {
      setWorking(false)
      setStreamingText('')
      setStreamingReasoning('')
      abortRef.current = null
    }
  }

  useEffect(() => {
    const intent = state.dialogueIntent
    if (!session || !intent || intent.id === autoIntentRef.current || !tavern.apiReady) return
    autoIntentRef.current = intent.id
    dispatch({ type: 'CONSUME_DIALOGUE_INTENT', intentId: intent.id })
    void send(intent.playerText, { requireEnergy: false, settleChat: false })
  }, [session, state.dialogueIntent, tavern.apiReady])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void send(input)
  }

  const branch = async (messageIndex: number) => {
    if (!session) return
    const branchSession = await tavern.branchSession(session.id, messageIndex, `${npc.name} · 分支 ${tavern.sessions.length + 1}`)
    setSessionId(branchSession.id)
    setSessionSnapshot(branchSession)
  }

  const truncate = async (messageIndex: number) => {
    if (!session) return
    const next = await tavern.truncateSession(session.id, messageIndex)
    setSessionSnapshot(next)
  }

  const readinessError = tavern.status === 'ready' && !tavern.apiReady ? tavern.apiReadinessError : null
  const displayedError = readinessError ?? error

  useEffect(() => {
    const scrollRegion = scrollRef.current
    if (!scrollRegion) return
    scrollRegion.scrollTop = scrollRegion.scrollHeight
  }, [session?.messages.length, working, streamingText, streamingReasoning, options.length, displayedError])

  const thinkingDisplay = tavern.settings?.thinkingDisplay ?? 'fold'
  const renderReasoning = (label: string, content: string | undefined, source: 'provider' | 'authored') => {
    if (!content?.trim() || thinkingDisplay === 'hide') return null
    const body = <p>{content.trim()}</p>
    return thinkingDisplay === 'inline'
      ? <aside className={`tavern-reasoning is-${source}`}><strong>{label}</strong>{body}</aside>
      : <details className={`tavern-reasoning is-${source}`}><summary>{label}</summary>{body}</details>
  }

  const dialogue = (
    <section ref={dialogueRef} className={`dialogue-view tavern-dialogue galgame-dialogue ${cinemaMode ? 'is-cinema' : ''}`} role="dialog" aria-modal={cinemaMode} aria-labelledby={`tavern-dialogue-title-${npc.id}`} tabIndex={cinemaMode ? -1 : undefined}>
      <header>
        <div>
          <span>REMOTE TAVERN · 好感 {relationship.affinity}</span>
          <h2 id={`tavern-dialogue-title-${npc.id}`}>与{npc.name}的酒馆会话</h2>
        </div>
        <div className="tavern-dialogue-header-actions">
          <button ref={inviteEntryRef} id={`dialogue-invite-open-${npc.id}`} className="dialogue-invite-button" type="button" aria-label={`邀约角色加入对话，当前 ${participantNpcIds.length}/${MAX_CHAT_PARTICIPANTS}`} disabled={working || invitingNpcId !== null} onClick={openInvitation}><GameIcon name="invite" size={18} /><span>邀约 {participantNpcIds.length}/{MAX_CHAT_PARTICIPANTS}</span></button>
          <button id={`dialogue-cinema-${npc.id}`} className="icon-button" type="button" aria-label={cinemaMode ? '退出对话全屏' : '对话全屏显示'} aria-pressed={cinemaMode} onClick={() => { if (!cinemaMode) focusBeforeCinemaRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; const next = !cinemaModeRef.current; cinemaModeRef.current = next; setCinemaMode(next) }}><GameIcon name={cinemaMode ? 'fullscreenExit' : 'fullscreen'} size={18} /></button>
          <button id={`tavern-history-open-${npc.id}`} className="icon-button" type="button" aria-label="查看会话历史" disabled={!session} onClick={() => setHistoryOpen(true)}><GameIcon name="history" size={18} /></button>
          <button id={`dialogue-close-${npc.id}`} className="icon-button" type="button" aria-label={`关闭与${npc.name}的对话`} onClick={() => dispatch({ type: 'CLOSE_MODAL' })}><GameIcon name="close" size={17} /></button>
        </div>
      </header>

      <div className="tavern-status-ribbon">
        <span className="tavern-status-dot" aria-hidden="true" />
        <strong>{tavern.apiLabel}</strong>
        <small>{tavern.status === 'loading' ? '正在载入角色记忆' : `${activeResources?.lorebooks.length ?? 0} 册世界书已挂载`}</small>
      </div>

      <div className={`galgame-scene ${activeFrame?.speaker === 'npc' ? 'is-npc-speaking' : 'is-npc-dimmed'}`} style={{ backgroundImage: `url(${sceneBackground})` }} data-testid="galgame-scene">
        <div className="galgame-scene-shade" aria-hidden="true" />
        <div
          className="galgame-character-stage"
          data-participant-count={participants.length}
          role="group"
          aria-label={`同场角色，共 ${participants.length} 人`}
        >
          {participants.map((participant) => {
            const isSpeaking = activeParticipant?.npc.id === participant.npc.id
            return <figure key={participant.npc.id} className={`galgame-participant ${isSpeaking ? 'is-speaking' : 'is-dimmed'}`} data-testid={`galgame-participant-${participant.npc.id}`} aria-label={isSpeaking ? `${participant.npc.name}，发言中` : `${participant.npc.name}，未发言`}>
              {participant.portraitSource
                ? <img className="galgame-character" src={participant.portraitSource} alt={`${participant.npc.name}立绘`} />
                : <div className="galgame-character-fallback" aria-hidden="true"><span>{participant.npc.name.slice(0, 1)}</span></div>}
              <figcaption className="galgame-participant-label"><span>{participant.npc.name}</span>{isSpeaking && <em>发言中</em>}</figcaption>
            </figure>
          })}
        </div>
        <div className="galgame-textbox" aria-live="polite">
          <div className="galgame-speaker-row">
            {textboxPortrait && <img className="galgame-avatar" src={textboxPortrait} alt="" aria-hidden="true" />}
            <div><small>{activeFrame?.speaker === 'narrator' ? 'SCENE NARRATION' : activeFrame?.speaker === 'player' ? 'PLAYER VOICE' : activeParticipant?.npc.role ?? npc.role}</small><strong data-testid="galgame-speaker-name">{activeFrame?.name ?? npc.name}</strong></div>
            <span>{frames.length ? `${Math.min(frameIndex + 1, frames.length)} / ${frames.length}` : '—'}</span>
          </div>
          <p>{activeFrame?.text ?? (working ? '模型正在组织下一幕……' : '正在读取角色记忆与当前场景。')}</p>
          <div className="galgame-frame-controls" aria-label="对话分镜控制">
            <button id={`dialogue-frame-prev-${npc.id}`} type="button" aria-label="上一段对话" disabled={frameIndex <= 0} onClick={() => setFrameIndex((current) => Math.max(0, current - 1))}><GameIcon name="panLeft" size={16} /></button>
            <button id={`dialogue-frame-next-${npc.id}`} type="button" aria-label="下一段对话" disabled={!frames.length || frameIndex >= frames.length - 1} onClick={() => setFrameIndex((current) => Math.min(frames.length - 1, current + 1))}><GameIcon name="panRight" size={16} /></button>
          </div>
        </div>
      </div>

      <button
        ref={interactionToggleRef}
        id={`dialogue-interaction-toggle-${npc.id}`}
        className={`dialogue-interaction-toggle ${interactionOpen ? 'is-open' : ''}`}
        type="button"
        aria-label={interactionOpen ? '对话互动面板已打开' : '打开对话互动面板'}
        aria-expanded={interactionOpen}
        aria-controls={`dialogue-interaction-drawer-${npc.id}`}
        tabIndex={interactionOpen ? -1 : 0}
        onClick={toggleInteraction}
      >
        <GameIcon name="chat" size={23} weight="duotone" />
        <span>互动</span>
      </button>

      <aside
        id={`dialogue-interaction-drawer-${npc.id}`}
        className={`dialogue-interaction-drawer ${interactionOpen ? 'is-open' : ''}`}
        role="complementary"
        aria-label="对话互动面板"
        aria-hidden={!interactionOpen}
        {...(!interactionOpen ? { inert: '' } : {})}
        data-testid="dialogue-interaction-drawer"
      >
        <header className="dialogue-interaction-header">
          <div><span>CONVERSATION DESK</span><strong>{interactionTab === 'conversation' ? '对话与行动' : interactionTab === 'invite' ? '邀约同场角色' : '场景绘图'}</strong></div>
          <div className="dialogue-interaction-tabs" role="tablist" aria-label="互动面板内容">
            <button id={`dialogue-interaction-conversation-${npc.id}`} role="tab" type="button" aria-selected={interactionTab === 'conversation'} aria-controls={`dialogue-interaction-panel-${npc.id}`} onClick={() => setInteractionTab('conversation')}><GameIcon name="chat" size={15} />对话</button>
            <button id={`dialogue-interaction-invite-${npc.id}`} role="tab" type="button" aria-selected={interactionTab === 'invite'} aria-controls={`dialogue-interaction-panel-${npc.id}`} onClick={() => setInteractionTab('invite')}><GameIcon name="invite" size={15} />邀约</button>
            <button id={`dialogue-interaction-gallery-${npc.id}`} role="tab" type="button" aria-selected={interactionTab === 'gallery'} aria-controls={`dialogue-interaction-panel-${npc.id}`} onClick={() => setInteractionTab('gallery')}><GameIcon name="image" size={15} />画廊</button>
          </div>
          <button ref={interactionCloseRef} id={`dialogue-interaction-close-${npc.id}`} className="icon-button" type="button" aria-label="关闭对话互动面板" onClick={closeInteraction}><GameIcon name="close" size={17} /></button>
        </header>

        {interactionTab === 'conversation' ? <div id={`dialogue-interaction-panel-${npc.id}`} ref={scrollRef} className="tavern-dialogue-scroll" data-testid="tavern-dialogue-scroll" role="tabpanel" aria-label="酒馆会话记录">
        <div className="tavern-context-strip">
          <div><GameIcon name="memory" size={16} /><span>她记得</span><p>{relationship.memoryTags.length ? relationship.memoryTags.join(' · ') : '今天的话会成为第一笔共同记忆。'}</p></div>
          <div><GameIcon name="book" size={16} /><span>角色卡</span><p>{card ? `${card.role} · ${card.tags.slice(1).join(' · ')}` : '正在读取人物档案'}</p></div>
          <div><GameIcon name="variables" size={16} /><span>变量镜像</span><p>金币 {state.money} · 精力 {state.energy} · 好感 {relationship.affinity}</p></div>
        </div>

        <div className="dialogue-log" aria-live="polite" aria-busy={working}>
          {!session && <div className="tavern-dialogue-skeleton"><i /><i /><i /></div>}
          {displayedMessages.map((message) => (
            <article key={message.id} className={`dialogue-message is-${message.role === 'user' ? 'player' : 'npc'}`}>
              <span>{message.role === 'assistant' ? npc.name : state.playerProfile.name}</span>
              {message.role === 'assistant' && renderReasoning('供应商返回的推理内容', message.metadata?.providerReasoning, 'provider')}
              {message.role === 'assistant' && renderReasoning('模型自行输出的思考标签', message.parsed?.thinking, 'authored')}
              {message.role === 'user'
                ? <p>{message.displayContent}</p>
                : parseGalgameSegments(message.displayContent, { npcName: npc.name, npcNames: participantNames, playerName: state.playerProfile.name }).map((segment, index) => <p key={`${message.id}-display-${index}`} className={`dialogue-segment is-${segment.speaker}`}><b>{segment.name}</b>{segment.text}</p>)}
              {message.parsed?.sum && <small className="dialogue-summary">楼层摘要 · {message.parsed.sum}</small>}
            </article>
          ))}
          {working && <article className="dialogue-message is-npc is-working"><span>{npc.name}</span>{renderReasoning('供应商正在返回推理内容', streamingReasoning, 'provider')}<p><i className="typing-caret" aria-label="正在组织回应" /> {streamingText || '模型正在读取角色卡与世界书……'}</p></article>}
        </div>

        {thinkingDisplay !== 'hide' && <p className="tavern-reasoning-notice">这里只显示服务商实际返回的推理字段或模型主动写出的思考标签，不代表系统隐藏思维。</p>}

        <div className="tavern-options" aria-label="本回合可选行动">
          {options.map((option, index) => (
            <button id={`dialogue-option-${npc.id}-${index}`} key={`${option}-${index}`} type="button" aria-label={`选择行动：${option}`} disabled={working || !session || !tavern.apiReady} onClick={() => void send(option)}>
              <span>{String(index + 1).padStart(2, '0')}</span>{option}<GameIcon name="send" size={15} />
            </button>
          ))}
        </div>

        {displayedError && <div className="tavern-dialogue-error" role="alert"><GameIcon name="warning" size={17} /><span>{displayedError}</span><button id={`dialogue-open-api-${npc.id}`} type="button" aria-label="打开接口设置" onClick={() => dispatch({ type: 'OPEN_MODAL', modal: 'tavern' })}>打开接口设置</button></div>}
        </div> : interactionTab === 'invite' ? <div id={`dialogue-interaction-panel-${npc.id}`} className="galgame-invite-panel" role="tabpanel" aria-label="可邀约角色">
          <div className="galgame-invite-summary">
            <div><strong>当前同场</strong><span>{participantNpcIds.length} / {MAX_CHAT_PARTICIPANTS}</span></div>
            <p>{participants.map((participant) => participant.npc.name).join(' · ')}</p>
          </div>
          {inviteStatus && <p className="galgame-invite-status" role="status"><GameIcon name="success" size={16} />{inviteStatus}</p>}
          {error && <p className="tavern-dialogue-error" role="alert"><GameIcon name="warning" size={16} />{error}</p>}
          {eligibleInvitees.length ? <ul className="galgame-invite-list">
            {eligibleInvitees.map((invitee) => {
              const inviteeRelationship = state.relationships[invitee.id]
              const inviteeCard = tavern.characters.find((candidate) => candidate.npcId === invitee.id)
              const inviteePortrait = inviteeCard ? resolvePortraitSlot(inviteeCard.portraitSlots, inviteeRelationship.affinity)?.source : undefined
              return <li key={invitee.id}>
                <div className="galgame-invite-portrait">{inviteePortrait ? <img src={inviteePortrait} alt="" aria-hidden="true" /> : <span aria-hidden="true">{invitee.name.slice(0, 1)}</span>}</div>
                <div><strong>{invitee.name}</strong><span>{invitee.role} · 好感 {inviteeRelationship.affinity}</span></div>
                <button type="button" aria-label={`邀请${invitee.name}加入对话`} disabled={!session || working || invitingNpcId !== null} onClick={() => void inviteParticipant(invitee)}>{invitingNpcId === invitee.id ? '正在邀约…' : '邀请'}</button>
              </li>
            })}
          </ul> : <div className="galgame-invite-empty"><GameIcon name="invite" size={28} /><strong>{participantNpcIds.length >= MAX_CHAT_PARTICIPANTS ? '五个席位已经坐满' : '暂无可邀约角色'}</strong><p>{participantNpcIds.length >= MAX_CHAT_PARTICIPANTS ? '当前会话已达到五名角色上限。' : '其他居民需要好感严格大于 70，且拥有可用角色卡。'}</p></div>}
        </div> : <div id={`dialogue-interaction-panel-${npc.id}`} className="dialogue-image-scroll" role="tabpanel"><DialogueImageGallery sessionId={session?.id ?? ''} npcId={npc.id} latestMessageId={lastAssistant?.id} /></div>}

        {interactionTab === 'conversation' && <form className="dialogue-composer tavern-composer" aria-label="自由输入对话" onSubmit={submit}>
        <label htmlFor={`dialogue-input-${npc.id}`}>自由输入</label>
        <textarea id={`dialogue-input-${npc.id}`} value={input} maxLength={220} rows={2} disabled={working || !session || !tavern.apiReady} placeholder={tavern.apiReady ? '描述你的选择、问题或此刻的心情……' : '请先完成 API 接口配置'} onChange={(event) => setInput(event.target.value)} />
        <div>
          <small>{input.length} / 220 · 消息将发送到已配置的模型服务</small>
          {working
            ? <button id={`dialogue-stop-${npc.id}`} className="secondary-button" type="button" onClick={() => abortRef.current?.abort()}><GameIcon name="stop" size={16} />停止生成</button>
            : <button id={`dialogue-send-${npc.id}`} className="primary-button" type="submit" disabled={!input.trim() || !session || !tavern.apiReady}><GameIcon name="send" size={16} />送出话语</button>}
        </div>
        </form>}
      </aside>

      {historyOpen && session && <HistoryDrawer session={session} onClose={() => setHistoryOpen(false)} onBranch={branch} onTruncate={truncate} />}
    </section>
  )

  return cinemaMode ? createPortal(dialogue, document.body) : dialogue
}
