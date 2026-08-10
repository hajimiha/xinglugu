import { describe, expect, it, vi } from 'vitest'
import { createLorebookEngine } from './lorebook-engine'
import type { Lorebook, LorebookEntry } from './types'

const entryDefaults: LorebookEntry = {
  id: 'entry', keys: ['alpha', 'beta'], secondaryKeys: ['gate', 'lock'], content: 'entry-content',
  order: 1, position: 'after_char', selective: true, selectiveLogic: 'and_any', constant: false,
  probability: 100, addMemo: true,
}

function book(id: string, entries: LorebookEntry[], overrides: Partial<Lorebook> = {}): Lorebook {
  return {
    id, name: id, entries, recursiveScanning: false, caseSensitive: false, matchWholeWords: false,
    createdAt: 0, updatedAt: 0, ...overrides,
  }
}

function match(logic: LorebookEntry['selectiveLogic'], text: string, context: string, secondaryKeys = entryDefaults.secondaryKeys) {
  const entry = { ...entryDefaults, selectiveLogic: logic, secondaryKeys }
  return createLorebookEngine(book('book', [entry])).scan(text, context).length
}

describe('deterministic lorebook matching', () => {
  it.each([
    ['and_any', 1, 0], ['and_all', 1, 0], ['not_any', 0, 1], ['not_all', 0, 1],
  ] as const)('%s applies the primary and secondary truth table', (logic, matching, nonMatching) => {
    expect(match(logic, 'alpha beta', 'gate lock')).toBe(matching)
    expect(match(logic, 'alpha beta', 'other')).toBe(nonMatching)
  })

  it('uses entry matching overrides without changing unrelated imported fields', () => {
    const entry = { ...entryDefaults, keys: ['Alpha'], selective: false, caseSensitive: true, matchWholeWords: true, probability: 0, useProbability: false, comment: 'keep me' }
    const result = createLorebookEngine(book('book', [entry], { caseSensitive: false, matchWholeWords: false })).scan('Alpha')
    expect(result).toHaveLength(1)
    expect(result[0].entry.comment).toBe('keep me')
  })

  it('supports book and entry case sensitivity and whole-word matching', () => {
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['Cat'], secondaryKeys: [], selective: false }], { caseSensitive: true })).scan('cat')).toHaveLength(0)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('scatter')).toHaveLength(0)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('a cat')).toHaveLength(1)
  })

  it('only invokes injected probability when useProbability is enabled', () => {
    const random = vi.fn(() => 0.99)
    const deterministic = createLorebookEngine(book('book', [{ ...entryDefaults, probability: 0, useProbability: false }]))
    expect(deterministic.scan('alpha gate', undefined, { random })).toHaveLength(1)
    expect(random).not.toHaveBeenCalled()

    const probabilistic = createLorebookEngine(book('book', [{ ...entryDefaults, probability: 0, useProbability: true }]))
    expect(probabilistic.scan('alpha gate', undefined, { random })).toHaveLength(0)
    expect(random).toHaveBeenCalledTimes(1)
  })

  it('keeps duplicate entry IDs distinct across books', () => {
    const entries = [entryDefaults]
    const result = [createLorebookEngine(book('one', entries)), createLorebookEngine(book('two', entries))]
      .flatMap((engine) => engine.scan('alpha gate'))
    expect(result.map((item) => item.identity)).toEqual(['one:entry', 'two:entry'])
  })

  it('honors recursion exclusion and terminates bounded cyclic recursion', () => {
    const first = { ...entryDefaults, id: 'first', keys: ['seed'], content: 'cycle', selective: false, excludeRecursion: true }
    const second = { ...entryDefaults, id: 'second', keys: ['cycle'], content: 'seed', selective: false }
    const result = createLorebookEngine(book('book', [first, second], { recursiveScanning: true }))
      .recursiveScan('seed', 5)
    expect(result.map((item) => item.entry.id)).toEqual(['first'])

    const cyclic = createLorebookEngine(book('cycle-book', [
      { ...first, excludeRecursion: false }, second,
    ], { recursiveScanning: true })).recursiveScan('seed', 5)
    expect(cyclic.map((item) => item.entry.id)).toEqual(['first', 'second'])
    expect(Math.max(...cyclic.map((item) => item.depth))).toBeLessThanOrEqual(1)
  })
})
