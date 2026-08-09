import '../../../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { createDefaultPortraitSlots } from '../../../sillytavern/portrait-slots'
import type { PortraitSlot } from '../../../sillytavern/types'
import { PortraitSlotEditor } from './PortraitSlotEditor'

function Harness() {
  const [slots, setSlots] = useState<PortraitSlot[]>(createDefaultPortraitSlots())
  return <PortraitSlotEditor characterId="mistvale-character-loran" characterName="洛岚" slots={slots} onChange={setSlots} />
}

describe('好感区间立绘编辑器', () => {
  it('默认只显示 0—100 单槽位，新增 70—100 后自动把原槽位收缩为 0—69', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(screen.getByRole('group', { name: '好感区间立绘' })).toBeVisible()
    expect(screen.getByText('好感 0—100')).toBeVisible()

    await user.click(screen.getByRole('button', { name: '新增立绘区间' }))
    await user.clear(screen.getByLabelText('区间起始好感'))
    await user.type(screen.getByLabelText('区间起始好感'), '70')
    await user.clear(screen.getByLabelText('区间结束好感'))
    await user.type(screen.getByLabelText('区间结束好感'), '100')
    await user.click(screen.getByRole('button', { name: '确认新增区间' }))

    expect(screen.getByText('好感 0—69')).toBeVisible()
    expect(screen.getByText('好感 70—100')).toBeVisible()
    expect(screen.queryByText('好感 0—100')).not.toBeInTheDocument()
  })

  it('保留无单图容量上限的上传，并可删除额外区间回到完整覆盖', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '新增立绘区间' }))
    await user.clear(screen.getByLabelText('区间起始好感'))
    await user.type(screen.getByLabelText('区间起始好感'), '70')
    await user.click(screen.getByRole('button', { name: '确认新增区间' }))

    const file = new File([new Uint8Array(600 * 1024)], 'loran-late.webp', { type: 'image/webp' })
    await user.upload(screen.getByLabelText('为洛岚的好感 70—100 选择立绘'), file)
    expect(await screen.findByAltText('洛岚·好感70—100立绘预览')).toHaveAttribute('src', expect.stringMatching(/^data:image\/webp;base64,/))

    await user.click(screen.getByRole('button', { name: '删除好感 70—100 立绘槽位' }))
    expect(screen.getByText('好感 0—100')).toBeVisible()
    expect(screen.queryByText('好感 70—100')).not.toBeInTheDocument()
  })

  it('在区间无效时显示内联错误，不调用浏览器原生弹窗', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '新增立绘区间' }))
    await user.clear(screen.getByLabelText('区间起始好感'))
    await user.type(screen.getByLabelText('区间起始好感'), '90')
    await user.clear(screen.getByLabelText('区间结束好感'))
    await user.type(screen.getByLabelText('区间结束好感'), '70')
    await user.click(screen.getByRole('button', { name: '确认新增区间' }))

    expect(screen.getByRole('alert')).toHaveTextContent('起始好感不能大于结束好感')
  })
})
