import { SESSION_COOKIE } from './_lib/session.ts'

export function GET(): Response {
  return Response.json({ ok: true, runtime: process.version, module: 'session', cookie: SESSION_COOKIE })
}
