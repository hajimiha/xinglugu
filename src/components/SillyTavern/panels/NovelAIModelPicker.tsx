import { useState } from 'react'
import { NOVELAI_MODELS } from '../../../sillytavern/image-generation/providers/novelai'

export function NovelAIModelPicker({ value, onChange }: { value: string; onChange(value: string): void }) {
  const [custom, setCustom] = useState(false)
  const known = NOVELAI_MODELS.some((model) => model.id === value)
  return <div className="image-nai-model-picker">
    <label htmlFor="image-nai-model"><span>NovelAI 模型</span><select id="image-nai-model" value={custom || !known ? '__custom__' : value} onChange={(event) => {
      setCustom(event.target.value === '__custom__')
      if (event.target.value !== '__custom__') onChange(event.target.value)
    }}>
      {NOVELAI_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
      <option value="__custom__">自定义模型（手动输入）</option>
    </select></label>
    {(custom || !known) && <label><span>自定义 NovelAI 模型 ID</span><input value={value} onChange={(event) => onChange(event.target.value)} /></label>}
    <p className="image-help">内置模型目录（非账户实时列表），无需手填。填写上方密钥后点击底部“测试连接”验证；实际使用权限与费用以 NovelAI 为准。V4/V4.5/V5 自动使用对应请求结构；SMEA、SMEA DYN 与 Decrisper 仅用于 V3，V5 不启用旧版 Variety。</p>
  </div>
}
