# Findings & Decisions

## 2026-08-09 · Phase 12 农场生产链与魔物娘生态
- 用户明确要求删除月影菇、蘑菇娘与苔藓药草，并同步改写 NPC 礼物偏好；本轮必须从物品目录、掉落、商店、礼物、世界书、存档和 UI 全链路移除旧引用。
- 新生产闭环包含田地扩建、木石/月铃花掉落、矿洞石头与第十层后钻石矿、熔炉冶炼、磨粉机加工、料理制造、铁匠装备锻造以及装备对扩建/采矿的真实加成。
- 魔物娘固定为奶牛娘、蜂娘、蜘蛛娘、火史莱姆娘、水史莱姆娘、龙娘；前五类进入商店与日常生产，龙娘只由矿洞最深层战斗或高额金币招募。
- 所有新物品都要声明至少一个可验证获取途径与用途；将以集中式物品目录和自动审计测试保证，不依赖人工记忆。
- 用户此前已授权前端决策按推荐方案直接执行，本轮将该授权视为设计/执行方式的预先批准，不再逐项询问。
- 当前领域模型仍是固定 24 格田地、`ownsMonsterRanch` 布尔值、三级工具与无机器状态；熔炉/磨粉机/魔物娘居民和生产队列需要新增可迁移的状态子树。
- 现有物品散落在 `itemDisplayNames`、`shopItems`、作物、NPC 偏好、任务和特殊商店中；没有统一声明获取途径与用途，正是本轮遗漏风险的根源。
- 现有月影菇只在显示名和绮萝礼物偏好出现；苔藓药草只在多位 NPC 礼物偏好出现。旧物品并非商店可购项，删除时仍须净化旧存档库存与世界书/内容包引用。
- 现有铁匠升级动作为单纯扣金币；矿洞掉落只覆盖铜/铁，需把材料成本、镐子倍率、钻石层数与装备属性集中到可测试目录。
- UI/UX Pro Max 建议继续采用高密度深色经营面板、绿色/金色语义令牌、可见焦点和 150–300ms 状态反馈；农田与机器区采用受控 `overflow:auto`，桌面原生滚轮、移动端触摸滚动，并用 `overscroll-behavior: contain` 防止误触发页面回弹。
- 当前作物已经包含余烬莓、潮汐莲、岩纹南瓜，但三类种子不存在；需要将种子登记为节日条件商品，而不是普通季节常驻商店。
- 当前 `REFINE_ORE` 以 3 铜矿换 1 铁矿，和新“同矿物熔炼成对应锭”规则冲突，应删除旧精炼语义并迁移为机器队列。
- 当前矿洞每 5 层一律安全且没有最大层；为满足龙娘终局，将明确最深层为 20 层，并让第 20 层成为龙巢特例而非电梯层，电梯只开放 5/10/15 层。
- `FarmStage` 的农田使用绝对定位固定四行，必须拆成“场景表头 + 可滚动田区 + 可滚动生产区”；仍保留地块按钮与内联详情，避免退化为新模态层级。
- `RanchModal` 当前四张静态卡没有购买动作，且包含需删除的蘑菇娘、岩羊娘与泛化史莱姆娘；需要改为五位可购买伙伴和龙娘终局档案，并显示拥有/每日产物/机器助理状态。
- 角色卡面板按 `tavern.characters` 自动列出并支持五段立绘，新增魔物娘角色卡后无需另造上传组件；但文案“十五位 NPC”和地点查找回退必须改为适配 21 张角色卡及农场伙伴。
- 酒馆默认内容版本目前为 2，迁移逻辑只认识岁时世界书；Phase 12 需要版本 3，仅补入新的生产链与魔物娘世界书，同时给默认居民/会话追加该书，不能复活用户主动删除的其他默认书。
- 存档净化目前只保留初始 24 格地块；动态田地、机器队列、牧场居民与龙娘招募标记都必须逐字段校验，并过滤已删除物品 ID。

## 2026-08-08 仓库级酒馆内容

- 世界书与预设的 SillyTavern JSON 转换函数已经存在，但三个编辑面板没有暴露导入/导出入口；角色立绘会作为 Data URL 写入 Dexie，但缺少格式/体积校验和整包导出。
- 采用版本化 `public/content/mistvale-content-pack.json` 作为 GitHub 仓库默认内容源：仓库主在编辑器导出完整内容包、提交该文件并提升版本后，新设备与已有设备都能加载；同 ID 的仓库内容随版本更新，本机新建的不同 ID 内容继续保留。
- 浏览器端不会保存 GitHub 令牌或直接写仓库；这避免将仓库写权限暴露给所有玩家，同时满足代码仓库主统一发布世界书、预设和角色立绘的需求。

## 2026-08-08 最终审查补强

- NPC 互动当前在打开对话时提前结算；应只在首个远程回合成功后扣精力、增加当日好感，失败或取消时保持原值。
- 酒馆 Context 已集中持有 API 设置与会话/持久密钥，适合暴露 `apiReady` 与就绪错误；对话层据此预先禁用发送，并在失败时保留输入。
- Cohere v2 Chat 使用 `/v2/chat`，但官方模型目录仍为 `/v1/models`。
- 作物仅记录 `remainingHours` 而无时钟推进；旅行是常规时间变化入口，应同步递减所有未成熟作物并在归零时标记 `ready`。
- 最终实现让 API 就绪态直接来源于实际密钥与配置校验；NPC 首个远程回合成功后才结算，失败/取消恢复玩家输入。
- Edge 验收确认缺 API 时对话输入与发送均禁用、设置入口可见，同时地图旅行与空地播种的真实指针路径均可完成。
- 生产构建通过手工分块将主业务脚本控制在 153.63 kB，未出现 Vite 大包警告。

## Requirements
- 游戏类型：模拟经营、类星露谷、剧情驱动，落地为 LLM 交互基础的 Web 游戏。
- 纯前端高保真原型，不实现任何后端；原型需有真实可操作的模拟数据和状态反馈。
- 全站精细像素风，包含 UI、背景、地图；地图必须是完整像素画面而非地点卡片网格。
- 主页面顶部显示地点、日期时间、天气/时段、精力、金钱、五技能和派生数值。
- 农场地点显示地块、作物、成熟进度和可操作状态；其他地点显示女性 NPC 立绘区域、好感度和互动入口。
- NPC 立绘由用户未来上传；原型需要支持好感阶段对应不同图片的产品结构。
- NPC 互动：购买、出售、聊天、提交任务物品、赠礼。
- 地图地点与人口：村长家 3、商店 2、铁匠铺 1、魔物娘商店 3、魔女之家 1、猎人帐篷 1、矿洞 0、渔家 2、图书馆 0、医院 2。
- 系统：村长家随机委托；矿洞分层、怪物、回合制、电梯、挖矿、失败跨日；图书馆学习魔法；商店买卖；魔物娘农场；训练；钓鱼；医院每日一次恢复；魔女之家药剂。
- 技能：钓鱼、农耕、挖矿影响收益；战斗影响生命和物攻；魔法影响魔力和魔伤；金木水火土相克。
- 每日初始精力 5；聊天、送礼、挖矿、学习、训练、钓鱼等消耗精力。
- 所有指定交互至少有完成结构的模态框/标签页，优先填充具体示例内容。
- 使用现代字体、细腻微交互、内部警告/通知、高端视觉、语义 HTML、唯一描述性 ID 和性能优化。
- 禁止 emoji，使用统一高级 SVG 图标。

## Research Findings
- 当前项目目录只有 outputs/ 与 work/，没有前端代码、package.json、设计文件或可复用资产。
- 当前目录不是 Git 仓库，无法检查近期提交或提交设计规格。
- UI/UX Pro Max 强调：先生成完整设计系统；44px 以上点击目标；SVG 图标；150–300ms 因果动效；语义颜色令牌；减少布局抖动；支持键盘、焦点与 reduced-motion。
- 对本项目而言，像素画负责世界与材质，现代 HUD 负责信息层级；两者需要同一套颜色、描边、阴影和动效节奏，避免“复古场景 + 普通后台卡片”的割裂。
- UI/UX Pro Max 的两次设计系统候选分别偏向霓虹复古与粗野田园，均不适合直接照搬；可提取其中的高对比、非对称布局、森林绿/琥珀色与 150–300ms 动效，再重组为“暮色乡野 × 隐秘魔法”的原创方向。
- 推荐色彩不使用搜索结果中的纯白大底或青紫霓虹，而使用深苔绿、夜蓝黑、羊皮纸米色、铜金和浆果红，既支撑精细像素画也能保证中文信息可读性。
- UI 动效应限制在每个视图 1–2 个关键层级：地图呼吸光、成熟作物闪烁、模态框来源缩放、数值变化浮动；全部支持 `prefers-reduced-motion`。
- 完整像素地图上覆盖透明语义热区，并提供地图图例/地点抽屉作为键盘和小屏替代路径。
- 图标基准选 Phosphor outline/duotone（地图、定位、好感等），线宽、尺寸和填充层级统一；游戏专属技能与五行符号可制作同语言的内联 SVG。

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| 推荐 React + TypeScript + Vite | 适合密集前端状态、模态框、战斗流程和无后端原型，构建快速且交付简单 |
| 推荐 Zustand 或局部 reducer 管理模拟游戏状态 | 比搭建服务层更轻，足够驱动体力、金钱、好感、位置、农田和战斗演示 |
| 图标使用统一 SVG 线性/双色体系 | 满足禁止 emoji 与风格一致要求，关键状态可像素化描边 |
| 像素主地图/场景作为优化后的 WebP/PNG，交互热点为语义按钮叠层 | 保证地图是完整像素画，同时保留键盘与自动化测试能力 |
| 视觉基调推荐“暮色乡野 × 隐秘魔法” | 比常规明亮农场更独特，能同时容纳经营温度、魔法、矿洞与魔物娘内容 |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| 项目无已有技术栈可遵循 | 在设计阶段提出推荐栈，待用户确认方向后再初始化 |
| brainstorming 设计门禁要求先确认方案 | 先完成设计与关键选择，不提前生成不可逆的视觉资产或代码 |

## Resources
- UI/UX Pro Max skill：`C:/Users/qixin/.codex/skills/ui-ux-pro-max/SKILL.md`
- Image generation skill：`C:/Users/qixin/.codex/skills/.system/imagegen/SKILL.md`

## Visual/Browser Findings
- 已使用内置 imagegen 生成连续村庄地图：1672×941，精细像素画；西侧魔法森林、北部猎人营地与矿洞、中央村务建筑、右下海岸渔家形成自然区域，10 个目标建筑可辨识且无文字/UI/卡片分割。
- 已生成暮色农场背景：1672×941；农舍和温室在左上、工具棚在右上、远景村落与钟楼居中，大面积中下部为平整耕地，适合叠加 4×6 DOM 农田热区。
- 两张图统一使用深苔绿、夜蓝、铜金灯光与克制紫雾，像素颗粒与光照风格一致；无需针对性重生成。
- 已生成第三张地点场景图集 `location-atlas.webp`，覆盖商店街、药庐、矿洞与海岸等非农场场景，通过 CSS 定位复用以减少请求数量。
- 1440×900、1024×768、768×1024、375×812 四个视口的 `scrollWidth` 均与视口宽度一致；没有横向溢出元素。
- 最终浏览器检查共发现 55 个 ID、55 个唯一值；控制台错误为 0。
- 背包模态框在桌面为 1040×556.5，在 375×812 手机视口为 363×780；NPC 互动面板为 429×414，均完整位于视口内。
- UI/UX Pro Max 最终审计促成统一 z-index 令牌、44px 点击目标、`prefers-reduced-motion` 降级、流式回复停止反馈和 WebP 资源优化。

## 2026-08-06 地图与 SillyTavern 改造发现
- 用户截图稳定复现：地图容器使用裁切式显示，而地点热区仍按原始整图百分比定位，因此缩放后热点与建筑不在同一坐标空间。
- 根因修复应让“底图和热点”成为同一个可平移画布，由同一 transform 驱动；不能只移动图片或只改热点百分比。
- 拖拽需要鼠标、触控、键盘方向键三种路径，并提供重置/定位当前地点按钮，避免手势成为唯一操作方式。
- `/sillytavern-web` 检测目标项目为 React；采用技能推荐默认：游戏模式开启、默认 6 标签开启、次 API 关闭、schema-first 关闭。
- SillyTavern 集成必须保留纯前端边界：Dexie/IndexedDB 持久化世界书、预设、角色卡、会话和变量；API 配置只存本机，未配置时使用本地剧情回复降级。
- 全面酒馆化不是替换现有经营主舞台，而是把 NPC 对话、世界书命中、预设、历史分支、变量面板与角色卡管理嵌入现有像素 UI。
- 现有 `VillageMap` 将 `<img>` 和绝对定位热点放在同一容器，但图片 CSS 使用 `object-fit: cover`；百分比热点依据容器而不是裁切后图片的可见坐标，这是根因的代码证据。
- 源码与测试中共有 21 处“金叶”，需要生产文案与测试期望同步替换为“金币”。
- sillytavern-web 技能仓库包含 React 核心引擎、Dexie 数据库、导入器、提示词组装、变量/流解析、API 路由、三个 hooks 及世界书/预设/游戏视图编辑组件模板。
- 现有 `DialogueView` 仅保存组件内消息并调用本地模拟 Provider；酒馆化需要把它升级为持久会话入口，同时保留精力消耗与好感上下文。
- UI/UX Pro Max 推荐高密度 Bento 信息结构和标准强度微动效；配色检索给出的通用 AI 紫粉方案与现有暮色乡野基调冲突，因此只采纳模块化层级，不替换深苔绿/铜金主题。
- 地图拖拽按 UX 审计必须包含 44px 控件、8px 间距、可见焦点、触摸 `touch-action`、拖动阈值、键盘替代和明确的拖动提示。
- 酒馆管理区采用“主对话舞台 + 右侧上下文抽屉 + 顶部世界书/预设/角色卡入口”的嵌入式 Bento 结构，避免把现有经营界面整体替换成普通聊天应用。
- 用户已明确新的边界：先创建默认禁用的 API 适配接口，但当前不连接 LLM、不创建或读取密钥；先完成酒馆化 UI 与本地数据能力。
- 公网搜索未索引 `ariespo/tavernlike` 仓库，不能依据同名或相似搜索结果推断内容；需要通过 GitHub 仓库接口或 skill-installer 直接读取实际目录。
- GitHub 树接口确认仓库根目录即为技能，含 34KB `SKILL.md`、两份详细设计规格、两份 v3 实施计划，以及完整 React SillyTavern 核心/编辑器模板。
- 已通过官方 `skill-installer` 安装为 `C:/Users/qixin/.codex/skills/tavernlike`；其能力会在后续任务中持续可用。
- 安装后的 `tavernlike` v3 技能与本机 `/sillytavern-web` 使用同一套 React 核心约定：Dexie、世界书匹配、提示词排序、六标签流解析、多会话、变量快照与编辑器 UI。
- 当前阶段采用“本地优先适配层”：保留 API 稳定接口与设置状态，但不包含可达的网络实现；连接页明确显示未接入，密钥不持久化。

## 2026-08-07 新手开局、真实 API 与地图点击修复
- 用户明确推翻上一阶段“API 只禁用占位”的边界：现在必须允许玩家像 SillyTavern 一样配置模型 API，并让 NPC 互动文字由模型实际生成。
- 用户提供的参考界面强调：连接配置、供应商、密钥、模型、连接测试和有效状态应集中在 API 标签内；本项目继续沿用深苔绿/铜金像素控制台，而不复制参考图的红黑样式。
- 参考图以 DeepSeek 为当前供应商。实现选择“DeepSeek 预设 + 通用 OpenAI-compatible 自定义端点”，不在开发环境配置或读取真实密钥；玩家在浏览器界面自行输入，密钥默认仅保留当前会话，可明确选择保存到本机 IndexedDB。
- 当前环境与仓库均不存在 `OPENAI_API_KEY`；本阶段不使用 Codex/OpenAI 项目密钥进行开发或测试，也不会提交任何凭据。
- 地图截图显示右下六宫格遮挡有效画面且与直接拖动功能重复；推荐删除四个方向按钮，仅保留紧凑的“定位当前地点”和“重置视野”操作，键盘方向键与触摸/鼠标拖动仍保留。
- 已知真实浏览器验收曾出现“拖动后第一次点击热点被吞”：现有防误触标记在空白区域拖动结束后可能持续到下一次热点点击，这是本轮需要用浏览器回归测试确认的首要根因假设。
- 新手初始化应改为第 1 天、农场、基础 5/5 精力、少量金币、少量种子、空农田、无高级材料/装备/任务进度；世界书和角色卡等创作数据不随游戏新档清空。
- 根因验证成立：`suppressHotspotClickRef` 在空白地图拖动结束后会一直保持为 `true`，直到某个建筑点击主动清除，因此下一次真实点击只会被吞掉；零延迟定时清除既能过滤拖动产生的合成 click，也能恢复后续点击。
- 远程模型不需要改写现有世界书/角色卡仓储；在 TavernProvider 的发送边界按 `adapterMode` 选择本地或远程引擎，可以保持所有 NPC 入口和六标签楼层的数据结构一致。
- DeepSeek 与大多数兼容服务可统一到 `GET /models` 和 `POST /chat/completions`；流式实现必须同时处理跨 chunk 的 SSE 行、`data:` 前缀和 `[DONE]`，并保留非流式 JSON 回退。
- 真实浏览器证明 API 配置在 1440×900 与 375×812 均可用：84 个 ID 全部唯一，主要输入/按钮为 44px，手机面板无横向滚动，0 console/page errors。
- 最终地图回归证明修复有效：拖动后偏移发生变化，随后建筑点击产生行程预览并可抵达杂货店；精简后的两个辅助按钮不会影响鼠标、触控或键盘拖动能力。

## 2026-08-08 强制 API、多供应商与玩法设置
- 用户明确要求删除本地叙事选项：NPC 对话必须依赖玩家配置且验证通过的模型 API；未配置时应阻止发送并直接引导到接口设置。
- 参考供应商清单包含 Azure OpenAI、Chutes、Claude、Cloudflare Workers AI、Cohere、DeepSeek、Electron Hub、Fireworks AI、Groq、Google AI Studio、Google Vertex AI、MistralAI、MiniMax、Moonshot AI、NanoGPT、OpenRouter、Perplexity、Pollinations、SiliconFlow、xAI 与 Z.AI；必须依据各自官方文档区分 OpenAI-compatible、Anthropic Messages、Gemini 与 Azure 部署路径。
- 设置页不能继续是静态概念图；需要可持久化、可恢复默认值并真正进入 reducer 规则计算的经验、好感、掉落、金币、作物生长、钓鱼、战斗与精力消耗设置。
- 用户再次稳定复现地图与播种入口不可达，说明上一轮只覆盖了内部组件路径，必须补充从主页面真实指针点击到弹层/操作按钮的浏览器回归。
- 农田根因已在源码中确认：`FarmStage` 的空地详情只显示说明文字，`GameAction` 与 reducer 完全没有播种动作；虽然初始背包已有种子，界面并不存在任何可以执行种植的按钮。这不是点击失效，而是功能缺失。
- 地图上一轮浏览器脚本使用 `element.click()` 绕过了真实命中测试，因此没有覆盖玩家实际点击；本轮必须以 Playwright 鼠标点击建筑热点，并检查行程卡与按钮是否处于当前可见/可点击区域。
- 当前 API 默认仍为 `adapterMode: local`，Context 会真实调用 `createLocalTurn`；UI 的模式下拉、状态徽标、对话页和楼层类型都保留本地分支，必须从默认值、迁移、Context 和文案四层一起移除。
- UI/UX Pro Max 推荐设置页采用高密度深色控制台、受控表单、分组与渐进披露；数值输入在移动端使用正确 inputmode，错误在字段附近通过 `role=alert` 通知，主要触控目标保持 44px。
- 地图真实点击的高概率根因是指针捕获时机：`handlePointerDown` 无论是否拖动都立即把 pointer capture 交给视口；浏览器随后可能把 `pointerup/click` 重定向到视口而不是建筑按钮。正确边界是超过 6px 拖动阈值后才捕获，普通点击必须完整留在热点按钮上。
- 行程卡 CSS 本身位于地图容器右下并有 `z-index: 12`，高于世界层与遮罩，因此“按钮不出现”不是卡片被 CSS 层级遮挡的首要解释。
- 玩法状态集中在单个 `GameState` + reducer 中，适合把规则设置作为 `GameState.settings` 的纯数据，并让所有收益/消耗在 reducer 边界统一调用倍率函数；界面设置可单独持久化到 localStorage，避免与世界书 IndexedDB 混杂。
- 基线 Edge 复现已形成红灯证据：空地详情可见但播种按钮数量为 0；真实鼠标点击杂货店热点后行程按钮仍不可见，控制台无错误。这与“缺失播种动作”和“过早 pointer capture”两个根因一致。
- Microsoft 2026 官方 Azure OpenAI v1 文档给出 `{endpoint}/openai/v1/chat/completions`，支持 `api-key` 或 Authorization；因此 Azure 不能简单套用当前固定 Bearer + 基础路径拼接，注册表需要可配置认证头与完整聊天路径。
- Cloudflare Workers AI 官方 REST 路径是 `https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{MODEL}`，Bearer 鉴权且响应包在 `result.response`；它需要 Account ID，不能当成普通 `/chat/completions` 服务。
- Cohere 官方 v2 Chat 使用 `https://api.cohere.ai/v2/chat`、Bearer、`messages`，非流式正文位于 `message.content[0].text`，SSE 事件格式也不同；应独立适配而非伪装成 OpenAI-compatible。
- 第一批官方检索没有稳定返回 Anthropic、Chutes 与 Fireworks 页面，后续改用各官方文档直达链接或限定域名继续核对，不能凭记忆填端点。
- Chutes 官方当前提供 `https://llm.chutes.ai/v1` 的 OpenAI-compatible 网关，Bearer 鉴权，支持 `GET /models`、`POST /chat/completions` 与流式输出；默认模型应从实时列表读取，不硬编码容易过期的单一 ID。
- Fireworks AI 官方 Chat Completions 为 `https://api.fireworks.ai/inference/v1/chat/completions`，Bearer 鉴权，请求/响应可复用 OpenAI 协议解析。
- Groq 官方模型列表位于 `https://api.groq.com/openai/v1/models`，Bearer 鉴权；其聊天补全属于同一个 `/openai/v1` OpenAI-compatible 根地址。
- Claude 官方 Messages 参考已定位到 `platform.claude.com/docs/en/api/messages`，仍需继续提取精确认证头、请求体和 SSE 事件字段后再编码。
- Google AI Studio 使用 Gemini 原生协议：`generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent`，通过 `x-goog-api-key` 鉴权，请求体为 `contents`，不能直接复用 OpenAI `messages`。
- Mistral 官方接口为 `https://api.mistral.ai/v1`，Bearer 鉴权，提供 `/models` 与 `/chat/completions`，流式输出采用 `data:` 与 `[DONE]`，可归入 OpenAI 兼容适配层。
- MiniMax 当前国际站官方文档提供 OpenAI SDK 兼容入口 `https://api.minimax.io/v1`；聊天模型可走 Chat Completions，角色扮演专用能力仍需要保留可编辑模型名。
- OpenRouter 官方 Chat Completions 为 `https://openrouter.ai/api/v1/chat/completions`，Bearer 鉴权并支持可选的 `HTTP-Referer` 与 `X-Title` 请求头。
- 多供应商实现不能只扩展下拉框：至少需要 OpenAI 兼容、Anthropic Messages、Gemini、Cohere、Cloudflare Workers AI 五类协议适配器，Azure OpenAI还需 `api-key` 头支持。
- Claude 官方直连根地址为 `https://api.anthropic.com`，请求 `POST /v1/messages`，使用 `x-api-key`、`anthropic-version: 2023-06-01` 与 `content-type`；`max_tokens` 必填，非流式文本位于 `content[].text`，流式正文来自 `content_block_delta.delta.text`，没有 `[DONE]`。
- Google Vertex AI 使用 Gemini 原生 `contents/parts` 数据结构；REST 路径为 `https://aiplatform.googleapis.com/v1/projects/{PROJECT_ID}/locations/{LOCATION}/publishers/google/models/{MODEL_ID}:generateContent`（区域端点亦受支持），以 OAuth access token 的 Bearer 头鉴权，需要项目 ID 和区域字段。
- SiliconFlow 官方文档确认中国站 OpenAI 兼容根地址为 `https://api.siliconflow.cn/v1`；xAI 官方 OpenAPI 确认根地址 `https://api.x.ai/v1`，提供 `/models` 与 `/chat/completions`，两者可复用 OpenAI 协议族。
- Perplexity 官方快速入门声明支持 OpenAI Chat Completions 格式；当前聊天路径是 `https://api.perplexity.ai/chat/completions`，不能擅自加 `/v1`。
- NanoGPT 官方根地址为 `https://nano-gpt.com/api/v1`，提供 OpenAI-compatible `/chat/completions` 与 `/models`；Pollinations 官方统一根地址为 `https://gen.pollinations.ai/v1`，同样支持 Chat Completions、流式和模型目录。
- Z.AI 官方聊天端点为 `https://api.z.ai/api/paas/v4/chat/completions`，Bearer 鉴权、OpenAI 形状响应；默认模型应使用当前文档的 `glm-5.1`，但允许玩家覆盖。
- Moonshot/Kimi 国际站官方文档确认 OpenAI-compatible 根地址 `https://api.moonshot.ai/v1`；Electron Hub 官方文档确认 `https://api.electronhub.ai/v1`，两者都可复用模型目录与 Chat Completions 适配。
- 至此参考图中的 21 个命名供应商都已找到官方或供应商自有文档依据；实现可用元数据注册表统一绝大多数兼容服务，并只为 Claude、Gemini/Vertex、Cohere、Cloudflare保留协议专用代码。
- 当前新手档案在春季第 1 天却发放两种标记为秋季的种子；播种功能恢复时应同步把新手种子调整为春季可种，避免按钮出现后仍造成季节规则冲突。
- 当前游戏奖励分散在聊天、送礼、任务、训练、采矿、战斗、钓鱼、收获、出售等 reducer 分支；规则倍率应通过一组统一纯函数切入这些边界，并在提示文字中显示倍率后的实际数值，避免“设置已保存但实际没生效”。
- `VillageMap` 在 pointerdown 立即 `setPointerCapture` 且同步进入拖动态；修复应把 capture 与 `isDragging=true` 推迟到超过 6px 阈值，并在 finish 时仅对已捕获指针执行 release。
- Phase 8 规则接入点已逐项核对：奖励分别散落在收获、聊天/赠礼、任务、出售、训练/学魔法、采矿、钓鱼与战斗胜利分支；精力消耗散落在聊天、赠礼、训练、学习、下矿、采矿和钓鱼分支；战斗伤害与恢复另有独立计算，因此必须由统一规则函数包裹，避免设置只改变展示。
- `GameProvider` 当前直接以传入状态初始化 reducer 且不做副作用；规则持久化可以在惰性初始化时只合并 `rules` 子树、再用 effect 单独写回，既不覆盖玩家其余游戏状态，也保持测试可注入完整状态。
- 设置模态由 `ModalHost` 的通用 `FutureFeature` 兜底渲染，焦点圈定与 Escape 关闭已经由宿主负责；新的 `SettingsModal` 只需管理规则草稿、应用和内联恢复确认，不应再创建第二层对话框或调用原生 confirm。
- 现有模态最大宽度 1040px、正文独立滚动且手机端已有 12px 安全边距，设置控制台可在该壳内采用顶部概览 + 三组规则卡；不需要修改图标库，现有 settings/reset/save/warning 图标足够表达操作。
- 农场详情已具备非模态地块面板、成长条和三个维护动作，缺口可以在空地状态下复用同一面板增加季节种子卡；播种后不关闭面板即可让 `selectedPlotId` 指向同一已种地块并立即切换成长视图。
- 新手种子 ID 与作物 ID 存在稳定的 `-seed` 后缀映射；播种动作仍需同时校验物品类别、当前季节、库存和空地状态，不能仅靠字符串截断信任调用方。
- JSDOM 25 默认没有完整 `PointerEvent` 构造器，`fireEvent.pointerDown` 无法可靠携带 `pointerId/clientX`；地图阈值测试需要使用测试内的 MouseEvent 子类显式补入 `pointerId`，否则会出现事件处理根本未匹配却误判捕获逻辑的假阳性。
- 第一次全量回归的 3 个失败均为旧测试仍要求 `adapterMode: local` 或“本地叙事”文案；生产实现与本轮强制 API 目标一致，因此正确修复是更新陈旧断言，不应恢复离线分支。
- TypeScript 与 Vite 首次构建成功（4640 modules），但主入口压缩前 522.18 kB 触发 500 kB 分块提示；功能无损但在最终性能验收前应通过 Vite manualChunks 把 React、Dexie 与图标库拆为稳定缓存块。
- 真实 Edge 串行流程发现播种成功 Toast 会固定在右下角，随后打开设置时恰好覆盖粘性“应用规则”按钮并拦截指针；`ModalHost` 与 `ToastRegion` 是相邻兄弟节点，因此模态存在时将通知层降到遮罩后方即可消除阻挡，并在关闭模态后自动恢复，无需丢弃通知。

## 2026-08-08 持久游玩与仓库级内容生产
- 纯前端页面不能在不暴露 GitHub 凭据的前提下直接提交仓库；采用“仓库默认内容包 + IndexedDB 本机覆盖层 + JSON 导入导出”的双层模型。仓库主可提交导出的内容包/静态立绘，使所有设备获得新默认；普通玩家的编辑留在本机。
- 游戏进度适合使用带版本号的 localStorage 自动存档；世界书、预设、角色卡和会话继续使用 Dexie/IndexedDB，避免把大型立绘数据塞进游戏状态。
- API 的“上下文长度”是客户端提示词预算而不是通用请求字段；“最大回复长度”在协议适配器中映射到各供应商的 `max_tokens` / `maxOutputTokens`，UI 不设置 8192 上限，但仍校验正整数。
- UI/UX Pro Max 建议维持高密度、分层深色控制台：表单按职责分组，交互目标不少于 44px，悬停/聚焦过渡控制在 150–300ms，并在 375/768/1024/1440px 逐档检查；本轮沿用项目现有深苔绿与铜金令牌，不引入不一致的紫蓝主题。
- 现有代码已具备世界书、预设、角色卡、Dexie 仓储和导入器基础，可在当前抽象上扩展内容包而不重建第二套酒馆系统。
- `ApiPanel` 仍显式渲染 `tavern-api-reset-base-url`，生成参数仅有温度与 `maxTokens`，且验证层硬编码 64–8192；这三处需要同一迁移完成，避免只改显示文字。
- `TavernDialogue` 把日志、选项、错误和表单作为七个独立网格行，面板又设置 `overflow:hidden`；当选项或回复增高时，末尾表单会被网格总高度挤出可视区。修复方向是让“消息+选项”进入唯一可滚动主体，并把编辑器固定为底部非压缩行。
- 农场热区缺失的直接根因已确认：`locations` 中 `farm` 没有 `mapPosition`，`VillageMap` 又用 `locations.filter(location.id !== 'farm')` 同时排除了桌面热区和手机地点列表。应给农场设置与底图农田一致的坐标并纳入统一渲染；当前位置仍可点击预览但确认按钮应显示“已在此处”或禁用，避免无意义旅行。
- `GameProvider` 目前只从 localStorage 读取/写入 `rules` 子树，其余 `GameState` 每次刷新都回到 `initialGameState`；完整自动存档应替换为版本化整状态序列化，并保留测试显式 `initialState` 的隔离行为。
- 角色卡编辑器已经能把各好感阶段立绘读成 Data URL 并保存至 Dexie；欠缺的是尺寸/类型校验、导出入口以及“本机草稿/仓库默认”说明。无需重新实现上传控件。
- 世界书和预设编辑器已有完整 CRUD，但世界书面板未接入现有 `importer.ts`，预设也没有导入导出；可增加隐藏文件输入与 JSON 下载工具，并由内容包聚合器统一生成可提交到仓库的 `mistvale-content-pack.json`。
- TavernContext 对仓储操作已有稳定 CRUD 边界，内容包导入应通过批量 repository 方法（事务写入）后执行一次 `reloadContent()`，避免组件循环逐条保存导致中间态和多次重渲染。
# Phase 10：SillyTavern 预设兼容调查

- 用户提供的 `夏瑾 天琴座 Beta 1.0.json` 是有效 UTF-8 JSON，约 128 KB，包含 140 个 `prompts`。
- 其 `prompt_order` 与 SillyTavern 官方 OpenAI 预设一致：外层是两个角色槽位组，`100000` 有 11 项，`100001` 有 55 项且启用 28 项。
- 当前导入器只接受 `{ identifier, enabled }[]` 扁平数组，因此在持久化前错误拒绝官方的 `{ character_id, order }[]`。
- 参考项目 `MoRanJiangHu` 同样先规范化分组，再优先选择 `character_id = 100001`，这也是当前兼容层应采用的默认行为。
- 真实文件中另有 5 个提示词使用 Gemini 风格的 `role: "model"`；该值需要在运行时规范化为 `assistant`，但不能因此拒绝整个预设。
- 预设必须保留全部原始字段（包括 extensions 与生成参数）；界面和模型装配通过读取辅助函数解释结构，避免导入后再导出造成数据丢失。
# 2026-08-08 · Phase 11 日历与人物行程

- 当前 `minutes` 可被旅行直接累加到 1440 以上，HUD 只用取模掩盖日期未推进的问题；所有时间变化必须统一进入中央推进函数。
- 现有 `LocationStage` 与 `ContextRail` 通过地点的静态 `npcIds` 判定在场人物，无法表达角色分时移动；应改为根据日历、星期、节日与分钟解析实际地点。
- `GameState.day` 当前没有年度边界，新增 `year` 并将 `day` 约束为年内 1–365，可在保留旧字段的同时兼容现有存档。
- 酒馆变量已有 `day` 与 `location`，但缺少年份、年月日、时刻、节日和 NPC 当前活动；提示词装配的世界书扫描也未读取变量值。
- 默认世界书来自 `src/sillytavern/defaults.ts`，仓库公共内容包目前为空；新增默认岁时世界书即可让新设备初始化时自动获得节日规则。
- 中央日历现已成为日期、星期、节日、生日与十五位 NPC 行程的唯一数据源；场景、人物档案、岁时手册、存档和酒馆变量读取同一组解析函数。
- 默认内容升级到三册世界书；既有设备通过内容版本迁移补入岁时世界书和绑定关系，同时保留本机已编辑的人物性格与独立内容。
- 通知必须以 toast 自身的挂载时间为计时起点，不能用父列表的统一 effect，否则插入新通知会重置旧通知；独立 `ToastItem` 定时器配合 reducer 连续内容去重，能稳定实现 2 秒退出且不无限堆叠。
- 地图行程预览必须按“当前时刻 + 路程”解析预计抵达时的动态人物，直接读取地点常驻数组会与真实场景和节日访客冲突。
- 默认内容升级只应写入该版本新增的岁时世界书；按“所有缺失默认项”回填会复活玩家主动删除的旧书。空世界书表也不能单独作为首次安装判据，需同时检查设置是否存在。
- 存档年份采用 1–9999 的安全范围，并由共享时钟函数在上界停止，避免恶意或损坏 JSON 让星期、跨日和自动存档传播 Infinity/NaN。
- UI/UX Pro Max 建议继续使用高对比精细像素风、密集仪表布局、44px 触控目标、可见字段标签、150–300ms 状态动效和移动端单列重排。
