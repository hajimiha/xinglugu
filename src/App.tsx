import { GameProvider } from './game/GameContext'
import { ContextRail } from './components/shell/ContextRail'
import { StoryRail } from './components/shell/StoryRail'
import { TopHud } from './components/shell/TopHud'
import { VillageMap } from './components/shell/VillageMap'
import { ToastRegion } from './components/feedback/ToastRegion'
import { GameStage } from './components/stage/GameStage'
import { ModalHost } from './components/modals/ModalHost'
import { TavernProvider } from './tavern/TavernContext'
import { PlayerNameGate } from './components/onboarding/PlayerNameGate'

function AppContent() {
  return (
    <div className="game-shell">
      <a className="skip-link" href="#main-game-content">跳到游戏场景</a>
      <TopHud />
      <div className="game-layout">
        <StoryRail />
        <main id="main-game-content" className="world-column" tabIndex={-1}>
          <GameStage />
          <VillageMap />
        </main>
        <ContextRail />
      </div>
      <ModalHost />
      <ToastRegion />
      <PlayerNameGate />
    </div>
  )
}

export default function App() {
  return <GameProvider><TavernProvider><AppContent /></TavernProvider></GameProvider>
}
