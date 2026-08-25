import '../../test/setup'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { VILLAGE_OPENING_BEATS } from './village-opening-story'
import { VillageOpeningIntro } from './VillageOpeningIntro'

const tavernState = vi.hoisted(() => ({
  characters: [] as Array<{
    npcId: string
    portraitSlots: Array<{ id: string; minAffinity: number; maxAffinity: number; source: string }>
  }>,
}))

vi.mock('../../tavern/TavernContext', () => ({
  useOptionalTavern: () => tavernState,
}))

function IntroStateObserver() {
  const { state } = useGame()
  return <output aria-label="开场完成状态">{String(state.playerProfile.hasCompletedVillageIntro)}</output>
}

function renderIntro() {
  return render(
    <GameProvider initialState={{
      ...initialGameState,
      playerProfile: { name: '<云岚>', hasConfirmedName: true, hasCompletedVillageIntro: false },
    }}>
      <VillageOpeningIntro />
      <IntroStateObserver />
    </GameProvider>,
  )
}

describe('全屏村庄 GAL 开场', () => {
  beforeEach(() => {
    tavernState.characters = []
  })

  it('从全景旁白进入洛岚欢迎并聚焦第一处农场', async () => {
    const user = userEvent.setup()
    renderIntro()

    expect(screen.getByTestId('village-opening-intro')).toBeVisible()
    expect(screen.getByRole('img', { name: '村长洛岚立绘' })).toBeVisible()
    expect(screen.getByRole('button', { name: '跳过剧情' })).toBeVisible()
    expect(screen.getByTestId('village-opening-speaker')).toHaveTextContent('旁白')
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`1 / ${VILLAGE_OPENING_BEATS.length}`)
    expect(screen.getByTestId('village-opening-camera')).toHaveAttribute('data-camera-scale', '1')
    expect(screen.queryByTestId('village-opening-advance')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('village-opening-camera'))
    expect(screen.getByText(/欢迎来到性撸谷/)).toHaveTextContent('<云岚>')
    expect(screen.getByTestId('village-opening-speaker')).toHaveTextContent('洛岚')

    await user.click(screen.getByText(/欢迎来到性撸谷/))
    expect(screen.getAllByText('苔灯农场')).toHaveLength(2)
    expect(screen.getByTestId('village-opening-camera')).toHaveAttribute('data-focus-location', 'farm')
  })

  it('在右上角确认跳过、圈定焦点并阻止确认期间推进', async () => {
    const user = userEvent.setup()
    renderIntro()
    const skip = screen.getByRole('button', { name: '跳过剧情' })

    await user.click(skip)
    expect(screen.getByRole('dialog', { name: '跳过村庄介绍' })).toBeVisible()
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`1 / ${VILLAGE_OPENING_BEATS.length}`)
    const continueWatching = screen.getByRole('button', { name: '继续观看' })
    const confirmSkip = screen.getByRole('button', { name: '确认跳过' })
    expect(continueWatching).toHaveFocus()

    await user.tab()
    expect(confirmSkip).toHaveFocus()
    await user.tab({ shift: true })
    expect(continueWatching).toHaveFocus()
    await user.click(screen.getByRole('dialog', { name: '跳过村庄介绍' }))
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`1 / ${VILLAGE_OPENING_BEATS.length}`)
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`1 / ${VILLAGE_OPENING_BEATS.length}`)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: '跳过村庄介绍' })).not.toBeInTheDocument()
    expect(skip).toHaveFocus()

    await user.click(skip)
    await user.keyboard('{Enter}')
    expect(screen.queryByRole('dialog', { name: '跳过村庄介绍' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('开场完成状态')).toHaveTextContent('false')

    await user.click(skip)
    await user.tab()
    expect(screen.getByRole('button', { name: '确认跳过' })).toHaveFocus()
    await user.keyboard(' ')
    expect(screen.getByLabelText('开场完成状态')).toHaveTextContent('true')
  })

  it('支持全局键盘推进并忽略按键重复', () => {
    renderIntro()

    fireEvent.keyDown(window, { key: 'Enter' })
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`2 / ${VILLAGE_OPENING_BEATS.length}`)
    fireEvent.keyDown(window, { key: ' ', repeat: true })
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`2 / ${VILLAGE_OPENING_BEATS.length}`)
    fireEvent.keyDown(window, { key: ' ' })
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`3 / ${VILLAGE_OPENING_BEATS.length}`)
    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByLabelText('剧情进度')).toHaveTextContent(`4 / ${VILLAGE_OPENING_BEATS.length}`)
  })

  it('自然播放到最后只完成一次，并在立绘失败时提供文字回退', async () => {
    const user = userEvent.setup()
    renderIntro()
    fireEvent.error(screen.getByRole('img', { name: '村长洛岚立绘' }))
    expect(screen.getByRole('img', { name: '村长洛岚立绘加载失败' })).toHaveTextContent('洛岚')

    for (let index = 0; index < VILLAGE_OPENING_BEATS.length; index += 1) {
      await user.click(screen.getByTestId('village-opening-intro'))
    }
    expect(screen.getByLabelText('开场完成状态')).toHaveTextContent('true')
  })

  it('优先使用洛岚角色卡立绘，并按自定义、内置、文字顺序回退', () => {
    tavernState.characters = [{
      npcId: 'loran',
      portraitSlots: [{ id: 'custom-loran', minAffinity: 0, maxAffinity: 100, source: 'data:image/png;base64,bG9yYW4=' }],
    }]
    renderIntro()

    const customPortrait = screen.getByRole('img', { name: '村长洛岚立绘' })
    expect(customPortrait).toHaveAttribute('src', 'data:image/png;base64,bG9yYW4=')
    fireEvent.error(customPortrait)

    const builtInPortrait = screen.getByRole('img', { name: '村长洛岚立绘' })
    expect(builtInPortrait).toHaveAttribute('src', './assets/portraits/generated/loran.png')
    fireEvent.error(builtInPortrait)
    expect(screen.getByRole('img', { name: '村长洛岚立绘加载失败' })).toHaveTextContent('洛岚')
  })
})
