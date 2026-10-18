# 实现计划：狼人杀 v2 · 9 人局扩展

**分支**: `002-nine-player-board`（目录标识符；项目仓库 `projects/werewolf/` 已建（D40），v2 按任务清单单线推进，不建特性分支） | **日期**: 2026-10-18 | **规格**: [spec.md](spec.md)

**输入**: 同目录 `spec.md`（97 FR / 6 用户故事 / 13 SC / 39 验收场景）

**规则唯一事实来源**: `docs/游戏规则.md`（v2 · 9 人局，2026-10-18 生效，§12.2 无未定项）。
本 plan 与其冲突时无效，须回改本 plan。**本阶段不改任何代码、不改规则文档、不改 `specs/001-*`。**

## 概要

把已交付的 v1（6 人局：2 狼 + 预言家 + 3 村民，8 阶段，125 用例）扩展为
**v2 九人局：3 狼 + 预言家 + 女巫 + 猎人 + 3 村民**，并落地 v2 新增的全部规则面：
18 阶段状态机、屠边判胜、女巫双药、猎人开枪、明暗牌、警长竞选（报名 / 发言 / 退水 / 投票 / PK）、
1.5 票（半票整数）、遗言、警徽流（生前预设 + 死亡移交 + 流失）、死亡后续链的固定顺序、
真人 1–9 配置、hot-seat 遮挡页、竖屏手机优先界面、整局记录导出与重放。

技术方案（关键决策与备选论证见 [research.md](research.md) D1–D13，
实体 / 状态机 / 转移表 / 死亡链见 [data-model.md](data-model.md)）：

- **四模块不变**：`rng/`（原样保留）→ `engine/`（纯状态机，18 阶段规格表 + 纯转移函数 + 门面）
  → `ai/`（只读 `VisibleView` 的确定性策略）→ `ui/`（React，只消费 `eventsFor(投影座位)`）。
- **状态机即规则**：`phases.ts` 的 18 项规格逐行对应规则 §5.1，`transition.ts` 逐行对应 §5.2 的 18 行。
- **死亡结算链是显式队列**（`chain.ts`）：`queue` + `ChainResume` + `step`，全 JSON 可序列化；
  枪杀新死亡 `unshift` 到队首 ⇒ 深度优先顺序是结构保证，不靠调用顺序巧合。
- **1.5 票用半票整数**：`weightHalf ∈ {2,3}`、`tallyHalf` 整数比较、`displayHalf` 只做展示。
- **信息隔离单咽喉点**：`viewFor` / `eventsFor` 双通道同源，`VisibleView` 的类型层写不出他人隐藏信息。
- **可复现**：唯一 seeded rng 由 Engine 持有，`decisionRequest()` 是唯一借出口（v1 保留）。

## 技术上下文

**语言/版本**: TypeScript 5.9（strict）

**主要依赖**: React 18.3、Vite 8、Vitest 4（lockfile 定版）；**零新增运行时依赖**
（rng 自实现；不引入状态机库、UI 库、decimal 库——理由见 research D1/D4/D12）

**存储**: 无（内存态单局；唯一持久化动作 = 终局导出 `.json`）。spec 明确不含存档 / 断线续玩

**测试**: Vitest，23 个套件 / 约 276 用例（见 §测试布局与 §v1 迁移总账）

**目标平台**: 现代 evergreen 浏览器（竖屏手机优先，375×812 基准）；
**Node ≥ 20 必须能直接驱动 engine/ 与 ai/**（联机预留，规则 §11-1）

**项目类型**: web-app（单页、无后端、无持久化，刷新即重开）

**性能目标**: 单次 `dispatch` 同步 < 5ms；9 人局整局 < 200ms；AI 可读延时（300–800ms）只在 UI 层

**约束**: `projects/werewolf/AGENTS.md` 5 条硬约束 + 本任务追加的 5 条架构硬约束（见 §约束符合性检查）

**规模/范围**: 1 个页面、4 个模块 / engine 内 10 个文件、`ui/` 约 10 个文件；
不做联机 / 账号 / 匹配 / 持久化 / 美术 / 扩展角色 / LLM 玩家（spec「本版不含」9 项）

**NEEDS CLARIFICATION**: **0 个**。规则 §12.2 明示「无未定项」；D77/D78/D79 已在
`docs/决策与待办.md` 定案并在 research D8/D9 落成方案。剩余两处属**规则文档表述同步**
（§5.4「相位无关」、§8-9「同一屏」），不是设计未知项，见 §风险与未决。

## 约束符合性检查

*门槛：Phase 0 前通过；Phase 1 设计后复检。*

> ⚠️ **说明**：`projects/werewolf/.specify/memory/constitution.md` 仍是**未填充的占位模板**
> （无任何已批准原则，与 v1 plan 阶段相同）。因此本检查的实际 gate = `projects/werewolf/AGENTS.md`
> 的 5 条硬约束 + 本任务追加的 5 条架构约束。constitution 正式制定后需补检（已登记为遗留项）。

### Phase 0 前（设计前）评估

| # | 门槛 | 结论 | 设计上的保证 |
|---|---|---|---|
| C1 | `engine/` 不得 import react / DOM，可被 Vitest 裸驱动 | ✅ | engine 只依赖 TS 类型与 `rng` 接口；`tests/` 直接 `import` 引擎驱动 |
| C2 | `engine/` 与 `ai/` 禁止直调 `Math.random`，随机只走注入的 seeded RNG | ✅ | 唯一 `Rng` 由 Engine 持有；`decisionRequest()` 是唯一借出口（v1 保留）；自锁测试扫描源码 |
| C3 | AI 只用其座位可见信息（`viewFor`），不得读 `eventLog`、不得 import 引擎内部 | ✅ | `DecisionRequest{view, legalTargets, rng}` 是唯一入参；`ai/` import 白名单（类型 + ai 内部） |
| C4 | 事件流可序列化，UI 只消费 `eventsFor(自己座位)` | ✅ | 19 类事件全纯 JSON、无墙钟（event-stream §1）；UI 投影座位恒为 `lastHumanActor`（hotseat-ui §3） |
| C5 | 规则变更流程：先改 `docs/游戏规则.md` → 再改代码与测试 | ✅ | 本 plan 未改任何规则；18 阶段 / 18 行转移 / 19 类事件逐条引用规则章节 |
| A1 | `engine/` 与 `ai/` 零 react/DOM，**也能跑在 Node 服务端** | ✅ | 零 I/O、零全局、零 `await`；同步纯函数；`viewFor/eventsFor` 即将来下发的报文 |
| A2 | 随机只经注入 seeded RNG；`decisionRequest()` 是唯一借出 rng 的入口 | ✅ | 与 C2 同一条；engine 自身只在发牌消费 rng |
| A3 | AI 不读 `eventLog`、不 import 引擎内部状态 | ✅ | 与 C3 同一条；`presetPolicy` 只传 `VisibleView`（research D5） |
| A4 | 事件流可序列化，UI 只消费 `eventsFor(自己座位)` | ✅ | 与 C4 同一条 |
| A5 | 全部动作与事件为纯 JSON（联机预留） | ✅ | 17 个动作成员 + 19 类事件均无函数 / Date / Map / Set；序列化回路测试 |

### Phase 1 后（设计后）复检

✅ 全部通过。复检结论：

| 复检点 | 结论 |
|---|---|
| 是否引入了 engine → ai 的反向依赖？ | 否。AI 预设求值用 `EngineDeps.presetPolicy` 注入（research D5），engine 只持有函数签名 |
| 是否引入了第 5 个顶层模块？ | 否。仍是 `rng/engine/ai/ui`；engine 内部拆到 10 个文件属模块内组织（data-model §4 注明判据） |
| 是否有隐藏状态没进 `GameState`？ | 否。`settle` / `presetWindow` / `potions` / `election` 全部显式字段，纯 JSON 可序列化 |
| 是否有判定外流到 UI？ | 否。票权、警徽归属、预设、暗牌身份只在 engine；UI 只读 `viewFor`（hotseat-ui §8） |
| 是否需要改规则文档才能实现？ | **否**（判定口径全部有出处）；但 **D78/D79 收窄了规则 §5.4 与 §8-9 的表述**，需 Lisa 回改规则文档（见 §风险与未决） |

**S1 阶段纪律补充**（`docs/阶段体系.md`：高风险变更需即时独立审查）：
本特性把 M5（死亡结算链）与 M6（竞选 + 1.5 票）列为**独立审查检查点**——
两个里程碑完成后各做一次「唱反调」式审查（对规则 §5.3 五性质 / §5.5 五用例逐条反驳），
审查不通过不进下一里程碑。

## 项目结构

### 文档（本特性）

```text
projects/werewolf/specs/002-nine-player-board/
├── spec.md                    # WHAT（已审定，本 plan 的输入）
├── plan.md                    # 本文件（/speckit-plan 产出）
├── research.md                # Phase 0：13 项实现级决策（D1–D13，含 D13 女巫用毒新裁定）
├── data-model.md              # Phase 1：实体 / 18 阶段 / 17 动作 / 18 行转移 / 死亡链 / 计票 / 边界映射
├── quickstart.md              # Phase 1：端到端人工验证（含竖屏走查与 29 条验收映射）
├── contracts/
│   ├── engine-api.md          # 门面、10 种 pending、错误码、计票 API、rng/ai 契约、服务端清单
│   ├── event-stream.md        # 19 类事件、可见性、GameRecord v2、replay
│   ├── visibility.md          # 隐藏信息清单（H1–H14）、角色×信息矩阵、逐字段投影、FR 对账
│   └── hotseat-ui.md          # 真人 1–9、遮挡页闸门、D77/D78/D79、竖屏布局、观战
├── checklists/
│   └── requirements.md        # specify 阶段已产（本阶段未动）
└── tasks.md                   # Phase 2（/speckit-tasks 产出，尚未创建）
```

### 源码（仓库根目录 `projects/werewolf/`）

```text
src/
├── rng/                      # 【原样保留】mulberry32 + FNV-1a + Fisher–Yates
│   ├── rng.ts
│   └── shuffle.ts
├── engine/                   # 纯状态机（零 react/DOM，Node 可跑）
│   ├── types.ts              # 【重写】Seat 1–9 / 5 角色 / 18 阶段 / 17 动作 / GameState
│   ├── events.ts             # 【改造】19 类事件 + GameRecord v2 + exportGame + replay
│   ├── tally.ts              # 【新增】weightHalf / tallyHalf / displayHalf / resolveMajority
│   ├── victory.ts            # 【新增】checkVictory（屠边 3 条 + 优先序）
│   ├── settle.ts             # 【重写】结算点：recordDeaths / settleNight / applyVictory / finalTable
│   ├── chain.ts              # 【新增】死亡后续链：advanceChain / hasLastWords / resolveBadgeTarget
│   ├── phases.ts             # 【新增】PHASES 18 项规格表（actor / legalTargets / accepted / enter）
│   ├── transition.ts         # 【重写】纯转移函数（17 动作 × 18 阶段）
│   ├── view.ts               # 【改造】viewFor / eventsFor（隔离咽喉点，扩五值可见性与新字段）
│   └── engine.ts             # 【改造】门面 + 配置校验 + Deps{presetPolicy} + 狼队代表解析
├── ai/
│   ├── decider.ts            # 【重写】5 角色 × 10 kind 决策矩阵（规则 §7.1–7.5 逐行）
│   ├── speech-templates.ts   # 【改造】保留 6 条，追加竞选/PK/遗言/女巫/猎人模板
│   └── badge-preset.ts       # 【新增】aiBadgePreset（规则 §7.3 纯函数，经 Deps 注入 engine）
├── ui/
│   ├── App.tsx               # 【改造】屏幕路由（setup/cover/play/spectate/over）+ 布局骨架
│   ├── SetupScreen.tsx       # 【新增】种子 / 明暗牌 / 真人座位 1–9
│   ├── CoverScreen.tsx       # 【新增】遮挡页「请 N 号玩家操作」
│   ├── GameLog.tsx           # 【改造】19 类事件渲染（含 0.5 步进计票、遗言、移交、开枪）
│   ├── StatusBar.tsx         # 【新增】轮次/阶段/警长/身份/票权
│   ├── SeatBoard.tsx         # 【新增】9 座位卡（警徽 / 1.5 票 / 明牌身份 / 狼队友 / 你）
│   ├── InputPanel.tsx        # 【重写】按 pending.kind 渲染 10 类面板（含预设控件）
│   ├── hotseat.ts            # 【新增】decideCover 纯函数（可 Vitest 裸测，无 DOM）
│   ├── useGame.ts            # 【改造】驱动循环 + 多真人会话 + 投影座位 + 观战
│   └── styles.css            # 【重写】竖屏单列优先 + 900px 两栏断点
└── main.tsx                  # 【原样保留】
tests/                        # 见 §测试布局
```

**结构决策**：单项目（模板 Option 1 变体）。Vite 项目根在 `projects/werewolf/`（AGENTS.md 既定），
`src/` 四模块 = AGENTS.md 目录约定原样展开；**不引入 monorepo、不拆包、不加顶层模块**。
engine 内部从 6 个文件扩到 10 个：`tally / victory / chain / phases` 四处是 v2 最高风险且可纯函数化的
子系统，各自需要独立测试面与审查单元（判据见 data-model §4）。`ui/` 从 5 个文件扩到 10 个：
9 个屏幕/面板各自独立可测，避免 v1 那种「一个 App.tsx 装 5 个屏」的耦合。

## 六个设计问题的结论

> 详细论证与备选被否理由见 [research.md](research.md)；此处只给结论与落点。

**① 18 阶段状态机怎么组织**：三层——**阶段规格表**（`phases.ts`，18 项声明式：谁行动 / 能选谁 /
接受哪些动作 / 进入钩子）+ **纯转移函数**（`transition.ts`，按 `action.type` 分派到 17 个处理器，
只读规格表做校验）+ **门面**（`engine.ts`，唯一持有 rng 与日志，暴露 dispatch/view/projection）。
否决单一大 switch（306 分支不可与规则表对账）、否决每阶段一个类（板子固定，属投机抽象）、
否决 XState（要另做序列化层 + 新增依赖）、否决无门面的纯 reducer（双账易漂移）。
「引擎零 DOM、可裸驱动、可跑服务端」由「零 I/O + 零全局 + 纯 JSON 进出」保证（research D1）。

**② 死亡结算链怎么表达**：**可序列化的显式队列**。`SettlementState{queue, window, resume, step}` +
纯函数 `advanceChain`：`step` 只在 `last-words → badge → shoot` 三值上前进，可执行则把 `phase`
切到对应阶段并**停下等动作**；不能执行则前进一步或出队；队列空则 `resolveResume()`（存的是
`ChainResume` 三元枚举而不是具体阶段——否则「警长当夜被刀」会在出链时算错去向）。
判胜只放在 `enterSettlement` 第 2 步（全部死亡记录完后一次），成立即 `phase='game_over'` 且
`settle=null` ⇒ 遗言/移交/开枪**结构上不可能发生**。枪杀新死亡 `queue.unshift` ⇒ 深度优先。
`DeathRecord.wasSheriff` 用**死亡瞬间快照**，避免同夜双死时「继承警徽的人再传一次」。
伪代码与五性质逐条对照见 [data-model.md](data-model.md) §6.3–§6.4（research D2）。

**③ v1 代码迁移分类**：**原样保留 3 个文件 / 改造 9 / 重写 6 / 新增 6**（逐文件理由见下节）。
判据：与规则无关的底座（rng、main）原样留；形态对但字段/分支要扩的改造（事件、投影、门面、
驱动循环）；规则形态变了的重写（types、settle、transition、decider、InputPanel、styles）；
v2 独有且高风险的拆新文件（tally、victory、chain、phases、badge-preset、hotseat）。
**两类自锁一条不删**：复现自锁（同 seed×100 全等 + `Math.random` 零字面扫描 + ai import 白名单）、
投影自锁（整局快照 × 全座位 + DecisionRequest 深检）（research D11）。

**④ 1.5 票的实现口径**：`type HalfVote = number`，**最小计量单位 = 半票（整数）**；
`weightHalf(sheriffSeat, voter): 2 | 3`；`tallyHalf(ballots, sheriffSeat): Record<Seat, HalfVote>`；
`displayHalf(h): '3' | '3.5'` 只做展示；`resolveMajority(tally, abstainCount)` 返回
`{max, winners, abstainCount, totalHalf}`，三处投票共用。**全程禁浮点比较**，
且 `vote_cast.weight` 只作展示、计票不回读。规则 §5.5 的 5 个用例逐条可断言（data-model §7.2），
另有「奇偶律」属性测试：含警长票方为奇数、不含为偶数 ⇒ 两个 x.5 永不并列（research D4）。

**⑤ 隐藏信息清单**：H1–H14 共 14 项，逐项给出「谁知道 / 存哪 / 泄露后果 / FR 编号」
（[contracts/visibility.md](contracts/visibility.md) §2），覆盖任务点名的六项：
狼队身份与刀口（H2/H3）、预言家查验（H4）、女巫用药与刀口（H3/H5/H6）、警徽预设（H7）、
暗牌局死者身份（H8）、猎人开枪意图（H10）；另补 H9 边计数、H11 狼队内部选择（D77）、
**H12「现在轮到谁」的推测性泄漏**（v1 踩过的坑）、H13 死因、H14 真人标记。
FR 对账表见 visibility.md §6（FR-005/016/025/026/064/066/083/085/086/090/063/065 + SC-009）。

**⑥ 多人真人 hot-seat 与联机预留**：`GameConfig{seed, mode, humans: Seat[]}`（1–9 座位，
其余 AI 补位）；UI 屏幕状态机 `setup/cover/play/spectate/over`；遮挡页决策抽成**纯函数**
`decideCover(input)`（6 步判定，可 Vitest 裸测）；触发点覆盖 FR-083 的 10 处 + 1 处显式例外；
投影座位恒 = `lastHumanActor`（AI 行动不跟着走）。三条已定口径落地：
**D77** engine 内 `resolveWolfTeamRep`（存活真人狼座位最小者优先），非代表真人狼无 `pending`、
无「队友选择」字段；**D78** `badge_passed{to≠null}` 后置 `sheriff.presetWindow`，UI 给出
`preset-window` 遮挡页（引擎不新增阶段）；**D79** `setBadgePreset` 受回合闸门约束
（`presetWindow` ∨ `pending===null` ∨ `pending.actor===actor`），违反 → `NOT_YOUR_TURN`。
联机预留：客户端不计算票权/警徽/预设/暗牌身份，`viewFor`/`eventsFor` 即将来下发的报文
（research D7/D8/D9 + [contracts/hotseat-ui.md](contracts/hotseat-ui.md) §4/§5/§8）。

## FR 覆盖矩阵（FR-001 – FR-097，97 条全列，无减项）

| 组 | FR | 实现落点 | 验证 |
|---|---|---|---|
| 板子 / 发牌 / 局前配置 | FR-001 – FR-007 | `types.ts` BOARD（3/1/1/1/3）+ `engine.startGame` 配置校验 + `roles_dealt(end)` + UI `SetupScreen` | `identity.test.ts`（1000 seed）、`mode.test.ts`（FR-007：`startGame` 后 `mode` 只读） |
| 夜间流程 | FR-008 – FR-016 | `phases.ts`（狼→女巫→验→亮）+ `transition` 2/3/4 + `settleNight`（解药 0 死、同目标记 poison）+ `potions` | `witch.test.ts`（14）、`phases.test.ts`（跳过口径）、`isolation.test.ts`（女巫私有窗口） |
| 天亮与死亡结算 | FR-017 – FR-019 | `dawn` 入场：`player_died`×0–2 → **一次** `checkVictory` → 链条 | `events.test.ts`（死讯载荷）、`victory.test.ts`、`death-chain.test.ts`（I11/I12） |
| 遗言 | FR-020 – FR-024 | `hasLastWords(window, cause)` + `last_words` 事件 + `viewFor(死者).pending` 例外 | `death-chain.test.ts`（5 类场合表驱动 + 双死顺序）、`hotseat.test.ts`（死者操作权） |
| 警徽流 | FR-025 – FR-032 | `SheriffState` + `resolveBadgeTarget`（遗言 > 预设 > 流失）+ `presetWindow` + 接任者 1.5 票时点 | `preset.test.ts`（10）、`death-chain.test.ts`（V19） |
| 猎人开枪 | FR-033 – FR-037 | `chain` 的 `shoot` 段 + `onHunterShoot`（枪杀 = 新结算点） | `hunter.test.ts`（12）、`death-chain.test.ts`（首夜枪伤链） |
| 警长竞选 | FR-038 – FR-048 | `ElectionState` 状态机（signup / speak+withdraw / vote / pk_speak / pk_vote / result）+ 6 种无警长原因 | `sheriff.test.ts`（26，含 V15「竞选期无死亡」） |
| 票权与计票 | FR-049 – FR-053 | `tally.ts`（半票整数，三处投票共用）；1.5 只在放逐生效 | `tally.test.ts`（规则 §5.5 五用例 + 奇偶律）、`voting.test.ts` |
| 白天发言与定序 | FR-054 – FR-057 | `day_order`（起点 + 方向 → order）+ 无警长座位升序 + 投票恒升序 | `sheriff.test.ts`（V14）、`phases.test.ts` |
| 胜负判定（屠边） | FR-058 – FR-062 | `victory.ts` 三条 if + **唯一调用点** `enterSettlement` + `game_over.finalTable/badgeFlow` | `victory.test.ts`（3 种）、`victory-edge.test.ts`（双屠边优先 / 最后一狼被毒 / 猎人自身判胜） |
| 明暗牌 | FR-063 – FR-065 | `player_died.revealedRole?` + `players[].revealedRole?` 条件字段 + 视图无聚合 | `mode.test.ts`（8）、`isolation.test.ts`（暗牌全程不翻） |
| AI 补位（通用 + 竞选 + 遗言 + 预设 + 开枪 + 定序） | FR-066 – FR-076 | `ai/decider.ts` 5×10 决策矩阵 + `aiBadgePreset` + `presetPolicy` 注入 + 模板纯函数（**女巫毒药见 D13**） | `ai.test.ts`（22）、`preset.test.ts`（AI 求值 4 例）、`reproducibility.test.ts` |
| 对局事件与可见性 | FR-077 – FR-080 | `events.ts` 19 类 + 5 值可见性 + `GameRecord v2` + `replay` | `events.test.ts`（25）、`record-replay.test.ts`（8） |
| 界面与交互（竖屏优先） | FR-081 – FR-093 | `ui/` 10 个屏幕/面板 + `decideCover` + 状态条/座位卡/预设控件 + 终局导出 | `hotseat.test.ts`（10）、quickstart §1.2 人工走查（SC-010） |
| AI 夜晚行动与发言 | FR-094 – FR-097 | 女巫：解药救刀口 + **毒药查杀优先 → `round≥2` 评分必用（D13，需改 FR-094）**；狼刀/验人随机经 `req.rng`；模板纯函数；「不放弃推进」断言 | `ai.test.ts`（女巫/猎人/模板/不跳过）、`termination.test.ts` |

**覆盖自检**：15 组 × 97 条，逐条给出落点与验证；无「有需求无落点」。
逐条清单见 **附录 A**（97 / 97）。

## v1 迁移分类（逐文件）

| 文件 | 判定 | 理由（一句话） |
|---|---|---|
| `src/rng/rng.ts` | **原样保留** | 单流 mulberry32 + FNV-1a 与规则无关，改它等于单方面推翻「同 seed 同局」（SC-003）的承诺 |
| `src/rng/shuffle.ts` | **原样保留** | Fisher–Yates 纯函数，v2 发牌仍是一次洗牌 |
| `src/main.tsx` | **原样保留** | React 挂载逻辑与规则无关 |
| `src/engine/events.ts` | **改造** | 事件骨架与 `exportGame` 形态保留；载荷扩 4 处、可见性 4→5 值、`schemaVersion` 1→2、新增 `replay` |
| `src/engine/view.ts` | **改造** | 单一投影咽喉点与 `visibleTo` 结构保留；扩 `witch / 预设 / 暗牌 / 候选人 / 发言顺序` 字段并加「他人预设写不出来」约束 |
| `src/engine/engine.ts` | **改造** | 门面五方法形态不变；加配置校验、`Deps.presetPolicy`、D77 代表解析 |
| `src/ai/speech-templates.ts` | **改造** | 6 条模板仍用；追加竞选 / PK / 遗言 / 女巫 / 猎人模板（仍为纯函数） |
| `src/ui/App.tsx` | **改造** | 只留屏幕路由与布局骨架，内容搬到 SetupScreen / CoverScreen / StatusBar / SeatBoard |
| `src/ui/GameLog.tsx` | **改造** | 渲染管线保留；扩 19 类事件、0.5 步进计票、遗言 / 移交 / 开枪行 |
| `src/ui/useGame.ts` | **改造** | 驱动循环四分支与 StrictMode 防重指纹保留；加多真人会话、投影座位、观战与死者操作权 |
| `index.html` | **改造** | 标题与描述对齐 v2（视口 meta 保留） |
| `tests/helpers/autoplay.ts` | **改造** | 无头驱动循环结构保留；加 `humans / mode` 与代表座位解析 |
| `src/engine/types.ts` | **重写** | Seat 6→9、角色 3→5、阶段 8→18、动作 9→17、GameState 增 5 个子状态——旧类型一行不可用 |
| `src/engine/settle.ts` | **重写** | 「单死 + 即时终局」→「0–2 死 + 结算点 + 待公布」；计票迁出到 `tally.ts` |
| `src/engine/transition.ts` | **重写** | v1 的 7 个函数覆盖 8 阶段；v2 需 18 阶段 × 17 动作 + 链推进，旧骨架会掩盖漏项 |
| `src/ai/decider.ts` | **重写** | 3 角色 × 4 kind → 5 角色 × 10 kind，且新增竞选 / 遗言 / 预设 / 开枪 / 定序五组确定性策略 |
| `src/ui/InputPanel.tsx` | **重写** | v1 四个面板；v2 需 10 类面板（签到 / 退水 / 竞选投票 / PK / 定序 / 遗言 / 开枪 / 预设） |
| `src/ui/styles.css` | **重写** | 桌面三栏 → 竖屏单列优先 + 900px 两栏；`player-table` 在 375 宽溢出，必须换掉 |
| `src/engine/tally.ts` | **新增** | 半票整数计票的唯一实现（SC-005 的高风险口径不该内联在结算里） |
| `src/engine/victory.ts` | **新增** | 屠边 3 条 + 优先序；从 `settle.ts` 拆出以承载 SC-004 的独立测试面 |
| `src/engine/chain.ts` | **新增** | 死亡后续链是 v2 全新子系统（规则 §5.3 五性质），必须有独立文件与独立套件 |
| `src/engine/phases.ts` | **新增** | 18 项阶段规格表替代 v1 的 `derivePending` 大 switch，让「代码条数 = 规则行数」 |
| `src/ai/badge-preset.ts` | **新增** | 规则 §7.3 的纯函数，经 `Deps` 注入 engine（保持 engine ← ai 依赖方向不倒） |
| `src/ui/hotseat.ts` | **新增** | 遮挡页决策纯函数（SC-009(a) 要可测，不能埋在 React 组件里） |

**文件级总账**：**原样保留 3 / 改造 9 / 重写 6 / 新增 6**（24 个文件位：v1 的 18 个触达文件 + 新增 6）。
逐条清点：保留 `rng.ts`、`shuffle.ts`、`main.tsx`（3）；改造 `events.ts`、`view.ts`、`engine.ts`、
`speech-templates.ts`、`App.tsx`、`GameLog.tsx`、`useGame.ts`、`index.html`、`autoplay.ts`（9）；
重写 `types.ts`、`settle.ts`、`transition.ts`、`decider.ts`、`InputPanel.tsx`、`styles.css`（6）；
新增 `tally.ts`、`victory.ts`、`chain.ts`、`phases.ts`、`badge-preset.ts`、`hotseat.ts`（6）。

## v1 测试迁移总账（125 条逐条处置；Lisa 2026-10-18 授权按分类处置）

### 三类清单（总数必须闭合：125 = 保留 + 重写 + 淘汰）

| 类别 | 条数 | 内容 | 处置纪律 |
|---|---|---|---|
| **保留（原样不动）** | **20** | `rng` 12 条（`rng.test.ts` 整文件不动）+ 同 seed ×100 逐字节全等 2 条 + `Math.random` 零字面自锁 2 条 + 同族复现/自锁 4 条（JSON 往返、异 seed 不同、批量复现、`ai/` import 白名单） | **一条都不许少**；断言零改动，只允许改「`createGame(config)` / autoplay」的调用行 |
| **重写（保留测试意图，重写断言）** | **105** | 信息隔离 12 / 身份分配 5 / 昼夜流转 16 / 投票 8 / 胜负判定 8 / 事件 25 / AI 22 / 决策请求 9 —— 因规则变了（屠边、18 阶段、明暗牌、1.5 票、女巫/猎人） | 每条必须给出「旧断言 → 新断言」对照（**附录 B 逐条列出**），**不许静默删除** |
| **淘汰（规则废除）** | **0** | — | 若实施中发现必须淘汰，须逐条写「规则上为什么不再成立」并经 Lisa 确认；本 plan 预判为 0 |
| **合计** | **125** | | 20 + 105 + 0 = 125 ✓ |

> **为什么「保留」只有 20 条**：v1 的多数断言都建立在「6 人 / 8 阶段 / 人数比胜负 / 死亡即翻牌」
> 之上，规则一变，断言口径必然变——即使**测试意图**没变（例如「狼不投队友」），
> 也必须重写断言（新板子、新票权、新 `view` 字段）。因此只有与规则完全无关的
> rng 与复现/自锁类可以「原样不动」。

### 保留类逐条（20 条；验收时按「原文件 + 原用例名 + 仍通过」三点核对）

| # | 文件 | 原用例名 | 为什么能原样不动 |
|---|---|---|---|
| 1 | `rng.test.ts` | shuffle 返回新数组且不修改入参 | 纯算法，与规则无关 |
| 2 | `rng.test.ts` | 结果是原多重集的排列（含重复元素） | 同上 |
| 3 | `rng.test.ts` | 同一浮点流序列 → 同一洗牌结果 | 同上 |
| 4 | `rng.test.ts` | 边界：空数组与单元素数组 | 同上 |
| 5 | `rng.test.ts` | 同 seed（`lisa`）前 100 个 next() 逐个相等 | 复现底座 |
| 6 | `rng.test.ts` | 异 seed 序列不同 | 同上 |
| 7 | `rng.test.ts` | 空串 seed 稳定映射不抛错 | 同上（**seed 留空由 UI 生成，但 rng 仍要能吃空串**） |
| 8 | `rng.test.ts` | Unicode seed 同样稳定 | 同上 |
| 9 | `rng.test.ts` | next() 恒在 [0,1)（10000 采样） | 同上 |
| 10 | `rng.test.ts` | int(min,max) 落在 [min,max) | 同上 |
| 11 | `rng.test.ts` | pick：空数组抛错/非空返回元素之一/同 seed 锁定 | 同上 |
| 12 | `rng.test.ts` | shuffle：新数组/排列/同 seed 锁定 | 同上 |
| 13 | `reproducibility.test.ts` | seed=repro-fixed：autoplay ×100 局逐字节全等 | SC-003 的**核心自锁**，断言一字不改 |
| 14 | `reproducibility.test.ts` | 空串 seed：autoplay ×100 局逐字节全等 | 同上 |
| 15 | `reproducibility.test.ts` | 同 seed 导出文档可 JSON 无损往返、seed 原样保留 | 序列化契约 |
| 16 | `reproducibility.test.ts` | repro-a 与 repro-b 的整局事件流不同 | 异 seed 必须可区分 |
| 17 | `reproducibility.test.ts` | 同一批 seed 各自复现（异 seed 也不同） | 批量复现 |
| 18 | `reproducibility.test.ts` | `src/engine` 全部 .ts 无 `Math.random` | **硬约束 2 的自锁**（v2 自动覆盖新增 4 个文件） |
| 19 | `reproducibility.test.ts` | `src/ai` 全部 .ts 无 `Math.random` | 同上 |
| 20 | `reproducibility.test.ts` | `ai/` 只 import 类型与 ai 内部模块 | **硬约束 3 的自锁**（A3/C3） |

### 重写类：按套件的「旧断言 → 新断言」对照（105 条，逐条见附录 B）

| 套件 | 条数 | 旧断言的共同前提（已失效） | 新断言口径 | 不许丢的测试意图 |
|---|---|---|---|---|
| `decision-request.test.ts` | 9 | 阶段名 `vote`/`exile`；狼队代表 = 最小存活狼 | 10 种 `kind`；代表 = **存活真人狼最小者**（D77）；`day_vote` 游标 | 驱动层只有一个 rng 借出口 |
| `identity.test.ts` | 5 | 狼2/预1/民3、真人恰 1 且随机 | 狼3/预1/女1/猎1/民3、`humans` 配置化 | 发牌计数恒定 + 同 seed 重发一致 |
| `phases.test.ts` | 16 | 8 阶段；夜只有刀/验；死者无 pending | 18 阶段；狼→女巫→验→亮；`last_words`/`hunter_shoot` 对死者有 pending | 三处状态机可测（身份/昼夜/投票） |
| `voting.test.ts` | 8 | 人头票、`tally` 整数、`exile` 阶段 | 半票 `tallyHalf`、`scope` 三值、`weight` 载荷 | 计票正确 / 平票平安 / 自票合法 / 弃票不计 |
| `victory.test.ts` | 8 | 人数比胜负（`wolves-parity`）、6 人终表 | 屠边三种 + 9 人终表 + `badgeFlow` | 终止性与终局解释 |
| `isolation.test.ts` | 12 | 3 角色 / 6 座 / 4 值可见性 / 死亡即翻牌 | 5 角色 / 9 座 / 5 值 / 明暗牌 / 键集合闭包 | 投影是唯一咽喉点 |
| `events.test.ts` | 25 | 11 类事件 / `schemaVersion:1` / 6 人终表 | 19 类 / v2 导出 / `claims[]` / `tallyHalf` 自洽 | 仅凭记录能重建叙事（SC-012） |
| `ai.test.ts` | 22 | 3 角色 × 4 kind；女巫不存在 | 5 角色 × 10 kind；**D13 女巫评分**；不耗 rng 的决策要证明 | AI 确定性 + 只用可见信息 |

### 新增类（v2 独有，151 条）

| 新套件 | 覆盖 | 条数 |
|---|---|---|
| `witch.test.ts` | 解药 0 死 / 同夜一瓶 / 用毒时狼刀照常（双死）/ 不可毒自己 / 任意夜自救 / 用完即无 / 女巫死跳过 / 私有可见性 / **AI 女巫：P1 必用毒、P2 查杀优先、P4 tie-break 座位升序**（D13） | **17** |
| `hunter.test.ts` | 被刀可开 / 被放逐可开 / 被毒不可 / 弃枪 / 枪杀即时判胜 / 无合法目标 / AI 开枪 | 12 |
| `death-chain.test.ts` | 遗言权 5 场合 / 双死顺序 / 遗言与移交解耦 / 判胜跳过链 / 猎人兼警长三段序 / 枪杀新警长再移交 / 队列 FIFO+unshift / `wasSheriff` 快照 / 首夜枪伤链 | 18 |
| `sheriff.test.ts` | 报名 0/1/≥2 / 全员上警 / 全部退水 / 剩 1 人 / 退水窗口与不可撤销 / 警下集合与冻结 / 首投并列 PK / PK 唯一 / PK 再平 / 无有效票 / 定序 / 竞选期无死亡 / 退水者保留投票权 / AI 上警与投票 / AI 永不退水 | 26 |
| `tally.test.ts` | 规则 §5.5 五用例 + 奇偶律 + 守恒律 + 展示值 + 弃票不计 + 三处投票共用 | 10 |
| `victory-edge.test.ts` | 双屠边优先取神灭 / 最后一狼被毒 → 好人胜 / 猎人自身死亡已判胜 / 遗言不判胜 / 每次结算判一次 | 10 |
| `mode.test.ts` | 明牌翻牌 / 暗牌不翻 / 终局全翻 / 暗牌不泄漏边计数 / 遗言不改变口径 | 8 |
| `preset.test.ts` | 仅本人可见 / 无事件 / 目标先死 → 流失 / 遗言覆盖 / 遗言 null 不回落 / 接任者初始未指定 / D78 窗口 / D79 回合闸门 / AI 求值确定性 | 10 |
| `hotseat.test.ts` | `decideCover` 6 步 / 触发点表逐阶段 / 同一人不重复弹 / 移交不弹（除 D78）/ AI 不弹 / 单人 0 次 / D77 代表切换 | 10 |
| `pending-matrix.test.ts` | 18 阶段 × (actor, kind, legalTargets) 全覆盖表驱动 | 8 |
| `record-replay.test.ts` | 19 类事件导出 / `replay` 重建四问 / 与 engine 交叉校验 / 10 局抽检 | 8 |
| `boundary.test.ts` | spec 23 条边界里可自动化的部分（0 死夜、同目标、预设先死、枪杀新警长、反复平票…） | 10 |
| `termination.test.ts` | ≤10 轮终止 / humans 1–9 任意配置 / 0 卡死（**只断言上界，不写死典型轮次**——D13 后死亡变快） | 4 |
| **合计** | | **151** |

### 总账

```text
v1：125 = 保留 20 + 重写 105 + 淘汰 0
v2：保留 20 + 重写 105 + 新增 151 = 276 用例（23 个套件）
```

**验收方式（Lisa 按这三条查）**：

1. **保留 20 条**：能指出「原文件 + 原用例名（附录 B 第 1–20 行）+ `pnpm test` 仍通过」，
   且 `git diff` 里这些用例的断言行**零改动**。
2. **重写 105 条**：附录 B 逐行给出「旧断言 → 新断言」；**不允许**出现「旧用例消失且无对照」的情况，
   也不允许把两条旧用例合并成一条而不留痕（合并须在附录 B 注明「A+B → C」）。
3. **淘汰 0 条**：若实施期必须淘汰，逐条补进附录 B 的「淘汰」小节并写理由，等 Lisa 确认后才合并。

## 测试布局（v2 套件 → 规则 §10 验收）

| 套件 | 主覆盖验收 |
|---|---|
| `rng` / `reproducibility` / `identity` | V03、V04、V25 |
| `phases` / `pending-matrix` / `decision-request` | V05、V14 |
| `tally` / `voting` | V10、V13 |
| `witch` / `hunter` | V06、V07 |
| `death-chain` / `preset` | V16–V22、V20 |
| `sheriff` | V11、V12、V14、V15、V28 |
| `victory` / `victory-edge` | V08、V21 |
| `mode` / `isolation` | V09、V24、V26 |
| `hotseat` | V23 |
| `events` / `record-replay` | V27 |
| `ai` | V25 |
| `boundary` / `termination` | V02、SC-002、SC-008 兜底 |
| **人工**（quickstart） | V01、SC-010、SC-011、SC-012 抽检 |

**口径备注**：「全等」= `JSON.stringify(exportGame())` 逐字节比较（事件无墙钟）；
所有统计断言**先写口径后写数**（工作区交付规范）。

## 里程碑（tasks 拆解的输入）

> 依赖：M1 → M2 → M3 → M4 → M5 → M6 → M7 → M8 → M9 → M10；
> 可并行：M8（事件契约）在 M5 完成后即可与 M6/M7 并行；M4 与 M6 无依赖亦可并行。

| # | 里程碑 | 内容 | 独立验收（怎么验证做对了） | 任务数 |
|---|---|---|---|---|
| **M1** | 底座 | `rng/` 原样保留校验；`types.ts` 重写（Seat/Role/Phase/Action/GameState）；`tally.ts`；配置校验 | ① `tsc --noEmit` 通过；② `vitest run tests/rng.test.ts` 12 绿；③ `tests/tally.test.ts` 10 绿（含 §5.5 五用例 + 奇偶律） | 10 |
| **M2** | 18 阶段骨架 | `phases.ts` 规格表 18 项；`transition.ts` 动作分派；`derivePending`；空转骨架（不含结算细节） | ① `tests/pending-matrix.test.ts` 8 绿（18 阶段 actor/kind/legalTargets 全覆盖）；② 每阶段「非法动作 → `WRONG_PHASE`」表驱动断言；③ 可达性：脚本动作序列能从 `idle` 走到 `game_over` | 14 |
| **M3** | 夜间三角色 | 狼刀 / 女巫双药 / 查验 + `settleNight`（解药 0 死、同目标记 poison、0–2 死）+ 跳过口径 | ① `tests/witch.test.ts` 14 绿；② `tests/phases.test.ts` 夜间序列与跳过口径绿；③ 断言「0 死之夜」不产 `player_died` | 12 |
| **M4** | 判胜 + 明暗牌 | `victory.ts`（屠边 3 条 + 优先序）；判胜**单一调用点**；明暗牌投影 | ① `tests/victory.test.ts` 8 绿；② `tests/victory-edge.test.ts` 10 绿；③ `tests/mode.test.ts` 8 绿（暗牌终局前无 `revealedRole`） | 8 |
| **M5** | 死亡后续链 ⚠️审查点 | `chain.ts`（queue / ChainResume / step / advanceChain）+ 遗言 + 警徽移交 + 猎人开枪 + `wasSheriff` 快照 | ① `tests/death-chain.test.ts` 18 绿（含 §5.3 五性质逐条断言）；② `tests/hunter.test.ts` 12 绿；③ **独立审查**：对规则 §5.3 五性质逐条反驳后仍成立 | 16 |
| **M6** | 竞选 + 1.5 票 ⚠️审查点 | 报名 / 发言 + 退水 / 警下投票 / PK 发言与再投 / 六种无警长 / `day_order` / 放逐计票接 1.5 票 | ① `tests/sheriff.test.ts` 26 绿；② `tests/voting.test.ts` 8 绿；③ 规则 §5.5 五用例在真实票箱上复现（非单测构造）；④ **独立审查**：V11/V12/V15/V28 逐条反驳 | 18 |
| **M7** | AI v2 | 5 角色 × 10 kind 矩阵；模板句；`aiBadgePreset` + `Deps` 注入；D77 代表解析；**D13 女巫用毒评分** | ① `tests/ai.test.ts` 22 绿；② `tests/decision-request.test.ts` 9 绿；③ `tests/preset.test.ts` 中 AI 求值 4 例绿；④ `tests/witch.test.ts` 中 P1–P5 五条性质绿；⑤ 同 seed 两局 AI 决策逐条一致 | 16 |
| **M8** | 事件契约 v2 | 19 类事件 + 5 值可见性 + `GameRecord v2` + `replay` | ① `tests/events.test.ts` 25 绿；② `tests/record-replay.test.ts` 8 绿；③ 导出 19 类全覆盖、`seq` 连续、无时间字段 | 10 |
| **M9** | UI v2 | 竖屏三区 + 设置页 + 10 个屏幕/面板 + `decideCover` + 观战 + 终局导出 + 预设控件 | ① `tests/hotseat.test.ts` 10 绿；② quickstart §1.2 十项走查在 375×812 全过（`scrollWidth === 375`）；③ quickstart §2 的 A–E 五个 hot-seat 场景人工通过 | 20 |
| **M10** | 验收走查 | 规则 §10 的 V01–V29 逐条勾；导出 10 局抽检；spec 23 条边界复验 | ① `pnpm test` 全绿（约 276 用例）；② quickstart §8 表格 29 行全勾；③ `boundary.test.ts` + `termination.test.ts` 绿 | 8 |
| | **合计** | | | **132** |

**为什么这样切**：每个里程碑都对应一组**能独立跑绿 / 独立观察**的验收物（一条命令或一张走查表），
且都落在「可用的最小闭环」上——M3 之后能跑通一夜到天亮，M5 之后单局可完整结束，
M6 之后有警长的完整玩法，M9 之后是能交给 Lisa 真机玩的产品形态。
两个 ⚠️ 审查点是 S1 阶段纪律要求的「高风险变更即时独立审查」。

## 复杂度登记

> 约束符合性检查无违规项，无需豁免表。

无。设计未引入 AGENTS.md 四模块之外的模块、无新增运行时依赖、无投机性抽象：

- engine 内 10 个文件是**模块内组织**，不改变模块边界；拆出来的四个新文件各自对应
  一条高风险验收（SC-004 / SC-005 / §5.3 五性质 / 18 阶段对账）。
- `presetPolicy` 注入是为守住「engine 不依赖 ai」这条分层（research D5），
  不是为将来扩展预留的抽象。
- 否决过：状态机库、UI 组件库、decimal 库、`src/game/` 第五模块、双日志账本、
  `src/v2/` 新目录（理由见 research D1/D4/D6/D11/D12）。

## 风险与未决

### ⛔ 阻塞项 0：D13 需要先改规则文档与 spec（硬约束 5）

Lisa 2026-10-18 裁定「毒药不能烂在手里」，**推翻了现有两处文字**：

| 位置 | 现文 | 需改为 |
|---|---|---|
| `docs/游戏规则.md` §7.1 表格「女巫」行 + §12.1-D | 「毒药仅在有存活公开查杀时用，否则不用」 | 「查杀优先 → `round ≥ 2` 按确定性评分必用」（research D13） |
| `spec.md` FR-094 后半句 | 「毒药 MUST 只在存在公开且存活的查杀目标时使用，否则 MUST 不用」 | 「毒药 MUST 在 `round ≥ 2` 时按确定性评分使用；存在公开存活查杀时 MUST 优先毒该目标」 |

**影响**：M3（夜间三角色）与 M7（AI v2）的实现直接依赖这条口径。
在这两份文件改完之前，M3/M7 **不应开工**（否则实现与文档互相打脸，且验收无出处）。
**本 plan 不改这两份文件**（交付纪律），请 Lisa / 小明先改，再进 tasks → implement。

### 文档同步项（不阻塞实现，但应同批改掉）

| 位置 | 现文 | 应改为 | 来源 |
|---|---|---|---|
| `docs/游戏规则.md` §10-V11 | 「投票人 = 有效候选人之外的存活者」，字面上把已退水者排除在外 | 「上警者不作为投票人；投票人 = 警下 = 未上警者 + 已退水者」 | spec FR-045 已按「退水者仍投票」写死（`specs/002-*` 的 checklists 已记「待办」） |
| `docs/游戏规则.md` §5.4 / §8-9 | 「相位无关」「移交公告页同一屏设置」 | 「自己的操作回合或 `presetWindow`」「走遮挡页」 | D78/D79 |

> 本 plan 的三份设计产物（data-model §10 边界第 16 条、§5.2 的 `voters` 冻结、
> contracts/hotseat-ui.md §4）都已按「退水者仍投票」实现，不依赖规则文档是否已改。

### 最高风险：死亡结算链（M5）

理由：它同时耦合**判胜时机**、**遗言权**、**警徽归属**、**枪杀嵌套**四条规则，
且错误是**静默的**（不崩溃、不报错，只是盘面与终局解释不一致）。
三个具体陷阱已在设计里处理，但都要靠审查与用例兜住：

1. 「先死先赢」：判胜必须在**全部死亡记录完后**只调一次（`enterSettlement` 第 2 步）。
2. 「继承警徽的人又传一次」：`wasSheriff` 必须是死亡瞬间快照（不能用现值比对）。
3. 「枪杀吞掉后续」：新死亡 `unshift` 到队首，深度优先处理完再回队列。

### 其余风险

| 风险 | 影响 | 缓解 |
|---|---|---|
| D78/D79 与规则文档表述冲突（§5.4「相位无关」、§8-9「同一屏」） | 实现会「按 plan 做但违反规则原文」 | 本 plan 显式登记；请 Lisa 回改规则文档两处（不改则 M9 的预设窗口口径无出处） |
| `cause` 公开（H13）会暴露女巫毒杀目标 | 信息隔离度低于理想 | 已在 visibility.md 标注残留泄漏与唯一改动点（`eventsFor` 字段级剥离）；需 Lisa 表态 |
| 竞选 + PK 的状态组合多（26 条用例仍可能漏角） | 边界局面判定错 | M6 独立审查 + `sheriff.test.ts` 表驱动枚举六局面 + `boundary.test.ts` 兜底 |
| 暗牌局「不泄漏边计数」靠约定 | UI 可能自行统计 | visibility.md §7 的键集合闭包 + 递归扫描断言；评审项写进 quickstart §3 |
| 竖屏 375 宽的真实溢出 | SC-010 不过 | M9 验收含 `scrollWidth === 375` 硬断言；换掉 `player-table` |
| 约 276 用例的维护成本 | 后期回归慢 | 大量用表驱动（pending-matrix / death-chain / sheriff），单文件内聚合断言 |
| **D13 改变了 AI 局节奏**（首夜必救 → 0 死；第 2 夜必毒 → 双死） | v1 时代的「夜夜 1 死」类统计断言全部失效；典型终止轮次下降 | `termination.test.ts` 只断言 ≤10 轮**上界**；`witch.test.ts` 用 P1「必用毒」+ 「0 死之夜最多 1 次」锁定新口径；quickstart §1.4 给人工核对表 |
| D13 的评分权重（3/−3/2/−5/2）是拍脑袋定的 | AI 女巫可能毒掉好人，观感差 | 本版明确「不做数值平衡调优」；权重写死在 `decider` 且有 P2/P4 兜底确定性；若观感不可接受，只需改一处常量并重跑 `witch.test.ts` |

### 需要拍板的开放问题（详见交付报告）

0. **D13 的文档修订（阻塞项）**：`docs/游戏规则.md` §7.1 / §12.1-D 与 `spec.md` FR-094 必须先改，
   M3/M7 才能开工。评分权重（`3A −3B +2C −5D +2E`）是否照此固定，也请一并确认。
1. **D78/D79 是否回改规则文档**（§5.4 相位无关 → 回合闸门；§8-9 同一屏 → 遮挡页）。
2. **`cause` 是否公开**（当前设计：公开；若要收紧要加字段级剥离）。
3. **FR-017 后半句「女巫用药结果可从天亮后的对局记录确认」的解释**：
   当前设计 = 通过 `cause` + 死亡数可推断「用没用毒 / 有没有救人」，
   **导出记录**（GameRecord）里可完整确认；若 Lisa 要求玩家可见的日志也直接写「女巫用了解药」，
   则 `witch_action` 需在 dawn 后转为公开（并接受「解药目标 = 刀口」的泄漏）。

---

**产出物索引**：[research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/engine-api.md](contracts/engine-api.md) ·
[contracts/event-stream.md](contracts/event-stream.md) ·
[contracts/visibility.md](contracts/visibility.md) ·
[contracts/hotseat-ui.md](contracts/hotseat-ui.md) · [quickstart.md](quickstart.md)

**下一步**：`/speckit-tasks` 基于本 plan 的里程碑与迁移总账生成 `tasks.md`（Phase 2）。

---

## 附录 A：97 条功能需求逐条落点

> `落点` = 实现层唯一入口（文件 / 函数 / 字段）；`验证` = 主覆盖套件（见 `tests/`）。
> 本表与 §FR 覆盖矩阵同源：矩阵给分组视图，本表给逐条对账，**97 / 97 无减项**。

| FR | 落点 | 验证 |
|---|---|---|
| FR-001 | `types.ts` BOARD（狼3/预1/女1/猎1/民3）+ `startGame` 洗牌发 9 座 | `identity` |
| FR-002 | 发牌 = 一次 Fisher–Yates；座位 = 数组下标（天然唯一） | `identity` |
| FR-003 | `GameConfig{seed,mode,humans}` + `createGame` 校验 + `isHuman` | `identity`、`pending-matrix` |
| FR-004 | UI 层生成 seed 后回填设置页（engine 禁 `Math.random`/`Date`） | 人工 quickstart §1.3 |
| FR-005 | `view.you.role`、`players[].revealedRole`（条件）、`view.teammates` | `isolation` |
| FR-006 | `state.round`（首夜=1，第 N 夜与第 N 白天同号）；`hasLastWords` 用 `window` | `death-chain` |
| FR-007 | `state.config.mode` 只读（`startGame` 后无任何动作能改） | `mode` |
| FR-008 | `phases` + `advanceTo`：`night_wolf → night_witch → night_seer → dawn` | `phases`、`pending-matrix` |
| FR-009 | `wolfKill` 校验（target 存活 ∧ ≠werewolf）；`resolveWolfTeamRep` 一队一声 | `phases`、`decision-request` |
| FR-010 | `view.knifeTarget`（仅女巫 ∧ `night_witch`）+ `view.myPotions` + `night.witch` | `witch`、`isolation` |
| FR-011 | `witchAction{use:'save'}` 校验 = 当夜刀口 ∧ 解药在；无「仅首夜」限制 | `witch` |
| FR-012 | `witchAction{use:'poison'}` 校验：毒药在 ∧ 存活 ∧ ≠ 女巫 | `witch` |
| FR-013 | `advanceTo` 跳过已死行动者的环节（不阻塞） | `phases` |
| FR-014 | `settleNight` 第 1 步：解药生效 → 不记死亡、不产 `player_died` | `witch` |
| FR-015 | `settleNight` 第 2/3 步：刀 + 毒 2 死；同目标改记 `cause:'poison'` | `witch`、`death-chain` |
| FR-016 | `seerCheck` 校验 + 二值结果 + 重复合法；`view.seerChecks` 仅本人 | `phases`、`isolation` |
| FR-017 | `player_died{seat, cause, window, revealedRole?}`；`witch_action`（导出可确认） | `events`、`mode` |
| FR-018 | `settleNight` 死数 ∈ 0–2；枪伤由 `onHunterShoot` 追加 | `witch`、`hunter` |
| FR-019 | `enterSettlement`：①记录全部 ②判一次 ③逐链 | `death-chain`、`victory-edge` |
| FR-020 | `hasLastWords(d) = d.window==='first-night' \|\| d.cause==='exile'` | `death-chain` |
| FR-021 | 队列顺序「狼刀→毒药」；枪杀新死者 `unshift` 队首 | `death-chain` |
| FR-022 | `lastWords` / `skipLastWords` + `last_words{skipped}` public | `death-chain`、`events` |
| FR-023 | `last_words` 分支不调 `checkVictory`（唯一调用点只有结算点） | `victory-edge` |
| FR-024 | `viewFor(死者).pending` 在 `last_words`/`hunter_shoot` 阶段给出 | `death-chain`、`hotseat` |
| FR-025 | `setBadgePreset` 校验（存活 ∧ ≠ 自己 ∧ `null` 合法） | `preset` |
| FR-026 | 预设只改 `sheriff.badgePreset`：无事件、无 `eventsFor`、导出不含 | `preset`、`isolation` |
| FR-027 | `resolveBadgeTarget` 三级解析（遗言 > 预设 > 流失） | `death-chain`、`preset` |
| FR-028 | `direct===null` → 不回落；非法 direct → 回落预设；预设非法 → 流失 | `preset` |
| FR-029 | `badgeLost=true` ⇒ `day_order` 不出现、不再竞选 | `sheriff`、`preset` |
| FR-030 | 移交次数无上限；接任者 `badgePreset=null`；`presetWindow` 当场设置 | `preset` |
| FR-031 | `badge_passed{from,to,reason}` public | `events`、`preset` |
| FR-032 | 票权在 `day_vote` 入口按当时的 `sheriff.seat` 求 `weightHalf` | `tally`、`sheriff` |
| FR-033 | `hunter_shoot` 段条件（`cause ∈ {night-kill, exile}`）+ `hunterPass` | `hunter` |
| FR-034 | 同目标死因记 `poison` ⇒ 不进入 `shoot` 段 | `hunter`、`death-chain` |
| FR-035 | `onHunterShoot`：命中 → 记录 + 判胜；弃枪 → 不判 | `hunter` |
| FR-036 | `step` 枚举顺序 `last-words → badge → shoot`（不可后退） | `death-chain` |
| FR-037 | 枪杀新建 `DeathRecord`（继承 `window`）；`wasSheriff` 快照触发二次移交 | `death-chain` |
| FR-038 | `sheriff_signup` 只在 `round===1 ∧ election.result===null`；首日次序固定 | `sheriff` |
| FR-039 | `signupOrder` = 当日存活座位升序；`sheriff_signup` public | `sheriff`、`events` |
| FR-040 | `{null,'no-candidate'}` + `badgeLost` → `day_speak`（升序） | `sheriff` |
| FR-041 | `{seat,'single-candidate'}` → 跳过 `sheriff_speak`/`sheriff_vote` | `sheriff` |
| FR-042 | `speakStep` 两步（发言 → 退水），每位候选人一次、不可撤销 | `sheriff` |
| FR-043 | `withdrawn` 移出 `candidates`；仍留在 `voters`；PK 无退水 | `sheriff` |
| FR-044 | `candidates.length` 0/1/≥2 三分支 | `sheriff` |
| FR-045 | `voters = 存活 − candidates`（冻结）；`castVote` 目标 ∈ `candidates`；竞选票权恒 1 | `sheriff`、`tally` |
| FR-046 | `resolveMajority` 唯一/并列；PK 名单 = `tiedSeats`；再平 → `tie-exhausted` | `sheriff`、`tally` |
| FR-047 | 全弃 → `no-vote`；`voters` 空 → 未投票即收齐 → `no-vote` | `sheriff` |
| FR-048 | 竞选区间无结算点 ⇒ `player_died`=0（不变式 I15） | `sheriff` |
| FR-049 | `weightHalf` 3/2 + `tallyHalf` 整数 + `displayHalf` 0.5 展示 | `tally` |
| FR-050 | `tallyHalf` 跳过 `'abstain'`；`castVote` 允许 target = 自己 | `tally`、`voting` |
| FR-051 | 三处投票共用 `resolveMajority`（无过半数门槛） | `tally`、`voting` |
| FR-052 | 唯一最高才 `player_died(cause:'exile')`；否则 `day_exile` 空队列 → `night_wolf(round+1)` | `voting`、`victory` |
| FR-053 | `weightHalf` 只在 `scope==='exile'` 启用；竞选传 `sheriffSeat=null` | `tally`、`sheriff` |
| FR-054 | `setSpeechOrder` + `day_speech_order{round,start,direction,order}` | `sheriff`、`events` |
| FR-055 | 无警长时 `order` = 存活座位升序 | `phases`、`sheriff` |
| FR-056 | `day_speak` 游标推进；`speak`/`skip` | `phases` |
| FR-057 | `speech.order` 只管发言；`day_vote` 的 `voters` 恒座位升序 | `phases`、`voting` |
| FR-058 | `victory.ts` 三条 if（狼0 → 神0 → 民0） | `victory`、`victory-edge` |
| FR-059 | `edgeOf(role)`：god = 预/女/猎；villager = 村民 | `victory` |
| FR-060 | `checkVictory` 唯一调用点在 `enterSettlement`；成立即 `game_over` 且 `settle=null` | `victory-edge` |
| FR-061 | 同结算点多死：先全部记录 → 只判一次；多条命中取靠前 | `victory-edge` |
| FR-062 | `game_over{finalTable(9), badgeFlow}` | `events`、`preset` |
| FR-063 | `revealedRole` 条件（`mode==='open'` 或终局）+ `player_died` 同口径 | `mode`、`isolation` |
| FR-064 | `VisibleView` 无任何阵营/边聚合字段 | `isolation` |
| FR-065 | 遗言/移交不改 `revealedRole` 生成条件 | `mode`、`death-chain` |
| FR-066 | `DecisionRequest{view,legalTargets,rng}` 唯一入参 + `ai/` import 白名单 | `ai`、`isolation` |
| FR-067 | 模板纯函数 + 单一 rng 流 + 确定性求值（含预设、定序） | `reproducibility`、`ai` |
| FR-068 | `aiDecider.sheriff-signup`：最小座位狼上警、预言家必上、其余不上 | `ai` |
| FR-069 | 狼悍跳（claim 指向最小存活好人）；预言家公布首夜查验 | `ai` |
| FR-070 | 好人警下投票四步（1 claim / ≥2 取最小 / 无 claim 取最小 / 不弃票） | `ai` |
| FR-071 | 狼警下投票：投上警狼队友；否则非狼候选最小 | `ai` |
| FR-072 | `withdraw` kind 恒返回 `confirm` | `ai`、`sheriff` |
| FR-073 | 遗言模板（含猎人开枪意图）；不跳过；不额外指定 `badgeTo`；预设 null → `badgeTo:null` | `ai`、`death-chain` |
| FR-074 | `aiBadgePreset`（§7.3 四步）+ `Deps.presetPolicy` 注入 | `preset` |
| FR-075 | `hunter-shoot` kind：公开存活查杀优先，否则 `req.rng.pick`；无目标弃枪 | `ai`、`hunter` |
| FR-076 | `speech-order` kind 恒 `{start: 自己, direction:'asc'}` | `ai`、`sheriff` |
| FR-077 | 19 类事件（`events.ts`） | `events` |
| FR-078 | 6 个新事件 public；预设**零事件** | `events`、`preset` |
| FR-079 | `speech.stage` / `vote_cast.weight` / `vote_result.scope` | `events` |
| FR-080 | `GameRecord v2` + `replay(record)` | `events`、`record-replay` |
| FR-081 | `styles.css` 单列三区 + 900px 两栏 | 人工 quickstart §1.2 |
| FR-082 | 全部面板按钮/选择驱动（仅发言为文本框） | 人工 quickstart §1.2 |
| FR-083 | `decideCover` + engine 全部动作校验 `actor`（`NOT_YOUR_TURN`） | `hotseat`、`pending-matrix` |
| FR-084 | `decideCover` 第 3/4/5 条（系统/AI/同人 均不弹） | `hotseat` |
| FR-085 | 竞选面板要素（名单/人数/第 k 位/只列候选/警上警下/票权/退水） | 人工 quickstart §2/§4 |
| FR-086 | PK 提示 + `tie-exhausted` 公告 | `sheriff`、人工 §4 |
| FR-087 | 定序面板 + 实时预览；无警长不渲染 | 人工 §1.2-8、`sheriff` |
| FR-088 | 遗言面板（文本/跳过/警徽处置默认沿用预设/「遗言后才开枪」提示） | 人工 §5.1、`death-chain` |
| FR-089 | `StatusBar` + `SeatBoard`（警徽/1.5 票）+ 面板票权 + 0.5 步进 | 人工 §1.2、`tally` |
| FR-090 | `myBadgePreset` 条件字段 + 目标出局红字 | `preset`、人工 §2.5 |
| FR-091 | 死者收面板；`last_words`/`hunter_shoot` 仍可操作 → 转观战 | `hotseat`、人工 §6 |
| FR-092 | `SetupScreen` 四项（种子/明暗牌/真人座位/开始） | 人工 §0 |
| FR-093 | 终局页四项 + 导出按钮 | 人工 §7 |
| FR-094 | AI 女巫：解药在则救刀口（含自救）；**毒药 = 查杀优先 → `round≥2` 评分必用（D13 重写本 FR，需 Lisa 修订 spec）**；一夜一瓶 | `witch`（17）、`ai` |
| FR-095 | 狼刀 / 验人经 `req.rng`（同一局面同一结果） | `ai`、`reproducibility` |
| FR-096 | `speech-templates.ts` 纯函数模板（无时间/随机/外部状态） | `ai` |
| FR-097 | AI 不放弃推进（有合法目标不弃票、有遗言权不跳过；D13 后「女巫不用药」仅剩 round 1 无查杀 / 药已用 / 已死） | `ai`、`termination`、`witch` |

---

## 附录 B：v1 的 125 条用例逐条处置（保留 20 / 重写 105 / 淘汰 0）

> 用途：Lisa 的验收口径——**保留类**每条能指出「原文件、原用例名、现在仍存在且通过」；
> **重写类**给出「旧断言 → 新断言」对照，不许静默删除；**淘汰类**必须写理由（本表为 0）。
> 用例名为 v1 实测输出（`vitest --reporter=json`）的原文，未改写。

| # | 文件 | v1 用例名（原文） | 处置 | 旧断言 → 新断言 / 备注 |
|---|---|---|---|---|
| 1 | `ai.test.ts` | 候选恒为存活好人（不含队友 4、不含自己 1、不含死者 6） | 重写 | 旧：狼刀候选恒为存活好人 → 新：同 |
| 2 | `ai.test.ts` | legalTargets 里混入队友时仍然不刀队友（策略按视图再过滤一遍） | 重写 | 旧：legalTargets 混入队友仍不刀 → 新：同 |
| 3 | `ai.test.ts` | 只投存活好人——不投队友 4，也不投自己 1 | 重写 | 旧：只投存活好人（不投队友/自己）→ 新：同 |
| 4 | `ai.test.ts` | 未被查杀 → 伪装村民（不点身份、不带 claim） | 重写 | 旧：未被查杀 → 伪装村民模板 → 新：同 |
| 5 | `ai.test.ts` | 被其他座位的查杀声明命中别人 → 仍是伪装村民 | 重写 | 旧：他人被查杀 → 仍伪装 → 新：同 |
| 6 | `ai.test.ts` | claim 命中自己且 result=werewolf → 点名指控者为悍跳 | 重写 | 旧：被查杀 → 点名反驳 → 新：同 |
| 7 | `ai.test.ts` | 后续轮次的历史查杀仍触发反驳（指控者取最近一次） | 重写 | 旧：历史查杀仍反驳（取最近）→ 新：同 |
| 8 | `ai.test.ts` | 已验过的 3/5、自己 2、死者 6 全部排除 | 重写 | 旧：预言家排除已验/自己/死者 → 新：同 |
| 9 | `ai.test.ts` | 所有存活他人都验过时仍能给出合法目标（不抛错、不自锁） | 重写 | 旧：全验过仍给合法目标 → 新：同 |
| 10 | `ai.test.ts` | 最新查验是查杀 → claim 带 result=werewolf，模板句含「查杀」 | 重写 | 旧：最新查杀 → claim werewolf + 模板 → 新：同 |
| 11 | `ai.test.ts` | 最新查验是金水 → claim 带 result=good，模板句含「金水」 | 重写 | 旧：最新金水 → claim good + 模板 → 新：同 |
| 12 | `ai.test.ts` | 第 2 个白天公布最新查验（规则 §5 只钉首个白天，后续沿用同一「公布最新查验」口径） | 重写 | 旧：第 2 白天仍公布最新查验 → 新：同 |
| 13 | `ai.test.ts` | 查验史里有存活查杀 → 投该查杀（不看 rng） | 重写 | 旧：存活查杀 → 投他（不看 rng）→ 新：同 |
| 14 | `ai.test.ts` | 查杀已死 → 回到随机（在存活他人中，不投自己） | 重写 | 旧：查杀已死 → 随机 → 新：同 |
| 15 | `ai.test.ts` | 没有任何预言家声明 → 无信息模板句，不带 claim | 重写 | 旧：村民无声明 → 无信息模板 → 新：同 |
| 16 | `ai.test.ts` | 有预言家跳出 → 站边该预言家（点名座位），自己不带 claim | 重写 | 旧：有预言家 → 站边 → 新：同 |
| 17 | `ai.test.ts` | 公开 claim 里有存活查杀 → 投该查杀 | 重写 | 旧：公开存活查杀 → 投他 → 新：同 |
| 18 | `ai.test.ts` | 查杀已死 / 只有金水 → 在存活他人中随机（不投自己） | 重写 | 旧：查杀已死/仅金水 → 随机 → 新：同 |
| 19 | `ai.test.ts` | 8 个（角色 × kind）组合：同输入两次调用结果全等 | 重写 | 旧：8 组（角色×kind）同输入两次全等 → 新：**50 格矩阵（5 角色 × 10 kind）**全等 |
| 20 | `ai.test.ts` | 随机类决策对异 rng 状态会给出不同选择（随机确实来自 req.rng，而非常量） | 重写 | 旧：异 rng 状态给出不同选择 → 新：同 **+ 女巫/预设/定序不耗 rng**（断言 rng 位置不变） |
| 21 | `ai.test.ts` | AI 不看 view.pending：带 pending 与不带 pending 的决策完全相同 | 重写 | 旧：AI 不看 view.pending → 新：同 |
| 22 | `ai.test.ts` | 村民/预言家收到 wolf-kill、狼与村民收到 seer-check 均抛错（结构误用不静默） | 重写 | 旧：误用 kind 抛错 → 新：**五角色 × 非法 kind 矩阵**抛错 |
| 23 | `decision-request.test.ts` | idle（未发牌）：pendingDecision 与 decisionRequest 同为 null | 重写 | 旧：idle 无待决策 → 新：`createGame(config)` 后 `pendingDecision`/`decisionRequest` 均为 null |
| 24 | `decision-request.test.ts` | dawn / exile：无待决策 → null；vote 阶段则指向首票行动者 | 重写 | 旧：dawn/exile→null、vote→首票人 → 新：`dawn`/`day_exile`→null、`day_vote`→座位最小未投票者 |
| 25 | `decision-request.test.ts` | game_over：终局后返回 null | 重写 | 旧：game_over→null → 新：同（终局仍 null） |
| 26 | `decision-request.test.ts` | night_wolf：kind/legalTargets 等价，view 恰为 viewFor(狼队代表座位)，字段闭包正确 | 重写 | 旧：night_wolf 视图 = 狼队代表 → 新：代表 = **存活真人狼座位最小者**（D77），view 取该座位 |
| 27 | `decision-request.test.ts` | night_seer：行动者解析为预言家座位，kind=seer-check，legalTargets 与 pending 一致 | 重写 | 旧：night_seer actor = 预言家 → 新：同 |
| 28 | `decision-request.test.ts` | legalTargets 是快照副本：改动返回值不污染引擎 | 重写 | 旧：legalTargets 是快照副本 → 新：同（改返回值不污染引擎） |
| 29 | `decision-request.test.ts` | wolf-team 解析到「存活狼中座位最小者」：一狼出局后自动换到剩下那只 | 重写 | 旧：wolf-team 取存活狼最小 → 新：**真人优先**（D77），无存活真人狼才取最小 AI 狼；一只出局后自动切换 |
| 30 | `decision-request.test.ts` | 两次调用返回同一 Rng 实例，且调用本身不推进流（连续两数 == 同 seed 新局前两数） | 重写 | 旧：两次调用返回同一 Rng 且不推进 → 新：同 |
| 31 | `decision-request.test.ts` | 经由 request.rng 多取 1 个数 → 同一引擎后续整局事件改变（同 seed 对照） | 重写 | 旧：经 request.rng 多取一数改变整局 → 新：同 |
| 32 | `events.test.ts` | GameRecord = { schemaVersion: 1, feature: "werewolf-s0", seed, events }，字段闭包正确 | 重写 | 旧：GameRecord{schemaVersion:1,feature,seed,events} → 新：**v2**`{schemaVersion:2,feature:'werewolf-v2',config,events}` |
| 33 | `events.test.ts` | JSON 序列化回路：JSON.parse(JSON.stringify(exportGame())) 与 exportGame() 深相等 | 重写 | 旧：JSON 往返深相等 → 新：同 |
| 34 | `events.test.ts` | 导出是深拷贝：改导出结果不影响引擎日志，也不共享引用 | 重写 | 旧：导出是深拷贝 → 新：同 |
| 35 | `events.test.ts` | 纯函数 exportGame(seed, log) 与门面导出一致；idle 未开局导出空事件表 | 重写 | 旧：纯函数 exportGame 与门面一致 → 新：同 |
| 36 | `events.test.ts` | 导出含隐藏事实（roles_dealt / wolf_kill_decided / seer_check_completed） | 重写 | 旧：导出含隐藏事实 → 新：**+ `witch_action`，且断言无任何预设字段** |
| 37 | `events.test.ts` | seq = 1..N 严格 +1、无重复；round 非递减且本夹具恰为 {1, 2} | 重写 | 旧：seq 严格 +1、round 非递减 → 新：同 |
| 38 | `events.test.ts` | 11 个具体 type 全部出现，且 9 个契约行全覆盖 | 重写 | 旧：11 个 type 全覆盖（9 契约行）→ 新：**19 类**全覆盖 |
| 39 | `events.test.ts` | 公共字段与载荷字段闭包：每类事件只含 契约 §1 列出的字段，可见性标注一致 | 重写 | 旧：字段闭包（9 类）→ 新：**19 类载荷白名单**（多字段即失败） |
| 40 | `events.test.ts` | #1 game_started：{ seed, board }，board 为 狼2/预言家1/村民3 | 重写 | 旧：#1 game_started{seed,board} → 新：`{seed,mode,humans,board(3/1/1/1/3)}` |
| 41 | `events.test.ts` | #2 roles_dealt（end）：assignment 为 6 座位完整发牌表，与 board 多重集一致、与终局身份表一致 | 重写 | 旧：#2 roles_dealt 6 座 → 新：**9 座** |
| 42 | `events.test.ts` | #3 night_started：空载荷，每夜一条（本夹具 2 条，round 1/2） | 重写 | 旧：#3 night_started 空载荷 → 新：同 |
| 43 | `events.test.ts` | #4 wolf_kill_decided（wolf-team）：target 为存活好人，与本局身份表一致 | 重写 | 旧：#4 wolf_kill_decided 目标合法 → 新：同 |
| 44 | `events.test.ts` | #5 seer_check_completed（seer-private）：target ≠ 预言家座位，result 与真实身份一致 | 重写 | 旧：#5 seer_check_completed 二值 → 新：同 |
| 45 | `events.test.ts` | #6 player_died（public）：seat/revealedRole/cause 齐全，翻牌角色与身份表一致 | 重写 | 旧：#6 player_died{seat,revealedRole,cause 2 值} → 新：**cause 4 值 + `window`；暗牌无 `revealedRole`** |
| 46 | `events.test.ts` | #7 speech（public）：seat/text/skipped 齐全，claim 仅预言家声明形态 | 重写 | 旧：#7 speech{seat,text,skipped,claim} → 新：**+ `stage` 三值** |
| 47 | `events.test.ts` | #8 vote_cast / vote_result（public）：voter/target 与 tally/abstainCount/exiled/outcome 口径一致 | 重写 | 旧：#8 vote_cast/vote_result → 新：**`weight` + `scope` + `tallyHalf` 与 `tally` 自洽** |
| 48 | `events.test.ts` | #9 victory + game_over（public）：winner/reason 配对一致，finalTable 为 6 人终表 | 重写 | 旧：#9 victory/game_over{2 reason,6 人终表} → 新：**3 reason + 9 人终表 + `badgeFlow`** |
| 49 | `events.test.ts` | 递归扫描所有键名：无 time/timestamp/date/clock 类字段；数字量级不含 epoch 毫秒 | 重写 | 旧：递归扫描无 time 字段 → 新：同 |
| 50 | `events.test.ts` | 事件序完整：seq 1..N 连续、round 非递减、game_started 开头、victory→game_over 收尾 | 重写 | 旧：seq 1..N、game_started 开头、victory→game_over 收尾 → 新：同 |
| 51 | `events.test.ts` | 每轮恰好一条 night_started（round = 1..maxRound），且当夜必有狼刀 | 重写 | 旧：每轮一条 night_started + 当夜必有狼刀 → 新：同 |
| 52 | `events.test.ts` | 发言重建：每个白天「当轮存活者」恰好各一条 speech（含跳过），按座次升序、无遗漏无重复 | 重写 | 旧：发言重建（当轮存活者各一条、升序）→ 新：**三 stage 分别重建**（竞选/PK/白天；白天顺序取自 `day_speech_order`） |
| 53 | `events.test.ts` | 投票重建：当轮存活者各投一票（可弃），票面重算与 tally/abstainCount/outcome/exiled 完全一致 | 重写 | 旧：投票重建（票面重算 = tally）→ 新：**三 scope + 半票重算**（`tallyHalf` == 逐票 `weightHalf` 之和） |
| 54 | `events.test.ts` | 死亡重建：夜刀死者 = 当夜刀口、放逐死者 = 当轮放逐，翻牌角色与终表一致，且与终表互补 | 重写 | 旧：死亡重建（夜刀/放逐）→ 新：**4 种 cause + 双死顺序 + 枪杀链** |
| 55 | `events.test.ts` | 发言内容可重建：未跳过必有文本、跳过必为空文本；claim 只出自真预言家且载荷为真 | 重写 | 旧：发言内容可重建（claim 只出自真预言家）→ 新：同（`claim`/`claims` 只出自真预言家或悍跳狼的公开主张） |
| 56 | `events.test.ts` | 终局重建：victory 与终表存活口径一致（狼 0 → 好人胜；狼 ≥ 好 → 狼胜） | 重写 | 旧：终局重建（狼 0 / 狼≥好）→ 新：**屠边 3 reason + 终表存活一致** |
| 57 | `identity.test.ts` | 1000 个 seed：每局恰为 狼2/预言家1/村民3，座位 1–6 各一次，真人恰 1 个 | 重写 | 旧：1000 seed 恰 狼2/预1/民3 + 真人恰 1 → 新：**狼3/预1/女1/猎1/民3** + 1–9 座各一次 + `isHuman` 与 `humans` 集合一致 |
| 58 | `identity.test.ts` | 每座位拿到各角色的频率与期望（2/6、1/6、3/6）偏差 ≤ 5 个百分点 | 重写 | 旧：每座位频率 2/6、1/6、3/6（±5pp）→ 新：3/9、1/9（×3 角色）、3/9（±5pp） |
| 59 | `identity.test.ts` | 真人座位恰 1 个且随 seed 均匀分布（期望 1/6，±5 个百分点） | 重写 | 旧：真人座位恰 1 且随 seed 均匀 → 新：**配置化**——`humans:[3,7]` 时 isHuman 恰为 3、7（不再随机） |
| 60 | `identity.test.ts` | 发牌后进入 night_wolf（round=1），事件序列 game_started → night_started → roles_dealt | 重写 | 旧：发牌后 night_wolf(round=1) 事件序 → 新：同（game_started→night_started→roles_dealt） |
| 61 | `identity.test.ts` | 同 seed 重发一致（FR-010 前置） | 重写 | 旧：同 seed 重发一致 → 新：同 |
| 62 | `isolation.test.ts` | 狼：见 teammates（狼队座位）；无 seerChecks；夜晚持有 wolf-kill 待决策 | 重写 | 旧：狼见 teammates、无 seerChecks → 新：同 **+ `wolfRep`**（teammates 含自己） |
| 63 | `isolation.test.ts` | 预言家：见 seerChecks（自己查验史，初始为空）；无 teammates；夜晚不持有狼刀决策 | 重写 | 旧：预言家见 seerChecks、无 teammates → 新：同（`seerChecks` 按本人过滤） |
| 64 | `isolation.test.ts` | 村民：teammates / seerChecks 字段都不存在；夜晚无 pending | 重写 | 旧：村民两字段都不存在 → 新：同 **+ 无 `myPotions`/`myBadgePreset`/`myDeathCause`** |
| 65 | `isolation.test.ts` | 查验后：只有预言家视图含 seerChecks；狼/村民均无该字段 | 重写 | 旧：查验后仅预言家有 seerChecks → 新：同 |
| 66 | `isolation.test.ts` | 夜晚三态：狼持有 wolf-kill、预言家持有 seer-check；未发牌/非法座位抛错 | 重写 | 旧：夜晚三态（狼/预言家 pending）→ 新：**五角色 × 夜三阶段**（含女巫 `knifeTarget` 仅自己回合） |
| 67 | `isolation.test.ts` | 整局终局：死者 revealedRole = 真实角色，存活者无 revealedRole 字段；各视角 players 相同 | 重写 | 旧：终局死者 revealedRole → 新：**明牌局随时翻；暗牌局仅终局翻** |
| 68 | `isolation.test.ts` | public 恒可见；wolf-team 仅狼；seer-private 仅预言家；end 终局前不可见 | 重写 | 旧：4 值可见性过滤 → 新：**5 值**（+ `witch-private`） |
| 69 | `isolation.test.ts` | 终局：end（roles_dealt）对所有座位翻牌；wolf-team / seer-private 仍按角色过滤 | 重写 | 旧：终局 end 事件翻牌 → 新：同 |
| 70 | `isolation.test.ts` | FR-007：死者观战投影与生前一致（狼仍收 wolf-team、预言家仍收 seer-private） | 重写 | 旧：死者观战投影与生前一致 → 新：同（且死者仍有 `last_words`/`hunter_shoot` pending） |
| 71 | `isolation.test.ts` | engine.viewFor / engine.eventsFor 与纯函数投影一致 | 重写 | 旧：门面与纯函数投影一致 → 新：同 |
| 72 | `isolation.test.ts` | 整局夹具逐快照 × 全部 6 座位：结构、角色条件字段、公开史、pending 口径、无泄漏、非干涉性 | 重写 | 旧：整局快照 × 6 座位 → 新：**× 9 座位 + 五角色模板 + 键集合闭包**（多一个键即失败） |
| 73 | `isolation.test.ts` | DecisionRequest 深检：view/legalTargets/rng 不含他人隐藏身份，且 6 座位全部覆盖 | 重写 | 旧：DecisionRequest 深检（无他人身份）→ 新：**+ 无 `badgePreset` / `potions` / 他人 `role`** |
| 74 | `phases.test.ts` | wolfKill：目标为狼队友 → ILLEGAL_TARGET，状态不变、不产事件 | 重写 | 旧：wolfKill 刀队友 → ILLEGAL_TARGET → 新：同 |
| 75 | `phases.test.ts` | wolfKill：目标已死 → ILLEGAL_TARGET（transition 级） | 重写 | 旧：wolfKill 刀死者 → ILLEGAL_TARGET → 新：同 |
| 76 | `phases.test.ts` | 阶段不符提交 → WRONG_PHASE（night_wolf 提 seerCheck/confirm；idle 提 wolfKill） | 重写 | 旧：阶段不符 → WRONG_PHASE（3 例）→ 新：**18 阶段 × 17 动作**表驱动抽样 |
| 77 | `phases.test.ts` | seerCheck：验自己 → ILLEGAL_TARGET（transition 级） | 重写 | 旧：seerCheck 验自己 → ILLEGAL_TARGET → 新：同 |
| 78 | `phases.test.ts` | 正常夜流转：wolfKill → night_seer → seerCheck → dawn，dawn 结算夜刀死亡（翻牌） | 重写 | 旧：wolfKill→night_seer→seerCheck→dawn，单死翻牌 → 新：**狼→女巫→验→dawn** 四段；夜死 0–2 名 |
| 79 | `phases.test.ts` | 查验结果为 good\|werewolf 二值（验狼=werewolf，验好人=good） | 重写 | 旧：查验结果二值 → 新：同 |
| 80 | `phases.test.ts` | FR-006：预言家已死 → wolfKill 后直跳 dawn（不经 night_seer，transition 级） | 重写 | 旧：预言家已死直跳 dawn → 新：预言家死跳过 `night_seer`；女巫死跳过 `night_witch`；两者皆死 → 直接夜结算 |
| 81 | `phases.test.ts` | dawn confirm → day_speak（speech.order 为存活座位升序，cursor=0） | 重写 | 旧：dawn confirm→day_speak（升序）→ 新：round=1 → `sheriff_signup`；round≥2 → 有警长 `day_order` / 无警长 `day_speak` |
| 82 | `phases.test.ts` | FR-006 整局版：夜1刀预言家（当夜仍可查验）→ 日1放逐一狼 → 夜2直跳 dawn（随 M2 尾部转绿） | 重写 | 旧：FR-006 整局版（夜1刀预言家→夜2直跳）→ 新：v2 夜序整局版（含女巫/毒/屠边） |
| 83 | `phases.test.ts` | 跨夜重复验同一人合法（日1放逐一狼保局，随 M2 尾部转绿） | 重写 | 旧：跨夜重复验同一人合法 → 新：同 |
| 84 | `phases.test.ts` | speech.order = 存活座位升序（死者不在列）；游标按序推进 | 重写 | 旧：speech.order = 存活升序 → 新：有警长按 `day_speech_order.order`；**无警长才**升序 |
| 85 | `phases.test.ts` | 行动者不符 → NOT_YOUR_TURN（状态不变） | 重写 | 旧：行动者不符 → NOT_YOUR_TURN → 新：同（10 种 kind 统一校验 `actor`） |
| 86 | `phases.test.ts` | speak 空文本合法；skip 合法且事件 skipped=true；claim 原样落入 speech 事件 | 重写 | 旧：空文本/skip/claim 落事件 → 新：同（`speech` 增 `stage`） |
| 87 | `phases.test.ts` | FR-007 引擎面：pendingDecision 永不指向死者（含死亡真人座位） | 重写 | 旧：pending 永不指向死者 → 新：常规阶段不指向死者；**`last_words`/`hunter_shoot` 例外**（FR-024） |
| 88 | `phases.test.ts` | 全员说完 → vote | 重写 | 旧：全员说完 → take vote → 新：`day_speak` 说完 → `day_vote`（票箱 scope='exile'） |
| 89 | `phases.test.ts` | 连续多轮平票循环不卡死（日日全弃平安日 + 夜夜刀人，直至终局；待 T015 转绿） | 重写 | 旧：连续平票不卡死 → 新：屠边 + 毒药加速下 ≤10 轮终止（SC-002） |
| 90 | `reproducibility.test.ts` | seed=repro-fixed：autoplay ×100 局 JSON.stringify(exportGame()) 逐字节全等 | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 91 | `reproducibility.test.ts` | 空串 seed：autoplay ×100 局 JSON.stringify(exportGame()) 逐字节全等 | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 92 | `reproducibility.test.ts` | 同 seed 的导出文档本身可 JSON 无损往返，且 seed 字段原样保留 | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 93 | `reproducibility.test.ts` | repro-a 与 repro-b 的整局事件流不同 | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 94 | `reproducibility.test.ts` | 同一批 seed 各自复现（异 seed 也不同） | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 95 | `reproducibility.test.ts` | src/engine 全部 .ts（6 个）无 Math.random | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 96 | `reproducibility.test.ts` | src/ai 全部 .ts（2 个）无 Math.random | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 97 | `reproducibility.test.ts` | ai/ 只 import 可见视图/类型（type-only）与 ai 内部模块：不碰引擎内部状态、不自建 rng | 保留（原样不动） | 断言零改动；仅随 `createGame(config)`/autoplay 适配调用行 |
| 98 | `rng.test.ts` | 返回新数组（不同引用）且不修改入参 | 保留（原样不动） | 文件与断言均不动 |
| 99 | `rng.test.ts` | 结果是原多重集的排列（含重复元素） | 保留（原样不动） | 文件与断言均不动 |
| 100 | `rng.test.ts` | 同一浮点流序列 → 同一洗牌结果（确定性） | 保留（原样不动） | 文件与断言均不动 |
| 101 | `rng.test.ts` | 边界：空数组与单元素数组 | 保留（原样不动） | 文件与断言均不动 |
| 102 | `rng.test.ts` | 同 seed（'lisa'）前 100 个 next() 两次调用逐个相等 | 保留（原样不动） | 文件与断言均不动 |
| 103 | `rng.test.ts` | 异 seed 序列不同 | 保留（原样不动） | 文件与断言均不动 |
| 104 | `rng.test.ts` | 空串 seed 稳定映射不抛错（FNV-1a 对空串稳定） | 保留（原样不动） | 文件与断言均不动 |
| 105 | `rng.test.ts` | Unicode seed（中文）同样稳定 | 保留（原样不动） | 文件与断言均不动 |
| 106 | `rng.test.ts` | next() 恒在 [0, 1)（10000 次采样） | 保留（原样不动） | 文件与断言均不动 |
| 107 | `rng.test.ts` | int(min, max) 落在 [min, max)：常规/负区间/单位区间 | 保留（原样不动） | 文件与断言均不动 |
| 108 | `rng.test.ts` | pick：空数组抛错；非空返回元素之一；同 seed 同位置结果锁定 | 保留（原样不动） | 文件与断言均不动 |
| 109 | `rng.test.ts` | shuffle：返回新数组、是原多重集的排列、同 seed 结果锁定 | 保留（原样不动） | 文件与断言均不动 |
| 110 | `victory.test.ts` | §2 狼最快 1 夜 1 日：夜刀 1 好（2狼3好）→ 放逐 1 好（2狼2好）→ 狼胜 | 重写 | 旧：狼最快 1 夜 1 日（人数比）→ 新：**屠边**口径重算（连屠神边/民边） |
| 111 | `victory.test.ts` | §2 好人最快 2 夜 2 日：夜刀1好→日投1狼→夜刀1好→日投1狼 → 0 狼好人胜 | 重写 | 旧：好人最快 2 夜 2 日 → 新：按新毒药口径（首夜救、次夜毒）重算路径 |
| 112 | `victory.test.ts` | 夜刀 × 狼胜：夜刀把局面砍成 狼≥好 → dawn 即终局（不进入 dawn 展示） | 重写 | 旧：夜刀砍成 狼≥好 → 狼胜 parity → 新：刀后神灭/民灭 → `gods-eliminated`/`villagers-eliminated` |
| 113 | `victory.test.ts` | 放逐 × 狼胜与即时性：放逐好人触发 parity → 不经过 exile，事件以 victory+game_over 收尾 | 重写 | 旧：放逐好人触发 parity → 新：放逐即判，成立即 `game_over`（不经 `day_exile`） |
| 114 | `victory.test.ts` | 放逐 × 好人胜：投出最后一狼 → wolves-eliminated | 重写 | 旧：投出最后一狼 → wolves-eliminated → 新：同（原因名不变） |
| 115 | `victory.test.ts` | game_over 事件：finalTable = 全员 6 项（身份+存活+真人标记） | 重写 | 旧：finalTable 6 项 → 新：**9 项 + `badgeFlow`** |
| 116 | `victory.test.ts` | exile confirm 未触发判定 → night_wolf（round+1，产出 night_started） | 重写 | 旧：exile confirm 未判胜 → night_wolf(round+1) → 新：`day_exile` confirm → `night_wolf` + `night_started` |
| 117 | `victory.test.ts` | 终局后提交任何动作 → GAME_OVER（错误码，状态不变） | 重写 | 旧：终局后任何动作 → GAME_OVER → 新：同 |
| 118 | `voting.test.ts` | castVote 可投任意存活者（含自己）；自票计入 tally（5 路各 1 票 → tie） | 重写 | 旧：可自票计入 tally → 新：同（`weightHalf` 按座位求票权） |
| 119 | `voting.test.ts` | 收齐存活者数才计票：第 4 票后仍无 vote_result，第 5 票后产出（一致票 → 放逐） | 重写 | 旧：收齐存活者数才计票 → 新：同（`voters` 集合收齐才 `vote_result`） |
| 120 | `voting.test.ts` | 得票 max 唯一 → 放逐并翻牌（player_died cause=exile），tally/abstainCount 正确 | 重写 | 旧：max 唯一 → 放逐 + 翻牌 → 新：半票 `resolveMajority` 唯一 → `player_died(cause:'exile')` |
| 121 | `voting.test.ts` | 平票 → outcome=tie，无人放逐、无 player_died | 重写 | 旧：平票 → tie、无人出局 → 新：`outcome:'tie'` + `tiedSeats`，无死亡 |
| 122 | `voting.test.ts` | 全员弃票 → outcome=all-abstain（平安日，与平票同路） | 重写 | 旧：全员弃票 → all-abstain → 新：同（`maxHalf===0`） |
| 123 | `voting.test.ts` | vote_cast 事件：voter/target（弃票 target=abstain），visibility=public | 重写 | 旧：vote_cast{voter,target} public → 新：**+ `weight`**，`scope` 由 `vote_result` 承载 |
| 124 | `voting.test.ts` | 行动者不符 → NOT_YOUR_TURN；投死者 → ILLEGAL_TARGET | 重写 | 旧：NOT_YOUR_TURN / 投死者 ILLEGAL_TARGET → 新：同 |
| 125 | `voting.test.ts` | abstain 不计票：全弃时 tally 为空对象 | 重写 | 旧：全弃时 tally 为空对象 → 新：`tallyHalf` 不含弃票；`totalHalf` 只计未弃者票权 |
