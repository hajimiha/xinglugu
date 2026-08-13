import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from '../_lib/http.js'
import { readCatalog } from '../_lib/workshop-github.js'
import { getGitHubSession, getWorkshopConfiguration } from '../_lib/workshop-request.js'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  const session = getGitHubSession(request)
  if (!session) return sendJson(response, 401, { error: 'github_login_required' })
  try {
    const catalog = await readCatalog(config.catalogGistId, config.signingSecret, session.token)
    sendJson(response, 200, { items: catalog.items.filter((item) => item.author.publisherId === session.user.publisherId) })
  } catch (error) {
    console.error('Workshop owner list failed:', error instanceof Error ? error.message : 'unknown_error')
    sendJson(response, 502, { error: 'github_service_unavailable' })
  }
}
