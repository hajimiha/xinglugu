import 'fake-indexeddb/auto'
import '../../test/setup'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
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
  it('提供六个可键盘切换的酒馆管理标签与真实接口入口', async () => {
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
    expect(tabs).toHaveLength(6)
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

    await user.click(screen.getByRole('tab', { name: '角色卡' }))
    await waitFor(() => expect(screen.getAllByRole('button', { name: /编辑角色卡/ })).toHaveLength(21))
    expect(screen.getByText('居民与共生伙伴')).toBeVisible()
    expect(screen.getAllByText(/苔灯农场·共生牧场/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: '导出仓库内容包' })).toBeVisible()
    expect(screen.getByText(/public\/content\/mistvale-content-pack\.json/)).toBeVisible()
  })

  it('通过文件输入导入并展示 SillyTavern 分组预设', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-preset-import-${crypto.randomUUID()}`)
    render(
      <GameProvider>
        <TavernProvider repository={createTavernRepository(database)}>
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
  })
})
