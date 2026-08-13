import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isSameOriginMutation, sendJson } from '../_lib/http'
import type { WorkshopCatalogEvent } from '../../src/workshop/types'
import { appendCatalogEvent, readCatalog } from '../_lib/workshop-github'
import { getGitHubSession, getWorkshopConfiguration, newOperationId, requestBody } from '../_lib/workshop-request'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'PUT' && request.method !== 'DELETE') return sendJson(response, 405, { error: 'method_not_allowed' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  const session = getGitHubSession(request)
  if (!session) return sendJson(response, 401, { error: 'github_login_required' })
  if (!isSameOriginMutation(request)) return sendJson(response, 403, { error: 'origin_rejected' })
  const packageId = typeof requestBody(request).packageId === 'string' ? String(requestBody(request).packageId) : ''
  try {
    const catalog = await readCatalog(config.catalogGistId, config.signingSecret, session.token)
    if (!catalog.items.some((item) => item.packageId === packageId)) return sendJson(response, 404, { error: 'package_unavailable' })
    const event: WorkshopCatalogEvent = { schemaVersion: 1, eventId: newOperationId(), action: request.method === 'PUT' ? 'favorite' : 'unfavorite', actorKey: session.user.publisherId, actor: session.user.login, packageId, occurredAt: new Date().toISOString() }
    await appendCatalogEvent(session.token, config.catalogGistId, event, config.signingSecret)
    sendJson(response, 200, { favorite: request.method === 'PUT' })
  } catch (error) {
    console.error('Workshop favorite failed:', error instanceof Error ? error.message : 'unknown_error')
    sendJson(response, 502, { error: 'github_service_unavailable' })
  }
}
