import { useState } from 'react'
import { BUILD_RECIPES, CRAFT_RECIPES, ITEM_CATALOG, MACHINE_RECIPES, MONSTER_PARTNERS } from '../../game/data'
import { useGame } from '../../game/GameContext'
import { getEnergyCost } from '../../game/rules'
import type { MachineId } from '../../game/types'
import { getAbsoluteMinute } from '../../game/reducer'
import { GameIcon } from '../icons/GameIcon'

const machineIds = ['furnace', 'mill'] satisfies MachineId[]

function buildLabel(machine: MachineId) {
  return machine === 'furnace'
    ? '建造石砌熔炉，消耗石头 25'
    : '建造转动磨粉机，消耗木头 20、石头 15和600金币'
}

export function FarmWorkshop() {
  const { state, dispatch } = useGame()
  const [batchDrafts, setBatchDrafts] = useState<Record<string, string>>({})
  const [tartDraft, setTartDraft] = useState('1')
  const currentMinute = getAbsoluteMinute(state.year, state.day, state.minutes)

  const updateBatch = (recipeId: string, value: string) => {
    setBatchDrafts((current) => ({ ...current, [recipeId]: value }))
  }

  return <section className="farm-workshop" role="region" aria-label="农场生产工坊">
    <header className="farm-workshop-header">
      <div><span>FARM PRODUCTION</span><h2>农场生产工坊</h2><p>机器在旅行与消磨时间期间持续工作，完成后产物会自动收入背包。</p></div>
      <div className="workshop-resource-strip"><span>木头 <b>{state.inventory.wood ?? 0}</b></span><span>石头 <b>{state.inventory.stone ?? 0}</b></span><span>精力 <b>{state.energy}</b></span></div>
    </header>

    <div className="farm-workshop-track">
      {machineIds.map((machineId) => {
        const machine = state.machines[machineId]
        const build = BUILD_RECIPES[machineId]
        const recipes = Object.values(MACHINE_RECIPES).filter((recipe) => recipe.machine === machineId)
        const helper = Object.values(MONSTER_PARTNERS).find((partner) => partner.machineAssist === machineId)
        const elementName = machineId === 'furnace' ? '火系' : '水系'
        const helperPresent = helper ? state.ranch.residents.includes(helper.id) : false
        const magicKnown = state.knownSpells.some((spellId) => machineId === 'furnace' ? spellId.startsWith('fire-') : spellId.startsWith('water-'))
        const job = machine.job
        const jobRecipe = job ? MACHINE_RECIPES[job.recipeId] : undefined
        const remaining = job ? Math.max(0, job.completesAt - currentMinute) : 0

        return <article key={machineId} className={`workshop-machine-card ${machine.built ? 'is-built' : 'is-blueprint'}`}>
          <header><span className="machine-mark"><GameIcon name={machineId === 'furnace' ? 'mining' : 'farming'} size={20} weight="duotone" /></span><div><small>{machine.built ? '设施在线' : '建造蓝图'}</small><h3>{build.name}</h3></div></header>
          {!machine.built ? <div className="machine-blueprint">
            <p>{machineId === 'furnace' ? '以石材砌筑耐热炉膛，把矿石烧制成对应金属锭。' : '用木石搭建水轮结构，把夕照麦持续研磨成面粉。'}</p>
            <button id={`workshop-build-${machineId}`} type="button" aria-label={buildLabel(machineId)} onClick={() => dispatch({ type: 'BUILD_MACHINE', machine: machineId })}>{buildLabel(machineId).replace('，消耗', ' · ')}</button>
          </div> : <>
            <div className="machine-power-line"><GameIcon name="magic" size={14} /><span>{elementName}魔法可{machineId === 'furnace' ? '点火' : '驱动'} · {helper?.name}可免精力协作</span><b>{helperPresent ? '伙伴就绪' : magicKnown ? `魔法就绪 · ${getEnergyCost(1, state.rules.energyCostMode)} 精力` : '缺少动力'}</b></div>
            {job && jobRecipe ? <div className="machine-job" aria-live="polite"><span><GameIcon name="hourglass" size={16} /></span><div><strong>加工中 · {jobRecipe.name}</strong><small>{job.batches} 批 · 还需 {Math.ceil(remaining / 60)} 小时 · {job.poweredBy === 'partner' ? '伙伴协作' : '魔法点火'}</small></div></div> : <div className="machine-recipe-list">{recipes.map((recipe) => {
              const value = batchDrafts[recipe.id] ?? '1'
              const batches = Math.max(1, Math.floor(Number(value) || 1))
              const inputRequired = recipe.inputPerBatch * batches
              const canStart = (state.inventory[recipe.inputItemId] ?? 0) >= inputRequired && (helperPresent || magicKnown) && state.energy >= (helperPresent ? 0 : getEnergyCost(1, state.rules.energyCostMode))
              return <div key={recipe.id} className="machine-recipe-row"><div><strong>{recipe.name}</strong><small>{ITEM_CATALOG[recipe.inputItemId].name} {recipe.inputPerBatch} → {ITEM_CATALOG[recipe.outputItemId].name} {recipe.outputPerBatch} · 每批 {recipe.minutesPerBatch / 60} 小时</small></div><label><span>批数</span><input id={`workshop-batches-${recipe.id}`} aria-label={`${recipe.name}批数`} type="number" min="1" step="1" inputMode="numeric" value={value} onChange={(event) => updateBatch(recipe.id, event.target.value)} /></label><button id={`workshop-start-${recipe.id}`} type="button" aria-label={`开始${recipe.name}，共 ${batches} 批`} disabled={!canStart} onClick={() => dispatch({ type: 'START_MACHINE_JOB', recipeId: recipe.id, batches })}>开始</button></div>
            })}</div>}
          </>}
        </article>
      })}

      <article className="workshop-machine-card kitchen-card">
        <header><span className="machine-mark"><GameIcon name="gift" size={20} weight="duotone" /></span><div><small>手作料理</small><h3>余烬莓果挞</h3></div></header>
        <p>每份使用余烬莓 2、蜂蜜 1、面粉 1、牛奶 1。无需等待，制作后立即放入背包。</p>
        <div className="kitchen-action"><label><span>份数</span><input id="workshop-tart-quantity" aria-label="莓果挞制作份数" type="number" min="1" step="1" inputMode="numeric" value={tartDraft} onChange={(event) => setTartDraft(event.target.value)} /></label><button id="workshop-craft-berry-tart" type="button" aria-label={`制作莓果挞 ${Math.max(1, Math.floor(Number(tartDraft) || 1))} 份`} disabled={Object.entries(CRAFT_RECIPES['berry-tart'].materials).some(([itemId, amount]) => (state.inventory[itemId] ?? 0) < amount * Math.max(1, Math.floor(Number(tartDraft) || 1)))} onClick={() => dispatch({ type: 'CRAFT_ITEM', recipeId: 'berry-tart', quantity: Math.max(1, Math.floor(Number(tartDraft) || 1)) })}>开始制作</button></div>
      </article>
    </div>
  </section>
}
