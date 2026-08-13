import type { VercelRequest, VercelResponse } from '@vercel/node'
import { randomBytes } from 'node:crypto'
import { getRequestOrigin, safeReturnPath, setPrivateCookie } from '../../_lib/http.js'
import { createPkcePair, OAUTH_COOKIE, sealCookie, type OAuthAttempt } from '../../_lib/session.js'

export default function handler(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== 'GET') return void response.status(405).end()
  const clientId = process.env.GITHUB_CLIENT_ID
  const secret = process.env.XINGLUGU_SESSION_SECRET
  if (!clientId || !process.env.GITHUB_CLIENT_SECRET || !secret) return void response.status(503).send('GitHub 登录尚未配置。')

  const origin = getRequestOrigin(request)
  const returnTo = safeReturnPath(request.query.returnTo)
  const state = randomBytes(24).toString('base64url')
  const { verifier, challenge } = createPkcePair()
  const attempt: OAuthAttempt = { version: 1, state, verifier, returnTo, expiresAt: Date.now() + 10 * 60 * 1000 }
  setPrivateCookie(response, OAUTH_COOKIE, sealCookie(attempt, secret), 10 * 60, origin.startsWith('https://'))

  const authorize = new URL('https://github.com/login/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/github/callback`)
  authorize.searchParams.set('scope', 'gist')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('code_challenge', challenge)
  authorize.searchParams.set('code_challenge_method', 'S256')
  response.redirect(302, authorize.toString())
}
