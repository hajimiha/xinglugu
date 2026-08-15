import { describe, expect, it, vi } from 'vitest'
import { createDefaultImageGenerationSettings } from './image-generation/config'
import { createStableDiffusionAdapter } from './image-generation/providers/stable-diffusion'
import { createComfyUIAdapter, injectComfyWorkflow } from './image-generation/providers/comfyui'
import { createNovelAIAdapter } from './image-generation/providers/novelai'
import { createOpenAIImageAdapter } from './image-generation/providers/openai-image'

function pngResponse(): Response {
  return new Response(new Blob(['png-bytes'], { type: 'image/png' }), {
    status: 200,
    headers: { 'content-type': 'image/png' },
  })
}

describe('酒馆绘图供应商适配器', () => {
  it('按 A1111/Forge 协议发送高级参数并解析 base64 图片', async () => {
    const settings = createDefaultImageGenerationSettings()
    settings.stableDiffusion.model = 'pixel-model.safetensors'
    settings.stableDiffusion.restoreFaces = true
    settings.stableDiffusion.hires.enabled = true
    settings.stableDiffusion.adetailer.enabled = true
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        prompt: '1girl, village', negative_prompt: 'text', width: 1024, height: 1024,
        enable_hr: true, restore_faces: true,
        override_settings: { sd_model_checkpoint: 'pixel-model.safetensors', CLIP_stop_at_last_layers: 2 },
      })
      expect(body.alwayson_scripts.ADetailer.args[2]).toMatchObject({ ad_model: 'face_yolov8n.pt' })
      return Response.json({ images: [btoa('fake-png')], info: JSON.stringify({ seed: 77 }) })
    })
    const adapter = createStableDiffusionAdapter(fetchMock)
    const result = await adapter.generate({ settings, positivePrompt: '1girl, village', negativePrompt: 'text' })
    expect(fetchMock).toHaveBeenCalledWith('http://127.0.0.1:7860/sdapi/v1/txt2img', expect.any(Object))
    expect(result.seed).toBe(77)
    expect(result.blob.type).toBe('image/png')
  })

  it('从 A1111/Forge 读取模型、VAE、采样器、调度器和放大器资源', async () => {
    const settings = createDefaultImageGenerationSettings()
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/sd-models')) return Response.json([{ title: 'pixel-model', model_name: 'pixel' }])
      if (url.endsWith('/sd-vae')) return Response.json([{ model_name: 'pixel-vae' }])
      if (url.endsWith('/samplers')) return Response.json([{ name: 'Euler a' }])
      if (url.endsWith('/schedulers')) return Response.json([{ name: 'Karras' }])
      if (url.endsWith('/upscalers')) return Response.json([{ name: '4x-UltraSharp' }])
      if (url.endsWith('/loras')) return Response.json([{ name: 'pixel-lora', alias: 'pixel style' }])
      throw new Error(`unexpected ${url}`)
    })

    const resources = await createStableDiffusionAdapter(fetchMock).listResources?.(settings)

    expect(resources).toEqual({ models: ['pixel-model'], vaes: ['pixel-vae'], samplers: ['Euler a'], schedulers: ['Karras'], upscalers: ['4x-UltraSharp'], loras: ['pixel style'] })
  })

  it('替换 ComfyUI API 工作流变量并通过 history/view 取得输出', async () => {
    const workflow = {
      '1': { class_type: 'CLIPTextEncode', inputs: { text: '{{positive_prompt}}' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: '{{negative_prompt}}' } },
      '3': { class_type: 'EmptyLatentImage', inputs: { width: '{{width}}', height: '{{height}}' } },
      '4': { class_type: 'KSampler', inputs: { seed: '{{seed}}', steps: '{{steps}}', cfg: '{{cfg_scale}}' } },
    }
    expect(injectComfyWorkflow(JSON.stringify(workflow), {
      positivePrompt: 'pixel heroine', negativePrompt: 'blur', width: 768, height: 1024,
      seed: 9, steps: 24, cfgScale: 5.5, sampler: 'euler', scheduler: 'normal', model: '', vae: '',
    })).toMatchObject({
      '1': { inputs: { text: 'pixel heroine' } },
      '3': { inputs: { width: 768, height: 1024 } },
      '4': { inputs: { seed: 9, steps: 24, cfg: 5.5 } },
    })

    const settings = createDefaultImageGenerationSettings()
    settings.comfyUI.workflowJson = JSON.stringify(workflow)
    settings.comfyUI.pollIntervalMs = 1
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/prompt')) return Response.json({ prompt_id: 'prompt-1', number: 1 })
      if (url.endsWith('/history/prompt-1')) {
        return Response.json({ 'prompt-1': { outputs: { '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } })
      }
      if (url.includes('/view?')) return pngResponse()
      throw new Error(`unexpected ${url}`)
    })
    const result = await createComfyUIAdapter(fetchMock).generate({ settings, positivePrompt: 'pixel heroine', negativePrompt: 'blur' })
    expect(result.blob.type).toBe('image/png')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('filename=out.png'))).toBe(true)
  })

  it('按 NovelAI 协议携带完整参数与 Bearer 密钥并读取图片响应', async () => {
    const settings = createDefaultImageGenerationSettings()
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer nai-key')
      expect(JSON.parse(String(init?.body))).toMatchObject({
        action: 'generate', input: 'pixel cowgirl', model: 'nai-diffusion-4-5-full',
        parameters: { negative_prompt: 'text', width: 1024, height: 1024, steps: 28, scale: 10 },
      })
      return pngResponse()
    })
    const result = await createNovelAIAdapter(fetchMock).generate({
      settings, positivePrompt: 'pixel cowgirl', negativePrompt: 'text', credential: 'nai-key',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://image.novelai.net/ai/generate-image', expect.any(Object))
    expect(result.blob.type).toBe('image/png')
  })

  it('把启用的 NovelAI NAI3 氛围参考图写入三组等长载荷', async () => {
    const settings = createDefaultImageGenerationSettings()
    settings.novelAI.model = 'nai-diffusion-3'
    settings.novelAI.vibeTransfer = true
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const parameters = JSON.parse(String(init?.body)).parameters
      expect(parameters.reference_image_multiple).toHaveLength(1)
      expect(parameters.reference_information_extracted_multiple).toEqual([0.8])
      expect(parameters.reference_strength_multiple).toEqual([0.55])
      return pngResponse()
    })
    await createNovelAIAdapter(fetchMock).generate({
      settings, positivePrompt: 'scene', negativePrompt: '', credential: 'nai-key',
      references: [{ id: 'ref', name: 'vibe.png', kind: 'vibe', blob: new Blob(['vibe'], { type: 'image/png' }), mimeType: 'image/png', bytes: 4, strength: 0.55, informationExtracted: 0.8, enabled: true, createdAt: 1 }],
    })
  })

  it('兼容 OpenAI/Grok 图片接口的 b64_json 与远程 URL 响应', async () => {
    const settings = createDefaultImageGenerationSettings()
    const b64Fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer image-key')
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: 'gpt-image-1', prompt: expect.stringContaining('pixel witch') })
      return Response.json({ data: [{ b64_json: btoa('image-data'), revised_prompt: 'revised' }] })
    })
    const first = await createOpenAIImageAdapter(b64Fetch).generate({
      settings, positivePrompt: 'pixel witch', negativePrompt: 'blur', credential: 'image-key',
    })
    expect(first.revisedPrompt).toBe('revised')

    settings.openAIImage.responseFormat = 'url'
    const urlFetch = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/images/generations')
      ? Response.json({ data: [{ url: 'https://images.example.test/result.png' }] })
      : pngResponse())
    const second = await createOpenAIImageAdapter(urlFetch).generate({ settings, positivePrompt: 'scene', negativePrompt: '' })
    expect(second.blob.type).toBe('image/png')
  })
})
