import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from '../_lib/http.js'
import { readPublicCatalog } from '../_lib/workshop-github.js'
import { getWorkshopConfiguration } from '../_lib/workshop-request.js'
import { sortWorkshopItems } from '../../src/workshop/catalog.js'
import type { WorkshopKind, WorkshopSort } from '../../src/workshop/types.js'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  try {
    response.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
    const catalog = await readPublicCatalog(config.catalogGistId, config.signingSecret)
    const sort = ['trending', 'popular', 'newest', 'updated'].includes(String(request.query.sort)) ? request.query.sort as WorkshopSort : 'trending'
    const kind = ['lorebook', 'preset', 'portrait-pack'].includes(String(request.query.kind)) ? request.query.kind as WorkshopKind : null
    const search = typeof request.query.search === 'string' ? request.query.search.trim().toLocaleLowerCase().slice(0, 80) : ''
    const filtered = catalog.items.filter((item) => (
      (!kind || item.kind === kind)
      && (!search || [item.title, item.description, item.author.login, ...item.tags].some((value) => value.toLocaleLowerCase().includes(search)))
    ))
    response.status(200).setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300').json({ items: sortWorkshopItems(filtered, sort), rejectedEvents: catalog.rejected.length })
  } catch (error) {
    console.error('Workshop catalog read failed:', error instanceof Error ? error.message : 'unknown_error')
    sendJson(response, 502, { error: 'github_service_unavailable' })
  }
}
