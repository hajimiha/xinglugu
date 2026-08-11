import { useState } from 'react'
import { getNpcsAtLocation } from '../../game/calendar'
import { locations, npcs } from '../../game/data'
import { useGame } from '../../game/GameContext'
import type { LocationId, ModalType } from '../../game/types'
import { resolvePortraitSlot } from '../../sillytavern/portrait-slots'
import { useTavern } from '../../tavern/TavernContext'
import { DialogueErrorBoundary } from '../SillyTavern/DialogueErrorBoundary'
import { DialogueView } from '../npc/DialogueView'
import { NpcPanel } from '../npc/NpcPanel'
import { NpcPortrait } from '../npc/NpcPortrait'
import { getLocationBackground, hasCustomLocationBackground } from './location-scenes'

const sceneClass: Record<LocationId, string> = {
  farm: 'scene-shop',
  'mayor-home': 'scene-shop',
  'general-store': 'scene-shop',
  smithy: 'scene-shop',
  'monster-market': 'scene-witch',
  'witch-home': 'scene-witch',
  'hunter-camp': 'scene-witch',
  mine: 'scene-mine',
  'fisher-home': 'scene-coast',
  library: 'scene-shop',
  hospital: 'scene-shop',
}

const primaryModal: Partial<Record<LocationId, { modal: Exclude<ModalType, null>; label: string }>> = {
  'mayor-home': { modal: 'quest-board', label: '查看村民委托板' },
  'general-store': { modal: 'trade', label: '进入种子与材料柜台' },
  smithy: { modal: 'trade', label: '查看锻造与精炼' },
  'monster-market': { modal: 'ranch', label: '查看共生牧场合同' },
  'witch-home': { modal: 'trade', label: '浏览五行药剂' },
  'hunter-camp': { modal: 'hunter', label: '开始战斗训练' },
  mine: { modal: 'mine', label: '进入矿洞层级' },
  'fisher-home': { modal: 'fishing', label: '准备一次钓鱼' },
  library: { modal: 'library', label: '查阅五行法术' },
  hospital: { modal: 'hospital', label: '接受精力治疗' },
}

export function LocationStage() {
  const { state, dispatch } = useGame()
  const tavern = useTavern()
  const location = locations.find((item) => item.id === state.location)!
  const presentNpcs = getNpcsAtLocation(state.location, state.year, state.day, state.minutes)
  const selectedNpc = npcs.find((npc) => npc.id === state.selectedNpcId)
  const feature = primaryModal[state.location]
  const featureNpcId = location.npcIds.find((npcId) => presentNpcs.some((npc) => npc.id === npcId))
  const locationBackground = getLocationBackground(state.location)
  const customBackground = hasCustomLocationBackground(state.location)
  const [dialogueRecoveryKey, setDialogueRecoveryKey] = useState(0)

  const resetNpcDialogue = async (npcId: string) => {
    try {
      const matchingSessions = tavern.sessions.filter((session) => session.npcId === npcId)
      await Promise.all(matchingSessions.map((session) => tavern.deleteSession(session.id)))
      setDialogueRecoveryKey((current) => current + 1)
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'success', title: '旧会话已清理', message: '角色卡、世界书与游戏存档均已保留，现在可以重新交谈。' } })
    } catch {
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'danger', title: '会话清理失败', message: '本地会话库暂时无法写入，请返回场景后刷新页面再试。' } })
    }
  }

  const upload = async (npcId: string, slotId: string, file: File) => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'warning', title: '立绘格式不支持', message: '请选择 PNG、JPG 或 WebP 图片。' } })
      return
    }
    const card = tavern.characters.find((candidate) => candidate.npcId === npcId)
    if (!card) {
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'danger', title: '角色卡尚未就绪', message: '请稍后再试，或前往酒馆中枢检查角色卡。' } })
      return
    }
    try {
      const source = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败'))
        reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
        reader.readAsDataURL(file)
      })
      await tavern.saveCharacter({
        ...card,
        portraitSlots: card.portraitSlots.map((slot) => slot.id === slotId ? { ...slot, source } : slot),
        updatedAt: Date.now(),
      })
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'success', title: '立绘已保存', message: `${card.name}的当前好感区间立绘已写入角色卡。` } })
    } catch {
      dispatch({ type: 'ADD_TOAST', toast: { tone: 'danger', title: '立绘保存失败', message: '图片读取或本机存储失败，请重试。' } })
    }
  }

  return (
    <section className={`world-stage location-stage panel-frame ${sceneClass[state.location]} ${customBackground ? 'has-custom-background' : ''}`} aria-labelledby="stage-title">
      <div className="location-scene" style={{ backgroundImage: `url(${locationBackground})` }} aria-hidden="true" />
      <div className="location-shade" aria-hidden="true" />
      <header className="stage-titlebar"><div><p className="eyebrow">{location.name} · {location.hours}</p><h1 id="stage-title">{location.subtitle}</h1></div><span className="weather-pill">{location.hours === '全天' ? '随时开放' : `开放 ${location.hours}`}</span></header>
      <div className="location-story"><span>{location.name}</span><p>{location.description}</p>{feature && <button id={`location-feature-${state.location}`} className="primary-button" type="button" onClick={() => dispatch({ type: 'OPEN_MODAL', modal: feature.modal, npcId: featureNpcId })}>{feature.label}</button>}</div>
      <div className={`npc-stage-list count-${presentNpcs.length}`} aria-label="当前地点人物">
        {presentNpcs.map((npc) => {
          const relationship = state.relationships[npc.id]
          const card = tavern.characters.find((candidate) => candidate.npcId === npc.id)
          const slot = (card ? resolvePortraitSlot(card.portraitSlots, relationship.affinity) : undefined)
            ?? { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '' }
          return <NpcPortrait key={npc.id} npc={npc} relationship={relationship} source={slot.source} minAffinity={slot.minAffinity} maxAffinity={slot.maxAffinity} onUpload={(file) => void upload(npc.id, slot.id, file)} onOpen={() => dispatch({ type: 'OPEN_MODAL', modal: 'npc', npcId: npc.id })} />
        })}
        {!presentNpcs.length && <div className="empty-location-state"><strong>此刻无人停留</strong><p>村民会依照每日行程与节日安排在不同地点活动。</p></div>}
      </div>
      {state.activeModal === 'npc' && selectedNpc && <NpcPanel npcId={selectedNpc.id} />}
      {state.activeModal === 'dialogue' && selectedNpc && (
        <DialogueErrorBoundary
          key={`${selectedNpc.id}-${dialogueRecoveryKey}`}
          npcName={selectedNpc.name}
          onClose={() => dispatch({ type: 'CLOSE_MODAL' })}
          onReset={() => resetNpcDialogue(selectedNpc.id)}
        >
          <DialogueView npc={selectedNpc} />
        </DialogueErrorBoundary>
      )}
    </section>
  )
}
