import '../../test/setup'
import 'fake-indexeddb/auto'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

describe('地点立绘区间', () => {
  it('按当前好感选择角色卡槽位，并把场景上传持久保存到同一槽位', async () => {
    const user = userEvent.setup()
    database = createTavernDatabase(`mistvale-location-portrait-${crypto.randomUUID()}`)
    const repository = createTavernRepository(database)
    await repository.initialize()
    const card = await repository.getCharacter('mistvale-character-loran')
    expect(card).toBeDefined()
    await repository.saveCharacter({
      ...card!,
      portraitSlots: [
        { id: 'portrait-0-69', minAffinity: 0, maxAffinity: 69, source: '/portraits/loran-early.webp' },
        { id: 'portrait-70-100', minAffinity: 70, maxAffinity: 100, source: '/portraits/loran-late.webp' },
      ],
    })

    render(
      <GameProvider initialState={{
        ...initialGameState,
        location: 'mayor-home',
        relationships: {
          ...initialGameState.relationships,
          loran: { ...initialGameState.relationships.loran, affinity: 75 },
        },
      }}>
        <TavernProvider repository={repository}><LocationStage /></TavernProvider>
      </GameProvider>,
    )

    const portrait = await screen.findByAltText('洛岚·好感70—100立绘')
    expect(portrait).toHaveAttribute('src', '/portraits/loran-late.webp')

    const upload = document.getElementById('npc-upload-loran-70-100') as HTMLInputElement
    await user.upload(upload, new File(['portrait-data'], 'loran.png', { type: 'image/png' }))

    await waitFor(async () => {
      const saved = await repository.getCharacter('mistvale-character-loran')
      expect(saved?.portraitSlots[1].source).toMatch(/^data:image\/png;base64,/) 
    })
    expect(screen.getByAltText('洛岚·好感70—100立绘')).toHaveAttribute('src', expect.stringMatching(/^data:image\/png;base64,/))
  })
})
