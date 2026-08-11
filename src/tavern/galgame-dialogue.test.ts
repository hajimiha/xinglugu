import { describe, expect, it } from 'vitest'
import { parseGalgameSegments } from './galgame-dialogue'

describe('Galgame 对话分镜解析', () => {
  it('严格解析模型返回的 NPC、玩家与旁白分镜', () => {
    const segments = parseGalgameSegments([
      '<scene speaker="narrator">壁炉里的木柴轻轻爆响。</scene>',
      '<scene speaker="npc" name="洛岚">云岚，先坐到火边来吧。</scene>',
      '<scene speaker="player" name="云岚">我正想问问今日的委托。</scene>',
    ].join('\n'), { npcName: '洛岚', playerName: '云岚' })

    expect(segments).toEqual([
      { speaker: 'narrator', name: '旁白', text: '壁炉里的木柴轻轻爆响。' },
      { speaker: 'npc', name: '洛岚', text: '云岚，先坐到火边来吧。' },
      { speaker: 'player', name: '云岚', text: '我正想问问今日的委托。' },
    ])
  })

  it('兼容常见中文署名格式，无法判定时安全回退为 NPC 台词', () => {
    expect(parseGalgameSegments('旁白：夜雾漫过窗台。\n洛岚：欢迎回来。\n云岚：我回来了。', {
      npcName: '洛岚', playerName: '云岚',
    })).toEqual([
      { speaker: 'narrator', name: '旁白', text: '夜雾漫过窗台。' },
      { speaker: 'npc', name: '洛岚', text: '欢迎回来。' },
      { speaker: 'player', name: '云岚', text: '我回来了。' },
    ])
    expect(parseGalgameSegments('欢迎来到性撸谷。', { npcName: '洛岚', playerName: '云岚' })).toEqual([
      { speaker: 'npc', name: '洛岚', text: '欢迎来到性撸谷。' },
    ])
  })

  it('以 speaker 为准规范化署名，避免模型把玩家帧标成 NPC 名字', () => {
    expect(parseGalgameSegments('<scene speaker="player" name="洛岚">我把礼物递给她。</scene>', {
      npcName: '洛岚', playerName: '云岚',
    })).toEqual([
      { speaker: 'player', name: '云岚', text: '我把礼物递给她。' },
    ])
  })
})
