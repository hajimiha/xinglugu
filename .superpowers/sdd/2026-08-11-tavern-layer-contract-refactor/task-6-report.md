# Task 6 Report

## Scope

- Added `getTavernApiReadiness(settings)` as the shared readiness predicate.
- Replaced API-panel key-presence status and Context readiness duplication with that predicate.
- Kept the API panel status live against unsaved edits, so invalid URL/model/provider fields immediately return to `API REQUIRED`.
- Made request-inspector privacy boundaries explicit: local retention is capped at 20 audits, export and clear actions are labeled, provider inspection redacts credentials, query strings, and fragments at render time, and downloaded audits are recursively redacted for credential-shaped fields.
- Kept dialogue errors behind the Context readiness error when configuration is not ready; map and game production behavior were not changed.
- Updated README documentation for inspector retention and redaction.

## Tests Added

- Readiness tests cover missing key, invalid URL, missing model, missing Cloudflare account ID, missing Vertex project ID, missing Vertex location, and a valid configuration.
- API panel test covers stale readiness after invalid URL and empty-model edits, followed by a valid draft transition.
- Tavern hub inspector tests cover retention/export copy, render-time URL redaction, and serialized export redaction for URL userinfo/query/fragment, sensitive headers, and credential-shaped nested fields.

## Verification

- Reviewer fix command: `pnpm exec vitest run --environment jsdom src/sillytavern/api-readiness.test.ts src/components/SillyTavern/panels/ApiPanel.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx` -> `3 passed`, `20 passed`.
- Full offline gate command: `pnpm test:run` -> `65 test files passed`, `333 tests passed`.
- Build command: `pnpm build` -> TypeScript and Vite production output passed.
- Patch hygiene: `git diff --check` passed; changed files are limited to the requested Tavern UI, tests, shared readiness source, Context/dialogue contract, and README.
- Live acceptance at `https://tavern-olive.vercel.app/`: fresh page loaded, hub opened, no-key `API REQUIRED` state visible, inspector tab opened, 375px and 1440px layouts inspected, and browser console reported zero errors/warnings.

## Release Boundary

- Commit message for this reviewer-fix commit: `fix: close tavern inspector export review`
- No push or new deployment is claimed; the controller will perform release push.
- No real provider request or credential was submitted.
