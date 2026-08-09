# Strict Tavern Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a verifiable SillyTavern-compatible prompt, regex, variable, reasoning, and request-inspection pipeline whose exact outbound provider body can be proven in tests and inspected in the UI.

**Architecture:** A single `compileTavernTurn` pure pipeline produces final messages plus source trace; the API layer consumes that result without rebuilding prompts. Session preset binding, macro variables, regex scripts, provider reasoning events, and bounded request audits are versioned persistent data.

**Tech Stack:** React 18, TypeScript, Dexie, Vitest, Testing Library, Vite, Phosphor Icons.

## Global Constraints

- All user-facing text is Simplified Chinese; no Emoji structural icons.
- No backend is added; API calls remain browser-side and keys never enter audits or exports.
- Existing SillyTavern preset/lorebook/content-pack data remains importable and exportable.
- New behavior follows strict TDD: each production behavior is preceded by a failing test observed for the expected reason.
- Desktop and 390px mobile must have no page horizontal overflow, duplicate IDs, unreachable controls, or console errors.

---

### Task 1: Preset binding and traced prompt compiler

**Files:**
- Create: `src/sillytavern/prompt-compiler.ts`
- Create: `src/sillytavern/prompt-compiler.test.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/prompt-assembler.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/sillytavern/repository.ts`
- Test: `src/tavern/TavernContext.test.tsx`

**Interfaces:**
- Produces: `compileTavernTurn(input: PromptCompileInput): PromptCompilation`.
- Produces: `resolveSessionPreset(session, settings, presets): ChatPreset`.
- `PromptCompilation` contains `messages`, `segments`, `matchedEntries`, `macroVariables`, and `diagnostics`.

- [ ] **Step 1: Write failing compiler tests**

```ts
expect(compileTavernTurn(fixture).messages.map(m => m.content)).toEqual([
  '前置规则', '旧对话', '历史后规则', '玩家处理后的输入',
])
expect(compileTavernTurn(fixture).segments[0]).toMatchObject({
  source: 'preset', identifier: 'before', sent: true,
})
```

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/sillytavern/prompt-compiler.test.ts --environment jsdom`
Expected: FAIL because `prompt-compiler` and trace types do not exist.

- [ ] **Step 3: Implement compiler and follow-active binding**

```ts
export type PresetBinding =
  | { mode: 'follow-active' }
  | { mode: 'pinned'; presetId: string }

export interface PromptTraceSegment {
  id: string
  source: 'preset' | 'character' | 'lorebook' | 'history' | 'variables' | 'format' | 'user'
  identifier?: string
  role: TavernMessageRole
  raw: string
  compiled: string
  sent: boolean
  diagnostics: string[]
}
```

- [ ] **Step 4: Add migration and context integration tests**

Create a legacy session with a non-null `presetId`, activate a different preset, send a turn through a fake remote adapter, and assert the captured messages contain the new active preset.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/sillytavern/prompt-compiler.test.ts src/tavern/TavernContext.test.tsx --environment jsdom`
Commit: `feat: add traced tavern prompt compiler`

### Task 2: SillyTavern macro and variable scopes

**Files:**
- Create: `src/sillytavern/macro-engine.ts`
- Create: `src/sillytavern/macro-engine.test.ts`
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/database.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/components/SillyTavern/panels/VariablesPanel.tsx`
- Test: `src/components/SillyTavern/TavernHubModal.test.tsx`

**Interfaces:**
- Produces: `evaluateMacros(text, environment, context): MacroEvaluation`.
- `MacroEvaluation` returns `text`, `variables`, `operations`, and `unknownMacros`.

- [ ] **Step 1: Write failing real-format macro tests**

```ts
const first = evaluateMacros('{{setvar::tone::温柔}}{{trim}}', {}, context)
const second = evaluateMacros('风格={{getvar::tone}}；{{user}}；{{lastUserMessage}}', first.variables, context)
expect(second.text).toBe('风格=温柔；旅行者；你好')
```

Cover comments, `${name}`, random with injected deterministic RNG, dice, addvar, case-insensitive history macros, and unknown preservation.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/sillytavern/macro-engine.test.ts --environment jsdom`
Expected: FAIL because the macro evaluator does not exist.

- [ ] **Step 3: Implement sequential macro evaluation and typed variable definitions**

```ts
export interface TavernVariableDefinition {
  key: string
  label: string
  type: 'string' | 'number' | 'boolean'
  value: string | number | boolean
  scope: 'global' | 'session'
  min?: number
  max?: number
  description?: string
}
```

- [ ] **Step 4: Add Variables Center component tests**

Assert type-specific editing, range validation, scope badges, JSON import/export, read-only game mirrors, and 44px controls.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/sillytavern/macro-engine.test.ts src/components/SillyTavern/TavernHubModal.test.tsx --environment jsdom`
Commit: `feat: add tavern macro variables`

### Task 3: SillyTavern regex runtime and Regex Center

**Files:**
- Create: `src/sillytavern/regex-engine.ts`
- Create: `src/sillytavern/regex-engine.test.ts`
- Create: `src/components/SillyTavern/panels/RegexPanel.tsx`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/importer.ts`
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/components/SillyTavern/TavernHubModal.tsx`
- Modify: `src/styles/sillytavern.css`

**Interfaces:**
- Produces: `applyRegexScripts(text, scripts, context): RegexExecutionResult`.
- `RegexExecutionResult` returns transformed `text`, ordered `matches`, and non-fatal `errors`.

- [ ] **Step 1: Write failing regex behavior tests**

```ts
expect(applyRegexScripts('<box>A</box>', scripts, { stage: 'prompt', target: 'ai', depth: 0 }).text)
  .toBe('A')
expect(applyRegexScripts('<box>A</box>', scripts, { stage: 'display', target: 'ai' }).text)
  .toBe('<box>A</box>')
```

Also cover `/pattern/flags`, `$0/$1/$<name>/{{match}}`, trim strings, macros in replacement, placement, depth, disabled and invalid patterns.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/sillytavern/regex-engine.test.ts --environment jsdom`
Expected: FAIL because the regex engine does not exist.

- [ ] **Step 3: Implement runtime and importer validation**

Preset scripts and global scripts are normalized before persistence; invalid imports identify the failing field path and do not write partial data.

- [ ] **Step 4: Implement Regex Center and tester**

Use visible labels, inline regex errors, script ordering, enable toggles, preset/global source filters, JSON import/export, and an input/output dry-run panel.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/sillytavern/regex-engine.test.ts src/sillytavern/importer.test.ts src/components/SillyTavern/TavernHubModal.test.tsx --environment jsdom`
Commit: `feat: add sillytavern regex center`

### Task 4: Provider reasoning stream and dialogue display

**Files:**
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/protocol-adapters.ts`
- Modify: `src/sillytavern/api-adapter.ts`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/styles/sillytavern.css`
- Test: `src/sillytavern/protocol-adapters.test.ts`
- Test: `src/sillytavern/api-adapter.test.ts`
- Test: `src/tavern/remote-story-engine.test.ts`

**Interfaces:**
- Produces stream events `{ type: 'content-delta' | 'reasoning-delta' | 'done'; text?: string }`.
- `RemoteTurnResult` includes `reasoning` separately from `raw` and `parsed.thinking`.

- [ ] **Step 1: Write failing provider extraction tests**

```ts
expect(extractProviderDelta('openai-chat', payload)).toEqual({
  content: '', reasoning: '先检查角色状态',
})
```

Cover OpenAI-compatible, Anthropic thinking block, Gemini thought part, SSE and non-stream JSON.

- [ ] **Step 2: Run tests and verify RED**

Run: `pnpm vitest run src/sillytavern/protocol-adapters.test.ts src/sillytavern/api-adapter.test.ts --environment jsdom`
Expected: FAIL because only content deltas exist.

- [ ] **Step 3: Implement separated reasoning events and persistence**

Never fall back by treating reasoning as NPC dialogue. If content is empty but reasoning exists, show a recoverable “模型只返回推理内容” error and preserve the reasoning in the draft/audit.

- [ ] **Step 4: Implement accessible fold/hide/open display**

Render provider reasoning and authored `<think>` in separate disclosure blocks with exact Chinese labels and no claim about hidden server reasoning.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/sillytavern/protocol-adapters.test.ts src/sillytavern/api-adapter.test.ts src/tavern/remote-story-engine.test.ts --environment jsdom`
Commit: `feat: show provider reasoning separately`

### Task 5: Request audit and expanded Preset Center

**Files:**
- Create: `src/sillytavern/request-audit.ts`
- Create: `src/sillytavern/request-audit.test.ts`
- Create: `src/components/SillyTavern/panels/RequestInspectorPanel.tsx`
- Modify: `src/sillytavern/protocol-adapters.ts`
- Modify: `src/sillytavern/database.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/components/SillyTavern/panels/PresetPanel.tsx`
- Modify: `src/components/SillyTavern/panels/SessionPanel.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.tsx`
- Modify: `src/styles/sillytavern.css`

**Interfaces:**
- Produces: `createRequestAudit(compilation, prepared, providerPreview): TavernRequestAudit`.
- Repository keeps at most 20 audits and exposes `listRequestAudits()` and `saveRequestAudit()`.

- [ ] **Step 1: Write failing outbound body contract test**

Import a compact fixture with grouped order, macros and regex; use a legacy session; capture `fetch` body and assert literal preset strings, processed user input, final order and sampling parameters.

- [ ] **Step 2: Run test and verify RED**

Run: `pnpm vitest run src/tavern/remote-story-engine.test.ts src/sillytavern/request-audit.test.ts --environment jsdom`
Expected: FAIL on stale preset binding and missing audit/provider preview.

- [ ] **Step 3: Implement redacted provider preview and bounded audits**

```ts
export interface TavernRequestAudit {
  id: string
  createdAt: number
  presetId: string
  presetName: string
  provider: TavernApiProvider
  model: string
  url: string
  body: Record<string, unknown>
  segments: PromptTraceSegment[]
  diagnostics: string[]
}
```

- [ ] **Step 4: Expand Preset Center and add Request Inspector**

Preset Center surfaces active/follow/pinned status, generation parameters, all definitions/order items, preset regex and compile preview. Request Inspector shows exact final messages, sources, token estimates, transformations, truncation, and copyable redacted JSON.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm vitest run src/sillytavern/request-audit.test.ts src/components/SillyTavern/TavernHubModal.test.tsx --environment jsdom`
Commit: `feat: add tavern request inspector`

### Task 6: Full compatibility, browser verification, review, and release

**Files:**
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify: `public/content/mistvale-content-pack.json` only if the schema version requires repository defaults.

**Interfaces:**
- Consumes all prior task interfaces; produces a releasable `main` commit.

- [ ] **Step 1: Validate the user preset locally**

Run an import/compile script against `D:\qixin\download\夏瑾 天琴座 Beta 1.0.json` and report prompt count, selected 100001 group, enabled count, macro operations, regex scripts, outbound roles and no secret leakage.

- [ ] **Step 2: Run the complete automated suite**

Run: `pnpm test:run`
Run: `pnpm build`
Run: `git diff --check`
Expected: all tests pass, TypeScript/Vite build succeeds, diff check is empty.

- [ ] **Step 3: Run browser matrix**

Verify 1440×1000, 768×1024 and 390×844: all Tavern tabs reachable, long preset lists scroll, Regex tester works, Variables scopes edit safely, Request Inspector reaches its copy action, reasoning folds are keyboard accessible, no duplicate IDs/horizontal overflow/console errors.

- [ ] **Step 4: Self-review against the specification**

Check each design requirement, mutate the stale-preset and missing-prompt branches mentally, inspect storage validation and ensure API keys never appear in audit/export/UI.

- [ ] **Step 5: Commit and push**

Commit: `feat: rebuild strict tavern core`
Push the verified `main` branch to `origin/main` and record the commit in `progress.md`.

