# 雾灯谷农场生产链与魔物娘生态 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立从田地扩建、资源采集、机器加工、矿物冶炼、装备锻造到魔物娘生产和龙娘终局的完整纯前端经营闭环，并保证所有物品都有可验证来源与用途。

**Architecture:** 新增集中式物品与生产目录作为数据真源；继续使用现有 `GameState` + reducer，但把田地、机器、牧场、装备和龙娘进度拆为明确子树。统一时间推进函数结算作物、机器和每日牧场产物；酒馆默认内容通过版本 3 精准迁移追加新世界书和角色卡。

**Tech Stack:** React 18、TypeScript 5.6、Vite 5、Vitest、Testing Library、Dexie、Phosphor Icons、CSS。

## Global Constraints

- 只改前端，不新增后端或服务端凭据。
- 所有用户可见文案中文化，禁止 emoji，结构图标统一使用现有 `GameIcon`/Phosphor。
- 田区和机器区必须支持桌面滚轮/键盘与手机触摸滑动，不产生页面级横向溢出。
- 任何行为变化必须先有失败测试；新状态必须逐字段净化并兼容当前 `mistvale-game-save-v1`。
- 删除 `mushroom`、蘑菇娘和 `moss-herb` 的全部运行时引用，保留 `moss-fertilizer`。
- 每个稳定任务完成后提交并推送 GitHub `main`。

---

### Task 1: 集中式物品、配方、伙伴与锻造目录

**Files:**
- Create: `src/game/economy.ts`
- Create: `src/game/economy.test.ts`
- Modify: `src/game/types.ts`
- Modify: `src/game/data.ts`
- Modify: `src/game/reducer.test.ts`

**Interfaces:**
- Produces: `ITEM_CATALOG`, `MACHINE_RECIPES`, `BUILD_RECIPES`, `FORGE_RECIPES`, `MONSTER_PARTNERS`, `FESTIVAL_SEED_OFFERS`, `MINE_MAX_FLOOR`, `getItemName(id)`, `getMineYield(floor, pickaxeLevel, dropMultiplier, hasDragon)`。
- Consumes: 现有 `Crop`、`ShopItem`、`Npc`、`Festival` 与规则倍率函数。

- [x] **Step 1: 写物品完整性与删除项失败测试**

```ts
it('gives every catalog item a gameplay source and use', () => {
  expect(Object.values(ITEM_CATALOG).filter((item) => item.sources.length === 0 || item.uses.length === 0)).toEqual([])
})

it('removes deleted materials and remaps gift preferences', () => {
  expect(JSON.stringify({ ITEM_CATALOG, npcs })).not.toMatch(/mushroom|moss-herb|月影菇|苔藓药草/)
  expect(npcs.find((npc) => npc.id === 'qiluo')?.preferredGifts).toContain('thread-ball')
  for (const id of ['freya', 'mira', 'chaoyin', 'weina']) expect(npcs.find((npc) => npc.id === id)?.preferredGifts).toContain('milk')
})
```

- [x] **Step 2: 运行红灯**

Run: `pnpm test:run src/game/economy.test.ts src/game/reducer.test.ts`

Expected: FAIL，因为 `economy.ts` 和新目录不存在，旧偏好仍引用删除项。

- [x] **Step 3: 实现目录和类型**

定义：

```ts
export interface ItemDefinition {
  id: string
  name: string
  category: 'seed' | 'crop' | 'material' | 'food' | 'bait' | 'tool' | 'potion' | 'gift'
  sellPrice: number
  description: string
  sources: string[]
  uses: string[]
}

export interface MachineJob {
  recipeId: string
  batches: number
  outputItemId: string
  outputQuantity: number
  completesAt: number
  poweredBy: 'magic' | 'partner'
}
```

登记规格中的全部物品、四种机器配方、两种建筑、十二组工具/装备锻造配方、五位商店伙伴与三种节日种子。`itemDisplayNames` 改由目录派生；NPC 偏好按规格迁移。

- [x] **Step 4: 实现独立矿洞产量函数并覆盖边界**

测试字面量覆盖第 1、5、10、20 层、四级镐子和龙娘额外钻石，确保第 9 层钻石为 0、第 10 层开始大于 0。

- [x] **Step 5: 运行绿灯和类型检查**

Run: `pnpm test:run src/game/economy.test.ts src/game/reducer.test.ts && pnpm exec tsc -b --pretty false`

Expected: PASS。

- [ ] **Step 6: 提交并推送**

```powershell
git add src/game/economy.ts src/game/economy.test.ts src/game/types.ts src/game/data.ts src/game/reducer.test.ts
git commit -m "feat: 建立生产链物品与配方目录"
git push origin main
```

### Task 2: 动态田地、扩建掉落与响应式农场区

**Files:**
- Modify: `src/game/reducer.ts`
- Modify: `src/game/reducer.test.ts`
- Modify: `src/components/stage/FarmStage.tsx`
- Modify: `src/components/stage/FarmStage.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Consumes: `EXPAND_FARM`, `getFarmExpansion(level, roll, dropMultiplier)`。
- Produces: 动态行地块和 `farm-expand-plots` 唯一按钮；机器区占位结构供 Task 4 填充。

- [x] **Step 1: 写扩建 reducer 红灯测试**

测试锄头 1/2/4 级分别新增 6/8/12 格；精力不足不变；`roll=0.11` 在一级掉落月铃花而 `roll=0.13` 不掉；木石数量使用手工字面量断言。

- [x] **Step 2: 运行 reducer 红灯**

Run: `pnpm test:run src/game/reducer.test.ts -t "开拓|田垄"`

- [x] **Step 3: 实现 `EXPAND_FARM`**

以现有最大 `row + 1` 建立唯一 `plot-{row}-{column}`，使用 `getEnergyCost(1)`，最大 30 行；成功通知说明新增格数、木头、石头与月铃花结果。

- [x] **Step 4: 写并运行农场组件红灯测试**

断言 `aria-label="可滚动农田"`、动态行文案、扩建按钮、持有资源摘要和 30 行满级禁用态；验证新增地块仍可打开播种详情。

- [x] **Step 5: 重构农场舞台**

将单格拆为 `memo(FarmPlotButton)`；田地外层使用 `tabIndex=0`、`role="region"`、可见滚动提示，保留所有原播种/浇水/施肥/收获交互。

- [x] **Step 6: 添加滚动和移动端 CSS**

农田使用 `max-height`、`overflow:auto`、`overscroll-behavior:contain`、`touch-action:pan-x pan-y`；桌面保留像素透视，390px 改为稳定二维滑动且按钮最小 44px。

- [ ] **Step 7: 运行定向测试与提交推送**

Run: `pnpm test:run src/game/reducer.test.ts src/components/stage/FarmStage.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 添加可扩建滚动农田`

### Task 3: 牧场居民、每日产物与龙娘进度

**Files:**
- Modify: `src/game/reducer.ts`
- Modify: `src/game/reducer.test.ts`
- Modify: `src/components/modals/RanchModal.tsx`
- Modify: `src/components/modals/specialShops.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `ranch: { owned, residents, dragonStatus }`；actions `BUY_RANCH`, `BUY_MONSTER_PARTNER`, `INVITE_DRAGON`。
- Consumes: `MONSTER_PARTNERS`, `advanceGameClock`。

- [ ] **Step 1: 写牧场状态红灯测试**

覆盖未购牧场拒绝伙伴、扣正确金币、禁止重复、跨 1/3 天生产、两类史莱姆叠加粘液、掉落倍率、龙娘承诺在后购牧场时入住。

- [ ] **Step 2: 运行红灯并实现 reducer**

Run: `pnpm test:run src/game/reducer.test.ts -t "牧场|魔物娘|每日产物|龙娘"`

`advanceGameClock` 只按 `crossedDays` 结算，不依赖组件挂载；伙伴产物写入库存，入住数组去重。

- [ ] **Step 3: 写牧场 UI 红灯测试**

断言五位可购买卡、龙娘不可购买说明、拥有/价格/每日产物、火水史莱姆机器助理文案和实际购买按钮 dispatch 后状态。

- [ ] **Step 4: 实现牧场 UI 与状态样式**

伙伴卡按目录渲染，已入住显示生产状态；龙娘使用独立终局卡，明确“矿洞第 20 层或 20,000 金币”。

- [ ] **Step 5: 运行定向测试与提交推送**

Run: `pnpm test:run src/game/reducer.test.ts src/components/modals/specialShops.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 实现魔物娘牧场与每日生产`

### Task 4: 熔炉、磨粉机、料理与统一时间队列

**Files:**
- Create: `src/components/stage/FarmWorkshop.tsx`
- Create: `src/components/stage/FarmWorkshop.test.tsx`
- Modify: `src/game/reducer.ts`
- Modify: `src/game/reducer.test.ts`
- Modify: `src/components/stage/FarmStage.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: actions `BUILD_MACHINE`, `START_MACHINE_JOB`, `CRAFT_ITEM`；`machines.furnace/mill`；`completeMachineJobs(state, absoluteMinute)`。
- Consumes: `MACHINE_RECIPES`, `BUILD_RECIPES`, `knownSpells`, `ranch.residents`。

- [ ] **Step 1: 写机器状态红灯测试**

覆盖建造材料、金币、重复建造；无魔法/史莱姆阻止启动；魔法启动扣 1 精力；史莱姆启动不扣；批量扣料；完成前无产物、到时精确入库；跨日/旅行正常完成；莓果挞配方一次扣料产出。

- [ ] **Step 2: 运行红灯并实现最小状态机**

Run: `pnpm test:run src/game/reducer.test.ts -t "熔炉|磨粉机|莓果挞|机器"`

完成时间使用 `((year - 1) * 365 + day - 1) * 1440 + minutes`；队列输出由统一时间推进结算。

- [ ] **Step 3: 写工坊组件红灯测试**

断言未建造配方、建造按钮、批数 stepper、三种熔炼配方、磨粉、能量来源、剩余时间和莓果挞制造按钮。

- [ ] **Step 4: 实现 `FarmWorkshop`**

用本地字符串批数草稿避免空值被归零；按钮提交时校验最大可加工批数。卡片滚动区有 `aria-label="农场生产工坊"` 与 `aria-live="polite"` 状态。

- [ ] **Step 5: 添加工坊 CSS 与集成**

农场在田区下方显示工坊横向卡片轨道；桌面滚轮/Shift+滚轮、手机触摸滑动可用，页面本身无横向溢出。

- [ ] **Step 6: 运行定向测试与提交推送**

Run: `pnpm test:run src/game/reducer.test.ts src/components/stage/FarmStage.test.tsx src/components/stage/FarmWorkshop.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 添加农场熔炉磨粉与料理工坊`

### Task 5: 矿洞掉落、龙巢战斗与铁匠锻造

**Files:**
- Modify: `src/game/reducer.ts`
- Modify: `src/game/reducer.test.ts`
- Modify: `src/components/modals/MineModal.tsx`
- Modify: `src/components/modals/MineModal.test.tsx`
- Modify: `src/components/modals/BattleModal.tsx`
- Modify: `src/components/modals/BattleModal.test.tsx`
- Modify: `src/components/modals/SpecialShopPanel.tsx`
- Modify: `src/components/modals/specialShops.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `FORGE_EQUIPMENT`、20 层边界、龙娘战斗胜利入住承诺、20,000 金币邀请路径。
- Consumes: `getMineYield`, `FORGE_RECIPES`, `MINE_MAX_FLOOR`。

- [ ] **Step 1: 写矿洞与锻造红灯测试**

覆盖石头、10 层钻石、四级镐子、龙娘额外钻石、20 层不可继续下潜；工具按顺序升级并扣对应锭/金币；长剑/护甲属性只增加目标等级与前级差额。

- [ ] **Step 2: 运行红灯并实现 reducer**

Run: `pnpm test:run src/game/reducer.test.ts -t "矿洞|钻石|锻造|装备|龙娘"`

- [ ] **Step 3: 写组件红灯测试**

矿洞断言本层预估含石头/钻石、20 层龙巢、无第 21 层、金币邀请按钮；铁匠断言移除铜换铁，显示工具/长剑/护甲和材料缺口；战斗断言龙娘胜利结果说明。

- [ ] **Step 4: 实现矿洞、战斗与铁匠 UI**

第 20 层 `safe=false`；普通怪物表不再覆盖龙娘；胜利时设置承诺并在结果卡显示是否已入住。

- [ ] **Step 5: 运行定向测试与提交推送**

Run: `pnpm test:run src/game/reducer.test.ts src/components/modals/MineModal.test.tsx src/components/modals/BattleModal.test.tsx src/components/modals/specialShops.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 完成矿洞龙巢与金属锻造`

### Task 6: 节日限定种子与交易条件

**Files:**
- Modify: `src/game/calendar.ts`
- Modify: `src/game/economy.ts`
- Modify: `src/components/modals/TradeModal.tsx`
- Modify: `src/components/modals/economy.test.tsx`
- Modify: `src/styles/global.css`

**Interfaces:**
- Produces: `getFestivalOffers(day, locationId)`。
- Consumes: `FESTIVAL_SEED_OFFERS`, `getFestivalOnDay`。

- [ ] **Step 1: 写节日条件红灯测试**

按具体年日换算断言：6 月 21 日渔家只有潮汐莲种子；8 月 15 日杂货店只有岩纹南瓜；9 月 9 日铁匠铺只有余烬莓；日期或地点任一不符时三者均不可购买。

- [ ] **Step 2: 运行红灯并实现筛选器**

Run: `pnpm test:run src/components/modals/economy.test.tsx`

- [ ] **Step 3: 将限定商品集成交易 UI**

常驻 `buyItems` 排除 `festivalId` 项；仅把当前会场命中的商品追加，并显示“节日限定 / 今日会场闭市前供应”。

- [ ] **Step 4: 运行定向测试与提交推送**

Run: `pnpm test:run src/components/modals/economy.test.tsx src/game/calendar.test.ts && pnpm exec tsc -b --pretty false`

Commit: `feat: 添加三种节日限定种子`

### Task 7: 存档迁移与异常净化

**Files:**
- Modify: `src/game/game-save-storage.ts`
- Modify: `src/game/game-save-storage.test.ts`

**Interfaces:**
- Consumes: `ITEM_CATALOG`, `MACHINE_RECIPES`, `MONSTER_PARTNERS`, `MINE_MAX_FLOOR`。
- Produces: 兼容旧档的完整 `GameState`。

- [ ] **Step 1: 写迁移红灯测试**

覆盖旧 `ownsMonsterRanch=true`、24 格旧田地、合法动态田地、重复/断行/超过 30 行、机器队列、伙伴去重、龙娘状态、装备等级、矿洞 20 层上限、删除物品和未知物品过滤。

- [ ] **Step 2: 运行红灯**

Run: `pnpm test:run src/game/game-save-storage.test.ts`

- [ ] **Step 3: 实现逐字段净化**

地块先校验行列和 ID 一致性再排序；背包只保留目录 ID；队列只接受已知配方、正整数批数、有限完成时间和匹配输出；伙伴只保留六类且龙娘与状态一致。

- [ ] **Step 4: 运行绿灯与提交推送**

Run: `pnpm test:run src/game/game-save-storage.test.ts src/game/GameContext.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 迁移生产链与牧场存档`

### Task 8: 魔物娘世界书、角色卡与内容版本 3

**Files:**
- Modify: `src/sillytavern/defaults.ts`
- Modify: `src/sillytavern/defaults.test.ts`
- Modify: `src/sillytavern/repository.ts`
- Modify: `src/sillytavern/repository.test.ts`
- Modify: `src/components/SillyTavern/panels/CharacterPanel.tsx`
- Modify: `src/components/SillyTavern/TavernHubModal.test.tsx`
- Modify: `public/content/mistvale-content-pack.json`

**Interfaces:**
- Produces: `PRODUCTION_PARTNERS_ID`, `DEFAULT_CONTENT_VERSION=3`、六张魔物娘卡。
- Consumes: `MONSTER_PARTNERS` 和角色卡上传/导出基础设施。

- [ ] **Step 1: 写默认内容红灯测试**

断言四本默认世界书、21 张角色卡、新世界书六位伙伴条目和生产规则；每张魔物娘卡含五阶段立绘对象、女性标签与新世界书绑定；所有居民卡也绑定新生产书。

- [ ] **Step 2: 写 v2→v3 精准迁移红灯测试**

删除世界规则和村庄档案后升级，断言它们不复活；只新增生产书和缺失的六张魔物娘卡；自定义居民卡文字/立绘不覆盖；设置与默认会话增加生产书绑定。

- [ ] **Step 3: 运行红灯并实现默认内容/迁移**

Run: `pnpm test:run src/sillytavern/defaults.test.ts src/sillytavern/repository.test.ts`

迁移以显式 `PRODUCTION_PARTNERS_ID` 和 `monsterGirlCardIds` 为白名单，不对全部默认内容做 `bulkPut`。

- [ ] **Step 4: 更新角色卡面板文案与回退**

标题显示“居民与共生伙伴”，动态数量不再写死十五；未知 `locationId` 显示“苔灯农场·共生牧场”，五阶段上传 ID 保持唯一。

- [ ] **Step 5: 更新仓库内容包并验证解析**

用默认内容生成无立绘占位的有效 JSON，版本号提升；运行内容包 schema 测试，确保各设备可加载。

- [ ] **Step 6: 运行定向测试与提交推送**

Run: `pnpm test:run src/sillytavern/defaults.test.ts src/sillytavern/repository.test.ts src/sillytavern/content-pack.test.ts src/components/SillyTavern/TavernHubModal.test.tsx && pnpm exec tsc -b --pretty false`

Commit: `feat: 发布魔物娘世界书与角色卡`

### Task 9: 全量审计、浏览器验收与最终交付

**Files:**
- Modify: `README.md`
- Modify: `task_plan.md`
- Modify: `findings.md`
- Modify: `progress.md`
- Modify as required by failing regression: Phase 12 touched files only

**Interfaces:**
- Consumes: 全部 Phase 12 行为。
- Produces: 可复现验收记录和物品获取/用途总表。

- [ ] **Step 1: 运行全量自动测试**

Run: `pnpm test:run`

Expected: 所有测试文件与断言通过，无未处理异常或 act 警告。

- [ ] **Step 2: 运行生产构建与静态审计**

```powershell
pnpm build
git diff --check
rg -n "mushroom|moss-herb|月影菇|蘑菇娘|苔藓药草|REFINE_ORE" src public README.md
rg -n "alert\(|confirm\(|prompt\(" src
```

Expected: build exit 0；删除项和旧精炼动作 0 命中；原生弹窗 0 命中。

- [ ] **Step 3: 桌面 Edge 验收**

在 1440×1000 验证扩建、农田滚轮、机器建造/批次、时间完成、牧场购买、节日交易、铁匠锻造、20 层龙巢；记录 console/page errors、重复 ID 和页面横向溢出均为 0。

- [ ] **Step 4: 手机 Edge 验收**

在 390×844 验证农田/机器触摸滚动、弹层滚动、44px 触控、无页面横向溢出、立绘上传入口可达与返回后状态保留。

- [ ] **Step 5: 生成物品来源/用途审计说明**

README 增加按种子、作物、采集物、矿物、牧场产物、加工品、工具装备、药剂礼物分组的完整表；表格数据与 `ITEM_CATALOG` 一致。

- [ ] **Step 6: 独立代码审查并修复所有 Critical/Important**

请求审查聚焦 reducer 边界、存档污染、内容迁移、物品断链、移动端嵌套滚动和龙娘不可达状态；每个实际缺陷先补失败测试再修复。

- [ ] **Step 7: 最终提交并推送**

```powershell
git add README.md task_plan.md findings.md progress.md src public
git commit -m "docs: 完成生产链与物品审计"
git push origin main
```

验证 `git status --short` 为空且 `git rev-parse HEAD` 与 `git rev-parse origin/main` 一致。
