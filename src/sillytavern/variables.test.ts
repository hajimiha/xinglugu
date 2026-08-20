import { describe, it, expect } from 'vitest';
import { StreamTagParser } from './stream-parser';
import { aggregateEvents, applyParsedToChat, branchChat, truncateChatAt, variablesAfterMessage } from './variables';
import type { ChatSession } from './types';

const TAGS = ['maintext', 'option', 'sum', 'vars', 'thinking', 'think'];
const OPAQUE = ['thinking', 'think'];

describe('variables aggregator', () => {
  it('restores the post-message snapshot before the input variable fallback', () => {
    expect(variablesAfterMessage({ variablesAfter: { hp: 8 }, variables: { hp: 10 } } as any)).toEqual({ hp: 8 });
    expect(variablesAfterMessage({ variables: { hp: 10 } } as any)).toEqual({ hp: 10 });
    expect(variablesAfterMessage(undefined)).toEqual({});
  });

  it('restores variables from assistant snapshots when branching and truncating', () => {
    const source: ChatSession = {
      id: 'source', name: '源会话', messages: [
        { id: 'user', role: 'user', content: '开始', timestamp: 1, variables: { hp: 10 } },
        { id: 'assistant', role: 'assistant', content: '回应', timestamp: 2, variablesAfter: { hp: 8 } },
      ],
      npcId: 'loran', participantNpcIds: ['loran', 'freya'],
      characterName: '角色', userName: '玩家', presetId: null, lorebookIds: [], variables: { hp: 8 }, createdAt: 1, updatedAt: 2,
    };

    const branch = branchChat(source, 1, { name: '分支', presetId: null, lorebookIds: [] });
    expect(branch.variables).toEqual({ hp: 8 });
    expect(branch.participantNpcIds).toEqual(['loran', 'freya']);
    expect(branch.participantNpcIds).not.toBe(source.participantNpcIds);
    expect(truncateChatAt(source, 2).variables).toEqual({ hp: 8 });
  });

  it('honors explicit variable overrides and handles invalid indexes without throwing', () => {
    const source = {
      id: 'source', name: '源会话', messages: [{ id: 'assistant', role: 'assistant' as const, content: '回应', timestamp: 1, variablesAfter: { hp: 8 } }],
      characterName: '角色', userName: '玩家', presetId: null, lorebookIds: [], variables: { hp: 8 }, createdAt: 1, updatedAt: 1,
    } as ChatSession;

    expect(branchChat(source, 0, { name: '分支', presetId: null, lorebookIds: [], variables: { hp: 1 } }).variables).toEqual({ hp: 1 });
    expect(() => branchChat(source, 9, { name: '越界', presetId: null, lorebookIds: [] })).not.toThrow();
    expect(() => truncateChatAt(source, -1)).not.toThrow();
    expect(truncateChatAt(source, -1).variables).toEqual({});
  });

  it('aggregates tag-close events into ParsedTags', () => {
    const p = new StreamTagParser(TAGS, OPAQUE);
    const events = [
      ...p.feed('<thinking>plan</thinking>'),
      ...p.feed('<maintext>hi\nthere</maintext>'),
      ...p.feed('<option>A\nB</option>'),
      ...p.feed('<sum>summary</sum>'),
      ...p.feed('<vars>{"hp":10}</vars>'),
      ...p.finish(),
    ];
    const parsed = aggregateEvents(events);
    expect(parsed.thinking).toBe('plan');
    expect(parsed.maintext).toBe('hi\nthere');
    expect(parsed.options).toEqual(['A', 'B']);
    expect(parsed.sum).toBe('summary');
    expect(parsed.varsRaw).toBe('{"hp":10}');
    expect(parsed.varsCommands.merge).toEqual({ hp: 10 });
  });

  it('applyParsedToChat returns next chat.variables and message.variablesAfter clones', () => {
    const parsed = aggregateEvents([
      { type: 'tag-close', tag: 'vars', full: '{"hp":80}' },
    ] as any);
    const { nextVariables, snapshot } = applyParsedToChat({ hp: 100, gold: 5 }, parsed);
    expect(nextVariables).toEqual({ hp: 80, gold: 5 });
    expect(snapshot).toEqual({ hp: 80, gold: 5 });
    expect(snapshot).not.toBe(nextVariables);
  });
});
