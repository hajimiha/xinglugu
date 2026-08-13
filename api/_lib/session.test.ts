import { describe, expect, it } from 'vitest'
import { openCookie, publisherKeyForGitHubId, sealCookie } from './session'

describe('GitHub 会话 Cookie', () => {
  const secret = 'test-secret-with-at-least-thirty-two-characters'

  it('加密后可恢复，篡改后不可读取', () => {
    const value = { token: 'private-token', expiresAt: Date.now() + 60_000 }
    const sealed = sealCookie(value, secret)
    expect(sealed).not.toContain('private-token')
    expect(openCookie(sealed, secret)).toEqual(value)
    const tamperAt = Math.floor(sealed.length / 2)
    const replacement = sealed[tamperAt] === 'A' ? 'B' : 'A'
    const tampered = `${sealed.slice(0, tamperAt)}${replacement}${sealed.slice(tamperAt + 1)}`
    expect(openCookie(tampered, secret)).toBeNull()
  })

  it('拒绝过期会话', () => {
    expect(openCookie(sealCookie({ expiresAt: Date.now() - 1 }, secret), secret)).toBeNull()
  })
})

describe('workshop publisher identity', () => {
  it('derives a stable pseudonymous key without exposing the GitHub numeric id', () => {
    const secret = 'a-session-secret-that-is-longer-than-thirty-two-characters'
    const first = publisherKeyForGitHubId(101, secret)
    expect(first).toBe(publisherKeyForGitHubId(101, secret))
    expect(first).not.toContain('101')
    expect(first).not.toBe(publisherKeyForGitHubId(102, secret))
  })
})
