import { useState, type ChangeEvent } from 'react'
import { insertPortraitSlot, removePortraitSlot } from '../../../sillytavern/portrait-slots'
import type { PortraitSlot } from '../../../sillytavern/types'
import { GameIcon } from '../../icons/GameIcon'

interface PortraitSlotEditorProps {
  characterId: string
  characterName: string
  slots: PortraitSlot[]
  onChange: (slots: PortraitSlot[]) => void
  onNotice?: (message: string) => void
}

const portraitTypes = new Set(['image/png', 'image/jpeg', 'image/webp'])

export function PortraitSlotEditor({ characterId, characterName, slots, onChange, onNotice }: PortraitSlotEditorProps) {
  const [adding, setAdding] = useState(false)
  const [minimum, setMinimum] = useState('70')
  const [maximum, setMaximum] = useState('100')
  const [error, setError] = useState('')

  const addSlot = () => {
    const minAffinity = Number(minimum)
    const maxAffinity = Number(maximum)
    if (!Number.isInteger(minAffinity) || !Number.isInteger(maxAffinity) || minAffinity < 0 || maxAffinity > 100) {
      setError('请输入 0—100 之间的整数好感区间。')
      return
    }
    if (minAffinity > maxAffinity) {
      setError('起始好感不能大于结束好感。')
      return
    }
    onChange(insertPortraitSlot(slots, {
      id: `portrait-${minAffinity}-${maxAffinity}-${crypto.randomUUID()}`,
      minAffinity,
      maxAffinity,
      source: '',
    }))
    setAdding(false)
    setError('')
    onNotice?.(`已新增好感 ${minAffinity}—${maxAffinity} 立绘槽位，并自动调整原有区间。`)
  }

  const upload = (slot: PortraitSlot, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (!portraitTypes.has(file.type)) {
      setError('立绘格式无效：请选择 PNG、JPG 或 WebP 图片。')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      onChange(slots.map((candidate) => candidate.id === slot.id ? { ...candidate, source: String(reader.result) } : candidate))
      setError('')
      onNotice?.(`${characterName}的好感 ${slot.minAffinity}—${slot.maxAffinity} 立绘已载入，保存角色卡后生效。`)
    }
    reader.onerror = () => setError('图片读取失败，请重新选择立绘。')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  const remove = (slot: PortraitSlot) => {
    onChange(removePortraitSlot(slots, slot.id))
    setError('')
    onNotice?.(`已删除好感 ${slot.minAffinity}—${slot.maxAffinity} 立绘槽位，相邻区间已自动补全。`)
  }

  return (
    <fieldset className="portrait-slot-editor" data-portrait-upload-target="true" tabIndex={-1}>
      <legend>好感区间立绘</legend>
      <header className="portrait-slot-heading">
        <div><strong>按好感值切换立绘</strong><p>默认一张立绘覆盖 0—100；新增区间会自动切分原槽位，区间始终连续且不重叠。</p></div>
        <button id={`portrait-slot-add-${characterId}`} type="button" aria-label="新增立绘区间" onClick={() => { setAdding((current) => !current); setError('') }}>
          <GameIcon name="upload" size={15} />新增区间
        </button>
      </header>

      <div className="portrait-slot-track" aria-label="好感区间分布">
        {slots.map((slot) => <span key={slot.id} style={{ flexGrow: slot.maxAffinity - slot.minAffinity + 1 }}>{slot.minAffinity}—{slot.maxAffinity}</span>)}
      </div>

      {adding && <div className="portrait-slot-add-form">
        <label htmlFor={`portrait-slot-min-${characterId}`}><span>区间起始好感</span><input id={`portrait-slot-min-${characterId}`} type="number" inputMode="numeric" min="0" max="100" value={minimum} onChange={(event) => setMinimum(event.target.value)} /></label>
        <span aria-hidden="true">至</span>
        <label htmlFor={`portrait-slot-max-${characterId}`}><span>区间结束好感</span><input id={`portrait-slot-max-${characterId}`} type="number" inputMode="numeric" min="0" max="100" value={maximum} onChange={(event) => setMaximum(event.target.value)} /></label>
        <button id={`portrait-slot-confirm-${characterId}`} className="primary-button" type="button" aria-label="确认新增区间" onClick={addSlot}>确认新增</button>
      </div>}

      {error && <p className="portrait-slot-error" role="alert">{error}</p>}

      <div className="portrait-slot-list">
        {slots.map((slot) => {
          const range = `${slot.minAffinity}—${slot.maxAffinity}`
          const uploadId = `character-portrait-upload-${characterId}-${slot.minAffinity}-${slot.maxAffinity}`
          return <article key={slot.id} className="portrait-slot-card">
            <header><div><span>好感区间</span><strong>好感 {range}</strong></div>{slots.length > 1 && <button id={`portrait-slot-remove-${characterId}-${slot.minAffinity}-${slot.maxAffinity}`} type="button" aria-label={`删除好感 ${range} 立绘槽位`} onClick={() => remove(slot)}><GameIcon name="trash" size={15} />删除</button>}</header>
            <div className="portrait-slot-preview">
              {slot.source
                ? <img src={slot.source} alt={`${characterName}·好感${range}立绘预览`} />
                : <div><GameIcon name="upload" size={25} /><strong>此区间尚未上传立绘</strong><p>支持 PNG、JPG、WebP，单张不设容量上限；大图会增加本机存储与内容包体积。</p></div>}
              <label htmlFor={uploadId} aria-label={`为${characterName}的好感 ${range} 选择立绘`}>{slot.source ? '替换图片' : '选择图片'}</label>
              <input id={uploadId} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => upload(slot, event)} />
            </div>
          </article>
        })}
      </div>
    </fieldset>
  )
}
