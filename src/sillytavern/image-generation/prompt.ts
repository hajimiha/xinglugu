import type { ImagePromptPreset, ImagePromptReplacementRule } from './types'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function compactTags(value: string): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of value.split(',').map((tag) => tag.trim()).filter(Boolean)) {
    const key = raw.toLocaleLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(raw)
  }
  return tags
}

function joinTags(...values: string[]): string {
  return compactTags(values.filter(Boolean).join(', ')).join(', ')
}

export function extractTaggedImagePrompt(input: string, triggerStart = 'image###', triggerEnd = '###'): string {
  if (!input) return ''
  const text = input.replace(/<(thinking|think)>[\s\S]*?<\/\1>/gi, '').trim()
  const images = text.match(/<images>([\s\S]*?)<\/images>/i)?.[1]
  if (images) {
    const entries = [...images.matchAll(/<image>([\s\S]*?)<\/image>/gi)]
    const candidate = (entries.at(-1)?.[1] ?? images).trim()
    const nested = candidate.match(/<(?:prompts?|positive)>([\s\S]*?)<\/(?:prompts?|positive)>/i)?.[1]?.trim()
    if (nested) return nested
    const tagged = extractLegacy(candidate, triggerStart, triggerEnd)
    return tagged || candidate
  }
  return extractLegacy(text, triggerStart, triggerEnd)
}

function extractLegacy(input: string, triggerStart: string, triggerEnd: string): string {
  if (!triggerStart || !triggerEnd) return ''
  const pattern = new RegExp(`${escapeRegExp(triggerStart)}([\\s\\S]*?)${escapeRegExp(triggerEnd)}`, 'g')
  return [...input.matchAll(pattern)].at(-1)?.[1]?.trim() ?? ''
}

function removeToken(prompt: string, search: string): string {
  return prompt.replace(new RegExp(escapeRegExp(search), 'gi'), '').replace(/\s*,\s*,+/g, ',').replace(/^\s*,|,\s*$/g, '').trim()
}

export function applyPromptReplacementRules(input: string, rules: ImagePromptReplacementRule[]): string {
  let value = input.trim()
  for (const rule of rules) {
    if (!rule.enabled || !rule.search.trim()) continue
    const search = rule.search.trim()
    const replacement = rule.replacement.trim()
    const matches = new RegExp(escapeRegExp(search), 'i').test(value)
    if (!matches) continue
    if (rule.kind === 'delete') value = removeToken(value, search)
    else if (rule.kind === 'replace') value = value.replace(new RegExp(escapeRegExp(search), 'gi'), replacement)
    else if (rule.kind === 'prepend' && replacement) value = `${replacement}, ${value}`
    else if (rule.kind === 'append' && replacement) value = `${value}, ${replacement}`
  }
  return joinTags(value)
}

export function assembleImagePrompt(input: {
  generatedPositive: string
  generatedNegative: string
  preset: ImagePromptPreset
  replacements: ImagePromptReplacementRule[]
}): { positive: string; negative: string } {
  return {
    positive: applyPromptReplacementRules(joinTags(input.preset.prefix, input.generatedPositive, input.preset.suffix), input.replacements),
    negative: applyPromptReplacementRules(joinTags(input.preset.negative, input.generatedNegative), input.replacements),
  }
}

export interface StructuredImagePrompt {
  title: string
  positive: string
  negative: string
  valid: boolean
}

export function parseStructuredImagePrompt(value: string): StructuredImagePrompt {
  const text = value.trim()
  const block = text.match(/<image_prompt>([\s\S]*?)<\/image_prompt>/i)?.[1]
  if (!block) return { title: '未命名画面', positive: text, negative: '', valid: false }
  const title = block.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim() || '未命名画面'
  const positive = block.match(/<positive>([\s\S]*?)<\/positive>/i)?.[1]?.trim() || ''
  const negative = block.match(/<negative>([\s\S]*?)<\/negative>/i)?.[1]?.trim() || ''
  return { title, positive: positive || text, negative, valid: Boolean(positive) }
}

