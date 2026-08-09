import '../../test/setup'
import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GameProvider } from '../../game/GameContext'
import { initialGameState } from '../../game/reducer'
import { createTavernDatabase, type MistvaleTavernDatabase } from '../../sillytavern/database'
import { createTavernRepository } from '../../sillytavern/repository'
import { TavernProvider } from '../../tavern/TavernContext'
import { LocationStage } from './LocationStage'

let database: MistvaleTavernDatabase | undefined

afterEach(async () => {
  if (!database) return
  database.close()
  await database.delete()
  database = undefined
})

function renderStage(initialState: typeof initialGameState) {
  database = createTavernDatabase(`mistvale-location-${crypto.randomUUID()}`)
  return render(
    <GameProvider initialState={initialState}>
      <TavernProvider repository={createTavernRepository(database)}><LocationStage /></TavernProvider>
    </GameProvider>,
  )
}

describe('地点人物动态行程', () => {
  it('角色离开工作地点后不再显示静态常驻立绘', () => {
    renderStage({ ...initialGameState, location: 'general-store', minutes: 19 * 60 })

    expect(screen.queryByRole('button', { name: '与杂货店主柳安互动' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '与账房桃弥互动' })).not.toBeInTheDocument()
  })

  it('角色按休闲行程出现在原本没有常驻NPC的图书馆', () => {
    renderStage({ ...initialGameState, location: 'library', minutes: 19 * 60 })

    expect(screen.getByRole('button', { name: '与杂货店主柳安互动' })).toBeVisible()
    expect(screen.getByRole('button', { name: '与账房桃弥互动' })).toBeVisible()
  })
})
