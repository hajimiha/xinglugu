# GitHub 登录与本地/云端双存档 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在保持本地自动存档可离线使用的前提下，通过 GitHub OAuth 与玩家私有 Gist 提供可选择、可冲突恢复的云存档。

**Architecture:** 浏览器只持有 HttpOnly 加密会话和可读 CSRF token，不接触 GitHub access token。Vercel Functions 完成 OAuth code 交换、用户身份复核与 Gist 代理；客户端 `AuthContext` 管身份，`CloudSaveContext` 串行管理读取/上传/冲突，`SaveCenterModal` 统一呈现本地、云端、覆盖前恢复槽和 JSON 导入。服务器与客户端共享严格的 `CloudSaveDocument` 结构，但游戏状态最终仍由 `parseGameSave` 净化。

**Tech Stack:** React 18、TypeScript Web APIs、Vercel Node.js Functions、GitHub OAuth/Gist REST、Web Crypto AES-GCM、Vitest、Testing Library。

## Global Constraints

- GitHub OAuth 只申请 `gist` scope，不申请 `repo`、邮箱或仓库权限。
- `GITHUB_CLIENT_SECRET`、access token 与 `XINGLUGU_SESSION_SECRET` 只能存在于 Serverless 环境或加密 HttpOnly Cookie，永不进入 Vite bundle、localStorage、日志或游戏存档。
- OAuth 使用不可预测 `state`、S256 PKCE 和 10 分钟临时 Cookie；每次 token 交换后调用 `GET https://api.github.com/user` 验证数字 user id。
- 修改请求同时验证 `Origin === XINGLUGU_APP_ORIGIN` 与 `X-CSRF-Token`；云存档请求体最大 512 KiB。
- 私有 Gist description 固定为 `性撸谷物语云存档 · xinglugu-cloud-save-v1`，文件名固定为 `xinglugu-save-v1.json`。
- 云端失败、未配置、未登录和离线永不删除或回滚本地存档；读取云端前创建 `mistvale-game-save-backup-before-cloud-v1` 恢复槽。
- Gist revision 比对是尽力而为的乐观冲突检测，不在 UI 中宣称原子写入；409 必须保留两端并要求选择。
- 每个生产行为先写失败测试并确认 RED，再做最小实现并确认 GREEN。

---

### Task 1: 云存档契约、恢复槽与浏览器客户端

**Files:**
- Create: `src/cloud/cloud-save-types.ts`
- Create: `src/cloud/cloud-save-types.test.ts`
- Create: `src/cloud/cloud-save-client.ts`
- Create: `src/cloud/cloud-save-client.test.ts`
- Modify: `src/game/game-save-storage.ts`
- Modify: `src/game/game-save-storage.test.ts`
- Modify: `src/game/GameContext.tsx`
- Modify: `src/game/GameContext.test.tsx`

**Interfaces:**
- Produces: `CloudSaveDocument`、`CloudSaveSnapshot`、`CloudSaveConflict`、`parseCloudSaveDocument(value)`、`cloudSaveClient`。
- Produces: `GAME_SAVE_CLOUD_BACKUP_KEY`、`backupCurrentGameSave(storage)`、`loadCloudBackup(storage)`、`restoreCloudBackup()`。

- [ ] **Step 1: 写契约和恢复槽失败测试**

```ts
it('拒绝 owner、版本或游戏信封不合法的云存档', () => {
  expect(parseCloudSaveDocument({ cloudSchemaVersion: 1, ownerGithubId: -1 })).toBeNull()
  expect(parseCloudSaveDocument(validCloudDocument)).toEqual(validCloudDocument)
})

it('读取云端前保存并可恢复原本地信封', () => {
  localStorage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify(localEnvelope))
  expect(backupCurrentGameSave(localStorage)?.savedAt).toBe(localEnvelope.savedAt)
  localStorage.setItem(GAME_SAVE_STORAGE_KEY, JSON.stringify(cloudEnvelope))
  expect(restoreCloudBackup(localStorage)?.savedAt).toBe(localEnvelope.savedAt)
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/cloud/cloud-save-types.test.ts src/cloud/cloud-save-client.test.ts src/game/game-save-storage.test.ts src/game/GameContext.test.tsx`

Expected: FAIL，新模块和恢复槽函数不存在。

- [ ] **Step 3: 实现严格解析与客户端错误类型**

```ts
export interface CloudSaveDocument {
  cloudSchemaVersion: 1
  ownerGithubId: number
  game: GameSaveEnvelope
  clientSavedAt: number
  deviceId: string
}

export class CloudSaveError extends Error {
  constructor(public code: CloudSaveErrorCode, message: string, public status?: number) { super(message) }
}
```

`parseCloudSaveDocument` 对每个外层字段逐项校验，再用 `parseGameSave(JSON.stringify(value.game))` 得到净化信封；`cloudSaveClient` 所有请求使用 `credentials:'same-origin'`、8 秒 AbortController、有限错误码与 `X-CSRF-Token`。

- [ ] **Step 4: 扩展 GameContext 的安全替换边界**

增加 `getCurrentSaveEnvelope()`、`replaceGameSaveEnvelope(envelope,{backupCurrent})`、`restorePreCloudBackup()`；替换只能接受已由 `parseGameSave` 返回的信封。现有 `importGameSave` 调用同一实现。

- [ ] **Step 5: 运行 GREEN**

Run: `pnpm test:run -- src/cloud/cloud-save-types.test.ts src/cloud/cloud-save-client.test.ts src/game/game-save-storage.test.ts src/game/GameContext.test.tsx`

Expected: PASS；SecurityError 存储夹具仍安全降级。

- [ ] **Step 6: 提交并推送**

```powershell
git add src/cloud src/game/game-save-storage.ts src/game/game-save-storage.test.ts src/game/GameContext.tsx src/game/GameContext.test.tsx
git commit -m "feat: add safe cloud save contracts"
git push origin main
```

### Task 2: Serverless 加密会话、HTTP 防护与 GitHub 网关

**Files:**
- Create: `server/env.ts`
- Create: `server/auth.ts`
- Create: `server/auth.test.ts`
- Create: `server/http.ts`
- Create: `server/http.test.ts`
- Create: `server/github.ts`
- Create: `server/github.test.ts`
- Create: `tsconfig.api.json`
- Modify: `package.json`

**Interfaces:**
- Produces: `getServerConfig()`、`sealCookie(value, secret)`、`openCookie<T>()`、`createOAuthState()`、`readSession(request)`、`assertMutationRequest(request,session)`。
- Produces: `GitHubGateway` 的 token/user/gist 操作，fetch 作为可注入外部边界。

- [ ] **Step 1: 写加密、防篡改和网关失败测试**

```ts
it('AES-GCM 会话可往返且任何篡改都会拒绝', async () => {
  const sealed = await sealCookie(sessionFixture, SECRET)
  expect(await openCookie(sealed, SECRET)).toEqual(sessionFixture)
  await expect(openCookie(`${sealed.slice(0, -1)}A`, SECRET)).rejects.toThrow(/会话/)
})

it('读取 truncated Gist 文件时跟随 raw_url', async () => {
  const gateway = createGitHubGateway(fetchFixtureReturningTruncatedGist)
  expect((await gateway.readSaveGist(TOKEN)).content).toBe(FULL_JSON)
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- server/auth.test.ts server/http.test.ts server/github.test.ts`

Expected: FAIL，server 模块不存在。

- [ ] **Step 3: 实现 Web Crypto 会话与 Cookie**

使用 SHA-256 从 `XINGLUGU_SESSION_SECRET` 派生 256-bit key；AES-GCM 每次生成 12-byte IV；base64url 负载为 `iv.ciphertext`。OAuth 临时 Cookie 10 分钟，session Cookie 30 天，均设置 `HttpOnly; Secure; SameSite=Lax; Path=/`。

- [ ] **Step 4: 实现 HTTP 防护和 GitHub 网关**

固定请求头：`Accept: application/vnd.github+json`、`X-GitHub-Api-Version: 2026-03-10`、`User-Agent: xinglugu-cloud-save`。分页读取 `/gists?per_page=100&page=N`，最多 10 页；只匹配 description 与文件名；truncated 时读取 raw_url；禁止删除 Gist。

- [ ] **Step 5: 增加 API 类型检查**

`tsconfig.api.json` 包含 `api/**/*.ts`、`server/**/*.ts` 与共享的 `src/cloud`/`src/game` 纯模块，使用 ES2022 + DOM、`noEmit:true`、`strict:true`。`package.json` 新增 `typecheck:api` 并让 `build` 先运行它。

- [ ] **Step 6: 运行 GREEN**

Run: `pnpm test:run -- server/auth.test.ts server/http.test.ts server/github.test.ts && pnpm typecheck:api`

Expected: PASS；测试日志不含 token/secret fixture 正文。

- [ ] **Step 7: 提交并推送**

```powershell
git add server tsconfig.api.json package.json
git commit -m "feat: add secure github server gateway"
git push origin main
```

### Task 3: OAuth 与云存档 Vercel Functions

**Files:**
- Create: `api/auth/github/start.ts`
- Create: `api/auth/github/callback.ts`
- Create: `api/auth/session.ts`
- Create: `api/auth/logout.ts`
- Create: `api/cloud-save.ts`
- Create: `server/handlers.ts`
- Create: `server/handlers.test.ts`

**Interfaces:**
- Produces: Web `Request→Response` handlers；API 文件只 default export 对应 handler。

- [ ] **Step 1: 写路由行为失败测试**

```ts
it('start 生成 state/PKCE 临时 Cookie 并重定向到 GitHub gist 授权', async () => {
  const response = await handleOAuthStart(requestAt('/api/auth/github/start'), testConfig)
  expect(response.status).toBe(302)
  const location = new URL(response.headers.get('location')!)
  expect(location.origin).toBe('https://github.com')
  expect(location.searchParams.get('scope')).toBe('gist')
  expect(location.searchParams.get('code_challenge_method')).toBe('S256')
  expect(response.headers.get('set-cookie')).toContain('HttpOnly')
})

it('cloud PUT 对 revision 不一致返回 409 且不写远端', async () => {
  const response = await handleCloudSavePut(requestWithRevision('old'), session, gatewayWithRevision('new'))
  expect(response.status).toBe(409)
  expect(await response.json()).toMatchObject({ code: 'cloud_conflict', revision: 'new' })
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- server/handlers.test.ts`

Expected: FAIL，handlers 不存在。

- [ ] **Step 3: 实现四个 OAuth handler**

`start` 生成 state/verifier；`callback` 校验临时 Cookie/state/10 分钟期限、交换 token、验证用户、检查返回 scope 含 gist、签发 session 后重定向 `/?auth=success`；`session` 在环境缺失时返回 `{authenticated:false,cloudAvailable:false}`；`logout` 验证 Origin/CSRF 后清 cookie。

- [ ] **Step 4: 实现 cloud GET/PUT handler**

GET 返回 `{exists:false}` 或 `{exists:true,document,revision,updatedAt}`；PUT 先限制 Content-Length/实际文本 512 KiB、校验 owner 与 session user id、读取 revision、冲突返回 409，否则创建/更新 private Gist 并重新读取 revision。上游响应正文只映射为稳定中文错误码。

- [ ] **Step 5: 运行 GREEN 与 API 类型检查**

Run: `pnpm test:run -- server/handlers.test.ts && pnpm typecheck:api`

Expected: PASS；覆盖取消授权、state 错误、code 过期、401、403、429、truncated、无 Gist、创建、更新与 409。

- [ ] **Step 6: 提交并推送**

```powershell
git add api server/handlers.ts server/handlers.test.ts
git commit -m "feat: add github oauth and gist save functions"
git push origin main
```

### Task 4: AuthContext 与 CloudSaveContext

**Files:**
- Create: `src/cloud/AuthContext.tsx`
- Create: `src/cloud/AuthContext.test.tsx`
- Create: `src/cloud/CloudSaveContext.tsx`
- Create: `src/cloud/CloudSaveContext.test.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces: `useAuth()` 和 `useCloudSave()`；云状态枚举 `unavailable|signed-out|idle|loading|synced|conflict|offline|error`。

- [ ] **Step 1: 写离线降级、登录和串行同步失败测试**

```tsx
it('session 接口不可用时保持本地模式并提供恢复说明', async () => {
  render(<AuthProvider client={clientRejectingWithNetworkError}><AuthObserver /></AuthProvider>)
  expect(await screen.findByText('云存档当前不可用，本地存档仍会保存')).toBeVisible()
})

it('自动同步在四秒稳定期后只串行上传最新信封', async () => {
  vi.useFakeTimers()
  render(<CloudSaveProvider client={deferredClient}><CloudObserver /></CloudSaveProvider>)
  emitThreeLocalSaveChanges()
  await vi.advanceTimersByTimeAsync(4000)
  expect(deferredClient.putCalls).toHaveLength(1)
  expect(deferredClient.putCalls[0].document.game.savedAt).toBe(300)
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/cloud/AuthContext.test.tsx src/cloud/CloudSaveContext.test.tsx`

Expected: FAIL，contexts 不存在。

- [ ] **Step 3: 实现最小 Context 状态机**

Auth 初次请求 `/api/auth/session`，登录使用 `window.location.assign('/api/auth/github/start')`，登出携带 CSRF。Cloud 只有登录且玩家完成一次来源选择后才允许自动同步；使用单 Promise 队列和 4 秒 debounce，失败只更新状态。

- [ ] **Step 4: 运行 GREEN**

Run: `pnpm test:run -- src/cloud/AuthContext.test.tsx src/cloud/CloudSaveContext.test.tsx`

Expected: PASS；未登录/未配置不会发 Gist 请求。

- [ ] **Step 5: 提交并推送**

```powershell
git add src/cloud src/App.tsx
git commit -m "feat: add github auth and cloud save state"
git push origin main
```

### Task 5: 存档中心、账户胶囊与设置整合

**Files:**
- Modify: `src/start/TitleScreen.tsx`
- Modify: `src/start/TitleScreen.test.tsx`
- Modify: `src/start/SaveCenterModal.tsx`
- Create: `src/start/SaveCenterModal.test.tsx`
- Create: `src/cloud/GitHubAccountChip.tsx`
- Modify: `src/components/modals/SettingsModal.tsx`
- Modify: `src/components/modals/SettingsModal.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- SaveCenter 展示 `LocalSaveSummary`、`CloudSaveSnapshot`、backup 槽与 conflict；所有写操作调用 Context，不直接 fetch。

- [ ] **Step 1: 写双端来源与冲突失败测试**

```tsx
it('同时显示本地与云端摘要且不自动选择较新时间', async () => {
  render(<SaveCenterModal local={LOCAL} cloud={CLOUD} onLoadLocal={localFn} onLoadCloud={cloudFn} />)
  expect(screen.getByText('本地存档')).toBeVisible()
  expect(screen.getByText('GitHub 云存档')).toBeVisible()
  expect(localFn).not.toHaveBeenCalled()
  expect(cloudFn).not.toHaveBeenCalled()
})

it('409 后显示两端并禁止静默重试覆盖', async () => {
  render(<SaveCenterModal cloudState={CONFLICT} />)
  expect(screen.getByRole('alert')).toHaveTextContent('另一台设备已经更新云存档')
  expect(screen.getByRole('button', { name: '重新读取云端' })).toBeEnabled()
})
```

- [ ] **Step 2: 运行并确认 RED**

Run: `pnpm test:run -- src/start/SaveCenterModal.test.tsx src/start/TitleScreen.test.tsx src/components/modals/SettingsModal.test.tsx`

Expected: FAIL，云端 UI 尚未接入。

- [ ] **Step 3: 实现账户和双端存档 UI**

标题右上角账户胶囊：未登录显示“使用 GitHub 登录”，未配置显示“云存档尚未配置”，已登录显示头像/login/同步状态/退出。存档卡固定显示玩家名、年/月/日、地点、金币、保存时间和设备；加载云端前调用 backup，再替换状态；冲突绝不预选。

- [ ] **Step 4: 扩展设置页云存档分组**

将“自动存档”标题升级为“本地与云端存档”，保留导出/导入/新建，增加登录、上传、重新读取、恢复覆盖前存档、自动同步开关与 GitHub 授权管理链接。请求期间禁用同一动作并保持按钮尺寸。

- [ ] **Step 5: 运行 GREEN**

Run: `pnpm test:run -- src/start/SaveCenterModal.test.tsx src/start/TitleScreen.test.tsx src/components/modals/SettingsModal.test.tsx`

Expected: PASS；按钮/输入 ID 唯一，无浏览器 alert/confirm。

- [ ] **Step 6: 提交并推送**

```powershell
git add src/start src/cloud src/components/modals/SettingsModal.tsx src/components/modals/SettingsModal.test.tsx src/styles/global.css
git commit -m "feat: add local and github save center"
git push origin main
```

### Task 6: 配置说明、安全与全量验收

**Files:**
- Create: `.env.example`
- Create: `docs/github-cloud-save-deployment.md`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] **Step 1: 写部署配置**

`.env.example` 只列变量名和安全示例，不含真实 secret。部署文档写明 GitHub OAuth App Homepage、`https://<domain>/api/auth/github/callback` 回调、Vercel 四项环境变量和重新部署步骤；说明预览分支域名不能共用不同 origin。

- [ ] **Step 2: 运行秘密和旧品牌扫描**

```powershell
rg -n "gho_|github_client_secret|XINGLUGU_SESSION_SECRET=." . --glob '!pnpm-lock.yaml' --glob '!docs/superpowers/**'
rg -n "雾灯谷|雾灯酒馆|雾灯谷纪事" src public index.html README.md --glob '!**/*.test.*'
```

Expected: 无真实凭据；旧品牌只存在明确迁移常量和稳定内部 ID，不在玩家当前文案。

- [ ] **Step 3: 全量验证**

```powershell
pnpm test:run
pnpm typecheck:api
pnpm build
git diff --check
```

Expected: 全部 PASS，构建不把 server secret/env 值打入客户端 bundle。

- [ ] **Step 4: 浏览器验收**

在本地无 API、Vercel 未配置、模拟已登录三种环境验证；桌面 1440×900 和手机 390×844 检查登录、关闭、加载本地、导入、云空档、上传、下载、409、离线、返回标题、刷新恢复和焦点顺序。控制台 0 error、无重复 ID、无页面横向滚动。

- [ ] **Step 5: 更新记录、提交并推送**

```powershell
git add .env.example .gitignore README.md docs/github-cloud-save-deployment.md task_plan.md findings.md progress.md
git commit -m "docs: document github cloud save deployment"
git push origin main
```
