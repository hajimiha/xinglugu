import { MINE_MAX_FLOOR, getMineYield } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getEnergyCost } from '../../game/rules'

export function MineModal() {
  const { state, dispatch } = useGame()
  const floor = state.mine.currentFloor
  const dragonFloor = floor === MINE_MAX_FLOOR
  const safe = floor % 5 === 0 && !dragonFloor
  const cost = getEnergyCost(1, state.rules.energyCostMode)
  const mineYield = getMineYield(floor, state.tools.pickaxe, state.rules.dropMultiplier, state.ranch.dragonStatus === 'resident')
  const yieldText = `铜 ${mineYield['copper-ore']} · 铁 ${mineYield['iron-ore']} · 石头 ${mineYield.stone}${floor >= 10 ? ` · 钻石 ${mineYield['diamond-ore']}` : ''}`

  return <div className="mine-content">
    <div className="mine-status"><div><span>当前：第 {floor} 层</span><strong>{dragonFloor ? '深层龙巢' : safe ? '安全电梯层' : '回声矿道'}</strong><p>{dragonFloor ? '龙娘守在最深晶脉前。可以挑战她，也可以用大量金币展示农场的实力。' : safe ? '本层没有魔物，可以挖矿、搭乘电梯或返回地面。' : '前方探测到魔物，矿脉分布在更深的阴影中。'}</p></div><dl><div><dt>最高抵达</dt><dd>{state.mine.highestFloor} 层</dd></div><div><dt>镐等级</dt><dd>等级 {state.tools.pickaxe}</dd></div><div><dt>本层预估</dt><dd>{yieldText}</dd></div></dl></div>
    <div className="mine-layout"><section className="mine-elevator"><span>升降梯控制台</span><h3>已记录层级</h3>{[5, 10, 15].map((target) => { const unlocked = state.mine.unlockedElevators.includes(target); return <button id={`mine-elevator-${target}`} key={target} type="button" aria-label={unlocked ? `搭乘电梯前往第${target}层` : `第${target}层电梯尚未解锁`} disabled={!unlocked || state.energy < cost} onClick={() => dispatch({ type: 'ENTER_MINE_FLOOR', floor: target })}><span>第 {target} 层</span><small>{unlocked ? `安全层 · ${cost} 精力` : '尚未抵达'}</small></button>})}<button id="mine-return-surface" className="secondary-button" type="button" onClick={() => dispatch({ type: 'CLOSE_MODAL' })}>返回矿洞入口</button></section>
      <section className={`mine-actions ${dragonFloor ? 'is-dragon-lair' : ''}`}><div className="mine-crystal-scene" aria-hidden="true"><i /><i /><i /><i /></div><div><button id="mine-extract-ore" className="primary-button" type="button" aria-label={`开采本层矿脉 · ${cost} 精力`} disabled={state.energy < cost} onClick={() => dispatch({ type: 'MINE_ORE', floor })}>开采本层矿脉 · {cost} 精力</button>{!safe && <button id="mine-start-battle" className="secondary-button" type="button" aria-label={dragonFloor ? '迎战龙娘' : '迎战本层魔物'} onClick={() => dispatch({ type: 'START_BATTLE', floor })}>{dragonFloor ? '迎战龙娘' : '迎战本层魔物'}</button>}{dragonFloor && state.ranch.dragonStatus === 'wild' && <button id="mine-invite-dragon-coins" className="secondary-button" type="button" aria-label="支付20000金币吸引龙娘" disabled={state.money < 20000} onClick={() => dispatch({ type: 'INVITE_DRAGON', method: 'coins' })}>20,000 金币邀请龙娘</button>}{floor < MINE_MAX_FLOOR && <button id="mine-descend" className="secondary-button" type="button" aria-label={`前往第 ${floor + 1} 层`} disabled={state.energy < cost || floor > state.mine.highestFloor} onClick={() => dispatch({ type: 'ENTER_MINE_FLOOR', floor: floor + 1 })}>前往第 {floor + 1} 层 · {cost} 精力</button>}</div></section>
    </div>
  </div>
}
