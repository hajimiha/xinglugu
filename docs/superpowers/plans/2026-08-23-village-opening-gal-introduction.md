# Village Opening GAL Introduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新玩家确认姓名后自动播放一段由村长洛岚主持、逐地点缩放聚焦的全屏 GAL 村庄导览，并可靠支持跳过、存档迁移和响应式体验。

**Architecture:** 使用独立 onboarding 导演层，不向普通 `VillageMap` 注入剧情状态。剧情脚本和相机计算均为可测试纯数据/纯函数，React 组件只维护当前节拍与跳过确认，完成状态通过 GameState 持久化。

**Tech Stack:** React 18、TypeScript、CSS、Vitest、Testing Library、Vite、现有 GameProvider/本地存档。

**Spec:** `docs/superpowers/specs/2026-08-23-village-opening-gal-introduction-design.md`

## Global Constraints

- 新档确认姓名后自动播放；旧的已命名存档不补播。
- 全部 11 个现有地点各聚焦一次，坐标只读取 `locations[].mapPosition`。
- 右上角常驻“跳过剧情”，二次确认后直接完成。
- 自然结束与跳过使用同一个幂等动作 `COMPLETE_VILLAGE_INTRO`。
- 不调用 LLM，不增加任务、奖励、时间消耗或重播系统。
- 普通地图、单/多角色 GAL、农场、战斗、商店和存档行为保持不变。
- 覆盖 375、768、1024、1440 视口、键盘操作、44px 触控区和 reduced-motion。
- 不暂存仓库根目录现有的三个未跟踪截图。

---

## File Structure

- Modify `src/game/types.ts`: 为玩家资料与动作联合增加开场状态契约。
- Modify `src/game/player-profile.ts`: 默认资料与旧档兼容清洗。
- Modify `src/game/reducer.ts`: 姓名确认和开场完成状态转换。
- Modify `src/game/game-save-storage.ts`: 存档版本升级与 v1/v2/v3 读取。
- Create `src/components/onboarding/village-opening-story.ts`: 15 个确定性剧情节拍与安全姓名替换。
- Create `src/components/onboarding/opening-camera.ts`: 响应式地图镜头纯函数。
- Create `src/components/onboarding/VillageOpeningIntro.tsx`: GAL 舞台、推进、跳过和键盘行为。
- Create `src/components/onboarding/OnboardingFlow.tsx`: 姓名门禁、开场与普通游戏三态编排。
- Modify `src/App.tsx`: 以 `OnboardingFlow` 包裹现有普通游戏壳。
- Modify `src/styles/global.css`: 独立 `village-intro-*` 样式、响应式和 reduced-motion。
- Add/update colocated Vitest files for every new/changed boundary.

### Task 1: Persisted onboarding state and legacy migration

**Files:** `src/game/types.ts`, `src/game/player-profile.ts`, `src/game/player-profile.test.ts`, `src/game/reducer.ts`, `src/game/reducer.test.ts`, `src/game/game-save-storage.ts`, `src/game/game-save-storage.test.ts`

**Produces:** `PlayerProfile.hasCompletedVillageIntro: boolean`; action `{ type: 'COMPLETE_VILLAGE_INTRO' }`; v3 saves that still read v1/v2.

- [ ] **Step 1: Write failing profile/reducer tests**

```ts
expect(sanitizePlayerProfile(undefined)).toEqual({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })
expect(sanitizePlayerProfile({ name: '旧玩家', hasConfirmedName: true })).toEqual({ name: '旧玩家', hasConfirmedName: true, hasCompletedVillageIntro: true })
expect(sanitizePlayerProfile({ name: '新玩家', hasConfirmedName: true, hasCompletedVillageIntro: false })).toEqual({ name: '新玩家', hasConfirmedName: true, hasCompletedVillageIntro: false })
const named = gameReducer(initialGameState, { type: 'SET_PLAYER_NAME', name: '云岚' })
expect(named.playerProfile.hasCompletedVillageIntro).toBe(false)
const completed = gameReducer(named, { type: 'COMPLETE_VILLAGE_INTRO' })
expect(completed.playerProfile.hasCompletedVillageIntro).toBe(true)
expect(gameReducer(completed, { type: 'COMPLETE_VILLAGE_INTRO' })).toBe(completed)
```

- [ ] **Step 2: Verify RED** — Run `npm run test:run -- src/game/player-profile.test.ts src/game/reducer.test.ts`; expect missing field/action failures.

- [ ] **Step 3: Implement the state contract**

```ts
export interface PlayerProfile { name: string; hasConfirmedName: boolean; hasCompletedVillageIntro: boolean }
// GameAction:
| { type: 'COMPLETE_VILLAGE_INTRO' }
```

`sanitizePlayerProfile` returns explicit fields on every path. Confirmed legacy profiles missing a strict boolean migrate to completed; unconfirmed profiles remain incomplete. `SET_PLAYER_NAME` writes explicit `false`; the completion action returns the original object if already complete.

- [ ] **Step 4: Add failing save tests**

```ts
expect(GAME_SAVE_SCHEMA_VERSION).toBe(3)
expect(parseGameSave(JSON.stringify({ schemaVersion: 2, savedAt: '2026-08-23T00:00:00.000Z', state: { ...initialGameState, playerProfile: { name: '旧玩家', hasConfirmedName: true } } }))?.state.playerProfile.hasCompletedVillageIntro).toBe(true)
```

Also verify v3 explicit `false` round-trips and an unconfirmed v2 save remains incomplete.

- [ ] **Step 5: Verify RED** — Run `npm run test:run -- src/game/game-save-storage.test.ts`; expect schema/migration failures.

- [ ] **Step 6: Upgrade save parsing** — Set `GAME_SAVE_SCHEMA_VERSION = 3 as const`; accept numeric 1/2/3 on read, always sanitize and return v3. Do not touch unrelated sanitizers.

- [ ] **Step 7: Verify GREEN and commit**

Run `npm run test:run -- src/game/player-profile.test.ts src/game/reducer.test.ts src/game/game-save-storage.test.ts`.

```bash
git add src/game/types.ts src/game/player-profile.ts src/game/player-profile.test.ts src/game/reducer.ts src/game/reducer.test.ts src/game/game-save-storage.ts src/game/game-save-storage.test.ts
git commit -m "feat: persist village opening completion"
```

### Task 2: Deterministic opening story

**Files:** Create `src/components/onboarding/village-opening-story.ts` and `.test.ts`.

**Produces:** `VillageOpeningBeat`, `VILLAGE_OPENING_BEATS`, `formatVillageOpeningText`.

- [ ] **Step 1: Write failing contract tests**

```ts
const focused = VILLAGE_OPENING_BEATS.flatMap((beat) => beat.focusLocationId ? [beat.focusLocationId] : [])
expect(focused).toHaveLength(locations.length)
expect(new Set(focused).size).toBe(locations.length)
expect([...focused].sort()).toEqual(locations.map((location) => location.id).sort())
expect(VILLAGE_OPENING_BEATS[0].camera).toBe('overview')
expect(VILLAGE_OPENING_BEATS.at(-1)?.camera).toBe('overview')
expect(formatVillageOpeningText('欢迎，{{playerName}}', '<云岚>')).toBe('欢迎，<云岚>')
```

- [ ] **Step 2: Verify RED** — Run `npm run test:run -- src/components/onboarding/village-opening-story.test.ts`; expect module-not-found.

- [ ] **Step 3: Implement typed story data**

```ts
export interface VillageOpeningBeat { id: string; speaker: 'narrator' | 'loran'; text: string; camera: 'overview' | 'location'; focusLocationId?: LocationId }
export function formatVillageOpeningText(text: string, playerName: string) { return text.replaceAll('{{playerName}}', playerName) }
```

Use the exact route and dialogue from the spec: overview/welcome, farm, witch-home, general-store, library, hospital, fisher-home, monster-market, smithy, mayor-home, hunter-camp, mine, two overview closing beats. Plain strings only; never HTML.

- [ ] **Step 4: Verify GREEN and commit** — Run the focused test, then commit `feat: add village opening story beats` with only the two story files.

### Task 3: Responsive map camera geometry

**Files:** Create `src/components/onboarding/opening-camera.ts` and `.test.ts`.

**Produces:** `OpeningCameraTransform { scale; x; y }` and `calculateOpeningCamera(input)`.

- [ ] **Step 1: Write failing geometry tests**

```ts
expect(calculateOpeningCamera({ viewportWidth: 1440, viewportHeight: 900, mapAspectRatio: 1672 / 941 })).toEqual({ scale: 1, x: 0, y: 0 })
for (const viewport of [{ width: 375, height: 667 }, { width: 768, height: 1024 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
  for (const location of locations) {
    const result = calculateOpeningCamera({ viewportWidth: viewport.width, viewportHeight: viewport.height, mapAspectRatio: 1672 / 941, focusRect: location.mapPosition })
    expect([result.scale, result.x, result.y].every(Number.isFinite)).toBe(true)
    expect(result.scale).toBeGreaterThan(1)
    expect(result.scale).toBeLessThanOrEqual(viewport.width < 600 ? 1.85 : 2.35)
  }
}
```

Add zero viewport and malformed rectangle cases expecting overview fallback.

- [ ] **Step 2: Verify RED** — Run `npm run test:run -- src/components/onboarding/opening-camera.test.ts`.

- [ ] **Step 3: Implement contain-layout math**

```ts
const mobile = viewportWidth < 600
const maxScale = mobile ? 1.85 : 2.35
const minScale = mobile ? 1.2 : 1.35
const baseWidth = Math.min(viewportWidth, viewportHeight * mapAspectRatio)
const baseHeight = baseWidth / mapAspectRatio
const fitted = Math.min((viewportWidth * (mobile ? .78 : .56)) / (baseWidth * focusRect.w / 100), (viewportHeight * (mobile ? .42 : .52)) / (baseHeight * focusRect.h / 100))
const scale = clamp(fitted, minScale, maxScale)
```

Move the location center toward mobile 50%/38% and desktop 42%/42%, clamp finite X/Y based on scaled map dimensions, and safely return overview for invalid input.

- [ ] **Step 4: Verify GREEN and commit** — Run the focused test, then commit `feat: add opening map camera geometry` with only the camera files.

### Task 4: Full-screen GAL opening component

**Files:** Create `src/components/onboarding/VillageOpeningIntro.tsx` and `.test.tsx`.

**Consumes:** story, camera, locations, `useGame`. **Dispatches:** `COMPLETE_VILLAGE_INTRO`.

- [ ] **Step 1: Write failing component tests**

```tsx
expect(screen.getByTestId('village-opening-intro')).toBeVisible()
expect(screen.getByText(/欢迎来到性撸谷/)).toBeVisible()
expect(screen.getByRole('img', { name: '村长洛岚立绘' })).toBeVisible()
expect(screen.getByRole('button', { name: '跳过剧情' })).toBeVisible()
await user.click(screen.getByRole('button', { name: /继续|开始/ }))
expect(screen.getByText('苔灯农场')).toBeVisible()
await user.click(screen.getByRole('button', { name: '跳过剧情' }))
expect(screen.getByRole('dialog', { name: '跳过村庄介绍' })).toBeVisible()
```

Also cover cancel/confirm skip, Enter/Space/ArrowRight, key suppression while confirming, natural completion, and portrait error fallback.

- [ ] **Step 2: Verify RED** — Run `npm run test:run -- src/components/onboarding/VillageOpeningIntro.test.tsx`.

- [ ] **Step 3: Implement safe component state**

Use `beatIndex`, `confirmingSkip`, viewport resize state, and an idempotence guard:

```ts
const complete = useCallback(() => {
  if (completedRef.current) return
  completedRef.current = true
  dispatch({ type: 'COMPLETE_VILLAGE_INTRO' })
}, [dispatch])
```

Render blurred cover background, contained camera map, 洛岚 portrait/fallback, speaker name, location title, dialogue, progress, continue, and right-top skip. Use normal React text nodes. Confirm actual existing day-map asset path before importing.

- [ ] **Step 4: Implement accessible confirmation** — `role="dialog"`, `aria-modal`, accessible heading, default focus on “继续观看”, Escape cancellation, focus containment between the two actions; the dialog disables story advance.

- [ ] **Step 5: Verify GREEN and commit** — Run story/camera/component tests, then commit `feat: build gal village opening scene`.

### Task 5: Onboarding orchestration and responsive styling

**Files:** Create `OnboardingFlow.tsx` and `.test.tsx`; modify `src/App.tsx` and `src/styles/global.css`.

**Behavior:** unconfirmed renders normal children + PlayerNameGate; confirmed/incomplete renders only intro; completed renders only normal children.

- [ ] **Step 1: Write failing orchestration tests**

```tsx
renderFlow({ name: '旅行者', hasConfirmedName: false, hasCompletedVillageIntro: false })
expect(screen.getByText('普通游戏')).toBeVisible()
expect(screen.getByRole('dialog')).toBeVisible()
renderFlow({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: false })
expect(screen.getByTestId('village-opening-intro')).toBeVisible()
expect(screen.queryByText('普通游戏')).not.toBeInTheDocument()
renderFlow({ name: '云岚', hasConfirmedName: true, hasCompletedVillageIntro: true })
expect(screen.getByText('普通游戏')).toBeVisible()
```

- [ ] **Step 2: Verify RED** — Run `npm run test:run -- src/components/onboarding/OnboardingFlow.test.tsx`.

- [ ] **Step 3: Implement flow and wire App** — Move PlayerNameGate ownership into `OnboardingFlow`; wrap the existing game shell without otherwise changing its children.

- [ ] **Step 4: Add isolated styles** — Only `village-intro-*` selectors: fixed opaque full-screen stack; blurred/contained maps; transform variables; readable GAL panel; 44px controls; speaking/narrator brightness; 375/768/1024/1440 layouts; visible focus; reduced-motion overrides.

- [ ] **Step 5: Verify and commit** — Run `npm run test:run -- src/components/onboarding` and `npx tsc -b`; commit `feat: launch opening after player naming`.

### Task 6: Regression, browser acceptance, backup, release

- [ ] **Step 1: Full automated gate**

```bash
npm run test:run
npm run typecheck:api
npx tsc -b
npm run build
```

Every command must exit 0; record exact test/build results.

- [ ] **Step 2: Browser acceptance** — Run a clean new game at 375×812, 768×1024, 1024×768, 1440×900. Inspect all 11 focuses, overflow, portrait/text, skip cancel/confirm, natural completion, refresh non-replay, injected v2 named-save non-replay, and reduced-motion.

- [ ] **Step 3: Regression-sensitive tests**

```bash
npm run test:run -- src/components/onboarding/PlayerNameGate.test.tsx src/components/shell/VillageMap.test.tsx src/components/SillyTavern/TavernDialogue.test.tsx src/game/GameContext.test.tsx
```

- [ ] **Step 4: Diff protection** — Run `git status --short`, `git diff --check`, inspect `git diff main...HEAD`; keep the three existing screenshots untracked/unstaged.

- [ ] **Step 5: Backup old main** — Create and verify an annotated local tag or local backup branch at pre-release `origin/main`. Do not push the backup unless needed.

- [ ] **Step 6: Integrate** — Merge/fast-forward verified feature branch into local `main`, rerun final tests/build, then `git push origin main`; never force-push.

- [ ] **Step 7: Deployment smoke** — Verify GitHub main and `https://xinglugu.vercel.app/` correspond to the pushed commit, then smoke-test the deployed opening.

## Plan Self-Review

- **Spec coverage:** Tasks 1–6 cover every goal and non-goal.
- **Placeholder scan:** No TBD/TODO, unspecified validation, or “similar to” steps remain.
- **Type consistency:** `hasCompletedVillageIntro`, `COMPLETE_VILLAGE_INTRO`, `VillageOpeningBeat`, `VILLAGE_OPENING_BEATS`, `calculateOpeningCamera`, `VillageOpeningIntro`, and `OnboardingFlow` are stable across all tasks.
- **Delivery safety:** Every implementation boundary is TDD-tested and committed; complete regression/browser gates and a recoverable old-main backup precede direct main push.
