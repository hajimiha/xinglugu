import type { VercelRequest, VercelResponse } from '@vercel/node'
import { SESSION_COOKIE } from './_lib/session.ts'

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  response.status(200).json({ ok: true, module: 'session', cookie: SESSION_COOKIE })
}
