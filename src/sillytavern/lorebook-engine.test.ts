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
  it('distinguishes and_any from and_all with partial primary and secondary matches', () => {
    expect(match('and_any', 'alpha', 'gate')).toBe(1)
    expect(match('and_all', 'alpha', 'gate')).toBe(0)
    expect(match('and_any', 'alpha', 'gate lock')).toBe(1)
    expect(match('and_all', 'alpha', 'gate lock')).toBe(1)
  })

  it('distinguishes not_any from not_all with partial primary and secondary matches', () => {
    expect(match('not_any', 'alpha', 'gate')).toBe(0)
    expect(match('not_all', 'alpha', 'gate')).toBe(1)
    expect(match('not_any', 'alpha', 'other')).toBe(1)
    expect(match('not_all', 'alpha', 'other')).toBe(1)
  })

  it.each(['alpha', 'beta'])('applies selective logic consistently for partial primary key %s matches', (primaryText) => {
    expect(match('and_all', primaryText, 'gate')).toBe(0)
    expect(match('and_all', primaryText, 'gate lock')).toBe(1)
    expect(match('not_all', primaryText, 'gate')).toBe(1)
    expect(match('not_all', primaryText, 'gate lock')).toBe(0)
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
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false, caseSensitive: true }], { caseSensitive: false })).scan('CAT')).toHaveLength(0)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false, matchWholeWords: true }], { matchWholeWords: false })).scan('scatter')).toHaveLength(0)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false, matchWholeWords: false }], { matchWholeWords: true })).scan('scatter')).toHaveLength(1)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['猫'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('小猫。')).toHaveLength(0)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['猫'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('猫。')).toHaveLength(1)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('a cat!')).toHaveLength(1)
    expect(createLorebookEngine(book('book', [{ ...entryDefaults, keys: ['cat'], secondaryKeys: [], selective: false }], { matchWholeWords: true })).scan('cater')).toHaveLength(0)
  })

  it('only invokes injected probability when useProbability is enabled', () => {
    const random = vi.fn(() => 0.99)
    const deterministic = createLorebookEngine(book('book', [{ ...entryDefaults, probability: 0, useProbability: false }]))
    expect(deterministic.scan('alpha gate', undefined, { random })).toHaveLength(1)
    expect(random).not.toHaveBeenCalled()

    const probabilistic = createLorebookEngine(book('book', [{ ...entryDefaults, probability: 0, useProbability: true }]))
    expect(probabilistic.scan('alpha gate', undefined, { random })).toHaveLength(0)
    expect(random).toHaveBeenCalledTimes(1)
    const omitted = createLorebookEngine(book('book', [{ ...entryDefaults, probability: 0 }]))
    expect(omitted.scan('alpha gate', undefined, { random })).toHaveLength(1)
  })

  it('keeps duplicate entry IDs distinct across books', () => {
    const entries = [entryDefaults]
    const result = [createLorebookEngine(book('one', entries)), createLorebookEngine(book('two', entries))]
      .flatMap((engine) => engine.scan('alpha gate'))
    expect(result.map((item) => item.identity)).toEqual(['["one","entry"]', '["two","entry"]'])
    const collisionSafe = [
      createLorebookEngine(book('a:b', [{ ...entryDefaults, id: 'c' }])),
      createLorebookEngine(book('a', [{ ...entryDefaults, id: 'b:c' }])),
    ].flatMap((engine) => engine.scan('alpha gate'))
    expect(new Set(collisionSafe.map((item) => item.identity)).size).toBe(2)
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

  it('does not seed recursion from a depth-zero preventRecursion match', () => {
    const seed = { ...entryDefaults, id: 'seed', keys: ['seed'], content: 'child', selective: false, preventRecursion: true }
    const child = { ...entryDefaults, id: 'child', keys: ['child'], content: 'should-not-match', selective: false }
    const result = createLorebookEngine(book('book', [seed, child], { recursiveScanning: true })).recursiveScan('seed', 3)
    expect(result.map((item) => item.entry.id)).toEqual(['seed'])
  })

  it('limits recursive matches using each entry scanDepth', () => {
    const seed = { ...entryDefaults, id: 'seed', keys: ['seed'], content: 'child', selective: false, scanDepth: 1 }
    const child = { ...entryDefaults, id: 'child', keys: ['child'], content: 'grandchild', selective: false, scanDepth: 0 }
    const grandchild = { ...entryDefaults, id: 'grandchild', keys: ['grandchild'], content: 'end', selective: false }

    const result = createLorebookEngine(book('book', [seed, child, grandchild], { recursiveScanning: true }))
      .recursiveScan('seed', 5)

    expect(result.map((item) => item.entry.id).sort()).toEqual(['child', 'seed'])
  })

  it('does not return entries already present in the recursion context', () => {
    const entry = { ...entryDefaults, selective: false }
    const result = createLorebookEngine(book('book', [entry])).scan('alpha', undefined, {
      recursion: { depth: 1, isRecursion: true, seen: new Set(['["book","entry"]']) },
    })
    expect(result).toHaveLength(0)
  })

  it('reports effective depth and position metadata without changing imported fields', () => {
    const entry = { ...entryDefaults, depth: 4, position: 'at_depth' as const, selective: false, customImportedField: 'preserved' }
    const result = createLorebookEngine(book('book', [entry])).scan('alpha')
    expect(result[0]).toMatchObject({ depth: 0, effectiveDepth: 4, position: 'at_depth', entry: { customImportedField: 'preserved' } })
  })
})
