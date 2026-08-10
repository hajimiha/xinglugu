/** Deterministic SillyTavern-style lorebook matching and recursion. */

import type {
  Lorebook,
  LorebookEntry,
  LorebookMatchOptions,
  LorebookRecursionContext,
  MatchedEntry,
} from './types'

const DEFAULT_RECURSION: LorebookRecursionContext = { depth: 0, isRecursion: false, seen: new Set() }

export class LorebookEngine {
  private lorebook: Lorebook

  constructor(lorebook: Lorebook) {
    this.lorebook = lorebook
  }

  scan(text: string, additionalContext?: string, options: LorebookMatchOptions = {}): MatchedEntry[] {
    const recursion = options.recursion ?? DEFAULT_RECURSION
    const matched: MatchedEntry[] = []
    for (const entry of this.lorebook.entries) {
      if (entry.disabled || entry.excluded || (recursion.isRecursion && entry.excludeRecursion)) continue
      const effective = this.effectiveOptions(entry)
      if (entry.constant) {
        matched.push(this.toMatch(entry, ['constant'], recursion.depth, effective.position))
        continue
      }
      if (effective.useProbability && (options.random ?? Math.random)() * 100 >= effective.probability) continue
      const entryText = this.normalize(text, effective.caseSensitive)
      const contextText = this.normalize(additionalContext ?? text, effective.caseSensitive)
      if (!this.checkEntryMatch(entry, entryText, contextText, effective)) continue
      matched.push(this.toMatch(
        entry,
        entry.keys.filter((key) => this.containsKeyword(entryText, this.normalizeKeyword(key, effective.caseSensitive), effective.matchWholeWords)),
        recursion.depth,
        effective.position,
      ))
    }
    return matched.sort((a, b) => a.score - b.score || a.identity.localeCompare(b.identity))
  }

  recursiveScan(initialText: string, maxDepth = 3, additionalContext?: string, options: LorebookMatchOptions = {}): MatchedEntry[] {
    if (!this.lorebook.recursiveScanning || maxDepth <= 0) return this.scan(initialText, additionalContext, options)
    const allMatched = new Map<string, MatchedEntry>()
    let currentText = initialText
    let depth = 0
    while (depth < maxDepth) {
      const newMatches = this.scan(currentText, additionalContext, {
        ...options,
        recursion: { depth, isRecursion: depth > 0, seen: new Set(allMatched.keys()) },
      })
      let added = false
      for (const match of newMatches) {
        if (allMatched.has(match.identity) || (depth > 0 && match.entry.preventRecursion)) continue
        allMatched.set(match.identity, match)
        if (!match.entry.excludeRecursion) currentText += ` ${match.entry.content}`
        added = true
      }
      if (!added) break
      depth++
    }
    return Array.from(allMatched.values()).sort((a, b) => a.score - b.score || a.identity.localeCompare(b.identity))
  }

  groupByPosition(matched: MatchedEntry[]): Record<LorebookEntry['position'], MatchedEntry[]> {
    const grouped: Record<LorebookEntry['position'], MatchedEntry[]> = {
      before_char: [], after_char: [], before_example: [], after_example: [], at_depth: [],
      example_msg_top: [], example_msg_bottom: [], outlet: [],
    }
    for (const item of matched) grouped[item.position].push(item)
    return grouped
  }

  formatEntriesContent(entries: MatchedEntry[]): string {
    return entries.map((entry) => entry.entry.content).join('\n\n')
  }

  private effectiveOptions(entry: LorebookEntry) {
    return {
      caseSensitive: entry.caseSensitive ?? this.lorebook.caseSensitive,
      matchWholeWords: entry.matchWholeWords ?? this.lorebook.matchWholeWords,
      useProbability: entry.useProbability ?? true,
      probability: entry.probability,
      position: entry.position,
    }
  }

  private toMatch(entry: LorebookEntry, matchedKeywords: string[], depth: number, position: LorebookEntry['position']): MatchedEntry {
    return { entry, score: entry.order, matchedKeywords, identity: `${this.lorebook.id}:${entry.id}`, lorebookId: this.lorebook.id, entryId: entry.id, depth, position, effectiveDepth: entry.depth }
  }

  private checkEntryMatch(entry: LorebookEntry, text: string, context: string, options: ReturnType<LorebookEngine['effectiveOptions']>): boolean {
    const primary = entry.keys.map((key) => this.containsKeyword(text, this.normalizeKeyword(key, options.caseSensitive), options.matchWholeWords))
    if (!primary.length || !primary.some(Boolean)) return false
    if (!entry.selective || !entry.secondaryKeys.length) return true
    const secondary = entry.secondaryKeys.map((key) => this.containsKeyword(context, this.normalizeKeyword(key, options.caseSensitive), options.matchWholeWords))
    const any = secondary.some(Boolean)
    const all = secondary.every(Boolean)
    switch (entry.selectiveLogic) {
      case 'and_all': return all
      case 'not_any': return !any
      case 'not_all': return !all
      case 'and_any': return any
    }
  }

  private normalize(value: string, caseSensitive: boolean): string {
    return caseSensitive ? value : value.toLowerCase()
  }

  private normalizeKeyword(keyword: string, caseSensitive: boolean): string {
    return this.normalize(keyword, caseSensitive)
  }

  private containsKeyword(text: string, keyword: string, wholeWords: boolean): boolean {
    if (!wholeWords) return text.includes(keyword)
    return new RegExp(`\\b${this.escapeRegex(keyword)}\\b`).test(text)
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
}

export function createLorebookEngine(lorebook: Lorebook): LorebookEngine {
  return new LorebookEngine(lorebook)
}
