import type { WorkshopCatalogEvent, WorkshopCatalogItem, WorkshopCatalogResult, WorkshopSort } from './types.js'

export type { WorkshopCatalogEvent } from './types'

const validDate = (value: string) => Number.isFinite(Date.parse(value))
const isOwnedItem = (event: WorkshopCatalogEvent, item: WorkshopCatalogItem) => (
  event.actorKey === item.author.publisherId && event.packageId === item.packageId && validDate(event.occurredAt)
)

export function foldWorkshopCatalog(events: readonly WorkshopCatalogEvent[]): WorkshopCatalogResult {
  const records = new Map<string, WorkshopCatalogItem>()
  const favorites = new Map<string, Set<string>>()
  const accepted: WorkshopCatalogEvent[] = []
  const rejected: WorkshopCatalogEvent[] = []

  for (const event of events) {
    const current = records.get(event.packageId)
    if (event.schemaVersion !== 1 || !event.actorKey || !event.actor || !event.packageId || !validDate(event.occurredAt)) {
      rejected.push(event); continue
    }
    if (event.action === 'publish') {
      if (current || event.revision !== 1 || !isOwnedItem(event, event.item) || event.item.revision !== 1) rejected.push(event)
      else { records.set(event.packageId, { ...event.item }); accepted.push(event) }
      continue
    }
    if (event.action === 'update') {
      if (!current || current.withdrawn || event.actorKey !== current.author.publisherId || event.expectedRevision !== current.revision || event.revision !== current.revision + 1 || !isOwnedItem(event, event.item) || event.item.revision !== event.revision) rejected.push(event)
      else { records.set(event.packageId, { ...event.item, createdAt: current.createdAt }); accepted.push(event) }
      continue
    }
    if (event.action === 'withdraw') {
      if (!current || current.withdrawn || event.actorKey !== current.author.publisherId || event.expectedRevision !== current.revision || event.revision !== current.revision + 1) rejected.push(event)
      else { records.set(event.packageId, { ...current, revision: event.revision, withdrawn: true }); accepted.push(event) }
      continue
    }
    if (!current || current.withdrawn) { rejected.push(event); continue }
    const actors = favorites.get(event.packageId) ?? new Set<string>()
    if (event.action === 'favorite') actors.add(event.actorKey)
    else actors.delete(event.actorKey)
    favorites.set(event.packageId, actors)
    accepted.push(event)
  }
  const items = [...records.values()]
    .filter((item) => !item.withdrawn)
    .map((item) => ({ ...item, favoriteCount: favorites.get(item.packageId)?.size ?? 0 }))
  return { items, accepted, rejected }
}

export function sortWorkshopItems(items: readonly WorkshopCatalogItem[], sort: WorkshopSort, now = Date.now()): WorkshopCatalogItem[] {
  return [...items].sort((left, right) => {
    if (sort === 'popular') return (right.favoriteCount ?? 0) - (left.favoriteCount ?? 0) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    if (sort === 'newest') return Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.packageId.localeCompare(right.packageId)
    if (sort === 'updated') return Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || left.packageId.localeCompare(right.packageId)
    const score = (item: WorkshopCatalogItem) => {
      const ageDays = Math.max(0, (now - Date.parse(item.updatedAt)) / 86_400_000)
      return ((item.favoriteCount ?? 0) * 10 + 1) / Math.pow(ageDays + 2, 0.65)
    }
    return score(right) - score(left) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}
