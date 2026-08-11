import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useGame } from '../game/GameContext'
import { TavernHubModal } from '../components/SillyTavern/TavernHubModal'
import { SettingsModal } from '../components/modals/SettingsModal'
import { TitleScreen } from './TitleScreen'
import { SaveCenterModal } from './SaveCenterModal'
import { StartModalFrame } from './StartModalFrame'
import { useCloudSave } from '../cloud/useCloudSave'

export type StartModal = null | 'load' | 'workshop' | 'settings'

interface StartLayerProps {
  renderGame(onReturnToTitle: () => void): ReactNode
}

export function StartLayer({ renderGame }: StartLayerProps) {
  const { saveMeta } = useGame()
  const [inGame, setInGame] = useState(false)
  const [modal, setModal] = useState<StartModal>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('panel') === 'save' ? 'load' : null
  })
  const cloud = useCloudSave()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    if (!url.searchParams.has('panel') && !url.searchParams.has('github')) return
    url.searchParams.delete('panel')
    url.searchParams.delete('github')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [])
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
          <SaveCenterModal cloud={cloud} onEnterGame={enterGame} />
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
