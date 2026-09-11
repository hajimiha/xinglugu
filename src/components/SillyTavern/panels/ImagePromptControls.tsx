import { useEffect, useRef, useState } from 'react'
import { testTavernApiConnection } from '../../../sillytavern/api-adapter'
import { validateTavernApiConfig } from '../../../sillytavern/api-config'
import { getTavernProvider, TAVERN_PROVIDERS } from '../../../sillytavern/provider-registry'
import { createImageLlmEntry, exportImageLlmPreset, importImageLlmPresets } from '../../../sillytavern/image-generation/llm-presets'
import { clearImagePromptCredential, resolveImagePromptCredential } from '../../../sillytavern/image-generation/credentials'
import type { ImageGenerationSettings, ImageLlmEntry, ImagePromptApiSettings } from '../../../sillytavern/image-generation/types'

type Prompt = ImageGenerationSettings['prompt']

export function ImagePromptControls({ prompt, onChange: onCommit, apiKey, onKeyChange }: {
  prompt: Prompt
  onChange(prompt: Prompt): void
  apiKey: string
  onKeyChange(value: string): void
}) {
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState(false)
  const [testing, setTesting] = useState(false)
  const [models, setModels] = useState<string[]>([])
  const [showKey, setShowKey] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const latestPrompt = useRef(prompt)
  latestPrompt.current = prompt
  const onChange = (next: Prompt) => { latestPrompt.current = next; onCommit(next) }
  const api = prompt.api
  const provider = getTavernProvider(api.provider)
  const active = prompt.llmPresets.find((preset) => preset.id === prompt.activeLlmPresetId) ?? prompt.llmPresets[0]
  const signature = JSON.stringify([api.enabled, api.provider, api.baseUrl, api.providerOptions, apiKey])

  useEffect(() => {
    requestRef.current?.abort()
    setModels([])
    setTesting(false)
    setNotice('')
    return () => requestRef.current?.abort()
  }, [signature])

  const patchApi = (patch: Partial<ImagePromptApiSettings>) => {
    if (patch.provider !== undefined || patch.baseUrl !== undefined) {
      onKeyChange('')
      setShowKey(false)
    }
    onChange({ ...prompt, api: { ...api, ...patch } })
  }
  const patchEntry = (id: string, patch: Partial<ImageLlmEntry>) => onChange({ ...prompt, llmPresets: prompt.llmPresets.map((preset) => preset.id === active.id
    ? { ...preset, entries: preset.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry) } : preset) })
  const setEntries = (entries: ImageLlmEntry[]) => onChange({ ...prompt, llmPresets: prompt.llmPresets.map((preset) => preset.id === active.id ? { ...preset, entries } : preset) })
  const add = (copy = false) => {
    const id = crypto.randomUUID()
    onChange({ ...prompt, activeLlmPresetId: id, llmPresets: [...prompt.llmPresets, {
      id, name: copy ? `${active.name.slice(0, 75)} 副本` : `绘图提示词 ${prompt.llmPresets.length + 1}`,
      entries: copy ? active.entries.map((entry) => ({ ...entry, id: crypto.randomUUID() })) : [createImageLlmEntry(prompt.systemTemplate)],
    }] })
  }
  const importFile = async (file: File) => {
    try {
      if (!file.size || file.size > 1024 * 1024) throw new Error('请选择 1 MB 以内的 JSON 预设文件。')
      const presets = importImageLlmPresets(JSON.parse(await file.text()))
      const current = latestPrompt.current
      if (current.llmPresets.length + presets.length > 100) throw new Error('提示词预设总数不能超过 100。')
      onChange({ ...current, activeLlmPresetId: presets[0].id, llmPresets: [...current.llmPresets, ...presets] })
      setFailure(false)
      setNotice(`已导入 ${presets.length} 个提示词预设，保存绘图配置后生效。API 配置与密钥未导入。`)
    } catch (error) {
      setFailure(true)
      setNotice(error instanceof Error ? error.message : '提示词预设导入失败。')
    }
  }
  const exportFile = () => {
    try {
      const url = URL.createObjectURL(new Blob([exportImageLlmPreset(active)], { type: 'application/json' }))
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `${active.name.replace(/[\\/:*?"<>|]/g, '_') || '提示词预设'}.json`
      anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setFailure(true); setNotice(error instanceof Error ? error.message : '预设导出失败。') }
  }
  const connect = async () => {
    const errors = validateTavernApiConfig(api)
    // Model discovery must work before a model has been selected.
    if (provider.modelsPath) delete errors.model
    const key = apiKey.trim() || resolveImagePromptCredential(api)
    if (Object.keys(errors).length || !key) {
      setFailure(true); setNotice(Object.values(errors)[0] ?? '请填写提示词 API 密钥。'); return
    }
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setTesting(true); setFailure(false); setNotice('正在连接提示词接口……')
    try {
      const result = await testTavernApiConnection(api, key, (url, init) => fetch(url, { ...init, signal: controller.signal }))
      if (controller.signal.aborted) return
      setModels(result.models)
      setNotice(result.models.length ? `连接成功，可选择 ${result.models.length} 个提示词模型。` : '连接成功；该接口未返回模型列表，请手动填写模型名称。')
    } catch (error) {
      if (!controller.signal.aborted) { setFailure(true); setNotice(error instanceof Error ? error.message : '提示词接口连接失败。') }
    } finally { if (!controller.signal.aborted) setTesting(false) }
  }

  return <div className="image-prompt-controls">
    <p className="image-help">提示词预设决定 LLM 如何整理画面，与下方固定画风预设独立。支持 st-chatu8 上下文预设、请求类型包中的上下文预设，以及本项目导出的 JSON；仅导入文本条目，不导入接口密钥或执行脚本。</p>
    <p className="image-help">支持文本占位符：{'{{正文}}、{{上下文}}、{{用户需求}}、{{世界书触发}}、{{user}}、{{char}}、{{getvar::变量名}}'}。其他宿主宏保留为文本，不执行脚本、变量写入或原插件资产功能。Claude / Gemini / Cohere 请将 system 条目排在 user / assistant 条目之前。</p>
    <div className="image-preset-toolbar">
      <label htmlFor="image-llm-preset"><span>绘图提示词预设</span><select id="image-llm-preset" value={active.id} onChange={(event) => onChange({ ...prompt, activeLlmPresetId: event.target.value })}>{prompt.llmPresets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={prompt.llmPresets.length >= 100} onClick={() => add()}>新建提示词预设</button>
      <button type="button" className="secondary-button" disabled={prompt.llmPresets.length >= 100} onClick={() => add(true)}>复制提示词预设</button>
      <button type="button" className="secondary-button" onClick={() => importRef.current?.click()}>导入提示词预设</button>
      <input ref={importRef} type="file" className="visually-hidden" accept=".json,application/json" aria-label="选择提示词预设 JSON" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importFile(file); event.currentTarget.value = '' }} />
      <button type="button" className="secondary-button" onClick={exportFile}>导出提示词预设</button>
      <button type="button" className="danger-button" disabled={prompt.llmPresets.length <= 1} onClick={() => { const presets = prompt.llmPresets.filter((preset) => preset.id !== active.id); onChange({ ...prompt, llmPresets: presets, activeLlmPresetId: presets[0].id }) }}>删除提示词预设</button>
    </div>
    <label htmlFor="image-llm-preset-name"><span>提示词预设名称</span><input id="image-llm-preset-name" maxLength={80} value={active.name} onChange={(event) => onChange({ ...prompt, llmPresets: prompt.llmPresets.map((preset) => preset.id === active.id ? { ...preset, name: event.target.value } : preset) })} /></label>
    <div className="image-llm-entries">
      {active.entries.map((entry, index) => <details key={entry.id} className="image-llm-entry" open={active.entries.length === 1 ? true : undefined}>
        <summary>{index + 1}. {entry.name || '未命名条目'} · {entry.role}{!entry.enabled ? ' · 已停用' : ''}{entry.triggerMode === 'trigger' ? ' · 关键词触发' : ''}</summary>
        <div className="image-field-grid">
          <label><span>条目 {index + 1} 名称</span><input maxLength={80} value={entry.name} onChange={(event) => patchEntry(entry.id, { name: event.target.value })} /></label>
          <label><span>条目 {index + 1} 角色</span><select value={entry.role} onChange={(event) => patchEntry(entry.id, { role: event.target.value as ImageLlmEntry['role'] })}><option value="system">system · 系统</option><option value="user">user · 用户</option><option value="assistant">assistant · 示例回答</option></select></label>
          <label className="image-toggle"><input type="checkbox" checked={entry.enabled} onChange={(event) => patchEntry(entry.id, { enabled: event.target.checked })} /><span>启用条目 {index + 1}</span></label>
          <label><span>条目 {index + 1} 触发方式</span><select value={entry.triggerMode} onChange={(event) => patchEntry(entry.id, { triggerMode: event.target.value as ImageLlmEntry['triggerMode'] })}><option value="always">始终使用</option><option value="trigger">关键词触发</option></select></label>
          {entry.triggerMode === 'trigger' && <><label><span>触发词（英文逗号分隔，任一命中）</span><input maxLength={2000} value={entry.triggerWords} onChange={(event) => patchEntry(entry.id, { triggerWords: event.target.value })} /></label><label><span>同时满足的词组（可选，任一命中）</span><input maxLength={2000} value={entry.andTriggerWords} onChange={(event) => patchEntry(entry.id, { andTriggerWords: event.target.value })} /></label></>}
          <label className="is-wide"><span>条目 {index + 1} 内容</span><textarea rows={6} maxLength={100000} value={entry.content} onChange={(event) => patchEntry(entry.id, { content: event.target.value })} /></label>
        </div>
        <div className="image-entry-actions">
          <button type="button" className="secondary-button" disabled={index === 0} onClick={() => { const entries = [...active.entries]; [entries[index - 1], entries[index]] = [entries[index], entries[index - 1]]; setEntries(entries) }}>上移条目 {index + 1}</button>
          <button type="button" className="secondary-button" disabled={index === active.entries.length - 1} onClick={() => { const entries = [...active.entries]; [entries[index + 1], entries[index]] = [entries[index], entries[index + 1]]; setEntries(entries) }}>下移条目 {index + 1}</button>
          <button type="button" className="danger-button" disabled={active.entries.length <= 1} onClick={() => setEntries(active.entries.filter((item) => item.id !== entry.id))}>删除条目 {index + 1}</button>
        </div>
      </details>)}
      <button type="button" className="secondary-button" disabled={active.entries.length >= 200} onClick={() => setEntries([...active.entries, createImageLlmEntry()])}>新增提示词条目</button>
    </div>
    <label className="image-toggle" htmlFor="image-prompt-api-enabled"><input id="image-prompt-api-enabled" type="checkbox" checked={api.enabled} onChange={(event) => patchApi({ enabled: event.target.checked })} /><span><strong>启用绘图提示词独立 API</strong><small>关闭时使用正文 LLM、密钥与有效采样参数。开启后只使用下面的接口，缺少密钥时会提示，不会回退。</small></span></label>
    {api.enabled && <div className="image-field-grid">
      <label><span>提示词 LLM 供应商</span><select value={api.provider} onChange={(event) => { const selected = TAVERN_PROVIDERS.find((item) => item.id === event.target.value)!; patchApi({ provider: selected.id, baseUrl: selected.baseUrl, model: selected.defaultModel, providerOptions: {}, topP: selected.id === 'cohere' ? 0.99 : 1 }) }}>{TAVERN_PROVIDERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label><span>提示词 API 根地址</span><input value={api.baseUrl} placeholder="https://example.com/v1" onChange={(event) => patchApi({ baseUrl: event.target.value })} /></label>
      {provider.requiredOptions.map((key) => <label key={key}><span>{key === 'accountId' ? 'Account ID' : key === 'projectId' ? '项目 ID' : '区域'}</span><input value={api.providerOptions[key] ?? ''} onChange={(event) => patchApi({ providerOptions: { ...api.providerOptions, [key]: event.target.value } })} /></label>)}
      <label className="is-wide" htmlFor="image-prompt-api-key"><span>提示词 API 密钥</span><div className="api-secret-input"><input id="image-prompt-api-key" aria-label="提示词 API 密钥" type={showKey ? 'text' : 'password'} autoComplete="off" value={apiKey} placeholder={resolveImagePromptCredential(api) ? '已保存；留空保留现有密钥' : '独立密钥，不使用正文或生图密钥'} onChange={(event) => onKeyChange(event.target.value)} /><button type="button" aria-label={showKey ? '隐藏提示词密钥' : '显示提示词密钥'} onClick={() => setShowKey(!showKey)}>{showKey ? '隐藏' : '显示'}</button></div></label>
      <label className="image-toggle"><input type="checkbox" checked={api.rememberKey} onChange={(event) => patchApi({ rememberKey: event.target.checked })} /><span>在这台设备记住提示词密钥</span></label>
      <button type="button" className="danger-button" onClick={() => { clearImagePromptCredential(api); onKeyChange(''); setNotice('提示词密钥已从本机清除。'); setFailure(false) }}>清除提示词密钥</button>
      <label><span>提示词模型名称</span><input value={api.model} onChange={(event) => patchApi({ model: event.target.value })} placeholder="连接获取列表，或填写模型 ID" /></label>
      <label><span>可用提示词模型</span><select value={models.includes(api.model) ? api.model : ''} disabled={!models.length} onChange={(event) => { if (event.target.value) onChange({ ...prompt, api: { ...api, model: event.target.value } }) }}><option value="">{models.length ? '选择模型（也可手动填写）' : '请先连接获取模型'}</option>{models.map((model) => <option key={model} value={model}>{model}</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={testing} onClick={() => void connect()}>{testing ? '正在连接……' : '连接并获取提示词模型'}</button>
      {!provider.modelsPath && <p className="image-help">此供应商没有模型列表接口，连接测试将发送一条简短文本请求，可能产生少量费用。</p>}
      {(['contextLength', 'maxResponseLength', 'temperature'] as const).map((key) => <label key={key}><span>{key === 'contextLength' ? '提示词上下文长度' : key === 'maxResponseLength' ? '提示词最大回复长度' : '提示词温度'}</span><input type="number" min={key === 'temperature' ? 0 : key === 'contextLength' ? 128 : 1} step={key === 'temperature' ? 0.1 : 1} value={api[key]} onChange={(event) => patchApi({ [key]: Number(event.target.value) })} /></label>)}
      <p className="image-help is-wide">独立接口只整理绘图提示词，不生成图片。密钥仅保存在当前浏览器，不写入预设、角色卡或云存档。修改后请点击底部“保存绘图配置”。</p>
    </div>}
    {notice && <p className={`tavern-inline-notice ${failure ? 'is-error' : ''}`} role={failure ? 'alert' : 'status'}>{notice}</p>}
  </div>
}
