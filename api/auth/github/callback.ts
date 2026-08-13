import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearPrivateCookie, getRequestOrigin, parseCookies, setPrivateCookie } from '../../_lib/http'
import { equalState, OAUTH_COOKIE, openCookie, publisherKeyForGitHubId, sealCookie, SESSION_COOKIE, type GitHubSession, type OAuthAttempt } from '../../_lib/session'

interface GitHubTokenResponse { access_token?: string; error?: string }
interface GitHubUserResponse { id?: number; login?: string; avatar_url?: string }

function redirectResult(response: VercelResponse, origin: string, returnTo: string, result: string): void {
  const target = new URL(returnTo, origin)
  target.searchParams.set('github', result)
  response.redirect(302, `${target.pathname}${target.search}${target.hash}`)
}

export default async function handler(request: VercelRequest, response: VercelResponse): Promise<void> {
  if (request.method !== 'GET') return void response.status(405).end()
  const origin = getRequestOrigin(request)
  const secret = process.env.XINGLUGU_SESSION_SECRET
  const attempt = secret ? openCookie<OAuthAttempt>(parseCookies(request)[OAUTH_COOKIE], secret) : null
  clearPrivateCookie(response, OAUTH_COOKIE, origin.startsWith('https://'))
  if (!secret || !attempt || attempt.version !== 1) return redirectResult(response, origin, '/', 'expired')
  const code = typeof request.query.code === 'string' ? request.query.code : ''
  const state = typeof request.query.state === 'string' ? request.query.state : ''
  if (!code || !state || !equalState(state, attempt.state)) return redirectResult(response, origin, attempt.returnTo, 'denied')

  try {
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        code,
        redirect_uri: `${origin}/api/auth/github/callback`,
        code_verifier: attempt.verifier,
      }),
    })
    const tokenData = await tokenResponse.json() as GitHubTokenResponse
    if (!tokenResponse.ok || !tokenData.access_token) throw new Error(tokenData.error || 'token_exchange_failed')

    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${tokenData.access_token}`,
        'User-Agent': 'xinglugu-game',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
    const user = await userResponse.json() as GitHubUserResponse
    if (!userResponse.ok || !Number.isSafeInteger(user.id) || !user.id || !user.login) throw new Error('user_lookup_failed')
    const session: GitHubSession = {
      version: 1,
      token: tokenData.access_token,
      user: { publisherId: publisherKeyForGitHubId(user.id, secret), login: user.login, avatarUrl: user.avatar_url || '' },
      expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
    }
    setPrivateCookie(response, SESSION_COOKIE, sealCookie(session, secret), 30 * 24 * 60 * 60, origin.startsWith('https://'))
    redirectResult(response, origin, attempt.returnTo, 'connected')
  } catch (error) {
    console.error('GitHub OAuth callback failed:', error instanceof Error ? error.message : 'unknown_error')
    redirectResult(response, origin, attempt.returnTo, 'error')
  }
}
