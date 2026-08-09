import { useMemo, useState } from 'react'
import { crops, itemDisplayNames, npcs, shopItems } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getFestivalOffers } from '../../game/calendar'
import { SpecialShopPanel } from './SpecialShopPanel'

const locationCategories = {
  'general-store': ['seed', 'material', 'gift'],
  smithy: ['material', 'tool'],
  'witch-home': ['potion', 'gift'],
  'fisher-home': ['bait', 'tool'],
  hospital: ['potion'],
  'monster-market': ['material', 'gift'],
} as const

export function TradeModal() {
  const { state, dispatch } = useGame()
  const [mode, setMode] = useState<'buy' | 'sell'>('buy')
  const [selectedId, setSelectedId] = useState(shopItems[0].id)
  const [quantity, setQuantity] = useState(1)
  const seller = npcs.find((npc) => npc.id === state.selectedNpcId)
  const allowed = locationCategories[state.location as keyof typeof locationCategories] ?? ['seed', 'material', 'gift']
  const festivalOfferIds = new Set<string>(getFestivalOffers(state.day, state.location).map((offer) => offer.itemId))
  const buyItems = shopItems.filter((item) => (
    item.festivalId
      ? festivalOfferIds.has(item.id)
      : (allowed as readonly string[]).includes(item.category)
  ))
  const sellItems = useMemo(() => Object.entries(state.inventory).filter(([, amount]) => amount > 0).map(([id, amount]) => {
    const item = shopItems.find((entry) => entry.id === id)
    const crop = crops.find((entry) => entry.id === id)
    return { id, name: item?.name ?? crop?.name ?? itemDisplayNames[id] ?? '未鉴定物品', price: item?.sellPrice ?? crop?.sellPrice ?? 20, amount }
  }), [state.inventory])
  const selectedBuy = buyItems.find((item) => item.id === selectedId) ?? buyItems[0]
  const selectedSell = sellItems.find((item) => item.id === selectedId) ?? sellItems[0]
  const unitPrice = mode === 'buy' ? selectedBuy?.price ?? 0 : selectedSell?.price ?? 0
  const total = unitPrice * quantity
  const protectedItem = mode === 'sell' && state.quests.some((quest) => quest.status === 'active' && quest.requiredItemId === selectedSell?.id)

  const switchMode = (next: 'buy' | 'sell') => {
    setMode(next)
    setQuantity(1)
    setSelectedId(next === 'buy' ? buyItems[0]?.id ?? '' : sellItems[0]?.id ?? '')
  }

  const confirm = () => {
    const itemId = mode === 'buy' ? selectedBuy?.id : selectedSell?.id
    if (!itemId) return
    dispatch(mode === 'buy' ? { type: 'BUY_ITEM', itemId, quantity, total } : { type: 'SELL_ITEM', itemId, quantity, total })
  }

  const list = mode === 'buy' ? buyItems.map((item) => ({ id: item.id, name: item.name, price: item.price, amount: state.inventory[item.id] ?? 0, detail: item.festivalId ? `节日限定 · 今日会场闭市前供应 · ${item.season}季作物` : item.category === 'seed' ? `${item.season}季 · ${item.growthDays}日成熟` : item.description })) : sellItems.map((item) => ({ ...item, detail: `当前持有 ${item.amount}` }))

  return <div className="trade-modal-content">
    <div className="modal-summary"><div><span>柜台</span><strong>{seller?.name ?? '自助柜台'}</strong></div><div><span>余额</span><strong>{state.money.toLocaleString('zh-CN')} 金币</strong></div></div>
    <SpecialShopPanel />
    <div className="tab-bar" role="tablist" aria-label="交易方式"><button id="trade-tab-buy" role="tab" aria-selected={mode === 'buy'} onClick={() => switchMode('buy')}>购买</button><button id="trade-tab-sell" role="tab" aria-selected={mode === 'sell'} onClick={() => switchMode('sell')}>出售</button></div>
    <div className="trade-layout">
      <div className="trade-list">{list.map((item) => <button id={`trade-item-${mode}-${item.id}`} key={item.id} className={selectedId === item.id ? 'is-selected' : ''} type="button" onClick={() => { setSelectedId(item.id); setQuantity(1) }}><span><strong>{item.name}</strong><small>{item.detail}</small></span><em>{item.price} 金币</em></button>)}</div>
      <aside className="trade-receipt"><span>数量</span><div className="quantity-stepper"><button id="trade-quantity-decrease" type="button" aria-label="减少交易数量" onClick={() => setQuantity((current) => Math.max(1, current - 1))}>−</button><strong>{quantity}</strong><button id="trade-quantity-increase" type="button" aria-label="增加交易数量" onClick={() => setQuantity((current) => Math.min(mode === 'sell' ? selectedSell?.amount ?? 1 : 99, current + 1))}>＋</button></div><dl><div><dt>单价</dt><dd>{unitPrice}</dd></div><div><dt>合计</dt><dd>{total} 金币</dd></div><div><dt>交易后余额</dt><dd>{mode === 'buy' ? state.money - total : state.money + total}</dd></div></dl>{protectedItem && <p className="inline-warning">这是进行中委托的任务物品，暂不可出售。</p>}<button id="trade-confirm" className="primary-button" type="button" disabled={!unitPrice || protectedItem || (mode === 'buy' ? total > state.money : quantity > (selectedSell?.amount ?? 0))} onClick={confirm}>{mode === 'buy' ? '确认购买' : '确认出售'}</button></aside>
    </div>
  </div>
}
