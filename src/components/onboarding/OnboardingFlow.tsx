import type { PropsWithChildren } from 'react'
import { useGame } from '../../game/GameContext'
import { PlayerNameGate } from './PlayerNameGate'
import { VillageOpeningIntro } from './VillageOpeningIntro'

export function OnboardingFlow({ children }: PropsWithChildren) {
  const { state } = useGame()
  const { hasConfirmedName, hasCompletedVillageIntro } = state.playerProfile

  if (!hasConfirmedName) return <>{children}<PlayerNameGate /></>
  if (!hasCompletedVillageIntro) return <VillageOpeningIntro />
  return <>{children}</>
}
