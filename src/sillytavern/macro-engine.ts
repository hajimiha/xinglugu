import type { MacroOperation } from './types'

export interface MacroContext {
  userName: string
  characterName: string
  original: string
  lastUserMessage?: string
  lastCharacterMessage?: string
}

export interface MacroEvaluation {
  text: string
  variables: Record<string, unknown>
  operations: MacroOperation[]
  unknownMacros: string[]
  diagnostics: string[]
}

export interface MacroEvaluationOptions {
  random?: () => number
}

function parseScalar(value: string): string | number | boolean {
  const trimmed = value.trim()
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) return Number(trimmed)
  if (/^true$/i.test(trimmed)) return true
  if (/^false$/i.test(trimmed)) return false
  return value
}

function randomIndex(length: number, random: () => number): number {
  if (length <= 1) return 0
  const value = Math.min(0.999999999, Math.max(0, random()))
  return Math.floor(value * length)
}

function rollDice(expression: string, random: () => number): number | null {
  const match = expression.trim().match(/^(\d*)d(\d+)(?:\s*([+-])\s*(\d+))?$/i)
  if (!match) return null
  const count = Math.max(1, Math.min(100, Number(match[1] || 1)))
  const sides = Math.max(1, Math.min(1_000_000, Number(match[2])))
  const modifier = match[4] ? Number(match[4]) * (match[3] === '-' ? -1 : 1) : 0
  let total = modifier
  for (let index = 0; index < count; index += 1) {
    total += randomIndex(sides, random) + 1
  }
  return total
}

function splitCommand(body: string): { command: string; args: string[] } {
  const doubleColon = body.indexOf('::')
  if (doubleColon >= 0) {
    const command = body.slice(0, doubleColon).trim().toLowerCase()
    return { command, args: body.slice(doubleColon + 2).split('::') }
  }
  const space = body.search(/\s/)
  if (space >= 0) {
    return { command: body.slice(0, space).trim().toLowerCase(), args: [body.slice(space + 1).trim()] }
  }
  return { command: body.trim().toLowerCase(), args: [] }
}

export function evaluateMacros(
  text: string,
  initialVariables: Record<string, unknown>,
  context: MacroContext,
  options: MacroEvaluationOptions = {},
): MacroEvaluation {
  const variables = { ...initialVariables }
  const operations: MacroOperation[] = []
  const unknownMacros: string[] = []
  const diagnostics: string[] = []
  const random = options.random ?? Math.random
  let shouldTrim = false

  let compiled = text.replace(/\{\{([\s\S]*?)\}\}/g, (full, untrimmedBody: string) => {
    const body = untrimmedBody.trim()
    if (body.startsWith('//') || (body.startsWith('!--') && body.endsWith('--'))) {
      operations.push({ type: 'comment', macro: full })
      return ''
    }

    const { command, args } = splitCommand(body)
    const key = args[0]?.trim()
    if (command === 'setvar' && key) {
      const value = parseScalar(args.slice(1).join('::'))
      variables[key] = value
      operations.push({ type: 'set', macro: full, key, value })
      return ''
    }
    if (command === 'addvar' && key) {
      const addition = parseScalar(args.slice(1).join('::'))
      const current = variables[key]
      const value = typeof current === 'number' && typeof addition === 'number'
        ? current + addition
        : `${current ?? ''}${addition}`
      variables[key] = value
      operations.push({ type: 'add', macro: full, key, value })
      return ''
    }
    if (command === 'getvar' && key) {
      const value = variables[key]
      operations.push({ type: 'read', macro: full, key, value })
      if (value === undefined) diagnostics.push(`变量 ${key} 尚未定义。`)
      return value === undefined ? '' : String(value)
    }
    if (command === 'trim') {
      shouldTrim = true
      operations.push({ type: 'trim', macro: full })
      return ''
    }
    if (command === 'random') {
      const candidates = args.length > 1
        ? args
        : (args[0] ?? '').split(',')
      const cleaned = candidates.map((candidate) => candidate.trim()).filter(Boolean)
      const value = cleaned[randomIndex(cleaned.length, random)] ?? ''
      operations.push({ type: 'random', macro: full, value })
      return value
    }
    if (command === 'roll') {
      const value = rollDice(args.join('::'), random)
      if (value === null) {
        diagnostics.push(`无法解析骰子表达式：${args.join('::')}`)
        unknownMacros.push(full)
        return full
      }
      operations.push({ type: 'roll', macro: full, value })
      return String(value)
    }

    const builtIns: Record<string, string> = {
      user: context.userName,
      char: context.characterName,
      original: context.original,
      lastusermessage: context.lastUserMessage ?? '',
      lastcharmessage: context.lastCharacterMessage ?? '',
      lastcharactermessage: context.lastCharacterMessage ?? '',
    }
    if (Object.prototype.hasOwnProperty.call(builtIns, command) && args.length === 0) {
      operations.push({ type: 'read', macro: full, key: command, value: builtIns[command] })
      return builtIns[command]
    }
    if (args.length === 0 && Object.prototype.hasOwnProperty.call(variables, body)) {
      const value = variables[body]
      operations.push({ type: 'read', macro: full, key: body, value })
      return String(value)
    }

    unknownMacros.push(full)
    return full
  })

  compiled = compiled.replace(/\$\{([^{}]+)\}/g, (full, rawKey: string) => {
    const key = rawKey.trim()
    if (!Object.prototype.hasOwnProperty.call(variables, key)) {
      unknownMacros.push(full)
      return full
    }
    const value = variables[key]
    operations.push({ type: 'read', macro: full, key, value })
    return String(value)
  })

  return {
    text: shouldTrim ? compiled.trim() : compiled,
    variables,
    operations,
    unknownMacros: Array.from(new Set(unknownMacros)),
    diagnostics,
  }
}
