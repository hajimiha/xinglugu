# Tavern Layer Contract Refactor Design

## Goal

Make the standalone Tavern layer faithfully compile rolecards, lorebooks, presets, variables, regex rules, history, and response contracts into a deterministic request, while making session persistence, provider transport, and request inspection safe and testable.

## Scope

In scope:

- `src/sillytavern` prompt, lorebook, macro, regex, variable, API, persistence, import/export, and type contracts.
- `src/tavern` session orchestration and remote story generation.
- Direct Tavern UI consumers and their tests where a contract changes.
- Local IndexedDB migrations required by new session/audit fields.
- Offline tests, production build, and read-only runtime acceptance at `https://tavern-olive.vercel.app/` after deployment.

Out of scope:

- `VillageMap` and game travel behavior.
- Game economy, calendar, farming, combat, audio, and portrait behavior unless a Tavern contract is directly broken.
- Real provider calls without an explicitly available test credential.
- A wholesale rewrite or replacement of the React application.

## Runtime Contract

The application is a standalone browser Tavern implementation, not a SillyTavern host extension. Its required runtime surfaces are browser `fetch`, IndexedDB/Dexie, session storage, and a provider that permits browser CORS. No host extension, MVU global, Tavern Helper, remote card loader, or external server is required by the current artifact.

Provider dependencies are classified by protocol rather than provider label:

- OpenAI-compatible chat: bearer or provider-specific API-key authentication.
- Azure OpenAI: deployment URL and API-key authentication.
- Anthropic Messages: `x-api-key`, version header, content blocks, and provider SSE events.
- Gemini and Vertex Gemini: native `contents`/parts and provider-specific authentication.
- Cohere v2: native message/content response shape.
- Cloudflare Workers AI: account ID, model route, and wrapped result response.

No API key is committed, logged, exported, or included in request-inspection data.

## Architecture

The existing public boundaries remain stable where possible:

```text
CharacterCard + ChatPreset + Lorebook[] + ChatSession + runtime variables
        -> rolecard projection
        -> lorebook match result
        -> ordered prompt plan
        -> macro/regex compilation
        -> one context-budget pass
        -> prepared request
        -> provider protocol adapter
        -> parsed response and explicit variable patch
        -> transactional session/audit commit
```

The compiler will expose traceable segments and diagnostics, but each stage owns one concern:

- `rolecard projection`: character identity and precedence.
- `lorebook engine`: matching, recursion, probability, and effective placement.
- `prompt compiler`: ordering, macros, regex stages, history, and virtual runtime blocks.
- `request budget`: final-message retention and omission diagnostics.
- `remote story engine`: provider stream aggregation and response parsing.
- `TavernContext`/repository: orchestration and durable state transitions.
- API adapter: protocol construction, transport, response extraction, and redaction.

## Prompt Semantics

- Character card fields are authoritative for `description`, `personality`, `scenario`, and `exampleDialogue`. Presets control prompt order, role, macros, and generation settings; they do not silently erase card identity.
- A character field is emitted only when its corresponding prompt-order item is enabled. Empty fields are skipped with no fake segment.
- Lorebook matches use namespaced identity `{ lorebookId, entryId }`, deterministic ordering, effective entry-level settings over book-level defaults, and explicit diagnostics for unsupported placement semantics.
- `useProbability: false` means deterministic inclusion after matching. Randomness is injected as a testable dependency.
- `and_any`, `and_all`, `not_any`, and `not_all` receive a documented truth table and dedicated tests.
- Recursion honors `excludeRecursion`, `preventRecursion`, and `scanDepth`, terminates on repeated namespaced entries, and records depth.
- Runtime variables, response format, history, and current user input are virtual prompt segments so their placement and omission are inspectable.
- Macro render state is separate from persisted state. Prompt-side operations do not become durable session state unless their contract explicitly permits it; `<vars>` output remains the explicit model update channel.
- One budgeting pass reserves `maxResponseLength`, always preserves the current user input, prefers required system segments, then trims oldest history. Silent second-pass reordering in the adapter is removed; overflow becomes a structured diagnostic/error.

## Persistence and Failure Semantics

- Every message state lookup uses `variablesAfter`, then `variables`, then `{}`.
- Per-session sends are serialized so concurrent calls cannot last-write-wins over one another.
- Successful session and audit records commit in one Dexie transaction. A failed audit cannot make an already-committed turn appear failed.
- Failed and aborted requests preserve their original error even if best-effort audit recording fails; audit status distinguishes `failed` and `aborted`.
- Opening an existing session merges current dialogue variables without overwriting unrelated session variables.
- Opening failure resets the retry guard. Branch/truncate validate indexes and preserve the selected snapshot.
- Migration changes are transactional and leave the previous content version when a migration fails.

## API and Privacy Semantics

- Readiness uses the same validator in UI and `TavernContext`; a non-empty key alone is not ready.
- Base URLs reject userinfo, query, and fragment components. Provider path construction uses a parsed URL rather than string concatenation.
- Request inspection redacts all credential-shaped headers and URL components before persistence or export.
- Inspection explicitly labels that prompt content is locally retained/exportable; it never contains API keys.
- SSE parsing accumulates standard event fields and multiline `data` payloads, handles split JSON and EOF, and delegates provider-specific extraction only after event framing.
- Each protocol adapter has request/response fixtures for streaming, non-streaming, model listing, malformed payloads, and provider errors. Real CORS/provider acceptance remains a manual gate.

## Verification Gates

1. Focused red/green tests for each changed contract.
2. Full `pnpm test:run` with zero failures.
3. `pnpm build` with zero TypeScript/build errors.
4. Static diff and patch-scope review limited to the Tavern layer, tests, and this documentation.
5. Deployed runtime checks at desktop and mobile sizes: onboarding, Tavern hub tabs, invalid API readiness, import/export controls, session editor scrolling, request-inspector redaction, and no new console errors.
6. Provider generation, streaming, abort, and CORS checks remain explicitly pending unless a safe test provider credential is available.

## Rollback

Each stage is committed separately to `main`. If a stage fails its focused test or build gate, stop before the next stage and revert only that stage's commit. Do not rewrite history or overwrite prior card/content artifacts.
