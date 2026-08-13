import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from '../_lib/http'
import { readCatalog } from '../_lib/workshop-github'
import { getWorkshopConfiguration } from '../_lib/workshop-request'
import { sortWorkshopItems } from '../../src/workshop/catalog'
import type { WorkshopKind, WorkshopSort } from '../../src/workshop/types'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  try {
    const catalog = await readCatalog(config.catalogGistId, config.signingSecret)
    const sort = ['trending', 'popular', 'newest', 'updated'].includes(String(request.query.sort)) ? request.query.sort as WorkshopSort : 'trending'
    const kind = ['lorebook', 'preset', 'portrait-pack'].includes(String(request.query.kind)) ? request.query.kind as WorkshopKind : null
    const search = typeof request.query.search === 'string' ? request.query.search.trim().toLocaleLowerCase().slice(0, 80) : ''
    const filtered = catalog.items.filter((item) => (
      (!kind || item.kind === kind)
      && (!search || [item.title, item.description, item.author.login, ...item.tags].some((value) => value.toLocaleLowerCase().includes(search)))
    ))
    sendJson(response, 200, { items: sortWorkshopItems(filtered, sort), rejectedEvents: catalog.rejected.length })
  } catch (error) {
    console.error('Workshop catalog read failed:', error instanceof Error ? error.message : 'unknown_error')
    sendJson(response, 502, { error: 'github_service_unavailable' })
  }
}

