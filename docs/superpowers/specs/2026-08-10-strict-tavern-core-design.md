# 严格酒馆核心重构设计规格

## 1. 目标与验收边界

本轮不是给现有界面增加几个开关，而是建立一条可证明、可回放、可调试的酒馆请求管线。一次 NPC 回合只有在以下事实同时成立时才算成功：

1. 当前有效预设的启用条目严格按所选 `prompt_order` 进入编译结果；
2. SillyTavern 宏、世界书、角色卡、变量、历史与用户输入均在明确阶段处理；
3. 提示词正则只修改发给模型的文本，显示正则只修改屏幕文本；
4. 供应商请求体来自同一份编译结果，并能在“请求检查”中逐条查看来源与最终内容；
5. 模型返回的正文、供应商推理字段和 `<thinking>/<think>` 标签分别保存、流式更新和显示；
6. 刷新后预设、正则、变量、会话绑定和请求审计仍可恢复。

关键自动化验收是捕获真实 `fetch` 的 JSON 请求体，断言预设文本、顺序、角色、宏结果、正则结果和采样参数真实存在。只检查编辑器中的文字不算通过。

## 2. 已确认根因

- 旧会话创建时保存了 `session.presetId`；发送时该值优先于全局 `activePresetId`。用户导入并“设为当前”后继续旧会话，实际仍使用旧预设。
- 当前宏替换只支持 `user/char/original/简单变量`，不支持真实预设中使用的 `setvar/getvar/trim/注释/random/roll/lastUserMessage/lastCharMessage`，预设即使发送也会语义失真。
- 当前装配结果没有条目来源、宏变更、正则执行和上下文裁剪追踪，用户无法验证最终请求。
- 当前协议层只抽取正文，不单独抽取 OpenAI/DeepSeek `reasoning_content`、Anthropic thinking block 或 Gemini thought part。

## 3. 选择的架构

采用单一、纯函数优先的 `compileTavernTurn()` 管线。所有发送入口必须调用它，不允许组件或供应商适配器自行拼接提示词。

```text
活动会话/当前预设
  → 预设顺序解析
  → ST 宏执行（顺序可变变量环境）
  → 世界书/角色卡/历史 marker 注入
  → prompt-only 正则
  → 上下文预算裁剪
  → Provider request body
  → 流式正文 + 流式推理
  → AI-output 正则 + 六标签解析
  → 会话变量快照和请求审计持久化
```

编译器返回 `messages` 与 `trace`。`trace` 的每个片段包含稳定 ID、来源类型、预设 identifier、角色、原始文本、宏处理后文本、正则处理后文本、是否发送、跳过原因和估算 token。检查器直接渲染该结构，不自行重算。

## 4. 预设与会话绑定

- 新会话默认 `presetBinding: { mode: 'follow-active' }`，始终使用全局当前预设。
- 玩家可在会话页明确选择“固定预设”，此时保存 `presetBinding: { mode: 'pinned', presetId }`。
- 旧会话迁移为 `follow-active`，因为旧版本没有提供显式固定预设的用户操作。
- 预设中心包含：概览、提示词库、上下文顺序、生成参数、随预设正则、编译预览六个区域。
- 导入继续兼容分组 `prompt_order`、裸顺序数组和 `extensions.regex_scripts`；导出保留未启用条目、角色槽位与未知扩展字段。

## 5. SillyTavern 宏

宏引擎按条目顺序执行，使用回合级变量环境，避免后置条目读不到前置 `setvar`。

首期必须支持：

- `{{user}}`、`{{char}}`、`{{original}}`；
- `{{lastUserMessage}}`、`{{lastCharMessage}}`，大小写不敏感；
- `{{setvar::键::值}}`、`{{getvar::键}}`、`{{addvar::键::值}}`；
- `{{random::A::B}}` 与逗号列表；
- `{{roll 1d100}}`；
- `{{trim}}` 与 `{{// 注释}}`；
- `${变量}` 和 `{{变量名}}`；
- 未识别宏原样保留并在 trace 中标记，避免误删用户格式。

编译产生的变量变更写入会话宏变量子树，但游戏镜像变量继续只读，AI 不得绕过游戏 reducer 修改金币、精力等权威状态。

## 6. 正则中心

正则脚本兼容 SillyTavern 字段：`id/scriptName/findRegex/replaceString/trimStrings/placement/disabled/markdownOnly/promptOnly/runOnEdit/substituteRegex/minDepth/maxDepth`。

执行阶段：

- 用户输入：进入历史与模型请求之前；
- 提示词：对编译后的请求消息执行，支持深度；
- AI 输出：标签解析前执行非 `markdownOnly` 脚本；
- 显示：只对屏幕副本执行 `markdownOnly`，不污染存档和后续上下文。

中心提供全局脚本、当前预设脚本、启停/排序、完整字段编辑、导入/导出和试跑预览。非法表达式就地显示错误，永不让一次坏正则阻断应用启动。

## 7. 变量中心

变量分四层显示：

- 游戏镜像：只读，来自 `GameState`；
- 全局宏变量：跨会话持久化；
- 会话变量：角色会话独立；
- 本回合临时变量：编译预览中展示，发送完成后按规则合并。

变量定义包含 `key/label/type/value/min/max/description/scope`。编辑器按类型提供文本、数值或布尔控件，保存时验证范围；支持 JSON 导入/导出和恢复默认。请求 trace 必须显示每个宏读取的来源和每个 `setvar` 的变更。

## 8. 模型推理内容

统一流事件为 `content-delta`、`reasoning-delta`、`done`。协议映射：

- OpenAI-compatible：`reasoning_content` 或 `reasoning`；
- Anthropic：thinking content block/delta；
- Gemini：带 thought 标记的 part；
- 其余协议未返回独立字段时保持空。

`ChatMessage` 分别保存 `content`、`reasoning` 与 `parsed.thinking`。界面文案使用“模型返回的推理内容”和“模型自述思考”，设置支持隐藏、折叠、展开。项目不声称能读取服务商没有返回的内部推理。

## 9. 请求检查器

酒馆中枢新增“请求”页，显示最近一次真实发送或手动预览：

- 生效预设与绑定模式；
- 供应商、模型、URL、生成参数和脱敏 headers；
- 按最终顺序列出的 messages；
- 每条消息的来源片段、宏变更、正则命中、世界书条目和 token 估算；
- 上下文预算前后数量及被裁剪项目；
- 可复制的脱敏 JSON。

API 密钥永不进入审计记录、导出文件或页面 DOM。

## 10. UI 与响应式

继续使用现有雾灯谷金绿暗色与 Phosphor 图标。桌面为左侧功能导航 + 主工作区；移动端导航横向可滚动，编辑器单列。长列表超过 100 项时采用分批渲染/折叠，所有输入有可见标签，按钮触控区至少 44×44px，错误贴近字段，动画 150–300ms 并尊重 `prefers-reduced-motion`。不得使用 Emoji 或浏览器原生 alert/confirm。

## 11. 数据迁移与失败策略

- Dexie schema 升级时逐字段净化预设正则、变量定义、会话绑定、推理内容和请求审计。
- 无效导入先完整验证再进入事务；任何一条错误都返回具体路径，不写入半包数据。
- 宏或正则单项失败记录到 trace 并跳过该项；缺失活动预设、上下文溢出、API 错误继续使用现有应用内恢复提示。
- 请求审计最多保留最近 20 条，每条正文限额，防止 IndexedDB 无界增长。

## 12. 验证矩阵

- 纯函数：宏、正则、预设顺序、变量合并、推理字段抽取、trace 与迁移；
- 集成：真实导入格式 → 旧会话 → 当前预设 → 捕获供应商请求体；
- 组件：预设中心、正则中心、变量中心、请求检查器、推理折叠；
- 浏览器：1440×1000、768×1024、390×844，检查滚动、焦点、重复 ID、横向溢出和控制台错误；
- 最终：全量 Vitest、TypeScript、Vite build、`git diff --check`。

