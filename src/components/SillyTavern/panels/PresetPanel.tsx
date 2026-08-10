import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import { createDefaultPreset } from '../../../sillytavern/types'
import type { ChatPreset } from '../../../sillytavern/types'
import { exportPreset, exportToJson, importPreset } from '../../../sillytavern/importer'
import {
  getPresetPromptDefinitions,
  getPresetPromptOrder,
  updatePresetPrompt,
  updatePresetPromptOrder,
} from '../../../sillytavern/preset-compat'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'
import { PromptOrderEditor } from '../editors/PromptOrderEditor'

const textSetting = (preset: ChatPreset, key: string) => typeof preset.settings[key] === 'string' ? preset.settings[key] as string : ''

export function PresetPanel() {
  const tavern = useTavern()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const original = tavern.presets.find((preset) => preset.id === selectedId) ?? null
  const [draft, setDraft] = useState<ChatPreset | null>(null)
  const [pendingDelete, setPendingDelete] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => { if (!selectedId && tavern.presets[0]) setSelectedId(tavern.presets[0].id) }, [selectedId, tavern.presets])
  useEffect(() => {
    if (!original) return
    const next = structuredClone(original)
    setDraft(next)
  }, [original?.id])

  const dirty = useMemo(() => !!draft && (!original || JSON.stringify(draft) !== JSON.stringify(original)), [draft, original])
  const selectedOrder = useMemo(() => draft ? getPresetPromptOrder(draft.settings) : { characterId: null, items: [] }, [draft])
  const prompts = useMemo(() => draft ? getPresetPromptDefinitions(draft.settings) : [], [draft])
  const mainPrompt = prompts.find((prompt) => prompt.identifier === 'main')
  const scenarioPrompt = prompts.find((prompt) => prompt.identifier === 'scenario')
  const directMain = draft ? textSetting(draft, 'main') : ''
  const directScenario = draft ? textSetting(draft, 'scenario') : ''
  const patch = (settings: Record<string, unknown>) => draft && setDraft({ ...draft, settings: { ...draft.settings, ...settings }, updatedAt: Date.now() })
  const replaceSettings = (settings: Record<string, unknown>) => draft && setDraft({ ...draft, settings, updatedAt: Date.now() })

  const create = () => {
    const now = Date.now()
    const seed = createDefaultPreset()
    const next = { ...seed, id: crypto.randomUUID(), name: `叙事预设 ${tavern.presets.length + 1}`, createdAt: now, updatedAt: now }
    setSelectedId(next.id)
    setDraft(next)
  }
  const save = async () => {
    if (!draft) return
    await tavern.savePreset({ ...draft, updatedAt: Date.now() })
    setNotice('预设已保存到本机酒馆档案')
  }
  const remove = async () => {
    if (!draft) return
    await tavern.deletePreset(draft.id)
    setPendingDelete(false)
    setSelectedId(tavern.presets.find((preset) => preset.id !== draft.id)?.id ?? null)
  }
  const importPresetFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const fallbackName = file.name.replace(/\.json$/i, '') || '导入的预设'
      const source = JSON.parse((await file.text()).replace(/^\uFEFF/, ''))
      const imported = importPreset(source, fallbackName)
      const now = Date.now()
      const next: ChatPreset = { ...imported, id: crypto.randomUUID(), createdAt: now, updatedAt: now }
      const order = getPresetPromptOrder(next.settings)
      await tavern.savePreset(next)
      setSelectedId(next.id)
      setDraft(next)
      setNotice(`已导入“${next.name}”：${order.items.length} 个顺序项，${order.items.filter((item) => item.enabled !== false).length} 个已启用`)
    } catch (error) {
      const message = error instanceof Error ? error.message : '文件内容无法解析'
      setNotice(`导入失败：${message}`)
    }
  }
  const exportPresetFile = () => {
    if (!draft) return
    exportToJson(exportPreset(draft), `${draft.name || '预设'}.json`)
    setNotice(`已导出“${draft.name}”`)
  }

  return <section className="tavern-panel preset-panel" aria-labelledby="preset-panel-title">
    <header className="tavern-panel-heading"><div><span>PROMPT PRESETS</span><h3 id="preset-panel-title">预设</h3><p>定义角色、世界信息和聊天历史进入模型上下文的顺序。</p></div><div className="panel-heading-actions"><button id="preset-import-open" type="button" aria-label="导入预设" onClick={() => document.getElementById('preset-import-file')?.click()}><GameIcon name="upload" size={17} />导入</button><input id="preset-import-file" className="tavern-file-input" type="file" accept=".json,application/json" aria-label="选择预设 JSON" onChange={(event) => void importPresetFile(event)} /><button id="preset-export" type="button" aria-label="导出当前预设" disabled={!draft} onClick={exportPresetFile}><GameIcon name="save" size={17} />导出</button><button id="preset-create" type="button" onClick={create}>新建预设</button><button id="preset-save" className="primary-button" type="button" disabled={!dirty} onClick={() => void save()}><GameIcon name="upload" size={17} />保存</button></div></header>
    {notice && <div className="tavern-panel-notice" role="status">{notice}</div>}
    <div className="preset-workspace"><aside className="tavern-master-list" aria-label="预设列表">{tavern.presets.map((preset) => <div key={preset.id} className={`master-list-item ${preset.id === selectedId ? 'is-active' : ''}`}><button id={`preset-select-${preset.id}`} type="button" onClick={() => setSelectedId(preset.id)}><span>{tavern.settings?.activePresetId === preset.id ? '已启用' : '本地'}</span><strong>{preset.name}</strong><small>{preset.description}</small></button></div>)}</aside>
      <main className="preset-editor">{draft ? <><div className="editor-title-row"><label><span>预设名称</span><input id={`preset-name-${draft.id}`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label className="wide"><span>用途说明</span><input id={`preset-description-${draft.id}`} value={draft.description ?? ''} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><button id={`preset-activate-${draft.id}`} type="button" disabled={tavern.settings?.activePresetId === draft.id} onClick={() => void tavern.updateSettings({ activePresetId: draft.id })}>{tavern.settings?.activePresetId === draft.id ? '当前预设' : '设为当前'}</button><button id={`preset-delete-${draft.id}`} className="danger-ghost" type="button" onClick={() => setPendingDelete(true)}><GameIcon name="trash" size={15} />删除</button></div>
        <section className="preset-generation-settings" aria-labelledby={`preset-generation-title-${draft.id}`}><header><div><span>GENERATION PROFILE</span><h4 id={`preset-generation-title-${draft.id}`}>预设生成参数</h4></div><p>有值时覆盖接口页同名参数，并真实写入供应商请求；留空则继续使用接口页设置。</p></header><div>{[
          ['temperature', '温度', 0, 2, 0.01],
          ['top_p', 'Top P', 0, 1, 0.01],
          ['frequency_penalty', '频率惩罚', -2, 2, 0.01],
          ['presence_penalty', '存在惩罚', -2, 2, 0.01],
          ['openai_max_context', '上下文长度', 2, undefined, 1],
          ['openai_max_tokens', '最大回复长度', 1, undefined, 1],
        ].map(([key, label, min, max, step]) => <label key={String(key)}><span>{label}</span><input id={`preset-generation-${String(key)}-${draft.id}`} aria-label={`预设${label}`} type="text" inputMode={Number(min) < 0 || Number(step) < 1 ? 'decimal' : 'numeric'} data-min={min} data-max={max} data-step={step} value={typeof draft.settings[String(key)] === 'number' || typeof draft.settings[String(key)] === 'string' ? String(draft.settings[String(key)]) : ''} placeholder="使用接口设置" onChange={(event) => patch({ [String(key)]: event.target.value || undefined })} onBlur={(event) => { const value = Number(event.target.value); if (event.target.value.trim() && Number.isFinite(value)) patch({ [String(key)]: value }) }} /></label>)}<label className="preset-stream-setting"><input id={`preset-generation-stream-${draft.id}`} type="checkbox" checked={typeof draft.settings.stream_openai === 'boolean' ? draft.settings.stream_openai : tavern.settings?.api.streaming ?? true} onChange={(event) => patch({ stream_openai: event.target.checked })} /><span>流式传输</span></label></div></section>
        <div className="preset-copy-grid"><label><span>主叙事规则</span><textarea id={`preset-main-${draft.id}`} rows={5} value={directMain || mainPrompt?.content || ''} onChange={(event) => directMain || !mainPrompt ? patch({ main: event.target.value }) : replaceSettings(updatePresetPrompt(draft.settings, 'main', { content: event.target.value }))} /></label><label><span>场景格式</span><textarea id={`preset-scenario-${draft.id}`} rows={5} value={directScenario || scenarioPrompt?.content || ''} onChange={(event) => directScenario || !scenarioPrompt ? patch({ scenario: event.target.value }) : replaceSettings(updatePresetPrompt(draft.settings, 'scenario', { content: event.target.value }))} /></label></div>
        <div className="prompt-order-section"><header><div><span>PROMPT ORDER</span><h4>上下文装配顺序</h4></div><div className="prompt-order-slot-tools"><small>自动使用默认顺序组；关闭项目会保留其位置与正文，其他分组也会在导出时完整保留。</small></div></header><PromptOrderEditor
          value={selectedOrder.items}
          prompts={prompts}
          onChange={(items) => replaceSettings(updatePresetPromptOrder(draft.settings, selectedOrder.characterId, items))}
          onPromptChange={(identifier, promptPatch) => replaceSettings(updatePresetPrompt(draft.settings, identifier, promptPatch))}
        /></div>
      </> : <div className="tavern-empty-state"><strong>选择或新建一个预设</strong></div>}</main></div>
    {pendingDelete && <div className="tavern-confirm-bar" role="alertdialog" aria-labelledby="preset-delete-confirm"><GameIcon name="warning" size={20} /><div><strong id="preset-delete-confirm">删除“{draft?.name}”？</strong><p>已保存的会话不会删除，但会改用其他可用预设。</p></div><button id="preset-delete-cancel" type="button" onClick={() => setPendingDelete(false)}>取消</button><button id="preset-delete-commit" className="danger-button" type="button" onClick={() => void remove()}>确认删除</button></div>}
  </section>
}
