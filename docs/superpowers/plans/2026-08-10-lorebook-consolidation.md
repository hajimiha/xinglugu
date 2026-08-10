# 默认世界书合册与预设槽位精简 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将四册系统默认世界书无损合并为一册，并移除预设角色槽位的可见控件而不破坏 SillyTavern 多分组兼容。

**Architecture:** 新增纯函数合册模块负责固定顺序、稳定 ID 与绑定映射；默认数据和 Dexie 迁移共同使用它。预设界面只编辑兼容层自动选中的默认分组，原始 `prompt_order` 其余分组不经重建或删除。

**Tech Stack:** React 19、TypeScript、Dexie、Vitest、Testing Library、Vite

## Global Constraints

- 纯前端，不增加后端或服务端存储。
- 不删改四册系统默认世界书的任何条目字段或正文。
- 不改动玩家自建世界书，且不复活玩家已删除的默认册。
- 保留 SillyTavern 预设多分组导入/导出兼容。
- 全中文界面，不使用 emoji，所有新增交互元素保持唯一描述性 ID。

---

### Task 1: 合册领域纯函数与默认内容

**Files:**
- Create: `src/sillytavern/lorebook-consolidation.ts`
- Modify: `src/sillytavern/defaults.ts`
- Test: `src/sillytavern/defaults.test.ts`

**Interfaces:**
- Produces: `LEGACY_MISTVALE_LOREBOOK_IDS`, `consolidateMistvaleLorebooks(books, updatedAt)`, `mapConsolidatedLorebookIds(ids)`。
- Consumes: 现有 `Lorebook` / `LorebookEntry` / `WORLD_RULES_ID` 类型与常量。

- [x] **Step 1: 写失败测试**：断言默认世界书数量为 1、条目 ID 顺序等于四册旧来源拼接、21 张角色卡和设置只绑定稳定主 ID。
- [x] **Step 2: 运行测试确认红灯**：`pnpm exec vitest run src/sillytavern/defaults.test.ts --maxWorkers=1 --minWorkers=1`，预期旧实现返回 4 册并失败。
- [x] **Step 3: 实现纯函数与默认合册**：把四个现有创建函数保留为条目来源，由合册函数直接拼接其 `entries`；默认导出仅返回合册。
- [x] **Step 4: 运行测试确认转绿**：重复 Task 1 定向命令。
- [x] **Step 5: 提交并推送**：提交领域与默认数据变更。

### Task 2: 旧设备无损迁移与内容包同步

**Files:**
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/sillytavern/repository.test.ts`
- Modify: `src/sillytavern/content-pack.test.ts`
- Modify: `public/content/mistvale-content-pack.json`

**Interfaces:**
- Consumes: Task 1 的合册和绑定映射函数。
- Produces: 默认内容版本 7 的事务迁移，以及只引用稳定合册 ID 的仓库内容包。

- [x] **Step 1: 写失败测试**：构造版本 6 数据库，保存四册的自定义字段/条目、第五本玩家世界书以及混合绑定；断言合册条目逐字段等于来源拼接、三册旧 ID 删除、玩家书保留、全部绑定映射去重。
- [x] **Step 2: 补充删除语义测试**：迁移前主动删除一册默认书，断言升级后不会恢复该册条目。
- [x] **Step 3: 运行测试确认红灯**：`pnpm exec vitest run src/sillytavern/repository.test.ts src/sillytavern/content-pack.test.ts --maxWorkers=1 --minWorkers=1`。
- [x] **Step 4: 实现事务迁移**：在版本 7 分支读取现存默认册、合册写入、删除三个旧 ID，并映射角色、会话、设置绑定；迁移在同一 Dexie 事务内完成。
- [x] **Step 5: 同步仓库包**：移除包内四册重复世界书，将六张伙伴卡的 `lorebookIds` 改为稳定主 ID；不提高内容包版本。
- [x] **Step 6: 运行测试确认转绿并提交推送**：执行 Task 2 定向命令后提交。

### Task 3: 移除预设角色槽位可见控件

**Files:**
- Modify: `src/components/SillyTavern/panels/PresetPanel.tsx`
- Test: `src/components/SillyTavern/TavernHubModal.test.tsx`

**Interfaces:**
- Consumes: `getPresetPromptOrder(settings)` 自动选择默认分组，`updatePresetPromptOrder` 只写回目标分组。
- Produces: 无槽位标签/选择框的预设界面，未选分组仍原样留在 `draft.settings.prompt_order`。

- [x] **Step 1: 写失败测试**：渲染含两个 `prompt_order` 分组的预设，断言不存在“预设角色槽位”和对应 select，保存后第二组原始数据仍存在。
- [x] **Step 2: 运行测试确认红灯**：`pnpm exec vitest run src/components/SillyTavern/TavernHubModal.test.tsx --maxWorkers=1 --minWorkers=1`。
- [x] **Step 3: 移除局部槽位 state、分组列表和 select**：始终通过 `getPresetPromptOrder(draft.settings)` 编辑兼容层默认组，并保留导出兼容说明。
- [x] **Step 4: 运行测试确认转绿并提交推送**：重复 Task 3 定向命令。

### Task 4: 全量验证与发布

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

**Interfaces:**
- Consumes: Tasks 1–3 的完整实现。
- Produces: 可复核的自动化与浏览器验收证据。

- [x] **Step 1: 运行全量测试**：`pnpm test:run`，预期全部通过。
- [x] **Step 2: 运行生产构建与差异检查**：`pnpm build`、`git diff --check`，预期成功且无空白错误。
- [x] **Step 3: 浏览器验收**：桌面 1440×1000 与手机 390×844 检查世界书只显示一册、预设无槽位控件、页面无横向溢出、控制台无错误。
- [x] **Step 4: 请求独立代码审查并修复 Important/Critical**：复核迁移数据完整性、幂等性和多分组兼容。
- [x] **Step 5: 更新计划记录、最终提交并推送 `origin/main`**。
