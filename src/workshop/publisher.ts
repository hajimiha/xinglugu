import type { CharacterCard, ChatPreset, Lorebook, PortraitSlot } from '../sillytavern/types'
import { parseWorkshopPackage } from './package-schema'
import type { WorkshopKind, WorkshopPackage } from './types'

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface WorkshopPublishSource {
  lorebooks: Lorebook[]
  presets: ChatPreset[]
  characters: CharacterCard[]
}

export interface WorkshopPublishDraft {
  kind: WorkshopKind
  title: string
  description: string
  version: string
  tags: string[]
  resourceIds: string[]
  createdAt?: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function makePortableSlot(slot: PortraitSlot, fetcher: Fetcher): Promise<PortraitSlot> {
  if (!slot.source || /^data:image\/(?:png|webp);base64,/i.test(slot.source)) return structuredClone(slot)
  const remote = /^https:\/\//i.test(slot.source)
  if (!remote && !/^(?:\.\/|\/)/.test(slot.source)) throw new Error(`立绘 ${slot.id} 使用了无法发布的本地地址。`)
  const response = await fetcher(slot.source, { credentials: remote ? 'omit' : 'same-origin' })
  if (!response.ok) throw new Error(`无法读取立绘 ${slot.id}（${response.status}）。`)
  const type = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
  if (type !== 'image/png' && type !== 'image/webp') throw new Error('立绘组只支持 PNG 或 WebP 图片。')
  const bytes = new Uint8Array(await response.arrayBuffer())
  return { ...slot, source: `data:${type};base64,${bytesToBase64(bytes)}` }
}

export async function buildWorkshopPackage(draft: WorkshopPublishDraft, source: WorkshopPublishSource, fetcher: Fetcher = fetch): Promise<WorkshopPackage> {
  const now = new Date().toISOString()
  const base = {
    schemaVersion: 1 as const,
    title: draft.title,
    description: draft.description,
    version: draft.version,
    tags: draft.tags,
    createdAt: draft.createdAt ?? now,
    updatedAt: now,
  }
  if (draft.kind === 'lorebook') {
    const lorebook = source.lorebooks.find((item) => item.id === draft.resourceIds[0])
    if (!lorebook) throw new Error('请选择要发布的世界书。')
    return parseWorkshopPackage({ ...base, kind: draft.kind, payload: { lorebook: structuredClone(lorebook) } })
  }
  if (draft.kind === 'preset') {
    const preset = source.presets.find((item) => item.id === draft.resourceIds[0])
    if (!preset) throw new Error('请选择要发布的预设。')
    return parseWorkshopPackage({ ...base, kind: draft.kind, payload: { preset: structuredClone(preset) } })
  }
  const selected = source.characters.filter((card) => draft.resourceIds.includes(card.npcId))
  if (!selected.length) throw new Error('请至少选择一位角色的立绘。')
  const characters = await Promise.all(selected.map(async (card) => ({
    npcId: card.npcId,
    name: card.name,
    portraitSlots: await Promise.all(card.portraitSlots.map((slot) => makePortableSlot(slot, fetcher))),
  })))
  return parseWorkshopPackage({ ...base, kind: draft.kind, payload: { characters } })
}

export function reviseWorkshopPackage(pkg: WorkshopPackage, meta: Pick<WorkshopPublishDraft, 'title' | 'description' | 'version' | 'tags'>): WorkshopPackage {
  return parseWorkshopPackage({ ...structuredClone(pkg), ...meta, updatedAt: new Date().toISOString() })
}

export function stampWorkshopPackageDates(pkg: WorkshopPackage, createdAt: string, updatedAt: string): WorkshopPackage {
  return parseWorkshopPackage({ ...structuredClone(pkg), createdAt, updatedAt })
}
