import type { VercelRequest } from '@vercel/node'
import { parseCookies } from './http.js'
import { openCookie, SESSION_COOKIE, type GitHubSession } from './session.js'

export interface WorkshopConfiguration {
  catalogGistId: string
  signingSecret: string
}

const OFFICIAL_WORKSHOP_CATALOG_GIST_ID = '27a706cfd0a648fee5f43788b47ec615'

export function getWorkshopConfiguration(): WorkshopConfiguration | null {
  const catalogGistId = process.env.XINGLUGU_WORKSHOP_CATALOG_GIST_ID?.trim() || OFFICIAL_WORKSHOP_CATALOG_GIST_ID
  const signingSecret = process.env.XINGLUGU_SESSION_SECRET
  return catalogGistId && signingSecret ? { catalogGistId, signingSecret } : null
}

export function getGitHubSession(request: VercelRequest): GitHubSession | null {
  const secret = process.env.XINGLUGU_SESSION_SECRET
  if (!secret) return null
  const session = openCookie<GitHubSession>(parseCookies(request)[SESSION_COOKIE], secret)
  return session?.version === 1 && session.token && session.user?.publisherId && session.user.login ? session : null
}

export function requestBody(request: VercelRequest): Record<string, unknown> {
  return request.body && typeof request.body === 'object' && !Array.isArray(request.body)
    ? request.body as Record<string, unknown>
    : {}
}

export const newOperationId = () => crypto.randomUUID()
