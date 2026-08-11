import { describe, it, expect } from 'vitest';
import { exportLorebook, exportPreset, importLorebook, importMultipleLorebooks, importPreset, renameLorebook } from './importer';
import { getPresetPromptDefinitions, getPresetPromptOrder, updatePresetPromptOrder } from './preset-compat';
import type { SillyTavernLorebookExport } from './types';

const stub = (name: string): SillyTavernLorebookExport => ({
  name,
  description: '',
  entries: {},
});

describe('importer multi/rename', () => {
  it('returns success and failure lists', () => {
    const results = importMultipleLorebooks([
      { fileName: 'a.json', json: stub('a') },
      { fileName: 'b.json', json: 'broken' as any },
    ]);
    expect(results.successes).toHaveLength(1);
    expect(results.failures).toHaveLength(1);
    expect(results.successes[0].lorebook.name).toBe('a');
    expect(results.failures[0].fileName).toBe('b.json');
  });

  it('renameLorebook replaces only the name', () => {
    const lb = { id: '1', name: 'old', entries: [], createdAt: 0, updatedAt: 0,
                 recursiveScanning: true, caseSensitive: false, matchWholeWords: false };
    const next = renameLorebook(lb, 'new');
    expect(next.name).toBe('new');
    expect(next.id).toBe('1');
    expect(next.updatedAt).toBeGreaterThanOrEqual(lb.updatedAt);
  });

  it('rejects malformed lorebooks and presets before persistence', () => {
    expect(() => importLorebook({ name: {}, entries: {} })).toThrow();
    expect(() => importLorebook({ name: 'bad', entries: { 0: { key: 'not-an-array', content: 'text' } } })).toThrow();
    expect(() => importPreset({ name: {}, prompt_order: 'not-an-array' })).toThrow();
    expect(() => importPreset({ name: 'bad', prompt_order: [{ identifier: {} }] })).toThrow();
  });

  it('preserves disabled and excluded SillyTavern entries during round trips', () => {
    const imported = importLorebook({
      name: 'archive',
      entries: {
        0: { key: ['mist'], keysecondary: [], content: 'hidden lore', disable: true, excluded: false },
      },
    });
    const exported = exportLorebook({ ...imported, id: 'book', createdAt: 1, updatedAt: 1 });

    expect(imported.entries[0]).toMatchObject({ disabled: true, excluded: false });
    expect(exported.entries['0']).toMatchObject({ disable: true, excluded: false, content: 'hidden lore' });
  });

  it('无损保留世界书原始 UID、条目键、未知字段与整册设置', () => {
    const imported = importLorebook({
      name: '兼容档案',
      custom_root: { author: 'player' },
      entries: {
        '42': {
          uid: 77, key: ['雾'], keysecondary: [], content: '原始正文', disable: false,
          vectorized: true, automation_id: 'custom-automation',
        },
      },
      settings: { recursive_scanning: true, scan_depth: 12, custom_setting: 'keep' },
    })
    imported.entries[0].content = '编辑后的正文'

    const exported = exportLorebook({ ...imported, id: 'book', createdAt: 1, updatedAt: 2 }) as Record<string, any>

    expect(exported.custom_root).toEqual({ author: 'player' })
    expect(exported.settings).toMatchObject({ recursive_scanning: true, scan_depth: 12, custom_setting: 'keep' })
    expect(exported.entries['42']).toMatchObject({
      uid: 77,
      content: '编辑后的正文',
      vectorized: true,
      automation_id: 'custom-automation',
    })
  })

  it('imports official grouped SillyTavern prompt order and prefers character slot 100001', () => {
    const source = {
      temperature: 1,
      prompts: [
        { identifier: 'main', name: '主提示词', role: 'system', content: '推进 {{char}} 的故事。', system_prompt: true },
        { identifier: 'chatHistory', name: '聊天历史', marker: true, system_prompt: true },
        { identifier: 'geminiReply', name: 'Gemini 角色回复', role: 'model', content: '角色侧提示词' },
      ],
      prompt_order: [
        { character_id: 100000.5, order: [{ identifier: 'main', role: 'model', enabled: false }] },
        { character_id: 100001, order: [
          { identifier: 'main', enabled: true },
          { identifier: 'chatHistory', enabled: true },
        ] },
      ],
      extensions: { regex_scripts: [] },
    };

    const imported = importPreset(source, '夏瑾 天琴座 Beta 1.0');
    const activeOrder = getPresetPromptOrder(imported.settings);
    expect(imported.name).toBe('夏瑾 天琴座 Beta 1.0');
    expect(activeOrder.characterId).toBe(100001);
    expect(activeOrder.items).toHaveLength(2);
    expect(getPresetPromptDefinitions(imported.settings).find((prompt) => prompt.identifier === 'geminiReply')?.role).toBe('assistant');
    expect(imported.settings.extensions).toEqual({ regex_scripts: [] });

    const changedSettings = updatePresetPromptOrder(imported.settings, 100001, [
      { identifier: 'main', enabled: false },
      { identifier: 'chatHistory', enabled: true },
    ]);
    const exported = exportPreset({ ...imported, settings: changedSettings, id: 'preset', createdAt: 1, updatedAt: 1 });
    expect(exported.prompt_order).toEqual([
      { character_id: 100000.5, order: [{ identifier: 'main', role: 'model', enabled: false }] },
      { character_id: 100001, order: [
        { identifier: 'main', enabled: false },
        { identifier: 'chatHistory', enabled: true },
      ] },
    ]);
    expect(exported.extensions).toEqual({ regex_scripts: [] });
  });

  it('rejects malformed members inside grouped SillyTavern prompt order', () => {
    expect(() => importPreset({
      prompts: [{ identifier: 'main', content: 'ok' }],
      prompt_order: [{ character_id: 100001, order: [{ identifier: {}, enabled: true }] }],
    })).toThrow('prompt_order');
  });
});
