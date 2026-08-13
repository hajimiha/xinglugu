import type { VercelRequest, VercelResponse } from '@vercel/node'
import { sendJson } from './_lib/http.js'

export default function handler(_request: VercelRequest, response: VercelResponse): void {
  sendJson(response, 200, { ok: true, runtime: process.version, module: 'http' })
}
