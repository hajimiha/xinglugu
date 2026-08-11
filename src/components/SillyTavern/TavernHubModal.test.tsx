import 'fake-indexeddb/auto'
import '../../test/setup'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as importer from '../../sillytavern/importer'
import { GameProvider } from '../../game/GameContext'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../sillytavern/database'
import { createTavernRepository } from '../../sillytavern/repository'
import { TavernProvider } from '../../tavern/TavernContext'
import { TavernHubModal } from './TavernHubModal'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

describe('酒馆中枢', () => {
  it('提供八个可键盘切换的酒馆管理标签与真实接口入口', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-hub-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(8)
    expect(screen.getByRole('tab', { name: '接口' })).toHaveAttribute('id', 'tavern-tab-api')
    expect(await screen.findByText('浏览器直连提醒')).toBeVisible()
    expect(screen.getByLabelText('API 密钥')).toBeVisible()
    expect(screen.getByText('LLM API REQUIRED')).toBeVisible()
    expect(screen.queryByText(/LLM LOCAL|本地叙事/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: '世界书' }))
    expect(await screen.findByRole('button', { name: '导入世界书' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出当前世界书' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '预设' }))
    expect(await screen.findByRole('button', { name: '导入预设' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出当前预设' })).toBeVisible()
    expect(screen.getByRole('heading', { name: '预设生成参数' })).toBeVisible()

    await user.click(screen.getByRole('tab', { name: '角色卡' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /编辑角色卡/ })).toHaveLength(21))
    expect(screen.getByText('居民与共生伙伴')).toBeVisible()
    expect(screen.getAllByText(/苔灯农场·共生牧场/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '导出仓库内容包' })).toBeVisible()
    expect(screen.getByText(/public\/content\/mistvale-content-pack\.json/)).toBeVisible()
    await user.click(screen.getAllByRole('button', { name: /编辑角色卡/ })[0])
    expect(await screen.findByRole('heading', { name: /立绘资产/ })).toBeVisible()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getAllByText(/人物文字设定请在世界书中维护/).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('tab', { name: '检查器' }))
    expect(await screen.findByRole('heading', { name: '请求检查器' })).toBeVisible()
    expect(screen.getByText(/不会保存 API 密钥/)).toBeVisible()
  })

  it('通过文件输入导入并展示 SillyTavern 分组预设', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-preset-import-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    render(
      <GameProvider>
        <TavernProvider repository={repository}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )
    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '预设' }))
    const fileSource = JSON.stringify({
      prompts: [
        { identifier: 'main', name: '主提示词', role: 'system', content: '预设正文' },
        { identifier: 'gemini', name: '模型回复', role: 'model', content: '角色回复规则' },
      ],
      prompt_order: [
        { character_id: 100000, order: [{ identifier: 'main', enabled: false }] },
        { character_id: 100001, order: [
          { identifier: 'main', enabled: true },
          { identifier: 'gemini', enabled: false },
        ] },
      ],
    })
    const file = new File([fileSource], '夏瑾 天琴座 Beta 1.0.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => fileSource })
    await user.upload(screen.getByLabelText('选择预设 JSON'), file)

    expect(await screen.findByText(/已导入“夏瑾 天琴座 Beta 1\.0”：2 个顺序项，1 个已启用/)).toBeVisible()
    expect(screen.getByText('2 个顺序项')).toBeVisible()
    expect(screen.getByText('1 个已启用')).toBeVisible()
    expect(screen.getByText('主提示词')).toBeVisible()
    expect(screen.getByText('模型回复')).toBeVisible()
    expect(screen.queryByText('预设角色槽位')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '预设角色槽位' })).not.toBeInTheDocument()
    const imported = (await repository.listPresets()).find((preset) => preset.name === '夏瑾 天琴座 Beta 1.0')
    expect(imported?.settings.prompt_order).toEqual(JSON.parse(fileSource).prompt_order)
  })

  it('变量中心支持类型、全局或会话作用域、范围校验与 JSON 导入导出', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-variable-center-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const now = Date.now()
    await repository.saveSession({
      id: 'variable-session',
      name: '变量测试会话',
      characterName: '洛岚',
      userName: '旅行者',
      presetId: null,
      presetBinding: { mode: 'follow-active' },
      lorebookIds: [],
      variables: {},
      messages: [],
      createdAt: now,
      updatedAt: now,
    })
    const settings = await repository.getSettings()
    await repository.saveSettings({ ...settings, activeSessionId: 'variable-session' })
    render(
      <GameProvider>
        <TavernProvider repository={repository}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '变量' }))
    expect(await screen.findByRole('heading', { name: '变量中心' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导入变量 JSON' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出变量 JSON' })).toBeVisible()

    await user.type(screen.getByLabelText('新变量名称'), 'affinityMultiplier')
    await user.selectOptions(screen.getByLabelText('新变量类型'), 'number')
    await user.selectOptions(screen.getByLabelText('新变量作用域'), 'global')
    await user.clear(screen.getByLabelText('新变量初始值'))
    await user.type(screen.getByLabelText('新变量初始值'), '1.5')
    await user.click(screen.getByRole('button', { name: '添加变量' }))

    expect(screen.getByText('affinityMultiplier')).toBeVisible()
    expect(screen.getByText('全局', { selector: '.variable-scope-badge' })).toBeVisible()
    expect(screen.getByLabelText('affinityMultiplier的值')).toHaveAttribute('type', 'number')
  })

  it('正则中心可以创建分阶段脚本并即时测试输入输出', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-regex-center-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '正则' }))
    expect(await screen.findByRole('heading', { name: '正则中心' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导入正则 JSON' })).toBeVisible()
    expect(screen.getByRole('button', { name: '导出正则 JSON' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '新建正则脚本' }))
    await user.clear(screen.getByLabelText('正则表达式'))
    await user.type(screen.getByLabelText('正则表达式'), '/<box>(.*?)<\\/box>/g')
    await user.clear(screen.getByLabelText('替换文本'))
    await user.type(screen.getByLabelText('替换文本'), '$1')
    await user.clear(screen.getByLabelText('正则测试输入'))
    await user.type(screen.getByLabelText('正则测试输入'), '<box>雾灯</box>')

    expect(screen.getByLabelText('正则测试输出')).toHaveValue('雾灯')
  })

  it('会话页可以显式选择跟随活动预设或固定指定预设', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-session-binding-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const now = Date.now()
    await repository.saveSession({
      id: 'binding-session', name: '绑定测试会话', characterName: '洛岚', userName: '旅行者', presetId: null,
      presetBinding: { mode: 'follow-active' }, lorebookIds: [], variables: {}, messages: [], createdAt: now, updatedAt: now,
    })
    render(<GameProvider><TavernProvider repository={repository}><TavernHubModal onClose={() => undefined} /></TavernProvider></GameProvider>)

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '会话' }))
    await user.selectOptions(await screen.findByLabelText('会话预设绑定方式'), 'pinned')

    expect(await screen.findByLabelText('会话固定预设')).toBeVisible()
    expect((await repository.getSession('binding-session'))?.presetBinding).toMatchObject({ mode: 'pinned' })
  })

  it('请求检查器展示实际消息与脱敏后的供应商 JSON', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-request-inspector-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    await repository.saveRequestAudit({
      id: 'audit-ui', createdAt: Date.now(), status: 'succeeded', sessionId: 'session', characterName: '洛岚',
      presetId: 'preset', presetName: '当前测试预设', presetBinding: 'follow-active', provider: 'deepseek', model: 'deepseek-v4-flash',
      preparedRequest: { task: 'story', messages: [{ role: 'system', content: 'CURRENT-PRESET-SENTINEL' }, { role: 'user', content: '继续' }] },
       providerRequest: { url: 'https://user:secret@api.deepseek.com/chat/completions?api_key=secret', method: 'POST', headers: { Authorization: '[已隐藏]' }, body: { model: 'deepseek-v4-flash', messages: [{ role: 'system', content: 'CURRENT-PRESET-SENTINEL' }] } },
      segments: [{ id: 'segment', source: 'preset', identifier: 'main', role: 'system', raw: 'CURRENT-PRESET-SENTINEL', compiled: 'CURRENT-PRESET-SENTINEL', sent: true, messageIndex: 0, tokenEstimate: 6, diagnostics: [] }],
      macroOperations: [], matchedLorebookEntries: [], diagnostics: [],
    })
    render(<GameProvider><TavernProvider repository={repository}><TavernHubModal onClose={() => undefined} /></TavernProvider></GameProvider>)

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '检查器' }))
    expect(await screen.findByText('当前测试预设')).toBeVisible()
    expect(screen.getByText(/本机保留最近 20 次请求/)).toBeVisible()
    expect(screen.getByText('导出本次')).toBeVisible()
    await user.click(screen.getByText('查看编译后正文'))
    expect(screen.getByText('CURRENT-PRESET-SENTINEL')).toBeVisible()
    await user.click(screen.getByRole('tab', { name: '供应商 JSON' }))
    expect(screen.getAllByText(/CURRENT-PRESET-SENTINEL/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/已隐藏/).some((element) => element.tagName === 'PRE')).toBe(true)
    expect(screen.getByText('https://api.deepseek.com/chat/completions')).toBeVisible()
    expect(screen.queryByText(/api_key=secret|user:secret/)).not.toBeInTheDocument()
    expect(screen.queryByText(/session-secret/)).not.toBeInTheDocument()
  })

  it('导出请求档案时不包含地址或凭据字段中的敏感值', async () => {
    const user = userEvent.setup()
    const exportSpy = vi.spyOn(importer, 'exportToJson').mockImplementation(() => undefined)
    database = createTavernDatabase(`mistvale-request-export-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    await repository.saveRequestAudit({
      id: 'audit-export', createdAt: Date.now(), status: 'succeeded', sessionId: 'session', characterName: '洛岚',
      presetId: 'preset', presetName: '导出测试预设', presetBinding: 'follow-active', provider: 'deepseek', model: 'deepseek-v4-flash',
      preparedRequest: { task: 'story', messages: [{ role: 'user', content: '继续' }], context: { apiKey: 'context-secret' } },
      providerRequest: {
        url: 'https://user:secret@api.deepseek.com/chat/completions?api_key=query-secret#fragment',
        method: 'POST',
        headers: { Authorization: 'Bearer header-secret', 'X-Api-Key': 'header-key-secret' },
        body: { model: 'deepseek-v4-flash', api_key: 'body-key-secret', token: 'body-token-secret', password: 'body-password-secret' },
      },
      segments: [], macroOperations: [], matchedLorebookEntries: [], diagnostics: [],
    })
    render(<GameProvider><TavernProvider repository={repository}><TavernHubModal onClose={() => undefined} /></TavernProvider></GameProvider>)

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '检查器' }))
    await screen.findByText('导出测试预设')
    await user.click(screen.getByRole('button', { name: '导出本次' }))

    const exported = JSON.stringify(exportSpy.mock.calls[0]?.[0])
    expect(exported).not.toContain('user:secret')
    expect(exported).not.toContain('query-secret')
    expect(exported).not.toContain('header-secret')
    expect(exported).not.toContain('header-key-secret')
    expect(exported).not.toContain('body-key-secret')
    expect(exported).not.toContain('body-token-secret')
    expect(exported).not.toContain('body-password-secret')
    expect(exported).not.toContain('context-secret')
    expect(exported).toContain('[已隐藏]')
    exportSpy.mockRestore()
  })

  it('点击关闭按钮后卸载角色卡编辑器', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-character-close-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '角色卡' }))
    await user.click((await screen.findAllByRole('button', { name: /编辑角色卡/ }))[0])
    expect(screen.getByRole('button', { name: '关闭角色卡编辑' })).toBeVisible()

    await user.click(screen.getByRole('button', { name: '关闭角色卡编辑' }))

    expect(screen.queryByRole('button', { name: '关闭角色卡编辑' })).not.toBeInTheDocument()
  })

  it('在角色编辑器首屏提供直达好感区间立绘上传区的入口', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-character-portrait-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '角色卡' }))
    await user.click((await screen.findAllByRole('button', { name: /编辑角色卡/ }))[0])

    const shortcut = screen.getByRole('button', { name: '前往立绘上传' })
    expect(shortcut).toBeVisible()
    expect(screen.getByRole('group', { name: '好感区间立绘' })).toHaveAttribute('data-portrait-upload-target', 'true')
    expect(screen.getByText('好感 0—100')).toBeVisible()
  })

  it('可载入超过 512 KB 的角色立绘', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-character-large-portrait-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
          <TavernHubModal onClose={() => undefined} />
        </TavernProvider>
      </GameProvider>,
    )

    await screen.findByText('浏览器直连提醒')
    await user.click(screen.getByRole('tab', { name: '角色卡' }))
    await user.click((await screen.findAllByRole('button', { name: /编辑角色卡/ }))[0])
    const file = new File([new Uint8Array(600 * 1024)], 'large-portrait.webp', { type: 'image/webp' })

    await user.upload(screen.getByLabelText(/选择立绘/), file)

    expect(await screen.findByRole('status')).toHaveTextContent(/立绘已载入/)
    expect(screen.getByAltText(/好感0—100立绘预览/)).toHaveAttribute('src', expect.stringMatching(/^data:image\/webp;base64,/))
  })
})
