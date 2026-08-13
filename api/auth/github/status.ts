import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(request: VercelRequest, response: VercelResponse): void {
  if (request.method !== 'GET') {
    response.status(405).json({ error: 'method_not_allowed' })
    return
  }
  response.status(200).json({ authenticated: false, configured: false, module: 'nested' })
}
