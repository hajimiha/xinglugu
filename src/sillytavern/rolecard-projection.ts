import type { CharacterCard, CharacterPromptIdentifier } from './types'

export function projectCharacterPrompts(character: CharacterCard): Record<CharacterPromptIdentifier, string> {
  return {
    character_description: character.description,
    character_personality: character.personality,
    scenario: character.scenario,
    dialogue_examples: character.exampleDialogue,
  }
}
