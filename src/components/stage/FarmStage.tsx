import { memo, useMemo } from 'react'
import type { CSSProperties, Dispatch } from 'react'
import farmDuskImage from '../../assets/pixel/farm-dusk.webp'
import { crops, shopItems } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getEnergyCost, scaleGrowthHours, scaleReward } from '../../game/rules'
import type { GameAction, Plot } from '../../game/types'
import { GameIcon } from '../icons/GameIcon'
import { FarmWorkshop } from './FarmWorkshop'

function formatRemaining(hours: number) {
  if (hours <= 0) return '已经成熟'
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  if (!days) return `${rest}小时后成熟`
  if (!rest) return `${days}日后成熟`
  return `${days}日${rest}小时后成熟`
}

function plotLabel(plot: Plot) {
  const crop = crops.find((item) => item.id === plot.cropId)
  return crop
    ? `地块 ${plot.row}-${plot.column}，${crop.name}，${plot.ready ? '已经成熟' : formatRemaining(plot.remainingHours ?? 0)}`
    : `地块 ${plot.row}-${plot.column}，空地`
}

const FarmPlotButton = memo(function FarmPlotButton({ plot, dispatch }: { plot: Plot; dispatch: Dispatch<GameAction> }) {
  const crop = crops.find((item) => item.id === plot.cropId)
  return (
    <button
      id={`farm-${plot.id}`}
      className={`farm-plot ${crop ? 'has-crop' : 'is-empty'} ${plot.ready ? 'is-ready' : ''} ${plot.watered ? 'is-watered' : ''}`}
      style={{ '--crop-color': crop?.color ?? '#6b4b31' } as CSSProperties}
      type="button"
      aria-label={plotLabel(plot)}
      onClick={() => dispatch({ type: 'OPEN_MODAL', modal: 'plot', plotId: plot.id })}
    >
      <span className="crop-sprite" aria-hidden="true"><i /><i /><i /></span>
      <span className="plot-status">
        <strong>{crop?.name ?? '空地'}</strong>
        <small>{crop ? (plot.ready ? '可收获' : formatRemaining(plot.remainingHours ?? 0).replace('后成熟', '')) : '可播种'}</small>
      </span>
      {plot.watered && <span className="water-mark" aria-hidden="true" />}
    </button>
  )
})

export function FarmStage() {
  const { state, dispatch } = useGame()
  const selected = state.activeModal === 'plot'
    ? state.plots.find((plot) => plot.id === state.selectedPlotId)
    : undefined
  const selectedCrop = crops.find((crop) => crop.id === selected?.cropId)
  const matureCount = state.plots.filter((plot) => plot.ready).length
  const maxRow = Math.max(0, ...state.plots.map((plot) => plot.row))
  const farmRows = useMemo(() => Array.from({ length: maxRow }, (_, index) => ({
    row: index + 1,
    plots: state.plots.filter((plot) => plot.row === index + 1).sort((left, right) => left.column - right.column),
  })), [maxRow, state.plots])
  const expansionEnergy = getEnergyCost(1, state.rules.energyCostMode)
  const nextPlotCount = [6, 8, 10, 12][Math.min(4, Math.max(1, state.tools.hoe)) - 1]
  const farmIsFull = maxRow >= 30
  const fertilizerCount = state.inventory['moss-fertilizer'] ?? 0
  const seedChoices = shopItems.flatMap((seed) => {
    if (seed.category !== 'seed' || (state.inventory[seed.id] ?? 0) < 1) return []
    const crop = crops.find((item) => `${item.id}-seed` === seed.id)
    const available = seed.season === state.season && crop?.season === state.season
    return crop ? [{ seed, crop, count: state.inventory[seed.id], available }] : []
  })
  const selectedGrowthHours = selectedCrop ? scaleGrowthHours(selectedCrop.growthHours, state.rules.cropGrowthMultiplier) : 0
  const close = () => dispatch({ type: 'CLOSE_MODAL' })

  const harvest = () => {
    if (!selected) return
    dispatch({ type: 'HARVEST_PLOT', plotId: selected.id })
    close()
  }

  return (
    <section className="world-stage farm-stage panel-frame" aria-labelledby="stage-title">
      <img className="farm-scene" src={farmDuskImage} width="1672" height="941" alt="苔灯农场暮色场景，田垄、温室与农舍被薄雾笼罩" decoding="async" />
      <div className="farm-vignette" aria-hidden="true" />
      <div className="stage-atmosphere" aria-hidden="true"><i /><i /><i /></div>
      <header className="stage-titlebar">
        <div><p className="eyebrow">SOUTH FIELD · 第{state.day}日</p><h1 id="stage-title">南坡田区</h1></div>
        <span className="weather-pill">{state.weather} · {state.plots.some((plot) => plot.watered) ? '土壤湿润' : '等待开垦'}</span>
      </header>

      <div className="farm-stage-copy">
        <span>{state.season} · 成熟作物 {matureCount}</span>
        <strong>{state.plots.some((plot) => plot.cropId) ? '田垄已有新芽，今天的劳作正等待你的安排。' : '刚接手的田地还很安静，从第一包种子开始吧。'}</strong>
      </div>

      <div className="farm-field-panel">
        <header className="farm-field-toolbar">
          <div>
            <span>田垄档案 · 锄头等级 {state.tools.hoe}</span>
            <strong>{maxRow} 行 · {state.plots.length} 格</strong>
            <small>下次增加 {nextPlotCount} 格 · 木头 {state.inventory.wood ?? 0} · 石头 {state.inventory.stone ?? 0} · 月铃花 {state.inventory.moonflower ?? 0}</small>
          </div>
          <button
            id="farm-expand-plots"
            className="farm-expand-button"
            type="button"
            aria-label={farmIsFull ? '田地已达三十行上限' : `开拓新田垄，消耗 ${expansionEnergy} 点精力`}
            disabled={farmIsFull || state.energy < expansionEnergy}
            onClick={() => dispatch({ type: 'EXPAND_FARM', roll: Math.random() })}
          >
            <GameIcon name="farming" size={17} weight="duotone" />
            <span>{farmIsFull ? '田垄已满' : '开拓田地'}</span>
            <small>{farmIsFull ? '30 行上限' : `${expansionEnergy} 精力`}</small>
          </button>
        </header>
        <div className="farm-grid" role="region" aria-label="可滚动农田" tabIndex={0}>
          {farmRows.map((row) => (
            <div
              key={row.row}
              className="farm-row"
              role="group"
              aria-label={`第 ${row.row} 行，共 ${row.plots.length} 格`}
              style={{ '--farm-columns': row.plots.length } as CSSProperties}
            >
              {row.plots.map((plot) => <FarmPlotButton key={plot.id} plot={plot} dispatch={dispatch} />)}
            </div>
          ))}
        </div>
      </div>

      <FarmWorkshop />

      {selected && (
        <section className="plot-dialog" role="dialog" aria-modal="false" aria-labelledby="plot-dialog-title">
          <header>
            <div><span>田区 {selected.row}—{selected.column}</span><h2 id="plot-dialog-title">地块详情</h2></div>
            <button id="plot-dialog-close" className="icon-button" type="button" aria-label="关闭地块详情" onClick={close}><GameIcon name="close" size={17} /></button>
          </header>
          <div className="plot-dialog-crop">
            <span className={`crop-emblem ${selected.ready ? 'is-ready' : ''}`} style={{ '--crop-color': selectedCrop?.color ?? '#74543b' } as CSSProperties} aria-hidden="true"><i /></span>
            <div><strong>{selectedCrop?.name ?? '休耕空地'}</strong><p>{selectedCrop?.description ?? '土壤松软，适合播下本季种子。'}</p></div>
          </div>
          {selectedCrop && <>
            <div className="growth-meter"><span style={{ width: `${selected.ready ? 100 : Math.max(8, 100 - ((selected.remainingHours ?? 0) / selectedGrowthHours) * 100)}%` }} /><small>{selected.ready ? '已经成熟' : formatRemaining(selected.remainingHours ?? 0)}</small></div>
            <div className="plot-actions">
              <button id={`plot-water-${selected.id}`} type="button" aria-label={`给地块 ${selected.row}-${selected.column} 浇水`} disabled={selected.ready || selected.watered} onClick={() => dispatch({ type: 'WATER_PLOT', plotId: selected.id })}><span>浇水</span><small>{selected.watered ? '今日已浇水' : '0 精力'}</small></button>
              <button id={`plot-fertilize-${selected.id}`} type="button" aria-label={`给地块 ${selected.row}-${selected.column} 施肥`} disabled={selected.ready || selected.fertilized || fertilizerCount < 1} onClick={() => dispatch({ type: 'FERTILIZE_PLOT', plotId: selected.id })}><span>施用苔肥</span><small>{selected.fertilized ? '已经施肥' : `1 份 · 持有 ${fertilizerCount}`}</small></button>
              <button id={`plot-harvest-${selected.id}`} className="harvest-action" type="button" aria-label={`收获地块 ${selected.row}-${selected.column} 的${selectedCrop.name}`} disabled={!selected.ready} onClick={harvest}><span>收获</span><small>{selected.ready ? `预计 ${scaleReward(3, state.rules.dropMultiplier)} 份` : '尚未成熟'}</small></button>
            </div>
          </>}
          {!selectedCrop && <section className="seed-picker" aria-labelledby={`seed-picker-title-${selected.id}`}>
            <header><div><span>SEED SATCHEL</span><h3 id={`seed-picker-title-${selected.id}`}>选择持有种子</h3></div><small>{state.season}季 · 生长倍率 ×{state.rules.cropGrowthMultiplier.toFixed(2)}</small></header>
            {seedChoices.length > 0 ? <div className="seed-choice-list">{seedChoices.map(({ seed, crop, count, available }) => <button
              id={`plot-plant-${selected.id}-${seed.id}`}
              key={seed.id}
              type="button"
              aria-label={`播种${crop.name}，持有 ${count} 包${available ? '' : `，${crop.season}季可用`}`}
              disabled={!available}
              onClick={() => dispatch({ type: 'PLANT_PLOT', plotId: selected.id, seedId: seed.id })}
            >
              <span className="seed-choice-mark" style={{ '--crop-color': crop.color } as CSSProperties} aria-hidden="true"><i /></span>
              <span><strong>{crop.name}</strong><small>{available ? formatRemaining(scaleGrowthHours(crop.growthHours, state.rules.cropGrowthMultiplier)) : `${crop.season}季可用`}</small></span>
              <b>持有 {count}</b>
            </button>)}</div> : <p className="plot-inline-note">背包里没有适合{state.season}季的种子，可前往杂货店补充。</p>}
          </section>}
        </section>
      )}
    </section>
  )
}
