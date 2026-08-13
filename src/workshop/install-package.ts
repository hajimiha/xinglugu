import type { CharacterCard, ChatPreset, Lorebook } from '../sillytavern/types'
import { parseWorkshopPackage } from './package-schema'
import type { WorkshopPackage } from './types'

export interface WorkshopInstallAdapter {
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
  saveLorebook(value: Lorebook): Promise<void>
  savePreset(value: ChatPreset): Promise<void>
  saveCharacters(values: CharacterCard[]): Promise<void>
}

export interface WorkshopInstallPreview {
  kind: WorkshopPackage['kind']
  label: string
  matchedCharacters: number
  skippedCharacters: string[]
}

export interface WorkshopInstallResult extends WorkshopInstallPreview {
  installedIds: string[]
}

export function previewWorkshopInstall(input: WorkshopPackage, adapter: Pick<WorkshopInstallAdapter, 'lorebooks' | 'presets' | 'characters'>): WorkshopInstallPreview {
  const pkg = parseWorkshopPackage(input)
  if (pkg.kind === 'lorebook') return { kind: pkg.kind, label: `新建世界书“${pkg.payload.lorebook.name} · 工坊”`, matchedCharacters: 0, skippedCharacters: [] }
  if (pkg.kind === 'preset') return { kind: pkg.kind, label: `新建预设“${pkg.payload.preset.name} · 工坊”`, matchedCharacters: 0, skippedCharacters: [] }
  const localNpcIds = new Set(adapter.characters.map((card) => card.npcId))
  return {
    kind: pkg.kind,
    label: `更新 ${pkg.payload.characters.filter((character) => localNpcIds.has(character.npcId)).length} 位角色的立绘槽`,
    matchedCharacters: pkg.payload.characters.filter((character) => localNpcIds.has(character.npcId)).length,
    skippedCharacters: pkg.payload.characters.filter((character) => !localNpcIds.has(character.npcId)).map((character) => character.name),
  }
}

const uniqueName = (base: string, existing: readonly string[]) => {
  const stem = `${base} · 工坊`
  if (!existing.includes(stem)) return stem
  let index = 2
  while (existing.includes(`${stem} ${index}`)) index += 1
  return `${stem} ${index}`
}

export async function installWorkshopPackage(input: WorkshopPackage, adapter: WorkshopInstallAdapter): Promise<WorkshopInstallResult> {
  const pkg = parseWorkshopPackage(input)
  const preview = previewWorkshopInstall(pkg, adapter)
  const now = Date.now()
  if (pkg.kind === 'lorebook') {
    const id = crypto.randomUUID()
    await adapter.saveLorebook({ ...structuredClone(pkg.payload.lorebook), id, name: uniqueName(pkg.payload.lorebook.name, adapter.lorebooks.map((item) => item.name)), createdAt: now, updatedAt: now })
    return { ...preview, installedIds: [id] }
  }
  if (pkg.kind === 'preset') {
    const id = crypto.randomUUID()
    await adapter.savePreset({ ...structuredClone(pkg.payload.preset), id, name: uniqueName(pkg.payload.preset.name, adapter.presets.map((item) => item.name)), createdAt: now, updatedAt: now })
    return { ...preview, installedIds: [id] }
  }

  const updates = pkg.payload.characters.flatMap((published) => {
    const current = adapter.characters.find((card) => card.npcId === published.npcId)
    return current ? [{ ...current, portraitSlots: structuredClone(published.portraitSlots), updatedAt: now }] : []
  })
  await adapter.saveCharacters(updates)
  return { ...preview, installedIds: updates.map((update) => update.id) }
}
