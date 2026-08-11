import { useEffect, useState, type FormEvent } from 'react'
import { testTavernApiConnection } from '../../../sillytavern/api-adapter'
import { getSessionApiKey, setSessionApiKey } from '../../../sillytavern/api-credentials'
import { getTavernApiPreset, validateTavernApiConfig, type TavernApiFieldErrors } from '../../../sillytavern/api-config'
import { createMistvaleDefaults } from '../../../sillytavern/defaults'
import { getTavernProvider, TAVERN_PROVIDERS, type TavernProviderGroup } from '../../../sillytavern/provider-registry'
import { getTavernApiReadiness } from '../../../sillytavern/api-readiness'
import type { TavernApiConfig, TavernApiProvider, TavernProviderOptionKey } from '../../../sillytavern/types'
import { useTavern } from '../../../tavern/TavernContext'
import { GameIcon } from '../../icons/GameIcon'

type Feedback = { tone: 'idle' | 'testing' | 'success' | 'error'; message: string }
type FormErrors = TavernApiFieldErrors & { apiKey?: string }
type PenaltyField = 'frequencyPenalty' | 'presencePenalty'

const defaultSettings = createMistvaleDefaults().settings
const providerGroups: Array<{ id: TavernProviderGroup; label: string }> = [
  { id: 'official', label: '官方模型服务' },
  { id: 'gateway', label: '多模型聚合网关' },
  { id: 'cloud', label: '云平台与专用协议' },
  { id: 'custom', label: '自定义接口' },
]
const providerOptionMeta: Record<TavernProviderOptionKey, { id: string; label: string; placeholder: string }> = {
  accountId: { id: 'tavern-api-option-account-id', label: 'Account ID', placeholder: 'Cloudflare 账户 ID' },
  projectId: { id: 'tavern-api-option-project-id', label: '项目 ID', placeholder: 'Google Cloud Project ID' },
  location: { id: 'tavern-api-option-location', label: '区域', placeholder: '例如 global 或 us-central1' },
}

export function ApiPanel() {
  const tavern = useTavern()
  const [config, setConfig] = useState<TavernApiConfig>(() => ({ ...defaultSettings.api }))
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [feedback, setFeedback] = useState<Feedback>({ tone: 'idle', message: '尚未测试当前连接。' })
  const [availableModels, setAvailableModels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [penaltyDrafts, setPenaltyDrafts] = useState<Record<PenaltyField, string>>({ frequencyPenalty: '0', presencePenalty: '0' })

  useEffect(() => {
    if (!tavern.settings) return
    setConfig({ ...tavern.settings.api })
    setPenaltyDrafts({
      frequencyPenalty: String(tavern.settings.api.frequencyPenalty),
      presencePenalty: String(tavern.settings.api.presencePenalty),
    })
    setApiKey(getSessionApiKey() || (tavern.settings.api.rememberKey ? tavern.settings.api.persistedApiKey ?? '' : ''))
  }, [tavern.settings])

  const provider = getTavernProvider(config.provider)
  const providerLabel = provider.label
  const draftReadiness = tavern.settings
    ? getTavernApiReadiness({ ...tavern.settings, api: { ...config, persistedApiKey: apiKey } })
    : { ready: false, error: null }
  const remoteReady = draftReadiness.ready

  const validate = (requireKey: boolean): FormErrors => {
    const next: FormErrors = validateTavernApiConfig(config)
    if (requireKey && !apiKey.trim()) next.apiKey = '请填写 API 密钥后再连接模型。'
    setErrors(next)
    return next
  }

  const changeProvider = (provider: TavernApiProvider) => {
    const preset = getTavernApiPreset(provider)
    setConfig((current) => ({ ...current, ...preset }))
    setAvailableModels([])
    setFeedback({ tone: 'idle', message: '提供方已切换，请重新测试连接。' })
  }

  const changeProviderOption = (key: TavernProviderOptionKey, value: string) => {
    setConfig((current) => ({
      ...current,
      providerOptions: { ...current.providerOptions, [key]: value },
    }))
  }

  const changePenalty = (key: PenaltyField, raw: string) => {
    setPenaltyDrafts((current) => ({ ...current, [key]: raw }))
    const value = Number(raw)
    if (raw.trim() && Number.isFinite(value) && value >= -2 && value <= 2) {
      setConfig((current) => ({ ...current, [key]: value }))
    }
  }

  const normalizePenaltyDraft = (key: PenaltyField) => {
    setPenaltyDrafts((current) => ({ ...current, [key]: String(config[key]) }))
    validate(false)
  }

  const save = async (event: FormEvent) => {
    event.preventDefault()
    if (Object.keys(validate(true)).length) {
      setFeedback({ tone: 'error', message: '配置尚未完整，请检查标出的字段。' })
      return
    }
    setSaving(true)
    try {
      const normalizedKey = apiKey.trim()
      setSessionApiKey(normalizedKey)
      const nextApi: TavernApiConfig = {
        ...config,
        baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
        model: config.model.trim(),
        persistedApiKey: config.rememberKey && normalizedKey ? normalizedKey : undefined,
      }
      await tavern.updateSettings({ api: nextApi })
      setFeedback({ tone: 'success', message: '接口配置已保存。' })
    } catch (caught) {
      setFeedback({ tone: 'error', message: caught instanceof Error ? caught.message : '接口配置保存失败。' })
    } finally {
      setSaving(false)
    }
  }

  const testConnection = async () => {
    if (Object.keys(validate(true)).length) {
      setFeedback({ tone: 'error', message: '请先补全接口地址、密钥和模型名称。' })
      return
    }
    setFeedback({ tone: 'testing', message: provider.modelsPath ? '正在验证密钥并读取模型列表……' : '正在发送最小请求验证连接……' })
    try {
      const result = await testTavernApiConnection(config, apiKey)
      setSessionApiKey(apiKey)
      setAvailableModels(result.models)
      setFeedback({
        tone: 'success',
        message: result.models.length
          ? `连接成功，发现 ${result.models.length} 个可用模型。`
          : '连接成功；服务未返回可枚举的模型列表。',
      })
    } catch (caught) {
      setFeedback({ tone: 'error', message: caught instanceof Error ? caught.message : '连接测试失败。' })
    }
  }

  if (!tavern.settings) {
    return <section className="tavern-panel api-panel" aria-label="接口配置载入中"><div className="tavern-panel-loading" role="status"><i /><i /><i /><span>正在读取接口设置</span></div></section>
  }

  return <section className="tavern-panel api-panel" aria-labelledby="api-panel-title">
    <header className="tavern-panel-heading">
      <div><span>MODEL CONNECTION</span><h3 id="api-panel-title">API 连接配置</h3><p>将角色卡、世界书与游戏变量交给你选择的模型生成 NPC 回应。</p></div>
      <div className={`adapter-state ${remoteReady ? 'is-remote' : 'is-required'}`}><i /><span>{remoteReady ? 'REMOTE READY' : 'API REQUIRED'}</span><strong>{remoteReady ? `${providerLabel} 已配置` : '配置模型后才可生成对话'}</strong></div>
    </header>

    <form className="api-bento api-config-form" onSubmit={save} noValidate>
      <article className="api-guard-card api-browser-warning">
        <GameIcon name="shield" size={24} weight="duotone" />
        <div><span>浏览器直连提醒</span><h4>密钥由当前浏览器直接发送</h4><p>本项目没有后端代理。默认只在当前标签会话保存密钥；部分服务会因 CORS 策略拒绝浏览器请求，请使用专用于本游戏且额度受限的密钥。</p></div>
      </article>

      <article className="api-connection-card">
        <div className="api-card-heading"><div><span className="panel-kicker">01 · 连接路由</span><h4>提供方与接口地址</h4></div><GameIcon name="connect" size={20} /></div>
        <div className="api-form-grid">
          <label className="api-field-wide" htmlFor="tavern-api-provider"><span>聊天补全来源</span><select id="tavern-api-provider" value={config.provider} onChange={(event) => changeProvider(event.target.value as TavernApiProvider)}>{providerGroups.map((group) => <optgroup key={group.id} label={group.label}>{TAVERN_PROVIDERS.filter((item) => item.group === group.id).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</optgroup>)}</select></label>
          <div className="api-provider-meta api-field-wide"><div><strong>{provider.label}</strong><span>{provider.note}</span></div><a href={provider.docsUrl} target="_blank" rel="noreferrer" aria-label={`查看 ${provider.label} 官方文档`}>官方文档</a></div>
          <label className="api-field-wide" htmlFor="tavern-api-base-url"><span>接口根地址</span><input id="tavern-api-base-url" type="url" value={config.baseUrl} aria-invalid={Boolean(errors.baseUrl)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, baseUrl: event.target.value }))} /></label>
          {errors.baseUrl && <small className="api-field-error api-field-wide" role="alert">{errors.baseUrl}</small>}
          {provider.requiredOptions.length > 0 && <div className="api-provider-options api-field-wide">{provider.requiredOptions.map((key) => { const meta = providerOptionMeta[key]; return <label key={key} htmlFor={meta.id}><span>{meta.label}</span><input id={meta.id} value={config.providerOptions[key] ?? ''} placeholder={meta.placeholder} aria-invalid={Boolean(errors[key])} onBlur={() => validate(false)} onChange={(event) => changeProviderOption(key, event.target.value)} />{errors[key] && <small className="api-field-error" role="alert">{errors[key]}</small>}</label> })}</div>}
        </div>
      </article>

      <article className="api-secret-card">
        <div className="api-card-heading"><div><span className="panel-kicker">02 · 凭据</span><h4>密钥与本机存储</h4></div><GameIcon name="shield" size={20} /></div>
        <label htmlFor="tavern-api-key"><span>API 密钥</span><div className="api-secret-input"><input id="tavern-api-key" type={showKey ? 'text' : 'password'} value={apiKey} autoComplete="off" aria-invalid={Boolean(errors.apiKey)} onBlur={() => validate(true)} onChange={(event) => setApiKey(event.target.value)} /><button id="tavern-api-key-visibility" type="button" aria-label={showKey ? '隐藏 API 密钥' : '显示 API 密钥'} onClick={() => setShowKey((current) => !current)}><GameIcon name={showKey ? 'conceal' : 'reveal'} size={17} /></button></div></label>
        {errors.apiKey && <small className="api-field-error" role="alert">{errors.apiKey}</small>}
        {config.provider === 'google-vertex-ai' && <small className="api-credential-kind">Vertex AI 需要 OAuth access token，而不是 AI Studio API Key。</small>}
        <label className="api-remember-key" htmlFor="tavern-api-remember"><input id="tavern-api-remember" type="checkbox" checked={config.rememberKey} onChange={(event) => setConfig((current) => ({ ...current, rememberKey: event.target.checked }))} /><span>仅在这台设备上记住密钥</span></label>
        <small className="api-storage-note">关闭时只写入 sessionStorage，关闭标签后自动失效；开启后会保存到本机 IndexedDB。</small>
      </article>

      <article className="api-generation-card">
        <div className="api-card-heading"><div><span className="panel-kicker">03 · 生成参数</span><h4>模型与回复长度</h4></div><GameIcon name="magic" size={20} /></div>
        <div className="api-form-grid">
          <label className="api-field-wide" htmlFor="tavern-api-model"><span>模型</span><input id="tavern-api-model" list="tavern-api-model-list" value={config.model} aria-invalid={Boolean(errors.model)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, model: event.target.value }))} /><datalist id="tavern-api-model-list">{availableModels.map((model) => <option key={model} value={model} />)}</datalist></label>
          {errors.model && <small className="api-field-error api-field-wide" role="alert">{errors.model}</small>}
          <label htmlFor="tavern-api-context-length"><span>上下文长度（以词符数计）</span><input id="tavern-api-context-length" type="number" inputMode="numeric" min="128" step="128" value={config.contextLength} aria-invalid={Boolean(errors.contextLength)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, contextLength: Number(event.target.value) }))} /></label>
          <label htmlFor="tavern-api-response-length"><span>最大回复长度（以词符数计）</span><input id="tavern-api-response-length" type="number" inputMode="numeric" min="1" step="1" value={config.maxResponseLength} aria-invalid={Boolean(errors.maxResponseLength)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, maxResponseLength: Number(event.target.value) }))} /></label>
          <label className="api-toggle-field api-field-wide" htmlFor="tavern-api-streaming"><input id="tavern-api-streaming" type="checkbox" aria-label="流式传输" checked={config.streaming} onChange={(event) => setConfig((current) => ({ ...current, streaming: event.target.checked }))} /><span><strong>流式传输</strong><small>模型生成时逐段显示正文；关闭后等待完整回复。</small></span></label>
          <label htmlFor="tavern-api-temperature"><span>温度 · {config.temperature.toFixed(2)}</span><input id="tavern-api-temperature" type="number" inputMode="decimal" min="0" max="2" step="0.05" value={config.temperature} aria-invalid={Boolean(errors.temperature)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, temperature: Number(event.target.value) }))} /></label>
          <label htmlFor="tavern-api-frequency-penalty"><span>频率惩罚 · {config.frequencyPenalty.toFixed(2)}</span><input id="tavern-api-frequency-penalty" type="number" inputMode="decimal" min="-2" max="2" step="0.05" value={penaltyDrafts.frequencyPenalty} aria-invalid={Boolean(errors.frequencyPenalty)} onBlur={() => normalizePenaltyDraft('frequencyPenalty')} onChange={(event) => changePenalty('frequencyPenalty', event.target.value)} /></label>
          <label htmlFor="tavern-api-presence-penalty"><span>存在惩罚 · {config.presencePenalty.toFixed(2)}</span><input id="tavern-api-presence-penalty" type="number" inputMode="decimal" min="-2" max="2" step="0.05" value={penaltyDrafts.presencePenalty} aria-invalid={Boolean(errors.presencePenalty)} onBlur={() => normalizePenaltyDraft('presencePenalty')} onChange={(event) => changePenalty('presencePenalty', event.target.value)} /></label>
          <label htmlFor="tavern-api-top-p"><span>Top P · {config.topP.toFixed(2)}</span><input id="tavern-api-top-p" type="number" inputMode="decimal" min="0" max="1" step="0.05" value={config.topP} aria-invalid={Boolean(errors.topP)} onBlur={() => validate(false)} onChange={(event) => setConfig((current) => ({ ...current, topP: Number(event.target.value) }))} /></label>
          <small className="api-parameter-note api-field-wide">上下文长度用于客户端裁剪历史；部分专用协议会忽略其不支持的惩罚参数。</small>
          {Object.entries(errors).filter(([key]) => ['contextLength', 'maxResponseLength', 'temperature', 'frequencyPenalty', 'presencePenalty', 'topP'].includes(key)).map(([key, message]) => <small key={key} className="api-field-error api-field-wide" role="alert">{message}</small>)}
        </div>
      </article>

      <article className="api-flow-card">
        <span className="panel-kicker">请求编排</span><h4>角色卡 → 世界书 → 模型 → 六标签</h4>
        <ol><li><b>01</b><span>收集当前 NPC、好感、游戏变量与最近会话</span></li><li><b>02</b><span>扫描世界书并请求所选模型生成中文回应</span></li><li><b>03</b><span>解析正文、选项、摘要与变量并保存到本机</span></li></ol>
      </article>

      <div className={`api-feedback is-${feedback.tone}`} role={feedback.tone === 'error' ? 'alert' : 'status'} aria-live="polite">
        <GameIcon name={feedback.tone === 'error' ? 'warning' : feedback.tone === 'success' ? 'success' : 'connect'} size={18} />
        <div><strong>{feedback.message}</strong><small>{availableModels.length ? `已读取：${availableModels.slice(0, 3).join('、')}${availableModels.length > 3 ? ' 等' : ''}` : provider.modelsPath ? '测试连接只读取供应商模型目录。' : '此供应商没有模型目录，测试会发送一条最小请求，可能产生极少量费用。'}</small></div>
      </div>

      <footer className="api-actions">
        <button id="tavern-api-test" className="secondary-button" type="button" disabled={feedback.tone === 'testing' || saving} onClick={() => void testConnection()}><GameIcon name="connect" size={17} />{feedback.tone === 'testing' ? '正在测试' : '测试连接'}</button>
        <button id="tavern-api-save" className="primary-button" type="submit" disabled={saving || feedback.tone === 'testing'}><GameIcon name="save" size={17} />{saving ? '正在保存' : '保存接口配置'}</button>
      </footer>
    </form>
  </section>
}
