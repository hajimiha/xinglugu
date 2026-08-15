# 性撸谷物语：酒馆对话生图系统设计规格

## 1. 目标

在现有酒馆/GAL 对话体系内原生实现 st-chatu8 的核心闭环：

1. 从当前 NPC、地点、游戏时间、最近对话、世界书与用户补充要求构造绘图上下文。
2. 使用当前酒馆 LLM 生成可审阅的正面/负面绘图提示词。
3. 将确认后的提示词提交给本地或远程生图后端。
4. 显示任务进度、错误、取消、重试、下载与历史。
5. 在 GAL 对话右侧“对话与行动”抽屉的“画廊”视图展示生成结果。

实现是对能力的原生重构，不复制上游依赖 SillyTavern DOM、事件总线和宿主代理的实现细节。

## 2. 支持范围

### 2.1 生图后端

- **Stable Diffusion WebUI / Forge**：`/sdapi/v1/txt2img`、进度、中断、模型/VAE/采样器/调度器/放大器/LORA 列表；高清修复、面部修复、ADetailer。
- **ComfyUI**：导入 API Workflow JSON，以占位符或显式映射注入 prompt、negative prompt、宽高、步数、CFG、seed、模型、VAE、采样器、调度器和 LORA；提交、轮询历史、拉取输出、取消。
- **NovelAI**：官方或兼容端点，模型、采样器、调度器、步数、Prompt Guidance、CFG Rescale、SMEA/DYN、去伪影/多样性、seed；Vibe Transfer 与 Character Reference 参考图组。
- **OpenAI 图像兼容**：支持 OpenAI/Grok/第三方兼容的 `images/generations`，模型、尺寸、质量、风格与返回格式；远程密钥与聊天密钥相互独立。

第三方 NovelAI 云排队服务不作为默认依赖；保留可选队列端点能力，并明确提示它会把密钥哈希和任务信息发送给第三方。

### 2.2 提示词系统

- 手动、聊天标记提取、LLM 自动整理三种来源。
- 默认标记兼容 `image###...###` 和 `<images><image>...</image></images>`。
- 固定前置、固定后置、负面提示词。
- 多套提示词预设，可新建、重命名、复制、删除、导入导出。
- 动态替换规则：替换、删除、前置、后置；规则按顺序执行并支持启停。
- 角色外观从当前角色立绘/角色卡标识与已挂载世界书中提取；不新增重复的人物文字档案。
- 用户可补充画面要求并上传参考图；LLM 结果可在正式生图前编辑。
- 自动生图可按每 N 条 NPC 回复触发，并可关闭。

### 2.3 任务与历史

- 状态：`draft → preparing → queued → generating → succeeded|failed|cancelled|interrupted`。
- 每个会话串行，跨会话可并行；同一任务只允许一次终态提交。
- 支持 AbortController 取消；刷新后未完成任务变为 `interrupted`，可重试。
- 图片以 Blob 存入 IndexedDB，元数据包含会话、NPC、消息、供应商、模型、prompt、negative prompt、seed、尺寸、耗时和创建时间。
- 缓存支持最大条目、最大总字节、保留天数；清理时同时删除 Blob 和元数据。
- 统计记录供应商成功/失败次数和最近生成时间。

## 3. 数据模型

### 3.1 TavernSettings 扩展

`imageGeneration` 保存非敏感配置：启用状态、自动策略、当前后端、提示词预设、替换规则、各后端参数、缓存策略和 UI 偏好。

密钥不进入 TavernSettings。`image-credentials.ts` 使用 sessionStorage/localStorage 的独立命名空间，按“仅本次会话/记住在本机”策略保存，并提供显式清除。

### 3.2 Dexie v3

- `imageJobs`: `id, sessionId, npcId, messageId, status, provider, createdAt, updatedAt`
- `imageAssets`: `id, jobId, sessionId, npcId, createdAt`

任务提交和成功资产写入使用事务。Blob 不写入游戏存档、GitHub 云存档、世界书、预设或创意工坊包。

## 4. 运行时架构

- `image-generation/types.ts`: 领域类型和默认值。
- `image-generation/config.ts`: 逐字段净化、迁移、导入导出。
- `image-generation/prompt.ts`: 标记解析、替换、固定词拼装、LLM 请求构造与结果解析。
- `image-generation/providers/*`: 统一 provider 接口与四类适配器。
- `image-generation/repository.ts`: 任务、资产、缓存和统计事务。
- `image-generation/service.ts`: 任务状态机、取消、重试、连接测试、模型元数据。
- `ImageGenerationPanel.tsx`: 酒馆中枢完整配置。
- `DialogueImageGallery.tsx`: 对话抽屉画廊与任务控制。

本地 A1111/Forge/ComfyUI 必须由浏览器直接访问本机或局域网 URL；Vercel 服务端无法访问玩家的 localhost。UI 提供 CORS/启动参数诊断，不伪装成服务器故障。

## 5. LLM 提示词协议

请求使用当前酒馆 API 连接，系统消息要求仅输出：

```text
<image_prompt>
<positive>...</positive>
<negative>...</negative>
<title>...</title>
</image_prompt>
```

输入包含：NPC 名称、角色身份、当前地点/时间/天气/节日、最近若干轮可见对话、玩家补充要求、匹配的世界书摘要和参考图说明。输出解析失败时保留原文供用户编辑，不自动提交错误格式。

## 6. UI/UX

### 酒馆中枢“绘图”页

- 顶部：总开关、后端选择、连接状态、测试连接。
- 左侧/折叠组：工作流、提示词、后端参数、参考图、缓存历史、导入导出。
- 所有密钥字段有本机存储说明和显示/隐藏按钮。
- 数值输入使用字符串草稿，保存/失焦时校验，允许负 seed 等中间态。

### 对话右侧抽屉

- 顶部提供“对话 / 画廊”语义化页签。
- 画廊首屏显示最新图或当前任务状态；下方为横向历史缩略图。
- 操作：生成、编辑提示词、取消、重试、下载、删除、查看元数据。
- 生成前审阅面板支持补充要求、参考图、正/负提示词与后端参数覆盖。
- 手机端抽屉全屏覆盖，所有操作区可滚动；桌面端保持当前右侧宽度。

## 7. 安全与性能

- URL 只允许 `http:`/`https:`；远程代理拒绝 localhost/私网 SSRF。本地后端永不经过云端代理。
- 不记录 Authorization、API Key、参考图 base64 或工作流中的密钥形字段。
- 图片响应校验 MIME、单图大小、像素上限和总缓存预算。
- 所有 object URL 在组件卸载/切换时释放。
- 设置页和画廊懒加载；缩略图使用独立小尺寸 Blob（若无法生成则 CSS 限制解码尺寸）。
- 尊重 `prefers-reduced-motion`，进度动画可降级。

## 8. 失败与恢复

- 连接失败区分：地址无效、CORS、401/403、404 协议不兼容、429、超时、工作流无输出、非图片响应。
- LLM 提示词失败不丢失用户输入，允许切换为手动提示词继续。
- 任务失败保留 prompt、参数和错误摘要，重试会创建新 attempt 并关联原任务。
- IndexedDB 不可用时禁用历史缓存但允许当前页面生成与下载。

## 9. 验收

- 单元：配置净化、标记解析、替换顺序、固定词、LLM 协议、四后端请求/响应、状态机、取消、缓存清理。
- 组件：绘图标签、连接测试、提示词审阅、任务进度、抽屉切换、重试/下载/删除、焦点与 Escape。
- 集成：NPC 对话后自动生图；手动生图；刷新后历史仍在；中断任务可恢复为可重试状态。
- 视口：375×812、768×1024、1440×900；无水平溢出和不可达按钮。

