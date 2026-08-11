export type GalgameSpeaker = 'npc' | 'player' | 'narrator'

export interface GalgameSegment {
  speaker: GalgameSpeaker
  name: string
  text: string
}

interface GalgameParseContext {
  npcName: string
  playerName: string
}

const speakerPattern = /<(?:scene|segment)\b([^>]*)>([\s\S]*?)<\/(?:scene|segment)>/gi
const attributePattern = /([\w-]+)\s*=\s*["']([^"']*)["']/g

function normalizeSpeaker(value: string | undefined): GalgameSpeaker | undefined {
  const key = value?.trim().toLowerCase()
  if (key === 'npc' || key === 'character' || key === 'assistant') return 'npc'
  if (key === 'player' || key === 'user') return 'player'
  if (key === 'narrator' || key === 'narration' || key === '旁白') return 'narrator'
  return undefined
}

function defaultName(speaker: GalgameSpeaker, context: GalgameParseContext): string {
  if (speaker === 'npc') return context.npcName
  if (speaker === 'player') return context.playerName
  return '旁白'
}

function stripMarkup(text: string): string {
  return text.replace(/<[^>]+>/g, '').replace(/\r/g, '').trim()
}

export function parseGalgameSegments(text: string, context: GalgameParseContext): GalgameSegment[] {
  const structured: GalgameSegment[] = []
  let match: RegExpExecArray | null
  speakerPattern.lastIndex = 0
  while ((match = speakerPattern.exec(text)) !== null) {
    const attributes = Object.fromEntries([...match[1].matchAll(attributePattern)].map((item) => [item[1].toLowerCase(), item[2]]))
    const speaker = normalizeSpeaker(attributes.speaker ?? attributes.role)
    const body = stripMarkup(match[2])
    if (!speaker || !body) continue
    structured.push({ speaker, name: defaultName(speaker, context), text: body })
  }
  if (structured.length) return structured

  const labelled = text.replace(/\r/g, '').split(/\n+/).flatMap((line): GalgameSegment[] => {
    const normalized = line.trim()
    if (!normalized) return []
    const label = normalized.match(/^(?:【([^】]+)】|([^：:]{1,24})[：:])\s*([\s\S]+)$/)
    if (!label) return []
    const name = (label[1] ?? label[2]).trim()
    const body = stripMarkup(label[3])
    if (!body) return []
    const speaker: GalgameSpeaker = /^(旁白|叙述|场景)$/.test(name)
      ? 'narrator'
      : name === context.playerName || /^(玩家|你|主角)$/.test(name)
        ? 'player'
        : name === context.npcName
          ? 'npc'
          : 'narrator'
    return [{ speaker, name: defaultName(speaker, context), text: body }]
  })
  if (labelled.length) return labelled

  const fallback = stripMarkup(text)
  return fallback ? [{ speaker: 'npc', name: context.npcName, text: fallback }] : []
}
