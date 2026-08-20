# GAL Multi-Character Dialogue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing full-screen GAL dialogue so a primary NPC can invite up to four other residents with affinity strictly above 70, render all participants, and highlight the exact current speaker.

**Architecture:** Keep one shared `ChatSession` and add normalized participant metadata with the primary NPC first. Single-character requests retain the current contract; group requests add participant profiles and exact-name scene rules. `TavernDialogue` derives invitees and portrait state from the saved session, while all persistence, generation, history, energy, and image behavior stays on the existing paths.

**Tech Stack:** React 18, TypeScript 5.6+, Vite 5, Vitest 2, Testing Library, Dexie/fake-indexeddb, CSS, Phosphor icons.

**Spec:** `docs/superpowers/specs/2026-08-19-galgame-multi-character-dialogue-design.md`

## Global Constraints

- Affinity eligibility is strictly `> 70`, not `>= 70`.
- The five-person maximum includes the primary NPC.
- The primary NPC is always the first participant and cannot be displaced by malformed saved data.
- Existing single-character prompt text and behavior must remain unchanged.
- One player action produces one model request and one assistant message.
- Successful group dialogue still settles existing chat cost/reward for the primary NPC only.
- No new package dependency or database schema version.
- Use the existing Phosphor icon family, CSS tokens, focus model, error region, and responsive breakpoints.
- This retrieved source archive has no `.git` directory, so implementation checkpoints are recorded in the plan/progress log instead of commits.

---

### Task 1: Normalize and Persist Session Participants

**Files:**
- Create: `src/sillytavern/session-participants.ts`
- Create: `src/sillytavern/session-participants.test.ts`
- Modify: `src/sillytavern/types.ts:247`
- Modify: `src/sillytavern/repository.ts:138`
- Modify: `src/sillytavern/repository.test.ts`
- Modify: `src/sillytavern/variables.ts:54`
- Modify: `src/sillytavern/variables.test.ts`
- Modify: `src/tavern/TavernContext.tsx:204`

**Interfaces:**
- Produces: `MAX_CHAT_PARTICIPANTS = 5`.
- Produces: `normalizeSessionParticipantIds(primaryNpcId: string | undefined, value: unknown): string[]`.
- Produces: `ChatSession.participantNpcIds?: string[]`.
- Consumed later by the Tavern context and GAL UI.

- [x] **Step 1: Write failing normalization tests**

```ts
expect(normalizeSessionParticipantIds('loran', ['freya', 'loran', 'freya', '', 4])).toEqual(['loran', 'freya'])
expect(normalizeSessionParticipantIds('loran', ['freya', 'mina', 'liuan', 'taomi', 'yanque'])).toEqual([
  'loran', 'freya', 'mina', 'liuan', 'taomi',
])
expect(normalizeSessionParticipantIds('loran', undefined)).toEqual(['loran'])
```

- [x] **Step 2: Run the test and verify RED**

Run: `pnpm test:run src/sillytavern/session-participants.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement the minimal normalizer and type field**

```ts
export const MAX_CHAT_PARTICIPANTS = 5

export function normalizeSessionParticipantIds(primaryNpcId: string | undefined, value: unknown): string[] {
  const candidates = Array.isArray(value) ? value : []
  const ids = [primaryNpcId, ...candidates]
    .filter((item): item is string => typeof item === 'string' && Boolean(item.trim()))
    .map((item) => item.trim())
  return [...new Set(ids)].slice(0, MAX_CHAT_PARTICIPANTS)
}
```

- [x] **Step 4: Verify GREEN for the pure tests**

Run: `pnpm test:run src/sillytavern/session-participants.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing repository and branch tests**

Add assertions that malformed stored participant data is normalized to primary-first/unique/five, and `branchChat` copies the source participant list.

```ts
expect(restored.participantNpcIds).toEqual(['loran', 'freya'])
expect(branch.participantNpcIds).toEqual(source.participantNpcIds)
```

- [x] **Step 6: Run repository/variables tests and verify RED**

Run: `pnpm test:run src/sillytavern/repository.test.ts src/sillytavern/variables.test.ts`

Expected: FAIL because normalization/branching does not yet populate the field.

- [x] **Step 7: Wire normalization into storage, branching, and new sessions**

`normalizeStoredSession` calls `normalizeSessionParticipantIds(raw.npcId, raw.participantNpcIds)`. `branchChat` copies the array. `openNpcSession` initializes new sessions with `[npcId]`.

- [x] **Step 8: Verify Task 1 GREEN**

Run: `pnpm test:run src/sillytavern/session-participants.test.ts src/sillytavern/repository.test.ts src/sillytavern/variables.test.ts src/tavern/TavernContext.test.tsx`

Expected: PASS with no warnings introduced by this task.

### Task 2: Resolve Eligibility and Multi-NPC GAL Speakers

**Files:**
- Create: `src/tavern/galgame-participants.ts`
- Create: `src/tavern/galgame-participants.test.ts`
- Modify: `src/tavern/galgame-dialogue.ts`
- Modify: `src/tavern/galgame-dialogue.test.ts`

**Interfaces:**
- Consumes: `MAX_CHAT_PARTICIPANTS`, normalized participant IDs.
- Produces: `getEligibleGalgameInvitees(npcs, relationships, participantNpcIds)`.
- Produces: parser context `npcNames?: string[]` while retaining `npcName` and `playerName`.
- Produces: `GalgameSegment.name` as a validated participant name for NPC frames.

- [x] **Step 1: Write failing eligibility tests**

```ts
const invitees = getEligibleGalgameInvitees(npcs, relationships, ['loran'])
expect(invitees.map((item) => item.id)).toEqual(['freya'])
expect(invitees.some((item) => item.id === 'mina')).toBe(false) // affinity exactly 70
```

Also test exclusion of current participants, missing relationship records, deterministic affinity/name sorting, and no invitees at five participants.

- [x] **Step 2: Run eligibility tests and verify RED**

Run: `pnpm test:run src/tavern/galgame-participants.test.ts`

Expected: FAIL because the module does not exist.

- [x] **Step 3: Implement eligibility as a pure function**

Use a participant ID `Set`, return `[]` at the cap, require `relationship?.affinity > 70`, then sort by affinity descending and `name.localeCompare`.

- [x] **Step 4: Verify eligibility GREEN**

Run: `pnpm test:run src/tavern/galgame-participants.test.ts`

Expected: PASS.

- [x] **Step 5: Write failing multi-speaker parser tests**

```ts
expect(parseGalgameSegments(
  '<scene speaker="npc" name="芙蕾雅">药草园需要帮手。</scene>',
  { npcName: '洛岚', npcNames: ['洛岚', '芙蕾雅'], playerName: '云岚' },
)).toEqual([{ speaker: 'npc', name: '芙蕾雅', text: '药草园需要帮手。' }])
```

Add structured unknown-name fallback, Chinese labelled secondary NPC, narrator, and player-name normalization cases.

- [x] **Step 6: Run parser tests and verify RED**

Run: `pnpm test:run src/tavern/galgame-dialogue.test.ts`

Expected: FAIL because secondary NPC names are currently overwritten or treated as narration.

- [x] **Step 7: Implement allowed-name parsing**

Build a normalized allowed-name set from `npcName` plus `npcNames`. Preserve a structured NPC name only when it matches; otherwise use the primary NPC. Keep all existing single-character fallbacks.

- [x] **Step 8: Verify Task 2 GREEN**

Run: `pnpm test:run src/tavern/galgame-participants.test.ts src/tavern/galgame-dialogue.test.ts`

Expected: PASS.

### Task 3: Add a Group-Only Remote Response Contract

**Files:**
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/tavern/remote-story-engine.test.ts`

**Interfaces:**
- Extends `RemoteTurnInput` with `participants?: CharacterCard[]`.
- Produces: `createGroupResponseContract(participants: readonly CharacterCard[]): string` internally.
- Single participant produces the exact current `PLAYER_IDENTITY_CONTRACT + REMOTE_RESPONSE_CONTRACT` composition.

- [x] **Step 1: Write failing group-contract tests**

Pass 洛岚 and 芙蕾雅 cards and assert the prepared system text contains both exact names, both roles/descriptions/personalities, an exact-name whitelist rule, and examples for both NPCs.

```ts
expect(preparedText).toContain('允许发言的 NPC 姓名')
expect(preparedText).toContain('洛岚')
expect(preparedText).toContain('芙蕾雅')
expect(preparedText).toContain('<scene speaker="npc" name="芙蕾雅">')
```

Also retain the existing single-character assertions and assert that the group-only marker is absent there.

- [x] **Step 2: Run remote-engine tests and verify RED**

Run: `pnpm test:run src/tavern/remote-story-engine.test.ts`

Expected: FAIL because `participants` and the group contract do not exist.

- [x] **Step 3: Implement group-only contract composition**

Normalize participants to unique cards with the primary first and cap at five. Serialize each card as clearly delimited setting data. Escape names used inside XML examples. Append the group block only when more than one valid card remains.

- [x] **Step 4: Verify Task 3 GREEN**

Run: `pnpm test:run src/tavern/remote-story-engine.test.ts src/sillytavern/prompt-compiler.test.ts`

Expected: PASS, including unchanged single-character contract tests.

### Task 4: Feed Saved Participants and Lorebooks into Generation

**Files:**
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/tavern/TavernContext.test.tsx`

**Interfaces:**
- Consumes: `session.participantNpcIds`, normalized participant IDs, `RemoteTurnInput.participants`.
- Produces group runtime variables: `dialogueMode`, `dialogueParticipantNames`, `dialogueParticipantCount`.
- Produces a stable union of existing session lorebooks and participant-card lorebooks for compilation.

- [x] **Step 1: Write a failing Tavern-context group request test**

Persist a session with `participantNpcIds: ['loran', 'freya']`, give the second card a sentinel lorebook, send a turn, and assert the prepared request contains both profiles/names plus the sentinel lorebook content.

- [x] **Step 2: Run the context test and verify RED**

Run: `pnpm test:run src/tavern/TavernContext.test.tsx`

Expected: FAIL because `sendTurn` currently loads only `input.npcId` and session lorebooks.

- [x] **Step 3: Implement participant loading and merged resources**

Load the character collection once, resolve normalized IDs, keep only cards that exist, force the primary card first, and build an effective session for `resolveSessionResources` with a stable lorebook union.

```ts
const participantCards = participantIds
  .map((id) => availableCharacters.find((card) => card.npcId === id))
  .filter((card): card is CharacterCard => Boolean(card))
```

Pass `participants: participantCards` to `createRemoteTurn`; add primitive group variables only when the length exceeds one; show joined names in the request audit.

- [x] **Step 4: Verify Task 4 GREEN**

Run: `pnpm test:run src/tavern/TavernContext.test.tsx src/tavern/remote-story-engine.test.ts src/sillytavern/repository.test.ts`

Expected: PASS.

### Task 5: Implement the Invitation Drawer Flow with Integration Tests

**Files:**
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.test.tsx`

**Interfaces:**
- Consumes normalized participant IDs, eligible invitees, Tavern `saveSession`, all resident NPC/card/relationship data.
- Produces an `invite` interaction tab, title-bar invite button, persisted membership, success/error feedback, and group-aware dialogue variables.

- [x] **Step 1: Write a failing invitation integration test**

Use an initial state where 芙蕾雅 has affinity 71 and 弥奈 has affinity 70. Assert the title-bar invite button opens the drawer, only 芙蕾雅 is actionable, closing returns focus to the invite button, inviting persists `['loran', 'freya']`, and two portraits appear.

```ts
expect(screen.getByRole('button', { name: /邀约角色加入对话.*1\/5/ })).toBeVisible()
expect(screen.getByRole('button', { name: /邀请芙蕾雅加入对话/ })).toBeEnabled()
expect(screen.queryByRole('button', { name: /邀请弥奈加入对话/ })).not.toBeInTheDocument()
```

- [x] **Step 2: Run the component test and verify RED**

Run: `pnpm test:run src/components/SillyTavern/TavernDialogue.test.tsx`

Expected: FAIL because no invitation UI exists.

- [x] **Step 3: Implement participant derivation and invitation persistence**

Derive participants from the current session, `npcs`, cards, and relationship state. Add `invitingNpcId` and a polite status message. Before saving, re-check eligibility/cap and merge the invited card's lorebooks.

- [x] **Step 4: Implement the invite entry and drawer tab**

Extend `interactionTab` to `'conversation' | 'invite' | 'gallery'`. Add a labelled title-bar invite button and an invite tab using the existing drawer. Track the opener in a focus-return ref so both entry points restore correctly.

- [x] **Step 5: Verify invitation GREEN**

Run: `pnpm test:run src/components/SillyTavern/TavernDialogue.test.tsx`

Expected: invitation test passes and all seven original dialogue tests remain green.

- [x] **Step 6: Write a failing generated-speaker integration test**

Mock an SSE response containing a 洛岚 scene followed by a 芙蕾雅 scene. After inviting 芙蕾雅 and sending, assert the provider body includes the group contract, the 芙蕾雅 portrait has `is-speaking`, 洛岚 has `is-dimmed`, and the textbox shows 芙蕾雅.

- [x] **Step 7: Run the new speaker test and verify RED**

Expected: FAIL because the component still renders one portrait and parses with one NPC name.

- [x] **Step 8: Make all component parsing/rendering paths group-aware**

Pass all participant names to saved-message, streaming, and drawer-log parsing. Compute the active participant from the normalized frame name. Keep image generation, gallery ownership, history, chat settlement, and error recovery on the primary NPC.

- [x] **Step 9: Verify Task 5 GREEN**

Run: `pnpm test:run src/components/SillyTavern/TavernDialogue.test.tsx src/tavern/galgame-dialogue.test.ts`

Expected: PASS.

### Task 6: Render and Style the One-to-Five Character Stage

**Files:**
- Modify: `src/components/icons/GameIcon.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Adds `GameIcon` name `invite` mapped to Phosphor `UserPlus`.
- Produces `.galgame-character-stage`, `.galgame-participant`, `.is-speaking`, `.is-dimmed`, `.galgame-participant-label`, and invite-panel styles.

- [x] **Step 1: Add DOM/class assertions before styling**

Assert every participant has a stable `data-testid`, the scene exposes participant count, the current speaker has a visible “发言中” label, and narrator/player frames leave no participant marked speaking.

- [x] **Step 2: Run component tests and verify RED**

Expected: FAIL until the stage markup exposes the requested semantics.

- [x] **Step 3: Replace the single image branch with a participant stage**

Use semantic figures with real image alt text or the existing first-character fallback. Preserve the old single-participant geometry through a `has-single-participant` class; use a count-aware flex/grid layout for two to five.

- [x] **Step 4: Add invitation and active-speaker CSS**

Use existing theme tokens and 4/8 px spacing. Active state: full opacity, brightness and elevated z-index plus label. Dim state: approximately 0.48–0.58 opacity, reduced brightness/saturation. Animate only transform/filter/opacity for 180–280 ms.

- [x] **Step 5: Add responsive and reduced-motion rules**

At `max-width: 640px`, compress/re-overlap portraits so five remain inside the scene without page overflow. Add new selectors to the existing `prefers-reduced-motion: reduce` block to remove portrait transforms and drawer motion.

- [x] **Step 6: Verify Task 6 GREEN**

Run: `pnpm test:run src/components/SillyTavern/TavernDialogue.test.tsx src/accessibility.test.tsx`

Expected: PASS.

### Task 7: Full Regression and Runtime Acceptance

**Files:**
- Modify if needed: only files already listed above.
- Update: `README.md` only if the user-facing feature list lacks the invite capability after implementation.

**Interfaces:**
- Validates all preceding interfaces together; produces no new production API.

- [x] **Step 1: Run all targeted tests**

Run:

```bash
pnpm test:run \
  src/sillytavern/session-participants.test.ts \
  src/sillytavern/repository.test.ts \
  src/sillytavern/variables.test.ts \
  src/tavern/galgame-participants.test.ts \
  src/tavern/galgame-dialogue.test.ts \
  src/tavern/remote-story-engine.test.ts \
  src/tavern/TavernContext.test.tsx \
  src/components/SillyTavern/TavernDialogue.test.tsx
```

Expected: all pass with no unhandled errors.

- [x] **Step 2: Run the complete automated suite**

Run: `pnpm test:run`

Expected: all 465 baseline tests plus new tests pass.

- [x] **Step 3: Run both type checks and the production build**

Run:

```bash
node node_modules/typescript/bin/tsc -p tsconfig.api.json
node node_modules/typescript/bin/tsc -b
pnpm build
```

Expected: all commands exit 0.

- [x] **Step 4: Inspect the focused diff**

Confirm there are no changes to unrelated gameplay, provider credentials, cloud save, workshop, generated content pack, or image assets. Search for debug logging, `TODO`, `@ts-ignore`, unsafe HTML, and accidental secret-shaped values.

- [x] **Step 5: Run responsive browser acceptance**

At 375, 768, 1024, and 1440 widths verify: one-person parity; 2/5/5-person portrait fit; exact active-speaker brightness; narrator/player all-dim behavior; title invite button; strict eligibility; full-cap empty state; drawer focus/Escape; full-screen portal; no horizontal page scroll; reduced-motion behavior.

- [x] **Step 6: Update documentation and completion logs**

Add the capability to the README's dialogue feature description if absent. Record exact test counts, build output, files changed, and any runtime limitations in the task progress log.
