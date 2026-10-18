---
description: "狼人杀 S0 垂直切片实现任务清单（依 plan 里程碑 M1–M8 拆分，TDD 强制）"
---

# 任务清单：狼人杀 S0 垂直切片（1 真人 + 5 AI 完整一局）

**特性**: 001-werewolf-s0-slice
**输入**: `projects/werewolf/specs/001-werewolf-s0-slice/` 设计文档（plan / spec / research / data-model / contracts / quickstart）
**前置**: plan.md（里程碑与项目结构）、spec.md（FR-001~010、US1–US3）、`projects/werewolf/docs/游戏规则.md`（规则唯一事实来源，§8 = 验收清单）
**测试**: **TDD（测试先行）强制**——全栈工程师角色验收判据：每个开发单元先写测试跑到红，再实现到绿；测试失败**修实现不修测试**。UI 层按 plan 与 S0 阶段纪律不写自动化测试，以 quickstart 人工走查验收（§8 第 1、2 条走人工，plan §测试布局口径）。
**组织**: 按 plan 里程碑 M1–M8 组织（plan「里程碑」节明文：任务在此基础细化），依赖链 **M1 → M2 → {M3, M4} → M5 → M6 → M7 → M8**；每任务标注 FR 与测试套件，用户故事映射见追溯总表。

## 格式说明：`[ID] [P?] 描述`

- 勾选框 `- [ ]` + 任务号（T001…按执行顺序递增）
- **[P]**: 可并行（不同文件、无未完成的依赖）
- 每任务附 **依赖** 与 **验收**（独立完成判据，一次派活可完成）
- 路径均为工作区根相对路径（源码与测试都在 `projects/werewolf/` 下）

## 路径约定

- 源码：`projects/werewolf/src/{rng,engine,ai,ui}/`（四模块，AGENTS.md 既定）
- 测试：`projects/werewolf/tests/`（与 src 平级；engine 测试不依赖 React，可裸驱动）
- 所有命令在 `projects/werewolf/` 下执行：`pnpm dev`（开发服务器）、`pnpm test`（Vitest 全量）

## 追溯总表

### 里程碑 ↔ 用户故事 ↔ FR ↔ 测试套件

| 里程碑 | 用户故事 | FR | 测试载体 |
|---|---|---|---|
| M1 rng/ 随机模块 | US1/US2/US3 公共底座 | FR-001、FR-010（支撑） | `tests/rng.test.ts`（M1 里程碑验收自带单测） |
| M2 engine 核心 | US1（能玩）、US2（判得对） | FR-001~FR-007 | T1–T4（identity / phases / voting / victory） |
| M3 投影 | US2 | FR-007、FR-008 | T5（isolation） |
| M4 事件契约 | US3 | FR-009 | T7（events） |
| M5 ai/ 策略 | US1 | FR-002、FR-008（策略面） | `tests/ai.test.ts`（M5 里程碑验收自带断言） |
| M6 无头整局 | US2 | FR-010 | T6（reproducibility）+ T1 统计复跑 |
| M7 ui/ 界面 | US1 | FR-002/004/005/007（交互面） | quickstart 人工场景 0–2、4 |
| M8 验收走查 | US2（+ SC-001） | 全部 | 规则 §8 九条 + SC-001 抽样 |

> 注：`tests/rng.test.ts` 与 `tests/ai.test.ts` 不在 §8 对齐的 7 套件内，属 plan 里程碑验收条文（M1「+ 单测」、M5「决策断言」）自有产物。

### 规则 §8 验收清单（9 条）↔ 任务映射

| §8 条目 | 验证载体 | 对应任务 |
|---|---|---|
| 1. `pnpm dev` 启动，页面可开 | 人工（quickstart 场景 0） | T001、T030、T031、T033 |
| 2. 任意身份/座位完整一局到 game_over | 引擎自动化 + 人工（SC-001） | T007–T015、T031、T032 |
| 3. 固定 seed 复现同一局 | T6 自动化 | T023、T024 |
| 4. 身份分配测试（1000 seed = 2/1/3） | T1 自动化 | T005–T007 |
| 5. 昼夜流转测试（含预言家死跳查验） | T2 自动化 | T008–T011、T015 |
| 6. 投票测试（计票/平票/自票/弃票） | T3 自动化 | T012、T013 |
| 7. 胜负判定测试（全边界） | T4 自动化 | T014、T015 |
| 8. 信息隔离测试 | T5 自动化 | T016、T017 |
| 9. 以上全部 Vitest 全绿 | 全量复跑 | T026、T033 |

---

## 阶段 0：项目脚手架（M1 前置）

**目的**: `projects/werewolf/` 成为可安装、可启动、可跑测试的空骨架（plan §项目结构）。

- [x] T001 创建 Vite 项目骨架于 `projects/werewolf/`：`package.json`（React 18 / Vite / Vitest / TypeScript 5，实现期取当前稳定版并 lockfile 定版；除此之外零运行时依赖）、`vite.config.ts`、`tsconfig.json`（strict）、`index.html`、`src/main.tsx`（占位渲染）、`src/{rng,engine,ai,ui}/` 与 `tests/` 目录、scripts（`dev`/`test`）
  - 依赖：无
  - 验收：`pnpm install` 成功；`pnpm dev` 页面可打开、无 console 报错；`pnpm test`（Vitest）空跑退出码 0

**检查点**: 骨架可跑 → M1 可开工。

---

## 阶段 1：M1 rng/（seed 随机模块）

**目标**: mulberry32 + FNV-1a + Fisher–Yates（research D1/D2），同 seed 输出序列永久锁定。
**独立验收**: `tests/rng.test.ts` 全绿——同 seed 序列一致、异 seed 序列不同、shuffle 是排列且不改入参。
**FR/套件**: FR-001/FR-010 支撑；`tests/rng.test.ts`（M1 里程碑单测）。

- [x] T002 先写测试（红）到 `projects/werewolf/tests/rng.test.ts`：同 seed（如 `createRng('lisa')`）前 100 个 `next()` 两次调用逐个相等；异 seed 序列不同；空串 seed 稳定映射不抛错；`int(min, max)` 落在 `[min, max)`；`pick` 空数组抛错；`shuffle` 返回新数组、元素为原多重集的排列、同 seed 结果锁定
  - 依赖：T001
  - 验收：`pnpm vitest run tests/rng.test.ts` 失败（红，模块不存在）
- [x] T003 实现 Fisher–Yates 洗牌于 `projects/werewolf/src/rng/shuffle.ts`（返回新数组、不修改入参）
  - 依赖：T002
  - 验收：`rng.test.ts` 中 shuffle 相关断言转绿
- [x] T004 实现 `projects/werewolf/src/rng/rng.ts`：`Rng` 接口（`next`/`int`/`pick`/`shuffle`，契约 `contracts/engine-api.md` §4）+ FNV-1a 字符串哈希（空串/任意字符稳定）+ mulberry32 + `createRng` 组装
  - 依赖：T003
  - 验收：`tests/rng.test.ts` 全绿；`src/rng` 无第三方 import、无 `Math.random`

**检查点（M1）**: 同 seed 序列锁定 + 分布 sanity 全绿；随机模块零新依赖。

---

## 阶段 2：M2 engine 核心（纯状态机）

**目标**: types + 事件类型 + transition（规则 §4.2 转移表全 7 行逐行实现）+ settle/checkVictory + Engine 门面。
**独立验收**: T1–T4 四套件全绿（身份分配/昼夜流转/投票三核心状态机 + 胜负全边界）。
**FR/套件**: FR-001~FR-007；T1 `identity` / T2 `phases` / T3 `voting` / T4 `victory`。

- [x] T005 先写测试（红）身份分配于 `projects/werewolf/tests/identity.test.ts`（FR-001；§8 第 4 条）。口径先行后写数：1000 个不同 seed 各发一次牌 → 每局角色多重集恰为狼 2 / 预言家 1 / 村民 3（BOARD）；每座位拿到各角色频率与期望（2/6、1/6、3/6）偏差 ≤5 个百分点；真人座位恰 1 个且随 seed 变化（分布均匀，同样 ±5 个百分点容差）
  - 依赖：T004
  - 验收：`pnpm vitest run tests/identity.test.ts` 失败（红）
- [x] T006 实现类型层：`projects/werewolf/src/engine/types.ts`（`Role`/`Faction`/`BOARD`（狼2/预言家1/村民3）/`factionOf`/`PlayerState`（seat 1–6、发牌后 role 不可变、恰 1 真人、`death?{cause:'night-kill'|'exile', round}`）/`Phase` 8 态与规则 §4.1 一致不增不减/`GameState`/`Action` 8 种/`EngineError`（code：`WRONG_PHASE`/`NOT_YOUR_TURN`/`ILLEGAL_TARGET`/`GAME_OVER`），对照 data-model §1–§2）+ `projects/werewolf/src/engine/events.ts` 类型与构造器（9 类 GameEvent、公共字段 `seq`/`round`/`visibility`、`Claim`，对照 `contracts/event-stream.md` §1）
  - 依赖：T005（先红）
  - 验收：`tsc` strict 编译通过；本任务只落类型与构造器，无行为逻辑
- [x] T007 实现 Engine 门面与转移 1：`projects/werewolf/src/engine/engine.ts`（`createGame(seed)`/`state` 只读快照/`dispatch`（合法返回事件数组，非法返回 `Err<EngineError>` 且状态不变、不产事件）/`pendingDecision`/`eventLog`，契约 §1–§2）+ `projects/werewolf/src/engine/transition.ts` 转移 1（`startGame`：`rng.shuffle(BOARD)` 发牌、真人座位随机、round=1 → night_wolf；产出 `game_started` → `night_started` → `roles_dealt`（隐藏））
  - 依赖：T006
  - 验收：`tests/identity.test.ts` 全绿（T1 ✓，§8 第 4 条 ✓）
- [x] T008 先写测试（红）夜晚与流转断言追加到 `projects/werewolf/tests/phases.test.ts`（FR-002/FR-006；§8 第 5 条前半）：`wolfKill` 目标死亡或为狼队友 → `ILLEGAL_TARGET` 且状态不变；阶段不符提交 → `WRONG_PHASE`；`seerCheck` 验自己 → `ILLEGAL_TARGET`，重复验同一人合法；查验结果为 `good|werewolf` 二值；预言家已死 → night_wolf 直跳 dawn（FR-006）；进入 dawn 时结算夜刀死亡（`player_died` 含 `revealedRole`，死亡即翻牌）；dawn `confirm` → day_speak
  - 依赖：T007
  - 验收：新增断言跑为失败（红）
- [x] T009 实现夜刀结算与即时判定 + 转移 2/3/4：`projects/werewolf/src/engine/settle.ts`（夜刀死亡结算（死亡即翻牌，无救治）+ `checkVictory` 存活口径（狼=0 → 好人胜 `wolves-eliminated`；狼 ≥ 好 → 狼胜 `wolves-parity`））+ `transition.ts` 转移 2（出口分支：预言家存活 → night_seer；已死 → dawn）、转移 3（→ dawn 并结算）、转移 4（`confirm` → day_speak）
  - 依赖：T008
  - 验收：T008 断言转绿
- [x] T010 先写测试（红）白天发言与流转断言追加到 `projects/werewolf/tests/phases.test.ts`（FR-004/FR-007 引擎口径；§8 第 5 条后半）：`speech.order` = 存活座位升序、游标按序推进；`speak` 空文本合法、`skip` 合法；行动者不符 → `NOT_YOUR_TURN`；死者不出现在发言 order，`pendingDecision` 永不指向死者（FR-007 引擎面）；全员说完 → vote；连续多轮平票循环不卡死（此条待 T015 后转绿）
  - 依赖：T009
  - 验收：新增断言跑为失败（红）
- [x] T011 实现转移 5（day_speak 游标推进，全员说完 → vote）于 `projects/werewolf/src/engine/transition.ts`，产出 `speech` 事件（含 `skipped` 标记）
  - 依赖：T010
  - 验收：发言相关断言转绿
- [x] T012 先写测试（红）投票于 `projects/werewolf/tests/voting.test.ts`（FR-005；§8 第 6 条）：`castVote` 可投任意存活者**含自己**；`abstain` 合法且不计票；收齐存活者数才计票；得票 max 唯一 → 放逐并翻牌；平票 → `outcome='tie'` 无人放逐；全员弃票 → `outcome='all-abstain'` 平安日（与平票同路）；`vote_cast` ×存活数 + 收齐时 `vote_result`（`tally`/`abstainCount`/`exiled`/`outcome`）
  - 依赖：T011
  - 验收：`pnpm vitest run tests/voting.test.ts` 失败（红）
- [x] T013 实现转移 6 与放逐结算：`projects/werewolf/src/engine/transition.ts`（按座次收票、齐票计票）+ `projects/werewolf/src/engine/settle.ts`（计票：max 唯一放逐；tie / all-abstain 无人放逐）
  - 依赖：T012
  - 验收：`tests/voting.test.ts` 全绿（T3 ✓，§8 第 6 条 ✓）
- [x] T014 先写测试（红）胜负判定于 `projects/werewolf/tests/victory.test.ts`（FR-003；§8 第 7 条）：夜刀 × 放逐 × 狼胜/好人胜全部边界；复演规则 §2 推演——狼最快 1 夜 1 日（夜刀 1 好 → 2狼3好，放逐 1 好 → 2狼2好 → 狼胜）、好人最快 2 夜 2 日（终局 0 狼 → 好人胜）；判定即时性（每次 `player_died` 结算后立即判定，触发即 game_over 不进下一阶段）；exile `confirm` 未触发判定 → night_wolf（round+1）；`victory`（winner/reason）+ `game_over`（finalTable）事件
  - 依赖：T013
  - 验收：`pnpm vitest run tests/victory.test.ts` 失败（红）
- [x] T015 实现转移 7 于 `projects/werewolf/src/engine/transition.ts`：exile `confirm` → `checkVictory` → night_wolf（round+1，产出 `night_started`）或 game_over（产出 `victory` → `game_over`）
  - 依赖：T014
  - 验收：`tests/victory.test.ts` 全绿（T4 ✓，§8 第 7 条 ✓）；**M2 检查点**：T1–T4 四套件全绿（含 phases 的平票循环断言转绿，§8 第 5 条 ✓）

---

## 阶段 3：M3 投影（信息隔离咽喉点）—— 可与 M4 并行

**目标**: `viewFor` / `eventsFor`（data-model §6 + `contracts/event-stream.md` §2），人类与 AI 走同一投影。
**独立验收**: `tests/isolation.test.ts` 全绿（T5，§8 第 8 条）。
**FR/套件**: FR-007、FR-008；T5 `isolation`。
**说明**: plan T7 行内的「可见性投影规则」断言并入 T5 执行（投影即隔离；同时避免 M3/M4 并行时同写 `events.test.ts` 冲突）。

- [ ] T016 [P] 先写测试（红）信息隔离于 `projects/werewolf/tests/isolation.test.ts`：三种角色 `viewFor` 精确断言——狼见 `teammates`（狼队座位）、预言家见 `seerChecks`（自己查验史）、村民无此二字段；`players` 仅死者带 `revealedRole`；`eventsFor` 投影口径——`public` 恒可见、`wolf-team` 仅狼可见、`seer-private` 仅预言家可见、`end` 终局或载荷本人；死者观战投影与生前口径一致（FR-007）；`DecisionRequest` 输入（`view`/`legalTargets`/`rng`）深检不含任何他人隐藏身份；整局夹具对全部 6 座位扫描
  - 依赖：T015
  - 验收：`pnpm vitest run tests/isolation.test.ts` 失败（红）
- [ ] T017 [P] 实现 `projects/werewolf/src/engine/view.ts`：`viewFor(seat)`（`VisibleView` 构造，data-model §6）+ `eventsFor(seat)`（可见性过滤），并在 `engine.ts` 门面挂接两方法
  - 依赖：T016
  - 验收：`tests/isolation.test.ts` 全绿（T5 ✓，§8 第 8 条 ✓）

---

## 阶段 4：M4 事件契约（序列化导出）—— 可与 M3 并行

**目标**: `exportGame` / `GameRecord` / `schemaVersion`（`contracts/event-stream.md` §3，FR-009）。
**独立验收**: `tests/events.test.ts` 序列化断言全绿（「仅凭事件重建时间线」整局部分按 plan M4 口径留到 M6）。
**FR/套件**: FR-009；T7 `events`。

- [ ] T018 [P] 先写测试（红）事件序列化于 `projects/werewolf/tests/events.test.ts`：`exportGame()` 序列化回路——`JSON.parse(JSON.stringify(exportGame()))` 深相等；`GameRecord` = `{ schemaVersion: 1, feature: 'werewolf-s0', seed, events }`；`seq` 从 1 起全局单调递增；夹具局 9 类事件载荷字段逐项对照契约 §1；事件不含墙钟时间字段
  - 依赖：T015
  - 验收：`pnpm vitest run tests/events.test.ts` 失败（红）
- [ ] T019 [P] 实现导出于 `projects/werewolf/src/engine/events.ts`：`GameRecord` + `exportGame()`（完整事件日志含隐藏事实），并在 `engine.ts` 门面暴露 `exportGame()`
  - 依赖：T018
  - 验收：`tests/events.test.ts` 序列化断言全绿（T7 除整局重建部分，符合 plan M4 验收）

---

## 阶段 5：M5 ai/（规则驱动策略）

**目标**: `deciderFor` 三角色 × 四 kind（规则 §5 策略表逐行落实）+ 模板句 + claim（research D6）。
**独立验收**: `tests/ai.test.ts` 决策断言全绿（plan M5 验收口径：策略函数对夹具视图的决策断言）。
**FR/套件**: FR-002、FR-008（策略面）；`tests/ai.test.ts`（M5 里程碑单测）。
**依赖**: M3 + M4 双完成（`VisibleView` 类型 + `claim` 事件）。

- [ ] T020 先写测试（红）AI 策略于 `projects/werewolf/tests/ai.test.ts`（夹具 `VisibleView` × 决策断言，规则 §5 策略表逐行）：狼——夜刀只从存活**好人**选、投票不投队友、白天伪装村民模板句、被查杀则反驳；预言家——只从**未验过**的存活者中验、首个白天跳身份（`speak` 带 `claim {kind:'seer-claim', target, result}`）公布最新查验（金水/查杀）、有存活查杀投查杀否则随机；村民——模板句并站边跳出的预言家、投票同预言家逻辑；一切随机仅经 `req.rng`（同视图 + 同 rng 状态 → 同决策）；`deciderFor(role)` 之外不读任何输入
  - 依赖：T017、T019
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
- [ ] T021 实现模板句于 `projects/werewolf/src/ai/speech-templates.ts`（中文模板：伪装村民 / 跳预言家金水·查杀 / 被查杀反驳 / 村民站边）
  - 依赖：T020
  - 验收：模板函数被 T022 的 decider 消费，断言随 T022 转绿
- [ ] T022 实现 `projects/werewolf/src/ai/decider.ts`：`deciderFor(role)`（`DecisionRequest → Action`，data-model §7；纯函数，随机仅经 `req.rng`，ai/ 不 import 引擎内部状态、不读 `eventLog`）
  - 依赖：T021
  - 验收：`tests/ai.test.ts` 全绿（M5 ✓）

---

## 阶段 6：M6 无头整局（复现与自锁）

**目标**: autoplay 无头驱动整局 + T6 复现全绿。
**独立验收**: 同 seed ×100 整局事件日志全等；异 seed 局不同；`Math.random` 自锁扫描过；全部套件复跑绿。
**FR/套件**: FR-010 / SC-003；T6 `reproducibility`。

- [ ] T023 先写测试（红）复现与自锁于 `projects/werewolf/tests/reproducibility.test.ts`（FR-010/SC-003；§8 第 3 条）：同 seed（含空串）autoplay 整局 ×100 次，`JSON.stringify(exportGame())` 逐字节全等；异 seed 两局不同；自锁——扫描 `src/engine` 与 `src/ai` 源码无 `Math.random` 字面（硬约束 2 自执行，plan 测试布局「自锁测试并入 T6」）
  - 依赖：T022
  - 验收：`pnpm vitest run tests/reproducibility.test.ts` 失败（红，autoplay 未实现）
- [ ] T024 实现无头驱动于 `projects/werewolf/tests/helpers/autoplay.ts`：驱动循环薄实现（research D5，约 10 行）——`pendingDecision` 行动者（含真人座位，测试中由 decider 代打以保证确定性）→ `deciderFor` → `dispatch`；dawn/exile 自动 `confirm`；直到 game_over；返回 Engine
  - 依赖：T023
  - 验收：`tests/reproducibility.test.ts` 全绿（T6 ✓，§8 第 3 条 ✓）
- [ ] T025 补「仅凭事件重建时间线」断言到 `projects/werewolf/tests/events.test.ts`（SC-004）：autoplay 整局的 `exportGame().events` 按序重建整局可见叙事（谁说了什么、投了谁、谁何时死、何时终局），断言无信息缺失
  - 依赖：T024
  - 验收：`tests/events.test.ts` 全绿（T7 全绿，含 M4 留下的整局部分）
- [ ] T026 M6 检查点：`projects/werewolf/` 下 `pnpm test` 全量复跑
  - 依赖：T025
  - 验收：9 个测试文件（7 套件 + rng + ai）全部通过，含 T1 的 1000 seed 统计复跑（plan M6 验收「1000 seed 统计过」）

---

## 阶段 7：M7 ui/（React 界面）

**目标**: App / GameLog / InputPanel / useGame + 观战 + 终局结算 + 导出按钮（plan §项目结构）。
**独立验收**: quickstart 场景 0–2、4 人工通过（UI 层按 S0 阶段纪律不写自动化测试；引擎侧正确性已由 T1–T7 锁定）。
**FR**: FR-002/004/005/007（交互面）。
**依赖**: M6（autoplay 已验证引擎 + AI 驱动循环一致性）。

- [ ] T027 实现驱动循环 hook 于 `projects/werewolf/src/ui/useGame.ts`：`pendingDecision` 行动者为 AI → 借出 rng 调 `deciderFor` → `dispatch`（纯 AI 阶段 `setTimeout` 300–800ms 可读延时，engine 恒同步）；行动者为真人 → 暴露待组件输入；dawn/exile → 自动 `confirm`；game_over → 终态。与 `tests/helpers/autoplay.ts` 同构（薄副本，不抽第五模块，research D5）
  - 依赖：T026
  - 验收：源码走查覆盖契约 §2 驱动循环四分支；运行行为随 T031 场景走查
- [ ] T028 [P] 实现日志流于 `projects/werewolf/src/ui/GameLog.tsx`：只消费 `eventsFor(humanSeat)` 投影流（硬约束 4）——阶段标题、死讯翻牌、发言、计票、判定滚动展示
  - 依赖：T027
  - 验收：源码不引用 `engine.eventLog`；展示正确性随 T031 走查
- [ ] T029 [P] 实现输入面板于 `projects/werewolf/src/ui/InputPanel.tsx`：阶段驱动输入——狼刀点选（只列 `legalTargets`，狼队友不出现）、查验点选（排除自己）、发言文本框 + 跳过、投票点选（含自己）+ 弃票；真人死亡 → spectator（面板禁用，FR-007）；dawn/exile 无人工交互；不解析自由文本指令（规则 §6）
  - 依赖：T027
  - 验收：非法目标不可选（quickstart 场景 1 对应预期）；行为随 T031 走查
- [ ] T030 实现页面骨架于 `projects/werewolf/src/ui/App.tsx`（并接 `src/main.tsx`）：种子输入 + 开始按钮；终局结算（胜负阵营 + 全员身份表）；「导出事件流」按钮（Blob 下载 `.json`）；刷新即重开（无持久化）
  - 依赖：T028、T029
  - 验收：quickstart 场景 0（页面打开无 console 报错）+ 场景 4（导出文件含 `schemaVersion`/`seed`/`events` 且 `seq` 递增）人工通过
- [ ] T031 M7 人工走查：按 `projects/werewolf/specs/001-werewolf-s0-slice/quickstart.md` 场景 0–2、4 逐项执行——场景 0 启动；场景 1 固定种子 `demo-1` 至少一局完整到终局（三身份面板行为抽查）；场景 2 观战（被刀/被放逐后输入消失、日志继续）、平票平安日继续、预言家先死夜晚直跳天亮；场景 4 导出复核；同种子 `demo-1` 重开逐字一致（§8 第 3 条人工面）
  - 依赖：T030
  - 验收：quickstart 各场景「预期」栏全部命中，无卡死、无规则漏洞

---

## 阶段 8：M8 验收走查（S0 出口判定）

**目标**: 规则 §8 九条逐项勾 + SC-001 三身份抽样实录；S0 出口达成。
**独立验收**: §8 全勾（含「用真实操作完整玩一局，不编样例」）+ 走查记录落盘。

- [ ] T032 SC-001 三身份抽样实录：狼人 / 预言家 / 村民三身份各至少一局**真实操作**完整玩到 game_over（多 seed 抽样覆盖不同座位组合），按 `projects/werewolf/specs/001-werewolf-s0-slice/quickstart.md` 场景 1 执行，每局留证（seed、身份、座位、终局结果、日志或截图），证据随 T033 汇总落 `projects/werewolf/specs/001-werewolf-s0-slice/checklists/s0-验收走查.md`
  - 依赖：T031
  - 验收：三身份 100% 到达终局、无卡死、无规则漏洞；抽样记录完整可复核
- [ ] T033 §8 九条终验与走查记录：复跑 `pnpm test` 全绿（§8 第 9 条终验）；按本文件「§8 ↔ 任务映射」表逐条勾选留证；走查记录落 `projects/werewolf/specs/001-werewolf-s0-slice/checklists/s0-验收走查.md`（新建）；结果交主会话（小明）验收并判定 S0 出口
  - 依赖：T032
  - 验收：九条全勾 + 记录落盘 + 主会话验收通过

---

## 依赖与执行顺序

### 阶段依赖（里程碑链，与 plan 一致）

- 阶段 0（T001）→ M1（T002–T004）→ M2（T005–T015）→ {M3（T016–T017）∥ M4（T018–T019）} → M5（T020–T022）→ M6（T023–T026）→ M7（T027–T031）→ M8（T032–T033）
- M3 与 M4 仅依赖 M2，可并行（不同文件）；M4 的「重建时间线」断言（T025）在 M6 补齐
- M5 依赖 M3 + M4 双完成（要 `VisibleView` 类型与 `claim` 事件）
- M7 依赖 M6（用 autoplay 验证驱动循环一致性）
- 全部依赖向后指，无循环

### 任务内顺序（TDD 纪律）

- 每个「先写测试（红）」任务必须真实跑红，才开始对应实现任务
- 实现任务以对应测试转绿为完成判据；测试失败**修实现不修测试**
- 引擎行为以 `transition` 纯函数断言为准（data-model §3 转移表逐行）

### 并行机会

- T016–T017（M3）∥ T018–T019（M4）：不同文件、互不依赖
- T028 ∥ T029（GameLog 与 InputPanel 不同文件，同依赖 T027）
- 其余任务按依赖链串行

## 并行示例：M3 与 M4 双分支

```text
分支 A（M3）：T016 isolation 红 → T017 view.ts 绿
分支 B（M4）：T018 events 红   → T019 exportGame 绿
汇合点：T020（ai 测试，同时依赖两分支产物）
```

## 实施策略

### 最小可玩切片优先

1. 阶段 0 + M1 + M2 → 引擎可被 Vitest 裸驱动、T1–T4 绿（此刻已可用脚本跑通整局）
2. M3 + M4 → 信息隔离与导出契约成立
3. M5 + M6 → 无头整局复现锁定（SC-003）
4. M7 → 真人可玩（quickstart 场景走查）
5. M8 → §8 全勾，S0 出口判定

### 增量交付

每个里程碑结束都有可独立验收的产物（见各阶段「独立验收」行）；任一检查点都可暂停并验证已完成部分。

## 备注

- [P] 任务 = 不同文件且无未完成依赖
- 规则疑问一律回查 `projects/werewolf/docs/游戏规则.md`（唯一事实来源）；规则变更流程：先改规则文档（Lisa 过目）再改代码与测试（硬约束 5）
- 硬约束 1–4 的自执行：T005–T015 裸驱动（无 React 依赖）、T023 自锁扫描（无 `Math.random`）、T016 隔离测试、T019/T028 事件流唯一数据源
- `tests/rng.test.ts`、`tests/ai.test.ts` 为里程碑自有单测，不在 §8 七套件内；plan T7 行的「可见性投影规则」断言并入 T5 执行（理由见阶段 3 说明）
