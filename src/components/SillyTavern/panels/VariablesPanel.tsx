import { useEffect, useRef, useState } from 'react'
import { useGame } from '../../../game/GameContext'
import { exportToJson } from '../../../sillytavern/importer'
import type { TavernVariableDefinition, TavernVariableScope, TavernVariableType } from '../../../sillytavern/types'
import {
  coerceVariableValue,
  inferVariableDefinitions,
  parseVariableDefinitions,
  variableDefinitionsToRecord,
} from '../../../sillytavern/variable-definitions'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'

function createDefinition(
  key: string,
  type: TavernVariableType,
  scope: TavernVariableScope,
  rawValue: string,
): TavernVariableDefinition {
  return { key, label: key, type, scope, value: coerceVariableValue(type, rawValue), description: '' }
}

export function VariablesPanel() {
  const { state } = useGame()
  const tavern = useTavern()
  const session = tavern.activeSession ?? tavern.sessions[0] ?? null
  const [definitions, setDefinitions] = useState<TavernVariableDefinition[]>([])
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [newType, setNewType] = useState<TavernVariableType>('string')
  const [newScope, setNewScope] = useState<TavernVariableScope>('session')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const globalDefinitions = tavern.settings?.globalVariables ?? []
    const sessionDefinitions = session?.variableDefinitions
      ?? inferVariableDefinitions(session?.variables ?? {}, 'session')
    setDefinitions(structuredClone([...globalDefinitions, ...sessionDefinitions]))
  }, [session?.id, session?.updatedAt, tavern.settings?.updatedAt, tavern.settings?.globalVariables])

  const save = async () => {
    try {
      const normalized = parseVariableDefinitions(definitions)
      const globalVariables = normalized.filter((definition) => definition.scope === 'global')
      const sessionVariables = normalized.filter((definition) => definition.scope === 'session')
      await tavern.updateSettings({ globalVariables })
      if (session) {
        await tavern.saveSession({
          ...session,
          variableDefinitions: sessionVariables,
          variables: variableDefinitionsToRecord(sessionVariables),
          updatedAt: Date.now(),
        })
      }
      setDefinitions(normalized)
      setError(null)
      setNotice('变量定义与作用域已保存。')
    } catch (caught) {
      setNotice(null)
      setError(caught instanceof Error ? caught.message : '变量保存失败。')
    }
  }

  const add = () => {
    const key = newKey.trim()
    if (!key || definitions.some((definition) => definition.key === key)) return
    try {
      const next = parseVariableDefinitions([...definitions, createDefinition(key, newType, newScope, newValue)])
      setDefinitions(next)
      setNewKey('')
      setNewValue('')
      setError(null)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '无法添加变量。')
    }
  }

  const patchDefinition = (key: string, patch: Partial<TavernVariableDefinition>) => {
    setDefinitions((current) => current.map((definition) => definition.key === key ? { ...definition, ...patch } : definition))
    setError(null)
  }

  const importVariables = async (file: File | undefined) => {
    if (!file) return
    try {
      const parsed = parseVariableDefinitions(JSON.parse(await file.text()))
      setDefinitions(parsed)
      setNotice(`已载入 ${parsed.length} 个变量；点击“保存变量”后写入档案。`)
      setError(null)
    } catch (caught) {
      setNotice(null)
      setError(caught instanceof Error ? caught.message : '变量 JSON 导入失败。')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const mirrors = [
    { label: '金币', value: state.money },
    { label: '精力', value: `${state.energy}/${state.maxEnergy}` },
    { label: '生命', value: `${state.stats.health}/${state.stats.maxHealth}` },
    { label: '魔力', value: `${state.stats.mana}/${state.stats.maxMana}` },
    { label: '日期', value: `${state.season} · 第${state.day}日` },
    { label: '地点', value: state.location },
  ]

  return <section className="tavern-panel variables-panel" aria-labelledby="variables-panel-title">
    <header className="tavern-panel-heading">
      <div><span>VARIABLE CENTER</span><h3 id="variables-panel-title">变量中心</h3><p>管理宏可读取的类型化变量；全局变量跨角色生效，会话变量仅属于当前会话。</p></div>
      <div className="panel-heading-actions">
        <input ref={fileRef} id="variables-import-file" className="sr-only" type="file" accept="application/json,.json" aria-label="选择变量 JSON" onChange={(event) => void importVariables(event.target.files?.[0])} />
        <button id="variables-import" type="button" onClick={() => fileRef.current?.click()}><GameIcon name="upload" size={16} />导入变量 JSON</button>
        <button id="variables-export" type="button" onClick={() => exportToJson({ version: 1, variables: definitions }, 'mistvale-variables.json')}><GameIcon name="download" size={16} />导出变量 JSON</button>
        <button id="variables-save" className="primary-button" type="button" onClick={() => void save()}><GameIcon name="save" size={16} />保存变量</button>
      </div>
    </header>

    {(notice || error) && <div className={`tavern-inline-notice ${error ? 'is-error' : ''}`} role={error ? 'alert' : 'status'}>{error ?? notice}</div>}

    <div className="variables-bento">
      <article className="game-mirror">
        <header><GameIcon name="crosshair" size={19} /><div><span>READ ONLY</span><h4>游戏状态镜像</h4></div></header>
        <dl>{mirrors.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
        <p>这些值由游戏状态实时注入提示词，只读且不会被变量导入覆盖。</p>
      </article>

      <article className="session-variables variable-center-editor">
        <header><div><span>TYPED SCOPES</span><h4>{session ? session.name : '全局变量档案'}</h4></div><small>{definitions.length} 个变量</small></header>
        <div className="variable-add-row typed-variable-add">
          <label><span>变量名</span><input id="variable-new-key" aria-label="新变量名称" value={newKey} onChange={(event) => setNewKey(event.target.value)} /></label>
          <label><span>类型</span><select id="variable-new-type" aria-label="新变量类型" value={newType} onChange={(event) => setNewType(event.target.value as TavernVariableType)}><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option></select></label>
          <label><span>作用域</span><select id="variable-new-scope" aria-label="新变量作用域" value={newScope} onChange={(event) => setNewScope(event.target.value as TavernVariableScope)}><option value="session">会话</option><option value="global">全局</option></select></label>
          <label><span>初始值</span><input id="variable-new-value" aria-label="新变量初始值" value={newValue} onChange={(event) => setNewValue(event.target.value)} /></label>
          <button id="variable-add" type="button" disabled={!newKey.trim() || definitions.some((definition) => definition.key === newKey.trim()) || (newScope === 'session' && !session)} onClick={add}>添加变量</button>
        </div>

        <div className="typed-variable-list" aria-label="变量定义列表">
          {definitions.map((definition) => <article className="typed-variable-card" key={`${definition.scope}-${definition.key}`}>
            <header><code>{definition.key}</code><span className={`variable-scope-badge is-${definition.scope}`}>{definition.scope === 'global' ? '全局' : '会话'}</span></header>
            <div className="typed-variable-fields">
              <label><span>显示名称</span><input id={`variable-label-${definition.scope}-${definition.key}`} value={definition.label} onChange={(event) => patchDefinition(definition.key, { label: event.target.value })} /></label>
              <label><span>类型</span><select id={`variable-type-${definition.scope}-${definition.key}`} value={definition.type} onChange={(event) => {
                const type = event.target.value as TavernVariableType
                patchDefinition(definition.key, { type, value: type === 'number' ? 0 : type === 'boolean' ? false : String(definition.value), min: undefined, max: undefined })
              }}><option value="string">文本</option><option value="number">数字</option><option value="boolean">布尔</option></select></label>
              <label><span>当前值</span>{definition.type === 'boolean'
                ? <select id={`variable-value-${definition.scope}-${definition.key}`} aria-label={`${definition.key}的值`} value={String(definition.value)} onChange={(event) => patchDefinition(definition.key, { value: event.target.value === 'true' })}><option value="true">true</option><option value="false">false</option></select>
                : <input id={`variable-value-${definition.scope}-${definition.key}`} aria-label={`${definition.key}的值`} type={definition.type === 'number' ? 'number' : 'text'} value={String(definition.value)} min={definition.min} max={definition.max} onChange={(event) => patchDefinition(definition.key, { value: definition.type === 'number' ? Number(event.target.value) : event.target.value })} />}</label>
              <label><span>作用域</span><select id={`variable-scope-${definition.scope}-${definition.key}`} value={definition.scope} onChange={(event) => patchDefinition(definition.key, { scope: event.target.value as TavernVariableScope })}><option value="session" disabled={!session}>会话</option><option value="global">全局</option></select></label>
              {definition.type === 'number' && <><label><span>最小值</span><input id={`variable-min-${definition.scope}-${definition.key}`} type="number" value={definition.min ?? ''} onChange={(event) => patchDefinition(definition.key, { min: event.target.value === '' ? undefined : Number(event.target.value) })} /></label><label><span>最大值</span><input id={`variable-max-${definition.scope}-${definition.key}`} type="number" value={definition.max ?? ''} onChange={(event) => patchDefinition(definition.key, { max: event.target.value === '' ? undefined : Number(event.target.value) })} /></label></>}
            </div>
            <button id={`variable-delete-${definition.scope}-${definition.key}`} className="variable-card-delete" type="button" aria-label={`删除变量${definition.key}`} onClick={() => setDefinitions((current) => current.filter((item) => item !== definition))}><GameIcon name="trash" size={15} />删除</button>
          </article>)}
          {!definitions.length && <div className="tavern-empty-state"><GameIcon name="variables" size={26} /><strong>尚未定义酒馆变量</strong><p>可创建全局变量，或在建立 NPC 会话后创建会话变量。</p></div>}
        </div>
      </article>
    </div>
  </section>
}
