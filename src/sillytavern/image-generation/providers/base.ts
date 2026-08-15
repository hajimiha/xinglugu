import type { ImageGenerationReference, ImageGenerationSettings, ImageGenerationProvider } from '../types'

export type ImageProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface ImageProviderGenerateInput {
  settings: ImageGenerationSettings
  positivePrompt: string
  negativePrompt: string
  credential?: string
  signal?: AbortSignal
  onProgress?: (progress: number, detail?: string) => void
  references?: ImageGenerationReference[]
}

export interface ImageProviderResult {
  blob: Blob
  mimeType: string
  width: number
  height: number
  model: string
  seed: number
  revisedPrompt?: string
}

export interface ImageProviderConnectionResult {
  label: string
  details?: string[]
}

export interface ImageProviderResources {
  models: string[]
  vaes: string[]
  samplers: string[]
  schedulers: string[]
  upscalers: string[]
  loras: string[]
}

export interface ImageProviderAdapter {
  provider: ImageGenerationProvider
  label: string
  generate(input: ImageProviderGenerateInput): Promise<ImageProviderResult>
  testConnection(settings: ImageGenerationSettings, credential?: string, signal?: AbortSignal): Promise<ImageProviderConnectionResult>
  listResources?(settings: ImageGenerationSettings, credential?: string, signal?: AbortSignal): Promise<ImageProviderResources>
  cancel?(settings: ImageGenerationSettings, signal?: AbortSignal): Promise<void>
}

export type ImageProviderErrorCode =
  | 'IMAGE_AUTH_MISSING'
  | 'IMAGE_AUTH_FAILED'
  | 'IMAGE_RATE_LIMITED'
  | 'IMAGE_HTTP_ERROR'
  | 'IMAGE_NETWORK_ERROR'
  | 'IMAGE_INVALID_RESPONSE'
  | 'IMAGE_CONFIGURATION_ERROR'
  | 'IMAGE_TIMEOUT'

export class ImageProviderError extends Error {
  constructor(message: string, readonly code: ImageProviderErrorCode, readonly status?: number) {
    super(message)
    this.name = 'ImageProviderError'
  }
}

const MAX_IMAGE_BYTES = 64 * 1024 * 1024

export function requireCredential(value: string | undefined, label: string): string {
  const credential = value?.trim() ?? ''
  if (!credential) throw new ImageProviderError(`尚未填写${label}密钥。`, 'IMAGE_AUTH_MISSING')
  return credential
}

export async function fetchProvider(
  fetchImpl: ImageProviderFetch,
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  try {
    const response = await fetchImpl(input, init)
    if (!response.ok) throw await providerResponseError(response)
    return response
  } catch (error) {
    if (error instanceof ImageProviderError) throw error
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ImageProviderError('无法连接绘图服务，请检查地址、服务状态和跨域设置。', 'IMAGE_NETWORK_ERROR')
  }
}

async function providerResponseError(response: Response): Promise<ImageProviderError> {
  let detail = ''
  try {
    const payload = await response.clone().json() as { error?: string | { message?: string }; message?: string; detail?: string }
    detail = typeof payload.error === 'string' ? payload.error : payload.error?.message || payload.message || payload.detail || ''
  } catch {
    try { detail = (await response.clone().text()).slice(0, 500) } catch { detail = '' }
  }
  if (response.status === 401 || response.status === 403) {
    return new ImageProviderError(`绘图服务鉴权失败${detail ? `：${detail}` : '。'}`, 'IMAGE_AUTH_FAILED', response.status)
  }
  if (response.status === 429) {
    return new ImageProviderError(`绘图服务请求过于频繁或额度不足${detail ? `：${detail}` : '。'}`, 'IMAGE_RATE_LIMITED', response.status)
  }
  return new ImageProviderError(
    `绘图服务返回 ${response.status}${detail ? `：${detail}` : '，请检查参数和服务日志。'}`,
    'IMAGE_HTTP_ERROR',
    response.status,
  )
}

export function decodeBase64Image(value: string, mimeType = 'image/png'): Blob {
  const stripped = value.replace(/^data:[^;,]+;base64,/i, '')
  try {
    const binary = atob(stripped)
    if (!binary.length || binary.length > MAX_IMAGE_BYTES) throw new Error('size')
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return new Blob([bytes], { type: mimeType })
  } catch {
    throw new ImageProviderError('绘图服务返回了无效或过大的 base64 图片。', 'IMAGE_INVALID_RESPONSE')
  }
}

export async function validateImageResponse(response: Response): Promise<Blob> {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (contentLength > MAX_IMAGE_BYTES) throw new ImageProviderError('生成图片超过 64 MB 安全上限。', 'IMAGE_INVALID_RESPONSE')
  const blob = await response.blob()
  const mimeType = (blob.type || response.headers.get('content-type') || '').split(';')[0].toLowerCase()
  if (!mimeType.startsWith('image/') || !blob.size || blob.size > MAX_IMAGE_BYTES) {
    throw new ImageProviderError('绘图服务没有返回有效图片。', 'IMAGE_INVALID_RESPONSE')
  }
  return blob.type ? blob : new Blob([await blob.arrayBuffer()], { type: mimeType })
}

export function validateRemoteImageUrl(value: string): URL {
  try {
    const url = new URL(value)
    const isLocalHttp = url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    if (url.protocol !== 'https:' && !isLocalHttp) throw new Error('protocol')
    if (url.username || url.password || url.hash) throw new Error('credentials')
    return url
  } catch {
    throw new ImageProviderError('绘图服务返回了不安全的图片地址。', 'IMAGE_INVALID_RESPONSE')
  }
}

export async function sleepWithSignal(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  })
}
