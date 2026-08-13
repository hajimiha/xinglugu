import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = resolve(root, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return path.endsWith('.ts') && !path.endsWith('.test.ts') ? [path] : []
  })
}

describe('Vercel Node ESM imports', () => {
  it('uses emitted .js specifiers for every relative runtime import', () => {
    const apiRoot = resolve(process.cwd(), 'api')
    const offenders = sourceFiles(apiRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      return [...source.matchAll(/(?:from\s+|import\s*\()(['"])(\.{1,2}\/[^'"]+)\1/g)]
        .filter((match) => !/\.(?:js|json)$/.test(match[2]))
        .map((match) => `${path.slice(apiRoot.length + 1)} -> ${match[2]}`)
    })

    expect(offenders).toEqual([])
  })
})
