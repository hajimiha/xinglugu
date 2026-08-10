import '../../test/setup'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { ModalHost } from './ModalHost'

function RuleObserver() {
  const { state } = useGame()
  return <output aria-label="当前经验倍率">{state.rules.experienceMultiplier}</output>
}

describe('游戏玩法设置', () => {
  it('允许在玩家档案区更改姓名', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'settings' }}><ModalHost /></GameProvider>)
    const input = screen.getByLabelText('玩家姓名')
    expect(input).toHaveAttribute('id', 'settings-player-name')
    await user.clear(input)
    await user.type(input, '星野')
    await user.click(screen.getByRole('button', { name: '保存玩家姓名' }))
    expect(screen.getByText('姓名已更新为“星野”')).toBeVisible()
  })

  it('提供九项真实规则、实时示例，并仅在应用后更新游戏状态', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'settings' }}><RuleObserver /><ModalHost /></GameProvider>)

    expect(screen.getByRole('dialog', { name: '游戏设置' })).toBeVisible()
    expect(screen.getAllByRole('spinbutton')).toHaveLength(8)
    expect(screen.getAllByRole('radio')).toHaveLength(3)
    expect(screen.getByText('战斗训练 18 经验 → 18')).toBeVisible()

    fireEvent.change(screen.getByRole('spinbutton', { name: '经验获取倍率数值' }), { target: { value: '2' } })
    expect(screen.getByText('战斗训练 18 经验 → 36')).toBeVisible()
    expect(screen.getByLabelText('当前经验倍率')).toHaveTextContent('1')

    await user.click(screen.getByRole('button', { name: '应用玩法规则' }))
    expect(screen.getByLabelText('当前经验倍率')).toHaveTextContent('2')
    expect(screen.getByText('规则已应用')).toBeVisible()
  })

  it('通过应用内确认恢复标准规则', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{
      ...initialGameState,
      activeModal: 'settings',
      rules: { ...initialGameState.rules, experienceMultiplier: 2 },
    }}><RuleObserver /><ModalHost /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '恢复标准规则' }))
    expect(screen.getByRole('alert')).toHaveTextContent('确认恢复全部标准规则')
    expect(screen.getByLabelText('当前经验倍率')).toHaveTextContent('2')
    await user.click(screen.getByRole('button', { name: '确认恢复' }))
    expect(screen.getByLabelText('当前经验倍率')).toHaveTextContent('1')
  })

  it('数值框允许清空后直接键入小数，并在应用时提交精确倍率', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'settings' }}><RuleObserver /><ModalHost /></GameProvider>)

    const input = screen.getByRole('spinbutton', { name: '经验获取倍率数值' })
    await user.clear(input)
    expect(input).toHaveValue('')
    await user.type(input, '1.75')

    expect(input).toHaveValue('1.75')
    expect(screen.getByText('战斗训练 18 经验 → 32')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '应用玩法规则' }))
    expect(screen.getByLabelText('当前经验倍率')).toHaveTextContent('1.75')
  })

  it('提供自动存档状态、导出导入和应用内新档确认', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, activeModal: 'settings' }}><ModalHost /></GameProvider>)

    expect(screen.getByLabelText('自动存档管理')).toHaveTextContent('自动存档')
    expect(screen.getByRole('button', { name: '导出游戏存档' })).toHaveAttribute('id', 'settings-save-export')
    expect(screen.getByLabelText('导入游戏存档')).toHaveAttribute('id', 'settings-save-import')
    await user.click(screen.getByRole('button', { name: '新建游戏存档' }))
    expect(screen.getByRole('alert')).toHaveTextContent('确认清除当前游戏进度')
    await user.click(screen.getByRole('button', { name: '取消新建存档' }))
    expect(screen.queryByText('确认清除当前游戏进度')).not.toBeInTheDocument()
  })
})
