import { useEffect, useRef, useState } from 'react'
import { locations } from '../../../game/data'
import type { CharacterCard } from '../../../sillytavern/types'
import { createContentPack } from '../../../sillytavern/content-pack'
import { exportToJson } from '../../../sillytavern/importer'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'
import { PortraitSlotEditor } from './PortraitSlotEditor'

export function CharacterPanel() {
  const tavern = useTavern()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const source = tavern.characters.find((card) => card.id === selectedId) ?? null
  const [draft, setDraft] = useState<CharacterCard | null>(null)
  const [notice, setNotice] = useState('')
  const portraitSectionRef = useRef<HTMLDivElement>(null)
  useEffect(() => { if (source) setDraft(structuredClone(source)) }, [source?.id])

  const closeEditor = () => {
    setSelectedId(null)
    setDraft(null)
  }
  const showPortraitUpload = () => {
    portraitSectionRef.current?.scrollIntoView({ block: 'start' })
    portraitSectionRef.current?.focus({ preventScroll: true })
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
    <header className="tavern-panel-heading"><div><span>CHARACTER CARDS</span><h3 id="character-panel-title">居民与共生伙伴</h3><p>全部女性居民与魔物娘伙伴默认使用一张 0—100 立绘，也可按自定义好感区间逐步扩展。</p></div><div className="character-heading-tools"><div className="character-stat"><strong>{tavern.characters.length}</strong><span>张角色卡</span></div><button id="character-export-content-pack" type="button" aria-label="导出仓库内容包" onClick={exportRepositoryPack}><GameIcon name="save" size={17} />导出仓库内容包</button></div></header>
    {notice && <div className="tavern-panel-notice" role="status">{notice}</div>}
    <aside className="repository-content-guide"><GameIcon name="branch" size={20} /><div><strong>发布到所有设备</strong><p>完成世界书、预设和立绘编辑后导出整包，替换仓库中的 <code>public/content/mistvale-content-pack.json</code> 并提交。版本变化后，各设备会保留本机新增内容并同步仓库同 ID 内容。</p></div></aside>
    <div className="character-workspace"><div className="character-card-grid">{tavern.characters.map((card, index) => { const location = locations.find((item) => item.id === card.locationId); const locationName = location?.name ?? '苔灯农场·共生牧场'; const portrait = card.portraitSlots[0]?.source; return <article key={card.id} className={card.id === selectedId ? 'is-active' : ''} style={{ '--card-index': index } as React.CSSProperties}><div className="character-card-portrait">{portrait ? <img src={portrait} alt={`${card.name}立绘`} /> : <span>{card.name.slice(0, 1)}</span>}<i /></div><div><span>{card.role}</span><h4>{card.name}</h4><p>{locationName} · {card.tags.at(-1)}</p></div><button id={`character-edit-${card.id}`} type="button" aria-label={`编辑角色卡：${card.name}`} onClick={() => setSelectedId(card.id)}><GameIcon name="profile" size={16} />编辑角色卡</button></article> })}</div>
      {draft && <aside className="character-editor" aria-labelledby={`character-editor-title-${draft.id}`}><header><div><span>CARD EDITOR</span><h4 id={`character-editor-title-${draft.id}`}>{draft.name} · {draft.role}</h4></div><div className="character-editor-header-actions"><button id={`character-editor-portrait-${draft.id}`} className="character-editor-portrait-shortcut" type="button" aria-label="前往立绘上传" onClick={showPortraitUpload}><GameIcon name="upload" size={15} />立绘上传</button><button id={`character-editor-close-${draft.id}`} className="icon-button" type="button" aria-label="关闭角色卡编辑" onClick={closeEditor}><GameIcon name="close" size={16} /></button></div></header><div className="character-editor-scroll">
        <label><span>人物描述</span><textarea id={`character-description-${draft.id}`} rows={3} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <label><span>性格与话语基调</span><textarea id={`character-personality-${draft.id}`} rows={5} value={draft.personality} onChange={(event) => setDraft({ ...draft, personality: event.target.value })} /></label>
        <label><span>当前场景</span><textarea id={`character-scenario-${draft.id}`} rows={3} value={draft.scenario} onChange={(event) => setDraft({ ...draft, scenario: event.target.value })} /></label>
        <label><span>首句</span><textarea id={`character-first-message-${draft.id}`} rows={4} value={draft.firstMessage} onChange={(event) => setDraft({ ...draft, firstMessage: event.target.value })} /></label>
        <label><span>示例对白</span><textarea id={`character-example-${draft.id}`} rows={3} value={draft.exampleDialogue} onChange={(event) => setDraft({ ...draft, exampleDialogue: event.target.value })} /></label>
        <div ref={portraitSectionRef} className="portrait-slot-anchor" tabIndex={-1}><PortraitSlotEditor characterId={draft.id} characterName={draft.name} slots={draft.portraitSlots} onChange={(portraitSlots) => setDraft({ ...draft, portraitSlots, updatedAt: Date.now() })} onNotice={setNotice} /></div>
      </div><footer><button id={`character-save-${draft.id}`} className="primary-button" type="button" onClick={() => void save()}><GameIcon name="upload" size={16} />保存角色卡</button></footer></aside>}
    </div>
  </section>
}
