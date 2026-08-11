# Final Fix Wave Report

Date: 2026-08-11

## Scope

Fixed all requested Important findings and listed Minor contract/test gaps without changing map or game behavior.

## Changes

- Added repository-side normalization for legacy IndexedDB request audits whose prompt segments predate `messageIndex`. Loading now supplies `messageIndex: null` while preserving each stored `sent` state, so old sent and omitted segments remain accurate in the inspector.
- Applied per-entry `scanDepth` limits during lorebook recursion while retaining the existing global `maxDepth` bound. Entries without an explicit limit retain the previous recursive behavior.
- Replaced JavaScript `\\b` whole-word matching with a Unicode letter/number/underscore boundary predicate. This covers CJK and preserves ASCII punctuation, adjacency, and case behavior.
- Centralized recursive sensitive-value redaction and applied it to provider request bodies, on-screen inspector JSON, and export data using the same key boundary.
- Narrowed `projectCharacterPrompts` to `Record<CharacterPromptIdentifier, string>` and guarded dynamic prompt-key lookup in the compiler so TypeScript remains sound without changing fallback behavior.
- Strengthened selective-logic tests across both primary-key spellings and partial secondary-key combinations.
- Extended existing provider fixtures only to cover the newly fixed nested-body redaction boundary. No real provider calls were added.

## Verification

- Focused lorebook, prompt-budget, repository, API-adapter, inspector UI, and rolecard projection tests: passed.
- `pnpm test:run`: 65 test files passed, 337 tests passed.
- `pnpm build`: passed (`tsc -b` and Vite production build).
- `git diff --check`: passed.
- No map or game source files were changed.

## Residual Concerns

- Legacy audits are normalized on read and are not rewritten in IndexedDB; the stored legacy payload remains unchanged until a later explicit save.
- Whole-word CJK matching treats adjacent Unicode letters/numbers as one word, so a key embedded in an adjacent CJK phrase is intentionally not a whole-word match.
- Runtime acceptance against a live external provider was not performed; provider coverage remains deterministic fixture coverage by design.
