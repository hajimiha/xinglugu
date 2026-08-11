# 《性撸谷物语》开始界面与品牌迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使用玩家提供的横竖封面让每次加载先进入可操作标题界面，并把全部玩家可见“雾灯谷”品牌安全迁移为“性撸谷”。

**Architecture:** `App` 保留现有 Provider 初始化，但用启动层状态在进入游戏前隔离 `.game-shell`。`TitleScreen` 以完整比例画布承载 `<picture>` 和四个真实按钮热点；本地存档中心、设置与酒馆工坊通过独立启动层模态打开。品牌文本集中在 `branding.ts`，默认酒馆内容通过 v7→v8 迁移更新稳定系统资源，同时保留所有 `mistvale-*` 持久化 ID。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Testing Library、Dexie、Pillow WebP 转换、现有 Phosphor 图标与 CSS tokens。

## Global Constraints

- 使用 `E:\ai跑图整理12\4706.png`（1672×941）和 `E:\ai跑图整理12\4707.png`（941×1672），不调用 ImageGen、不裁切、不拉伸。
- 发布资产为 `src/assets/xinglugu-title-desktop.webp` 与 `src/assets/xinglugu-title-mobile.webp`；保持原始像素尺寸。
- 第二块木牌视觉文字“继续游戏”打开本地、云端和 JSON 三来源存档中心；本计划先交付本地和 JSON，云端卡片由后一计划接入。
- 所有交互元素使用唯一描述性 ID、真实 `<button>`、可见焦点和至少 44×44px 热点；禁止 emoji。
- 手机使用 `100dvh` 与 safe-area，375×667、390×844、768×1024、1440×900 不得产生页面横向滚动。
- 只替换玩家可见品牌；`mistvale-game-save-*`、Dexie 名称、世界书/预设/角色稳定 ID 和 `public/content/mistvale-content-pack.json` 路径必须保留。
- 每个生产行为先写失败测试并确认 RED，再做最小实现并确认 GREEN。

---

### Task 1: 标题画布与四个语义热点

**Files:**
- Create: `src/start/TitleScreen.tsx`
- Create: `src/start/TitleScreen.test.tsx`
- Create: `src/assets/xinglugu-title-desktop.webp`
- Create: `src/assets/xinglugu-title-mobile.webp`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `hasLocalSave: boolean`、四个无参数回调。
- Produces: `TitleScreenProps` 与固定按钮 ID `title-start-game`、`title-load-save`、`title-workshop`、`title-settings`。

- [ ] **Step 1: 写标题界面失败测试**

```tsx
import '../test/setup'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TitleScreen } from './TitleScreen'

it('以完整封面和四个真实按钮路由启动操作', async () => {
  const user = userEvent.setup()
  const actions = { onStart: vi.fn(), onLoad: vi.fn(), onWorkshop: vi.fn(), onSettings: vi.fn() }
  render(<TitleScreen hasLocalSave {...actions} />)
  expect(screen.getByRole('heading', { level: 1, name: '性撸谷物语' })).toBeInTheDocument()
  expect(screen.getByAltText('性撸谷物语像素农场封面')).toHaveAttribute('width', '1672')
  for (const name of ['开始游戏', '继续游戏并读取存档', '创意工坊', '设置']) await user.click(screen.getByRole('button', { name }))
  expect(Object.values(actions).every((callback) => callback.mock.calls.length === 1)).toBe(true)
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/start/TitleScreen.test.tsx`

Expected: FAIL，原因是 `./TitleScreen` 不存在。

- [ ] **Step 3: 转换并核验 WebP 资源**

Run:

```powershell
& 'C:\Users\qixin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -c "from PIL import Image; pairs=[(r'E:\ai跑图整理12\4706.png',r'src/assets/xinglugu-title-desktop.webp'),(r'E:\ai跑图整理12\4707.png',r'src/assets/xinglugu-title-mobile.webp')]; [(lambda im,dst: im.save(dst,'WEBP',quality=88,method=6))(Image.open(src).convert('RGB'),dst) for src,dst in pairs]"
```

Expected: 两个文件分别解码为 1672×941 和 941×1672，单文件小于原 PNG。

- [ ] **Step 4: 实现最小标题组件**

```tsx
export interface TitleScreenProps {
  hasLocalSave: boolean
  onStart(): void
  onLoad(): void
  onWorkshop(): void
  onSettings(): void
}

export function TitleScreen(props: TitleScreenProps) {
  return <main id="game-title-screen" className="title-screen">
    <h1 className="visually-hidden">性撸谷物语</h1>
    <div className="title-artboard">
      <picture>
        <source media="(orientation: portrait)" srcSet={mobileCover} />
        <img src={desktopCover} width="1672" height="941" alt="性撸谷物语像素农场封面" />
      </picture>
      <nav aria-label="游戏开始菜单" className="title-menu-hotspots">
        <button id="title-start-game" type="button" onClick={props.onStart}><span className="visually-hidden">开始游戏</span></button>
        <button id="title-load-save" type="button" aria-label="继续游戏并读取存档" onClick={props.onLoad} />
        <button id="title-workshop" type="button" onClick={props.onWorkshop}><span className="visually-hidden">创意工坊</span></button>
        <button id="title-settings" type="button" onClick={props.onSettings}><span className="visually-hidden">设置</span></button>
      </nav>
    </div>
  </main>
}
```

CSS 使用 `width:min(100vw,calc(100dvh * 1672 / 941))` 的横屏完整画布和竖屏等价比例；热点通过百分比坐标覆盖木牌，焦点/悬停只改变 outline、filter、box-shadow 与 transform。

- [ ] **Step 5: 运行 GREEN 和尺寸核验**

Run: `pnpm test:run -- src/start/TitleScreen.test.tsx`

Expected: PASS。

- [ ] **Step 6: 提交并推送**

```powershell
git add src/start/TitleScreen.tsx src/start/TitleScreen.test.tsx src/assets/xinglugu-title-desktop.webp src/assets/xinglugu-title-mobile.webp src/styles/global.css
git commit -m "feat: add responsive game title screen"
git push origin main
```

### Task 2: 启动层状态、本地存档中心与封面模态

**Files:**
- Create: `src/start/StartLayer.tsx`
- Create: `src/start/StartLayer.test.tsx`
- Create: `src/start/SaveCenterModal.tsx`
- Create: `src/start/StartModalFrame.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.tsx`
- Modify: `src/components/modals/SettingsModal.tsx`
- Modify: `src/components/modals/ModalHost.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `GameContextValue` 现有导入/导出/保存元数据。
- Produces: `StartLayer`，`TavernHubModal({ onClose, initialTab? })`，`SettingsModal({ onReturnToTitle? })`。

- [ ] **Step 1: 写启动隔离与本地读取失败测试**

```tsx
it('首次挂载不渲染游戏 shell，开始后才进入游戏', async () => {
  const user = userEvent.setup()
  render(<App />)
  expect(document.querySelector('.game-shell')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '开始游戏' }))
  expect(document.querySelector('.game-shell')).toBeInTheDocument()
})

it('继续游戏打开应用内存档中心并支持 JSON 导入', async () => {
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '继续游戏并读取存档' }))
  expect(screen.getByRole('dialog', { name: '读取游戏存档' })).toHaveTextContent('本地存档')
  expect(screen.getByLabelText('导入 JSON 存档')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/start/StartLayer.test.tsx`

Expected: FAIL，当前 `App` 立即渲染 `.game-shell` 且没有存档中心。

- [ ] **Step 3: 实现启动状态机与独立模态框**

```ts
export type StartView = 'title' | 'game'
export type StartModal = null | 'load' | 'workshop' | 'settings'
```

`StartLayer` 默认 `{ view:'title', modal:null }`；开始按钮仅切换到 game，不重置存档；继续按钮打开 `SaveCenterModal`；工坊懒加载 `TavernHubModal initialTab="lorebooks"`；设置复用 `SettingsModal`。Escape 和关闭按钮返回标题，模态打开时焦点进入面板、关闭后回触发按钮。

- [ ] **Step 4: 增加游戏内返回标题入口**

`SettingsModal` 在收到 `onReturnToTitle` 时显示唯一 ID `settings-return-title`；`ModalHost` 从 `AppContent` 接收该回调。点击只关闭模态并显示标题，不调用 `resetGameSave`。

- [ ] **Step 5: 运行 GREEN**

Run: `pnpm test:run -- src/start/StartLayer.test.tsx src/components/modals/SettingsModal.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx`

Expected: PASS；旧设置/工坊测试无回归。

- [ ] **Step 6: 提交并推送**

```powershell
git add src/App.tsx src/start src/components/SillyTavern/TavernHubModal.tsx src/components/modals/SettingsModal.tsx src/components/modals/ModalHost.tsx src/styles/global.css
git commit -m "feat: gate gameplay behind the title menu"
git push origin main
```

### Task 3: 玩家可见品牌单一真源与运行时替换

**Files:**
- Create: `src/branding.ts`
- Create: `src/branding.test.tsx`
- Modify: `index.html`
- Modify: `README.md`
- Modify: `src/components/onboarding/PlayerNameGate.tsx`
- Modify: `src/components/shell/TopHud.tsx`
- Modify: `src/components/shell/VillageMap.tsx`
- Modify: `src/components/shell/ContextRail.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.tsx`
- Modify: `src/components/modals/ModalHost.tsx`
- Modify: `src/components/modals/SettingsModal.tsx`
- Modify: `src/components/modals/InventoryModal.tsx`
- Modify: `src/game/data.ts`
- Modify: `src/game/economy.ts`
- Modify: `src/sillytavern/protocol-adapters.ts`

**Interfaces:**
- Produces: `GAME_TITLE='性撸谷物语'`、`WORLD_NAME='性撸谷'`、`TAVERN_TITLE='性撸谷酒馆中枢'`、`TITLE_SAVE_FILE_PREFIX='性撸谷存档'`。

- [ ] **Step 1: 写玩家可见行为失败测试**

```tsx
it('HUD、地图与酒馆显示新品牌', () => {
  render(<GameProvider initialState={initialGameState}><TopHud /><VillageMap /></GameProvider>)
  expect(screen.getByText('性撸谷物语')).toBeVisible()
  expect(screen.getByRole('region', { name: '可拖动的性撸谷地图' })).toBeInTheDocument()
})
```

并在 TavernHub 真实组件测试中断言 `性撸谷酒馆中枢`。

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/branding.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx`

Expected: FAIL，当前渲染旧品牌。

- [ ] **Step 3: 增加品牌常量并替换玩家可见文本**

保留所有类名、函数名、数据库名和 ID 中的 Mistvale；只改 UI 文案、页面 metadata、导出文件名、OpenRouter `X-Title` 和 README 当前说明。

- [ ] **Step 4: 运行 GREEN 并扫描残留**

Run: `pnpm test:run -- src/branding.test.tsx src/components/SillyTavern/TavernHubModal.test.tsx`

Then: `rg -n "雾灯谷|雾灯酒馆|雾灯谷纪事" src public index.html README.md --glob '!**/*.test.*'`

Expected: 测试 PASS；扫描仅允许设计/迁移兼容代码中显式列出的旧短语，不允许玩家当前文案残留。

- [ ] **Step 5: 提交并推送**

```powershell
git add index.html README.md src
git commit -m "feat: rename the visible world to xinglugu"
git push origin main
```

### Task 4: 默认世界书、预设与角色 v8 品牌迁移

**Files:**
- Create: `src/sillytavern/branding-migration.ts`
- Create: `src/sillytavern/branding-migration.test.ts`
- Modify: `src/sillytavern/defaults.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/sillytavern/defaults.test.ts`
- Modify: `src/sillytavern/repository.test.ts`

**Interfaces:**
- Produces: `migrateSystemBranding<T>(value:T):T` 仅替换精确短语；`DEFAULT_CONTENT_VERSION=8`。

- [ ] **Step 1: 写迁移失败测试**

```ts
it('把 v7 系统书和预设迁移为性撸谷但保留自建资源与稳定 ID', async () => {
  const db = createTavernDatabase('branding-v8-test')
  await seedVersionSevenDefaults(db)
  await db.lorebooks.add(customLorebookNamed('雾灯是我的自定义词'))
  await createTavernRepository(db, async () => null).initialize()
  expect((await db.lorebooks.get('mistvale-world-rules'))?.name).toBe('性撸谷·全域设定集')
  expect((await db.presets.get('mistvale-preset-narrative'))?.name).toContain('性撸谷')
  expect(await db.lorebooks.get('custom-book')).toHaveProperty('name', '雾灯是我的自定义词')
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/sillytavern/branding-migration.test.ts src/sillytavern/defaults.test.ts src/sillytavern/repository.test.ts`

Expected: FAIL，新品牌与 v8 迁移不存在。

- [ ] **Step 3: 实现精确系统迁移**

精确映射：`雾灯谷纪事→性撸谷物语`、`雾灯酒馆→性撸谷酒馆`、`雾灯谷→性撸谷`、`雾灯叙事预设→性撸谷叙事预设`。只对 `WORLD_RULES_ID`、`mistvale-preset-narrative` 和 `mistvale-character-*` 系统记录执行；自建 ID 不处理。兼容 `compatibility.raw` 不做深度改写，避免破坏外部无损导出。

- [ ] **Step 4: 运行 GREEN**

Run: `pnpm test:run -- src/sillytavern/branding-migration.test.ts src/sillytavern/defaults.test.ts src/sillytavern/repository.test.ts`

Expected: PASS，默认书仍为一册且条目数量/ID 不变。

- [ ] **Step 5: 提交并推送**

```powershell
git add src/sillytavern
git commit -m "feat: migrate default tavern branding"
git push origin main
```

### Task 5: 标题与品牌阶段全量验收

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: 运行全量自动化检查**

```powershell
pnpm test:run
pnpm build
git diff --check
```

Expected: 全部 PASS，构建产物包含两个 WebP 和新品牌，不包含旧玩家可见品牌。

- [ ] **Step 2: 浏览器验收**

在 1440×900、390×844、375×667 检查：首次只显示标题页；四热点与木牌完全对齐；键盘 Tab/Enter 可用；设置/工坊/继续游戏打开应用内模态；返回标题不丢进度；横竖旋转后切换正确素材；控制台 0 error、无重复 ID、无横向滚动。

- [ ] **Step 3: 更新记录、提交并推送**

```powershell
git add task_plan.md findings.md progress.md
git commit -m "docs: record title screen and branding acceptance"
git push origin main
```
