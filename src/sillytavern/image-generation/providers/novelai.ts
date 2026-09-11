import {
  fetchProvider,
  ImageProviderError,
  requireCredential,
  validateImageResponse,
  type ImageProviderAdapter,
  type ImageProviderFetch,
} from './base'
import type { ImageGenerationReference, ImageGenerationSettings } from '../types'

const MAX_ZIP_BYTES = 96 * 1024 * 1024

// Official model documentation + st-chatu8 model IDs, verified 2026-09-11.
// NovelAI publishes no image-model discovery endpoint; do not use the text /models API.
export const NOVELAI_MODELS = [
  { id: 'nai-diffusion-4-5-full', label: 'NovelAI Diffusion V4.5 Full' },
  { id: 'nai-diffusion-4-5-curated', label: 'NovelAI Diffusion V4.5 Curated' },
  { id: 'nai-diffusion-5-full', label: 'NovelAI Diffusion V5 Full' },
  { id: 'nai-diffusion-5-curated', label: 'NovelAI Diffusion V5 Curated' },
  { id: 'nai-diffusion-4-full', label: 'NovelAI Diffusion V4 Full' },
  { id: 'nai-diffusion-4-curated-preview', label: 'NovelAI Diffusion V4 Curated' },
  { id: 'nai-diffusion-3', label: 'NovelAI Diffusion Anime V3' },
]

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = typeof blob.arrayBuffer === 'function' ? await blob.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('读取参考图失败。'))
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.readAsArrayBuffer(blob)
  })
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function buildReferenceParameters(
  settings: ImageGenerationSettings,
  references: ImageGenerationReference[],
  token: string,
  fetchImpl: ImageProviderFetch,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const config = settings.novelAI
  const enabled = references.filter((reference) => reference.enabled)
  const vibes = config.vibeTransfer ? enabled.filter((reference) => reference.kind === 'vibe') : []
  const characters = config.characterReference ? enabled.filter((reference) => reference.kind !== 'vibe') : []
  if (config.model === 'nai-diffusion-3') {
    const encoded = await Promise.all(vibes.map((reference) => blobToBase64(reference.blob)))
    return {
      reference_image_multiple: encoded,
      reference_information_extracted_multiple: vibes.map((reference) => reference.informationExtracted),
      reference_strength_multiple: vibes.map((reference) => reference.strength),
    }
  }
  const cachedVibes = [] as Array<{ cache_secret_key: string; data: string }>
  for (const reference of vibes) {
    const image = await blobToBase64(reference.blob)
    const response = await fetchProvider(fetchImpl, `${config.baseUrl.replace(/\/+$/, '')}/ai/encode-vibe`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ image, information_extracted: reference.informationExtracted, model: config.model }),
      signal,
    })
    const data = await response.arrayBuffer()
    if (data.byteLength < 100) throw new ImageProviderError('NovelAI 返回的 Vibe 编码数据无效。', 'IMAGE_INVALID_RESPONSE')
    cachedVibes.push({ cache_secret_key: crypto.randomUUID(), data: await blobToBase64(new Blob([data])) })
  }
  const characterImages = await Promise.all(characters.map(async (reference) => ({
    cache_secret_key: crypto.randomUUID(), data: await blobToBase64(reference.blob),
  })))
  return {
    reference_image_multiple_cached: cachedVibes,
    reference_strength_multiple: vibes.map((reference) => reference.strength),
    director_reference_images_cached: characterImages,
    director_reference_descriptions: characters.map((reference) => ({
      caption: { base_caption: reference.kind === 'character-style' ? 'character&style' : reference.kind, char_captions: [] },
      legacy_uc: false,
    })),
    director_reference_information_extracted: characters.map((reference) => reference.informationExtracted),
    director_reference_strength_values: characters.map((reference) => reference.strength),
    director_reference_secondary_strength_values: characters.map((reference) => 1 - reference.strength),
  }
}

function findSignature(view: DataView, signature: number, from: number, backwards = false): number {
  if (backwards) {
    for (let index = from; index >= 0; index -= 1) if (view.getUint32(index, true) === signature) return index
  } else {
    for (let index = from; index <= view.byteLength - 4; index += 1) if (view.getUint32(index, true) === signature) return index
  }
  return -1
}

async function inflateRaw(data: Uint8Array): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new ImageProviderError('当前浏览器不支持解压 NovelAI 图片包。', 'IMAGE_INVALID_RESPONSE')
  }
  const ownedBuffer = new Uint8Array(data).buffer
  const stream = new Blob([ownedBuffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Response(stream).arrayBuffer()
}

export async function extractNovelAIImageArchive(blob: Blob): Promise<Blob> {
  if (!blob.size || blob.size > MAX_ZIP_BYTES) throw new ImageProviderError('NovelAI 返回的图片包为空或过大。', 'IMAGE_INVALID_RESPONSE')
  const buffer = await blob.arrayBuffer()
  const view = new DataView(buffer)
  const eocd = findSignature(view, 0x06054b50, Math.max(0, view.byteLength - 22), true)
  if (eocd < 0) throw new ImageProviderError('NovelAI 返回的 ZIP 图片包无法解析。', 'IMAGE_INVALID_RESPONSE')
  const entryCount = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const decoder = new TextDecoder()
  for (let entry = 0; entry < entryCount && offset + 46 <= view.byteLength; entry += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localOffset = view.getUint32(offset + 42, true)
    const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength))
    if (/\.(?:png|jpe?g|webp)$/i.test(name) && localOffset + 30 <= view.byteLength) {
      const localNameLength = view.getUint16(localOffset + 26, true)
      const localExtraLength = view.getUint16(localOffset + 28, true)
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength
      if (dataOffset + compressedSize > view.byteLength) break
      const compressed = new Uint8Array(buffer.slice(dataOffset, dataOffset + compressedSize))
      const payload = method === 0 ? compressed.buffer : method === 8 ? await inflateRaw(compressed) : undefined
      if (!payload) throw new ImageProviderError('NovelAI 图片包使用了不支持的压缩格式。', 'IMAGE_INVALID_RESPONSE')
      const mimeType = name.toLowerCase().endsWith('.png') ? 'image/png'
        : name.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
      return new Blob([payload], { type: mimeType })
    }
    offset += 46 + nameLength + extraLength + commentLength
  }
  throw new ImageProviderError('NovelAI 图片包中没有可用图片。', 'IMAGE_INVALID_RESPONSE')
}

export function createNovelAIAdapter(
  fetchImpl: ImageProviderFetch = globalThis.fetch.bind(globalThis),
): ImageProviderAdapter {
  return {
    provider: 'novelai',
    label: 'NovelAI',
    async generate({ settings, positivePrompt, negativePrompt, credential, signal, onProgress, references = [] }) {
      const config = settings.novelAI
      const token = requireCredential(credential, 'NovelAI')
      if (!config.model.trim()) throw new ImageProviderError('请选择 NovelAI 模型。', 'IMAGE_INVALID_RESPONSE')
      const modern = /^nai-diffusion-[45](?:-|$)/.test(config.model)
      const v5 = config.model.startsWith('nai-diffusion-5-')
      onProgress?.(0.1, '正在提交 NovelAI 绘图请求')
      const referenceParameters = await buildReferenceParameters(settings, references, token, fetchImpl, signal)
      const response = await fetchProvider(fetchImpl, `${config.baseUrl.replace(/\/+$/, '')}/ai/generate-image`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action: 'generate',
          input: positivePrompt,
          model: config.model,
          parameters: {
            params_version: v5 ? 4 : 3,
            negative_prompt: negativePrompt,
            width: config.width, height: config.height, steps: config.steps, scale: config.scale,
            sampler: config.sampler, noise_schedule: config.scheduler, seed: config.seed,
            n_samples: 1, qualityToggle: true, ucPreset: 0,
            sm: !modern && config.sm, sm_dyn: !modern && config.sm && config.dyn, dynamic_thresholding: !modern && config.decrisper,
            cfg_rescale: config.cfgRescale,
            ...(!v5 && config.variety ? { skip_cfg_above_sigma: Math.sqrt(config.width * config.height / 1011712) * (config.model.includes('4-5') ? 58 : 19) } : {}),
            ...(modern ? {
              v4_prompt: { caption: { base_caption: positivePrompt, char_captions: [] }, use_coords: false, use_order: true },
              v4_negative_prompt: { caption: { base_caption: negativePrompt, char_captions: [] }, legacy_uc: false },
              legacy: false, legacy_uc: false, characterPrompts: [],
            } : {}),
            ...referenceParameters,
          },
        }),
        signal,
      })
      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      const responseBlob = await response.blob()
      const blob = contentType.includes('zip') || responseBlob.type.includes('zip')
        ? await extractNovelAIImageArchive(responseBlob)
        : await validateImageResponse(new Response(responseBlob, { headers: { 'content-type': responseBlob.type || contentType } }))
      onProgress?.(1, 'NovelAI 绘图完成')
      return { blob, mimeType: blob.type, width: config.width, height: config.height, model: config.model, seed: config.seed }
    },
    async testConnection(settings, credential, signal) {
      const token = requireCredential(credential, 'NovelAI')
      await fetchProvider(fetchImpl, `${settings.novelAI.baseUrl.replace(/\/+$/, '')}/user/subscription`, {
        headers: { authorization: `Bearer ${token}` }, signal,
      })
      return { label: 'NovelAI 密钥验证成功', details: ['模型使用内置目录；生成权限以服务端为准', settings.novelAI.model] }
    },
  }
}
