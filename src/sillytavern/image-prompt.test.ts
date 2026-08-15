import { describe, expect, it } from 'vitest'
import {
  applyPromptReplacementRules,
  assembleImagePrompt,
  extractTaggedImagePrompt,
  parseStructuredImagePrompt,
} from './image-generation/prompt'

describe('酒馆绘图提示词流水线', () => {
  it('读取新的 images 结构并回退兼容 image### 标记，始终选择最后一幅', () => {
    expect(extractTaggedImagePrompt(`
      <images>
        <image>image###first scene###</image>
        <image><prompts>second scene</prompts></image>
      </images>
    `)).toBe('second scene')
    expect(extractTaggedImagePrompt('旁白 image###first### 中间 image###last###')).toBe('last')
    expect(extractTaggedImagePrompt('<thinking>image###ignore###</thinking>')).toBe('')
  })

  it('按声明顺序执行删除、替换、前置与后置规则', () => {
    const result = applyPromptReplacementRules('hero, horse, watermark', [
      { id: '1', enabled: true, kind: 'delete', search: 'watermark', replacement: '' },
      { id: '2', enabled: true, kind: 'replace', search: 'horse', replacement: 'white horse' },
      { id: '3', enabled: true, kind: 'prepend', search: 'hero', replacement: 'masterpiece' },
      { id: '4', enabled: true, kind: 'append', search: 'white horse', replacement: 'sunset' },
    ])

    expect(result).toBe('masterpiece, hero, white horse, sunset')
  })

  it('把固定提示词和负面提示词无重复地装配到最终请求', () => {
    expect(assembleImagePrompt({
      generatedPositive: '1girl, detailed eyes, 1girl',
      generatedNegative: 'blur',
      preset: {
        id: 'p', name: '像素', prefix: 'pixel art, detailed eyes', suffix: 'warm light', negative: 'blur, text',
      },
      replacements: [],
    })).toEqual({
      positive: 'pixel art, detailed eyes, 1girl, warm light',
      negative: 'blur, text',
    })
  })

  it('解析结构化 LLM 输出，并在格式不完整时保留可编辑原文', () => {
    expect(parseStructuredImagePrompt(`
      <image_prompt>
        <title>雨夜药房</title>
        <positive>pixel art, herbalist</positive>
        <negative>text, watermark</negative>
      </image_prompt>
    `)).toEqual({ title: '雨夜药房', positive: 'pixel art, herbalist', negative: 'text, watermark', valid: true })

    expect(parseStructuredImagePrompt('pixel art, herbalist')).toEqual({
      title: '未命名画面', positive: 'pixel art, herbalist', negative: '', valid: false,
    })
  })
})

