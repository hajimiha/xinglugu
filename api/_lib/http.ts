import type { VercelRequest, VercelResponse } from '@vercel/node'

export function sendJson(response: VercelResponse, status: number, value: unknown): void {
  response.status(status).setHeader('Cache-Control', 'no-store').json(value)
}

export function getRequestOrigin(request: VercelRequest): string {
  const configured = process.env.XINGLUGU_APP_ORIGIN?.replace(/\/$/, '')
  if (configured) return configured
  const forwardedProto = String(request.headers['x-forwarded-proto'] || 'https').split(',')[0].trim()
  const host = request.headers['x-forwarded-host'] || request.headers.host
  return `${forwardedProto}://${host}`
}

export function isSameOriginMutation(request: VercelRequest): boolean {
  const origin = request.headers.origin
  return typeof origin === 'string' && origin.replace(/\/$/, '') === getRequestOrigin(request)
}

export function safeReturnPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\r\n]/.test(value)) return '/'
  return value.slice(0, 512)
}

export function parseCookies(request: VercelRequest): Record<string, string> {
  const cookie = request.headers.cookie
  if (!cookie) return {}
  return Object.fromEntries(cookie.split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    if (separator < 1) return []
    return [[decodeURIComponent(part.slice(0, separator).trim()), decodeURIComponent(part.slice(separator + 1).trim())]]
  }))
}

export function setPrivateCookie(response: VercelResponse, name: string, value: string, maxAge: number, secure = true): void {
  const nextCookie = `${encodeURIComponent(name)}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`
  const current = response.getHeader('Set-Cookie')
  const cookies = current === undefined ? [] : Array.isArray(current) ? current.map(String) : [String(current)]
  response.setHeader('Set-Cookie', [...cookies, nextCookie])
}

export function clearPrivateCookie(response: VercelResponse, name: string, secure = true): void {
  setPrivateCookie(response, name, '', 0, secure)
}
