import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from '../_lib/http'
import { readPublicCatalog, readWorkshopPackage } from '../_lib/workshop-github'
import { getWorkshopConfiguration } from '../_lib/workshop-request'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
  const id = typeof request.query.id === 'string' ? request.query.id : ''
  if (!/^[a-f0-9]{8,64}$/i.test(id)) return sendJson(response, 400, { error: 'invalid_package_id' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  try {
    const catalog = await readPublicCatalog(config.catalogGistId, config.signingSecret)
    const item = catalog.items.find((candidate) => candidate.packageId === id)
    if (!item) return sendJson(response, 404, { error: 'package_unavailable' })
    const result = await readWorkshopPackage(id, undefined, fetch, item.gistVersion)
    sendJson(response, 200, { package: result.package, owner: { login: result.gist.owner.login, avatarUrl: result.gist.owner.avatar_url } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const invalid = /资源|Gist|JSON|公开/.test(message)
    sendJson(response, invalid ? 404 : 502, { error: invalid ? 'package_unavailable' : 'github_service_unavailable' })
  }
}
