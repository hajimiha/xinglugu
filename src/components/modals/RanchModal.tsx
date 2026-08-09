import { ITEM_CATALOG, MONSTER_PARTNERS } from '../../game/data'
import { useGame } from '../../game/GameContext'
import type { MonsterPartnerId } from '../../game/types'

const purchasablePartnerIds = [
  'cow-girl',
  'bee-girl',
  'spider-girl',
  'fire-slime-girl',
  'water-slime-girl',
] satisfies MonsterPartnerId[]

export function RanchModal() {
  const { state, dispatch } = useGame()
  const { ranch } = state
  const dragon = MONSTER_PARTNERS['dragon-girl']

  return <div className="ranch-content">
    {!ranch.owned ? <section className="ranch-contract">
      <span>林下共生协议 · 六席共生区</span>
      <h3>雾苔共生牧场</h3>
      <p>解锁伙伴起居室、每日产物记录与机器协作。签约后可邀请五位经营伙伴，龙娘只会通过矿洞或金币邀约加入。</p>
      <dl><div><dt>合同价格</dt><dd>2,800 金币</dd></div><div><dt>共生席位</dt><dd>6 位伙伴</dd></div><div><dt>维护费用</dt><dd>每日 0 金币</dd></div></dl>
      <button id="ranch-buy-contract" className="primary-button" type="button" disabled={state.money < 2800} onClick={() => dispatch({ type: 'BUY_RANCH' })}>签署牧场合同</button>
      {state.money < 2800 && <div className="inline-warning">还差 {2800 - state.money} 金币。</div>}
      {ranch.dragonStatus === 'promised' && <div className="inline-success">龙娘正在等待牧场建成，签约后会直接入住。</div>}
    </section> : <p className="ranch-owned-banner">牧场合同已经生效 · 已入住 {ranch.residents.length} / 6 · 每次跨日自动结算产物</p>}

    <div className="partner-grid">
      {purchasablePartnerIds.map((partnerId) => {
        const partner = MONSTER_PARTNERS[partnerId]
        const owned = ranch.residents.includes(partnerId)
        const product = partner.dailyProduct
        const disabled = !ranch.owned || owned || state.money < partner.price!
        const buttonLabel = owned
          ? `${partner.name}已经入住`
          : !ranch.owned
            ? `需先购买牧场才能邀请${partner.name}`
            : `邀请${partner.name}，花费 ${partner.price} 金币`
        return <article key={partner.id} className={owned ? 'is-owned' : ''}>
          <span className="partner-sigil" aria-hidden="true"><i /></span>
          <span className="partner-role">{partner.role}</span>
          <h3>{partner.name}</h3>
          <p>{partner.ability}</p>
          {product && <small>每日产物：{ITEM_CATALOG[product.itemId].name} ×{product.quantity}</small>}
          <footer><strong>{owned ? '已经入住' : `${partner.price} 金币`}</strong><button id={`ranch-partner-${partner.id}`} type="button" aria-label={buttonLabel} disabled={disabled} onClick={() => dispatch({ type: 'BUY_MONSTER_PARTNER', partnerId })}>{owned ? '已入住' : ranch.owned ? '邀请伙伴' : '需先购买牧场'}</button></footer>
        </article>
      })}

      <article className="dragon-partner-card">
        <span className="partner-sigil dragon-sigil" aria-hidden="true"><i /></span>
        <span className="partner-role">{dragon.role}</span>
        <h3>{dragon.name}</h3>
        <p>{dragon.ability}</p>
        <small>龙娘不在商店售卖：前往矿洞第 20 层击败她，或准备 20,000 金币吸引她。</small>
        <footer><strong>{ranch.dragonStatus === 'resident' ? '已经入住' : ranch.dragonStatus === 'promised' ? '等待牧场' : '矿洞终局伙伴'}</strong><button id="ranch-dragon-record" type="button" disabled>不可商店购买</button></footer>
      </article>
    </div>
  </div>
}
