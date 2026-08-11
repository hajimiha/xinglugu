import { useEffect, useRef, type ReactNode } from 'react'
import { useGame } from '../../game/GameContext'
import type { ModalType } from '../../game/types'
import { GameIcon } from '../icons/GameIcon'
import { HospitalModal } from './HospitalModal'
import { HunterModal } from './HunterModal'
import { InventoryModal } from './InventoryModal'
import { QuestModal } from './QuestModal'
import { RanchModal } from './RanchModal'
import { TradeModal } from './TradeModal'
import { LibraryModal } from './LibraryModal'
import { MineModal } from './MineModal'
import { BattleModal } from './BattleModal'
import { FishingModal } from './FishingModal'
import { TavernHubModal } from '../SillyTavern/TavernHubModal'
import { SettingsModal } from './SettingsModal'
import { CalendarModal } from './CalendarModal'

const unmanaged = new Set<ModalType>([null, 'plot', 'npc', 'dialogue'])
const titles: Partial<Record<Exclude<ModalType, null>, string>> = {
  inventory: '行囊与成长档案', character: '角色属性', journal: '任务手册', settings: '游戏设置', tavern: '雾灯酒馆中枢', calendar: '岁时手册', trade: '经营交易柜台', 'quest-board': '村民委托板', ranch: '魔物娘共生牧场', hunter: '猎人训练', hospital: '白槿诊所', library: '五行法术书塔', mine: '回声矿洞', battle: '回合制战斗', fishing: '潮汐钓场',
}

function FutureFeature({ type }: { type: Exclude<ModalType, null> }) {
  const copy: Partial<Record<Exclude<ModalType, null>, { title: string; text: string }>> = {
    character: { title: '五维成长总览', text: '生命、物理攻击、魔力与魔法伤害将分别随战斗和魔法等级成长。' },
    library: { title: '五行术式书架', text: '金、木、水、火、土术式已按魔法等级编目，可学习的法术会显示精力代价。' },
    mine: { title: '层级与电梯记录', text: '普通层存在怪物与矿脉，每逢五层为安全电梯层。' },
    battle: { title: '战斗准备', text: '物理攻击、五行法术、道具、防御与逃跑构成完整行动序列。' },
    fishing: { title: '潮汐节奏准备', text: '选择水域、钓竿与鱼饵后进入三段时机判定。' },
  }
  const content = copy[type] ?? { title: '功能档案', text: '此页面已纳入统一交互结构。' }
  return <div className="future-feature"><span className="feature-orbit" aria-hidden="true"><i /><i /><i /></span><h3>{content.title}</h3><p>{content.text}</p><div className="feature-detail-grid"><div><span>界面状态</span><strong>已设计</strong></div><div><span>数据来源</span><strong>本地模拟</strong></div><div><span>服务端</span><strong>未连接</strong></div></div></div>
}

function contentFor(type: Exclude<ModalType, null>, close: () => void, onReturnToTitle?: () => void): ReactNode {
  if (type === 'tavern') return <TavernHubModal onClose={close} />
  if (type === 'inventory') return <InventoryModal />
  if (type === 'settings') return <SettingsModal onReturnToTitle={onReturnToTitle ? () => { close(); onReturnToTitle() } : undefined} />
  if (type === 'calendar') return <CalendarModal />
  if (type === 'journal') return <QuestModal journal />
  if (type === 'quest-board') return <QuestModal />
  if (type === 'trade') return <TradeModal />
  if (type === 'ranch') return <RanchModal />
  if (type === 'hunter') return <HunterModal />
  if (type === 'hospital') return <HospitalModal />
  if (type === 'library') return <LibraryModal />
  if (type === 'mine') return <MineModal />
  if (type === 'battle') return <BattleModal />
  if (type === 'fishing') return <FishingModal />
  return <FutureFeature type={type} />
}

export function ModalHost({ onReturnToTitle }: { onReturnToTitle?: () => void }) {
  const { state, dispatch } = useGame()
  const panelRef = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const previousType = useRef<ModalType>(null)
  const type = state.activeModal
  const managed = type && !unmanaged.has(type) ? type : null

  useEffect(() => {
    if (managed && !previousType.current) {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      requestAnimationFrame(() => panelRef.current?.focus())
    }
    if (!managed && previousType.current && previousFocus.current) {
      const target = previousFocus.current
      target.focus()
      previousFocus.current = null
    }
    previousType.current = managed
  }, [managed])

  useEffect(() => {
    if (!managed) return
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dispatch({ type: 'CLOSE_MODAL' })
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [managed, dispatch])

  if (!managed) return null
  const title = titles[managed] ?? '游戏界面'
  const close = () => dispatch({ type: 'CLOSE_MODAL' })
  return <div id={`modal-${managed}-overlay`} className={`modal-overlay ${managed === 'tavern' ? 'is-tavern' : ''}`} onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}><section id={`modal-${managed}`} ref={panelRef} className={`modal-panel modal-${managed}`} role="dialog" aria-modal="true" aria-labelledby={managed === 'tavern' ? 'tavern-hub-title' : `modal-title-${managed}`} tabIndex={-1}>{managed !== 'tavern' && <header className="modal-header"><div><p className="eyebrow">MISTVALE INTERFACE</p><h2 id={`modal-title-${managed}`}>{title}</h2></div><button id={`modal-close-${managed}`} className="icon-button" type="button" aria-label={`关闭${title}`} onClick={close}><GameIcon name="close" size={18} /></button></header>}<div className="modal-body">{contentFor(managed, close, onReturnToTitle)}</div></section></div>
}
