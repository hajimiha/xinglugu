import { useState } from 'react'
import { useGame } from '../../game/GameContext'
import { getEnergyCost, scaleReward } from '../../game/rules'

const waters = [{ id: 'bay', name: '薄雾海湾', fish: '银鳞鲫 · 潮纹鲈' }, { id: 'river', name: '林间河道', fish: '青苔鳟 · 月尾鱼' }, { id: 'pier', name: '旧木码头', fish: '银鳞鲫 · 漂流匣' }]

export function FishingModal() {
  const { state, dispatch } = useGame()
  const [water, setWater] = useState('bay')
  const result = state.fishing.lastCatch
  const cost = getEnergyCost(1, state.rules.energyCostMode)
  const fishExperience = scaleReward(16 + (state.tools.rod - 1) * 4, state.rules.experienceMultiplier)
  const grassExperience = scaleReward(4, state.rules.experienceMultiplier)
  const catchAmount = scaleReward(state.tools.rod, state.rules.dropMultiplier)
  return <div className="fishing-content"><section className="fishing-scene"><div className="water-pixels" aria-hidden="true"><i /><i /><i /><i /><span /></div><div className="fishing-scene-label"><span>{waters.find((item) => item.id === water)?.name}</span><strong>潮位缓慢上升</strong><small>可遇见：{waters.find((item) => item.id === water)?.fish}</small></div></section><aside className="fishing-controls"><span>第一步 · 选择水域</span><div className="water-choice">{waters.map((item) => <button id={`fishing-water-${item.id}`} key={item.id} className={water === item.id ? 'is-selected' : ''} type="button" onClick={() => setWater(item.id)}><strong>{item.name}</strong><small>{item.fish}</small></button>)}</div><div className="fishing-loadout"><div><span>钓竿</span><strong>{state.tools.rod >= 2 ? '潮汐钓竿' : '河湾旧竿'} · 等级 {state.tools.rod}</strong></div><div><span>鱼饵</span><strong>苇心鱼饵 × {state.inventory['reed-bait'] ?? 0}</strong></div></div>{!state.fishing.active && <button id="fishing-start" className="primary-button" type="button" aria-label={`开始钓鱼，消耗${cost}精力`} disabled={state.energy < cost || (state.inventory['reed-bait'] ?? 0) < 1} onClick={() => dispatch({ type: 'START_FISHING' })}>开始钓鱼 · {cost} 精力</button>}{state.fishing.active && <div className="timing-challenge"><span>鱼影靠近，选择收竿时机</span><div className="timing-bar" aria-hidden="true"><i className="zone-early" /><i className="zone-perfect" /><i className="zone-late" /><b /></div><div><button id="fishing-catch-early" type="button" aria-label="在黄色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: 'water-grass' })}>过早 · 水草</button><button id="fishing-catch-perfect" type="button" aria-label="在绿色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: 'silver-carp' })}>准确 · 银鳞</button><button id="fishing-catch-late" type="button" aria-label="在灰色时机收竿" onClick={() => dispatch({ type: 'CATCH_FISH', result: 'empty' })}>过晚 · 空钩</button></div></div>}{result && !state.fishing.active && <div className={`catch-result result-${result}`}><strong>{result === 'silver-carp' ? '钓到银鳞鲫' : result === 'water-grass' ? '捞起一束水草' : '鱼影脱钩了'}</strong><span>{result === 'silver-carp' ? `钓鱼经验 +${fishExperience} · 鱼获 ${catchAmount} 份已收入背包` : result === 'water-grass' ? `钓鱼经验 +${grassExperience}` : '本次没有收获'}</span></div>}</aside></div>
}
