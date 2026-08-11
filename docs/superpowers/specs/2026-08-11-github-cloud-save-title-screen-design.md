# 《性撸谷物语》GitHub 云存档与开始界面设计规格

## 目标

在不破坏现有本地存档、酒馆内容和 Vite 前端架构的前提下，增加 GitHub 联网登录、玩家私有 Gist 云存档、每次打开网页都先显示的游戏开始界面、桌面/手机双封面，以及玩家可见品牌从“雾灯谷”到“性撸谷”的完整迁移。

## 已确认范围

- 使用 GitHub OAuth Web Application Flow 登录。
- 云存档保存在每位玩家自己的私有 Gist，不建设独立数据库。
- Vercel Node.js Functions 负责授权码交换、令牌保护和 Gist 代理。
- 本地自动存档始终可用；未登录、离线或云端失败不会阻止本地游玩。
- 开始界面固定提供“开始游戏”“继续游戏”“创意工坊”“设置”四个视觉按钮；“继续游戏”承担原“读取存档”入口，打开本地、云端和 JSON 三来源存档中心。
- 使用玩家提供的桌面横屏 `4706.png` 与手机竖屏 `4707.png`，不再调用 ImageGen；发布前转换为同尺寸 WebP。
- 所有玩家可见 UI、默认世界书、默认角色内容、页面标题和发布内容包改名为《性撸谷物语》/“性撸谷”。

## 不在范围内

- 不把 API 密钥、BGM、酒馆会话、玩家自建世界书或角色立绘上传到云存档。
- 不申请 GitHub 仓库访问权限，不读写玩家代码仓库。
- 不建设排行榜、多人联机、社交关系或公共存档市场。
- 不机械重命名旧 localStorage、IndexedDB、Dexie 主键和历史迁移 ID；这些标识继续保留以兼容现有设备。

## 1. GitHub 登录架构

### 1.1 OAuth 流程

1. 前端访问 `/api/auth/github/start`。
2. Serverless Function 生成 32 字节随机 `state` 和 PKCE `code_verifier`，计算 S256 `code_challenge`。
3. 临时授权数据用 `XINGLUGU_SESSION_SECRET` 派生的 AES-GCM 密钥加密，写入 10 分钟有效的 HttpOnly、Secure、SameSite=Lax Cookie。
4. Function 以 `scope=gist` 重定向到 GitHub；不申请 `repo`、`user` 或邮箱权限。
5. GitHub 回调 `/api/auth/github/callback` 后，Function 校验 state、时限与 PKCE verifier，再用服务端环境变量交换 access token。
6. 每次获得 token 后立即请求 GitHub `GET /user`，以不可变 GitHub user id 确认身份。
7. access token、用户 id、login、avatar URL、随机 CSRF token 和签发时间被加密进 30 天 HttpOnly 会话 Cookie；token 永不返回前端、永不进入 localStorage、日志或游戏存档。
8. 回调成功重定向到 `/?auth=success`，失败重定向到 `/?auth=error&reason=<安全枚举>`，不把上游错误正文或密钥写进 URL。

### 1.2 API 路由

- `GET /api/auth/github/start`：发起授权。
- `GET /api/auth/github/callback`：处理授权回调。
- `GET /api/auth/session`：返回 `{ authenticated, user?, csrfToken?, cloudAvailable }`。
- `POST /api/auth/logout`：校验 Origin/CSRF 后清除本机会话 Cookie。
- `GET /api/cloud-save`：查找并读取当前用户的游戏私有 Gist。
- `PUT /api/cloud-save`：创建或更新云存档；需要 `X-CSRF-Token` 和期望 revision。

Vercel 环境变量固定为：

- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `XINGLUGU_SESSION_SECRET`：至少 32 个随机字节的 base64/hex 文本
- `XINGLUGU_APP_ORIGIN`：例如 `https://tavern-olive.vercel.app`

缺少任意变量时，`/api/auth/session` 返回可恢复的 `cloudAvailable: false`；开始菜单显示“云存档尚未配置”，本地功能继续工作。

### 1.3 请求安全

- Cookie 使用 AES-256-GCM 机密性与完整性保护，并设置 HttpOnly、Secure、SameSite=Lax、Path=/。
- 所有修改操作同时验证 `Origin === XINGLUGU_APP_ORIGIN` 和会话中的 CSRF token。
- Serverless Functions 不输出 token、完整存档或环境变量到日志。
- 云存档请求体上限为 512 KiB；解析后必须通过现有 `parseGameSave`/`sanitizeGameState`。
- GitHub API 使用 `Accept: application/vnd.github+json` 和固定 API version；上游错误转换为有限的中文错误码。
- 登出只清除本网站会话；界面提供 GitHub 授权管理链接，玩家可从 GitHub 撤销应用授权。

依据：[GitHub OAuth Web Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[GitHub Gist REST API](https://docs.github.com/en/rest/gists/gists)、[Vercel Vite Functions](https://vercel.com/docs/frameworks/frontend/vite)。

## 2. 云存档模型

### 2.1 Gist 标识

- Gist 必须为私有：`public: false`。
- description 固定为 `性撸谷物语云存档 · xinglugu-cloud-save-v1`。
- 文件名固定为 `xinglugu-save-v1.json`。
- Serverless Function 分页读取当前用户 Gist，只有 description 和文件名同时匹配才视为游戏云存档。
- 第一次上传创建 Gist；后续上传更新同一 Gist，不创建重复副本。

### 2.2 云信封

云端文件继续包含现有 `GameSaveEnvelope`，额外包一层：

```ts
interface CloudSaveDocument {
  cloudSchemaVersion: 1
  ownerGithubId: number
  game: GameSaveEnvelope
  clientSavedAt: number
  deviceId: string
}
```

`deviceId` 是当前浏览器生成的随机非身份标识，只用于冲突提示，不跨站追踪。

### 2.3 本地与云端并存

- 本地 `localStorage` 自动保存行为保持不变，是离线和失败时的主保障。
- GitHub 登录后不立即覆盖任一端；先读取两端元数据。
- 只有云端不存在时，玩家可一键“把本地进度建立为云存档”。
- 两端都存在且内容不同时，“读取存档”显示玩家姓名、年/月/日、地点、金币和保存时间，玩家明确选择“读取本地”或“读取云端”。
- 选择云端会先把当前本地存档完整写入 `mistvale-game-save-backup-before-cloud-v1` 浏览器恢复槽，再用现有净化器替换游戏状态；存档中心提供“恢复覆盖前存档”入口。该内部键沿用旧品牌前缀以保持持久化命名稳定。
- 选择本地并上传时携带上次读取到的 Gist revision。服务端更新前再次读取 revision；不一致返回 HTTP 409，并把远端元数据交给冲突对话框，禁止静默覆盖。
- GitHub Gist API 没有文档化的条件更新前置条件，因此上述 revision 检查属于尽力而为的乐观冲突检测，检查与 PATCH 之间仍存在极小竞争窗口。界面不得宣称跨设备写入是原子的；每次成功上传后都重新读取远端 revision，并在异常时间戳或 revision 变化时保留两端副本、要求玩家选择。
- 玩家完成首次来源选择后，可开启“自动同步云端”。自动同步在本地状态稳定 4 秒后触发，串行执行，失败只显示状态而不回滚本地进度。
- 云存档状态：未登录、未配置、未建立、已同步、同步中、有冲突、离线、失败。

## 3. 游戏开始界面

### 3.1 启动行为

- 每次加载网页都默认进入开始界面，不直接展示游戏 HUD、农场或地图。
- 应用 Provider 可以初始化存档元数据，但游戏 Shell 在玩家选择进入前不渲染。
- “开始游戏”：存在本地存档时继续当前本地进度；不存在时进入新游戏姓名登记。不会清除已有进度。
- “继续游戏”：打开双端存档中心，显示本地、云端和“导入 JSON”三种来源。
- “创意工坊”：从封面直接打开现有酒馆中枢，默认进入世界书/角色卡内容管理；关闭后返回封面。
- “设置”：从封面打开现有设置面板；关闭后返回封面。
- 游戏设置页新增“返回标题界面”，只退出当前游戏画面，不删除或回滚存档。

### 3.2 封面视觉

桌面封面：

- 最终资产：`src/assets/xinglugu-title-desktop.webp`
- 原始素材：玩家提供的 `E:\ai跑图整理12\4706.png`，1672×941；发布资产保持 1672×941 构图并转换为 WebP。
- 标题与四块木牌已经烘焙在画面中；前端真实按钮热点按完整画布百分比覆盖，不能通过裁切或拉伸使热点错位。

手机封面：

- 最终资产：`src/assets/xinglugu-title-mobile.webp`
- 原始素材：玩家提供的 `E:\ai跑图整理12\4707.png`，941×1672；发布资产保持 941×1672 构图并转换为 WebP。
- 使用 `<picture media="(orientation: portrait)">` 切换横竖素材，并让画布以 contain 方式完整显示；外围可使用同图模糊填充，但不可改变主画布坐标系。

两张图的标题已经人工确认；前端仍提供视觉隐藏但可被辅助技术读取的语义化 `<h1>`。热点必须具备键盘焦点、触摸反馈与中文可访问名称。

### 3.3 UI 结构

- 使用语义化 `<main>`、`<h1>` 和四个 `<button>`；唯一 ID：`title-start-game`、`title-load-save`（视觉为“继续游戏”）、`title-workshop`、`title-settings`。
- 菜单以深苔绿半透明像素玻璃面板承载，金色 2px 像素边框，44px 以上点击区域。
- 使用现有 Phosphor 图标体系；GitHub 登录使用 `GithubLogo`，不使用 emoji。
- 悬停有 160–220ms 描边、辉光和小幅位移动画；按下不改变布局边界。
- `prefers-reduced-motion: reduce` 时关闭背景漂浮、视差和菜单入场位移。
- 桌面使用横向安全区，手机使用底部单列菜单；375×667、390×844、1440×900 和 1920×1080 均不得出现页面横向滚动。

## 4. 存档中心与 GitHub 账户界面

- 开始界面右上角显示账户胶囊：未登录时“使用 GitHub 登录”，已登录时显示头像、login、云同步状态和退出入口。
- “读取存档”打开项目内模态框，不使用浏览器 `alert`/`confirm`。
- 本地和云端卡片都显示来源图标、玩家名、游戏日期、地点、金币、保存时间和设备信息；不可用来源呈现原因及修复按钮。
- 冲突状态必须同时展示两端，不用“最新时间”替玩家自动决定，因为设备时钟可能不可靠。
- 设置页的自动存档区域升级为“本地与云端存档”，复用同一云状态、上传、下载、登出和授权管理操作。
- 网络请求有内部 loading、成功、失败和重试状态；按钮在请求中禁用且保留尺寸。

## 5. 品牌迁移与兼容

### 5.1 必须迁移

- `index.html` 页面标题、README 当前说明、开始界面、HUD、地图文案、酒馆中枢、设置/存档导出文件名、错误提示。
- `src/game/data.ts` 等运行时默认文本。
- 默认世界书、默认预设中玩家可见的世界名称、仓库内容包内全部玩家可见字段。
- 游戏内容包显示名、描述和角色场景文字。
- 所有测试断言和无障碍标签中的旧品牌。

### 5.2 必须保留

- `mistvale-game-save-v1/v2` localStorage key。
- Dexie 数据库名、表名、稳定世界书/角色/预设 ID。
- `public/content/mistvale-content-pack.json` 文件路径，避免旧部署与缓存链断裂；文件内部显示内容改名。
- 历史设计文档、迁移说明和 Git 提交历史中的旧名称。

### 5.3 已安装内容迁移

- 默认内容版本提升一版。
- 迁移只修改系统默认合并世界书、默认预设和默认角色的玩家可见品牌词；不全局替换玩家自建世界书。
- 系统默认内容中即使包含玩家自定义补充条目，也只替换准确品牌短语“雾灯谷”“雾灯酒馆”“雾灯谷纪事”，不替换普通“雾”“灯”等字。
- 旧游戏存档无需 schema 升级；载入后 UI 自然显示新品牌。

## 6. 组件与模块边界

前端新增：

- `src/start/TitleScreen.tsx`：封面与四按钮。
- `src/start/SaveCenterModal.tsx`：本地/云端来源选择与冲突处理。
- `src/cloud/AuthContext.tsx`：登录状态和会话 API。
- `src/cloud/CloudSaveContext.tsx`：云元数据、上传、下载和自动同步队列。
- `src/cloud/cloud-save-client.ts`：无 React 的 API 客户端与错误类型。
- `src/cloud/cloud-save-types.ts`：共享前端契约。

服务端新增：

- `api/_lib/auth.ts`：Cookie 加密、OAuth 临时态和会话解析。
- `api/_lib/github.ts`：GitHub API 调用与错误归一化。
- `api/_lib/http.ts`：Origin、JSON、大小与响应帮助函数。
- `api/auth/github/start.ts`、`api/auth/github/callback.ts`、`api/auth/session.ts`、`api/auth/logout.ts`。
- `api/cloud-save.ts`：Gist 查找、读取、创建、更新和冲突响应。

现有 `GameContext` 继续拥有存档序列化和状态替换；CloudSaveContext 只能通过其公开方法读取/导入，不能复制净化逻辑。

## 7. 错误处理

- OAuth 取消、state 不匹配、code 过期、GitHub 限流、Gist 被删除、Cookie 解密失败、跨设备冲突和离线分别使用稳定错误码。
- 前端错误全部在页面内显示中文说明和下一步，不使用原生弹窗。
- 401 会刷新登录状态；403 提示授权缺少 gist scope 并提供重新授权；409 打开冲突选择；429 显示稍后重试。
- 云端失败永不清除本地存档；导入失败永不替换当前 state。
- 云端下载必须先校验 GitHub owner id 和全部 schema，再进入现有 `parseGameSave`。

## 8. 测试与验收

### 单元/组件测试

- OAuth state、PKCE、Cookie 加解密、过期和篡改拒绝。
- Origin/CSRF、请求体上限、GitHub 错误归一化。
- Gist 查找、创建、更新、revision 冲突和 truncated raw 读取。
- 本地/云端元数据比较、离线降级、串行防抖同步。
- 开始界面首次渲染不出现游戏 Shell，四按钮语义与行为完整。
- 本地读取、云端读取、导入 JSON、失败保持当前存档。
- 品牌扫描确保运行时源码与发布内容包不再出现玩家可见“雾灯谷”。
- 旧 `mistvale-*` 持久化键仍可读取。

### 浏览器验收

- 1440×900、1920×1080、390×844、375×667。
- 首屏、四按钮、GitHub 登录状态、存档中心、创意工坊、设置和返回标题。
- 本地存档刷新恢复；云端模拟登录后上传/下载/冲突路径。
- 横竖封面按断点切换，无拉伸、错字、横向溢出或遮挡。
- 键盘导航、Escape 关闭模态、焦点回退、44px 点击目标、reduced-motion。
- 控制台 0 错误；全量 Vitest、TypeScript、Vite 构建和 `git diff --check` 通过。

## 9. 发布配置

仓库提供 `.env.example` 和中文部署说明，列出 GitHub OAuth App 的 Homepage URL、Authorization callback URL 与四个 Vercel 环境变量。真实 secret 不进入 Git、截图、测试夹具或浏览器包。未配置 OAuth 的预览部署仍能用本地存档、开始界面、创意工坊和设置。
