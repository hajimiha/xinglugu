import { useGame } from '../../game/GameContext'
import { FORGE_RECIPES, ITEM_CATALOG } from '../../game/data'

const forgeKinds = [
  { id: 'hoe' as const, name: '锄头', benefit: '提高每次开拓格数和月铃花发现概率' },
  { id: 'pickaxe' as const, name: '镐', benefit: '提高矿洞全部矿物的单次产量' },
  { id: 'sword' as const, name: '长剑', benefit: '永久提高物理攻击' },
  { id: 'armor' as const, name: '护甲', benefit: '永久提高生命值上限' },
]

export function SpecialShopPanel() {
  const { state, dispatch } = useGame()
  if (state.location === 'smithy') return <section className="special-shop forge-panel"><header><div><span>羽火锻造台</span><h3>金属锭工具与装备</h3></div><small>矿石需先在农场熔炉烧制成对应金属锭</small></header><div className="upgrade-tree">{forgeKinds.map((kind) => {
    const level = kind.id === 'hoe' || kind.id === 'pickaxe' ? state.tools[kind.id] : state.equipment[kind.id]
    const recipe = level < 4 ? FORGE_RECIPES[`${kind.id}-${level + 1}`] : undefined
    const held = recipe ? state.inventory[recipe.ingotId] ?? 0 : 0
    const canForge = Boolean(recipe && held >= recipe.ingotQuantity && state.money >= recipe.money)
    return <article key={kind.id}><span>等级 {level} / 4</span><strong>{kind.name}</strong><p>{kind.benefit}</p>{recipe ? <><small>{ITEM_CATALOG[recipe.ingotId].name} {held} / {recipe.ingotQuantity} · {recipe.money} 金币</small><button id={`forge-${recipe.id}`} type="button" aria-label={`打造${recipe.name}，消耗${recipe.ingotQuantity}个${ITEM_CATALOG[recipe.ingotId].name}和${recipe.money}金币`} disabled={!canForge} onClick={() => dispatch({ type: 'FORGE_EQUIPMENT', recipeId: recipe.id })}>打造 {recipe.name}</button></> : <button id={`forge-${kind.id}-complete`} type="button" disabled>已经满级</button>}</article>
  })}</div></section>
  if (state.location === 'witch-home') return <section className="special-shop witch-panel"><header><div><span>五曜药庐 · 永久药剂</span><h3>扩展身体与灵脉的容器</h3></div><small>永久药剂可以重复购买，价格保持不变</small></header><div className="permanent-potions"><article><span className="potion-bottle energy" aria-hidden="true"><i /></span><div><strong>金盏恒息药</strong><p>最大精力永久 +1，同时恢复 1 点精力。</p><small>当前上限 {state.maxEnergy}</small></div><button id="witch-buy-max-energy" type="button" aria-label="购买金盏恒息药，花费1200金币" disabled={state.money < 1200} onClick={() => dispatch({ type: 'BUY_PERMANENT_UPGRADE', upgrade: 'energy', price: 1200 })}>1,200 金币</button></article><article><span className="potion-bottle mana" aria-hidden="true"><i /></span><div><strong>蓝雾扩容药</strong><p>最大魔力永久 +3，同时恢复 3 点魔力。</p><small>当前上限 {state.stats.maxMana}</small></div><button id="witch-buy-max-mana" type="button" aria-label="购买蓝雾扩容药，花费1050金币" disabled={state.money < 1050} onClick={() => dispatch({ type: 'BUY_PERMANENT_UPGRADE', upgrade: 'mana', price: 1050 })}>1,050 金币</button></article></div></section>
  return null
}
