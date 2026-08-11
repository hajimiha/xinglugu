import type { ParsedSseEvent } from './types'

export type { ParsedSseEvent } from './types'

/** Parse complete SSE frames after transport chunks have been reassembled. */
export function parseSseEvents(chunks: Iterable<string>): ParsedSseEvent[] {
  const source = Array.from(chunks).join('')
  const lines = source.split(/\r\n|\r|\n/)
  const events: ParsedSseEvent[] = []
  let eventName: string | undefined
  let dataLines: string[] = []

  const flush = () => {
    if (eventName === undefined && dataLines.length === 0) return
    events.push({
      ...(eventName === undefined ? {} : { event: eventName }),
      data: dataLines.join('\n'),
    })
    eventName = undefined
    dataLines = []
  }

  for (const line of lines) {
    if (line === '') {
      flush()
      continue
    }
    if (line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
    if (field === 'event') eventName = value
    if (field === 'data') dataLines.push(value)
  }
  flush()
  return events
}
