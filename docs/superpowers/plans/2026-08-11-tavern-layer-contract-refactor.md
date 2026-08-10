# Tavern Layer Contract Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the standalone Tavern layer into deterministic rolecard/lorebook prompt compilation, safe provider transport, and failure-safe session persistence without changing the game or map layers.

**Architecture:** Preserve `TavernContext`, `assemblePrompt`, and the existing UI contracts while separating rolecard projection, lorebook matching, prompt planning, budgeting, provider transport, and repository commits. Execute in independently testable stages: semantics first, persistence second, transport/privacy third, then UI/runtime acceptance.

**Tech Stack:** React 18, TypeScript, Vite, Vitest, Testing Library, Dexie, browser Fetch/IndexedDB, GitHub Actions-compatible pnpm scripts.

## Global Constraints

- Do not modify `VillageMap` or game-domain behavior.
- Do not add an external backend, API key, provider credential, or remote runtime dependency.
- Preserve imported SillyTavern unknown fields and existing content IDs.
- Do not silently overwrite prior card/content artifacts.
- Every task must add or update focused tests before production code.
- Run `pnpm test:run` and `pnpm build` before each stage commit.
- Real provider execution is pending without a safe test credential; never fake it.

---

### Task 1: Rolecard Projection And Prompt Contracts

**Files:**
- Create: `src/sillytavern/rolecard-projection.ts`
- Create: `src/sillytavern/rolecard-projection.test.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/tavern/remote-story-engine.test.ts`

**Interfaces:**
- `projectCharacterPrompts(character: CharacterCard): Record<string, string>` returns `character_description`, `character_personality`, `scenario`, and `dialogue_examples` from the card.
- `compileTavernTurn` accepts an optional `character?: CharacterCard` while preserving its existing return shape.
- `createRemoteTurn` passes the complete `CharacterCard` into compilation and never clears its fields.

- [ ] **Step 1: Add failing projection tests**

Test that all four card fields map to their canonical prompt identifiers, empty fields remain empty, and macros remain available for the compiler rather than being pre-expanded.

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/rolecard-projection.test.ts src/tavern/remote-story-engine.test.ts`

Expected: the new projection test fails and the existing assertion that character segments are absent identifies the old contract.

- [ ] **Step 3: Implement the projection and compiler input**

Create the projection helper. Extend `PromptCompileInput` with `character?: CharacterCard`. Resolve character prompt identifiers from the projection first, then only use legacy preset fields as an explicit compatibility fallback when the card field is empty. Remove `hydratePreset` field clearing.

- [ ] **Step 4: Add prompt precedence and macro tests**

Assert enabled character prompt-order entries are emitted with card content, disabled entries are omitted, card macros resolve during compilation, and current user input still remains last.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/rolecard-projection.test.ts src/sillytavern/prompt-compiler.test.ts src/tavern/remote-story-engine.test.ts`

Expected: all focused tests pass.

Commit: `feat: preserve character card prompts in tavern compilation`

### Task 2: Deterministic Lorebook Match And Emission

**Files:**
- Create: `src/sillytavern/lorebook-engine.test.ts`
- Modify: `src/sillytavern/lorebook-engine.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/sillytavern/prompt-compiler.test.ts`

**Interfaces:**
- `LorebookMatchOptions` accepts `random?: () => number` and an optional recursion context.
- `MatchedEntry` includes namespaced identity and effective depth/position metadata without removing existing fields.
- `LorebookEngine.recursiveScan` honors entry-level matching and recursion controls.

- [ ] **Step 1: Write the lorebook truth-table tests**

Cover `and_any`, `and_all`, `not_any`, and `not_all`; book/entry case sensitivity; whole-word matching; `useProbability`; duplicate IDs across books; recursion exclusion; and bounded cyclic recursion.

- [ ] **Step 2: Run the new lorebook tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/lorebook-engine.test.ts`

Expected: failures demonstrate the current OR-like selective logic, unconditional random suppression, and missing entry overrides.

- [ ] **Step 3: Implement deterministic matching**

Resolve entry options over book defaults, invoke probability only when enabled, inject the RNG, implement the truth table, namespace match identity, and track recursion depth/seed eligibility.

- [ ] **Step 4: Implement prompt-position emission**

Partition matches by effective position. Map supported `before_char`, `after_char`, `before_example`, `after_example`, and depth placements into explicit compiler slots. Emit a diagnostic for unsupported slots instead of duplicating all entries into both world-info markers.

- [ ] **Step 5: Run focused tests and commit**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/lorebook-engine.test.ts src/sillytavern/prompt-compiler.test.ts src/sillytavern/prompt-assembler.test.ts`

Expected: all lorebook and compiler tests pass with no duplicate namespaced entries.

Commit: `fix: make lorebook matching and placement deterministic`

### Task 3: Ordered Prompt Plan And Single Context Budget

**Files:**
- Create: `src/sillytavern/prompt-budget.ts`
- Create: `src/sillytavern/prompt-budget.test.ts`
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/sillytavern/api-adapter.ts`
- Modify: `src/sillytavern/api-adapter.test.ts`

**Interfaces:**
- `PromptBudgetInput` contains ordered messages, trace segments, context length, max response length, and a token estimator.
- `applyPromptBudget(input): { messages, segments, diagnostics }` reserves response tokens and never removes the current user message.
- `createRemoteTavernApi.prepare` rejects already-overflowed requests rather than silently reordering a compiled request.

- [ ] **Step 1: Add budget red tests**

Cover a large system prompt, old history, current user input, response reservation, truncation diagnostics, and a request where the system content alone exceeds the budget.

- [ ] **Step 2: Run budget tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/prompt-budget.test.ts`

Expected: the current compiler/adapter behavior fails because it budgets history separately and then reorders messages again.

- [ ] **Step 3: Implement ordered virtual segments**

Represent runtime variables and response format as traceable virtual prompt items. Compile all ordered segments first, then apply the single budget pass with deterministic retention: required system segments, latest user input, recent conversation, then oldest history.

- [ ] **Step 4: Remove silent adapter reordering**

Change adapter preparation to validate the compiled request budget and return a structured `TAVERN_API_CONTEXT_OVERFLOW` error with diagnostics. Keep only safe per-message validation; do not silently move system messages or reverse content.

- [ ] **Step 5: Run prompt/API tests and commit**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/prompt-compiler.test.ts src/sillytavern/prompt-budget.test.ts src/sillytavern/api-adapter.test.ts`

Expected: all focused tests pass and inspection shows omitted segments explicitly.

Commit: `refactor: budget the final tavern prompt once`

### Task 4: Variable Lifecycle And Session Persistence

**Files:**
- Modify: `src/sillytavern/variables.ts`
- Modify: `src/sillytavern/variables.test.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/sillytavern/database.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/repository.test.ts`
- Modify: `src/tavern/remote-story-engine.test.ts`

**Interfaces:**
- `variablesAfterMessage(message): Record<string, unknown>` uses `variablesAfter`, then `variables`, then `{}`.
- `TavernRepository.commitTurn(session, audit): Promise<void>` writes both records in one Dexie transaction.
- `TavernContext.sendTurn` serializes operations per `sessionId` and preserves original provider errors.

- [ ] **Step 1: Add variable restoration tests**

Test branch/truncate after an assistant message, initial assistant state, explicit overrides, and invalid indexes.

- [ ] **Step 2: Run variable tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/variables.test.ts src/sillytavern/repository.test.ts`

Expected: branch/truncate restore stale or empty state under the current implementation.

- [ ] **Step 3: Implement snapshot helper and lifecycle separation**

Use the helper in branch/truncate. Keep prompt macro variables, response `<vars>` updates, and persisted session state separate. Merge current dialogue variables when opening an existing session without deleting unrelated values.

- [ ] **Step 4: Add concurrency and failure-injection tests**

Use deferred repository writes and a fake adapter to prove two same-session turns serialize, both assistant messages survive, audit failure does not duplicate a committed turn, and an original abort/provider error is not replaced by audit failure.

- [ ] **Step 5: Implement repository commit and migration guards**

Add a transactional commit method, a per-session promise queue, explicit `aborted` audit status, and transactional migration tests that keep the old content version on failure. Reset opening retry state after rejection.

- [ ] **Step 6: Run persistence tests and commit**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/variables.test.ts src/sillytavern/repository.test.ts src/tavern/remote-story-engine.test.ts src/components/SillyTavern/TavernDialogue.test.tsx`

Expected: all focused persistence and dialogue tests pass.

Commit: `fix: make tavern turns and variables durable`

### Task 5: API Protocol, URL, SSE, And Privacy Boundary

**Files:**
- Create: `src/sillytavern/sse-parser.ts`
- Create: `src/sillytavern/sse-parser.test.ts`
- Modify: `src/sillytavern/api-config.ts`
- Modify: `src/sillytavern/api-config.test.ts`
- Modify: `src/sillytavern/api-adapter.ts`
- Modify: `src/sillytavern/api-adapter.test.ts`
- Modify: `src/sillytavern/protocol-adapters.ts`
- Modify: `src/sillytavern/protocol-adapters.test.ts`
- Modify: `src/sillytavern/types.ts`
- Modify: `src/tavern/TavernContext.tsx`

**Interfaces:**
- `parseSseEvents(chunks): ParsedSseEvent[]` handles event boundaries, multiline data, split JSON, `[DONE]`, and EOF.
- `validateTavernApiConfig` rejects URL username/password/query/fragment and missing provider options.
- `redactRequestInspection` redacts sensitive URL components and credential-shaped headers before persistence/export.

- [ ] **Step 1: Add parser and privacy red tests**

Cover multiline events, split JSON, empty events, malformed data, EOF without `[DONE]`, URL credentials/query/fragment, authorization variants, cookies, and endpoint redaction.

- [ ] **Step 2: Run transport/config tests and verify failure**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/sse-parser.test.ts src/sillytavern/api-config.test.ts src/sillytavern/api-adapter.test.ts`

Expected: current line-based SSE parsing and URL validation fail the new cases.

- [ ] **Step 3: Implement framed SSE parsing**

Accumulate event fields until a blank-line boundary, join multiple `data` fields with newlines, preserve provider event names, and pass complete payloads to protocol extraction. Treat EOF as a valid terminal boundary only when a complete event was received.

- [ ] **Step 4: Implement URL and inspection redaction**

Parse base URLs with `URL`, reject credential/query/fragment components, construct provider paths structurally, and redact all sensitive headers plus URL userinfo/query/fragment before audit persistence.

- [ ] **Step 5: Add provider fixture matrix**

Extend protocol fixtures for OpenAI-compatible, Azure, Anthropic, Gemini, Vertex, Cohere, and Cloudflare request/response shapes, including reasoning content and malformed provider responses.

- [ ] **Step 6: Run API tests and commit**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/sse-parser.test.ts src/sillytavern/api-config.test.ts src/sillytavern/api-adapter.test.ts src/sillytavern/protocol-adapters.test.ts`

Expected: all transport and privacy tests pass with no secret-shaped values in inspection fixtures.

Commit: `refactor: harden tavern transport and request privacy`

### Task 6: Shared Readiness, Inspector UX, Full Verification, And Release

**Files:**
- Create: `src/sillytavern/api-readiness.ts`
- Create: `src/sillytavern/api-readiness.test.ts`
- Modify: `src/components/SillyTavern/panels/ApiPanel.tsx`
- Modify: `src/components/SillyTavern/panels/RequestInspectorPanel.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.test.tsx`
- Modify: `src/components/SillyTavern/panels/ApiPanel.test.tsx`
- Modify: `README.md`

**Interfaces:**
- `getTavernApiReadiness(settings): { ready: boolean; error: string | null }` is the only readiness predicate used by UI and context.
- Request inspector labels local retention/export and displays redacted inspection data.

- [ ] **Step 1: Add readiness and privacy UI tests**

Cover missing key, invalid URL, missing model, missing account/project/location, valid config, and stale UI state after config edits. Assert inspector privacy notice and redacted URL.

- [ ] **Step 2: Implement shared readiness and inspector boundary**

Replace `REMOTE READY` key-presence logic with the shared predicate. Add retention/export explanation without exposing prompt contents in logs or error messages.

- [ ] **Step 3: Run focused UI tests and build**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/api-readiness.test.ts src/components/SillyTavern/panels/ApiPanel.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx`

Expected: all focused UI tests pass.

- [ ] **Step 4: Run the complete offline gate**

Run: `pnpm test:run`

Expected: zero failed tests.

Run: `pnpm build`

Expected: TypeScript and Vite exit successfully.

- [ ] **Step 5: Review final patch scope**

Run: `git status --short`, `git diff --stat`, and `git diff --check`. Confirm no files outside Tavern sources, direct Tavern UI/tests, docs, or migration fixtures changed.

- [ ] **Step 6: Perform live deployment acceptance**

At `https://tavern-olive.vercel.app/`, verify fresh onboarding, Tavern hub tabs, API readiness with no key, responsive 375px and desktop layout, inspector redaction UI, session panel interaction, and zero new console errors. Do not submit a real provider request without a safe credential.

- [ ] **Step 7: Commit and push `main`**

Run:

```powershell
git add src docs README.md
git commit -m "refactor: rebuild standalone tavern layer contracts"
git push origin main
```

Expected: GitHub accepts the authenticated push and Vercel creates a deployment for the new `main` revision.
