import { useCallback, useState, type ReactNode } from 'react'
import { useGame } from '../game/GameContext'
import { TavernHubModal } from '../components/SillyTavern/TavernHubModal'
import { SettingsModal } from '../components/modals/SettingsModal'
import { TitleScreen } from './TitleScreen'
import { SaveCenterModal } from './SaveCenterModal'
import { StartModalFrame } from './StartModalFrame'

export type StartModal = null | 'load' | 'workshop' | 'settings'

interface StartLayerProps {
  renderGame(onReturnToTitle: () => void): ReactNode
}

export function StartLayer({ renderGame }: StartLayerProps) {
  const { saveMeta } = useGame()
  const [inGame, setInGame] = useState(false)
  const [modal, setModal] = useState<StartModal>(null)
  const closeModal = useCallback(() => setModal(null), [])
  const enterGame = useCallback(() => { setModal(null); setInGame(true) }, [])
  const returnToTitle = useCallback(() => { setModal(null); setInGame(false) }, [])

  if (inGame) return <>{renderGame(returnToTitle)}</>

  return (
    <>
      <TitleScreen
        hasLocalSave={Boolean(saveMeta.savedAt)}
        onStart={enterGame}
        onLoad={() => setModal('load')}
        onWorkshop={() => setModal('workshop')}
        onSettings={() => setModal('settings')}
      />

      {modal === 'load' && (
        <StartModalFrame id="start-save-center" title="读取游戏存档" onClose={closeModal}>
          <SaveCenterModal onEnterGame={enterGame} />
        </StartModalFrame>
      )}
      {modal === 'settings' && (
        <StartModalFrame id="start-settings" title="游戏设置" onClose={closeModal}>
          <SettingsModal />
        </StartModalFrame>
      )}
      {modal === 'workshop' && (
        <StartModalFrame id="start-workshop" title="创意工坊" onClose={closeModal} tavern>
          <TavernHubModal onClose={closeModal} initialTab="lorebooks" />
        </StartModalFrame>
      )}
    </>
  )
}
