import { getNpcsAtLocation } from '../../game/calendar'
import { crops, locations } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { WORLD_NAME } from '../../branding'

export function ContextRail() {
  const { state } = useGame()
  const location = locations.find((item) => item.id === state.location) ?? locations[0]
  const presentNpcs = getNpcsAtLocation(state.location, state.year, state.day, state.minutes)
  const planted = state.plots.filter((plot) => plot.cropId).length
  const ready = state.plots.filter((plot) => plot.ready).length
  const dominantCropId = state.plots.find((plot) => plot.cropId)?.cropId
  const dominantCrop = crops.find((crop) => crop.id === dominantCropId)

  return (
    <aside className="context-rail panel-frame" aria-labelledby="context-title">
      <div className="panel-heading compact-heading">
        <span className="section-index">02</span>
        <div><p className="eyebrow">LOCATION NOTES</p><h2 id="context-title">地点札记</h2></div>
      </div>
      <div className="context-location-card">
        <span className="location-kicker">{location.category === 'home' ? '私人领地' : `${WORLD_NAME}公共区域`}</span>
        <h3>{location.name}</h3>
        <p>{location.description}</p>
        <dl className="context-facts">
          <div><dt>开放</dt><dd>{location.hours}</dd></div>
          <div><dt>步行</dt><dd>{location.travelMinutes === 0 ? '已抵达' : `${location.travelMinutes} 分钟`}</dd></div>
        </dl>
      </div>
      {state.location === 'farm' ? (
        <div className="farm-summary">
          <div><span>已耕种</span><strong>{planted}<small>/24</small></strong></div>
          <div><span>可收获</span><strong>{ready}</strong></div>
          <p>主要作物：{dominantCrop?.name ?? '尚未播种'}</p>
        </div>
      ) : (
        <div className="present-list">
          <span className="eyebrow">当前在场</span>
          {presentNpcs.length ? presentNpcs.map((npc) => <div key={npc.id}><i aria-hidden="true" /><span>{npc.name}</span><small>{npc.role}</small></div>) : <p>此刻没有村民停留。</p>}
        </div>
      )}
      <div className="context-tip">
        <span>经营建议</span>
        <p>余下精力适合先收获，再前往村长家提交委托。</p>
      </div>
    </aside>
  )
}
