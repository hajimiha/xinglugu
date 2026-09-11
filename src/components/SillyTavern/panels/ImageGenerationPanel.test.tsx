import 'fake-indexeddb/auto'
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTavernDatabase } from '../../../sillytavern/database'
import { createTavernRepository } from '../../../sillytavern/repository'
import { TavernProvider } from '../../../tavern/TavernContext'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { clearImageProviderCredential, setImageProviderCredential, resolveImageProviderCredential, resolveImagePromptCredential } from '../../../sillytavern/image-generation/credentials'

let database: ReturnType<typeof createTavernDatabase> | undefined
afterEach(async () => { cleanup(); vi.unstubAllGlobals(); clearImageProviderCredential('novelai'); sessionStorage.clear(); localStorage.clear(); await database?.delete(); database = undefined })

async function setup() {
  database = createTavernDatabase(`image-panel-${crypto.randomUUID()}`)
  const repository = createTavernRepository(database)
  render(<TavernProvider repository={repository}><ImageGenerationPanel /></TavernProvider>)
  await screen.findByLabelText('绘图服务')
  return repository
}

describe('绘图配置交互', () => {
  it('读取预设文件期间的编辑不会被较早的导入快照覆盖', async () => {
    await setup()
    let finishRead!: (text: string) => void
    const file = new File(['placeholder'], 'context.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: () => new Promise<string>((resolve) => { finishRead = resolve }) })
    fireEvent.change(screen.getByLabelText('选择提示词预设 JSON'), { target: { files: [file] } })
    fireEvent.change(screen.getByLabelText('提示词预设名称'), { target: { value: 'edited-while-reading' } })
    await act(async () => finishRead(JSON.stringify({ imported: { entries: [{ role: 'system', content: 'new' }] } })))
    expect(screen.getByRole('option', { name: 'edited-while-reading' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'imported' })).toBeInTheDocument()
  })
  it('只测试未保存的绘图接口时使用临时密钥，不修改已存密钥或接口', async () => {
    const repository = await setup()
    setImageProviderCredential('novelai', 'saved-nai-key', false)
    fireEvent.change(screen.getByLabelText('绘图服务'), { target: { value: 'novelai' } })
    fireEvent.change(screen.getByLabelText('接口根地址'), { target: { value: 'https://temporary-nai.test' } })
    fireEvent.change(screen.getByLabelText('供应商密钥（本地服务可留空）'), { target: { value: 'draft-nai-key' } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://temporary-nai.test/user/subscription')
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer draft-nai-key')
      return Response.json({ tier: 3, active: true })
    }))
    fireEvent.click(screen.getByRole('button', { name: '测试连接' }))
    await screen.findByText(/NovelAI 密钥验证成功/)
    expect(resolveImageProviderCredential('novelai')).toBe('saved-nai-key')
    expect((await repository.getSettings()).imageGeneration.novelAI.baseUrl).toBe('https://image.novelai.net')
  })
  it('切换 NAI 可直接选择模型，保存其他参数不误删已存密钥', async () => {
    const repository = await setup()
    fireEvent.change(screen.getByLabelText('绘图服务'), { target: { value: 'novelai' } })
    const model = screen.getByLabelText('NovelAI 模型')
    expect(model.tagName).toBe('SELECT')
    expect(screen.getByLabelText('SMEA')).toBeDisabled()
    fireEvent.change(model, { target: { value: 'nai-diffusion-3' } })
    expect(screen.getByLabelText('SMEA')).toBeEnabled()
    fireEvent.change(model, { target: { value: 'nai-diffusion-4-5-curated' } })
    fireEvent.change(screen.getByLabelText('供应商密钥（本地服务可留空）'), { target: { value: 'nai-local-only' } })
    fireEvent.click(screen.getByRole('button', { name: '保存绘图配置' }))
    await waitFor(async () => expect((await repository.getSettings()).imageGeneration.novelAI.model).toBe('nai-diffusion-4-5-curated'))
    await waitFor(() => expect(screen.getByLabelText('供应商密钥（本地服务可留空）')).toHaveValue(''))
    expect(screen.getByText('绘图配置、提示词预设与缓存规则已保存。')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: '保存绘图配置' }))
    await waitFor(() => expect(screen.getByText('绘图配置、提示词预设与缓存规则已保存。')).toBeVisible())
    expect(resolveImageProviderCredential('novelai')).toBe('nai-local-only')
    expect(JSON.stringify(await repository.getSettings())).not.toContain('nai-local-only')
    fireEvent.click(screen.getByRole('button', { name: '清除绘图密钥' }))
    expect(resolveImageProviderCredential('novelai')).toBe('')
  })

  it('独立提示词接口连接获取模型，预设切换与保存不更改正文接口或固定画风', async () => {
    const repository = await setup()
    const before = await repository.getSettings()
    fireEvent.click(screen.getByRole('checkbox', { name: /启用绘图提示词独立 API/ }))
    fireEvent.change(screen.getByLabelText('提示词 API 根地址'), { target: { value: 'https://prompt-ui.test/v1' } })
    fireEvent.change(screen.getByLabelText('提示词 API 密钥'), { target: { value: 'prompt-ui-key' } })
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://prompt-ui.test/v1/models')
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer prompt-ui-key')
      return Response.json({ data: [{ id: 'illustrator-1' }, { id: 'illustrator-2' }] })
    }))
    fireEvent.click(screen.getByRole('button', { name: '连接并获取提示词模型' }))
    await screen.findByRole('option', { name: 'illustrator-2' })
    fireEvent.change(screen.getByLabelText('可用提示词模型'), { target: { value: 'illustrator-2' } })
    fireEvent.click(screen.getByRole('button', { name: '新建提示词预设' }))
    fireEvent.change(screen.getByLabelText('提示词预设名称'), { target: { value: '插画整理' } })
    fireEvent.change(screen.getByLabelText('条目 1 内容'), { target: { value: 'Compose a village illustration.' } })
    fireEvent.click(screen.getByRole('button', { name: '保存绘图配置' }))
    await waitFor(async () => expect((await repository.getSettings()).imageGeneration.prompt.api.model).toBe('illustrator-2'))
    const after = await repository.getSettings()
    expect(after.api).toEqual(before.api)
    expect(after.imageGeneration.prompt.presets).toEqual(before.imageGeneration.prompt.presets)
    expect(after.imageGeneration.prompt.llmPresets.find((preset) => preset.name === '插画整理')?.entries[0].content).toBe('Compose a village illustration.')
    expect(resolveImagePromptCredential(after.imageGeneration.prompt.api)).toBe('prompt-ui-key')
    expect(JSON.stringify(after)).not.toContain('prompt-ui-key')
  })
})
