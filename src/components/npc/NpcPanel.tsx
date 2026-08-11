import { useState } from 'react'
import { formatClock, getNpcPresence, isNpcBirthday } from '../../game/calendar'
import { UNIVERSAL_GIFT_IDS, affinityStageNames, itemDisplayNames, locations, npcs, shopItems } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getEnergyCost, scaleReward } from '../../game/rules'
import type { NpcAction } from '../../game/types'
import { GameIcon, type GameIconName } from '../icons/GameIcon'

const actions: { id: NpcAction; label: string; icon: GameIconName }[] = [
  { id: 'chat', label: '交谈', icon: 'chat' },
  { id: 'gift', label: '赠礼', icon: 'gift' },
  { id: 'trade', label: '交易', icon: 'shop' },
  { id: 'quest', label: '提交任务', icon: 'quest' },
  { id: 'profile', label: '人物档案', icon: 'profile' },
]

export function NpcPanel({ npcId }: { npcId: string }) {
  const { state, dispatch } = useGame()
  const [subview, setSubview] = useState<'actions' | 'gift' | 'quest' | 'profile'>('actions')
  const npc = npcs.find((item) => item.id === npcId)!
  const relationship = state.relationships[npcId]
  const presence = getNpcPresence(npcId, state.year, state.day, state.minutes)
  const presenceLocation = locations.find((location) => location.id === presence.locationId)
  const birthdayToday = isNpcBirthday(npcId, state.day)
  const npcQuests = state.quests.filter((quest) => quest.issuerId === npcId && (quest.status === 'active' || quest.status === 'ready'))
  const giftItems = [...new Set([...npc.preferredGifts, ...UNIVERSAL_GIFT_IDS])].filter((itemId) => (state.inventory[itemId] ?? 0) > 0)
  const interactionCost = getEnergyCost(1, state.rules.energyCostMode)
  const preferredGiftAffinity = scaleReward(14 * (birthdayToday ? 2 : 1), state.rules.affinityMultiplier)
  const universalGiftAffinity = scaleReward(10 * (birthdayToday ? 2 : 1), state.rules.affinityMultiplier)

  const selectAction = (action: NpcAction) => {
    if (!npc.availableActions.includes(action)) return
    if (action === 'chat') {
      if (state.energy < interactionCost) {
        dispatch({ type: 'ADD_TOAST', toast: { tone: 'warning', title: '精力不足', message: `需要 ${interactionCost} 点精力才能与她深入交谈。` } })
        return
      }
      dispatch({ type: 'OPEN_DIALOGUE', npcId })
    } else if (action === 'trade') dispatch({ type: 'OPEN_MODAL', modal: 'trade', npcId })
    else setSubview(action)
  }

  return (
    <section className="npc-panel" role="dialog" aria-modal="false" aria-label={`${npc.name}互动面板`}>
      <header><div><span>{npc.role} · 好感 {relationship.affinity}{birthdayToday ? ' · 今日生日' : ''}</span><h2>{npc.name}</h2></div><button id={`npc-panel-close-${npc.id}`} className="icon-button" type="button" aria-label={`关闭${npc.name}互动面板`} onClick={() => dispatch({ type: 'CLOSE_MODAL' })}><GameIcon name="close" size={17} /></button></header>
      {subview === 'actions' && <>
        <p className="npc-panel-quote">{npc.description}</p>
        <div className="npc-action-grid">
          {actions.map((action) => {
            const available = npc.availableActions.includes(action.id)
            const aria = action.id === 'chat' ? `与${npc.name}交谈` : action.id === 'gift' ? `赠礼给${npc.name}` : action.id === 'trade' ? `与${npc.name}交易` : action.id === 'quest' ? `向${npc.name}提交任务` : `查看${npc.name}人物档案`
            return <button id={`npc-action-${action.id}-${npc.id}`} key={action.id} type="button" aria-label={aria} disabled={!available} onClick={() => selectAction(action.id)}><GameIcon name={action.icon} size={20} weight="duotone" /><span>{action.label}</span><small>{available ? (action.id === 'chat' || action.id === 'gift' ? `消耗 ${interactionCost} 精力` : '查看详情') : '该人物不提供'}</small></button>
          })}
        </div>
      </>}
      {subview === 'gift' && <div className="npc-subview"><button id={`npc-subview-back-gift-${npc.id}`} className="subview-back" type="button" onClick={() => setSubview('actions')}>返回互动</button><h3>挑选礼物</h3><p>个人偏爱获得 {preferredGiftAffinity} 点好感，莓果挞作为通用礼物获得 {universalGiftAffinity} 点{birthdayToday ? '，今日生日加成已生效' : ''}；赠礼消耗 {interactionCost} 点精力。</p>{giftItems.length ? giftItems.map((itemId) => { const isUniversal = UNIVERSAL_GIFT_IDS.includes(itemId as (typeof UNIVERSAL_GIFT_IDS)[number]); const affinity = isUniversal ? 10 : 14; const itemName = shopItems.find((item) => item.id === itemId)?.name ?? itemDisplayNames[itemId] ?? '未鉴定礼物'; const blocked = state.energy < interactionCost || relationship.giftedToday; return <button id={`npc-gift-${npc.id}-${itemId}`} key={itemId} type="button" disabled={blocked} onClick={() => { dispatch({ type: 'GIVE_GIFT', npcId, itemId, affinity }); dispatch({ type: 'OPEN_DIALOGUE', npcId, intent: { id: crypto.randomUUID(), kind: 'gift', playerText: `（${state.playerProfile.name}）赠礼${itemName}给${npc.name}` } }) }}><strong>{itemName}</strong><small>{relationship.giftedToday ? '今天已经赠送过礼物' : state.energy < interactionCost ? '精力不足' : `持有 ${state.inventory[itemId]} · 好感 +${isUniversal ? universalGiftAffinity : preferredGiftAffinity}`}</small></button> }) : <div className="inline-warning">背包中没有她偏爱或通用的礼物。</div>}</div>}
      {subview === 'quest' && <div className="npc-subview"><button id={`npc-subview-back-quest-${npc.id}`} className="subview-back" type="button" onClick={() => setSubview('actions')}>返回互动</button><h3>任务交付</h3>{npcQuests.length ? npcQuests.map((quest) => { const held = state.inventory[quest.requiredItemId] ?? 0; const itemName = itemDisplayNames[quest.requiredItemId] ?? '任务物品'; return <div className="npc-quest-row" key={quest.id}><strong>{quest.title}</strong><p>{quest.description}</p><small>进度 {held} / {quest.requiredAmount} · 报酬 {quest.rewardMoney} 金币</small><button id={`npc-submit-${quest.id}`} type="button" disabled={held < quest.requiredAmount || quest.status === 'completed'} onClick={() => { dispatch({ type: 'SUBMIT_QUEST', questId: quest.id }); dispatch({ type: 'OPEN_DIALOGUE', npcId, intent: { id: crypto.randomUUID(), kind: 'quest', playerText: `（${state.playerProfile.name}）向${npc.name}提交委托「${quest.title}」所需的 ${quest.requiredAmount} 份${itemName}` } }) }}>{quest.status === 'completed' ? '已经完成' : '提交物品'}</button></div> }) : <div className="inline-warning">她目前没有等待交付的委托。</div>}</div>}
      {subview === 'profile' && <div className="npc-subview profile-subview"><button id={`npc-subview-back-profile-${npc.id}`} className="subview-back" type="button" onClick={() => setSubview('actions')}>返回互动</button><h3>人物档案</h3><dl><div><dt>生日</dt><dd>{npc.birthday.month}月{npc.birthday.day}日</dd></div><div><dt>当前地点</dt><dd>{presenceLocation?.name ?? presence.locationId}</dd></div><div><dt>当前安排</dt><dd><small>{formatClock(presence.startMinute)}–{presence.endMinute === 1440 ? '24:00' : formatClock(presence.endMinute)}</small><span>{presence.activity}</span></dd></div><div><dt>关系阶段</dt><dd>{affinityStageNames[relationship.stage]}</dd></div><div><dt>今日交谈</dt><dd>{relationship.chattedToday ? '已完成' : '尚未'}</dd></div><div><dt>今日赠礼</dt><dd>{relationship.giftedToday ? '已完成' : '尚未'}</dd></div></dl><p className="npc-birthday-rule"><GameIcon name="birthday" size={16} weight="duotone" />生日当天赠送偏爱礼物，好感收益翻倍。</p><h4>她记得</h4><ul>{relationship.memoryTags.length ? relationship.memoryTags.map((tag) => <li key={tag}>{tag}</li>) : <li>尚未留下共同回忆</li>}</ul></div>}
    </section>
  )
}
