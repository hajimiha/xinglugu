import { useEffect, useRef, useState } from 'react'
import { locations } from '../../../game/data'
import { createContentPack } from '../../../sillytavern/content-pack'
import { exportToJson } from '../../../sillytavern/importer'
import type { CharacterCard } from '../../../sillytavern/types'
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

  useEffect(() => {
    if (source) setDraft(structuredClone(source))
  }, [source?.id])

  const closeEditor = () => {
    setSelectedId(null)
    setDraft(null)
  }

  const save = async () => {
    if (!draft) return
    await tavern.saveCharacter({ ...draft, updatedAt: Date.now() })
    setNotice(`${draft.name}的立绘配置已保存。`)
  }

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
    <header className="tavern-panel-heading">
      <div><span>PORTRAIT ASSETS</span><h3 id="character-panel-title">居民与共生伙伴</h3><p>在这里维护好感度区间立绘。人物文字设定请在世界书中维护，角色卡不会重复向模型注入描述。</p></div>
      <div className="character-heading-tools"><div className="character-stat"><strong>{tavern.characters.length}</strong><span>位角色</span></div><button id="character-export-content-pack" type="button" aria-label="导出仓库内容包" onClick={exportRepositoryPack}><GameIcon name="save" size={17} />导出仓库内容包</button></div>
    </header>
    {notice && <div className="tavern-panel-notice" role="status">{notice}</div>}
    <aside className="repository-content-guide"><GameIcon name="branch" size={20} /><div><strong>发布到所有设备</strong><p>完成世界书、预设和立绘编辑后导出整包，替换仓库中的 <code>public/content/mistvale-content-pack.json</code> 并提交。</p></div></aside>
    <div className="character-workspace">
      <div className="character-card-grid">{tavern.characters.map((card, index) => {
        const location = locations.find((item) => item.id === card.locationId)
        const portrait = card.portraitSlots[0]?.source
        return <article key={card.id} className={card.id === selectedId ? 'is-active' : ''} style={{ '--card-index': index } as React.CSSProperties}>
          <div className="character-card-portrait">{portrait ? <img src={portrait} alt={`${card.name}立绘`} /> : <span>{card.name.slice(0, 1)}</span>}<i /></div>
          <div><span>{card.role}</span><h4>{card.name}</h4><p>{location?.name ?? '苔灯农场·共生牧场'} · {card.portraitSlots.length} 个区间</p></div>
          <button id={`character-edit-${card.id}`} type="button" aria-label={`编辑角色卡：${card.name}`} onClick={() => setSelectedId(card.id)}><GameIcon name="profile" size={16} />管理立绘</button>
        </article>
      })}</div>
      {draft && <aside className="character-editor" aria-labelledby={`character-editor-title-${draft.id}`}>
        <header><div><span>PORTRAIT EDITOR</span><h4 id={`character-editor-title-${draft.id}`}>立绘资产 · {draft.name}</h4></div><div className="character-editor-header-actions"><button id={`character-editor-portrait-${draft.id}`} className="character-editor-portrait-shortcut" type="button" aria-label="前往立绘上传" onClick={() => { portraitSectionRef.current?.scrollIntoView({ block: 'start' }); portraitSectionRef.current?.focus({ preventScroll: true }) }}><GameIcon name="upload" size={15} />立绘上传</button><button id={`character-editor-close-${draft.id}`} className="icon-button" type="button" aria-label="关闭角色卡编辑" onClick={closeEditor}><GameIcon name="close" size={16} /></button></div></header>
        <div className="character-editor-scroll">
          <div className="repository-content-guide character-lorebook-note"><GameIcon name="book" size={18} /><div><strong>人物文字设定请在世界书中维护</strong><p>此处只保存立绘文件与好感度区间，避免角色卡文本与世界书出现两套冲突设定。</p></div></div>
          <div ref={portraitSectionRef} tabIndex={-1}><PortraitSlotEditor characterId={draft.id} characterName={draft.name} slots={draft.portraitSlots} onChange={(portraitSlots) => setDraft({ ...draft, portraitSlots, updatedAt: Date.now() })} onNotice={setNotice} /></div>
        </div>
        <footer><button id={`character-save-${draft.id}`} className="primary-button" type="button" onClick={() => void save()}><GameIcon name="upload" size={16} />保存立绘配置</button></footer>
      </aside>}
    </div>
  </section>
}
