import '../../test/setup'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GameProvider, useGame } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { VillageMap } from './VillageMap'

function LocationObserver() {
  const { state } = useGame()
  return <output aria-label="当前地点标识">{state.location}</output>
}

class TestPointerEvent extends MouseEvent {
  pointerId: number
  constructor(type: string, init: MouseEventInit & { pointerId: number }) {
    super(type, init)
    this.pointerId = init.pointerId
  }
}

function pointerEvent(type: string, init: MouseEventInit & { pointerId: number }) {
  return new TestPointerEvent(type, { bubbles: true, ...init })
}

describe('连续像素村庄地图', () => {
  afterEach(() => vi.useRealTimers())

  it('为包含农场在内的十一个地点提供可聚焦的语义热区', () => {
    render(<GameProvider><VillageMap /><LocationObserver /></GameProvider>)

    expect(screen.getAllByRole('button', { name: /^前往/ })).toHaveLength(11)
    expect(screen.getByRole('button', { name: '前往苔灯农场' })).toHaveAttribute('id', 'map-location-farm')
    expect(screen.getByRole('button', { name: '前往矿洞' })).toHaveAttribute('id', 'map-location-mine')
  })

  it('离开农场后可从地图热区和手机地点列表返回农场', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, location: 'mayor-home' }}><VillageMap /><LocationObserver /></GameProvider>)

    expect(screen.getByRole('button', { name: '从地点列表选择苔灯农场' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '前往苔灯农场' }))
    const dialog = screen.getByRole('dialog', { name: '前往苔灯农场' })
    expect(dialog).toBeVisible()
    await user.click(within(dialog).getByRole('button', { name: '确认前往苔灯农场' }))
    expect(screen.getByLabelText('当前地点标识')).toHaveTextContent('farm')
  })

  it('选择当前地点时不重复执行行程', async () => {
    const user = userEvent.setup()
    render(<GameProvider><VillageMap /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '前往苔灯农场' }))
    expect(screen.getByRole('button', { name: '已在苔灯农场' })).toBeDisabled()
  })

  it('确认行程后更新玩家位置', async () => {
    const user = userEvent.setup()
    render(<GameProvider><VillageMap /><LocationObserver /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '前往矿洞' }))
    const dialog = screen.getByRole('dialog', { name: '前往矿洞' })
    expect(dialog).toBeVisible()
    expect(within(dialog).getByText('40 分钟')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '确认前往矿洞' }))
    expect(screen.getByLabelText('当前地点标识')).toHaveTextContent('mine')
  })

  it('按预计抵达时刻显示目的地的动态在场人物', async () => {
    const user = userEvent.setup()
    render(<GameProvider initialState={{ ...initialGameState, year: 1, day: 1, minutes: 18 * 60 }}><VillageMap /></GameProvider>)

    await user.click(screen.getByRole('button', { name: '前往图书馆' }))
    const dialog = screen.getByRole('dialog', { name: '前往图书馆' })
    expect(within(dialog).getByText('预计在场')).toBeVisible()
    expect(within(dialog).getByText('柳安、桃弥、维娜')).toBeVisible()
    expect(within(dialog).queryByText('无人常驻')).not.toBeInTheDocument()
  })

  it('保留定位与重置控件，并通过键盘提供平移路径', async () => {
    const user = userEvent.setup()
    render(<GameProvider><VillageMap /></GameProvider>)

    const viewport = screen.getByRole('application', { name: '可拖动的性撸谷地图' })
    expect(screen.getByRole('button', { name: '定位当前地点' })).toHaveAttribute('id', 'map-center-current')
    expect(screen.getByRole('button', { name: '重置地图视野' })).toHaveAttribute('id', 'map-reset-view')
    expect(screen.queryByRole('button', { name: '向左移动地图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向右移动地图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向上移动地图' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '向下移动地图' })).not.toBeInTheDocument()

    await user.click(viewport)
    const before = Number(viewport.getAttribute('data-offset-x'))
    await user.keyboard('{ArrowLeft}')
    expect(Number(viewport.getAttribute('data-offset-x'))).toBeLessThan(before)
  })

  it('在空白处拖动且没有尾随 click 时仍允许下一次主动选择地点', async () => {
    vi.useFakeTimers()
    render(<GameProvider><VillageMap /></GameProvider>)

    const viewport = screen.getByRole('application', { name: '可拖动的性撸谷地图' })
    fireEvent.pointerDown(viewport, { pointerId: 7, button: 0, clientX: 320, clientY: 180 })
    fireEvent.pointerMove(viewport, { pointerId: 7, clientX: 260, clientY: 130 })
    fireEvent.pointerUp(viewport, { pointerId: 7, clientX: 260, clientY: 130 })
    await vi.runAllTimersAsync()

    fireEvent.click(screen.getByRole('button', { name: '前往渔家' }))
    expect(screen.getByRole('dialog', { name: '前往渔家' })).toBeVisible()
  })

  it('只有移动跨过阈值后才捕获指针并进入拖动态', () => {
    render(<GameProvider><VillageMap /></GameProvider>)
    const viewport = screen.getByRole('application', { name: '可拖动的性撸谷地图' })
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.defineProperties(viewport, {
      setPointerCapture: { configurable: true, value: setPointerCapture },
      hasPointerCapture: { configurable: true, value: vi.fn(() => true) },
      releasePointerCapture: { configurable: true, value: releasePointerCapture },
    })

    fireEvent(viewport, pointerEvent('pointerdown', { pointerId: 11, button: 0, clientX: 100, clientY: 100 }))
    expect(setPointerCapture).not.toHaveBeenCalled()
    expect(viewport).not.toHaveClass('is-dragging')

    fireEvent(viewport, pointerEvent('pointermove', { pointerId: 11, clientX: 103, clientY: 103 }))
    expect(setPointerCapture).not.toHaveBeenCalled()
    fireEvent(viewport, pointerEvent('pointermove', { pointerId: 11, clientX: 112, clientY: 108 }))
    expect(setPointerCapture).toHaveBeenCalledWith(11)
    expect(viewport).toHaveClass('is-dragging')

    fireEvent(viewport, pointerEvent('pointerup', { pointerId: 11, clientX: 112, clientY: 108 }))
    expect(releasePointerCapture).toHaveBeenCalledWith(11)
    expect(viewport).not.toHaveClass('is-dragging')
  })
})
