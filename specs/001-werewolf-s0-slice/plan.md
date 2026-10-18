# 实现计划：狼人杀 S0 垂直切片（1 真人 + 5 AI 完整一局）

**分支**: `001-werewolf-s0-slice`（目录标识符；项目仓库 `projects/werewolf/` 已建（D40，O09 已关），S0 按任务清单顺序实施、main 单线推进，不建特性分支） | **日期**: 2026-10-18 | **规格**: [spec.md](spec.md)

**输入**: 来自同目录 `spec.md` 的特性规格说明

**规则唯一事实来源**: `projects/werewolf/docs/游戏规则.md`（Lisa 2026-10-18 审定）。本 plan 与其冲突时无效，须回改本 plan。

## 概要

单机网页版狼人杀 S0 垂直切片：1 真人 + 5 AI（规则驱动），6 人局
（2 狼 + 1 预言家 + 3 村民），纯文本界面，完整跑通"发牌 → 夜晚（狼刀/查验）
→ 天亮翻牌 → 发言 → 投票放逐 → 胜负判定"循环直至终局结算。

技术方案（关键决策详见 [research.md](research.md)，数据与状态机详见
[data-model.md](data-model.md)）：

- **四模块分层**：`rng/`（mulberry32 单随机流）→ `engine/`（纯状态机，
  唯一事实持有者，零 React/DOM）→ `ai/`（只消费 VisibleView 的策略函数）→
  `ui/`（React，只消费事件投影流渲染）。
- **状态机即规则**：引擎转移函数逐行实现规则 §4.2 转移表（7 行转移 +
  前置校验），不发明任何新规则（data-model §3 映射表）。
- **事件流一等公民**：9 类事件、可见性标注、`schemaVersion` 化 JSON 导出
  （contracts/event-stream.md）；人类与 AI 走同一个投影咽喉点，信息隔离
  由此结构性保证。
- **seed 复现**：发牌与 AI 决策共用同一条随机流，同 seed → 事件日志全等。

## 技术上下文

**语言/版本**: TypeScript 5（strict）

**主要依赖**: React 18、Vite、Vitest（实现期取当前稳定版，
lockfile 定版；除此之外零运行时依赖——RNG 自实现，见 research D1）

**存储**: 无（内存态单局；唯一持久化动作 = 终局导出 `.json` 事件流文件）

**测试**: Vitest（`projects/werewolf/tests/`，7 个套件见 §测试布局）

**目标平台**: 现代 evergreen 浏览器（页面）；Node ≥ 20（Vitest 裸驱动引擎）

**项目类型**: web-app（单页、无后端、无持久化，刷新即重开）

**性能目标**: 引擎单步同步执行 < 5ms；6 人局整局 < 100ms（无性能风险点）；
AI 阶段 UI 可读延时 300–800ms（展示节奏，非引擎行为）

**约束**: `projects/werewolf/AGENTS.md` 5 条硬约束（见约束符合性检查）；
engine/ai 禁 `Math.random`；engine 零 react/DOM import；规则变更先改规则文档

**规模/范围**: 1 个页面、4 个源码模块、目标 ≤ ~1.5k LOC（S0 不做平衡调优、
不做 S1 范围项：女巫/猎人/警长/遗言/LLM 玩家/联机/持久化）

## 约束符合性检查

*门槛：须在 Phase 0 研究前通过；Phase 1 设计后复检。*

> ⚠️ **说明**：`projects/werewolf/.specify/memory/constitution.md` 为未填充的占位模板
> （无任何已批准原则），本检查以 `projects/werewolf/AGENTS.md` 的
> 5 条硬约束 + 工作区阶段纪律（S0 探索期，不建 CI/不做全量测试）作为
> 实际 gate。constitution 正式制定后需补检。

**Phase 0 前（设计前）评估**：

| 门槛 | 结论 |
|---|---|
| 1. engine/ 不得 import react/DOM，可被 Vitest 裸驱动 | ✅ 设计上 engine 仅依赖 TS 类型与 rng 接口；测试直接 `import` 引擎驱动 |
| 2. engine/ 与 ai/ 禁直调 Math.random，随机只走注入 seeded RNG | ✅ 唯一 Rng 实例由 Engine 持有（research D3）；另设自锁测试扫描源码 |
| 3. AI 决策只用可见信息（需有测试） | ✅ DecisionRequest 输入唯一 = VisibleView；结构性隔离 + 投影测试（T5） |
| 4. 事件流可序列化、UI 只消费事件流 | ✅ contracts/event-stream.md 冻结 9 类事件与导出格式；UI 只渲染 `eventsFor(humanSeat)` |
| 5. 规则变更流程：先改 docs/游戏规则.md 再改代码 | ✅ 本 plan 未改任何规则；转移表逐行引用 §4.2（data-model §3） |
| 阶段纪律：S0 不建 CI / 不做全量测试 / 不做独立审查 | ✅ 测试范围 = 规则 §8 九条对应套件，不扩 |

**Phase 1 后（设计后）复评**：✅ 全部通过。四个设计产物
（research / data-model / contracts×2 / quickstart）均未引入违反项；
唯一需要留意的点：狼队"一个声音"（research D6）与发言 `claim` 字段
均为**交互/数据形态选择**，不改任何规则判定——已在 research 中论证并留痕。

## 项目结构

### 文档（本特性）

```text
projects/werewolf/specs/001-werewolf-s0-slice/
├── spec.md               # WHAT（已审定，本 plan 的输入）
├── plan.md               # 本文件（/speckit-plan 产出）
├── research.md           # Phase 0：6 项实现级决策（D1–D6）
├── data-model.md         # Phase 1：实体/状态机映射/可见视图/校验
├── quickstart.md         # Phase 1：端到端验证指南（对齐规则 §8）
├── contracts/
│   ├── engine-api.md     # engine/ui/ai/rng 公开面契约
│   └── event-stream.md   # 事件集合、可见性、导出格式
├── checklists/
│   └── requirements.md   # specify 阶段已产（本阶段未动）
└── tasks.md              # Phase 2（/speckit-tasks 产出，尚未创建）
```

### 源码（仓库根目录）

```text
projects/werewolf/            # Vite 项目根（AGENTS.md 所在地）
├── package.json / vite.config.ts / tsconfig.json / index.html
├── src/
│   ├── rng/                  # D1/D2：mulberry32 + FNV-1a + Fisher–Yates
│   │   ├── rng.ts            # createRng / Rng 接口
│   │   └── shuffle.ts
│   ├── engine/               # 纯状态机（零 react/DOM import）
│   │   ├── types.ts          # Role/Phase/GameState/Action/VisibleView…
│   │   ├── events.ts         # GameEvent 9 类 + GameRecord（契约实现）
│   │   ├── transition.ts     # 规则 §4.2 转移表逐行实现（纯函数）
│   │   ├── settle.ts         # 夜刀/放逐结算 + checkVictory（§4.3）
│   │   ├── view.ts           # viewFor / eventsFor 投影（隔离咽喉点）
│   │   └── engine.ts         # Engine 门面（dispatch/pending/export）
│   ├── ai/                   # 规则驱动策略（规则 §5 策略表逐行落实）
│   │   ├── decider.ts        # deciderFor(role)
│   │   └── speech-templates.ts
│   └── ui/                   # React：日志流 + 阶段驱动输入 + 驱动循环
│       ├── App.tsx           # 种子输入 / 终局结算 / 导出按钮
│       ├── GameLog.tsx       # 事件投影流渲染
│       ├── InputPanel.tsx    # 点选目标 / 发言文本 / 弃票
│       └── useGame.ts        # 驱动循环 hook（AI 自动推进 + 可读延时）
└── tests/                    # Vitest（见 §Test Layout）
    ├── helpers/autoplay.ts   # 无头驱动整局（测试版驱动循环）
    ├── identity.test.ts
    ├── phases.test.ts
    ├── voting.test.ts
    ├── victory.test.ts
    ├── isolation.test.ts
    ├── reproducibility.test.ts
    └── events.test.ts
```

**结构决策**: 单项目（模板 Option 1 变体）：Vite 项目根在
`projects/werewolf/`（AGENTS.md 既定），`src/` 四模块 = AGENTS.md 目录约定
原样展开；测试独立 `tests/` 目录（与 src 平级），引擎测试不依赖 React
任何部分即满足"裸驱动"。不引入 monorepo / 不拆包（S0 无复用方，YAGNI）。

## 实现路径：FR 覆盖矩阵（FR-001 – FR-010 全路径）

| FR | 实现路径（模块 → 机制） | 验证 |
|---|---|---|
| FR-001 发牌 2/1/3 随机 | rng.shuffle（Fisher–Yates，§4.4）→ transition 1 `startGame`：BOARD 多重集断言 + 真人座位随局随机 | T1/T6：1000 seed 计数恰 2/1/3、座位分布均匀 |
| FR-002 夜晚序列（禁刀队友 / 禁自验 / 二值结果） | transition 2/3 前置校验（ILLEGAL_TARGET）+ 事件 4/5 | T2：昼夜流转套件；UI 面板只列合法目标 |
| FR-003 死亡翻牌 + 即时判定 | settle.ts：player_died(revealedRole) → checkVictory（狼=0 好人胜 / 狼≥好 狼胜，每次死亡后立即） | T4：夜刀/放逐 × 狼胜/好人胜全边界 |
| FR-004 按座次发言 | transition 5：speech.order = 存活座位升序，cursor 推进，真人 speak/skip 二选一 | T2 + quickstart 场景 1 |
| FR-005 投票（自票/弃票/平票平安） | transition 6：计票在 settle.ts（max 唯一放逐；tie / all-abstain → 无人放逐，同路处理） | T3：计票/平票/自票/弃票四断言 |
| FR-006 预言家死 → 跳查验 | transition 2 出口分支：seer 存活→night_seer，已死→dawn | T2：构造预言家先死局 |
| FR-007 真人死亡观战 | pendingDecision 永不含死者；ui 置 spectator（输入禁用）；投影不变（死者仍只见公开信息） | T2 + quickstart 场景 2 |
| FR-008 AI 信息隔离 | viewFor 投影 = DecisionRequest 唯一输入；类型层无法表达他人隐藏身份 | T5：三角色视图断言 + 决策请求深检 |
| FR-009 事件流可序列化 | events.ts 9 类 + exportGame（schemaVersion JSON）；UI 只渲染 eventsFor(humanSeat) | T7：序列化回路 + 仅凭事件重建时间线（SC-004） |
| FR-010 seed 复现 | 唯一 Rng 流贯穿发牌与 AI 决策（借出式，D3）；事件无墙钟 | T6：同 seed ×100 事件日志全等；自锁扫描 Math.random |

## 测试布局（对齐规则 §8 九条验收）

| 套件 | 覆盖 | §8 对应 |
|---|---|---|
| T1 `identity.test.ts` | 1000 seed：每局恰 2/1/3；每座位拿到各角色频率均匀（±5% 容差防 flaky） | 第 4 条 |
| T2 `phases.test.ts` | 阶段序列 = §4.1 图；预言家死跳查验（FR-006）；死者跳过发言/投票（FR-007 口径）；平票循环不卡死 | 第 5 条 |
| T3 `voting.test.ts` | 计票正确；平票平安；投自己合法；弃票合法不计票；全弃=平安 | 第 6 条 |
| T4 `victory.test.ts` | 夜刀×放逐 × 狼胜/好人胜全部边界（含 §2 推演的 1 夜 1 日狼最快路径、2 夜 2 日好人最快路径） | 第 7 条 |
| T5 `isolation.test.ts` | 三种角色视图精确断言（狼知队友/预言知己验/村民只公开）；DecisionRequest 深度不含隐藏字段；整局全座位扫描 | 第 8 条 |
| T6 `reproducibility.test.ts` | 同 seed 100 次整局事件日志全等（SC-003）；异 seed 局不同 | 第 3 条 |
| T7 `events.test.ts` | exportGame 序列化回路；仅凭事件重建时间线（SC-004）；seq 单调；可见性投影规则 | 第 9 条配套 |
| 自锁测试（并入 T6） | 扫描 `src/engine|ai` 源码无 `Math.random` 字面（硬约束 2 自执行） | — |

口径备注：T1 统计断言先写口径后写数（工作区交付规范）；T6 的"全等"
= `JSON.stringify(exportGame())` 逐字节比较（事件无墙钟，见 event-stream §1）。
§8 第 1、2 条（页面可开、真实玩一局）走 quickstart 人工场景，不自动化。

## 里程碑（任务拆分输入，/speckit-tasks 在此基础上细化）

> 每个里程碑可独立验收；依赖关系：M1 → M2 → {M3, M4} → M5 → M6 → M7 → M8。

| # | 里程碑 | 内容 | 验收（可独立检查） |
|---|---|---|---|
| M1 | rng/ | mulberry32 + FNV-1a + shuffle/pick + 单测 | 同 seed 输出序列锁定；分布 sanity |
| M2 | engine 核心 | types + transition（§4.2 全 7 行）+ settle/checkVictory + Engine 门面 | T1–T4 绿（三核心状态机全过） |
| M3 | 投影 | viewFor / eventsFor（三角色模板 + 可见性过滤） | T5 绿 |
| M4 | 事件契约 | events.ts 9 类 + exportGame + schemaVersion | T7 绿（除"重建时间线"整局部分） |
| M5 | ai/ | deciderFor 三角色 × 四 kind（§5 策略表逐行）+ 模板句 + claim | 策略函数对夹具视图的决策断言绿 |
| M6 | 无头整局 | tests/helpers/autoplay + T6 全绿 | 同 seed ×100 全等；1000 seed 统计过 |
| M7 | ui/ | App/GameLog/InputPanel/useGame + 观战 + 终局 + 导出按钮 | quickstart 场景 0–2、4 人工通过 |
| M8 | 验收走查 | 规则 §8 九条逐项勾 + SC-001 三身份抽样实录 | §8 全勾 = S0 出口达成 |

关键依赖说明：M3/M4 仅依赖 M2，可并行；M5 依赖 M3（要 VisibleView 类型）
与 M4（claim 事件）；M7 依赖 M6（用 autoplay 验证驱动循环一致性）。

## 复杂度登记

> 约束符合性检查无违规项，无需填写豁免表。

无。设计未引入 AGENTS.md 四模块之外的模块、无新增运行时依赖、
无投机性抽象（驱动循环宁可 ui/tests 各持 ~10 行薄副本也不加第五模块，
已在 research D5 论证）。

---

**产出物索引**：[research.md](research.md) · [data-model.md](data-model.md) ·
[contracts/engine-api.md](contracts/engine-api.md) ·
[contracts/event-stream.md](contracts/event-stream.md) · [quickstart.md](quickstart.md)

**下一步**：`/speckit-tasks` 基于 plan + 里程碑生成 tasks.md（Phase 2）。
