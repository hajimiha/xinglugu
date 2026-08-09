import { useEffect, useState } from 'react'
import { spells } from '../../game/data'
import { useGame } from '../../game/GameContext'
import type { ElementType } from '../../game/types'

const names: Record<ElementType, string> = { metal: '金', wood: '木', water: '水', fire: '火', earth: '土' }

export function BattleModal() {
  const { state, dispatch } = useGame()
  const [spellMenu, setSpellMenu] = useState(false)
  const battle = state.battle
  useEffect(() => {
    if (battle?.ended !== 'defeat') return
    const timer = setTimeout(() => dispatch({ type: 'PLAYER_DEFEATED' }), 900)
    return () => clearTimeout(timer)
  }, [battle?.ended, dispatch])
  if (!battle) return <div className="inline-warning">尚未遭遇魔物，请先从矿洞层级界面进入战斗。</div>
  const known = spells.filter((spell) => state.knownSpells.includes(spell.id))
  const dragonVictory = battle.ended === 'victory' && battle.floor === 20 && battle.enemyName === '龙娘'
  return <div className="battle-content"><div className="battle-arena"><section className="combatant player-combatant"><span>农场主 · 你</span><div className="combat-silhouette player" aria-hidden="true"><i /></div><strong>生命 {state.stats.health} / {state.stats.maxHealth}</strong><div className="combat-bar health"><i style={{ width: `${state.stats.health / state.stats.maxHealth * 100}%` }} /></div><small>魔力 {state.stats.mana} / {state.stats.maxMana}</small><div className="combat-bar mana"><i style={{ width: `${state.stats.mana / state.stats.maxMana * 100}%` }} /></div></section><div className="battle-versus"><span>TURN</span><strong>{battle.turn}</strong><small>第 {battle.floor} 层</small></div><section className="combatant enemy-combatant"><span>{names[battle.enemyElement]}属性魔物</span><div className="combat-silhouette enemy" aria-hidden="true"><i /></div><strong>{battle.enemyName}</strong><div className="combat-bar health"><i style={{ width: `${battle.enemyHealth / battle.enemyMaxHealth * 100}%` }} /></div><small>生命 {battle.enemyHealth} / {battle.enemyMaxHealth}</small></section></div><div className="battle-console"><div className="battle-log" aria-live="polite">{battle.log.slice(-5).map((entry, index) => <p key={`${battle.turn}-${index}`}>{entry}</p>)}</div>{battle.ended === 'victory' ? <div className="battle-result"><strong>{dragonVictory ? '龙巢试炼完成' : '战斗胜利'}</strong><span>{dragonVictory ? state.ranch.dragonStatus === 'resident' ? '龙娘已经入住牧场，并会提高深层钻石矿收益。' : '龙娘已答应在牧场建成后入住。' : `获得 ${14 + battle.floor} 点战斗经验。`}</span><button id="battle-return-mine" className="primary-button" type="button" onClick={() => dispatch({ type: 'OPEN_MODAL', modal: 'mine' })}>返回矿洞层级</button></div> : battle.ended === 'defeat' ? <div className="battle-result is-defeat"><strong>意识正在远去</strong><span>你将在翌日 06:30 于农场苏醒。</span></div> : <><div className="battle-actions"><button id="battle-physical" type="button" onClick={() => dispatch({ type: 'BATTLE_ACTION', action: 'physical' })}><strong>物理攻击</strong><small>预计 {state.stats.attack} 伤害</small></button><button id="battle-spell-menu" type="button" onClick={() => setSpellMenu((current) => !current)}><strong>五行法术</strong><small>选择克制属性</small></button><button id="battle-item" type="button" onClick={() => dispatch({ type: 'BATTLE_ACTION', action: 'item' })}><strong>战斗道具</strong><small>恢复剂 {state.inventory['energy-tonic'] ?? 0}</small></button><button id="battle-defend" type="button" onClick={() => dispatch({ type: 'BATTLE_ACTION', action: 'defend' })}><strong>防御</strong><small>本回合减伤</small></button><button id="battle-flee" type="button" onClick={() => dispatch({ type: 'BATTLE_ACTION', action: 'flee' })}><strong>安全撤离</strong><small>回到本层入口</small></button></div>{spellMenu && <div className="battle-spell-list">{known.map((spell) => <button id={`battle-cast-${spell.id}`} key={spell.id} type="button" disabled={state.stats.mana < spell.manaCost} onClick={() => { dispatch({ type: 'BATTLE_ACTION', action: 'spell', spellId: spell.id }); setSpellMenu(false) }}><span>{names[spell.element]}</span><strong>{spell.name}</strong><small>{spell.manaCost} 魔力 · 威力 {spell.power}</small></button>)}</div>}</>}</div></div>
}
