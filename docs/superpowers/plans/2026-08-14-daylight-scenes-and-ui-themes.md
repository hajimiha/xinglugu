# Daylight Scenes and UI Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-aware day/dusk/night scene assets and four persistent colorful UI themes without changing map geometry or save-game semantics.

**Architecture:** A pure scene-period module normalizes game minutes and resolves a typed three-variant asset set. All scene consumers call the same resolver. A small UI-theme module owns validated local persistence and applies semantic CSS variables through a root data attribute; SettingsModal only renders its controls.

**Tech Stack:** React 18, TypeScript, Vite asset imports, Vitest/Testing Library, CSS custom properties, browser localStorage, ImageGen-edited WebP assets.

## Global Constraints

- Day is 06:00–16:59, dusk is 17:00–19:59, night is 20:00–05:59.
- Preserve every scene object's position and the original aspect ratio.
- Use game time, never device time, for scene selection.
- UI theme is a local device preference and must survive refresh without entering save files.
- All interactive controls have unique descriptive IDs and mobile touch targets of at least 44px.
- Do not add runtime image-processing dependencies.

---

### Task 1: Pure scene-period resolver

**Files:**
- Create: `src/visual/scene-lighting.ts`
- Test: `src/visual/scene-lighting.test.ts`

**Interfaces:**
- Produces: `type ScenePeriod = 'day' | 'dusk' | 'night'`
- Produces: `getScenePeriod(minutes: number): ScenePeriod`
- Produces: `resolveSceneAsset(assets: SceneAssetSet, minutes: number): string`

- [ ] **Step 1: Write failing boundary tests** covering 359/360/1019/1020/1199/1200 and negative/overflow minutes.
- [ ] **Step 2: Run** `npm test -- --run src/visual/scene-lighting.test.ts` and confirm missing-module failure.
- [ ] **Step 3: Implement** minute normalization and typed asset resolution with `night` fallback.
- [ ] **Step 4: Run the test again** and confirm all boundary cases pass.

### Task 2: Typed scene asset registry and consumers

**Files:**
- Modify: `src/components/stage/location-scenes.ts`
- Modify: `src/components/stage/FarmStage.tsx`
- Modify: `src/components/stage/LocationStage.tsx`
- Modify: `src/components/shell/VillageMap.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Test: `src/components/stage/location-scenes.test.ts`

**Interfaces:**
- Consumes: `SceneAssetSet`, `resolveSceneAsset`
- Produces: `getLocationBackground(locationId: LocationId, minutes: number): string`
- Produces: `getVillageMapBackground(minutes: number): string`
- Produces: `preloadSceneAssets(urls: string[]): () => void`

- [ ] **Step 1: Write failing registry tests** for custom location, fallback atlas, farm, and each period.
- [ ] **Step 2: Run the targeted tests** and confirm the old one-argument API fails the new assertions.
- [ ] **Step 3: Import three variants per scene** and update all four visual consumers to pass `state.minutes`.
- [ ] **Step 4: Add adjacent-period preloading** with cleanup-safe image handlers.
- [ ] **Step 5: Run stage, map and dialogue tests** and update only assertions affected by the explicit time parameter.

### Task 3: Generate and validate scene variants

**Files:**
- Create: `src/assets/pixel/*-day.webp`
- Create: `src/assets/pixel/*-dusk.webp`
- Create: `scripts/validate-scene-variants.mjs`

**Interfaces:**
- Consumes: source night WebP files.
- Produces: two same-dimension WebP variants for each source asset.

- [ ] **Step 1: Inspect every source scene** before editing.
- [ ] **Step 2: Use ImageGen edit mode** with prompts that lock composition and change only light/color.
- [ ] **Step 3: Convert generated images to optimized WebP** at source dimensions without changing the aspect ratio.
- [ ] **Step 4: Implement validator** that asserts every registry path exists and dimensions equal its source.
- [ ] **Step 5: Run** `node scripts/validate-scene-variants.mjs` and visually inspect representative map, exterior, and interior variants.

### Task 4: Persistent UI theme controller

**Files:**
- Create: `src/visual/ui-theme.ts`
- Create: `src/visual/UiThemeContext.tsx`
- Test: `src/visual/ui-theme.test.ts`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `type UiThemeId = 'forest' | 'tide' | 'wisteria' | 'blossom'`
- Produces: `readStoredUiTheme(storage?: Storage): UiThemeId`
- Produces: `UiThemeProvider` and `useUiTheme()`.

- [ ] **Step 1: Write failing tests** for valid persistence, unknown values, and throwing Storage implementations.
- [ ] **Step 2: Run targeted tests** and confirm missing-module failure.
- [ ] **Step 3: Implement validated storage helpers and provider** that applies `data-ui-theme` in an effect.
- [ ] **Step 4: Wrap the application** so title screen, modals, tavern and game share one theme.
- [ ] **Step 5: Run the tests** and confirm safe fallback behavior.

### Task 5: Theme tokens and Settings UI

**Files:**
- Modify: `src/styles/tokens.css`
- Modify: `src/styles/global.css`
- Modify: `src/styles/sillytavern.css`
- Modify: `src/styles/workshop.css`
- Modify: `src/components/modals/SettingsModal.tsx`
- Modify: `src/components/modals/SettingsModal.test.tsx`

**Interfaces:**
- Consumes: `useUiTheme`, the four theme metadata records.
- Produces: immediate visual preview and persisted selection from unique radio IDs.

- [ ] **Step 1: Write failing SettingsModal test** that selects `潮汐蓝晶` and asserts root attribute plus storage.
- [ ] **Step 2: Define semantic chroma/surface variables** for all four themes while preserving readable text contrast.
- [ ] **Step 3: Add a responsive theme-card section** before audio settings with labels, palette swatches and checked states.
- [ ] **Step 4: Replace the highest-level hardcoded green surfaces** with semantic variables across game, tavern and workshop shells.
- [ ] **Step 5: Run Settings and accessibility-oriented component tests.**

### Task 6: Verification and delivery

**Files:**
- Modify: `.planning/daylight-themes/progress.md`

**Interfaces:**
- Consumes: all implementation tasks.
- Produces: verified commit pushed to `origin/main`.

- [ ] **Step 1: Run** targeted visual/theme suites, then `npm test -- --run`.
- [ ] **Step 2: Run** `npm run build` and `git diff --check`.
- [ ] **Step 3: Launch production preview** and exercise 05:59/06:00, 16:59/17:00 and 19:59/20:00 at desktop and mobile viewports.
- [ ] **Step 4: Inspect generated images and responsive screenshots** for geometry drift, unreadable overlays and horizontal overflow.
- [ ] **Step 5: Commit all scoped files and push `main` to GitHub.**

