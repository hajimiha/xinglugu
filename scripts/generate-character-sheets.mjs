import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CHARACTER_PROFILES } from '../src/sillytavern/character-profiles.ts'

const FIELDS = [
  ['name', '姓名'],
  ['age', '年龄'],
  ['gender', '性别'],
  ['identity', '身份'],
  ['relation', '与{{user}}的一句话关系'],
  ['appearance', '偏离默认的外貌特征'],
  ['style', '穿衣/标志风格'],
  ['signature', '标志性细节'],
  ['background', '真正影响角色的背景'],
  ['interaction', '互动方式'],
]

const lines = [
  '# 角色人物表格',
  '',
  '> 数据源：`src/sillytavern/character-profiles.ts`，由 `scripts/generate-character-sheets.mjs` 生成，请勿手改本文档。',
  '>',
  '> 外观依据：`public/assets/portraits/generated/*.png` 的 21 张立绘，经视觉识别逐张读取后整理。',
  '>',
  '> 世界规则：村庄除玩家（{{user}}）外没有外来者，因此不预设“第一次见面”情节。',
  '>',
  '> 背景要求：阳光向上，不使用创伤、离散、战争等沉重套路；每位角色的年龄、外貌、风格、标志物、背景与互动方式均全局唯一。',
  '',
]

for (const profile of CHARACTER_PROFILES) {
  lines.push(`## ${profile.name}`, '', '| 字段 | 填写内容 |', '| --- | --- |')
  for (const [key, label] of FIELDS) {
    lines.push(`| ${label} | ${profile[key]} |`)
  }
  lines.push('')
}

const target = new URL('../docs/character-sheets.md', import.meta.url)
writeFileSync(fileURLToPath(target), `${lines.join('\n')}\n`)
console.log(`written: ${target.pathname} (${CHARACTER_PROFILES.length} characters)`)
