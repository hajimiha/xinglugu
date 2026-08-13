import type { VercelRequest, VercelResponse } from '@vercel/node'
import { parseCookies, sendJson } from '../../_lib/http.ts'
import { openCookie, SESSION_COOKIE, type GitHubSession } from '../../_lib/session.ts'

export default function handler(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== 'GET') return sendJson(response, 405, { error: 'method_not_allowed' })
  const secret = process.env.XINGLUGU_SESSION_SECRET
  const configured = Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET && secret)
  if (!configured || !secret) return sendJson(response, 200, { authenticated: false, configured: false })
  const session = openCookie<GitHubSession>(parseCookies(request)[SESSION_COOKIE], secret)
  if (!session || session.version !== 1 || !session.token || !session.user?.publisherId || !session.user.login) {
    return sendJson(response, 200, { authenticated: false, configured: true })
  }
  sendJson(response, 200, { authenticated: true, configured: true, user: { login: session.user.login, avatarUrl: session.user.avatarUrl } })
}
