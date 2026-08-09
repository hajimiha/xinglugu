import '../../test/setup'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { FarmStage } from './FarmStage'

const plantedPlots = initialGameState.plots.map((plot) => {
  if (plot.id === 'plot-1-1') return { ...plot, cropId: 'moon-radish', remainingHours: 32 }
  if (plot.id === 'plot-1-2') return { ...plot, cropId: 'sun-wheat', remainingHours: 0, watered: true, fertilized: true, ready: true }
  return plot
})

describe('农场主舞台', () => {
  it('呈现二十四块可交互农田并打开作物详情', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, plots: plantedPlots }}><FarmStage /></GameProvider>)

    expect(screen.getAllByRole('button', { name: /^地块/ })).toHaveLength(24)
    await user.click(screen.getByRole('button', { name: '地块 1-1，月铃萝卜，1日8小时后成熟' }))

    const dialog = screen.getByRole('dialog', { name: '地块详情' })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByText('月铃萝卜')).toBeVisible()
    expect(screen.getByRole('button', { name: '给地块 1-1 浇水' })).toBeEnabled()
  })

  it('收获成熟作物后将地块清空', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, plots: plantedPlots }}><FarmStage /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '地块 1-2，夕照麦，已经成熟' }))
    await user.click(screen.getByRole('button', { name: '收获地块 1-2 的夕照麦' }))

    expect(screen.getByRole('button', { name: '地块 1-2，空地' })).toBeVisible()
  })

  it('点击空地后展示当季持有种子并可立即播种', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{
      ...initialGameState,
      rules: { ...initialGameState.rules, cropGrowthMultiplier: 2 },
    }}><FarmStage /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '地块 1-1，空地' }))
    const dialog = screen.getByRole('dialog', { name: '地块详情' })
    expect(within(dialog).getByRole('button', { name: '播种月铃萝卜，持有 8 包' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: '播种雾荚豆，持有 4 包' })).toBeEnabled()

    await user.click(within(dialog).getByRole('button', { name: '播种月铃萝卜，持有 8 包' }))
    expect(screen.getByRole('button', { name: '地块 1-1，月铃萝卜，1日4小时后成熟' })).toBeVisible()
    expect(within(dialog).getByText('1日4小时后成熟')).toBeVisible()
  })

  it('保留背包中的异季种子并明确显示为不可播种', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{
      ...initialGameState,
      inventory: { ...initialGameState.inventory, 'sun-wheat-seed': 2 },
    }}><FarmStage /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '地块 1-1，空地' }))
    const dialog = screen.getByRole('dialog', { name: '地块详情' })
    const autumnSeed = within(dialog).getByRole('button', { name: '播种夕照麦，持有 2 包，秋季可用' })
    expect(autumnSeed).toBeDisabled()
    expect(within(autumnSeed).getByText('秋季可用')).toBeVisible()
  })

  it('提供可滚动农田与开拓入口，新增地块仍可打开播种详情', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={initialGameState}><FarmStage /></GameProvider>)

    const field = screen.getByRole('region', { name: '可滚动农田' })
    expect(field).toHaveAttribute('tabindex', '0')
    expect(screen.getByText('4 行 · 24 格')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '开拓新田垄，消耗 1 点精力' }))
    expect(screen.getByText('5 行 · 30 格')).toBeVisible()
    await user.click(within(field).getByRole('button', { name: '地块 5-6，空地' }))
    expect(screen.getByRole('dialog', { name: '地块详情' })).toBeVisible()
    expect(screen.getByRole('button', { name: '播种月铃萝卜，持有 8 包' })).toBeEnabled()
  })

  it('三十行满级时禁用继续开拓', () => {
    const plots = Array.from({ length: 30 }, (_, row) => ({
      id: `plot-${row + 1}-1`, row: row + 1, column: 1, watered: false, fertilized: false, ready: false,
    }))
    render(<GameProvider initialState={{ ...initialGameState, plots }}><FarmStage /></GameProvider>)
    expect(screen.getByRole('button', { name: '田地已达三十行上限' })).toBeDisabled()
  })
})
