import { describe, expect, it } from 'vitest'
import { applyRegexScripts, parseRegexScripts } from './regex-engine'

const context = {
  stage: 'prompt' as const,
  target: 'assistant' as const,
  depth: 0,
  macroContext: {
    userName: '旅行者', characterName: '洛岚', original: '', lastUserMessage: '', lastCharacterMessage: '',
  },
  variables: { tone: '温柔' },
}

describe('SillyTavern 正则运行时', () => {
  it('按阶段、目标、深度和顺序执行，并支持捕获组与 trimStrings', () => {
    const scripts = parseRegexScripts([
      { id: 'display-only', scriptName: '仅显示', findRegex: '/<box>(.*?)<\\/box>/gs', replaceString: '$1', placement: [2], markdownOnly: true },
      { id: 'prompt', scriptName: '提示词清理', findRegex: '/<box>(?<body>.*?)<\\/box>/gs', replaceString: '[$0][$1][$<body>][{{match}}]', placement: [2], promptOnly: true, trimStrings: ['[A]'] },
    ], 'preset')

    const prompt = applyRegexScripts('<box>A</box>', scripts, context)
    const display = applyRegexScripts('<box>A</box>', scripts, { ...context, stage: 'display' })

    expect(prompt.text).toBe('[<box>A</box>][<box>A</box>]')
    expect(prompt.matches.map((match) => match.scriptId)).toEqual(['prompt'])
    expect(display.text).toBe('A')
  })

  it('替换文本可读取宏变量，禁用或范围外脚本不运行，非法正则只记错误', () => {
    const scripts = parseRegexScripts([
      { id: 'macro', name: '宏替换', enabled: true, pattern: '/语气/', replacement: '{{getvar::tone}}', stages: ['output'], targets: ['assistant'], minDepth: 1, maxDepth: 3, scope: 'global' },
      { id: 'disabled', name: '停用', enabled: false, pattern: '/正文/', replacement: '错误', stages: ['output'], targets: ['assistant'], scope: 'global' },
      { id: 'invalid', name: '损坏', enabled: true, pattern: '/[/', replacement: '', stages: ['output'], targets: ['assistant'], scope: 'global' },
    ])

    const result = applyRegexScripts('语气正文', scripts, { ...context, stage: 'output', depth: 2 })

    expect(result.text).toBe('温柔正文')
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatchObject({ scriptId: 'invalid' })
  })

  it('保留 SillyTavern 脚本字段并准确映射 placement、promptOnly 与 markdownOnly', () => {
    const [script] = parseRegexScripts([{
      id: 'st-script', scriptName: 'ST 脚本', findRegex: '/foo/gi', replaceString: 'bar', trimStrings: ['x'], placement: [1, 2], disabled: false, promptOnly: false, markdownOnly: false, minDepth: 0, maxDepth: 5,
    }], 'preset')

    expect(script).toMatchObject({
      id: 'st-script', name: 'ST 脚本', pattern: '/foo/gi', replacement: 'bar',
      stages: ['prompt', 'output', 'display'], targets: ['user', 'assistant'], scope: 'preset', minDepth: 0, maxDepth: 5,
    })
  })
})
