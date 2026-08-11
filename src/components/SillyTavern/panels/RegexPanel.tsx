import { useEffect, useMemo, useRef, useState } from 'react'
import { exportToJson } from '../../../sillytavern/importer'
import { applyRegexScripts, exportRegexScripts, getPresetRegexScripts, parseRegexScripts, putPresetRegexScripts } from '../../../sillytavern/regex-engine'
import type { TavernRegexScope, TavernRegexScript, TavernRegexStage, TavernRegexTarget } from '../../../sillytavern/types'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'

function createScript(index: number): TavernRegexScript {
  return {
    id: crypto.randomUUID(),
    name: `正则脚本 ${index + 1}`,
    enabled: true,
    pattern: '/文本/g',
    replacement: '',
    trimStrings: [],
    stages: ['output'],
    targets: ['assistant'],
    scope: 'global',
    order: index,
  }
}

export function RegexPanel() {
  const tavern = useTavern()
  const activePreset = tavern.presets.find((preset) => preset.id === tavern.settings?.activePresetId) ?? tavern.presets[0] ?? null
  const [scripts, setScripts] = useState<TavernRegexScript[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [testInput, setTestInput] = useState('')
  const [testStage, setTestStage] = useState<TavernRegexStage>('output')
  const [testTarget, setTestTarget] = useState<TavernRegexTarget>('assistant')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const combined = [
      ...(tavern.settings?.regexScripts ?? []),
      ...(activePreset ? getPresetRegexScripts(activePreset.settings) : []),
    ]
    setScripts(structuredClone(combined))
    setSelectedId((current) => combined.some((script) => script.id === current) ? current : combined[0]?.id ?? null)
  }, [tavern.settings?.updatedAt, tavern.settings?.regexScripts, activePreset?.id, activePreset?.updatedAt])

  const selected = scripts.find((script) => script.id === selectedId) ?? null
  const patchSelected = (patch: Partial<TavernRegexScript>) => {
    if (!selectedId) return
    setScripts((current) => current.map((script) => script.id === selectedId ? { ...script, ...patch } : script))
    setError(null)
  }

  const testResult = useMemo(() => applyRegexScripts(testInput, scripts, {
    stage: testStage,
    target: testTarget,
    depth: 0,
    macroContext: { userName: '旅行者', characterName: '角色', original: testInput },
    variables: Object.fromEntries((tavern.settings?.globalVariables ?? []).map((definition) => [definition.key, definition.value])),
  }), [scripts, tavern.settings?.globalVariables, testInput, testStage, testTarget])

  const create = () => {
    const script = createScript(scripts.length)
    setScripts((current) => [...current, script])
    setSelectedId(script.id)
  }

  const save = async () => {
    try {
      const normalized = parseRegexScripts(scripts, 'global', { validatePatterns: true })
      const globalScripts = normalized.filter((script) => script.scope === 'global')
      const presetScripts = normalized.filter((script) => script.scope === 'preset')
      await tavern.updateSettings({ regexScripts: globalScripts })
      if (activePreset) await tavern.savePreset({ ...activePreset, settings: putPresetRegexScripts(activePreset.settings, presetScripts), updatedAt: Date.now() })
      setScripts(normalized)
      setNotice('全局与当前预设的正则脚本已保存。')
      setError(null)
    } catch (caught) {
      setNotice(null)
      setError(caught instanceof Error ? caught.message : '正则脚本保存失败。')
    }
  }

  const importScripts = async (file: File | undefined) => {
    if (!file) return
    try {
      const source = JSON.parse((await file.text()).replace(/^\uFEFF/, '')) as unknown
      const raw = source && typeof source === 'object' && !Array.isArray(source)
        ? ((source as Record<string, unknown>).regex_scripts
          ?? ((source as Record<string, unknown>).extensions as Record<string, unknown> | undefined)?.regex_scripts
          ?? source)
        : source
      const imported = parseRegexScripts(raw, 'global', { validatePatterns: true })
      setScripts(imported)
      setSelectedId(imported[0]?.id ?? null)
      setNotice(`已载入 ${imported.length} 条正则脚本；保存后生效。`)
      setError(null)
    } catch (caught) {
      setNotice(null)
      setError(caught instanceof Error ? caught.message : '正则 JSON 导入失败。')
    } finally {
      if (importRef.current) importRef.current.value = ''
    }
  }

  const toggleStage = (stage: TavernRegexStage) => patchSelected({
    stages: selected?.stages.includes(stage) ? selected.stages.filter((item) => item !== stage) : [...(selected?.stages ?? []), stage],
  })
  const toggleTarget = (target: TavernRegexTarget) => patchSelected({
    targets: selected?.targets.includes(target) ? selected.targets.filter((item) => item !== target) : [...(selected?.targets ?? []), target],
  })

  return <section className="tavern-panel regex-panel" aria-labelledby="regex-panel-title">
    <header className="tavern-panel-heading">
      <div><span>REGEX CENTER</span><h3 id="regex-panel-title">正则中心</h3><p>分阶段处理玩家输入、模型输出与显示文本；兼容 SillyTavern regex_scripts。</p></div>
      <div className="panel-heading-actions">
        <input ref={importRef} id="regex-import-file" className="sr-only" type="file" accept="application/json,.json" aria-label="选择正则 JSON" onChange={(event) => void importScripts(event.target.files?.[0])} />
        <button id="regex-import" type="button" onClick={() => importRef.current?.click()}><GameIcon name="upload" size={16} />导入正则 JSON</button>
        <button id="regex-export" type="button" onClick={() => exportToJson({ regex_scripts: exportRegexScripts(scripts) }, 'mistvale-regex-scripts.json')}><GameIcon name="download" size={16} />导出正则 JSON</button>
        <button id="regex-create" type="button" onClick={create}>新建正则脚本</button>
        <button id="regex-save" className="primary-button" type="button" onClick={() => void save()}><GameIcon name="save" size={16} />保存正则</button>
      </div>
    </header>
    {(notice || error) && <div className={`tavern-inline-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error ?? notice}</div>}

    <div className="regex-workspace">
      <aside className="regex-script-list" aria-label="正则脚本列表">
        {scripts.map((script) => <button id={`regex-select-${script.id}`} className={script.id === selectedId ? 'is-active' : ''} type="button" key={script.id} onClick={() => setSelectedId(script.id)}><span>{script.scope === 'global' ? '全局' : '预设'} · {script.enabled ? '启用' : '停用'}</span><strong>{script.name}</strong><code>{script.pattern}</code></button>)}
        {!scripts.length && <div className="tavern-empty-state"><GameIcon name="regex" size={26} /><strong>尚无正则脚本</strong><p>可新建脚本或导入 SillyTavern JSON。</p></div>}
      </aside>

      <main className="regex-editor">
        {selected ? <>
          <div className="regex-editor-grid">
            <label><span>脚本名称</span><input id={`regex-name-${selected.id}`} value={selected.name} onChange={(event) => patchSelected({ name: event.target.value })} /></label>
            <label><span>来源</span><select id={`regex-scope-${selected.id}`} value={selected.scope} onChange={(event) => patchSelected({ scope: event.target.value as TavernRegexScope })}><option value="global">全局</option><option value="preset" disabled={!activePreset}>当前预设</option></select></label>
            <label className="switch-field"><input id={`regex-enabled-${selected.id}`} type="checkbox" checked={selected.enabled} onChange={(event) => patchSelected({ enabled: event.target.checked })} /><span>启用脚本</span></label>
            <label className="wide"><span>正则表达式</span><input id={`regex-pattern-${selected.id}`} aria-label="正则表达式" value={selected.pattern} onChange={(event) => patchSelected({ pattern: event.target.value })} spellCheck={false} /></label>
            <label className="wide"><span>替换文本</span><textarea id={`regex-replacement-${selected.id}`} aria-label="替换文本" rows={3} value={selected.replacement} onChange={(event) => patchSelected({ replacement: event.target.value })} /></label>
            <label className="wide"><span>移除字符串（每行一项）</span><textarea id={`regex-trim-${selected.id}`} rows={2} value={selected.trimStrings.join('\n')} onChange={(event) => patchSelected({ trimStrings: event.target.value.split('\n').filter(Boolean) })} /></label>
          </div>
          <fieldset className="regex-check-grid"><legend>执行阶段</legend>{(['prompt', 'output', 'display'] as TavernRegexStage[]).map((stage) => <label key={stage}><input type="checkbox" checked={selected.stages.includes(stage)} onChange={() => toggleStage(stage)} /><span>{stage === 'prompt' ? '发送前' : stage === 'output' ? '模型输出' : '界面显示'}</span></label>)}</fieldset>
          <fieldset className="regex-check-grid"><legend>处理对象</legend>{(['user', 'assistant'] as TavernRegexTarget[]).map((target) => <label key={target}><input type="checkbox" checked={selected.targets.includes(target)} onChange={() => toggleTarget(target)} /><span>{target === 'user' ? '玩家文本' : '模型文本'}</span></label>)}</fieldset>
          <button id={`regex-delete-${selected.id}`} className="danger-ghost" type="button" onClick={() => { setScripts((current) => current.filter((script) => script.id !== selected.id)); setSelectedId(scripts.find((script) => script.id !== selected.id)?.id ?? null) }}><GameIcon name="trash" size={15} />删除此脚本</button>
        </> : <div className="tavern-empty-state"><strong>选择或新建正则脚本</strong></div>}
      </main>

      <aside className="regex-tester" aria-labelledby="regex-tester-title">
        <header><span>DRY RUN</span><h4 id="regex-tester-title">即时测试</h4></header>
        <div className="regex-test-controls"><label><span>阶段</span><select id="regex-test-stage" value={testStage} onChange={(event) => setTestStage(event.target.value as TavernRegexStage)}><option value="prompt">发送前</option><option value="output">模型输出</option><option value="display">界面显示</option></select></label><label><span>对象</span><select id="regex-test-target" value={testTarget} onChange={(event) => setTestTarget(event.target.value as TavernRegexTarget)}><option value="user">玩家</option><option value="assistant">模型</option></select></label></div>
        <label><span>测试输入</span><textarea id="regex-test-input" aria-label="正则测试输入" rows={7} value={testInput} onChange={(event) => setTestInput(event.target.value)} /></label>
        <label><span>测试输出</span><textarea id="regex-test-output" aria-label="正则测试输出" rows={7} value={testResult.text} readOnly /></label>
        <div className="regex-test-summary"><span>{testResult.matches.length} 条脚本命中</span><span>{testResult.errors.length} 个错误</span></div>
        {testResult.errors.map((item) => <p className="field-error" key={item.scriptId}>{item.scriptName}：{item.message}</p>)}
      </aside>
    </div>
  </section>
}
