import { describe, expect, it } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import { projectCharacterPrompts } from './rolecard-projection'

describe('角色卡提示词投影', () => {
  it('将角色卡的四个提示词字段映射到规范标识符并保留原始宏', () => {
    const character = {
      ...createMistvaleDefaults().characters[0],
      description: '描述 {{char}} {{user}}',
      personality: '性格 {{original}}',
      scenario: '场景 {{getvar::weather}}',
      exampleDialogue: '示例 {{lastUserMessage}}',
    }

    expect(projectCharacterPrompts(character)).toEqual({
      character_description: '描述 {{char}} {{user}}',
      character_personality: '性格 {{original}}',
      scenario: '场景 {{getvar::weather}}',
      dialogue_examples: '示例 {{lastUserMessage}}',
    })
  })

  it('空角色卡字段保持为空字符串', () => {
    const character = {
      ...createMistvaleDefaults().characters[0],
      description: '',
      personality: '',
      scenario: '',
      exampleDialogue: '',
    }

    expect(projectCharacterPrompts(character)).toEqual({
      character_description: '',
      character_personality: '',
      scenario: '',
      dialogue_examples: '',
    })
  })
})
