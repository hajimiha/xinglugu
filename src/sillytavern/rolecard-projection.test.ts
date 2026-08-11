import { describe, expect, it } from 'vitest'
import { createMistvaleDefaults } from './defaults'
import { projectCharacterPrompts } from './rolecard-projection'

describe('角色卡提示词投影', () => {
  it('角色文字只由世界书提供，不再从立绘角色卡投影到提示词', () => {
    const character = {
      ...createMistvaleDefaults().characters[0],
      description: '描述 {{char}} {{user}}',
      personality: '性格 {{original}}',
      scenario: '场景 {{getvar::weather}}',
      exampleDialogue: '示例 {{lastUserMessage}}',
    }

    expect(projectCharacterPrompts(character)).toEqual({})
  })

  it('空角色卡字段保持为空字符串', () => {
    const character = {
      ...createMistvaleDefaults().characters[0],
      description: '',
      personality: '',
      scenario: '',
      exampleDialogue: '',
    }

    expect(projectCharacterPrompts(character)).toEqual({})
  })
})
