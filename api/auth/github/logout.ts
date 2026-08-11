import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearPrivateCookie, getRequestOrigin, isSameOriginMutation, sendJson } from '../../_lib/http'
import { SESSION_COOKIE } from '../../_lib/session'

export default function handler(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== 'POST') return sendJson(response, 405, { error: 'method_not_allowed' })
  if (!isSameOriginMutation(request)) return sendJson(response, 403, { error: 'origin_rejected' })
  clearPrivateCookie(response, SESSION_COOKIE, getRequestOrigin(request).startsWith('https://'))
  sendJson(response, 200, { ok: true })
}
