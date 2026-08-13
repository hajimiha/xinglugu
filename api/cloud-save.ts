import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isSameOriginMutation, parseCookies, sendJson } from './_lib/http.js'
import { readCloudGist, validateSerializedSave, writeCloudGist } from './_lib/github-gist.js'
import { openCookie, SESSION_COOKIE, type GitHubSession } from './_lib/session.js'

function getSession(request: VercelRequest): GitHubSession | null {
  const secret = process.env.XINGLUGU_SESSION_SECRET
  if (!secret) return null
  const session = openCookie<GitHubSession>(parseCookies(request)[SESSION_COOKIE], secret)
  return session?.version === 1 && session.token ? session : null
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET' && request.method !== 'PUT') return sendJson(response, 405, { error: 'method_not_allowed' })
  const session = getSession(request)
  if (!session) return sendJson(response, 401, { error: 'github_login_required' })
  try {
    if (request.method === 'GET') {
      const stored = await readCloudGist(session.token)
      if (!stored) return sendJson(response, 200, { exists: false, revision: null, updatedAt: null })
      return sendJson(response, 200, {
        exists: true,
        revision: stored.revision,
        updatedAt: stored.gist.updated_at,
        serializedSave: stored.serializedSave,
      })
    }

    if (!isSameOriginMutation(request)) return sendJson(response, 403, { error: 'origin_rejected' })
    const body = request.body && typeof request.body === 'object' ? request.body as Record<string, unknown> : {}
    const serializedSave = typeof body.serializedSave === 'string' ? body.serializedSave : ''
    const expectedRevision = body.expectedRevision === null || typeof body.expectedRevision === 'string' ? body.expectedRevision : undefined
    const force = body.force === true
    if (!serializedSave || expectedRevision === undefined || (typeof expectedRevision === 'string' && expectedRevision.length > 160)) {
      return sendJson(response, 400, { error: 'invalid_request' })
    }
    validateSerializedSave(serializedSave)
    const current = await readCloudGist(session.token)
    if (!force && (current?.revision ?? null) !== expectedRevision) {
      return sendJson(response, 409, { error: 'cloud_conflict', currentRevision: current?.revision ?? null })
    }
    const saved = await writeCloudGist(session.token, serializedSave, current?.gist.id)
    return sendJson(response, 200, {
      revision: saved.history?.[0]?.version ?? saved.updated_at,
      updatedAt: saved.updated_at,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error'
    const validationError = message.includes('存档') || message.includes('512 KiB')
    if (!validationError) console.error('GitHub cloud save failed:', message)
    sendJson(response, validationError ? 400 : 502, { error: validationError ? message : 'github_service_unavailable' })
  }
}
