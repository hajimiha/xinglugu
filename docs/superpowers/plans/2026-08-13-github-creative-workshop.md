# GitHub 创意工坊与奶牛娘立绘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把标题页创意工坊升级为独立的 GitHub 联网资源市场，并将 `4718.jpg` 安全处理为奶牛娘透明立绘。

**Architecture:** 作者的资源包保存在自己的公开 Gist；一个部署配置的公共目录 Gist使用结构化评论事件记录发布、更新、撤回和收藏，服务端按 GitHub 作者与资源 owner 校验后折叠为目录。React 工坊客户端匿名浏览、登录发布，并通过 `TavernContext` 的已有读写接口执行预览式本地安装。

**Tech Stack:** React 18、TypeScript、Vite、Vercel Functions、GitHub OAuth/Gist REST、Dexie、Vitest、Testing Library、Pillow。

## Global Constraints

- OAuth 继续只申请 `gist`，不得申请 `public_repo` 或 `repo`。
- 浏览器不得接触 GitHub token；所有写操作使用 HttpOnly 会话并校验同源 Origin。
- 单包总上限 8 MiB；世界书和预设上限 2 MiB；立绘组最多 12 个角色、每个角色最多 8 个区间。
- 安装不得覆盖同名世界书/预设；立绘组只更新匹配 `npcId` 的立绘槽。
- 不使用 emoji；所有交互元素具有唯一、描述性 ID 和至少 44px 触控区域。
- 所有功能先写失败测试并观察预期失败，最终提交并推送 `main`。

---

### Task 1: 工坊资源包与目录折叠合约

**Files:**
- Create: `src/workshop/types.ts`
- Create: `src/workshop/package-schema.ts`
- Create: `src/workshop/catalog.ts`
- Test: `src/workshop/package-schema.test.ts`
- Test: `src/workshop/catalog.test.ts`

**Interfaces:**
- Produces: `WorkshopPackage`, `WorkshopKind`, `WorkshopCatalogItem`, `WorkshopCatalogEvent`。
- Produces: `parseWorkshopPackage(value, byteLimit?)`, `foldWorkshopCatalog(events)`, `sortWorkshopItems(items, sort)`。

- [ ] **Step 1: 写资源包失败测试**：分别构造合法世界书、预设、立绘组；断言危险图片 URL、重叠好感区间、禁止字段、文本/标签/体积越界被拒绝。
- [ ] **Step 2: 运行 `pnpm test:run -- src/workshop/package-schema.test.ts`**，确认因模块缺失失败。
- [ ] **Step 3: 实现严格 discriminated union 与逐字段解析**，立绘源只接受安全的 `data:image/(png|webp)` 或 HTTPS，复用 `importLorebook`、`importPreset` 和 `normalizePortraitSlots` 做深层兼容校验。
- [ ] **Step 4: 运行资源包测试并确认通过**。
- [ ] **Step 5: 写目录折叠失败测试**：同作者发布/更新/撤回、错误作者更新被忽略、revision 冲突、收藏去重、近期热门/总热度/最新/更新排序。
- [ ] **Step 6: 运行 `pnpm test:run -- src/workshop/catalog.test.ts`**，确认因实现缺失失败。
- [ ] **Step 7: 实现纯函数目录折叠与排序**，不信任客户端作者、热度和审核字段。
- [ ] **Step 8: 运行两个测试文件并提交 `feat: define workshop package contract`**。

### Task 2: GitHub Gist 工坊网关

**Files:**
- Create: `api/_lib/workshop-github.ts`
- Create: `api/_lib/workshop-github.test.ts`
- Create: `api/workshop/catalog.ts`
- Create: `api/workshop/package.ts`
- Create: `api/workshop/publish.ts`
- Create: `api/workshop/favorite.ts`
- Create: `api/workshop/mine.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `WorkshopPackage`, `WorkshopCatalogEvent` JSON contract from Task 1（API 端使用同构纯类型/解析器）。
- Produces: `/api/workshop/catalog`, `/api/workshop/package?id=`, `/api/workshop/mine`, `/api/workshop/publish`, `/api/workshop/favorite`。

- [ ] **Step 1: 写 GitHub 网关失败测试**：分页读目录评论、校验资源 Gist owner、处理 truncated raw、创建公开 Gist、追加事件、撤回和收藏。
- [ ] **Step 2: 运行 `pnpm test:run -- api/_lib/workshop-github.test.ts`**，确认模块缺失失败。
- [ ] **Step 3: 实现可注入 fetch 的 GitHub 网关**；固定 API 版本、User-Agent、错误归一化和响应体上限，不记录 token 或包体。
- [ ] **Step 4: 运行网关测试并确认通过**。
- [ ] **Step 5: 写 API handler 失败测试**：匿名只读、未登录写入 401、未配置目录 503、跨源写入 403、非法包 400、资源 owner 不符 403、成功发布返回目录条目。
- [ ] **Step 6: 实现 handler**：从现有加密 Cookie 取会话，资源写作者公开 Gist，目录事件写入 `XINGLUGU_WORKSHOP_CATALOG_GIST_ID` 指向的公共 Gist 评论。
- [ ] **Step 7: 更新 `.env.example` 与 README**，说明目录 Gist 的创建、公开性、OAuth 回调和验证步骤。
- [ ] **Step 8: 运行 `pnpm typecheck:api` 与 API 测试并提交 `feat: add github workshop gateway`**。

### Task 3: 浏览器工坊客户端与安全安装

**Files:**
- Create: `src/workshop/workshop-client.ts`
- Create: `src/workshop/workshop-client.test.ts`
- Create: `src/workshop/install-package.ts`
- Create: `src/workshop/install-package.test.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/tavern/TavernContext.test.tsx`

**Interfaces:**
- Produces: `createWorkshopClient(fetcher)` 的 `list/detail/mine/publish/update/withdraw/favorite/download`。
- Produces: `previewWorkshopInstall(pkg, localState)` 与 `installWorkshopPackage(pkg, adapter)`。
- TavernContext produces: `installWorkshopPackage(pkg): Promise<WorkshopInstallResult>`。

- [ ] **Step 1: 写客户端失败测试**：credentials same-origin、查询排序/筛选编码、发布 JSON、错误码中文映射、下载 Blob。
- [ ] **Step 2: 运行客户端测试确认预期失败**。
- [ ] **Step 3: 实现客户端并通过测试**。
- [ ] **Step 4: 写安装失败测试**：世界书/预设新 UUID 不覆盖、立绘包只改匹配角色、缺失角色跳过、保存中途失败恢复之前角色。
- [ ] **Step 5: 运行安装测试确认预期失败**。
- [ ] **Step 6: 实现预览与补偿事务，并由 TavernContext 暴露安装入口和状态刷新**。
- [ ] **Step 7: 运行客户端、安装与 TavernContext 测试并提交 `feat: add workshop client and safe installs`**。

### Task 4: 独立创意工坊界面

**Files:**
- Create: `src/workshop/WorkshopHub.tsx`
- Create: `src/workshop/WorkshopHub.test.tsx`
- Create: `src/workshop/WorkshopCard.tsx`
- Create: `src/workshop/WorkshopDetail.tsx`
- Create: `src/workshop/WorkshopPublisher.tsx`
- Create: `src/workshop/useWorkshop.ts`
- Modify: `src/start/StartLayer.tsx`
- Modify: `src/start/StartLayer.test.tsx`
- Modify: `src/start/StartModalFrame.tsx`
- Modify: `src/components/icons/GameIcon.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `CloudSaveController.account/loginUrl`, `useTavern()`, `workshopClient`。
- Produces: 全屏 `WorkshopHub`，固定元素 ID 前缀 `workshop-`。

- [ ] **Step 1: 写启动层失败测试**：点击创意工坊出现“发现 / 我的发布 / 发布资源”，且不存在酒馆中枢标题。
- [ ] **Step 2: 运行启动层测试并确认失败，因为现入口仍渲染 TavernHubModal**。
- [ ] **Step 3: 写 WorkshopHub 失败测试**：加载骨架、空结果建议、搜索、类型筛选、四种排序、详情、下载、安装确认、登录门槛、发布表单校验和双击防护。
- [ ] **Step 4: 运行组件测试并确认模块缺失失败**。
- [ ] **Step 5: 实现 `useWorkshop` 状态机和发现/详情组件**，图片懒加载、错误状态保留重试、`useDeferredValue` 处理搜索。
- [ ] **Step 6: 实现发布器**：从本地世界书、预设、角色立绘选择数据，填写标题/简介/版本/标签，实时显示包体大小与公开警告。
- [ ] **Step 7: 替换 StartLayer 临时入口，扩展 StartModalFrame 的全屏工坊布局和 Esc/焦点回收**。
- [ ] **Step 8: 添加桌面三栏、平板双栏、375px 单列与安全区 CSS；所有动效提供 reduced-motion 降级**。
- [ ] **Step 9: 运行工坊、启动层和可访问性测试并提交 `feat: build standalone creative workshop`**。

### Task 5: 奶牛娘透明立绘

**Files:**
- Modify: `public/assets/portraits/generated/cow-girl.png`
- Test: `src/components/stage/LocationStage.portrait.test.tsx`
- Verify: `public/content/mistvale-content-pack.json`

**Interfaces:**
- Consumes: `E:/ai跑图整理12/4718.jpg`。
- Produces: RGBA PNG，默认内容包继续引用 `./assets/portraits/generated/cow-girl.png`。

- [ ] **Step 1: 在立绘测试加入资源断言**：路径存在、扩展名为 PNG、角色卡选择 `cow-girl` 时使用该路径。
- [ ] **Step 2: 运行定向测试并记录当前旧资源哈希不符合新输入的失败夹具**。
- [ ] **Step 3: 使用 Pillow 计算棋盘格背景模型并从边缘 flood-fill，只将连通背景设为 Alpha 0；不改角色 RGB**。
- [ ] **Step 4: 校验输出 mode=RGBA、四角 alpha=0、主体不透明覆盖率合理、尺寸适合移动端，并用 `view_image` 视觉检查**。
- [ ] **Step 5: 运行立绘/内容包测试并提交 `feat: use supplied cow girl portrait`**。

### Task 6: 全面验证、评审、推送与线上核验

**Files:**
- Modify: `.planning/workshop-sharing/task_plan.md`
- Modify: `.planning/workshop-sharing/progress.md`

**Interfaces:**
- Consumes: Tasks 1–5 全部产物。
- Produces: 可发布的 main revision 和线上验证记录。

- [ ] **Step 1: 运行 `pnpm typecheck:api`、全部工坊测试、`pnpm test:run`、`pnpm build` 和 `git diff --check`**。
- [ ] **Step 2: 运行 UI Pro Max 的 UX validation 查询，按 375/768/1024/1440 和 reduced-motion 检查工坊布局**。
- [ ] **Step 3: 使用 requesting-code-review 技能请求独立审查，修复所有 Critical/Important 后重跑验证**。
- [ ] **Step 4: 检查 diff 不含密钥、Cookie、用户数据、生成临时文件或无关改动**。
- [ ] **Step 5: 提交剩余文档，`git push origin main`**。
- [ ] **Step 6: 等待 Vercel 部署并只读核验标题页创意工坊、匿名目录降级、GitHub 登录链接、奶牛娘资源和移动端布局**；未配置目录 Gist 时报告明确的环境变量阻塞，不伪称联网发布成功。

