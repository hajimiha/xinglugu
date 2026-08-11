import './test/setup'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { GameProvider } from './game/GameContext'
import { initialGameState } from './game/reducer'
import { TopHud } from './components/shell/TopHud'
import { VillageMap } from './components/shell/VillageMap'

describe('玩家可见品牌', () => {
  it('HUD 与地图统一显示性撸谷品牌', () => {
    render(
      <GameProvider initialState={initialGameState}>
        <TopHud />
        <VillageMap />
      </GameProvider>,
    )

    expect(screen.getByText('性撸谷物语')).toBeVisible()
    expect(screen.getByRole('application', { name: '可拖动的性撸谷地图' })).toBeInTheDocument()
    expect(screen.queryByText('雾灯谷纪事')).not.toBeInTheDocument()
  })
})
