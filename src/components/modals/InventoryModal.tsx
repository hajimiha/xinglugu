import { useState } from 'react'
import { crops, itemDisplayNames, shopItems } from '../../game/data'
import { useGame } from '../../game/GameContext'
import type { SkillId } from '../../game/types'
import { WORLD_NAME } from '../../branding'

const skillBenefits: Record<SkillId, string> = {
  fishing: '鱼获售价与稀有鱼出现率提高',
  farming: '作物售价与单次收获数量提高',
  mining: '矿石售价与深层稀有度提高',
  combat: '提升最大生命、物理攻击与生存力',
  magic: '提升最大魔力与五行法术伤害',
}

export function InventoryModal() {
  const { state } = useGame()
  const [tab, setTab] = useState<'items' | 'skills' | 'quests'>('items')
  const [filter, setFilter] = useState<'all' | 'crop' | 'material'>('all')
  const inventory = Object.entries(state.inventory).filter(([, amount]) => amount > 0).map(([id, amount]) => {
    const item = shopItems.find((entry) => entry.id === id)
    const crop = crops.find((entry) => entry.id === id)
    return { id, name: item?.name ?? crop?.name ?? itemDisplayNames[id] ?? '未鉴定物品', amount, category: crop ? 'crop' : item?.category ?? 'material', description: item?.description ?? crop?.description ?? `在${WORLD_NAME}获得的特殊物品。`, protected: state.quests.some((quest) => quest.status === 'active' && quest.requiredItemId === id) }
  })
  return <div className="inventory-content"><div className="tab-bar" role="tablist" aria-label="背包页面"><button id="inventory-tab-items" role="tab" aria-selected={tab === 'items'} onClick={() => setTab('items')}>物品</button><button id="inventory-tab-skills" role="tab" aria-selected={tab === 'skills'} onClick={() => setTab('skills')}>技能收益</button><button id="inventory-tab-quests" role="tab" aria-selected={tab === 'quests'} onClick={() => setTab('quests')}>任务状态</button></div>{tab === 'items' && <><div className="inventory-filters"><button id="inventory-filter-all" onClick={() => setFilter('all')}>全部</button><button id="inventory-filter-crop" onClick={() => setFilter('crop')}>作物</button><button id="inventory-filter-material" onClick={() => setFilter('material')}>材料与道具</button></div><div className="inventory-grid">{inventory.filter((item) => filter === 'all' || (filter === 'crop' ? item.category === 'crop' : item.category !== 'crop')).map((item) => <article key={item.id}><span className="item-glyph" aria-hidden="true"><i /></span><div><strong>{item.name}</strong><p>{item.description}</p>{item.protected && <small>任务保护中 · 暂不可出售</small>}</div><em>× {item.amount}</em></article>)}</div></>}{tab === 'skills' && <div className="skill-benefit-list">{Object.entries(state.skills).map(([id, skill]) => <article key={id}><strong>{({ fishing: '钓鱼', farming: '农耕', mining: '挖矿', combat: '战斗', magic: '魔法' } as Record<string, string>)[id]} 等级 {skill.level}</strong><p>{skillBenefits[id as SkillId]}</p><span><i style={{ width: `${skill.experience / skill.nextLevel * 100}%` }} /></span><small>{skill.experience} / {skill.nextLevel}</small></article>)}</div>}{tab === 'quests' && <div className="inventory-quest-tabs">{(['active', 'available', 'completed'] as const).map((status) => <section key={status}><h3>{status === 'active' ? '进行中' : status === 'available' ? '可接取' : '已完成'}</h3>{state.quests.filter((quest) => quest.status === status).map((quest) => <article key={quest.id}><strong>{quest.title}</strong><small>{quest.rewardMoney} 金币</small></article>)}</section>)}</div>}</div>
}
