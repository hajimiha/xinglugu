# 好感度区间立绘槽位 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把角色卡固定五阶段立绘改为默认 `0—100` 单槽、可按指定好感区间自动切分扩展的持久化立绘系统。

**Architecture:** 在 `src/sillytavern/portrait-slots.ts` 集中管理区间不变量、插入切分、删除回填、命中与旧五阶段迁移。角色卡、内容包、Dexie 仓库、游戏场景和编辑器只消费这组纯函数，剧情关系阶段继续独立存在。

**Tech Stack:** React 18、TypeScript、Vitest、Testing Library、Dexie、Vite、现有 Phosphor 图标与像素风 CSS。

## Global Constraints

- 好感度立绘范围固定为整数 `0—100`，区间闭合、连续、无重叠、无空洞。
- 新角色默认只有一个 `0—100` 空槽；角色好感超过 100 时按 100 命中立绘。
- 旧五阶段图片不得丢失；新保存和新内容包只使用 `portraitSlots`。
- 所有用户可见文案使用中文，不使用 emoji，不调用浏览器原生警告框。
- PNG、JPG、WebP 单图不设容量上限，仓库内容包继续执行 12 MB 总预算。
- 桌面与 390px 手机均可完整操作，触控目标不低于 44px。

---

### Task 1: 区间槽位领域算法

**Files:**
- Create: `src/sillytavern/portrait-slots.ts`
- Create: `src/sillytavern/portrait-slots.test.ts`
- Modify: `src/sillytavern/types.ts`

**Interfaces:**
- Produces: `PortraitSlot`, `createDefaultPortraitSlots`, `insertPortraitSlot`, `removePortraitSlot`, `resolvePortraitSlot`, `legacyPortraitsToSlots`, `parsePortraitSlots`。

- [ ] **Step 1: Write the failing tests**

```ts
expect(createDefaultPortraitSlots()).toEqual([{ id: 'portrait-0-100', minAffinity: 0, maxAffinity: 100, source: '' }])
expect(insertPortraitSlot(createDefaultPortraitSlots('/base.webp'), { id: 'portrait-70-100', minAffinity: 70, maxAffinity: 100, source: '' }))
  .toEqual([
    { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 69, source: '/base.webp' },
    { id: 'portrait-70-100', minAffinity: 70, maxAffinity: 100, source: '' },
  ])
expect(insertPortraitSlot(createDefaultPortraitSlots('/base.webp'), { id: 'portrait-40-60', minAffinity: 40, maxAffinity: 60, source: '' }))
  .toEqual([
    { id: 'portrait-0-100', minAffinity: 0, maxAffinity: 39, source: '/base.webp' },
    { id: 'portrait-40-60', minAffinity: 40, maxAffinity: 60, source: '' },
    { id: 'portrait-0-100-right-61', minAffinity: 61, maxAffinity: 100, source: '/base.webp' },
  ])
expect(() => insertPortraitSlot(createDefaultPortraitSlots(), { id: 'bad', minAffinity: 70, maxAffinity: 40, source: '' })).toThrow(/起始/)
expect(resolvePortraitSlot(slots, 150)?.id).toBe('portrait-70-100')
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/portrait-slots.test.ts --maxWorkers=1 --minWorkers=1`

Expected: FAIL because `portrait-slots.ts` and `portraitSlots` do not exist.

- [ ] **Step 3: Implement the minimal pure functions**

```ts
export interface PortraitSlot {
  id: string
  minAffinity: number
  maxAffinity: number
  source: string
}

export function resolvePortraitSlot(slots: PortraitSlot[], affinity: number) {
  const value = Math.max(0, Math.min(100, Math.floor(affinity)))
  return slots.find((slot) => value >= slot.minAffinity && value <= slot.maxAffinity)
}
```

`insertPortraitSlot` 对每个旧槽保留 `[old.min, new.min - 1]` 和 `[new.max + 1, old.max]` 的非空部分，再插入新槽并排序；右侧分裂 ID 使用 `${old.id}-right-${start}`。`removePortraitSlot` 删除目标后让前一项扩展到目标终点，若无前项则让后一项从目标起点开始。`parsePortraitSlots` 严格校验完整覆盖和安全来源。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/portrait-slots.test.ts --maxWorkers=1 --minWorkers=1`

Expected: all Task 1 tests PASS.

---

### Task 2: 默认角色卡、内容包与旧数据迁移

**Files:**
- Modify: `src/sillytavern/defaults.ts`
- Modify: `src/sillytavern/defaults.test.ts`
- Modify: `src/sillytavern/content-pack.ts`
- Modify: `src/sillytavern/content-pack.test.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/sillytavern/repository.test.ts`
- Modify: `public/content/mistvale-content-pack.json`

**Interfaces:**
- Consumes: Task 1 `PortraitSlot` and migration helpers.
- Produces: all loaded and persisted `CharacterCard` values carry canonical `portraitSlots`.

- [ ] **Step 1: Write failing migration and validation tests**

```ts
expect(defaults.characters.every((card) => card.portraitSlots)).toBe(true)
expect(defaults.characters.every((card) => card.portraitSlots.length === 1)).toBe(true)
expect(defaults.characters.every((card) => card.portraitSlots[0].minAffinity === 0 && card.portraitSlots[0].maxAffinity === 100)).toBe(true)

const migrated = parseContentPack(legacyPack)
expect(migrated.characters[0]).not.toHaveProperty('portraitByAffinity')
expect(migrated.characters[0].portraitSlots).toEqual(expectedLegacySlots)

expect(() => parseContentPack(packWithOverlappingSlots)).toThrow(/立绘区间/)
```

Repository test stores a version-3 character with `portraitByAffinity.stranger`, initializes version 4, then asserts personality/lorebooks unchanged and one `0—100` slot retains the image.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/defaults.test.ts src/sillytavern/content-pack.test.ts src/sillytavern/repository.test.ts --maxWorkers=1 --minWorkers=1`

Expected: FAIL on missing `portraitSlots` and absent version-4 migration.

- [ ] **Step 3: Implement canonical defaults and repository migration**

Set `DEFAULT_CONTENT_VERSION = 4`. New character cards use `portraitSlots: createDefaultPortraitSlots(firstExistingNpcPortrait ?? '')`. `parseContentPack` accepts either valid `portraitSlots` or legacy `portraitByAffinity`, returns only canonical slots, and keeps the 12 MB pack check. Repository initialization normalizes every stored character once when `defaultContentVersion < 4`, preserving all non-portrait fields.

Update `public/content/mistvale-content-pack.json` characters to a single `portraitSlots` item and increase its content version.

- [ ] **Step 4: Run tests to verify GREEN**

Run: `pnpm exec vitest run --environment jsdom src/sillytavern/portrait-slots.test.ts src/sillytavern/defaults.test.ts src/sillytavern/content-pack.test.ts src/sillytavern/repository.test.ts --maxWorkers=1 --minWorkers=1`

Expected: all Task 1—2 tests PASS.

---

### Task 3: 场景按好感数值选择并持久化立绘

**Files:**
- Modify: `src/components/stage/LocationStage.tsx`
- Modify: `src/components/stage/LocationStage.test.tsx`
- Modify: `src/components/npc/NpcPortrait.tsx`
- Modify: `src/game/types.ts`
- Modify: `src/game/data.ts`

**Interfaces:**
- Consumes: Task 1 `resolvePortraitSlot`; Tavern `characters` and `saveCharacter`.
- Produces: gameplay portrait source selected by numeric affinity; scene quick upload persists to the matched slot.

- [ ] **Step 1: Write failing scene tests**

Render `LocationStage` with a Tavern character whose slots are `0—69` and `70—100`; set relationship affinity to 80 and assert the second source renders. Upload a WebP through “上传当前区间立绘”, then assert repository character slot source becomes a Data URL after save.

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm exec vitest run --environment jsdom src/components/stage/LocationStage.test.tsx --maxWorkers=1 --minWorkers=1`

Expected: FAIL because the scene ignores Tavern character cards and uses temporary Blob state.

- [ ] **Step 3: Connect the real Tavern character source**

Remove `LocationStage` Blob URL state. Resolve the current card by `npcId`, call `resolvePortraitSlot(card.portraitSlots, relationship.affinity)`, and pass its source and range to `NpcPortrait`. Scene upload reads a Data URL, replaces only that slot, awaits `tavern.saveCharacter`, and dispatches an internal success/error toast. Remove obsolete static `Npc.portraitByAffinity` data.

- [ ] **Step 4: Run scene tests to verify GREEN**

Run: `pnpm exec vitest run --environment jsdom src/components/stage/LocationStage.test.tsx src/components/npc/NpcPanel.test.tsx --maxWorkers=1 --minWorkers=1`

Expected: scene and NPC interaction tests PASS.

---

### Task 4: 区间槽位编辑器

**Files:**
- Create: `src/components/SillyTavern/editors/PortraitSlotEditor.tsx`
- Create: `src/components/SillyTavern/editors/PortraitSlotEditor.test.tsx`
- Modify: `src/components/SillyTavern/panels/CharacterPanel.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.test.tsx`
- Modify: `src/styles/sillytavern.css`

**Interfaces:**
- Consumes: Task 1 insert/remove helpers and `CharacterCard.portraitSlots`.
- Produces: `PortraitSlotEditor({ characterName, slots, onChange })`.

- [ ] **Step 1: Write failing editor behavior tests**

```ts
expect(screen.getAllByRole('group', { name: /好感 0—100/ })).toHaveLength(1)
await user.click(screen.getByRole('button', { name: '新增好感区间' }))
await user.clear(screen.getByLabelText('起始好感度'))
await user.type(screen.getByLabelText('起始好感度'), '70')
await user.clear(screen.getByLabelText('结束好感度'))
await user.type(screen.getByLabelText('结束好感度'), '100')
await user.click(screen.getByRole('button', { name: '创建区间槽位' }))
expect(screen.getByRole('group', { name: /好感 0—69/ })).toBeVisible()
expect(screen.getByRole('group', { name: /好感 70—100/ })).toBeVisible()
```

Separate tests assert `80—70` shows an inline error, upload updates only the selected range, and deleting a custom slot restores full coverage.

- [ ] **Step 2: Run tests to verify RED**

Run: `pnpm exec vitest run --environment jsdom src/components/SillyTavern/editors/PortraitSlotEditor.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx --maxWorkers=1 --minWorkers=1`

Expected: FAIL because the interval editor and controls do not exist.

- [ ] **Step 3: Implement the editor and replace five-stage UI**

Use a segmented 0—100 track and responsive slot cards. The add form is controlled string state so users can clear/type numeric values without forced zeroes; parse only on submit. Use native number inputs with `min=0`, `max=100`, `step=1`, `inputMode="numeric"`, visible labels, `role="alert"` inline errors, unique IDs, a Phosphor-backed add/remove icon, and 44px controls. New slots start empty and receive focus after creation.

CharacterPanel removes `AffinityStage` state and delegates slot edits/upload to `PortraitSlotEditor`. List thumbnails resolve affinity 0, then first non-empty source.

- [ ] **Step 4: Run editor tests to verify GREEN**

Run: `pnpm exec vitest run --environment jsdom src/components/SillyTavern/editors/PortraitSlotEditor.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx --maxWorkers=1 --minWorkers=1`

Expected: all editor and hub tests PASS.

---

### Task 5: 文案、发布格式与响应式验收

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-09-affinity-portrait-slots-design.md` only if implementation reveals a verified correction
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- Consumes: completed runtime and editor.
- Produces: accurate user instructions and verification evidence.

- [ ] **Step 1: Update documentation**

Document default `0—100`, “新增好感区间”, automatic split example `70—100 → 0—69 + 70—100`, persistence, 12 MB pack budget and legacy migration.

- [ ] **Step 2: Run full automated verification**

Run: `pnpm run test:run -- --maxWorkers=1 --minWorkers=1`

Expected: all test files PASS with zero failures.

Run: `pnpm run build`

Expected: TypeScript and Vite production build exit 0.

Run: `git diff --check`

Expected: exit 0 with no whitespace errors.

- [ ] **Step 3: Browser acceptance**

At 1440×1000 and 390×844: open Tavern → 角色卡 → first editor; verify one default slot, add 70—100, see 0—69 and 70—100, upload a file, save, close/reopen and refresh. Verify scene at matching affinity uses saved source. Record console errors, duplicate IDs and horizontal overflow; all counts must be zero.

- [ ] **Step 4: Commit and push**

Stage only files listed in Tasks 1—5, commit `feat: 添加好感度区间立绘槽位`, push `origin main`, then confirm `main...origin/main` is clean.
