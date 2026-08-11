# Tavern Contract Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复已确认的酒馆请求、资源、变量、兼容导入和精力事务缺口，同时保留现有存档与 UI。

**Architecture:** 保持现有提示词编译器和 Dexie 仓储，以五个窄边界函数承担能力校验、会话资源解析、变量提交、兼容元数据和回合结算。调用方只读取这些边界的结果，禁止再次维护平行逻辑。

**Tech Stack:** React 18、TypeScript、Vite、Vitest、Testing Library、Dexie、Playwright Core。

## Global Constraints

- 不新增后端或依赖，不重写提示词编译器和仓储。
- 所有用户可见错误使用中文内部提示。
- 旧世界书、预设、正则、会话与存档必须继续可读。
- 每个生产行为必须先出现预期红灯。

---

### Task 1: 提供商能力与顺序门禁

**Files:**
- Modify: `src/sillytavern/protocol-adapters.ts`
- Modify: `src/sillytavern/api-config.ts`
- Test: `src/sillytavern/protocol-adapters.test.ts`
- Test: `src/sillytavern/api-config.test.ts`

**Interfaces:**
- Produces: `validateProviderRequest(config, request): void`，在构造网络请求前拒绝无法表达的顺序和非法 Cohere 采样参数。

- [ ] 添加红灯：Cohere 零值惩罚不发送、双惩罚/负值被拒绝、system 位于历史后时三个受限协议被拒绝。
- [ ] 运行两个测试文件，确认失败来自当前无条件字段与静默重排。
- [ ] 实现最小能力校验并让 API 配置页复用 Cohere 范围规则。
- [ ] 运行定向测试转绿。

### Task 2: 会话有效资源唯一解析

**Files:**
- Modify: `src/sillytavern/prompt-compiler.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/components/SillyTavern/panels/PresetPanel.tsx`
- Test: `src/sillytavern/prompt-compiler.test.ts`
- Test: `src/components/SillyTavern/TavernDialogue.test.tsx`

**Interfaces:**
- Produces: `resolveSessionResources(session, settings, presets, lorebooks, character)`，返回有效预设、世界书和绑定模式。

- [ ] 添加红灯：固定预设的显示正则必须生效且活动预设正则不得生效；状态栏使用真实会话书单；删除固定预设后解除固定绑定。
- [ ] 运行测试确认现有 UI 与发送路径发生分歧。
- [ ] 用统一解析器替换请求与 UI 平行逻辑，并在删除预设时迁移相关会话。
- [ ] 运行定向测试转绿。

### Task 3: 变量定义约束事务

**Files:**
- Create: `src/sillytavern/variable-transaction.ts`
- Create: `src/sillytavern/variable-transaction.test.ts`
- Modify: `src/tavern/remote-story-engine.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Modify: `src/sillytavern/types.ts`
- Test: `src/tavern/TavernContext.test.tsx`

**Interfaces:**
- Produces: `applyDefinedVariablePatch({ patch, globalDefinitions, sessionDefinitions, sessionValues, readOnlyKeys })`，返回分作用域更新和诊断。

- [ ] 添加红灯：未知键、错误类型、越界值、只读镜像不写入；全局键更新全局定义而非会话影子。
- [ ] 运行测试确认任意 JSON 当前会直接持久化。
- [ ] 实现白名单、类型转换、范围限制和双作用域结果，提交回合时原子写入设置与会话。
- [ ] 运行变量、远程回合、上下文定向测试转绿。

### Task 4: 世界书和正则无损兼容层

**Files:**
- Modify: `src/sillytavern/types.ts`
- Modify: `src/sillytavern/importer.ts`
- Modify: `src/sillytavern/regex-engine.ts`
- Modify: `src/components/SillyTavern/panels/LorebookPanel.tsx`
- Modify: `src/components/SillyTavern/panels/RegexPanel.tsx`
- Test: `src/sillytavern/importer.test.ts`
- Test: `src/sillytavern/regex-engine.test.ts`

**Interfaces:**
- Lorebook/regex 记录增加可选 `compatibility` 原始元数据；导出以原始对象为底，再覆盖受支持编辑字段。

- [ ] 添加红灯：世界书 UID/未知字段往返不变；正则未知字段和三态标志往返不变；矛盾标志拒绝。
- [ ] 运行测试确认当前重编号和字段丢失。
- [ ] 实现结构化克隆后的兼容元数据与覆盖式导出，并向面板返回未支持能力清单。
- [ ] 运行导入器、正则、内容包测试转绿。

### Task 5: NPC 回合精力事务

**Files:**
- Modify: `src/components/SillyTavern/TavernDialogue.tsx`
- Modify: `src/components/SillyTavern/TavernDialogue.test.tsx`

**Interfaces:**
- 每次 `send()` 在 API 前检查最新精力；每次成功回合恰好 dispatch 一次 `CHAT_WITH_NPC`。

- [ ] 添加红灯：零精力不调用 API；同一窗口连续两轮消耗两次精力。
- [ ] 运行组件测试确认当前缺少预检并被 `settlementRef` 抑制。
- [ ] 移除窗口级结算引用，改为逐回合预检与成功提交。
- [ ] 运行组件与 reducer 测试转绿。

### Task 6: 内容所有权与失败可观察性

**Files:**
- Modify: `src/sillytavern/rolecard-projection.ts`
- Modify: `src/sillytavern/content-pack.ts`
- Modify: `src/tavern/TavernContext.tsx`
- Test: `src/sillytavern/rolecard-projection.test.ts`
- Test: `src/sillytavern/content-pack.test.ts`

**Interfaces:**
- 角色投影不再产生描述/性格/场景/示例；内容包加载返回成功、未找到或无效三种结构化结果。

- [ ] 添加红灯：人物文字不进入提示词；损坏仓库包产生可见错误而非静默 null。
- [ ] 实现最小投影与结构化加载结果，不改变默认内容初始化。
- [ ] 运行定向测试转绿。

### Task 7: 验证、审查与发布

**Files:**
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`

- [ ] 运行全部相关定向测试。
- [ ] 运行 `pnpm test:run -- --maxWorkers=1 --minWorkers=1`。
- [ ] 运行 `pnpm build`、`git diff --check` 与补丁范围检查。
- [ ] 运行 TavernWeave 安全/性能扫描。
- [ ] 用 Edge 验收 1440×900 和 390×844，无控制台错误、页面溢出或不可达按钮。
- [ ] 审查最终 diff，提交到 `main` 并推送 `origin/main`。
