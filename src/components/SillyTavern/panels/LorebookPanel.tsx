import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createDefaultEntry, createDefaultLorebook, removeEntry, updateEntry } from '../../../sillytavern/editor-utils'
import { exportLorebook, exportToJson, getLorebookCompatibilityWarnings, importLorebook } from '../../../sillytavern/importer'
import type { Lorebook, LorebookEntry } from '../../../sillytavern/types'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'
import { EntryForm } from '../editors/EntryForm'

const labelForEntry = (entry: LorebookEntry) => entry.comment?.trim() || entry.keys.join('、') || entry.content.slice(0, 18) || '未命名条目'

export function LorebookPanel() {
  const tavern = useTavern()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const original = tavern.lorebooks.find((book) => book.id === selectedId) ?? null
  const [draft, setDraft] = useState<Lorebook | null>(null)
  const [entryId, setEntryId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ kind: 'book' | 'entry'; id: string } | null>(null)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!selectedId && tavern.lorebooks[0]) setSelectedId(tavern.lorebooks[0].id)
  }, [selectedId, tavern.lorebooks])
  useEffect(() => {
    if (!original) return
    setDraft(structuredClone(original))
    setEntryId(original.entries[0]?.id ?? null)
  }, [original?.id])

  const dirty = useMemo(() => !!draft && (!original || JSON.stringify(draft) !== JSON.stringify(original)), [draft, original])
  const selectedEntry = draft?.entries.find((entry) => entry.id === entryId) ?? null
  const active = new Set(tavern.settings?.activeLorebookIds ?? [])

  const save = async () => {
    if (!draft) return
    const next = { ...draft, updatedAt: Date.now() }
    await tavern.saveLorebook(next)
    setDraft(next)
    setNotice('世界书已保存到本地')
  }
  const create = () => {
    const next = createDefaultLorebook(`新世界书 ${tavern.lorebooks.length + 1}`)
    const first = createDefaultEntry()
    next.entries = [first]
    setSelectedId(next.id)
    setDraft(next)
    setEntryId(first.id)
  }
  const commitDelete = async () => {
    if (!pendingDelete || !draft) return
    if (pendingDelete.kind === 'book') {
      await tavern.deleteLorebook(pendingDelete.id)
      const next = tavern.lorebooks.find((book) => book.id !== pendingDelete.id)
      setSelectedId(next?.id ?? null)
      setDraft(next ? structuredClone(next) : null)
    } else {
      const next = removeEntry(draft, pendingDelete.id)
      setDraft(next)
      setEntryId(next.entries[0]?.id ?? null)
    }
    setPendingDelete(null)
  }
  const toggleActive = async (bookId: string) => {
    const next = active.has(bookId) ? [...active].filter((id) => id !== bookId) : [...active, bookId]
    await tavern.updateSettings({ activeLorebookIds: next })
  }
  const importBook = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const imported = importLorebook(JSON.parse(await file.text()))
      const now = Date.now()
      const next: Lorebook = { ...imported, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      await tavern.saveLorebook(next)
      setSelectedId(next.id)
      setDraft(next)
      setEntryId(next.entries[0]?.id ?? null)
      const warnings = getLorebookCompatibilityWarnings(next)
      setNotice(`已导入世界书“${next.name}”${warnings.length ? `；以下字段会原样保留但当前运行时不会执行：${warnings.join('、')}` : ''}`)
    } catch (caught) {
      setNotice(`导入失败：${caught instanceof Error ? caught.message : '请选择有效的 SillyTavern 世界书 JSON。'}`)
    }
  }
  const exportBook = () => {
    if (!draft) return
    exportToJson(exportLorebook(draft), `${draft.name || '世界书'}.json`)
    setNotice(`已导出“${draft.name}”`)
  }

  return <section className="tavern-panel lorebook-panel" aria-labelledby="lorebook-panel-title">
    <header className="tavern-panel-heading"><div><span>WORLD INFORMATION</span><h3 id="lorebook-panel-title">世界书</h3><p>关键词触发、递归扫描与注入位置均兼容 SillyTavern 数据结构。</p></div><div className="panel-heading-actions"><button id="lorebook-import-open" type="button" aria-label="导入世界书" onClick={() => document.getElementById('lorebook-import-file')?.click()}><GameIcon name="upload" size={17} />导入</button><input id="lorebook-import-file" className="tavern-file-input" type="file" accept=".json,application/json" aria-label="选择世界书 JSON" onChange={(event) => void importBook(event)} /><button id="lorebook-export" type="button" aria-label="导出当前世界书" disabled={!draft} onClick={exportBook}><GameIcon name="save" size={17} />导出</button><button id="lorebook-create" type="button" onClick={create}><GameIcon name="book" size={17} />新建世界书</button><button id="lorebook-save" className="primary-button" type="button" disabled={!dirty} onClick={() => void save()}><GameIcon name="upload" size={17} />保存修改</button></div></header>
    {notice && <div className="tavern-panel-notice" role="status">{notice}</div>}
    <div className="tavern-master-detail">
      <aside className="tavern-master-list" aria-label="世界书列表"><div className="master-list-summary"><strong>{tavern.lorebooks.length}</strong><span>册本地世界书</span></div>{tavern.lorebooks.map((book) => <div key={book.id} className={`master-list-item ${book.id === selectedId ? 'is-active' : ''}`}><button id={`lorebook-select-${book.id}`} type="button" onClick={() => setSelectedId(book.id)}><span>{book.entries.length} 条</span><strong>{book.name}</strong><small>{book.description}</small></button><label title="挂载到会话"><input id={`lorebook-active-${book.id}`} type="checkbox" checked={active.has(book.id)} onChange={() => void toggleActive(book.id)} /><span>挂载</span></label></div>)}</aside>
      <div className="tavern-detail-editor">
        {!draft ? <div className="tavern-empty-state"><GameIcon name="book" size={28} /><strong>尚无世界书</strong><p>新建世界书后即可添加规则与人物记忆。</p></div> : <>
          <div className="editor-title-row"><label><span>世界书名称</span><input id={`lorebook-name-${draft.id}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="wide"><span>用途说明</span><input id={`lorebook-description-${draft.id}`} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><button id={`lorebook-delete-${draft.id}`} className="danger-ghost" type="button" onClick={() => setPendingDelete({ kind: 'book', id: draft.id })}><GameIcon name="trash" size={16} />删除</button></div>
          <div className="entry-workbench"><nav aria-label="世界书条目"><button id={`lorebook-entry-create-${draft.id}`} className="entry-create" type="button" onClick={() => { const next = createDefaultEntry(); setDraft({ ...draft, entries: [...draft.entries, next], updatedAt: Date.now() }); setEntryId(next.id) }}>新增条目</button>{draft.entries.map((entry) => <div key={entry.id} className={entry.id === entryId ? 'is-active' : ''}><button id={`lorebook-entry-select-${entry.id}`} type="button" onClick={() => setEntryId(entry.id)}><span>{String(entry.order).padStart(3, '0')}</span><strong>{labelForEntry(entry)}</strong><small>{entry.keys.join(' · ') || '常驻/无关键词'}</small></button><button id={`lorebook-entry-delete-${entry.id}`} className="entry-delete" type="button" aria-label={`删除条目${labelForEntry(entry)}`} onClick={() => setPendingDelete({ kind: 'entry', id: entry.id })}><GameIcon name="trash" size={14} /></button></div>)}</nav><main>{selectedEntry ? <EntryForm value={selectedEntry} onChange={(patch) => setDraft(updateEntry(draft, selectedEntry.id, patch))} /> : <div className="tavern-empty-state"><strong>选择一个条目开始编辑</strong></div>}</main></div>
          <footer className="editor-options"><label><input id={`lorebook-recursive-${draft.id}`} type="checkbox" checked={draft.recursiveScanning} onChange={(event) => setDraft({ ...draft, recursiveScanning: event.target.checked })} />递归扫描</label><label><input id={`lorebook-case-${draft.id}`} type="checkbox" checked={draft.caseSensitive} onChange={(event) => setDraft({ ...draft, caseSensitive: event.target.checked })} />区分大小写</label><label><input id={`lorebook-whole-${draft.id}`} type="checkbox" checked={draft.matchWholeWords} onChange={(event) => setDraft({ ...draft, matchWholeWords: event.target.checked })} />全词匹配</label></footer>
        </>}
      </div>
    </div>
    {pendingDelete && <div className="tavern-confirm-bar" role="alertdialog" aria-labelledby="lorebook-delete-confirm"><GameIcon name="warning" size={20} /><div><strong id="lorebook-delete-confirm">确认删除？</strong><p>{pendingDelete.kind === 'book' ? '整册世界书将从本地存储移除。' : '该条目将从当前草稿移除，保存后生效。'}</p></div><button id="lorebook-delete-cancel" type="button" onClick={() => setPendingDelete(null)}>取消</button><button id="lorebook-delete-commit" className="danger-button" type="button" onClick={() => void commitDelete()}>确认删除</button></div>}
  </section>
}
