import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const SESSION_COOKIE = 'xinglugu_github_session'
export const OAUTH_COOKIE = 'xinglugu_github_oauth'

export interface GitHubSession {
  version: 1
  token: string
  user: { publisherId: string; login: string; avatarUrl: string }
  expiresAt: number
}

export function publisherKeyForGitHubId(githubId: number, secret: string): string {
  if (!Number.isSafeInteger(githubId) || githubId <= 0) throw new Error('invalid_github_user_id')
  return createHmac('sha256', encryptionKey(secret)).update(`github-publisher:${githubId}`).digest('base64url')
}

export interface OAuthAttempt {
  version: 1
  state: string
  verifier: string
  returnTo: string
  expiresAt: number
}

function encryptionKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error('XINGLUGU_SESSION_SECRET 至少需要 32 个字符。')
  return createHash('sha256').update(secret).digest()
}

export function sealCookie(value: unknown, secret: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv)
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}

export function openCookie<T>(value: string | undefined, secret: string): T | null {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64url')
    if (raw.length < 29) return null
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv)
    decipher.setAuthTag(tag)
    const parsed = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')) as T & { expiresAt?: unknown }
    if (typeof parsed?.expiresAt !== 'number' || parsed.expiresAt <= Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

export function equalState(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}
