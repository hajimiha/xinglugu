import type { CharacterCard, CharacterPromptIdentifier } from './types'

export function projectCharacterPrompts(_character: CharacterCard): Partial<Record<CharacterPromptIdentifier, string>> {
  // Character text is authored in lorebooks. Cards remain identity/portrait
  // records so the same prose cannot be injected twice through two editors.
  return {}
}
