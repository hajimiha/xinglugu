import '../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import type { PlayerProfile } from '../../game/types'
import { OnboardingFlow } from './OnboardingFlow'

function renderFlow(playerProfile: PlayerProfile) {
  return render(
    <GameProvider initialState={{ ...initialGameState, playerProfile }}>
      <OnboardingFlow><main>普通游戏</main></OnboardingFlow>
    </GameProvider>,
  )
}

describe('新玩家开场编排', () => {
  it('姓名确认前保留普通背景，确认后自动切换到开场', async () => {
    const user = userEvent.setup()
    renderFlow({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })

    expect(screen.getByText('普通游戏')).toBeVisible()
    expect(screen.getByRole('dialog', { name: '登记旅人名' })).toBeVisible()
    await user.type(screen.getByLabelText('玩家姓名'), '云岚')
    await user.click(screen.getByRole('button', { name: '确认姓名并进入性撸谷' }))

    expect(screen.getByTestId('village-opening-intro')).toBeVisible()
    expect(screen.queryByText('普通游戏')).not.toBeInTheDocument()
  })

  it('开场期间不挂载普通游戏，确认跳过后立即恢复', async () => {
    const user = userEvent.setup()
    renderFlow({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: false })

    expect(screen.getByTestId('village-opening-intro')).toBeVisible()
    expect(screen.queryByText('普通游戏')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '跳过剧情' }))
    await user.click(screen.getByRole('button', { name: '确认跳过' }))

    expect(screen.queryByTestId('village-opening-intro')).not.toBeInTheDocument()
    expect(screen.getByText('普通游戏')).toBeVisible()
  })

  it('已经完成开场的玩家直接进入普通游戏', () => {
    renderFlow({ name: '旧玩家', hasConfirmedName: true, hasCompletedVillageIntro: true })

    expect(screen.getByText('普通游戏')).toBeVisible()
    expect(screen.queryByTestId('village-opening-intro')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: '登记旅人名' })).not.toBeInTheDocument()
  })
})
