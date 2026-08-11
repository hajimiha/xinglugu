import 'fake-indexeddb/auto'
import '../../../test/setup'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearSessionApiKey } from '../../../sillytavern/api-credentials'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../../sillytavern/database'
import { createTavernRepository } from '../../../sillytavern/repository'
import { TavernProvider } from '../../../tavern/TavernContext'
import { ApiPanel } from './ApiPanel'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  clearSessionApiKey()
  vi.unstubAllGlobals()
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

describe('酒馆 API 控制台', () => {
  it('支持配置、显隐并按玩家选择在本机保存密钥', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-api-panel-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)

    render(<TavernProvider repository={repository}><ApiPanel /></TavernProvider>)

    const keyInput = await screen.findByLabelText('API 密钥')
    expect(keyInput).toHaveAttribute('id', 'tavern-api-key')
    expect(keyInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: '显示 API 密钥' }))
    expect(keyInput).toHaveAttribute('type', 'text')
    await user.type(keyInput, 'player-secret')
    await user.click(screen.getByLabelText('仅在这台设备上记住密钥'))
    await user.click(screen.getByRole('button', { name: '保存接口配置' }))

    expect(await screen.findByText('接口配置已保存。')).toBeVisible()
    await waitFor(async () => expect(await repository.getSettings()).toMatchObject({
      api: { rememberKey: true, persistedApiKey: 'player-secret' },
    }))
    expect(await repository.getSettings()).not.toHaveProperty('adapterMode')
  })

  it('请求模型列表并在内部状态框展示连接结果', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }],
    }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    database = createTavernDatabase(`mistvale-api-test-${crypto.randomUUID()}`)

    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    const keyInput = await screen.findByLabelText('API 密钥')
    await user.type(keyInput, 'session-secret')
    const testButton = screen.getByRole('button', { name: '测试连接' })
    expect(testButton).toHaveAttribute('id', 'tavern-api-test')
    await user.click(testButton)

    expect(await screen.findByText('连接成功，发现 2 个可用模型。')).toBeVisible()
    expect(fetchMock).toHaveBeenCalledWith('https://api.deepseek.com/models', expect.any(Object))
  })

  it('按注册表展示全部供应商与云平台专属字段', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-api-provider-${crypto.randomUUID()}`)
    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    const providerSelect = await screen.findByLabelText('聊天补全来源')
    expect(providerSelect.querySelectorAll('option')).toHaveLength(23)
    expect(screen.queryByLabelText('对话生成方式')).not.toBeInTheDocument()

    await user.selectOptions(providerSelect, 'claude')
    expect(screen.getByDisplayValue('https://api.anthropic.com')).toBeVisible()
    expect(screen.getByRole('link', { name: '查看 Claude 官方文档' })).toHaveAttribute('href', expect.stringContaining('claude.com'))

    await user.selectOptions(providerSelect, 'cloudflare-workers-ai')
    expect(screen.getByLabelText('Account ID')).toHaveAttribute('id', 'tavern-api-option-account-id')

    await user.selectOptions(providerSelect, 'google-vertex-ai')
    expect(screen.getByLabelText('项目 ID')).toHaveAttribute('id', 'tavern-api-option-project-id')
    expect(screen.getByLabelText('区域')).toHaveAttribute('id', 'tavern-api-option-location')
    expect(screen.getAllByText(/OAuth access token/).length).toBeGreaterThan(0)
  })

  it('阻止保存缺少供应商专属字段的配置', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-api-validation-${crypto.randomUUID()}`)
    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    await user.selectOptions(await screen.findByLabelText('聊天补全来源'), 'cloudflare-workers-ai')
    await user.type(screen.getByLabelText('API 密钥'), 'cloudflare-token')
    await user.click(screen.getByRole('button', { name: '保存接口配置' }))

    expect(await screen.findByText(/请填写 Account ID/)).toHaveAttribute('role', 'alert')
  })

  it('展示完整生成参数并取消最大回复长度上限与地址重置按钮', async () => {
    database = createTavernDatabase(`mistvale-api-parameters-${crypto.randomUUID()}`)
    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    expect(await screen.findByLabelText('上下文长度（以词符数计）')).toHaveAttribute('inputmode', 'numeric')
    const responseLength = screen.getByLabelText('最大回复长度（以词符数计）')
    expect(responseLength).not.toHaveAttribute('max')
    expect(screen.getByLabelText('流式传输')).toBeChecked()
    expect(screen.getByLabelText(/温度/)).toBeVisible()
    expect(screen.getByLabelText(/频率惩罚/)).toBeVisible()
    expect(screen.getByLabelText(/存在惩罚/)).toBeVisible()
    expect(screen.getByLabelText(/Top P/)).toBeVisible()
    expect(screen.queryByRole('button', { name: '恢复官方地址' })).not.toBeInTheDocument()
  })

  it('根据当前编辑中的完整配置即时更新就绪状态', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-api-readiness-${crypto.randomUUID()}`)
    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    expect(await screen.findByText('API REQUIRED')).toBeVisible()
    await user.type(screen.getByLabelText('API 密钥'), 'session-secret')
    await user.clear(screen.getByLabelText('接口根地址'))
    await user.type(screen.getByLabelText('接口根地址'), 'not-a-url')
    expect(screen.getByText('API REQUIRED')).toBeVisible()

    await user.clear(screen.getByLabelText('接口根地址'))
    await user.type(screen.getByLabelText('接口根地址'), 'https://api.example.test')
    expect(await screen.findByText('REMOTE READY')).toBeVisible()
    await user.clear(screen.getByLabelText('模型'))
    expect(screen.getByText('API REQUIRED')).toBeVisible()
  })

  it('允许用键盘逐字输入负数惩罚参数', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-api-negative-${crypto.randomUUID()}`)
    render(<TavernProvider repository={createTavernRepository(database)}><ApiPanel /></TavernProvider>)

    const input = await screen.findByLabelText(/频率惩罚/)
    await user.clear(input)
    await user.type(input, '-0.5')

    expect(input).toHaveValue(-0.5)
    expect(screen.getByText('频率惩罚 · -0.50')).toBeVisible()
  })
})
