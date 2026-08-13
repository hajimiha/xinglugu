import { evaluateMacros, type MacroContext } from './macro-engine.js'
import type {
  TavernRegexError,
  TavernRegexMatch,
  TavernRegexScope,
  TavernRegexScript,
  TavernRegexStage,
  TavernRegexTarget,
} from './types.js'

export interface RegexExecutionContext {
  stage: TavernRegexStage
  target: TavernRegexTarget
  depth?: number
  macroContext: MacroContext
  variables?: Record<string, unknown>
}

export interface RegexExecutionResult {
  text: string
  matches: TavernRegexMatch[]
  errors: TavernRegexError[]
  variables: Record<string, unknown>
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function stageArray(value: unknown): TavernRegexStage[] | null {
  if (!Array.isArray(value)) return null
  const stages = value.filter((item): item is TavernRegexStage => item === 'prompt' || item === 'output' || item === 'display')
  return stages.length ? Array.from(new Set(stages)) : null
}

function targetArray(value: unknown): TavernRegexTarget[] | null {
  if (!Array.isArray(value)) return null
  const targets = value.filter((item): item is TavernRegexTarget => item === 'user' || item === 'assistant')
  return targets.length ? Array.from(new Set(targets)) : null
}

export function parseRegexScripts(
  value: unknown,
  defaultScope: TavernRegexScope = 'global',
  options: { validatePatterns?: boolean } = {},
): TavernRegexScript[] {
  if (!Array.isArray(value)) throw new Error('正则脚本必须是数组。')
  const ids = new Set<string>()
  return value.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`regexScripts[${index}] 必须是对象。`)
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `regex-${index + 1}`
    if (ids.has(id)) throw new Error(`正则脚本 ID ${id} 重复。`)
    ids.add(id)
    const pattern = typeof source.pattern === 'string'
      ? source.pattern
      : typeof source.findRegex === 'string' ? source.findRegex : ''
    if (!pattern) throw new Error(`regexScripts[${index}].pattern 不能为空。`)
    if (options.validatePatterns) {
      try { compileRegex(pattern) } catch (caught) {
        throw new Error(`regexScripts[${index}].pattern 无效：${caught instanceof Error ? caught.message : '无法编译'}`)
      }
    }
    const placement = Array.isArray(source.placement) ? source.placement.filter((entry): entry is number => typeof entry === 'number') : []
    const promptOnly = source.promptOnly === true
    const markdownOnly = source.markdownOnly === true
    const stages = stageArray(source.stages)
      ?? (promptOnly && markdownOnly ? ['prompt', 'display'] : promptOnly ? ['prompt'] : markdownOnly ? ['display'] : ['prompt', 'output', 'display'])
    const targets = targetArray(source.targets)
      ?? Array.from(new Set([
        ...(placement.includes(1) ? ['user' as const] : []),
        ...(placement.includes(2) ? ['assistant' as const] : []),
      ]))
    const scope = source.scope === 'preset' || source.scope === 'global' ? source.scope : defaultScope
    const existingCompatibility = source.compatibility && typeof source.compatibility === 'object' && !Array.isArray(source.compatibility)
      ? source.compatibility as Record<string, unknown>
      : null
    const existingRaw = existingCompatibility?.raw && typeof existingCompatibility.raw === 'object' && !Array.isArray(existingCompatibility.raw)
      ? existingCompatibility.raw as Record<string, unknown>
      : null
    const isSillyTavernDialect = ['scriptName', 'findRegex', 'replaceString', 'placement', 'promptOnly', 'markdownOnly', 'runOnEdit', 'substituteRegex']
      .some((key) => key in source)
    return {
      id,
      name: typeof source.name === 'string' && source.name.trim()
        ? source.name.trim()
        : typeof source.scriptName === 'string' && source.scriptName.trim() ? source.scriptName.trim() : `正则脚本 ${index + 1}`,
      enabled: typeof source.enabled === 'boolean' ? source.enabled : source.disabled !== true,
      pattern,
      replacement: typeof source.replacement === 'string'
        ? source.replacement
        : typeof source.replaceString === 'string' ? source.replaceString : '',
      trimStrings: stringArray(source.trimStrings),
      stages,
      targets: targets.length ? targets : ['user', 'assistant'],
      minDepth: typeof source.minDepth === 'number' && Number.isFinite(source.minDepth) ? Math.max(0, Math.round(source.minDepth)) : undefined,
      maxDepth: typeof source.maxDepth === 'number' && Number.isFinite(source.maxDepth) ? Math.max(0, Math.round(source.maxDepth)) : undefined,
      scope,
      order: typeof source.order === 'number' && Number.isFinite(source.order) ? source.order : index,
      ...((existingRaw || isSillyTavernDialect) ? {
        compatibility: {
          dialect: 'sillytavern' as const,
          raw: structuredClone(existingRaw ?? source),
        },
      } : {}),
    }
  })
}

export function getPresetRegexScripts(settings: Record<string, unknown>): TavernRegexScript[] {
  const extensions = settings.extensions && typeof settings.extensions === 'object'
    ? settings.extensions as Record<string, unknown>
    : {}
  const raw = settings.regex_scripts ?? extensions.regex_scripts
  if (raw === undefined) return []
  return parseRegexScripts(raw, 'preset')
}

export function getRuntimePresetRegexScripts(settings: Record<string, unknown>): TavernRegexScript[] {
  try {
    return getPresetRegexScripts(settings)
  } catch {
    return []
  }
}

function stagesFromRaw(raw: Record<string, unknown>): TavernRegexStage[] {
  if (raw.promptOnly === true && raw.markdownOnly === true) return ['prompt', 'display']
  if (raw.promptOnly === true) return ['prompt']
  if (raw.markdownOnly === true) return ['display']
  return ['prompt', 'output', 'display']
}

export function exportRegexScripts(scripts: TavernRegexScript[]): Record<string, unknown>[] {
  return scripts.map((script) => {
    const raw = script.compatibility?.dialect === 'sillytavern'
      ? structuredClone(script.compatibility.raw)
      : {}
    const exported: Record<string, unknown> = {
      ...raw,
      id: script.id,
      scriptName: script.name,
      findRegex: script.pattern,
      replaceString: script.replacement,
      trimStrings: [...script.trimStrings],
      placement: [
        ...(script.targets.includes('user') ? [1] : []),
        ...(script.targets.includes('assistant') ? [2] : []),
      ],
      disabled: !script.enabled,
      minDepth: script.minDepth,
      maxDepth: script.maxDepth,
    }
    const originalStages = script.compatibility ? stagesFromRaw(raw) : null
    if (!originalStages || JSON.stringify(originalStages) !== JSON.stringify(script.stages)) {
      if (script.stages.length === 1 && script.stages[0] === 'prompt') {
        exported.promptOnly = true
        delete exported.markdownOnly
      } else if (script.stages.length === 1 && script.stages[0] === 'display') {
        exported.markdownOnly = true
        delete exported.promptOnly
      } else {
        exported.promptOnly = false
        exported.markdownOnly = false
        exported.stages = [...script.stages]
      }
    }
    return exported
  })
}

export function putPresetRegexScripts(settings: Record<string, unknown>, scripts: TavernRegexScript[]): Record<string, unknown> {
  const extensions = settings.extensions && typeof settings.extensions === 'object'
    ? settings.extensions as Record<string, unknown>
    : {}
  return {
    ...settings,
    extensions: { ...extensions, regex_scripts: exportRegexScripts(scripts.map((script) => ({ ...script, scope: 'preset' }))) },
  }
}

function compileRegex(pattern: string): RegExp {
  if (pattern.startsWith('/')) {
    const end = pattern.lastIndexOf('/')
    if (end > 0) return new RegExp(pattern.slice(1, end), pattern.slice(end + 1))
  }
  return new RegExp(pattern, 'g')
}

function expandReplacement(
  template: string,
  match: string,
  captures: unknown[],
  groups: Record<string, string> | undefined,
  variables: Record<string, unknown>,
  context: MacroContext,
): { text: string; variables: Record<string, unknown> } {
  let replacement = template
    .replace(/\$0|\$&|\{\{match\}\}/gi, match)
    .replace(/\$(\d+)/g, (_full, index: string) => String(captures[Number(index) - 1] ?? ''))
    .replace(/\$<([^>]+)>/g, (_full, name: string) => groups?.[name] ?? '')
    .replace(/\{\{match(?:::|)(\d+)\}\}/gi, (_full, index: string) => String(captures[Number(index) - 1] ?? ''))
  const evaluated = evaluateMacros(replacement, variables, context)
  replacement = evaluated.text
  return { text: replacement, variables: evaluated.variables }
}

export function applyRegexScripts(
  input: string,
  scripts: TavernRegexScript[],
  context: RegexExecutionContext,
): RegexExecutionResult {
  let text = input
  let variables = { ...(context.variables ?? {}) }
  const matches: TavernRegexMatch[] = []
  const errors: TavernRegexError[] = []
  const depth = context.depth ?? 0
  for (const script of [...scripts].sort((left, right) => left.order - right.order)) {
    if (!script.enabled || !script.stages.includes(context.stage) || !script.targets.includes(context.target)) continue
    if (script.minDepth !== undefined && depth < script.minDepth) continue
    if (script.maxDepth !== undefined && depth > script.maxDepth) continue
    try {
      const regex = compileRegex(script.pattern)
      const before = text
      let count = 0
      text = text.replace(regex, (match, ...args: unknown[]) => {
        count += 1
        const maybeGroups = args.at(-1)
        const groups = maybeGroups && typeof maybeGroups === 'object' ? maybeGroups as Record<string, string> : undefined
        const captureEnd = groups ? -3 : -2
        const captures = args.slice(0, captureEnd)
        const expanded = expandReplacement(script.replacement, match, captures, groups, variables, context.macroContext)
        variables = expanded.variables
        return expanded.text
      })
      for (const trim of script.trimStrings) {
        if (trim) text = text.split(trim).join('')
      }
      if (count || text !== before) matches.push({ scriptId: script.id, scriptName: script.name, count, before, after: text })
    } catch (caught) {
      errors.push({
        scriptId: script.id,
        scriptName: script.name,
        message: caught instanceof Error ? caught.message : '正则执行失败。',
      })
    }
  }
  return { text, matches, errors, variables }
}
