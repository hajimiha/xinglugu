import type { ImageLlmEntry, ImageLlmPreset } from './types'

const MAX_PRESETS = 100
const MAX_ENTRIES = 200
const MAX_CONTENT = 100000

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function createImageLlmEntry(content = ''): ImageLlmEntry {
  return { id: crypto.randomUUID(), name: '系统指令', role: 'system', content, enabled: true, triggerMode: 'always', triggerWords: '', andTriggerWords: '' }
}

export function createImageLlmPreset(systemTemplate: string): ImageLlmPreset {
  return { id: 'image-llm-default', name: '默认绘图提示词', entries: [{ ...createImageLlmEntry(systemTemplate), id: 'image-llm-system' }] }
}

function readText(value: unknown, fallback: string, maximum = MAX_CONTENT): string {
  if (value === undefined) return fallback
  if (typeof value !== 'string' || value.length > maximum) throw new Error(`预设包含无效文本或超长字段（最多 ${maximum} 字符）。`)
  return value
}

function readPreset(value: unknown, name: string, freshIds: boolean): ImageLlmPreset {
  const source = record(value)
  let entries = source.entries
  if (!entries && Array.isArray(source.history)) {
    entries = source.history.flatMap((item) => {
      const history = record(item)
      return (['user', 'assistant'] as const).filter((role) => typeof history[role] === 'string' && history[role].trim())
        .map((role) => ({ role, content: history[role], enabled: true }))
    })
  }
  if (!entries && typeof source.systemTemplate === 'string') entries = [{ role: 'system', content: source.systemTemplate }]
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) throw new Error('提示词预设须包含 1–200 个消息条目。请导入 st-chatu8 上下文预设，而不是 API 配置或固定画风预设。')
  const presetName = readText(source.name, name, 80).trim()
  if (!presetName) throw new Error('提示词预设名称不能为空。')
  const seenIds = new Set<string>()
  return {
    id: !freshIds && typeof source.id === 'string' && source.id ? source.id : crypto.randomUUID(),
    name: presetName,
    entries: entries.map((value, index) => {
      const entry = record(value)
      const role = entry.role ?? 'system'
      if (role !== 'system' && role !== 'user' && role !== 'assistant') throw new Error('提示词条目角色只能是 system、user 或 assistant。')
      if (entry.triggerMode !== undefined && entry.triggerMode !== 'always' && entry.triggerMode !== 'trigger') throw new Error('提示词条目含不支持的触发方式。')
      let id = !freshIds && typeof entry.id === 'string' && entry.id ? entry.id : crypto.randomUUID()
      if (seenIds.has(id)) id = crypto.randomUUID()
      seenIds.add(id)
      return {
        id, role, name: readText(entry.name, `条目 ${index + 1}`, 80), content: readText(entry.content, ''),
        enabled: entry.enabled !== false, triggerMode: entry.triggerMode === 'trigger' ? 'trigger' : 'always',
        triggerWords: readText(entry.triggerWords, '', 2000), andTriggerWords: readText(entry.andTriggerWords, '', 2000),
      }
    }),
  }
}

export function normalizeImageLlmPresets(value: unknown, fallback: string): ImageLlmPreset[] {
  if (!Array.isArray(value)) return [createImageLlmPreset(fallback)]
  const presets: ImageLlmPreset[] = []
  for (const candidate of value.slice(0, MAX_PRESETS)) {
    try {
      const preset = readPreset(candidate, '绘图提示词', false)
      if (presets.some((item) => item.id === preset.id)) preset.id = crypto.randomUUID()
      presets.push(preset)
    } catch { /* Broken persisted records must not prevent loading the game. */ }
  }
  return presets.length ? presets : [createImageLlmPreset(fallback)]
}

/** Whitelisted data only: never execute imported code or import API profiles/keys. */
export function importImageLlmPresets(value: unknown): ImageLlmPreset[] {
  const root = record(value)
  if (root.type === 'xinglugu-image-llm-preset') return [readPreset(root.preset, '导入预设', true)]
  if (Array.isArray(root.entries) || Array.isArray(root.history) || typeof root.systemTemplate === 'string') return [readPreset(root, '导入预设', true)]
  const collection = record(root.context_presets ?? root.test_context_profiles ?? root.context_profiles ?? root)
  const entries = Object.entries(collection)
  if (!entries.length || entries.length > MAX_PRESETS) throw new Error('文件须包含 1–100 个提示词预设。')
  return entries.map(([name, preset]) => readPreset(preset, name, true))
}

export function exportImageLlmPreset(preset: ImageLlmPreset): string {
  return JSON.stringify({ type: 'xinglugu-image-llm-preset', version: 1, preset: readPreset(preset, preset.name, false) }, null, 2)
}

export function buildImageLlmMessages(preset: ImageLlmPreset, triggerText: string) {
  const matches = (words: string) => words.split(',').some((word) => word.trim() && triggerText.includes(word.trim()))
  return preset.entries.filter((entry) => entry.enabled && entry.content.trim() && (entry.triggerMode !== 'trigger'
    || (matches(entry.triggerWords) && (!entry.andTriggerWords.trim() || matches(entry.andTriggerWords)))))
    .map(({ role, content }) => ({ role, content }))
}
