import { useState } from 'react'
import { FISH_CATALOG } from '../../game/data'
import type { FishId } from '../../game/economy'
import { useGame } from '../../game/GameContext'
import { getEnergyCost, scaleReward } from '../../game/rules'

const waters: Array<{ id: 'bay' | 'river' | 'pier'; name: string; fishIds: FishId[] }> = [
  { id: 'bay', name: '薄雾海湾', fishIds: ['silver-carp', 'tide-bass'] },
  { id: 'river', name: '林间河道', fishIds: ['moon-tail', 'moss-trout'] },
  { id: 'pier', name: '旧木码头', fishIds: ['silver-carp', 'mist-catfish'] },
]

const sizeNames = { small: '小型', medium: '中型', large: '大型' } as const

export function FishingModal() {
  const { state, dispatch } = useGame()
  const [water, setWater] = useState<(typeof waters)[number]['id']>('bay')
  const selectedWater = waters.find((item) => item.id === water)!
  const result = state.fishing.lastCatch
  const resultFish = result ? FISH_CATALOG[result as FishId] : undefined
  const cost = getEnergyCost(1, state.rules.energyCostMode)
  const fishList = selectedWater.fishIds.map((id) => `${FISH_CATALOG[id].name}（${sizeNames[FISH_CATALOG[id].size]}）`).join(' · ')
  const catchAmount = scaleReward(Math.max(1, state.tools.rod), state.rules.dropMultiplier)
  const resultExperience = resultFish
    ? scaleReward((resultFish.size === 'large' ? 30 : resultFish.size === 'medium' ? 22 : 16) + (state.tools.rod - 1) * 4, state.rules.experienceMultiplier)
    : scaleReward(4, state.rules.experienceMultiplier)
  const chooseCatch = (): FishId => {
    const waterIndex = waters.findIndex((item) => item.id === water)
    const fishingProgress = Math.floor(state.skills.fishing.experience / 16)
    return selectedWater.fishIds[(state.day + state.minutes + state.tools.rod + waterIndex + fishingProgress) % selectedWater.fishIds.length]
  }

  return <div className="fishing-content">
    <section className="fishing-scene"><div className="water-pixels" aria-hidden="true"><i /><i /><i /><i /><span /></div><div className="fishing-scene-label"><span>{selectedWater.name}</span><strong>潮位缓慢上升</strong><small>可遇见：{fishList}</small></div></section>
    <aside className="fishing-controls">
      <span>第一步 · 选择水域</span>
      <div className="water-choice">{waters.map((item) => <button id={`fishing-water-${item.id}`} key={item.id} className={water === item.id ? 'is-selected' : ''} type="button" onClick={() => setWater(item.id)}><strong>{item.name}</strong><small>{item.fishIds.map((id) => FISH_CATALOG[id].name).join(' · ')}</small></button>)}</div>
      <div className="fishing-loadout"><div><span>钓竿</span><strong>{state.tools.rod >= 2 ? '潮汐钓竿' : '河湾旧竿'} · 等级 {state.tools.rod}</strong></div><div><span>鱼饵</span><strong>苇心鱼饵 × {state.inventory['reed-bait'] ?? 0}</strong></div></div>
      {!state.fishing.active && <button id="fishing-start" className="primary-button" type="button" aria-label={`开始钓鱼，消耗${cost}精力`} disabled={state.energy < cost || (state.inventory['reed-bait'] ?? 0) < 1} onClick={() => dispatch({ type: 'START_FISHING' })}>开始钓鱼 · {cost} 精力</button>}
      {state.fishing.active && <div className="timing-challenge"><span>鱼影靠近，选择收竿时机</span><div className="timing-bar" aria-hidden="true"><i className="zone-early" /><i className="zone-perfect" /><i className="zone-late" /><b /></div><div><button id="fishing-catch-early" type="button" aria-label="在黄色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: 'water-grass' })}>过早 · 水草</button><button id="fishing-catch-perfect" type="button" aria-label="在绿色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: chooseCatch() })}>准确 · 收竿</button><button id="fishing-catch-late" type="button" aria-label="在灰色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: 'empty' })}>过晚 · 空钩</button></div></div>}
      {result && !state.fishing.active && <div className={`catch-result result-${result}`}><strong>{resultFish ? `钓到${resultFish.name}` : result === 'water-grass' ? '捞起一束水草' : '鱼影脱钩了'}</strong><span>{resultFish ? `${sizeNames[resultFish.size]}鱼 · 钓鱼经验 +${resultExperience} · 鱼获 ${catchAmount} 份已收入背包` : result === 'water-grass' ? `钓鱼经验 +${resultExperience}` : '本次没有收获'}</span></div>}
    </aside>
  </div>
}
