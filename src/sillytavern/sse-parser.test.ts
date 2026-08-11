import { describe, expect, it } from 'vitest'
import { parseSseEvents } from './sse-parser'

describe('SSE framed parser', () => {
  it('keeps event names and joins multiline data at blank-line boundaries', () => {
    expect(parseSseEvents([
      'event: content_block_delta\r\n',
      'data: {"type":"content_block_\n',
      'data: delta","delta":{"text":"片段"}}\r\n\r\n',
      'data: [DONE]\n\n',
    ])).toEqual([
      {
        event: 'content_block_delta',
        data: '{"type":"content_block_\ndelta","delta":{"text":"片段"}}',
      },
      { event: undefined, data: '[DONE]' },
    ])
  })

  it('handles JSON split across transport chunks and ignores empty events', () => {
    expect(parseSseEvents([
      '\n\n',
      'data: {"choices":[{"delta":{"content":"',
      '你好"}}]}\n\n',
    ])).toEqual([
      { event: undefined, data: '{"choices":[{"delta":{"content":"你好"}}]}' },
    ])
  })

  it('retains malformed payloads for the protocol layer and flushes a complete EOF event', () => {
    expect(parseSseEvents(['event: provider-error\ndata: {not-json}\n'])).toEqual([
      { event: 'provider-error', data: '{not-json}' },
    ])
  })
})
