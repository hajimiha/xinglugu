/**
 * SillyTavern Import/Export Adapter
 */

import type { Lorebook, LorebookEntry, ChatPreset, SillyTavernLorebookExport } from './types';
import { validatePresetSettings } from './preset-compat';

const POSITION_MAP: Record<number, LorebookEntry['position']> = {
  0: 'before_char',
  1: 'after_char',
  2: 'before_example',
  3: 'after_example',
  4: 'at_depth',
  5: 'example_msg_top',
  6: 'example_msg_bottom',
  7: 'outlet',
};

const REVERSE_POSITION_MAP: Record<LorebookEntry['position'], number> = {
  before_char: 0,
  after_char: 1,
  before_example: 2,
  after_example: 3,
  at_depth: 4,
  example_msg_top: 5,
  example_msg_bottom: 6,
  outlet: 7,
};

const LOGIC_MAP: Record<number, LorebookEntry['selectiveLogic']> = {
  0: 'and_any',
  1: 'not_all',
  2: 'not_any',
  3: 'and_all',
};

const REVERSE_LOGIC_MAP: Record<LorebookEntry['selectiveLogic'], number> = {
  and_any: 0,
  not_all: 1,
  not_any: 2,
  and_all: 3,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function assertOptionalScalar(record: Record<string, unknown>, key: string, type: 'string' | 'number' | 'boolean'): void {
  if (record[key] !== undefined && typeof record[key] !== type) throw new Error(`导入字段 ${key} 类型无效。`);
}

function validateLorebookImport(value: unknown): SillyTavernLorebookExport {
  if (!isRecord(value) || (value.name !== undefined && typeof value.name !== 'string') || !isRecord(value.entries)) {
    throw new Error('世界书必须是包含名称与 entries 对象的 JSON。');
  }
  for (const entry of Object.values(value.entries)) {
    if (!isRecord(entry) || !isStringArray(entry.key) || (entry.keysecondary !== undefined && !isStringArray(entry.keysecondary)) || typeof entry.content !== 'string') {
      throw new Error('世界书条目必须包含字符串关键词数组与正文。');
    }
    for (const key of ['comment', 'group'] as const) assertOptionalScalar(entry, key, 'string');
    for (const key of ['uid', 'selectiveLogic', 'order', 'position', 'role', 'probability', 'depth', 'sticky', 'cooldown', 'delay', 'weight', 'scanDepth'] as const) assertOptionalScalar(entry, key, 'number');
    for (const key of ['constant', 'selective', 'addMemo', 'disable', 'useProbability', 'excluded', 'caseSensitive', 'matchWholeWords', 'excludeRecursion', 'preventRecursion', 'useGroupScoring', 'matchPersonaDescription', 'matchCharacterDescription', 'matchCharacterPersonality', 'matchCharacterDepthPrompt', 'matchScenario', 'matchCreatorNotes'] as const) assertOptionalScalar(entry, key, 'boolean');
    if (entry.decorators !== undefined && !isStringArray(entry.decorators)) throw new Error('世界书 decorators 必须是字符串数组。');
  }
  if (value.settings !== undefined && !isRecord(value.settings)) throw new Error('世界书 settings 必须是对象。');
  return value as unknown as SillyTavernLorebookExport;
}

export function importLorebook(value: unknown): Omit<Lorebook, 'id' | 'createdAt' | 'updatedAt'> {
  const data = validateLorebookImport(value);
  const rawEntries = Object.entries(data.entries || {});
  const entries: LorebookEntry[] = rawEntries
    .map(([entryKey, e]) => ({
      id: crypto.randomUUID(),
      sillyTavernSource: { entryKey, ...(typeof e.uid === 'number' ? { uid: e.uid } : {}) },
      disabled: e.disable ?? false,
      excluded: e.excluded ?? false,
      keys: e.key || [],
      secondaryKeys: e.keysecondary || [],
      content: e.content || '',
      comment: e.comment,
      order: e.order ?? 100,
      position: POSITION_MAP[e.position ?? 1] ?? 'after_char',
      depth: e.depth,
      role: e.role,
      selective: e.selective ?? false,
      selectiveLogic: LOGIC_MAP[e.selectiveLogic ?? 1] ?? 'not_all',
      constant: e.constant ?? false,
      probability: e.useProbability ? (e.probability ?? 100) : 100,
      useProbability: e.useProbability ?? false,
      addMemo: e.addMemo ?? false,
      sticky: e.sticky,
      cooldown: e.cooldown,
      delay: e.delay,
      weight: e.weight,
      scanDepth: e.scanDepth,
      caseSensitive: e.caseSensitive,
      matchWholeWords: e.matchWholeWords,
      excludeRecursion: e.excludeRecursion,
      preventRecursion: e.preventRecursion,
      useGroupScoring: e.useGroupScoring,
      matchPersonaDescription: e.matchPersonaDescription,
      matchCharacterDescription: e.matchCharacterDescription,
      matchCharacterPersonality: e.matchCharacterPersonality,
      matchCharacterDepthPrompt: e.matchCharacterDepthPrompt,
      matchScenario: e.matchScenario,
      matchCreatorNotes: e.matchCreatorNotes,
      group: e.group,
      decorators: e.decorators,
      characterFilter: e.characterFilter,
    }));

  return {
    name: data.name || '导入的世界书',
    description: data.description,
    entries,
    recursiveScanning: data.settings?.recursive_scanning ?? false,
    caseSensitive: data.settings?.case_sensitive ?? false,
    matchWholeWords: data.settings?.match_whole_words ?? false,
    compatibility: { source: 'sillytavern', raw: structuredClone(value as Record<string, unknown>) },
  };
}

export function exportLorebook(lorebook: Lorebook): SillyTavernLorebookExport {
  const rawRoot = lorebook.compatibility?.source === 'sillytavern'
    ? structuredClone(lorebook.compatibility.raw)
    : {};
  const rawEntries = isRecord(rawRoot.entries) ? rawRoot.entries : {};
  const entries: Record<string, Record<string, unknown>> = {};
  const reservedKeys = new Set(lorebook.entries.map((entry) => entry.sillyTavernSource?.entryKey).filter((key): key is string => Boolean(key)));
  const rawUids = Object.values(rawEntries)
    .filter(isRecord)
    .map((entry) => entry.uid)
    .filter((uid): uid is number => typeof uid === 'number' && Number.isFinite(uid));
  let nextUid = Math.max(-1, ...rawUids, ...lorebook.entries.map((entry) => entry.sillyTavernSource?.uid ?? -1)) + 1;
  let nextEntryKey = 0;
  lorebook.entries.forEach((e) => {
    let entryKey = e.sillyTavernSource?.entryKey;
    if (!entryKey || entries[entryKey]) {
      while (reservedKeys.has(String(nextEntryKey)) || entries[String(nextEntryKey)]) nextEntryKey += 1;
      entryKey = String(nextEntryKey++);
    }
    const rawValue = rawEntries[entryKey];
    const rawEntry: Record<string, unknown> = isRecord(rawValue) ? structuredClone(rawValue) : {};
    const uid = e.sillyTavernSource?.uid
      ?? (typeof rawEntry.uid === 'number' && Number.isFinite(rawEntry.uid) ? rawEntry.uid : nextUid++);
    entries[entryKey] = {
      ...rawEntry,
      uid,
      key: e.keys,
      keysecondary: e.secondaryKeys || [],
      comment: e.comment || e.content.slice(0, 50),
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      selectiveLogic: (REVERSE_LOGIC_MAP[e.selectiveLogic] ?? 1) as 0 | 1 | 2 | 3,
      addMemo: e.addMemo,
      order: e.order,
      position: REVERSE_POSITION_MAP[e.position] as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      role: e.role ?? 0,
      disable: e.disabled ?? false,
      probability: e.probability,
      depth: e.depth ?? 4,
      group: e.group ?? '',
      useProbability: e.useProbability ?? (e.probability < 100),
      excluded: e.excluded ?? false,
      sticky: e.sticky ?? 0,
      cooldown: e.cooldown ?? 0,
      delay: e.delay ?? 0,
      weight: e.weight ?? 100,
      scanDepth: e.scanDepth ?? 0,
      caseSensitive: e.caseSensitive ?? false,
      matchWholeWords: e.matchWholeWords ?? false,
      excludeRecursion: e.excludeRecursion ?? false,
      preventRecursion: e.preventRecursion ?? false,
      useGroupScoring: e.useGroupScoring ?? false,
      matchPersonaDescription: e.matchPersonaDescription ?? false,
      matchCharacterDescription: e.matchCharacterDescription ?? false,
      matchCharacterPersonality: e.matchCharacterPersonality ?? false,
      matchCharacterDepthPrompt: e.matchCharacterDepthPrompt ?? false,
      matchScenario: e.matchScenario ?? false,
      matchCreatorNotes: e.matchCreatorNotes ?? false,
      decorators: e.decorators ?? [],
      characterFilter: e.characterFilter ?? { isExclude: false, names: [], tags: [] },
    };
  });

  const rawSettings = isRecord(rawRoot.settings) ? rawRoot.settings : {};
  return {
    ...rawRoot,
    name: lorebook.name,
    description: lorebook.description,
    entries: entries as SillyTavernLorebookExport['entries'],
    settings: {
      ...rawSettings,
      recursive_scanning: lorebook.recursiveScanning,
      case_sensitive: lorebook.caseSensitive,
      match_whole_words: lorebook.matchWholeWords,
    },
  } as SillyTavernLorebookExport;
}

export function getLorebookCompatibilityWarnings(lorebook: Pick<Lorebook, 'entries'>): string[] {
  const warnings = new Set<string>();
  for (const entry of lorebook.entries) {
    if (!['before_char', 'after_char', 'before_example', 'after_example'].includes(entry.position)) warnings.add(`注入位置 ${entry.position}`);
    if ((entry.sticky ?? 0) > 0) warnings.add('粘滞回合');
    if ((entry.cooldown ?? 0) > 0) warnings.add('冷却回合');
    if ((entry.delay ?? 0) > 0) warnings.add('延迟回合');
    if ((entry.weight ?? 100) !== 100) warnings.add('权重排序');
    if (entry.group || entry.useGroupScoring) warnings.add('分组评分');
    if (entry.characterFilter) warnings.add('角色过滤器');
    if (entry.matchPersonaDescription || entry.matchCharacterDescription || entry.matchCharacterPersonality
      || entry.matchCharacterDepthPrompt || entry.matchScenario || entry.matchCreatorNotes) warnings.add('扩展扫描来源');
  }
  return [...warnings];
}

export function importPreset(value: unknown, fallbackName = '导入的预设'): Omit<ChatPreset, 'id' | 'createdAt' | 'updatedAt'> {
  const data = validatePresetSettings(value);
  const name = data.preset || data.name || fallbackName;
  return {
    name: String(name),
    description: typeof data.description === 'string' ? data.description : undefined,
    settings: data,
  };
}

export function exportPreset(preset: ChatPreset): Record<string, any> {
  return {
    ...preset.settings,
    name: preset.name,
    description: preset.description,
  };
}

export async function importJsonFile<T>(): Promise<T | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        resolve(JSON.parse(text) as T);
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export function exportToJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface MultiImportInput {
  fileName: string;
  json: SillyTavernLorebookExport;
}

export interface MultiImportResults {
  successes: Array<{ fileName: string; lorebook: ReturnType<typeof importLorebook> }>;
  failures: Array<{ fileName: string; error: string }>;
}

export function importMultipleLorebooks(inputs: MultiImportInput[]): MultiImportResults {
  const successes: MultiImportResults['successes'] = [];
  const failures: MultiImportResults['failures'] = [];
  for (const input of inputs) {
    try {
      if (!input.json || typeof input.json !== 'object' || Array.isArray(input.json)) {
        throw new Error('Invalid lorebook JSON: expected an object');
      }
      const lb = importLorebook(input.json);
      successes.push({ fileName: input.fileName, lorebook: lb });
    } catch (e) {
      failures.push({ fileName: input.fileName, error: String((e as Error).message ?? e) });
    }
  }
  return { successes, failures };
}

export function renameLorebook(lb: Lorebook, newName: string): Lorebook {
  return { ...lb, name: newName, updatedAt: Date.now() };
}
