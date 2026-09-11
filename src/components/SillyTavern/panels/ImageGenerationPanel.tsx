import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { createDefaultImageGenerationSettings, validateImageGenerationSettings } from '../../../sillytavern/image-generation/config'
import type { ImageProviderResources } from '../../../sillytavern/image-generation/providers'
import type {
  ImageGenerationProvider,
  ImageGenerationSettings,
  ImagePromptPreset,
  ImageReferenceKind,
  ImagePromptReplacementKind,
} from '../../../sillytavern/image-generation/types'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'
import { ImagePromptControls } from './ImagePromptControls'
import { NovelAIModelPicker } from './NovelAIModelPicker'
import { resolveImagePromptCredential, setImagePromptCredential } from '../../../sillytavern/image-generation/credentials'
import { validateTavernApiConfig } from '../../../sillytavern/api-config'

const providerLabels: Record<ImageGenerationProvider, string> = {
  'stable-diffusion': 'Stable Diffusion WebUI / Forge',
  comfyui: 'ComfyUI 工作流',
  novelai: 'NovelAI',
  'openai-image': 'OpenAI / Grok 兼容接口',
}

function NumberField({ id, label, value, min, max, step = 1, onCommit }: {
  id: string
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onCommit(value: number): void
}) {
  const [draft, setDraft] = useState(String(value))
  useEffect(() => setDraft(String(value)), [value])
  const commit = () => {
    const parsed = Number(draft)
    if (!draft.trim() || !Number.isFinite(parsed)) setDraft(String(value))
    else onCommit(parsed)
  }
  return <label htmlFor={id}><span>{label}</span><input id={id} type="number" inputMode="decimal" value={draft} min={min} max={max} step={step} onChange={(event) => setDraft(event.target.value)} onBlur={commit} /></label>
}

function Toggle({ id, label, checked, note, disabled = false, onChange }: { id: string; label: string; checked: boolean; note?: string; disabled?: boolean; onChange(value: boolean): void }) {
  return <label className="image-toggle" htmlFor={id}><input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /><span><strong>{label}</strong>{note && <small>{note}</small>}</span></label>
}

export function ImageGenerationPanel() {
  const tavern = useTavern()
  const [draft, setDraft] = useState<ImageGenerationSettings>(createDefaultImageGenerationSettings)
  const [credential, setCredential] = useState('')
  const [promptCredential, setPromptCredential] = useState('')
  const [rememberCredential, setRememberCredential] = useState(false)
  const [showCredential, setShowCredential] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'idle' | 'working' | 'success' | 'error'; text: string; source?: 'connection' }>({ tone: 'idle', text: '尚未测试当前绘图服务。' })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [referenceKind, setReferenceKind] = useState<ImageReferenceKind>('vibe')
  const [clearArmed, setClearArmed] = useState(false)
  const [resources, setResources] = useState<ImageProviderResources | null>(null)
  const presetImportRef = useRef<HTMLInputElement>(null)
  const connectionRef = useRef<AbortController | null>(null)
  const connectionScope = JSON.stringify([draft.provider, draft.stableDiffusion.baseUrl, draft.comfyUI.baseUrl, draft.novelAI.baseUrl, draft.openAIImage.baseUrl, credential])

  useEffect(() => {
    connectionRef.current?.abort()
    setFeedback((current) => current.source === 'connection' ? { tone: 'idle', text: '配置已切换，可测试当前绘图服务。' } : current)
    return () => connectionRef.current?.abort()
  }, [connectionScope])

  useEffect(() => {
    if (!tavern.settings) return
    setDraft(structuredClone(tavern.settings.imageGeneration))
    setCredential('')
    setPromptCredential('')
    const text = tavern.hasImageProviderCredential(tavern.settings.imageGeneration.provider) ? '当前供应商已有本机密钥。' : '尚未测试当前绘图服务。'
    setFeedback((current) => current.tone === 'idle' ? { tone: 'idle', text } : current)
  }, [tavern.settings])

  const activePreset = useMemo(() => draft.prompt.presets.find((preset) => preset.id === draft.prompt.activePresetId) ?? draft.prompt.presets[0], [draft.prompt])
  const patch = <K extends keyof ImageGenerationSettings>(key: K, value: ImageGenerationSettings[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const patchProvider = <K extends 'stableDiffusion' | 'comfyUI' | 'novelAI' | 'openAIImage'>(key: K, value: ImageGenerationSettings[K]) => patch(key, value)

  const switchProvider = (provider: ImageGenerationProvider) => {
    patch('provider', provider)
    setCredential('')
    setResources(null)
    setFeedback({ tone: 'idle', text: tavern.hasImageProviderCredential(provider) ? '该供应商已有本机密钥。' : '供应商已切换，请保存并测试连接。' })
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    const nextErrors = validateImageGenerationSettings(draft)
    if (draft.prompt.api.enabled) {
      Object.assign(nextErrors, Object.fromEntries(Object.entries(validateTavernApiConfig(draft.prompt.api)).map(([key, value]) => [`prompt.api.${key}`, value])))
      if (!promptCredential.trim() && !resolveImagePromptCredential(draft.prompt.api)) nextErrors['prompt.api.key'] = '请填写绘图提示词独立 API 密钥。'
    }
    if (draft.prompt.llmPresets.some((preset) => !preset.name.trim())) nextErrors['prompt.llmPresets'] = '提示词预设名称不能为空。'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      setFeedback({ tone: 'error', text: '绘图配置仍有无效字段，请检查红色提示。' })
      return
    }
    try {
      connectionRef.current?.abort()
      if (credential.trim()) tavern.saveImageProviderCredential(draft.provider, credential, rememberCredential)
      const promptKey = promptCredential.trim() || resolveImagePromptCredential(draft.prompt.api)
      if (promptKey) setImagePromptCredential(draft.prompt.api, promptKey, draft.prompt.api.rememberKey)
      await tavern.updateSettings({ imageGeneration: structuredClone(draft) })
      setFeedback({ tone: 'success', text: '绘图配置、提示词预设与缓存规则已保存。' })
    } catch (caught) {
      setFeedback({ tone: 'error', text: caught instanceof Error ? caught.message : '绘图配置保存失败。' })
    }
  }

  const test = async () => {
    const nextErrors = validateImageGenerationSettings(draft)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return setFeedback({ tone: 'error', text: '请先修正接口地址和参数。' })
    connectionRef.current?.abort()
    const controller = new AbortController()
    connectionRef.current = controller
    setFeedback({ tone: 'working', source: 'connection', text: '正在连接绘图服务……' })
    try {
      const result = await tavern.testImageProvider(draft.provider, controller.signal, draft, credential.trim() || undefined)
      if (!controller.signal.aborted) setFeedback({ tone: 'success', source: 'connection', text: `${result}。修改的配置请点击保存。` })
    } catch (caught) {
      if (!controller.signal.aborted) setFeedback({ tone: 'error', source: 'connection', text: caught instanceof Error ? caught.message : '连接测试失败。' })
    }
  }

  const updatePreset = (field: 'name' | 'prefix' | 'suffix' | 'negative', value: string) => {
    if (!activePreset) return
    patch('prompt', { ...draft.prompt, presets: draft.prompt.presets.map((preset) => preset.id === activePreset.id ? { ...preset, [field]: value } : preset) })
  }

  const addPreset = () => {
    const id = crypto.randomUUID()
    patch('prompt', { ...draft.prompt, activePresetId: id, presets: [...draft.prompt.presets, { id, name: `绘图预设 ${draft.prompt.presets.length + 1}`, prefix: '', suffix: '', negative: '' }] })
  }

  const deletePreset = () => {
    if (!activePreset || draft.prompt.presets.length <= 1) return
    const presets = draft.prompt.presets.filter((preset) => preset.id !== activePreset.id)
    patch('prompt', { ...draft.prompt, presets, activePresetId: presets[0].id })
  }

  const duplicatePreset = () => {
    if (!activePreset) return
    const id = crypto.randomUUID()
    patch('prompt', {
      ...draft.prompt,
      activePresetId: id,
      presets: [...draft.prompt.presets, { ...activePreset, id, name: `${activePreset.name} 副本` }],
    })
  }

  const exportPreset = () => {
    if (!activePreset) return
    const blob = new Blob([JSON.stringify({ type: 'xinglugu-image-prompt-preset', version: 1, preset: activePreset }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${activePreset.name.replace(/[\\/:*?"<>|]/g, '_') || '绘图预设'}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importPreset = async (file: File) => {
    try {
      if (!file.size || file.size > 1024 * 1024) throw new Error('绘图预设文件必须是 1 MB 以内的 JSON。')
      const parsed = JSON.parse(await file.text()) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('文件不是有效的性撸谷绘图提示词预设。')
      const container = parsed as Record<string, unknown>
      const source = container.preset && typeof container.preset === 'object' && !Array.isArray(container.preset)
        ? container.preset as Record<string, unknown>
        : container
      if (typeof source.name !== 'string' || typeof source.prefix !== 'string' || typeof source.suffix !== 'string' || typeof source.negative !== 'string') {
        throw new Error('文件不是有效的性撸谷绘图提示词预设。')
      }
      const preset: ImagePromptPreset = { id: crypto.randomUUID(), name: source.name.trim().slice(0, 80), prefix: source.prefix.slice(0, 12000), suffix: source.suffix.slice(0, 12000), negative: source.negative.slice(0, 12000) }
      if (!preset.name) throw new Error('绘图预设必须包含非空名称。')
      patch('prompt', { ...draft.prompt, activePresetId: preset.id, presets: [...draft.prompt.presets, preset] })
      setFeedback({ tone: 'success', text: `已导入绘图预设“${preset.name}”，保存配置后生效。` })
    } catch (caught) {
      setFeedback({ tone: 'error', text: caught instanceof Error ? caught.message : '绘图预设导入失败。' })
    }
  }

  const clearArchive = async () => {
    if (!clearArmed) {
      setClearArmed(true)
      setFeedback({ tone: 'error', text: '再次点击“确认清空”才会删除全部生成图片与任务；参考图不会被删除。' })
      return
    }
    await tavern.clearImageArchive()
    setClearArmed(false)
    setFeedback({ tone: 'success', text: '本机生成图片与任务历史已清空，参考图仍保留。' })
  }

  const loadResources = async () => {
    setFeedback({ tone: 'working', text: '正在读取本地绘图服务资源……' })
    try {
      const next = await tavern.listImageProviderResources(draft)
      setResources(next)
      const count = Object.values(next).reduce((total, values) => total + values.length, 0)
      setFeedback({ tone: 'success', text: `已读取 ${count} 项模型与采样资源。空列表通常表示当前服务版本不支持该端点。` })
    } catch (caught) {
      setFeedback({ tone: 'error', text: caught instanceof Error ? caught.message : '资源列表读取失败。' })
    }
  }

  const addReplacement = () => patch('prompt', {
    ...draft.prompt,
    replacements: [...draft.prompt.replacements, { id: crypto.randomUUID(), enabled: true, kind: 'replace', search: '', replacement: '' }],
  })

  if (!tavern.settings) return <div className="tavern-panel-loading" role="status"><i /><i /><i /><span>正在读取绘图配置</span></div>

  return <section className="tavern-panel image-generation-panel" aria-labelledby="image-generation-title">
    <header className="tavern-panel-heading">
      <div><span>SCENE IMAGE PIPELINE</span><h3 id="image-generation-title">对话绘图中枢</h3><p>从角色卡、世界书、场景变量与最近对话整理提示词，再交给本地或远程生图服务。</p></div>
      <div className={`adapter-state ${draft.enabled ? 'is-remote' : 'is-required'}`}><i /><span>{draft.enabled ? 'IMAGE PIPELINE READY' : 'IMAGE PIPELINE OFF'}</span><strong>{providerLabels[draft.provider]}</strong></div>
    </header>

    <form className="image-config-form" onSubmit={save}>
      <article className="image-config-card is-wide">
        <div className="api-card-heading"><div><span className="panel-kicker">01 · 总控</span><h4>生成路径与自动触发</h4></div><GameIcon name="image" size={21} /></div>
        <div className="image-field-grid">
          <Toggle id="image-generation-enabled" label="启用对话绘图" note="关闭后保留历史图片，但不会创建新任务。" checked={draft.enabled} onChange={(enabled) => patch('enabled', enabled)} />
          <Toggle id="image-generation-auto" label="NPC 回复后自动绘图" note="只对成功的远程模型回复触发，并按消息去重。" checked={draft.auto.enabled} onChange={(enabled) => patch('auto', { ...draft.auto, enabled })} />
          <label htmlFor="image-generation-provider"><span>绘图服务</span><select id="image-generation-provider" value={draft.provider} onChange={(event) => switchProvider(event.target.value as ImageGenerationProvider)}>{Object.entries(providerLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <NumberField id="image-generation-auto-every" label="每隔几条 NPC 回复生成" value={draft.auto.everyNthAssistantMessage} min={1} max={100} onCommit={(value) => patch('auto', { ...draft.auto, everyNthAssistantMessage: Math.round(value) })} />
          <Toggle id="image-generation-require-tag" label="自动模式必须含绘图标记" note="仅当回复含 image###…### 或 <images> 时触发。" checked={draft.auto.requireTaggedPrompt} onChange={(requireTaggedPrompt) => patch('auto', { ...draft.auto, requireTaggedPrompt })} />
        </div>
      </article>

      <article className="image-config-card">
        <div className="api-card-heading"><div><span className="panel-kicker">02 · 凭据</span><h4>接口与本机密钥</h4></div><GameIcon name="shield" size={20} /></div>
        <label htmlFor="image-provider-credential"><span>供应商密钥（本地服务可留空）</span><div className="api-secret-input"><input id="image-provider-credential" aria-label="供应商密钥（本地服务可留空）" type={showCredential ? 'text' : 'password'} autoComplete="off" value={credential} placeholder={tavern.hasImageProviderCredential(draft.provider) ? '已保存；留空保留现有密钥' : '只保存在当前浏览器'} onChange={(event) => setCredential(event.target.value)} /><button id="image-provider-credential-visibility" type="button" aria-label={showCredential ? '隐藏绘图密钥' : '显示绘图密钥'} onClick={() => setShowCredential((current) => !current)}><GameIcon name={showCredential ? 'conceal' : 'reveal'} size={17} /></button></div></label>
        <Toggle id="image-provider-remember" label="在这台设备记住密钥" checked={rememberCredential} onChange={setRememberCredential} />
        <button type="button" className="danger-button" onClick={() => { connectionRef.current?.abort(); tavern.clearImageProviderCredential(draft.provider); setCredential(''); setFeedback({ tone: 'idle', text: '当前绘图密钥已从本机清除。' }) }}>清除绘图密钥</button>
        <p className="image-help">密钥不会进入世界书、预设、角色卡、云存档或创意工坊包。本地 A1111/Forge 需以 <code>--api</code> 启动并允许当前网页跨域。</p>
      </article>

      <article className="image-config-card is-wide">
        <div className="api-card-heading"><div><span className="panel-kicker">03 · 提示词</span><h4>智能整理与标记兼容</h4></div><GameIcon name="wand" size={20} /></div>
        <div className="image-field-grid">
          <label htmlFor="image-prompt-mode"><span>默认提示词来源</span><select id="image-prompt-mode" value={draft.prompt.mode} onChange={(event) => patch('prompt', { ...draft.prompt, mode: event.target.value as ImageGenerationSettings['prompt']['mode'] })}><option value="llm">AI 智能整理</option><option value="tagged">读取回复标记</option><option value="manual">玩家手动描述</option></select></label>
          <NumberField id="image-prompt-history-depth" label="读取最近消息数" value={draft.prompt.historyDepth} min={0} max={30} onCommit={(historyDepth) => patch('prompt', { ...draft.prompt, historyDepth: Math.round(historyDepth) })} />
          <label htmlFor="image-prompt-trigger-start"><span>标记开头</span><input id="image-prompt-trigger-start" value={draft.prompt.triggerStart} onChange={(event) => patch('prompt', { ...draft.prompt, triggerStart: event.target.value })} /></label>
          <label htmlFor="image-prompt-trigger-end"><span>标记结尾</span><input id="image-prompt-trigger-end" value={draft.prompt.triggerEnd} onChange={(event) => patch('prompt', { ...draft.prompt, triggerEnd: event.target.value })} /></label>
        </div>
        <ImagePromptControls prompt={draft.prompt} onChange={(value) => patch('prompt', value)} apiKey={promptCredential} onKeyChange={setPromptCredential} />
      </article>

      <article className="image-config-card is-wide">
        <div className="api-card-heading"><div><span className="panel-kicker">04 · 固定提示词</span><h4>预设中心与替换流水线</h4></div><GameIcon name="magic" size={20} /></div>
        <div className="image-preset-toolbar"><label htmlFor="image-prompt-preset"><span>当前预设</span><select id="image-prompt-preset" value={draft.prompt.activePresetId} onChange={(event) => patch('prompt', { ...draft.prompt, activePresetId: event.target.value })}>{draft.prompt.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label><button id="image-prompt-preset-add" className="secondary-button" type="button" onClick={addPreset}>新建预设</button><button id="image-prompt-preset-duplicate" className="secondary-button" type="button" onClick={duplicatePreset}>复制</button><button id="image-prompt-preset-import" className="secondary-button" type="button" onClick={() => presetImportRef.current?.click()}>导入</button><input ref={presetImportRef} id="image-prompt-preset-file" className="visually-hidden" type="file" accept="application/json,.json" aria-label="选择绘图预设 JSON" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importPreset(file); event.currentTarget.value = '' }} /><button id="image-prompt-preset-export" className="secondary-button" type="button" onClick={exportPreset}>导出</button><button id="image-prompt-preset-delete" className="danger-button" type="button" disabled={draft.prompt.presets.length <= 1} onClick={deletePreset}>删除</button></div>
        {activePreset && <div className="image-field-grid"><label htmlFor="image-preset-name"><span>预设名称</span><input id="image-preset-name" value={activePreset.name} onChange={(event) => updatePreset('name', event.target.value)} /></label><label className="is-wide" htmlFor="image-preset-prefix"><span>固定前置提示词</span><textarea id="image-preset-prefix" rows={3} value={activePreset.prefix} onChange={(event) => updatePreset('prefix', event.target.value)} /></label><label className="is-wide" htmlFor="image-preset-suffix"><span>固定后置提示词</span><textarea id="image-preset-suffix" rows={3} value={activePreset.suffix} onChange={(event) => updatePreset('suffix', event.target.value)} /></label><label className="is-wide" htmlFor="image-preset-negative"><span>固定负面提示词</span><textarea id="image-preset-negative" rows={3} value={activePreset.negative} onChange={(event) => updatePreset('negative', event.target.value)} /></label></div>}
        <div className="image-rule-list"><div className="image-rule-list-heading"><strong>提示词替换规则</strong><button id="image-replacement-add" className="secondary-button" type="button" onClick={addReplacement}>新增规则</button></div>{draft.prompt.replacements.length === 0 && <p className="image-empty-note">暂无替换规则，最终提示词会直接使用预设与模型结果。</p>}{draft.prompt.replacements.map((rule, index) => <div className="image-rule-row" key={rule.id}><input id={`image-replacement-enabled-${rule.id}`} type="checkbox" aria-label={`启用替换规则 ${index + 1}`} checked={rule.enabled} onChange={(event) => patch('prompt', { ...draft.prompt, replacements: draft.prompt.replacements.map((item) => item.id === rule.id ? { ...item, enabled: event.target.checked } : item) })} /><select id={`image-replacement-kind-${rule.id}`} aria-label={`规则 ${index + 1} 类型`} value={rule.kind} onChange={(event) => patch('prompt', { ...draft.prompt, replacements: draft.prompt.replacements.map((item) => item.id === rule.id ? { ...item, kind: event.target.value as ImagePromptReplacementKind } : item) })}><option value="replace">替换</option><option value="delete">删除</option><option value="prepend">命中后前置</option><option value="append">命中后后置</option></select><input id={`image-replacement-search-${rule.id}`} aria-label={`规则 ${index + 1} 查找内容`} placeholder="查找内容" value={rule.search} onChange={(event) => patch('prompt', { ...draft.prompt, replacements: draft.prompt.replacements.map((item) => item.id === rule.id ? { ...item, search: event.target.value } : item) })} /><input id={`image-replacement-value-${rule.id}`} aria-label={`规则 ${index + 1} 替换内容`} placeholder="替换或追加内容" value={rule.replacement} onChange={(event) => patch('prompt', { ...draft.prompt, replacements: draft.prompt.replacements.map((item) => item.id === rule.id ? { ...item, replacement: event.target.value } : item) })} /><button id={`image-replacement-delete-${rule.id}`} type="button" aria-label={`删除替换规则 ${index + 1}`} onClick={() => patch('prompt', { ...draft.prompt, replacements: draft.prompt.replacements.filter((item) => item.id !== rule.id) })}><GameIcon name="trash" size={15} /></button></div>)}</div>
      </article>

      <ProviderSettings draft={draft} patchProvider={patchProvider} errors={errors} />
      {draft.provider === 'stable-diffusion' && <StableResourcePicker resources={resources} draft={draft} patchProvider={patchProvider} onRefresh={() => void loadResources()} />}
      {draft.provider === 'comfyui' && <ComfyProviderAdvanced draft={draft} patchProvider={patchProvider} />}

      <article className="image-config-card is-wide">
        <div className="api-card-heading"><div><span className="panel-kicker">06 · 参考</span><h4>Vibe Transfer 与角色参考图组</h4></div><GameIcon name="image" size={20} /></div>
        <div className="image-field-grid"><Toggle id="image-nai-vibe" label="启用 Vibe Transfer" note="NAI3 发送原图数组；NAI4/4.5 会先调用 encode-vibe。" checked={draft.novelAI.vibeTransfer} onChange={(vibeTransfer) => patchProvider('novelAI', { ...draft.novelAI, vibeTransfer })} /><Toggle id="image-nai-character-reference" label="启用角色参考" note="NAI4/4.5 按角色、角色与风格、纯风格类型发送。" checked={draft.novelAI.characterReference} onChange={(characterReference) => patchProvider('novelAI', { ...draft.novelAI, characterReference })} /></div>
        <div className="image-reference-upload"><label htmlFor="image-reference-kind"><span>参考类型</span><select id="image-reference-kind" value={referenceKind} onChange={(event) => setReferenceKind(event.target.value as ImageReferenceKind)}><option value="vibe">氛围参考</option><option value="character">角色外观</option><option value="character-style">角色与风格</option><option value="style">纯风格</option></select></label><label className="secondary-button" htmlFor="image-reference-file"><GameIcon name="upload" size={16} />上传参考图<input id="image-reference-file" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) void tavern.addImageReference(file, referenceKind).catch((caught) => setFeedback({ tone: 'error', text: caught instanceof Error ? caught.message : '参考图上传失败。' })); event.currentTarget.value = '' }} /></label></div>
        {tavern.imageReferences.length === 0 ? <p className="image-empty-note">尚未上传参考图。参考图只保存在当前设备的 IndexedDB，不会进入云存档或创意工坊包。</p> : <div className="image-reference-list">{tavern.imageReferences.map((reference, index) => <div className="image-reference-row" key={reference.id}><label htmlFor={`image-reference-enabled-${reference.id}`}><input id={`image-reference-enabled-${reference.id}`} type="checkbox" checked={reference.enabled} onChange={(event) => void tavern.updateImageReference(reference.id, { enabled: event.target.checked })} /><span>{String(index + 1).padStart(2, '0')}</span></label><div><strong>{reference.name}</strong><small>{reference.kind} · {Math.round(reference.bytes / 1024)} KB</small></div><NumberField id={`image-reference-strength-${reference.id}`} label="强度" value={reference.strength} min={0} max={1} step={0.05} onCommit={(strength) => void tavern.updateImageReference(reference.id, { strength })} /><NumberField id={`image-reference-info-${reference.id}`} label="信息提取" value={reference.informationExtracted} min={0} max={1} step={0.05} onCommit={(informationExtracted) => void tavern.updateImageReference(reference.id, { informationExtracted })} /><button id={`image-reference-delete-${reference.id}`} type="button" aria-label={`删除参考图 ${reference.name}`} onClick={() => void tavern.deleteImageReference(reference.id)}><GameIcon name="trash" size={15} /></button></div>)}</div>}
      </article>

      <article className="image-config-card is-wide">
        <div className="api-card-heading"><div><span className="panel-kicker">07 · 缓存与呈现</span><h4>本机图片仓库</h4></div><GameIcon name="history" size={20} /></div>
        <div className="image-field-grid"><NumberField id="image-cache-entries" label="最多保留图片数" value={draft.cache.maxEntries} min={1} max={1000} onCommit={(maxEntries) => patch('cache', { ...draft.cache, maxEntries: Math.round(maxEntries) })} /><NumberField id="image-cache-megabytes" label="最大缓存空间（MB）" value={Math.round(draft.cache.maxBytes / 1024 / 1024)} min={1} max={4096} onCommit={(value) => patch('cache', { ...draft.cache, maxBytes: Math.round(value) * 1024 * 1024 })} /><NumberField id="image-cache-days" label="保留天数" value={draft.cache.retentionDays} min={1} max={3650} onCommit={(retentionDays) => patch('cache', { ...draft.cache, retentionDays: Math.round(retentionDays) })} /><label htmlFor="image-ui-alignment"><span>图片对齐</span><select id="image-ui-alignment" value={draft.ui.imageAlignment} onChange={(event) => patch('ui', { ...draft.ui, imageAlignment: event.target.value as ImageGenerationSettings['ui']['imageAlignment'] })}><option value="left">左侧</option><option value="center">居中</option><option value="right">右侧</option></select></label><label htmlFor="image-ui-size"><span>展示宽度</span><select id="image-ui-size" value={draft.ui.imageSizePercent} onChange={(event) => patch('ui', { ...draft.ui, imageSizePercent: Number(event.target.value) as ImageGenerationSettings['ui']['imageSizePercent'] })}><option value="25">25%</option><option value="50">50%</option><option value="75">75%</option><option value="100">100%</option></select></label></div>
        <div className="image-cache-summary"><p className="image-help">当前共 {tavern.imageAssets.length} 张图片、{tavern.imageJobs.length} 个任务；图片二进制只保存在本机 IndexedDB，不进入云存档。</p><button id="image-cache-clear" className={clearArmed ? 'danger-button' : 'secondary-button'} type="button" onClick={() => void clearArchive()}>{clearArmed ? '确认清空' : '清空生成历史'}</button></div>
      </article>

      {Object.keys(errors).length > 0 && <div className="tavern-inline-notice is-error" role="alert"><GameIcon name="warning" size={17} /><span>{Object.values(errors)[0]}</span></div>}
      <div className={`api-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'}><GameIcon name={feedback.tone === 'error' ? 'warning' : feedback.tone === 'success' ? 'success' : 'connect'} size={18} /><strong>{feedback.text}</strong></div>
      <footer className="api-actions"><button id="image-provider-test" className="secondary-button" type="button" disabled={feedback.tone === 'working'} onClick={() => void test()}><GameIcon name="connect" size={17} />测试连接</button><button id="image-settings-save" className="primary-button" type="submit" disabled={feedback.tone === 'working'}><GameIcon name="save" size={17} />保存绘图配置</button></footer>
    </form>
  </section>
}

function StableResourcePicker({ resources, draft, patchProvider, onRefresh }: {
  resources: ImageProviderResources | null
  draft: ImageGenerationSettings
  patchProvider<K extends 'stableDiffusion' | 'comfyUI' | 'novelAI' | 'openAIImage'>(key: K, value: ImageGenerationSettings[K]): void
  onRefresh(): void
}) {
  const value = draft.stableDiffusion
  const update = (patch: Partial<typeof value>) => patchProvider('stableDiffusion', { ...value, ...patch })
  const options = (id: string, values: string[], selected: string, setValue: (next: string) => void) => <select id={id} value={values.includes(selected) ? selected : ''} onChange={(event) => setValue(event.target.value)}><option value="">保持手动填写值</option>{values.map((item) => <option key={item} value={item}>{item}</option>)}</select>
  return <article className="image-config-card is-wide image-provider-resources">
    <div className="api-card-heading"><div><span className="panel-kicker">05B · 资源浏览器</span><h4>A1111 / Forge 可用资源</h4></div><button id="image-sd-resources-refresh" className="secondary-button" type="button" onClick={onRefresh}>读取资源列表</button></div>
    {!resources ? <p className="image-empty-note">连接本地服务后读取已安装模型、VAE、采样器、调度器、放大器与 LoRA。</p> : <div className="image-field-grid">
      <label htmlFor="image-sd-resource-model"><span>选择模型</span>{options('image-sd-resource-model', resources.models, value.model, (model) => model && update({ model }))}</label>
      <label htmlFor="image-sd-resource-vae"><span>选择 VAE</span>{options('image-sd-resource-vae', resources.vaes, value.vae, (vae) => vae && update({ vae }))}</label>
      <label htmlFor="image-sd-resource-sampler"><span>选择采样器</span>{options('image-sd-resource-sampler', resources.samplers, value.sampler, (sampler) => sampler && update({ sampler }))}</label>
      <label htmlFor="image-sd-resource-scheduler"><span>选择调度器</span>{options('image-sd-resource-scheduler', resources.schedulers, value.scheduler, (scheduler) => scheduler && update({ scheduler }))}</label>
      <label htmlFor="image-sd-resource-upscaler"><span>选择放大器</span>{options('image-sd-resource-upscaler', resources.upscalers, value.hires.upscaler, (upscaler) => upscaler && update({ hires: { ...value.hires, upscaler } }))}</label>
      <label htmlFor="image-sd-resource-lora"><span>已安装 LoRA（点击复制名称）</span>{options('image-sd-resource-lora', resources.loras, '', (lora) => { if (lora) void navigator.clipboard?.writeText(`<lora:${lora}:1>`) })}</label>
    </div>}
  </article>
}

function ComfyProviderAdvanced({ draft, patchProvider }: {
  draft: ImageGenerationSettings
  patchProvider<K extends 'stableDiffusion' | 'comfyUI' | 'novelAI' | 'openAIImage'>(key: K, value: ImageGenerationSettings[K]): void
}) {
  const value = draft.comfyUI
  const update = (patch: Partial<typeof value>) => patchProvider('comfyUI', { ...value, ...patch })
  return <article className="image-config-card is-wide image-provider-advanced">
    <div className="api-card-heading"><div><span className="panel-kicker">05B · 工作流变量</span><h4>模型、VAE 与采样节点注入</h4></div><GameIcon name="variables" size={20} /></div>
    <div className="image-field-grid">
      <label htmlFor="image-comfy-vae"><span>VAE 变量</span><input id="image-comfy-vae" value={value.vae} onChange={(event) => update({ vae: event.target.value })} /></label>
      <label htmlFor="image-comfy-sampler"><span>采样器变量</span><input id="image-comfy-sampler" value={value.sampler} onChange={(event) => update({ sampler: event.target.value })} /></label>
      <label htmlFor="image-comfy-scheduler"><span>调度器变量</span><input id="image-comfy-scheduler" value={value.scheduler} onChange={(event) => update({ scheduler: event.target.value })} /></label>
    </div>
    <p className="image-help">工作流中的 LoRA、ControlNet 和其他自定义节点会原样保留；上面的值仅替换对应占位符，不会改写节点结构。</p>
  </article>
}

function ProviderSettings({ draft, patchProvider, errors }: {
  draft: ImageGenerationSettings
  patchProvider<K extends 'stableDiffusion' | 'comfyUI' | 'novelAI' | 'openAIImage'>(key: K, value: ImageGenerationSettings[K]): void
  errors: Record<string, string>
}) {
  const commonDimensions = (prefix: string, value: { width: number; height: number }, update: (next: { width: number; height: number }) => void) => <><NumberField id={`${prefix}-width`} label="宽度" value={value.width} min={64} max={4096} step={8} onCommit={(width) => update({ ...value, width: Math.round(width) })} /><NumberField id={`${prefix}-height`} label="高度" value={value.height} min={64} max={4096} step={8} onCommit={(height) => update({ ...value, height: Math.round(height) })} /></>
  if (draft.provider === 'stable-diffusion') {
    const value = draft.stableDiffusion
    const update = (next: typeof value) => patchProvider('stableDiffusion', next)
    return <article className="image-config-card is-wide"><div className="api-card-heading"><div><span className="panel-kicker">05 · A1111 / Forge</span><h4>采样、高分修复与面部细化</h4></div><GameIcon name="settings" size={20} /></div><div className="image-field-grid"><label className="is-wide" htmlFor="image-sd-url"><span>接口根地址</span><input id="image-sd-url" value={value.baseUrl} aria-invalid={Boolean(errors['stableDiffusion.baseUrl'])} onChange={(event) => update({ ...value, baseUrl: event.target.value })} /></label><label htmlFor="image-sd-model"><span>模型</span><input id="image-sd-model" value={value.model} onChange={(event) => update({ ...value, model: event.target.value })} /></label><label htmlFor="image-sd-vae"><span>VAE</span><input id="image-sd-vae" value={value.vae} onChange={(event) => update({ ...value, vae: event.target.value })} /></label><label htmlFor="image-sd-sampler"><span>采样器</span><input id="image-sd-sampler" value={value.sampler} onChange={(event) => update({ ...value, sampler: event.target.value })} /></label><label htmlFor="image-sd-scheduler"><span>调度器</span><input id="image-sd-scheduler" value={value.scheduler} onChange={(event) => update({ ...value, scheduler: event.target.value })} /></label>{commonDimensions('image-sd', value, (next) => update({ ...value, ...next }))}<NumberField id="image-sd-steps" label="采样步数" value={value.steps} min={1} max={150} onCommit={(steps) => update({ ...value, steps: Math.round(steps) })} /><NumberField id="image-sd-cfg" label="CFG" value={value.cfgScale} min={0} max={50} step={0.1} onCommit={(cfgScale) => update({ ...value, cfgScale })} /><NumberField id="image-sd-seed" label="种子（-1 随机）" value={value.seed} step={1} onCommit={(seed) => update({ ...value, seed: Math.round(seed) })} /><NumberField id="image-sd-clip" label="Clip Skip" value={value.clipSkip} min={1} max={12} onCommit={(clipSkip) => update({ ...value, clipSkip: Math.round(clipSkip) })} /><Toggle id="image-sd-restore-faces" label="面部修复" checked={value.restoreFaces} onChange={(restoreFaces) => update({ ...value, restoreFaces })} /><Toggle id="image-sd-hires" label="高分辨率修复" checked={value.hires.enabled} onChange={(enabled) => update({ ...value, hires: { ...value.hires, enabled } })} /><NumberField id="image-sd-hires-scale" label="放大倍率" value={value.hires.scale} min={1} max={4} step={0.1} onCommit={(scale) => update({ ...value, hires: { ...value.hires, scale } })} /><label htmlFor="image-sd-upscaler"><span>放大器</span><input id="image-sd-upscaler" value={value.hires.upscaler} onChange={(event) => update({ ...value, hires: { ...value.hires, upscaler: event.target.value } })} /></label><NumberField id="image-sd-hires-steps" label="二次采样步数" value={value.hires.steps} min={0} max={150} onCommit={(steps) => update({ ...value, hires: { ...value.hires, steps: Math.round(steps) } })} /><NumberField id="image-sd-denoise" label="去噪强度" value={value.hires.denoisingStrength} min={0} max={1} step={0.05} onCommit={(denoisingStrength) => update({ ...value, hires: { ...value.hires, denoisingStrength } })} /><Toggle id="image-sd-adetailer" label="启用 ADetailer" checked={value.adetailer.enabled} onChange={(enabled) => update({ ...value, adetailer: { ...value.adetailer, enabled } })} /><label htmlFor="image-sd-adetailer-model"><span>ADetailer 模型</span><input id="image-sd-adetailer-model" value={value.adetailer.model} onChange={(event) => update({ ...value, adetailer: { ...value.adetailer, model: event.target.value } })} /></label><label className="is-wide" htmlFor="image-sd-adetailer-prompt"><span>ADetailer 正面提示词</span><textarea id="image-sd-adetailer-prompt" rows={3} value={value.adetailer.prompt} onChange={(event) => update({ ...value, adetailer: { ...value.adetailer, prompt: event.target.value } })} /></label><label className="is-wide" htmlFor="image-sd-adetailer-negative"><span>ADetailer 负面提示词</span><textarea id="image-sd-adetailer-negative" rows={3} value={value.adetailer.negativePrompt} onChange={(event) => update({ ...value, adetailer: { ...value.adetailer, negativePrompt: event.target.value } })} /></label></div></article>
  }
  if (draft.provider === 'comfyui') {
    const value = draft.comfyUI
    const update = (next: typeof value) => patchProvider('comfyUI', next)
    return <article className="image-config-card is-wide"><div className="api-card-heading"><div><span className="panel-kicker">05 · COMFYUI</span><h4>API 工作流与变量注入</h4></div><GameIcon name="variables" size={20} /></div><div className="image-field-grid"><label className="is-wide" htmlFor="image-comfy-url"><span>接口根地址</span><input id="image-comfy-url" value={value.baseUrl} aria-invalid={Boolean(errors['comfyUI.baseUrl'])} onChange={(event) => update({ ...value, baseUrl: event.target.value })} /></label><label htmlFor="image-comfy-output-node"><span>指定输出节点（可选）</span><input id="image-comfy-output-node" value={value.outputNodeId} onChange={(event) => update({ ...value, outputNodeId: event.target.value })} /></label><label htmlFor="image-comfy-model"><span>模型变量</span><input id="image-comfy-model" value={value.model} onChange={(event) => update({ ...value, model: event.target.value })} /></label>{commonDimensions('image-comfy', value, (next) => update({ ...value, ...next }))}<NumberField id="image-comfy-steps" label="采样步数" value={value.steps} min={1} max={150} onCommit={(steps) => update({ ...value, steps: Math.round(steps) })} /><NumberField id="image-comfy-cfg" label="CFG" value={value.cfgScale} min={0} max={50} step={0.1} onCommit={(cfgScale) => update({ ...value, cfgScale })} /><NumberField id="image-comfy-seed" label="种子" value={value.seed} onCommit={(seed) => update({ ...value, seed: Math.round(seed) })} /><label className="is-wide" htmlFor="image-comfy-workflow"><span>ComfyUI API 工作流 JSON</span><textarea id="image-comfy-workflow" rows={14} value={value.workflowJson} placeholder="从 ComfyUI 导出 API 格式；可使用 {{positive_prompt}}、{{negative_prompt}}、{{width}}、{{height}}、{{seed}}、{{steps}}、{{cfg_scale}} 等变量。" onChange={(event) => update({ ...value, workflowJson: event.target.value })} /></label><NumberField id="image-comfy-poll" label="轮询间隔（毫秒）" value={value.pollIntervalMs} min={250} max={10000} onCommit={(pollIntervalMs) => update({ ...value, pollIntervalMs: Math.round(pollIntervalMs) })} /><NumberField id="image-comfy-timeout" label="超时（毫秒）" value={value.timeoutMs} min={5000} max={900000} onCommit={(timeoutMs) => update({ ...value, timeoutMs: Math.round(timeoutMs) })} /></div></article>
  }
  if (draft.provider === 'novelai') {
    const value = draft.novelAI
    const update = (next: typeof value) => patchProvider('novelAI', next)
    return <article className="image-config-card is-wide"><div className="api-card-heading"><div><span className="panel-kicker">05 · NOVELAI</span><h4>采样、调度与质量增强</h4></div><GameIcon name="magic" size={20} /></div><div className="image-field-grid"><label className="is-wide" htmlFor="image-nai-url"><span>接口根地址</span><input id="image-nai-url" value={value.baseUrl} aria-invalid={Boolean(errors['novelAI.baseUrl'])} onChange={(event) => update({ ...value, baseUrl: event.target.value })} /></label><NovelAIModelPicker value={value.model} onChange={(model) => update({ ...value, model })} /><label htmlFor="image-nai-sampler"><span>采样器</span><input id="image-nai-sampler" value={value.sampler} onChange={(event) => update({ ...value, sampler: event.target.value })} /></label><label htmlFor="image-nai-scheduler"><span>噪声调度</span><input id="image-nai-scheduler" value={value.scheduler} onChange={(event) => update({ ...value, scheduler: event.target.value })} /></label>{commonDimensions('image-nai', value, (next) => update({ ...value, ...next }))}<NumberField id="image-nai-steps" label="采样步数" value={value.steps} min={1} max={50} onCommit={(steps) => update({ ...value, steps: Math.round(steps) })} /><NumberField id="image-nai-scale" label="提示词强度" value={value.scale} min={0} max={20} step={0.1} onCommit={(scale) => update({ ...value, scale })} /><NumberField id="image-nai-rescale" label="CFG Rescale" value={value.cfgRescale} min={0} max={1} step={0.01} onCommit={(cfgRescale) => update({ ...value, cfgRescale })} /><NumberField id="image-nai-seed" label="种子" value={value.seed} onCommit={(seed) => update({ ...value, seed: Math.round(seed) })} /><Toggle id="image-nai-sm" label="SMEA" disabled={/^nai-diffusion-[45](?:-|$)/.test(value.model)} checked={value.sm} onChange={(sm) => update({ ...value, sm })} /><Toggle id="image-nai-dyn" label="SMEA DYN" disabled={/^nai-diffusion-[45](?:-|$)/.test(value.model)} checked={value.dyn} onChange={(dyn) => update({ ...value, dyn })} /><Toggle id="image-nai-variety" label="Variety" disabled={value.model.startsWith('nai-diffusion-5-')} checked={value.variety} onChange={(variety) => update({ ...value, variety })} /><Toggle id="image-nai-decrisper" label="Decrisper" disabled={/^nai-diffusion-[45](?:-|$)/.test(value.model)} checked={value.decrisper} onChange={(decrisper) => update({ ...value, decrisper })} /></div></article>
  }
  const value = draft.openAIImage
  const update = (next: typeof value) => patchProvider('openAIImage', next)
  return <article className="image-config-card is-wide"><div className="api-card-heading"><div><span className="panel-kicker">05 · OPENAI COMPATIBLE</span><h4>远程图像生成接口</h4></div><GameIcon name="image" size={20} /></div><div className="image-field-grid"><label className="is-wide" htmlFor="image-openai-url"><span>接口根地址</span><input id="image-openai-url" value={value.baseUrl} aria-invalid={Boolean(errors['openAIImage.baseUrl'])} onChange={(event) => update({ ...value, baseUrl: event.target.value })} /></label><label htmlFor="image-openai-model"><span>模型</span><input id="image-openai-model" value={value.model} onChange={(event) => update({ ...value, model: event.target.value })} /></label><label htmlFor="image-openai-size"><span>尺寸</span><input id="image-openai-size" value={value.size} placeholder="1024x1024" onChange={(event) => update({ ...value, size: event.target.value })} /></label><label htmlFor="image-openai-quality"><span>质量</span><input id="image-openai-quality" value={value.quality} onChange={(event) => update({ ...value, quality: event.target.value })} /></label><label htmlFor="image-openai-style"><span>风格（可选）</span><input id="image-openai-style" value={value.style} onChange={(event) => update({ ...value, style: event.target.value })} /></label><label htmlFor="image-openai-format"><span>响应格式</span><select id="image-openai-format" value={value.responseFormat} onChange={(event) => update({ ...value, responseFormat: event.target.value as 'b64_json' | 'url' })}><option value="b64_json">base64 图片</option><option value="url">临时图片 URL</option></select></label></div></article>
}
