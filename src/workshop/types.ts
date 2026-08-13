import type { ChatPreset, Lorebook, PortraitSlot } from '../sillytavern/types'

export type WorkshopKind = 'lorebook' | 'preset' | 'portrait-pack'
export type WorkshopSort = 'trending' | 'popular' | 'newest' | 'updated'

export interface WorkshopPortraitCharacter {
  npcId: string
  name: string
  portraitSlots: PortraitSlot[]
}

interface WorkshopPackageBase {
  schemaVersion: 1
  kind: WorkshopKind
  title: string
  description: string
  version: string
  tags: string[]
  createdAt: string
  updatedAt: string
}

export type WorkshopPackage =
  | WorkshopPackageBase & { kind: 'lorebook'; payload: { lorebook: Lorebook } }
  | WorkshopPackageBase & { kind: 'preset'; payload: { preset: ChatPreset } }
  | WorkshopPackageBase & { kind: 'portrait-pack'; payload: { characters: WorkshopPortraitCharacter[] } }

export interface WorkshopAuthor {
  publisherId: string
  login: string
  avatarUrl: string
}

export interface WorkshopCatalogItem {
  packageId: string
  kind: WorkshopKind
  title: string
  description: string
  version: string
  tags: string[]
  author: WorkshopAuthor
  createdAt: string
  updatedAt: string
  revision: number
  gistVersion: string
  stats: { entryCount: number; bytes: number }
  favoriteCount?: number
  withdrawn?: boolean
}

interface WorkshopEventBase {
  schemaVersion: 1
  eventId: string
  actor: string
  actorKey: string
  packageId: string
  occurredAt: string
}

export type WorkshopCatalogEvent =
  | WorkshopEventBase & { action: 'publish'; revision: 1; item: WorkshopCatalogItem; expectedRevision?: never }
  | WorkshopEventBase & { action: 'update'; revision: number; expectedRevision: number; item: WorkshopCatalogItem }
  | WorkshopEventBase & { action: 'withdraw'; revision: number; expectedRevision: number; item?: never }
  | WorkshopEventBase & { action: 'favorite' | 'unfavorite'; revision?: never; expectedRevision?: never; item?: never }

export interface WorkshopCatalogResult {
  items: WorkshopCatalogItem[]
  accepted: WorkshopCatalogEvent[]
  rejected: WorkshopCatalogEvent[]
}
