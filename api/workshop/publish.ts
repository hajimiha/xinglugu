import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isSameOriginMutation, sendJson } from '../_lib/http'
import { parseWorkshopPackage } from '../../src/workshop/package-schema'
import type { WorkshopCatalogEvent } from '../../src/workshop/types'
import { appendCatalogEvent, catalogItemFromPackage, createWorkshopGist, githubOwnerMatchesPublisher, invalidatePublicCatalogCache, readCatalog, readWorkshopPackage, updateWorkshopGist } from '../_lib/workshop-github'
import { getGitHubSession, getWorkshopConfiguration, newOperationId, requestBody } from '../_lib/workshop-request'
import { stampWorkshopPackageDates } from '../../src/workshop/publisher'

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'POST' && request.method !== 'PATCH' && request.method !== 'DELETE') return sendJson(response, 405, { error: 'method_not_allowed' })
  const config = getWorkshopConfiguration()
  if (!config) return sendJson(response, 503, { error: 'workshop_not_configured' })
  const session = getGitHubSession(request)
  if (!session) return sendJson(response, 401, { error: 'github_login_required' })
  if (!isSameOriginMutation(request)) return sendJson(response, 403, { error: 'origin_rejected' })
  const body = requestBody(request)
  try {
    const catalog = await readCatalog(config.catalogGistId, config.signingSecret, session.token)
    if (request.method === 'POST') {
      const submitted = parseWorkshopPackage(body.package)
      const now = new Date().toISOString()
      const pkg = stampWorkshopPackageDates(submitted, now, now)
      const gist = await createWorkshopGist(session.token, pkg)
      const publisherId = session.user.publisherId
      const item = catalogItemFromPackage(pkg, gist, 1, publisherId)
      const event: WorkshopCatalogEvent = { schemaVersion: 1, eventId: newOperationId(), action: 'publish', actorKey: publisherId, actor: session.user.login, packageId: gist.id, occurredAt: new Date().toISOString(), revision: 1, item }
      await appendCatalogEvent(session.token, config.catalogGistId, event, config.signingSecret)
      invalidatePublicCatalogCache()
      return sendJson(response, 201, { item })
    }
    const packageId = typeof body.packageId === 'string' ? body.packageId : ''
    const expectedRevision = typeof body.expectedRevision === 'number' && Number.isInteger(body.expectedRevision) ? body.expectedRevision : -1
    const current = catalog.items.find((item) => item.packageId === packageId)
    if (!current || current.author.publisherId !== session.user.publisherId) return sendJson(response, 403, { error: 'not_package_owner' })
    if (current.revision !== expectedRevision) return sendJson(response, 409, { error: 'workshop_conflict', currentRevision: current.revision })
    if (request.method === 'DELETE') {
      const owned = await readWorkshopPackage(packageId, session.token)
      if (!githubOwnerMatchesPublisher(owned.gist.owner.id, session.user.publisherId, config.signingSecret)) return sendJson(response, 403, { error: 'not_package_owner' })
      const event: WorkshopCatalogEvent = { schemaVersion: 1, eventId: newOperationId(), action: 'withdraw', actorKey: session.user.publisherId, actor: session.user.login, packageId, occurredAt: new Date().toISOString(), revision: current.revision + 1, expectedRevision: current.revision }
      await appendCatalogEvent(session.token, config.catalogGistId, event, config.signingSecret)
      invalidatePublicCatalogCache()
      const latest = await readCatalog(config.catalogGistId, config.signingSecret, session.token)
      const remaining = latest.items.find((candidate) => candidate.packageId === packageId)
      if (remaining) return sendJson(response, 409, { error: 'workshop_conflict', currentRevision: remaining.revision })
      return sendJson(response, 200, { withdrawn: true })
    }
    const submitted = parseWorkshopPackage(body.package)
    const pkg = stampWorkshopPackageDates(submitted, current.createdAt, new Date().toISOString())
    const existing = await readWorkshopPackage(packageId, session.token)
    if (!githubOwnerMatchesPublisher(existing.gist.owner.id, session.user.publisherId, config.signingSecret)) return sendJson(response, 403, { error: 'not_package_owner' })
    const gist = await updateWorkshopGist(session.token, packageId, pkg)
    const revision = current.revision + 1
    const item = catalogItemFromPackage(pkg, gist, revision, session.user.publisherId)
    const event: WorkshopCatalogEvent = { schemaVersion: 1, eventId: newOperationId(), action: 'update', actorKey: session.user.publisherId, actor: session.user.login, packageId, occurredAt: new Date().toISOString(), revision, expectedRevision: current.revision, item }
    await appendCatalogEvent(session.token, config.catalogGistId, event, config.signingSecret)
    invalidatePublicCatalogCache()
    const latest = await readCatalog(config.catalogGistId, config.signingSecret, session.token)
    if (latest.items.find((candidate) => candidate.packageId === packageId)?.gistVersion !== item.gistVersion) {
      return sendJson(response, 409, { error: 'workshop_conflict', currentRevision: latest.items.find((candidate) => candidate.packageId === packageId)?.revision ?? current.revision })
    }
    return sendJson(response, 200, { item })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/资源包|标题|简介|标签|版本号|大小|立绘|世界书|预设|字段/.test(message)) return sendJson(response, 400, { error: message })
    if (message === 'owner_mismatch') return sendJson(response, 403, { error: 'not_package_owner' })
    console.error('Workshop publish failed:', message || 'unknown_error')
    return sendJson(response, 502, { error: 'github_service_unavailable' })
  }
}
