import { useEffect, useState, type ChangeEvent } from 'react'
import { affinityStageNames, locations } from '../../../game/data'
import type { AffinityStage } from '../../../game/types'
import type { CharacterCard } from '../../../sillytavern/types'
import { createContentPack, MAX_PORTRAIT_FILE_BYTES } from '../../../sillytavern/content-pack'
import { exportToJson } from '../../../sillytavern/importer'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'

const stages = Object.keys(affinityStageNames) as AffinityStage[]

export function CharacterPanel() {
  const tavern = useTavern()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const source = tavern.characters.find((card) => card.id === selectedId) ?? null
  const [draft, setDraft] = useState<CharacterCard | null>(null)
  const [portraitStage, setPortraitStage] = useState<AffinityStage>('stranger')
  const [notice, setNotice] = useState('')
  useEffect(() => { if (source) setDraft(structuredClone(source)) }, [source?.id])

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !draft) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setNotice('立绘格式无效：请选择 PNG、JPG 或 WebP 图片。')
      event.target.value = ''
      return
    }
    if (file.size > MAX_PORTRAIT_FILE_BYTES) {
      setNotice('立绘超过 512 KB。为保证手机端与 GitHub 发布稳定，请压缩为 WebP 后重新上传。')
      event.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setDraft({ ...draft, portraitByAffinity: { ...draft.portraitByAffinity, [portraitStage]: String(reader.result) }, updatedAt: Date.now() })
      setNotice(`${draft.name}的${affinityStageNames[portraitStage]}立绘已载入，保存角色卡后生效。`)
    }
    reader.readAsDataURL(file)
    event.target.value = ''
  }
  const save = async () => { if (!draft) return; await tavern.saveCharacter({ ...draft, updatedAt: Date.now() }); setNotice(`${draft.name}的角色卡已保存`) }
  const exportRepositoryPack = () => {
    try {
      const contentVersion = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '.')
      exportToJson(createContentPack({ contentVersion, lorebooks: tavern.lorebooks, presets: tavern.presets, characters: tavern.characters }), 'mistvale-content-pack.json')
      setNotice('仓库内容包已导出；提交到指定 public 路径后即可发布到所有设备。')
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : '内容包无法导出，请检查立绘大小与数据结构。')
    }
  }

  return <section className="tavern-panel character-panel" aria-labelledby="character-panel-title">
    <header className="tavern-panel-heading"><div><span>CHARACTER CARDS</span><h3 id="character-panel-title">居民与共生伙伴</h3><p>全部女性居民与魔物娘伙伴均可独立编辑五阶段立绘、性格和酒馆叙事资料。</p></div><div className="character-heading-tools"><div className="character-stat"><strong>{tavern.characters.length}</strong><span>张角色卡</span></div><button id="character-export-content-pack" type="button" aria-label="导出仓库内容包" onClick={exportRepositoryPack}><GameIcon name="save" size={17} />导出仓库内容包</button></div></header>
    {notice && <div className="tavern-panel-notice" role="status">{notice}</div>}
    <aside className="repository-content-guide"><GameIcon name="branch" size={20} /><div><strong>发布到所有设备</strong><p>完成世界书、预设和立绘编辑后导出整包，替换仓库中的 <code>public/content/mistvale-content-pack.json</code> 并提交。版本变化后，各设备会保留本机新增内容并同步仓库同 ID 内容。</p></div></aside>
    <div className="character-workspace"><div className="character-card-grid">{tavern.characters.map((card, index) => { const location = locations.find((item) => item.id === card.locationId); const locationName = location?.name ?? '苔灯农场·共生牧场'; const portrait = card.portraitByAffinity.stranger; return <article key={card.id} className={card.id === selectedId ? 'is-active' : ''} style={{ '--card-index': index } as React.CSSProperties}><div className="character-card-portrait">{portrait ? <img src={portrait} alt={`${card.name}初识立绘`} /> : <span>{card.name.slice(0, 1)}</span>}<i /></div><div><span>{card.role}</span><h4>{card.name}</h4><p>{locationName} · {card.tags.at(-1)}</p></div><button id={`character-edit-${card.id}`} type="button" aria-label={`编辑角色卡：${card.name}`} onClick={() => setSelectedId(card.id)}><GameIcon name="profile" size={16} />编辑角色卡</button></article> })}</div>
      {draft && <aside className="character-editor" aria-labelledby={`character-editor-title-${draft.id}`}><header><div><span>CARD EDITOR</span><h4 id={`character-editor-title-${draft.id}`}>{draft.name} · {draft.role}</h4></div><button id={`character-editor-close-${draft.id}`} className="icon-button" type="button" aria-label="关闭角色卡编辑" onClick={() => setSelectedId(null)}><GameIcon name="close" size={16} /></button></header><div className="character-editor-scroll">
        <label><span>人物描述</span><textarea id={`character-description-${draft.id}`} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label><span>性格与话语基调</span><textarea id={`character-personality-${draft.id}`} rows={5} value={draft.personality} onChange={(event) => setDraft({ ...draft, personality: event.target.value })} /></label>
        <label><span>当前场景</span><textarea id={`character-scenario-${draft.id}`} rows={3} value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} /></label>
        <label><span>首句</span><textarea id={`character-first-message-${draft.id}`} rows={4} value={draft.firstMessage} onChange={(event) => setDraft({ ...draft, firstMessage: event.target.value })} /></label>
        <label><span>示例对白</span><textarea id={`character-example-${draft.id}`} rows={3} value={draft.exampleDialogue} onChange={(event) => setDraft({ ...draft, exampleDialogue: event.target.value })} /></label>
        <fieldset className="portrait-stage-editor"><legend>好感阶段立绘</legend><div className="portrait-stage-tabs">{stages.map((stage) => <button id={`portrait-stage-${draft.id}-${stage}`} key={stage} type="button" className={stage === portraitStage ? 'is-active' : ''} onClick={() => setPortraitStage(stage)}>{affinityStageNames[stage]}</button>)}</div><div className="portrait-upload-zone">{draft.portraitByAffinity[portraitStage] ? <img src={draft.portraitByAffinity[portraitStage]} alt={`${draft.name}${affinityStageNames[portraitStage]}立绘预览`} /> : <div><GameIcon name="upload" size={26} /><strong>尚未上传{affinityStageNames[portraitStage]}立绘</strong><p>支持 PNG、JPG、WebP，单张不超过 512 KB；大量立绘建议提交为仓库静态图片路径。</p></div>}<label htmlFor={`character-portrait-upload-${draft.id}-${portraitStage}`}>选择图片</label><input id={`character-portrait-upload-${draft.id}-${portraitStage}`} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} /></div></fieldset>
      </div><footer><button id={`character-save-${draft.id}`} className="primary-button" type="button" onClick={() => void save()}><GameIcon name="upload" size={16} />保存角色卡</button></footer></aside>}
    </div>
  </section>
}
