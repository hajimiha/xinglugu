import { crops, itemDisplayNames, npcs, shopItems } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getAbsoluteGameDay } from '../../game/quest-engine'

export function QuestModal({ journal = false }: { journal?: boolean }) {
  const { state, dispatch } = useGame()
  const currentDay = getAbsoluteGameDay(state.year, state.day)

  return <div className="quest-modal-content">
    <div className="quest-board-intro">
      <span>{journal ? '个人任务手册' : '壁炉旁的黄铜委托板'}</span>
      <p>委托板每天有概率出现一项新委托。接取后必须在截止日内交付，逾期委托会自动消失。</p>
    </div>
    <div className="quest-card-list">
      {state.quests.length === 0 && <div className="inline-warning">今天的委托板仍是空的，明天可以再来看看。</div>}
      {state.quests.map((quest) => {
        const issuer = npcs.find((npc) => npc.id === quest.issuerId)!
        const itemName = shopItems.find((item) => item.id === quest.requiredItemId)?.name
          ?? crops.find((crop) => crop.id === quest.requiredItemId)?.name
          ?? itemDisplayNames[quest.requiredItemId]
          ?? '未鉴定物品'
        const held = state.inventory[quest.requiredItemId] ?? 0
        const remaining = quest.deadlineDay === undefined ? undefined : Math.max(0, quest.deadlineDay - currentDay + 1)
        return <article id={`quest-card-${quest.id}`} key={quest.id} className={`quest-card status-${quest.status}`}>
          <header><div><span>{issuer.role} · {issuer.name}</span><h3>{quest.title}</h3></div><em>{remaining === undefined ? `接取后 ${quest.expiresInDays} 日` : `剩余 ${remaining} 日`}</em></header>
          <p>{quest.description}</p>
          <div className="quest-progress"><span style={{ width: `${Math.min(100, held / quest.requiredAmount * 100)}%` }} /><small>{itemName} {held} / {quest.requiredAmount}</small></div>
          <footer>
            <span>{quest.rewardMoney} 金币 · 发布者 +{quest.rewardAffinity} · 村长 +{quest.mayorAffinity}</span>
            {quest.status === 'available'
              ? <button id={`quest-accept-${quest.id}`} type="button" onClick={() => dispatch({ type: 'ACCEPT_QUEST', questId: quest.id })}>接受委托</button>
              : <strong>{quest.status === 'completed' ? '已经完成' : held >= quest.requiredAmount ? '可向发布者交付' : '进行中'}</strong>}
          </footer>
        </article>
      })}
    </div>
  </div>
}
