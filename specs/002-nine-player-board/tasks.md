---
description: "狼人杀 v2 · 9 人局扩展任务清单（依 plan 里程碑 M1–M10 拆分，TDD 强制，T001–T132）"
---

# 任务清单：狼人杀 v2 · 9 人局扩展（3 狼 + 3 神 + 3 民）

**特性**: 002-nine-player-board
**输入**: `projects/werewolf/specs/002-nine-player-board/` 设计文档（plan / spec / research / data-model / contracts / quickstart）
**前置**: plan.md（M1–M10 里程碑与测试布局）、spec.md（97 FR / 6 用户故事 / 13 SC / 39 验收场景 / 23 边界）、
data-model.md（18 阶段 / 17 动作 / 18 行转移 / 死亡链 / 计票）、research.md（D1–D13）、contracts/（4 份）、
`projects/werewolf/docs/游戏规则.md`（v2 · 9 人局，规则唯一事实来源，§10 = 29 条验收 V01–V29）
**测试纪律**: **TDD（测试先行）强制** —— 每个开发单元先写测试并**真实跑到红**，再实现到绿；
测试失败**修实现不修测试**（若判定测试本身写错，须在任务记录里写明理由，不许静默改断言）。
**里程碑链**: **M1 → M2 → M3 → {M4} → M5 → M6 → M7 → M8 → M9 → M10**（名义主链）；
并行关系照 plan：**M4 与 M6 无依赖可并行**（M3 完成后），**M8 在 M5 完成后即可与 M6/M7 并行**。
**任务总数**: **132**（M1 10 / M2 14 / M3 12 / M4 8 / M5 16 / M6 18 / M7 16 / M8 10 / M9 20 / M10 8，与 plan 逐里程碑一致）

> ✅ **前置已解决（提交 `dbedc0f`）**：plan §风险与未决 第 0 项提到的 D13「毒药不能烂在手里」文档修订**已完成**，
> 三处现状与本节口径一致，**M3（T026 毒药分支）与 M7（T091–T092 女巫评分）可直接开工，无文档前置**：
> ① `docs/游戏规则.md` §7.1 女巫行 =「解药存在 → 救本夜刀口（含自救，任意夜）；毒药**不能烂在手里**（§12.1-D）：
> 存在存活且被公开查杀的目标 → **必毒**（多个取最近）；否则 `round ≥ 2` 按**确定性可疑度评分**选最高分目标下毒，tie-break 座位升序」；
> ② `docs/游戏规则.md` §12.1-D = 同上 +「**可测断言：毒药只要在，必须在窗口内用掉**」；
> ③ `spec.md` FR-094 =「毒药 MUST 不能闲置：①…②…；**毒药只要尚在，MUST 在使用窗口内被用掉**」。

## 格式说明：`[ID] [P?] 描述`

- 勾选框 `- [ ]` + 任务号（T001…T132，按执行顺序递增）
- **[P]**: 可并行（**不同文件**、且无未完成的依赖）；同文件连续任务一律不标 `[P]`
- 每任务附 **依赖**（前置任务号）与 **验收**（可独立判定的完成标准：命令 + 期望输出）
- 涉及判定的任务附 **规则**（`docs/游戏规则.md` 章节号）
- 路径均为工作区根相对路径（源码与测试都在 `projects/werewolf/` 下）

## 路径约定

- 源码：`projects/werewolf/src/{rng,engine,ai,ui}/`（四模块不变；engine 内 10 个文件、ui 内 10 个文件属**模块内组织**，见 data-model §4）
- 测试：`projects/werewolf/tests/`（与 src 平级；engine 测试不依赖 React，可裸驱动）；夹具在 `tests/helpers/`
- 命令在 `projects/werewolf/` 下执行：`pnpm test`（Vitest 全量）、`pnpm vitest run tests/<套件>.test.ts`、`pnpm exec tsc --noEmit`、`pnpm dev`、`pnpm build`
- 本机 pnpm 已知损坏（`AGENTS.md` 已记）：可用 `node_modules/.bin/vitest run`、`node_modules/.bin/tsc --noEmit` 等价替代

## 批次自然边界

| 批次 | 里程碑 | 任务 | 预计用例（累计） |
|---|---|---|---|
| 批 1 | M1–M4 | T001–T044（44） | 95 |
| 批 2 | M5–M6 | T045–T078（34） | 73（累计 168） |
| 批 3 | M7–M10 | T079–T132（54） | 108（累计 276） |
| **合计** | | **132** | **276** |

## 追溯总表：里程碑 ↔ 用户故事 ↔ FR ↔ 测试套件

| 里程碑 | 用户故事 | FR | 测试套件 |
|---|---|---|---|
| **M1 底座** | US1 / US2 / US3 / US6（公共底座） | FR-001–003、FR-049–053（计票口径） | `rng`（保留）、`tally`（全新）、`identity`（部分）、`pending-matrix`（部分） |
| **M2 18 阶段骨架** | US1、US2 | FR-003、FR-008、FR-013、FR-038–048（骨架面）、FR-054–057 | `pending-matrix`、`phases`（含单轮骨架走通）、`identity` |
| **M3 夜间三角色** | US1 | FR-008–019（含 FR-010–012、016） | `witch`、`phases`、`isolation`（女巫私有窗口 4 条） |
| **M4 判胜 + 明暗牌** | US1 | FR-017–019、FR-058–065 | `victory`、`victory-edge`、`mode` |
| **M5 死亡后续链 ⚠️** | US1、US3 | FR-019–037、FR-060–061 | `death-chain`、`hunter`、`preset` |
| **M6 竞选 + 1.5 票 ⚠️** | US2 | FR-032、FR-038–057 | `sheriff`、`voting`、`tally`（真实票箱） |
| **M7 AI v2** | US1、US2、US3、US6 | FR-066–076、FR-094–097 | `ai`、`decision-request`、`preset`（AI 求值）、`witch`（D13） |
| **M8 事件契约 v2** | US6 | FR-064、FR-077–080 | `events`、`record-replay`、`isolation`（8 条） |
| **M9 UI v2** | US4、US5 | FR-005、FR-063–065、FR-081–093 | `hotseat` + quickstart §1.2/§2/§3/§6/§7 人工 |
| **M10 验收走查** | 全（US1–US6） | 全部 97 条（终验） | `boundary`、`termination`、全量复跑 + 人工走查 |

> 97 条 FR 的**逐条**落点见 **附录 A**（97 / 97，无减项）；规则 §10 的 29 条验收映射见「规则 §10 ↔ 任务」表；
> spec 的 23 条边界映射见「边界 ↔ 任务」表。

## 测试套件清单（v2：23 套件 / 276 用例）

> 口径来源：plan §测试布局与 §v1 迁移总账。三类合计必须闭合：**保留 20 + 重写 105 + 全新 151 = 276**。

| # | 套件 | 用例 | 来源 | 主验收 | 承接任务 |
|---|---|---|---|---|---|
| 1 | `tests/rng.test.ts` | 12 | **保留 v1**（附录 B #98–109） | V03 复现底座 | T002 |
| 2 | `tests/reproducibility.test.ts` | 8 | **保留 v1**（附录 B #90–97） | V03、V25 | T129（T128 仅改调用行） |
| 3 | `tests/identity.test.ts` | 5 | **重写 v1**（#57–61） | V04、SC-001 | T008、T017–T018 |
| 4 | `tests/phases.test.ts` | 16 | **重写 v1**（#74–89） | V05 | T013、T030 |
| 5 | `tests/decision-request.test.ts` | 9 | **重写 v1**（#23–31） | V25、D77 | T079–T080 |
| 6 | `tests/tally.test.ts` | 10 | **全新** | V13、SC-005 | T006–T007、T077 |
| 7 | `tests/voting.test.ts` | 8 | **重写 v1**（#118–125） | V10 | T073–T075 |
| 8 | `tests/witch.test.ts` | 17 | **全新** | V06 | T025、T033（14）+ T091（3） |
| 9 | `tests/hunter.test.ts` | 12 | **全新** | V07 | T053（11）+ T088（1） |
| 10 | `tests/death-chain.test.ts` | 18 | **全新** | V16–V19、§5.3 五性质 | T045、T048、T057 |
| 11 | `tests/sheriff.test.ts` | 26 | **全新** | V11、V12、V14、V15、V28 | T061、T064、T067 |
| 12 | `tests/victory.test.ts` | 8 | **重写 v1**（#110–117） | V08 | T037–T038 |
| 13 | `tests/victory-edge.test.ts` | 10 | **全新** | V08、V21 | T039–T040 |
| 14 | `tests/mode.test.ts` | 8 | **全新** | V09 | T042–T043 |
| 15 | `tests/preset.test.ts` | 10 | **全新** | V20 | T051–T052、T093 |
| 16 | `tests/isolation.test.ts` | 12 | **重写 v1**（#62–73） | V24、V26、SC-009 | T035（4）+ T103（8） |
| 17 | `tests/hotseat.test.ts` | 10 | **全新** | V23、SC-009(a) | T105–T106 |
| 18 | `tests/pending-matrix.test.ts` | 8 | **全新** | 18 阶段对账 | T011、T022 |
| 19 | `tests/events.test.ts` | 25 | **重写 v1**（#32–56） | V27、SC-012 | T095、T097、T099 |
| 20 | `tests/record-replay.test.ts` | 8 | **全新** | V27、SC-012 | T101–T102 |
| 21 | `tests/boundary.test.ts` | 10 | **全新** | spec 23 边界兜底 | T125–T126 |
| 22 | `tests/termination.test.ts` | 4 | **全新** | V02、SC-002 | T127–T128（4 条在 M10 一次写全） |
| 23 | `tests/ai.test.ts` | 22 | **重写 v1**（#1–22） | V25、FR-066–076 | T081、T083、T085、T087、T089 |
| | **合计** | **276** | 保留 20 / 重写 105 / 全新 151 | | |

## 实施纪律（违反即返工）

1. **TDD 强制**：每个「先写测试（红）」任务必须先真实跑红（在任务记录里贴出失败输出），再接对应实现；
   实现任务以「对应断言转绿」为完成判据；**测试失败修实现不修测试**。
2. **v1 迁移三类清单**（plan 附录 B，125 = 保留 20 + 重写 105 + 淘汰 0）：
   - **保留 20 条**（`rng.test.ts` 12 + `reproducibility.test.ts` 8）——对应任务 **T002 / T129** 必须显式写
     **「原样保留、断言零改动」**；唯一允许的改动是 `createGame(config)` / autoplay 的**调用行**（T128）。
     验收方式：`git diff` 里这些用例的断言行零改动 + 原文件 + 原用例名（附录 B 编号）+ 仍通过，三点齐。
   - **重写 105 条**：承接任务必须保留 v1 **原用例名**（附录 B 编号），逐条写「旧断言 → 新断言」；
     **不许静默删除**，不许两条并一条而不留痕（合并须在任务记录注明「A+B → C」）。
   - **淘汰 0 条**：实施期若必须淘汰，先登记附录 B「淘汰」小节并写「规则上为什么不再成立」，经 Lisa 确认后才合并。
3. **四条自锁必须落成可执行检查**（不是口头约定）：

   | 自锁 | 可执行形式 | 落点任务 |
   |---|---|---|
   | `Math.random` 零字面 | 源码扫描 `src/engine/**/*.ts`、`src/ai/**/*.ts` 无 `Math.random`（v2 自动覆盖 tally/victory/chain/phases/badge-preset） | T129 |
   | `engine/` 与 `ai/` 零 DOM | 源码扫描：两目录无 `react` / `react-dom` import、无 `window` / `document` / `performance` / `Date` | T130 |
   | 事件可序列化 | `JSON.parse(JSON.stringify(exportGame()))` 深相等 + 递归扫描全键名无 `time`/`timestamp`/`date`/`clock` + 数字量级不含 epoch 毫秒 | T096、T098 |
   | AI 只用投影 | `ai/` import 白名单（只 `type` 引 engine 类型 + ai 内部）+ `DecisionRequest` 深检不含他人 `role` / `badgePreset` / `potions` | T103、T104、T129 |

4. **规则修订流程**（硬约束 5）：任务若发现规则文档表述缺口，先报小明 → Lisa 过目 → 改 `docs/游戏规则.md` → 再改代码与测试。
   **本任务清单不改任何规则、不改 `specs/001-*`、不改 plan/research/data-model/contracts/spec。**
5. **D13 口径（已定案）**：规则 §7.1 / §12.1-D 与 spec FR-094 已于提交 `dbedc0f` 修订为「毒药不能烂在手里」，
   见文件头「前置已解决」；T026 的毒药分支与 T091–T092 的女巫评分按该口径实现，不再有文档前置。

## 必须脚本化构造的夹具（四个场景，单列于此）

> 这些局面**不能靠 autoplay 撞运气**，必须用「固定 seed + 显式动作序列」脚本化构造，
> 断言中间态（阶段 / pending / 事件序）。夹具放 `tests/helpers/`（不新增套件，v1 已有 `tests/helpers/autoplay.ts` 先例）：
> 新增 `tests/helpers/scripted.ts`（`runScript(seed, config, steps[]): { engine, events }`，每步可断言 `phase` / `pendingDecision`）。

| # | 场景 | 构造方式 | 断言点 | 落点任务 |
|---|---|---|---|---|
| 1 | **首夜遗言（单死）** | `mode:'open'`，`humans:[A]`＋固定 seed（实施期实算后回填 quickstart §1.3）；动作序列：`wolfKill(A)` → `witchAction{use:'none'}` → `seerCheck(B)` → `confirm`(dawn) → `lastWords(A)`。 | `phase==='dawn'` 时 `player_died` 恰 1 条且 `window==='first-night'`；`last_words` 事件 `skipped` 两态各一条；遗言阶段 `pending.actor===A`（FR-022/024） | T045、T047 |
| 2 | **首夜双死（刀 + 毒，目标不同）** | 同 seed；`wolfKill(A)` → `witchAction{use:'poison', target:B}` → `seerCheck(C)` → `confirm`。 | `player_died` 顺序恒为 A（night-kill）→ B（poison）；两人 `window==='first-night'`；`last_words` 顺序 A→B（§5.3-P / FR-021） | T045、T057 |
| 3 | **首夜枪伤链（猎人被刀 → 开枪 → 被枪者遗言）** | 同上，刀口与毒药目标选为「猎人 A」与「普通死者 C」；序列 `wolfKill(A猎人)` → `poison C` → `confirm` → `lastWords(A)` → `confirm`(badge) → `hunterShoot(B)` → `lastWords(B)` → `lastWords(C)` → `sheriffSignup…`。 | 事件序逐条命中 data-model §6.5 t0–t9：`player_died(A) player_died(C) last_words(A) hunter_shot(B) player_died(B) last_words(B) last_words(C) sheriff_signup…`；`queue.unshift` 生效（V17） | T057 |
| 4 | **PK 场景（首投并列 → PK 发言 → 再投）** | 9 人存活、3 人上警（座位 A/B/C）；用 `castVote` 脚本把首投压成 A/B 并列（其余弃票或投 A/B 均分）；再投构造两条路径：① 唯一最高 ② 再平（→ `tie-exhausted`）。 | 首投 `vote_result{scope:'sheriff', outcome:'tie', tiedSeats:[A,B]}`；`sheriff_pk_speak` 阶段 `pending` 只在 A/B；再平 → `sheriff_elected{seat:null, reason:'tie-exhausted'}` + `badgeLost`（V12 / FR-046） | T067、T069 |

> **口径提醒**：「全等」= `JSON.stringify(exportGame())` 逐字节比较（事件无墙钟）；统计断言**先写口径后写数**。

## 规则 §10 的 29 条验收 ↔ 任务

| 验收 | 自动/人工载体 | 任务 |
|---|---|---|
| V01 `pnpm dev` + 375×812 可操作 | 人工 quickstart §1.2 | T122、T132 |
| V02 任意身份到 `game_over` | `termination` | T127、T128 |
| V03 固定 seed 复现（逐字节全等） | `reproducibility`（保留） | T129 |
| V04 1000 seed 发牌 3/1/1/1/3 | `identity` | T018 |
| V05 昼夜顺序 + 死者跳过 | `phases` | T029、T030 |
| V06 女巫六条 | `witch` | T025、T031 |
| V07 猎人四条 | `hunter` | T053、T054 |
| V08 屠边三种 + 两组合边界 | `victory` / `victory-edge` | T038、T039 |
| V09 明暗牌 | `mode` | T042、T043 |
| V10 投票法沿用 | `voting` | T073、T074 |
| V11 竞选流程与三种边界 | `sheriff` | T061、T062、T063 |
| V12 PK 全路径 | `sheriff` | T067、T069 |
| V13 1.5 票计票 | `tally` | T004、T007、T077 |
| V14 定发言顺序 | `sheriff` | T070、T071 |
| V15 竞选期间无死亡 | `sheriff`（I15） | T070 |
| V16 遗言范围 | `death-chain` | T045 |
| V17 首夜枪伤链 | `death-chain` | T057 |
| V18 遗言→移交→开枪 | `death-chain` | T057 |
| V19 无遗言仍移交 | `death-chain` | T048、T049 |
| V20 预设五条 | `preset` | T051、T052 |
| V21 判胜时机 | `victory-edge` | T039、T059 |
| V22 死者操作权 | `death-chain` + `hotseat` | T047、T119 |
| V23 遮挡页 | `hotseat` | T105、T106、T123 |
| V24 警长标记 / 1.5 票 / 预设控件 | `isolation` + 人工 | T111、T103 |
| V25 AI 确定性 | `ai` | T081、T094 |
| V26 信息隔离 | `isolation` | T103 |
| V27 可序列化 + 可重放 | `events` + `record-replay` | T098、T101 |
| V28 退水 | `sheriff` | T064、T066 |
| V29 全部 Vitest 全绿 | 全量 | T129、T132 |

## spec 的 23 条边界 ↔ 任务

| # | 边界（spec「边界情形」） | 任务 |
|---|---|---|
| 1 | 首夜 0 死 → 无遗言直接进竞选 | T031、T034 |
| 2 | 首夜被毒死者仍有遗言、猎人不能开枪 | T045、T053 |
| 3 | 首夜猎人被刀 → 遗言 → 开枪 → 被枪者遗言 | T057 |
| 4 | 首夜猎人被毒 → 有遗言、不能开枪 | T045、T053 |
| 5 | 首夜双死 → 两人都有遗言，先刀后毒 | T045 |
| 6 | 同目标又刀又毒 → 1 死、cause=poison、猎人不能开枪 | T031、T125 |
| 7 | 第 2 夜起无遗言；警长仍按预设移交 | T048 |
| 8 | 警长被放逐 → 遗言 → 移交 →（猎人）开枪 | T057 |
| 9 | 枪杀打死刚接任的警长 | T055 |
| 10 | 预设目标先死 → 视为未指定 → 流失 | T049、T051 |
| 11 | 无人上警 → 无警长、座位升序发言 | T063、T071 |
| 12 | 仅 1 人上警 → 直接当选 | T063 |
| 13 | 全员上警无人退水 → 无警长 | T069 |
| 14 | 上警者全部退水 → 无警长 | T066 |
| 15 | 退水后只剩 1 人 → 直接当选 | T066 |
| 16 | 退水者仍投票 | T067、T068 |
| 17 | 竞选（含 PK）期间无死亡 | T070 |
| 18 | 放逐平票 / 全弃 → 平安日 | T074、T075 |
| 19 | 真人出局仍有遗言/开枪 → 之后转观战 | T119 |
| 20 | 同夜两条屠边 → 取 `gods-eliminated` | T039 |
| 21 | 最后一狼也被毒死 → 好人胜 | T039 |
| 22 | 猎人自己是最后一名神/民 → 遗言与开枪都跳过 | T039、T059 |
| 23 | 反复平票 → 有限轮次终止 | T127 |

---

## 阶段 1：M1 底座（T001–T010）

**目标**: `rng/` 原样保留校验；`types.ts` 重写（Seat 1–9 / 5 角色 / 18 阶段 / 17 动作 / GameState + 5 子状态）；
`tally.ts` 半票计票唯一实现；`createGame` 配置校验。
**独立验收**: ① `tsc --noEmit` 0 错误；② `rng.test.ts` 12 绿（断言零改动）；③ `tally.test.ts` 10 绿（含 §5.5 五用例 + 奇偶律）。
**FR/套件**: FR-001–003、FR-049–053（口径）；`rng`（保留）、`tally`（全新）、`identity`（config 部分）。

- [ ] T001 建立 v1 迁移台账并锁定基线：新建 `specs/002-nine-player-board/checklists/v1-迁移台账.md`，逐行登记 v1 125 个用例名（plan 附录 B 原文）+ 三类判定（保留/重写/淘汰）+ 保留 20 条的「原文件 / 原用例名」
  - 文件：`specs/002-nine-player-board/checklists/v1-迁移台账.md`（新建）
  - 依赖：无
  - 验收：`pnpm test` 在**任何 v2 改动之前**全绿（v1 125 用例）；`git status --short` 无源码改动；台账 125 行、`20 + 105 + 0 = 125` 三数闭合

- [ ] T002 [P] 校验 `src/rng/` 与 `tests/rng.test.ts` **原样保留、断言零改动**（附录 B #98–109，12 条）
  - 文件：`src/rng/rng.ts`、`src/rng/shuffle.ts`、`tests/rng.test.ts`（三文件零改动）
  - 依赖：T001
  - 验收：`git diff --stat -- src/rng tests/rng.test.ts` 输出为空；`pnpm vitest run tests/rng.test.ts` **12 绿**；12 条用例名与附录 B 逐条对应
  - 规则：无（与规则无关的底座，contracts/engine-api.md §5 承诺不改算法）

- [ ] T003 重写 `src/engine/types.ts` 第一层：`Seat`（1–9）、`Role`（werewolf/seer/witch/hunter/villager）、`Faction`、`edgeOf`（god = 预/女/猎，villager = 村民）、`BOARD`（3/1/1/1/3）、`isHuman` 判定
  - 文件：`src/engine/types.ts`
  - 依赖：T002
  - 验收：`pnpm exec tsc --noEmit` 0 错误；`BOARD` 多重集计数 = 3/1/1/1/3（对照 data-model §1.1）

- [ ] T004 重写 `src/engine/types.ts` 第二层：18 个 `Phase`、17 个 `Action` 成员（**全部玩家动作必带 `actor`**）、`Claim`、`EngineErrorCode`（5 值）、`PendingKind`（10 值）
  - 文件：`src/engine/types.ts`
  - 依赖：T003
  - 验收：`pnpm exec tsc --noEmit` 0 错误；阶段/动作个数与顺序逐行对照 data-model §2 / §3（18 / 17），无增无减
  - 规则：§5.1（阶段全集 18 态）

- [ ] T005 重写 `src/engine/types.ts` 第三层：`GameState` + 五个子状态 `night` / `votes` / `election` / `sheriff` / `settle`、`potions`、`speech`、`config`
  - 文件：`src/engine/types.ts`
  - 依赖：T004
  - 验收：`pnpm exec tsc --noEmit` 0 错误；字段与 data-model §1.9 逐字段对齐（**无隐藏状态**：`settle` / `presetWindow` / `potions` / `election` 全部显式）

- [ ] T006 先写 `tests/tally.test.ts`（红）10 条：规则 §5.5 五个防歧义用例（3.5:3 / 2.5:2 / 1.5:3:3 / 全弃 / 1.5:3）+ 奇偶律 + 守恒律 + 单调律 + `displayHalf` + `resolveMajority` 全弃口径
  - 文件：`tests/tally.test.ts`（新建）
  - 依赖：T005
  - 验收：`pnpm vitest run tests/tally.test.ts` 失败（红，`src/engine/tally.ts` 不存在）
  - 规则：§5.5（计票口径全文唯一出处）

- [ ] T007 实现 `src/engine/tally.ts`：`weightHalf`（警长 3 / 其他 2）、`tallyHalf`（跳过弃票）、`displayHalf`（'3' | '3.5'）、`resolveMajority`（max=0 → winners=[]）
  - 文件：`src/engine/tally.ts`（新建）
  - 依赖：T006
  - 验收：`pnpm vitest run tests/tally.test.ts` **10 绿**；`grep -n "1\.5" src/engine/tally.ts` 的命中只出现在展示串/注释，比较运算全部整数
  - 规则：§5.5、FR-049/050/051

- [ ] T008 先写配置校验断言（红）追加到 `tests/identity.test.ts`：`seed` 空串、`humans` 空数组、`humans` 越界/重复、`mode` 非法 各抛 `BAD_CONFIG`
  - 文件：`tests/identity.test.ts`
  - 依赖：T007
  - 验收：`pnpm vitest run tests/identity.test.ts` 失败（红）
  - 规则：§1（范围）、FR-003；contracts/engine-api.md §3

- [ ] T009 实现 `createGame(config, deps?)` 配置校验与 `BadConfigError`（`src/engine/engine.ts` 最小骨架）+ `GameConfig` / `EngineDeps` 类型
  - 文件：`src/engine/engine.ts`、`src/engine/types.ts`
  - 依赖：T008
  - 验收：identity 的 config 断言转绿；非法配置抛 `BAD_CONFIG` 且**不返回半初始化对象**；`tsc --noEmit` 0 错误
  - 规则：§11-4（`createGame(seed, {humans, mode})` 配置化）

- [ ] T010 M1 收口：`pnpm vitest run tests/rng.test.ts tests/tally.test.ts` + `pnpm exec tsc --noEmit`
  - 文件：`tests/rng.test.ts`、`tests/tally.test.ts`（只复跑，不改）
  - 依赖：T009
  - 验收：**22 绿**（rng 12 + tally 10）、`tsc --noEmit` **0 错误**；rng 文件 `git diff` 仍为空

---

## 阶段 2：M2 18 阶段骨架（T011–T024）

**目标**: `phases.ts` 规格表 18 项；`transition.ts` 17 动作分派 + 统一前置校验；`derivePending`；门面骨架；
`startGame` 发牌；空转骨架（不含结算细节）。
**独立验收**: ① `pending-matrix.test.ts` 8 绿（18 阶段 actor/kind/legalTargets 全覆盖）；② 每阶段「非法动作 → `WRONG_PHASE`」表驱动全绿；③ **单轮骨架可达性**：脚本动作序列走通 `idle → night_wolf → night_witch → night_seer → dawn → day_speak`（只断 `phase` 与 `pendingDecision`，**不追求 `game_over`**；整局可达性 4 条在 M10 的 T127–T128 一次写全）。
**FR/套件**: FR-003、008、013、038–048（骨架面）、054–057；`pending-matrix`、`phases`、`identity`。

- [ ] T011 [P] 先写 `tests/pending-matrix.test.ts`（红）8 条：18 阶段 × (actor, kind, legalTargets) 全覆盖表驱动（13 个有 pending 阶段逐行 + 5 个无 pending 阶段断言 `null`）
  - 文件：`tests/pending-matrix.test.ts`（新建）
  - 依赖：T010
  - 验收：`pnpm vitest run tests/pending-matrix.test.ts` 失败（红）
  - 规则：§5.1；contracts/engine-api.md §2（10 种 kind 表）

- [ ] T012 实现 `src/engine/phases.ts` 规格表：`PHASES` 18 项，每项 `{ actor, legalTargets, acceptedKinds, enter }`（`enter` 先占位）
  - 文件：`src/engine/phases.ts`（新建）
  - 依赖：T011
  - 验收：规格表项数 **18**、阶段名与顺序逐行对照 data-model §2；源码条数 = 规则 §5.1 行数（1 项 1 段，无 switch 大块）
  - 规则：§5.1

- [ ] T013 先写非法动作断言（红）追加到 `tests/phases.test.ts`：18 阶段 × 17 动作表驱动 → `WRONG_PHASE`；`game_over` 后任何动作 → `GAME_OVER`；`actor` 缺失 → `NOT_YOUR_TURN`
  - 文件：`tests/phases.test.ts`
  - 依赖：T012
  - 验收：`pnpm vitest run tests/phases.test.ts` 失败（红）
  - 规则：§5.2 通用前提

- [ ] T014 实现 `src/engine/transition.ts` 分派骨架：`transition(state, action, ctx)` 按 `action.type` 分派到 17 个处理器 + 统一前置校验（phase / acceptedKinds / actor / target）
  - 文件：`src/engine/transition.ts`
  - 依赖：T013
  - 验收：phases 非法动作表转绿；**非法动作状态不变、不产事件**（三条不变量，contracts/engine-api.md §1）
  - 规则：§5.2（18 行转移表）

- [ ] T015 实现 `derivePending`（`src/engine/phases.ts` 表驱动）与 10 种 `PendingKind` 的 actor / legalTargets 解析
  - 文件：`src/engine/phases.ts`、`src/engine/engine.ts`
  - 依赖：T014
  - 验收：`pending-matrix.test.ts` 中 actor/kind 部分转绿；`legalTargets` 与 transition 的校验函数**同源**（同一份实现，不各算一遍）
  - 规则：§5.1

- [ ] T016 实现 Engine 门面 v2 骨架（`src/engine/engine.ts`）：`state` / `dispatch` / `pendingDecision` / `decisionRequest` / `viewFor` / `eventsFor` / `eventLog` / `exportGame` 八成员签名 + 事件日志 `seq` 全局递增 + 错误返回契约（不抛裸异常）
  - 文件：`src/engine/engine.ts`
  - 依赖：T015
  - 验收：`tsc --noEmit` 0 错误；`dispatch` 失败时 `state` / `eventLog` / `pendingDecision` 三者不变（断言可写）
  - 规则：§11-1/§11-2（可裸驱动、可搬服务端）

- [ ] T017 先写发牌断言（红）重写 `tests/identity.test.ts` 5 条（附录 B #57–61）：1000 seed 角色计数恒 3/1/1/1/3、1–9 座各一次、`isHuman` 与 `humans` 集合一致、同 seed 重发一致、发牌后 `night_wolf(round=1)` 事件序
  - 文件：`tests/identity.test.ts`
  - 依赖：T016
  - 验收：`pnpm vitest run tests/identity.test.ts` 失败（红）
  - 规则：§2（板子与节奏）、FR-001/002

- [ ] T018 实现 `startGame`（转移 1）于 `src/engine/transition.ts`：`rng.shuffle(BOARD)` 一次洗牌发 9 座 + `humans` 配置写入 + 产出 `game_started` → `night_started` → `roles_dealt`（`end`）
  - 文件：`src/engine/transition.ts`、`src/engine/engine.ts`
  - 依赖：T017
  - 验收：`tests/identity.test.ts` **5 绿**（含 1000 seed 统计）；发牌只消费一次 `shuffle`
  - 规则：§2、FR-001/002/003

- [ ] T019 改造 `src/engine/events.ts` 为 19 类事件骨架：类型 + 构造器 + 公共字段 `seq` / `round` / `visibility`（载荷细项留 M8 收口）
  - 文件：`src/engine/events.ts`
  - 依赖：T018
  - 验收：`tsc --noEmit` 0 错误；19 类 `type` 与 contracts/event-stream.md §1 表逐行对应（本任务只落骨架与构造器，不做载荷白名单）
  - 规则：§9

- [ ] T020 [P] 先写单轮骨架可达性断言（红）追加到 `tests/phases.test.ts`（并入该套件 16 条，对应 v1 #78 的重写，**不新增套件**）：用 `tests/helpers/scripted.ts` 的动作序列走通 `idle → night_wolf → night_witch → night_seer → dawn → day_speak` 一轮，断言对象为每步的 `phase` 与 `pendingDecision` 的 `kind`/`actor`，**不追求 `game_over`**（整局可达性 4 条在 M10 的 T127–T128 一次写全）
  - 文件：`tests/phases.test.ts`、`tests/helpers/scripted.ts`（新建）
  - 依赖：T019
  - 验收：`pnpm vitest run tests/phases.test.ts` 失败（红；本任务只写单轮骨架这 1 条，**不写 `termination.test.ts`**）
  - 规则：§5.2（18 行转移表）

- [ ] T021 实现空转流转（`src/engine/transition.ts`）：夜间三环节串联 → `dawn` → 无死者直接进入白天 → `day_speak` / `day_vote` / `day_exile` 占位 → `night_wolf(round+1)`；**本任务不含任何结算与判胜**
  - 文件：`src/engine/transition.ts`
  - 依赖：T020
  - 验收：单轮骨架脚本走通（`phase` 依次推进到 `day_speak`，`pendingDecision` 与阶段表一致）；`round` 只在进夜时 +1（I7）
  - 规则：§5.2

- [ ] T022 补全 13 个有 `pending` 阶段的 `actor` / `legalTargets` 实现，使 `pending-matrix.test.ts` 转绿
  - 文件：`src/engine/phases.ts`
  - 依赖：T021
  - 验收：`pnpm vitest run tests/pending-matrix.test.ts` **8 绿**；`legalTargets` 为快照副本（改返回值不污染引擎）
  - 规则：§5.1；contracts/engine-api.md §2

- [ ] T023 补齐 5 个系统阶段（`idle` / `dawn` / `badge_transfer` / `day_exile` / `game_over`）的 `pending===null` 语义与自动推进
  - 文件：`src/engine/phases.ts`、`src/engine/engine.ts`
  - 依赖：T022
  - 验收：`pending-matrix.test.ts` 中 5 个 `null` 断言全绿；驱动循环只需一个 `confirm` 分支
  - 规则：§5.2

- [ ] T024 M2 收口：`pending-matrix` 8 绿 + `phases` 非法动作表与单轮骨架全绿
  - 文件：`tests/pending-matrix.test.ts`、`tests/phases.test.ts`（只复跑）
  - 依赖：T023
  - 验收：`pnpm vitest run tests/pending-matrix.test.ts tests/phases.test.ts` 绿；`tsc --noEmit` 0 错误

---

## 阶段 3：M3 夜间三角色（T025–T036）

**目标**: 狼刀 / 女巫双药 / 查验 + `settleNight`（解药 0 死、同目标记 poison、0–2 死）+ 跳过口径 + 女巫私有投影。
**独立验收**: ① `witch.test.ts` 14 绿；② `phases.test.ts` 夜间序列与跳过口径绿；③ 断言「0 死之夜」不产 `player_died`。
**FR/套件**: FR-008–019；`witch`、`phases`、`isolation`（4 条）。
**前置**: 无（D13 文档修订已于提交 `dbedc0f` 完成，见文件头「前置已解决」）——T026 的毒药分支直接按规则 §12.1-D 口径实现。

- [ ] T025 [P] 先写 `tests/witch.test.ts`（红）第一批 7 条：解药救刀口 → 0 死 / 同夜只用一瓶 / 用毒时狼刀照常（双死）/ 不可毒自己 / 任意夜可自救 / 用完即无 / 女巫死跳过
  - 文件：`tests/witch.test.ts`（新建）
  - 依赖：T024
  - 验收：`pnpm vitest run tests/witch.test.ts` 失败（红）
  - 规则：§3.1、§12.1-A（任意夜可自救）、FR-010–013

- [ ] T026 实现 `night_witch` 转移于 `src/engine/transition.ts`：`witchAction` 全校验（`save` ⇒ 当夜刀口 ∧ 解药在；`poison` ⇒ 毒药在 ∧ 目标存活 ∧ ≠自己；`none` 恒合法）+ 同夜一瓶 + `potions` 消耗 + `witch_action`（`witch-private`）事件
  - 文件：`src/engine/transition.ts`、`src/engine/types.ts`
  - 依赖：T025
  - 验收：T025 前 4 条转绿；药况用尽后无合法 `poison`/`save`
  - 规则：§3.1、§12.1-A、§12.1-D（「毒药不能烂在手里」：查杀优先 → `round ≥ 2` 评分必用）

- [ ] T027 实现 `night_wolf` 转移：`wolfKill` 校验（目标存活 ∧ `role≠werewolf`）+ `resolveWolfTeamRep`（存活真人狼座位最小者优先，D77）+ `wolf_kill_decided`（`wolf-team`）事件
  - 文件：`src/engine/transition.ts`、`src/engine/engine.ts`
  - 依赖：T026
  - 验收：刀队友 / 刀死者 → `ILLEGAL_TARGET` 且状态不变；非代表真人狼提交 → `NOT_YOUR_TURN`
  - 规则：§5.2-2、FR-009；contracts/engine-api.md §2.2

- [ ] T028 实现 `night_seer` 转移：`seerCheck` 校验（存活 ∧ ≠自己，重复合法）+ 二值结果 + `seer_check_completed`（`seer-private`）事件
  - 文件：`src/engine/transition.ts`
  - 依赖：T027
  - 验收：验自己 → `ILLEGAL_TARGET`；验狼 = `werewolf`、验好人 = `good`；跨夜重复验同一人合法
  - 规则：§5.2-4、FR-016

- [ ] T029 实现夜间跳过口径 `advanceTo(next)`（`src/engine/phases.ts`）：女巫死跳 `night_witch`、预言家死跳 `night_seer`、两者皆死直接夜结算
  - 文件：`src/engine/phases.ts`
  - 依赖：T028
  - 验收：`phases.test.ts` 跳过断言转绿；「当夜被刀的预言家仍能查验」为合法（结算时点口径，data-model §5.1）
  - 规则：§5.1 注、FR-013

- [ ] T030 先写夜间序列断言（红）追加到 `tests/phases.test.ts`（重写附录 B #74–80 部分）：狼→女巫→验→天亮固定序 + 女巫/预言家死各自跳过 + 刀队友/刀死者/验自己 → `ILLEGAL_TARGET` + 阶段不符 → `WRONG_PHASE`
  - 文件：`tests/phases.test.ts`
  - 依赖：T029
  - 验收：`pnpm vitest run tests/phases.test.ts` 失败（红）
  - 规则：§5.1、§5.2-2/3/4、V05

- [ ] T031 实现夜间流转串联（`transition.ts` 转移 2/3/4 的出口）与 `settleNight` 第 1 步：解药生效 → **该刀口不死亡、不产 `player_died`**
  - 文件：`src/engine/transition.ts`、`src/engine/settle.ts`
  - 依赖：T030
  - 验收：T030 的顺序与跳过断言转绿；0 死之夜断言（`player_died` 计数 = 0）绿
  - 规则：§5.2、FR-014

- [ ] T032 实现 `settleNight` 第 2/3 步 + `recordDeaths` + `player_died`（`{seat, cause, window, revealedRole?}`）于 `src/engine/settle.ts`：刀 + 毒 → 0–2 死；**同目标只算 1 死且 `cause` 改写为 `poison`**；顺序恒「狼刀 → 毒药」
  - 文件：`src/engine/settle.ts`、`src/engine/events.ts`
  - 依赖：T031
  - 验收：双死顺序断言绿；同目标断言（1 条 `player_died`、`cause==='poison'`）绿；`window` 首夜 = `first-night`、round≥2 = `night`
  - 规则：§5.3-P、§12.1-P③、FR-015/017/018

- [ ] T033 先写 dawn 与女巫私有断言（红）追加到 `tests/witch.test.ts` 共 7 条：0 死之夜无 `player_died` / 双死顺序 / `dawn` 本身不产事件 / 同目标记 poison / `knifeTarget` 仅在女巫自己回合可见 / `myPotions` 仅本人 / 非女巫视图无这两个键
  - 文件：`tests/witch.test.ts`
  - 依赖：T032
  - 验收：`pnpm vitest run tests/witch.test.ts` 失败（红，视图部分未实现）
  - 规则：§5.2-5、§9.1、FR-010/017

- [ ] T034 实现 `dawn` 进入钩子于 `src/engine/settle.ts`：记录 0–2 名死者 → **本任务不判胜**（M4 接入）→ 建 `settle` 占位 → `confirm` 推进到下一阶段
  - 文件：`src/engine/settle.ts`
  - 依赖：T033
  - 验收：`dawn` 的 4 条规则断言转绿；`dawn` 不产事件（事件只在结算时产）
  - 规则：§5.2-5

- [ ] T035 [P] 先写 `tests/isolation.test.ts` 女巫组（红）4 条（重写附录 B #62–73 的第 1 组）：五角色 × 夜间三阶段谁持有 pending / `knifeTarget` 不出现在他人视图 / `myPotions` 键集合闭包 / 未发牌与非法座位抛错
  - 文件：`tests/isolation.test.ts`
  - 依赖：T034
  - 验收：`pnpm vitest run tests/isolation.test.ts` 失败（红）
  - 规则：§9.1；contracts/visibility.md §3/§5

- [ ] T036 实现 `src/engine/view.ts` 女巫字段投影：`knifeTarget` / `myPotions` 条件字段 + `witch-private` 可见性过滤 + 门面 `viewFor` / `eventsFor` 接线
  - 文件：`src/engine/view.ts`
  - 依赖：T035
  - 验收：`pnpm vitest run tests/isolation.test.ts` 4 绿 + `tests/witch.test.ts` **14 绿**（M3 收口）；他人视图键集合不含女巫字段
  - 规则：§9.1、FR-010/064；contracts/visibility.md §5

---

## 阶段 4：M4 判胜 + 明暗牌（T037–T044）

**目标**: `victory.ts`（屠边 3 条 + 优先序）；判胜**单一调用点**；`game_over` 终表；明暗牌投影。
**独立验收**: ① `victory.test.ts` 8 绿；② `victory-edge.test.ts` 10 绿；③ `mode.test.ts` 8 绿（暗牌终局前无 `revealedRole`）。
**FR/套件**: FR-017–019、FR-058–065；`victory`、`victory-edge`、`mode`。
**并行**: 本阶段与 M6 无依赖（plan：M4 与 M6 可并行），但两者都改 `transition.ts`，实际建议串行（见「并行说明」）。

- [ ] T037 [P] 先写 `tests/victory.test.ts`（红）8 条（重写附录 B #110–117）：狼全灭→好人胜 / 神全灭→狼胜 / 民全灭→狼胜 / 夜刀即判 / 放逐即判 / 终表 9 项 / `day_exile` confirm 未判胜 → `night_wolf(round+1)` / 终局后动作 → `GAME_OVER`
  - 文件：`tests/victory.test.ts`
  - 依赖：T036
  - 验收：`pnpm vitest run tests/victory.test.ts` 失败（红）
  - 规则：§6、FR-058–062

- [ ] T038 实现 `src/engine/victory.ts` `checkVictory`：三条 `if`（狼 0 → 神 0 → 民 0）+ `edgeOf` 口径；**书写顺序即优先序**
  - 文件：`src/engine/victory.ts`（新建）
  - 依赖：T037
  - 验收：T037 前 3 条转绿；`gods` 与 `villagers` 同时为 0 → 返回 `gods-eliminated`
  - 规则：§6、FR-058/059/061

- [ ] T039 [P] 先写 `tests/victory-edge.test.ts`（红）10 条：双屠边优先取神灭 / 最后一狼被毒 → 好人胜 / 猎人自身死亡已判胜（跳过遗言与开枪）/ 遗言阶段不判胜 / 每次结算只判一次 / 枪杀即时判胜 / 放逐不成立继续 / 终局无 `settle` / 判胜跳过链 / `victory` 恰一条且紧跟 `game_over`
  - 文件：`tests/victory-edge.test.ts`（新建）
  - 依赖：T038
  - 验收：`pnpm vitest run tests/victory-edge.test.ts` 失败（红）
  - 规则：§6、§12.1-O、FR-060/061；data-model §8

- [ ] T040 实现结算点唯一入口 `enterSettlement`（`src/engine/settle.ts`）：① 全部死亡记录完 → ② **只调一次** `checkVictory` → ③ 成立即 `applyVictory` + `victory` 事件（不启动链）
  - 文件：`src/engine/settle.ts`、`src/engine/events.ts`
  - 依赖：T039
  - 验收：`checkVictory` 在全代码中**只有 1 处调用**（`grep -c "checkVictory(" src/engine/*.ts` = 定义 1 + 调用 1；枪杀结算点 `onHunterShoot` 是第二处，在 T059 才接入）；「先死先赢」断言绿
  - 规则：§5.3、§6、FR-019/060

- [ ] T041 实现 `game_over` 终表：`finalTable`（9 项 `seat/role/alive/isHuman`）+ `badgeFlow` 占位（M5 填）+ `game_over` 事件
  - 文件：`src/engine/settle.ts`、`src/engine/events.ts`
  - 依赖：T040
  - 验收：终表 9 项、顺序与 `BOARD` 一致；`victory` → `game_over` 相邻（I13）
  - 规则：§6、FR-062

- [ ] T042 [P] 先写 `tests/mode.test.ts`（红）8 条：明牌死亡即翻 / 暗牌不翻 / 终局全翻 / 暗牌不泄漏边计数 / 遗言不改翻牌口径 / `mode` 只读 / `player_died` 条件字段 / `players[]` 条件字段
  - 文件：`tests/mode.test.ts`（新建）
  - 依赖：T041
  - 验收：`pnpm vitest run tests/mode.test.ts` 失败（红）
  - 规则：§4、FR-007/063/064/065

- [ ] T043 实现 `revealedRole` 条件投影：`player_died{revealedRole?}`（`mode==='open'`）+ `view.players[].revealedRole?` + 终局全翻；`mode` 在 `startGame` 后无任何动作可改
  - 文件：`src/engine/view.ts`、`src/engine/events.ts`
  - 依赖：T042
  - 验收：`tests/mode.test.ts` **8 绿**；暗牌局视图无任何阵营/边计数聚合字段（FR-064）
  - 规则：§4、FR-063

- [ ] T044 判胜唯一性自锁 + 不变式断言：`checkVictory` 单调用点源码扫描 + I4/I5/I6（`game_over` ⇔ `winner`；`settle≠null` ⇒ 三阶段；三阶段 ⇒ `settle≠null`）
  - 文件：`tests/victory.test.ts`、`tests/victory-edge.test.ts`、`src/engine/settle.ts`（扫描）
  - 依赖：T043
  - 验收：`pnpm vitest run tests/victory.test.ts tests/victory-edge.test.ts tests/mode.test.ts` **26 绿**；`tsc --noEmit` 0 错误
  - 规则：§6、data-model §9

**检查点（M4 结束）· 由小明执行**

1. **复跑全部既有用例**：此刻应有 `rng 12 / tally 10 / identity 5 / pending-matrix 8 / phases 16 / witch 14 / isolation 4 / victory 8 / victory-edge 10 / mode 8` = **95 用例**，全绿。
2. **`tsc --noEmit`**：0 错误。
3. **硬约束扫描（四查）**：① `src/engine`、`src/ai` 无 `Math.random` 字面；② `src/engine`、`src/ai` 无 `react`/`react-dom` import、无 `window`/`document`/`Date`；③ 事件 `JSON.parse(JSON.stringify())` 往返深相等；④ AI 仅经 `DecisionRequest.view` 取信息。
4. **M5/M6 完成后触发独立对抗审查（`deepseek-v4-flash`）**：M5 审规则 §5.3 五性质（T060）、M6 审 V11/V12/V15/V28（T078）。
5. 任一查不过 → **不进 M5**。

---

## 阶段 5：M5 死亡后续链 ⚠️审查点（T045–T060）

**目标**: `chain.ts`（`queue` / `ChainResume` / `step` / `advanceChain`）+ 遗言 + 警徽移交 + 猎人开枪 + `wasSheriff` 快照。
**独立验收**: ① `death-chain.test.ts` 18 绿（含规则 §5.3 五性质逐条断言）；② `hunter.test.ts` 11 绿（第 12 条 AI 开枪在 M7）；③ **独立审查**：对 §5.3 五性质逐条反驳后仍成立（T060）。
**FR/套件**: FR-019–037、FR-060/061；`death-chain`、`hunter`、`preset`。
**风险**: 本阶段错误是**静默的**（不崩溃，只与终局解释不一致），必须有 T060 对抗审查兜底。

- [ ] T045 [P] 先写 `tests/death-chain.test.ts`（红）第一批 8 条：遗言权 5 场合（首夜刀/首夜毒/首夜枪/白天放逐/第 2 夜起夜死）+ 双死顺序（先刀后毒）+ 警徽移交与遗言解耦（第 2 夜警长被刀：`last_words`=0 / `badge_passed`=1）
  - 文件：`tests/death-chain.test.ts`（新建）、`tests/helpers/scripted.ts`
  - 依赖：T044
  - 验收：`pnpm vitest run tests/death-chain.test.ts` 失败（红）
  - 规则：§5.3、§12.1 追加 1、FR-020/021；夹具见「必须脚本化构造的夹具」#1/#2

- [ ] T046 实现 `src/engine/chain.ts`：`hasLastWords(window, cause)` + `advanceChain` 骨架（`queue` + `step` 三值 `last-words → badge → shoot` + `ChainResume` 出队时才解析）
  - 文件：`src/engine/chain.ts`（新建）
  - 依赖：T045
  - 验收：`last_words` / `badge_passed` 计数断言转绿；`step` 只前进不后退（单测断言）
  - 规则：§5.3-1/§5.3-2、FR-036；data-model §6.3

- [ ] T047 实现 `last_words` 转移：`lastWords` / `skipLastWords` + `badgeTo` **三态**（`undefined` 沿用预设 / `null` 明确作废 / `Seat` 指定）+ `claims[]` + `last_words`（public）事件 + `viewFor(死者).pending` 例外（FR-024）
  - 文件：`src/engine/transition.ts`、`src/engine/chain.ts`
  - 依赖：T046
  - 验收：`last_words` 事件字段闭包与 contracts/event-stream.md §1.2.1 一致；死者在遗言阶段有 `pending`
  - 规则：§5.3、§12.1 追加 1、FR-022/024

- [ ] T048 先写第二批断言（红）追加 5 条：双死两人都有遗言 / 遗言顺序不可交换 / `wasSheriff` 是**死亡瞬间快照**（同夜双死时不重复移交）/ 遗言显式 `null` 不回落 / `claims[]` 多条按轮次
  - 文件：`tests/death-chain.test.ts`
  - 依赖：T047
  - 验收：`pnpm vitest run tests/death-chain.test.ts` 失败（红）
  - 规则：§5.3-3、§12.1-P、FR-021/028

- [ ] T049 实现 `badge_transfer` 转移 + `resolveBadgeTarget`（**遗言有效指定 > 生前预设（目标须存活）> 流失**）+ `badge_passed{from,to,reason}`（public）
  - 文件：`src/engine/chain.ts`、`src/engine/events.ts`
  - 依赖：T048
  - 验收：T048 断言转绿；「预设目标先死 → `{to:null, reason:'invalid'}`」绿；`to≠null` 时置 `presetWindow`（D78，真人接任才置）
  - 规则：§5.4、§12.1-G/M、FR-027/028/030/031

- [ ] T050 实现 `setBadgePreset` 校验：`actor` 为在位存活警长 ∧ 目标存活 ∧ ≠自己（`null` 合法）+ **D79 回合闸门**（`presetWindow` ∨ `pending===null` ∨ `pending.actor===actor`）+ **零事件、零流程推进**
  - 文件：`src/engine/engine.ts`、`src/engine/transition.ts`
  - 依赖：T049
  - 验收：非警长 / 他人回合提交 → `NOT_YOUR_TURN`；`eventLog` 长度不变（零事件）；`phase` 与 `pending` 不变
  - 规则：§5.4、§5.7-10、§12.1 追加 4、FR-025/026

- [ ] T051 [P] 先写 `tests/preset.test.ts`（红）10 条：仅本人可见 / 无事件 / 目标先死流失 / 遗言覆盖预设 / 遗言 `null` 不回落 / 接任者初始「未指定」 / D78 窗口置位与关闭 / D79 五条放行与拒绝 / AI 求值确定性（留 M7 细化）/ 预设不入导出
  - 文件：`tests/preset.test.ts`（新建）
  - 依赖：T050
  - 验收：`pnpm vitest run tests/preset.test.ts` 失败（红）
  - 规则：§5.4、FR-025–030、V20

- [ ] T052 实现预设可见性与窗口：`view.myBadgePreset`（仅警长本人；他人视图**无该键**）+ `presetWindow` 生命周期（`badge_passed{to≠null}` 置位、任何其它 dispatch 清除）
  - 文件：`src/engine/view.ts`、`src/engine/engine.ts`
  - 依赖：T051
  - 验收：`tests/preset.test.ts` 9 绿（AI 求值 1 条留 T093）；导出记录中**不含任何预设字段**
  - 规则：§5.4、FR-026/090、D78

- [ ] T053 [P] 先写 `tests/hunter.test.ts`（红）11 条规则断言：被刀可开 / 被放逐可开 / 被毒不可 / 同目标记毒不可开 / 弃枪合法不判胜 / 枪杀即时判胜 / 无合法目标弃枪 / 枪杀新警长再移交 / 枪杀不产生遗言（非首夜）/ 首夜被枪者有遗言 / 三段顺序
  - 文件：`tests/hunter.test.ts`（新建）
  - 依赖：T052
  - 验收：`pnpm vitest run tests/hunter.test.ts` 失败（红）
  - 规则：§3.2、§5.3-2、FR-033–037；第 12 条「AI 开枪」在 T088 追加

- [ ] T054 实现 `hunter_shoot` 转移：`hunterShoot` / `hunterPass` + 开枪条件（`role==='hunter'` ∧ `cause ∈ {night-kill, exile}`）+ 弃枪不判胜
  - 文件：`src/engine/transition.ts`、`src/engine/chain.ts`
  - 依赖：T053
  - 验收：被毒/同目标毒的猎人**不进入** `shoot` 段（断言）；弃枪后出队
  - 规则：§3.2-2/§3.2-4、FR-033/034/035

- [ ] T055 实现 `wasSheriff` 死亡瞬间快照 + 枪杀新警长二次移交（新建 `DeathRecord` 时计算 `wasSheriff = (sheriff.seat === target)`，继承 `window` 与 `resume`）
  - 文件：`src/engine/chain.ts`、`src/engine/settle.ts`
  - 依赖：T054
  - 验收：枪杀新接任警长 → 恰一次 `badge_passed`；无预设 → 流失（`{to:null,reason:'invalid'}`）
  - 规则：§5.3-3、§12.1-M、FR-037

- [ ] T056 实现 `onHunterShoot` 独立结算点：记录死亡（`cause:'hunter-shot'`）→ 判胜 → 未胜则 `queue.unshift`（深度优先）+ `hunter_shot`（public）事件
  - 文件：`src/engine/chain.ts`、`src/engine/victory.ts`
  - 依赖：T055
  - 验收：`player_died` 先于后续 `last_words`；`hunter_shot` 载荷 `{seat, target: Seat|null}`
  - 规则：§3.2-3、§5.3-5、FR-035

- [ ] T057 先写第三批断言（红）追加 5 条：首夜枪伤链完整事件序（data-model §6.5 t0–t9）/ 猎人兼警长被放逐三段序 `last_words < badge_passed < hunter_shot` / 队列 FIFO + `unshift` / 链结束 `resolveResume` 去向 / 判胜优先时链不启动
  - 文件：`tests/death-chain.test.ts`、`tests/helpers/scripted.ts`
  - 依赖：T056
  - 验收：`pnpm vitest run tests/death-chain.test.ts` 失败（红）
  - 规则：§5.3 五性质、§5.6、V17/V18；夹具 #3

- [ ] T058 实现 `resolveResume`（`first-night` → `sheriff_signup`；`day-after` → 看警长存活与否 → `day_order` / `day_speak`；`next-night` → `night_wolf(round+1)`）+ 链结束接线
  - 文件：`src/engine/chain.ts`、`src/engine/phases.ts`
  - 依赖：T057
  - 验收：`tests/death-chain.test.ts` **18 绿**；出队时才解析去向（不是入队时）
  - 规则：§5.3、§5.6

- [ ] T059 枪杀判胜收口：`onHunterShoot` 命中后调用 `checkVictory`（与 `enterSettlement` 同口径）+ I5/I6/I12 不变式断言
  - 文件：`tests/hunter.test.ts`、`tests/death-chain.test.ts`
  - 依赖：T058
  - 验收：`pnpm vitest run tests/hunter.test.ts tests/death-chain.test.ts tests/preset.test.ts` 绿（11+18+9）；`checkVictory` 调用点仍仅 2 处（`enterSettlement` + `onHunterShoot`），且都只在「全部死亡记录完后」
  - 规则：§6、FR-060、data-model §8

- [ ] T060 **独立对抗审查（M5，`deepseek-v4-flash`）**：对规则 §5.3 五性质逐条**唱反调**——① 遗言与移交解耦；② 遗言→移交→开枪顺序；③ 一次死亡最多一次移交；④ 判胜优先；⑤ 双死一次判胜 + 枪杀深度优先。并专查三个陷阱：先死先赢 / 继承警徽的人又传一次 / 枪杀吞掉后续
  - 文件：`specs/002-nine-player-board/checklists/m5-对抗审查.md`（新建）
  - 依赖：T059
  - 验收：审查报告逐条给出「反驳 → 证据（用例名 + 事件序）→ 结论」；任一性质反驳成立 → 回修实现并重跑 `death-chain` 18 条；**审查不通过不进 M6**
  - 规则：§5.3、S1 阶段纪律（高风险变更即时独立审查）

---

## 阶段 6：M6 竞选 + 1.5 票 ⚠️审查点（T061–T078）

**目标**: 报名 / 发言 + 退水 / 警下投票 / PK 发言与再投 / 六种无警长 / `day_order` / 放逐计票接 1.5 票。
**独立验收**: ① `sheriff.test.ts` 26 绿；② `voting.test.ts` 8 绿；③ 规则 §5.5 五用例在**真实票箱**上复现（非单测构造）；④ 独立审查 V11/V12/V15/V28（T078）。
**FR/套件**: FR-032、FR-038–057；`sheriff`、`voting`、`tally`。
**口径**: 退水者**仍投票**（FR-045，规则 §10-V11 表述待同步为「警下 = 未上警者 + 已退水者」）。

- [ ] T061 [P] 先写 `tests/sheriff.test.ts`（红）第一批 10 条：报名 0 / 1 / ≥2（3）+ 全员上警无人退水 / 全部退水 / 退水后剩 1 人（3）+ 退水窗口与不可撤销 / 退水者保留投票权 / 退水者不被列为候选 / PK 无退水（4）
  - 文件：`tests/sheriff.test.ts`（新建）
  - 依赖：T060
  - 验收：`pnpm vitest run tests/sheriff.test.ts` 失败（红）
  - 规则：§5.1/§5.2-8/9、§12.1-H/I/K、FR-038–044、V28

- [ ] T062 实现 `sheriff_signup` 转移：`round===1 ∧ election.result===null` + `signupOrder` = 存活座位升序快照 + 逐个表态 + `sheriff_signup{seat, join, order}`（public）
  - 文件：`src/engine/transition.ts`、`src/engine/types.ts`
  - 依赖：T061
  - 验收：报名阶段收齐后 `pending===null`；每座位恰一条 `sheriff_signup`；`order` 与座次升序一致
  - 规则：§5.2-8、FR-038/039

- [ ] T063 实现「当选」与「无警长」的唯一写法（data-model §5.3）：`single-candidate` / `elected` / `pk` 三段同段代码；`no-candidate` / `all-withdrawn` / `no-vote` / `tie-exhausted` 四条同段代码；`sheriff_elected{seat, reason}` 一局恰一条
  - 文件：`src/engine/phases.ts`、`src/engine/engine.ts`
  - 依赖：T062
  - 验收：T061 的 0 人 / 1 人 / 全部退水断言转绿；`badgeLost=true` ⇒ `seat===null`（I9）
  - 规则：§5.2-8/9、§12.1-G/H/I、FR-040/041/044/047

- [ ] T064 先写第二批 8 条（红）：警下集合 = 存活 − 有效候选（含已退水者）/ `voters` 冻结 / 退水者仍是投票人 / 首投唯一最高当选 / 首投并列 → `tiedSeats` / 无有效票 → `no-vote` / 竞选票权恒 1 / `vote_result{scope:'sheriff'}`
  - 文件：`tests/sheriff.test.ts`
  - 依赖：T063
  - 验收：`pnpm vitest run tests/sheriff.test.ts` 失败（红）
  - 规则：§5.2-10、FR-045/046/047/053

- [ ] T065 实现 `sheriff_speak` 两步：`speakStep='speech'`（`speak`/`skip`）→ `speakStep='withdraw'`（`withdrawElection`/`confirm`），每位候选人一次、不可撤销
  - 文件：`src/engine/transition.ts`、`src/engine/phases.ts`
  - 依赖：T064
  - 验收：`pending.kind` 在两步间由 `speech` 变 `withdraw`；同一候选人不会出现第二次退水机会
  - 规则：§5.2-9、§5.1 注、FR-042

- [ ] T066 实现 `withdrawElection` 转移 + `sheriff_withdraw{seat, round}`（public）：移出 `candidates`、保留在 `voters`、不再有竞选发言权、不再被投
  - 文件：`src/engine/transition.ts`
  - 依赖：T065
  - 验收：退水后 `candidates.length` 减 1 而 `voters` 不变；全部退水 → `all-withdrawn`；剩 1 → `single-candidate`
  - 规则：§5.2-9、§12.1-K、FR-043、V28

- [ ] T067 [P] 先写第三批 8 条（红）：首投并列 → `sheriff_pk_speak`（PK 名单 = `tiedSeats`）/ PK 唯一最高当选 / PK 再平 → `tie-exhausted` / PK 0 票 → `no-vote` / 同一批警下再投 / 定序（起点 + 方向）/ 无警长升序 / 竞选期 `player_died`=0（I15）
  - 文件：`tests/sheriff.test.ts`、`tests/helpers/scripted.ts`
  - 依赖：T066
  - 验收：`pnpm vitest run tests/sheriff.test.ts` 失败（红）
  - 规则：§5.2-11/12/13、§5.8、FR-046/048/054、V12/V14/V15；夹具 #4

- [ ] T068 实现 `sheriff_vote`：入场冻结 `candidates` / `voters` + 逐个 `castVote`/`abstain` + 票权恒 1 + `resolveMajority` + `vote_cast{weight:1}` + `vote_result{scope:'sheriff'}`
  - 文件：`src/engine/transition.ts`、`src/engine/tally.ts`
  - 依赖：T067
  - 验收：投票人 = 12 条集合，候选人不出现在 `voters`；收齐才计票（I8）
  - 规则：§5.2-10、FR-045/046/053

- [ ] T069 实现 `sheriff_pk_speak` + `sheriff_pk_vote`：PK 候选人按座次发言 → 同一批警下再投 → 唯一最高（`reason:'pk'`）或再平（`tie-exhausted`）
  - 文件：`src/engine/transition.ts`、`src/engine/phases.ts`
  - 依赖：T068
  - 验收：T067 的 PK 4 条转绿；PK 阶段 `withdrawElection` → `WRONG_PHASE`
  - 规则：§5.2-11/12、§12.1-G、FR-043/046

- [ ] T070 实现 `day_order` 转移 + `setSpeechOrder`（存活警长、起点存活可为己、方向 asc/desc、每轮白天一次）+ `day_speech_order{round,start,direction,order}`（public）+ 竞选期无死亡不变式断言（I15）
  - 文件：`src/engine/transition.ts`、`src/engine/events.ts`
  - 依赖：T069
  - 验收：T067 的定序 3 条与 I15 转绿；无警长时 `day_order` 不可达（`WRONG_PHASE`）
  - 规则：§5.2-13、§5.4、FR-048/054、V14/V15

- [ ] T071 实现 `day_speak` 两个入口的 `speech` 初始化（① 由 `day_order` 进入用其 `order`；② 无警长 → 存活座位升序）+ 游标推进 + 跳过死者
  - 文件：`src/engine/transition.ts`
  - 依赖：T070
  - 验收：`sheriff.test.ts` **26 绿**（M6 前半收口）；有警长时发言顺序严格等于 `day_speech_order.order`
  - 规则：§5.2-14、§5.6、FR-055/056/057

- [ ] T072 实现 `day_vote` 票箱初始化：`scope:'exile'` + `voters`/`candidates` = 现存活座位升序（**冻结**）+ `weightHalf(sheriff.seat, voter)` 接入
  - 文件：`src/engine/transition.ts`、`src/engine/tally.ts`
  - 依赖：T071
  - 验收：投票顺序恒座位升序（不受发言顺序影响，FR-057）；警长票权 `weightHalf=3`
  - 规则：§5.2-15、FR-032/057

- [ ] T073 [P] 先写 `tests/voting.test.ts`（红）8 条（重写附录 B #118–125）：可自票并计入 / 收齐才计票 / 唯一最高放逐并翻牌 / 平票 `tie` 无死亡 / 全弃 `all-abstain` / `vote_cast{weight}` / `vote_result{scope:'exile', tallyHalf}` / 行动者不符或投死者报错
  - 文件：`tests/voting.test.ts`
  - 依赖：T072
  - 验收：`pnpm vitest run tests/voting.test.ts` 失败（红）
  - 规则：§5.5、§5.2-15、V10

- [ ] T074 实现放逐计票与结算：`resolveMajority`（半票）→ 唯一最高 → `player_died{cause:'exile'}` → 判胜；`vote_result` 的 `tally` 与 `tallyHalf` 同源派生（`tally = tallyHalf/2`）
  - 文件：`src/engine/transition.ts`、`src/engine/settle.ts`
  - 依赖：T073
  - 验收：`tests/voting.test.ts` **8 绿**；`vote_result` 里 `tally`/`tallyHalf` 自洽断言绿
  - 规则：§5.5、§5.2-15、FR-049/050/052

- [ ] T075 实现 `day_exile` 流转：唯一最高 → 死亡链（`resume={kind:'next-night'}`）；平票 / 全弃 → 直接 `night_wolf(round+1)`
  - 文件：`src/engine/transition.ts`、`src/engine/chain.ts`
  - 依赖：T074
  - 验收：平安日不产 `player_died`、`round` +1；`day_exile` 确认后 `night_started` 产出
  - 规则：§5.2-16、§5.8-18、FR-052

- [ ] T076 先写「§5.5 五用例真实票箱复现」断言（红）追加到 `tests/tally.test.ts`：在 9 人存活 + 警长在位的真实 `day_vote` 票箱上复现 3.5:3 / 2.5:2 / 1.5:3:3 / 全弃 / 1.5:3
  - 文件：`tests/tally.test.ts`
  - 依赖：T075
  - 验收：`pnpm vitest run tests/tally.test.ts` 失败（红）
  - 规则：§5.5、SC-005

- [ ] T077 三处投票收口：竞选首投 / PK 再投 / 放逐**共用** `resolveMajority`（无过半数门槛）+ 守恒律与奇偶律在真实票箱上断言
  - 文件：`src/engine/tally.ts`、`src/engine/transition.ts`
  - 依赖：T076
  - 验收：`tests/tally.test.ts` **10 绿**（+ 真实票箱组）；`grep -rn "过半数\|> totalHalf / 2" src/engine` 无命中
  - 规则：§5.5、FR-051/053、SC-005

- [ ] T078 **独立对抗审查（M6，`deepseek-v4-flash`）**：对 V11（投票人口径与三种边界）/ V12（PK 全路径）/ V15（竞选期无死亡）/ V28（退水五条）逐条唱反调，并专查「退水者仍投票」「冻结副本」「六种无警长原因唯一写法」
  - 文件：`specs/002-nine-player-board/checklists/m6-对抗审查.md`（新建）
  - 依赖：T077
  - 验收：审查报告逐条「反驳 → 证据（用例名）→ 结论」；任一不成立 → 回修并重跑 `sheriff` 26 + `voting` 8 + `tally` 10；**审查不通过不进 M7**
  - 规则：§5.2/§5.5/§10.2/§10.5

**检查点（M6 结束）· 由小明执行**

1. **复跑全部既有用例**：此刻应有 `rng 12 / tally 10 / identity 5 / pending-matrix 8 / phases 16 / witch 14 / isolation 4 / victory 8 / victory-edge 10 / mode 8 / death-chain 18 / hunter 11 / preset 9 / sheriff 26 / voting 8` = **167 用例**，全绿（`preset` 尚余 AI 求值 1 条在 M7）。
2. **`tsc --noEmit`**：0 错误。
3. **硬约束扫描（四查）**：同 M4 检查点四条；额外确认 `setBadgePreset` 零事件（`eventLog` 长度不变）与「预设不入导出」。
4. **M5/M6 完成后触发独立对抗审查（`deepseek-v4-flash`）**：M5 → T060（§5.3 五性质）、M6 → T078（V11/V12/V15/V28）；**两份审查报告都必须通过**，任一不过不进 M7。
5. 批 2 交付物：单局可完整结束且带警长玩法，规则 §5.3/§5.5 全部可断言。

---

## 阶段 7：M7 AI v2（T079–T094）

**目标**: 5 角色 × 10 kind 决策矩阵；模板句；`aiBadgePreset` + `Deps.presetPolicy` 注入；D77 代表解析；**D13 女巫用毒评分**。
**独立验收**: ① `ai.test.ts` 22 绿；② `decision-request.test.ts` 9 绿；③ `preset.test.ts` 的 AI 求值用例（内含四角色口径四段断言）绿；④ `witch.test.ts` 的 D13 三条性质（P1/P2/P4）绿；⑤ 同 seed 两局 AI 决策逐条一致。
**FR/套件**: FR-066–076、FR-094–097；`ai`、`decision-request`、`preset`、`witch`。
**前置**: 无（D13 文档修订已于提交 `dbedc0f` 完成，见文件头「前置已解决」）——T091–T092 直接按规则 §12.1-D 口径实现。

- [ ] T079 [P] 先写 `tests/decision-request.test.ts`（红）9 条（重写附录 B #23–31）：`idle` 无待决策 / `dawn`、`day_exile` → null / `day_vote` → 座位最小未投票者 / `game_over` → null / `night_wolf` 视图 = 代表座位 / `night_seer` actor / `legalTargets` 快照副本 / 两次调用返回同一 `Rng` 且不推进 / 经 rng 多取一数改变整局
  - 文件：`tests/decision-request.test.ts`
  - 依赖：T078
  - 验收：`pnpm vitest run tests/decision-request.test.ts` 失败（红）
  - 规则：§11-5、contracts/engine-api.md §2.1

- [ ] T080 实现 `Engine.decisionRequest()` v2 + `resolveWolfTeamRep`（**存活真人狼座位最小者优先**，D77）：10 种 kind 的 `DecisionRequest{view, legalTargets, rng}`
  - 文件：`src/engine/engine.ts`
  - 依赖：T079
  - 验收：`tests/decision-request.test.ts` **9 绿**；一个真人狼出局后代表自动切换（真人优先 → 无真人狼才取最小 AI 狼）
  - 规则：§11-5、D77；contracts/engine-api.md §2.2

- [ ] T081 [P] 先写 `tests/ai.test.ts`（红）第一批 7 条：五角色 × 非法 kind 矩阵抛错（5）/ 50 格（5 角色 × 10 kind）同输入两次全等（2）
  - 文件：`tests/ai.test.ts`
  - 依赖：T080
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
  - 规则：§7.6、FR-066/067

- [ ] T082 实现 `src/ai/decider.ts` 骨架：`deciderFor(role)` 5 角色 × 10 kind 分派，「—」格收到即抛错 + `ai/` import 白名单（只 `type` 引 engine 类型 + ai 内部）
  - 文件：`src/ai/decider.ts`
  - 依赖：T081
  - 验收：T081 的 7 条转绿；`grep -rn "from '.*engine/\(transition\|settle\|chain\|engine\)'" src/ai` 无命中
  - 规则：§7.1–7.5、FR-066；contracts/engine-api.md §6

- [ ] T083 先写狼人策略断言（红）7 条（重写附录 B #1–7）：只刀存活好人（不含队友/自己/死者）/ `legalTargets` 混入队友仍不刀 / 只投存活好人 / 未被查杀 → 伪装村民模板且不带 claim / 他人被查杀 → 仍伪装 / 被查杀 → 点名反驳（取最近一次）/ 后续轮次历史查杀仍反驳
  - 文件：`tests/ai.test.ts`
  - 依赖：T082
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
  - 规则：§7.1、§7.5、FR-069/073

- [ ] T084 实现狼人策略（`wolf-kill` / `vote` / `speech` / `last-words`）+ 模板句接线（`src/ai/speech-templates.ts` 追加）
  - 文件：`src/ai/decider.ts`、`src/ai/speech-templates.ts`
  - 依赖：T083
  - 验收：狼 7 条转绿；狼遗言**不产 claim**（§7.5）
  - 规则：§7.1/§7.5、FR-069/073/096

- [ ] T085 先写预言家策略断言（红）4 条（重写附录 B #8–14 的断言面）：排除已验/自己/死者 / 全验过仍给合法目标 / 最新查杀 → claim `werewolf` + 模板含「查杀」/ 最新金水 → claim `good` + 模板含「金水」
  - 文件：`tests/ai.test.ts`
  - 依赖：T084
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
  - 规则：§7.1、FR-069/095

- [ ] T086 实现预言家策略（`seer-check` 随机经 `req.rng` / 首白天起公布最新查验 / 遗言 `claims[]` 公布**全部**查验按轮次）
  - 文件：`src/ai/decider.ts`、`src/ai/speech-templates.ts`
  - 依赖：T085
  - 验收：预言家 4 条转绿；`claims[]` 条数 = 查验史条数（多条形态）
  - 规则：§7.1/§7.5、FR-073、contracts/event-stream.md §1.2.1

- [ ] T087 先写村民 / 女巫 / 猎人策略断言（红）2 条（重写附录 B #15–18 的断言面，加女巫解药与猎人开枪）：村民站边跳出的预言家、无声明走无信息模板 / 女巫解药在则救刀口（含自救）、猎人公开查杀优先否则 `rng.pick`
  - 文件：`tests/ai.test.ts`
  - 依赖：T086
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
  - 规则：§7.1、FR-070/075/094/095

- [ ] T088 实现村民 / 女巫（解药部分）/ 猎人策略 + **AI 开枪断言 1 条追加到 `tests/hunter.test.ts`**（第 12 条）
  - 文件：`src/ai/decider.ts`、`tests/hunter.test.ts`
  - 依赖：T087
  - 验收：`pnpm vitest run tests/ai.test.ts tests/hunter.test.ts` 绿（12 条 hunter 闭合）；女巫 `save` 不耗 rng（rng 位置不变）
  - 规则：§7.1、FR-075/094/097

- [ ] T089 先写竞选策略断言（红）2 条：`sheriff-signup`（最小座位狼上警、预言家必上、女巫/猎人/村民不上）+ `withdraw` 恒 `confirm`；好人/狼警下投票四步；`speech-order` 恒 `{start: 自己, direction:'asc'}`
  - 文件：`tests/ai.test.ts`
  - 依赖：T088
  - 验收：`pnpm vitest run tests/ai.test.ts` 失败（红）
  - 规则：§7.2/§7.4、FR-068/070/071/072/076

- [ ] T090 实现竞选组策略（`sheriff-signup` / `withdraw` / 竞选 `speech`（狼悍跳查杀最小存活好人、预言家公布首夜查验）/ `vote`（好人四步、狼投队友）/ `speech-order`）
  - 文件：`src/ai/decider.ts`、`src/ai/speech-templates.ts`
  - 依赖：T089
  - 验收：竞选 2 条转绿 + `ai.test.ts` **22 绿**；狼悍跳的 claim 指向最小存活好人（裁决口径不变）
  - 规则：§7.2/§7.4、FR-068–072/076

- [ ] T091 [P] 先写 AI 女巫 D13 断言（红）3 条追加到 `tests/witch.test.ts`：**P1** 毒药在 ∧ 女巫存活 ∧ `round≥2` ⇒ 必 `poison` 且目标为存活他人 / **P2** 存在存活公开查杀 ⇒ 目标 = 最近一次查杀（不看评分）/ **P4** 候选全同分 ⇒ 取座位号最小者
  - 文件：`tests/witch.test.ts`
  - 依赖：T090
  - 验收：`pnpm vitest run tests/witch.test.ts` 失败（红，AI 评分未实现）
  - 规则：§12.1-D、FR-094；data-model §12.1

- [ ] T092 实现 `aiWitchAction`（`src/ai/decider.ts`）：解药优先 → 公开查杀优先 → `round≥2` 评分 `3A − 3B + 2C − 5D + 2E`（tie-break 座位升序）→ 不用；**不耗 rng**
  - 文件：`src/ai/decider.ts`
  - 依赖：T091
  - 验收：`tests/witch.test.ts` **17 绿**（14 + 3）；P3（同 view 两次求值相同 + rng 位置不变）与 P5（女巫死/毒已用/round1 无查杀 → 不毒）并入本任务断言
  - 规则：§12.1-D、FR-094/097

- [ ] T093 [P] 先写 AI 预设求值断言（红）1 条（同一用例内含四段口径断言，补齐 `preset.test.ts` 的第 10 条）：狼 → 最小存活狼队友 / 预言家 → 最近金水（否则最小自称预言家，否则最小存活他人）/ 其他好人 → 最小自称预言家（否则最小存活他人）/ 结果为自己或已死者 → 未指定
  - 文件：`tests/preset.test.ts`
  - 依赖：T092
  - 验收：`pnpm vitest run tests/preset.test.ts` 失败（红）
  - 规则：§7.3、FR-074、contracts/engine-api.md §6

- [ ] T094 实现 `src/ai/badge-preset.ts` `aiBadgePreset` + `EngineDeps.presetPolicy` 注入接线（`src/engine/engine.ts`，保持 engine ← ai 依赖方向不倒）
  - 文件：`src/ai/badge-preset.ts`（新建）、`src/engine/engine.ts`
  - 依赖：T093
  - 验收：`tests/preset.test.ts` **10 绿**；同 seed 两局 autoplay 的 AI 决策（上警名单/竞选投票/开枪/预设/遗言文本/定序）逐条一致（M7 收口）
  - 规则：§7.3、FR-067/074；research D5

---

## 阶段 8：M8 事件契约 v2（T095–T104）

**目标**: 19 类事件 + 5 值可见性 + `GameRecord v2` + `replay` + `isolation` 全量收口。
**独立验收**: ① `events.test.ts` 25 绿；② `record-replay.test.ts` 8 绿；③ 导出 19 类全覆盖、`seq` 连续、无时间字段；④ `isolation.test.ts` 12 绿。
**FR/套件**: FR-064、FR-077–080；`events`、`record-replay`、`isolation`。
**并行**: M5 完成后即可与 M6/M7 并行（plan）。

- [ ] T095 [P] 先写 `events.test.ts`（红）第一批 4 条（重写附录 B #32–35）：`GameRecord` = `{schemaVersion:2, feature:'werewolf-v2', config, events}` 字段闭包 / JSON 往返深相等 / 导出是深拷贝 / 纯函数 `exportGame` 与门面一致（idle 导出空事件表）
  - 文件：`tests/events.test.ts`
  - 依赖：T094
  - 验收：`pnpm vitest run tests/events.test.ts` 失败（红）
  - 规则：contracts/event-stream.md §3、FR-080

- [ ] T096 实现 `GameRecord v2` + `exportGame()`（`src/engine/events.ts`）+ **序列化自锁**：`JSON.parse(JSON.stringify(exportGame()))` 深相等、递归扫描键名无 `time`/`timestamp`/`date`/`clock`、数字量级不含 epoch 毫秒
  - 文件：`src/engine/events.ts`
  - 依赖：T095
  - 验收：`events.test.ts` 4 条转绿；导出含隐藏事实（`roles_dealt` / `wolf_kill_decided` / `witch_action` / `seer_check_completed`），且**不含任何预设字段**
  - 规则：§9、FR-078/080

- [ ] T097 先写第二批 12 条（红）（重写附录 B #38–50）：19 类 `type` 全覆盖 / 每类载荷字段白名单（多字段即失败）/ 可见性标注一致 / `seq` = 1..N 严格 +1 / `round` 非递减 / `game_started` 开头与 `victory`→`game_over` 收尾 / `vote_result` 三 scope / `player_died` 4 种 cause + `window` / `speech` 三 stage / `last_words.claims[]` / 终表 9 项 + `badgeFlow` / 无时间字段
  - 文件：`tests/events.test.ts`
  - 依赖：T096
  - 验收：`pnpm vitest run tests/events.test.ts` 失败（红）
  - 规则：§9、contracts/event-stream.md §1/§6

- [ ] T098 收口 `src/engine/events.ts` 为 19 类事件 + 构造器（载荷白名单、无函数/Date/Map/Set），移除 v1 残留（11 类/`schemaVersion:1`/6 人终表）
  - 文件：`src/engine/events.ts`
  - 依赖：T097
  - 验收：`events.test.ts` 第二批 12 条转绿；`grep -n "schemaVersion: 1" src/engine/events.ts` 无命中
  - 规则：§9、FR-077/079

- [ ] T099 先写第三批 9 条（红）（重写附录 B #52–56 的重建口径）：发言三 stage 分别重建 / 半票重算 `tallyHalf == Σ weightHalf` / 死亡 4 cause + 双死顺序 + 枪杀链 / 每轮恰一条 `night_started` + 当夜必有狼刀 / `claim` 只出自真预言家或悍跳狼的公开主张 / 终局 3 reason + 终表存活一致 / 每轮一条 `night_started` / `speech` 未跳过必有文本 / `badge_passed` 数与死亡数关系（I12）
  - 文件：`tests/events.test.ts`
  - 依赖：T098
  - 验收：`pnpm vitest run tests/events.test.ts` 失败（红）
  - 规则：§9、SC-012

- [ ] T100 实现事件载荷派生与 5 值可见性过滤（`public` / `wolf-team` / `seer-private` / `witch-private` / `end`）：`eventsFor(seat)` 是**纯过滤**（不改写、不聚合、不排序）
  - 文件：`src/engine/events.ts`、`src/engine/view.ts`
  - 依赖：T099
  - 验收：`events.test.ts` **25 绿**；`witch-private` 永不对他人公开（含终局）；死者投影与生前一致
  - 规则：§9.1、FR-078/079；contracts/event-stream.md §2

- [ ] T101 [P] 先写 `tests/record-replay.test.ts`（红）8 条：`replay` 重建「发言顺序 / 投票结果 / 死亡顺序 / 终局原因」四问 / 与 engine 逐局交叉校验 / 10 局抽检一致 / 轮次数正确 / 警徽流转史 / `finalTable` / `winner` / 空记录
  - 文件：`tests/record-replay.test.ts`（新建）
  - 依赖：T100
  - 验收：`pnpm vitest run tests/record-replay.test.ts` 失败（红）
  - 规则：§9、FR-080、SC-012

- [ ] T102 实现 `replay(record) → ReplayTimeline`（`src/engine/events.ts` 纯函数：按事件折叠成时间线，不还原引擎状态）
  - 文件：`src/engine/events.ts`
  - 依赖：T101
  - 验收：`tests/record-replay.test.ts` **8 绿**；`replay` 只读 record，不 import 引擎实现的状态机
  - 规则：contracts/event-stream.md §4、FR-080

- [ ] T103 [P] 先写 `tests/isolation.test.ts` 余下 8 条（红）（重写附录 B #62–73 的 8 条）：五角色 × 9 座位整局快照 / 键集合闭包（多一个键即失败）/ 狼 `teammates`（含自己）/ 预言家 `seerChecks` 按本人过滤 / 他人视图无 `myBadgePreset` / `DecisionRequest` 深检无他人 `role`/`potions`/`preset` / `eventsFor` 5 值过滤 / 死者观战投影与生前一致
  - 文件：`tests/isolation.test.ts`
  - 依赖：T102
  - 验收：`pnpm vitest run tests/isolation.test.ts` 失败（红）
  - 规则：§9.1、FR-005/064、contracts/visibility.md §3–§7

- [ ] T104 收口 `src/engine/view.ts`：`VisibleView` 键集合闭包（无阵营/边聚合字段）+ 死者 `pending` 例外 + `you`/`teammates`/`seerChecks`/`myBadgePreset` 条件字段 + 与 `eventsFor` 同源
  - 文件：`src/engine/view.ts`
  - 依赖：T103
  - 验收：`tests/isolation.test.ts` **12 绿**；`grep -n "wolfCount\|godCount\|villagerCount\|edgeCount" src/engine/view.ts` 无命中
  - 规则：§9.1、FR-005/064/065

---

## 阶段 9：M9 UI v2（T105–T124）

**目标**: 竖屏单列三区 + 设置页 + 遮挡页 + 10 个屏幕/面板 + `decideCover` + 观战 + 终局导出 + 预设控件。
**独立验收**: ① `hotseat.test.ts` 10 绿；② quickstart §1.2 十项走查在 375×812 全过（`document.documentElement.scrollWidth === 375`）；③ quickstart §2 的 A–E 五个 hot-seat 场景人工通过。
**FR/套件**: FR-005、FR-063–065、FR-081–093；`hotseat` + 人工走查。
**口径**: 投影座位恒 = `lastHumanActor`（不是当前行动者）；遮挡页触发 10 处 + D78 一处显式例外。

- [ ] T105 [P] 先写 `tests/hotseat.test.ts`（红）10 条：`decideCover` 6 步逐条 / 触发点逐阶段表 / 同一人不重复弹 / 移交不弹（除 D78 预设窗口）/ AI 不弹 / 单人全程 0 次 / D77 代表切换弹给新代表 / 系统阶段不弹 / `presetWindow` 优先于 switch / 确认后投影座位更新
  - 文件：`tests/hotseat.test.ts`（新建）
  - 依赖：T104
  - 验收：`pnpm vitest run tests/hotseat.test.ts` 失败（红）
  - 规则：§8-3、FR-083/084、V23

- [ ] T106 实现 `src/ui/hotseat.ts` `decideCover(input): CoverDecision`（**纯 TS，无 React/DOM**，6 步判定顺序不可调换）
  - 文件：`src/ui/hotseat.ts`（新建）
  - 依赖：T105
  - 验收：`tests/hotseat.test.ts` **10 绿**；`grep -n "react\|document\|window" src/ui/hotseat.ts` 无命中
  - 规则：§8-3、contracts/hotseat-ui.md §4

- [ ] T107 改造 `src/ui/App.tsx`：屏幕路由 `setup / cover / play / spectate / over` + 竖屏三区布局骨架（内容外移）
  - 文件：`src/ui/App.tsx`
  - 依赖：T106
  - 验收：`tsc --noEmit` 0 错误；五个屏幕状态可达（`pnpm dev` 手动切换）
  - 规则：§8、FR-081

- [ ] T108 [P] 实现 `src/ui/SetupScreen.tsx`：随机种子（可空）+ 明 / 暗牌 + 真人座位 1–9（至少 1）+ 开始；种子留空由 UI 生成并回填可见（engine 禁 `Math.random`/`Date`）
  - 文件：`src/ui/SetupScreen.tsx`（新建）
  - 依赖：T107
  - 验收：四项齐备；空 seed 开局后可见生成的 seed；`humans` 至少 1 个（FR-003/004/092）
  - 规则：§8、FR-003/004/092

- [ ] T109 [P] 实现 `src/ui/CoverScreen.tsx`：「请 N 号玩家操作」+ 确认按钮 + 确认后才切日志投影
  - 文件：`src/ui/CoverScreen.tsx`（新建）
  - 依赖：T107
  - 验收：确认回调前 `eventsFor` 仍是旧座位；确认后切到新座位（FR-083 后半句）
  - 规则：§8-3、FR-083

- [ ] T110 [P] 实现 `src/ui/StatusBar.tsx`：`第 N 轮 · 阶段中文名 · 警长：N 号 / 无警长 · 你：N 号（身份）· 票权：1.5 / 1`
  - 文件：`src/ui/StatusBar.tsx`（新建）
  - 依赖：T107
  - 验收：无警长时显示「无警长」；暗牌局**不显示**任何阵营/边计数（FR-064/089）
  - 规则：§8、FR-064/089

- [ ] T111 [P] 实现 `src/ui/SeatBoard.tsx`：9 张座位卡（存活/出局、明牌死者身份、警徽标记 + 「1.5 票」、狼队友标记、「你」标记），2 列网格
  - 文件：`src/ui/SeatBoard.tsx`（新建）
  - 依赖：T107
  - 验收：9 张全可见；警徽 / 1.5 票只出现在警长卡上（FR-089）；不含 `<table>`（竖屏溢出源）
  - 规则：§8、FR-005/089

- [ ] T112 重写 `src/ui/styles.css`：竖屏单列三区（状态条 / 座位卡区 / 日志 flex:1 自滚 / 底部固定面板）+ `@media (min-width: 900px)` 两栏 + 命中区 ≥ 40×40px + 移除 `player-table`/固定宽度/`nowrap`
  - 文件：`src/ui/styles.css`
  - 依赖：T108、T109、T110、T111
  - 验收：375×812 下 `document.documentElement.scrollWidth === 375`；`grep -n "player-table\|white-space: nowrap" src/ui/styles.css` 无命中
  - 规则：§8、FR-081、SC-010

- [ ] T113 [P] 改造 `src/ui/GameLog.tsx`：19 类事件渲染（发言三 stage、0.5 步进计票、遗言、警徽移交、开枪、竞选公告），只消费 `eventsFor(投影座位)`
  - 文件：`src/ui/GameLog.tsx`
  - 依赖：T107
  - 验收：源码不引用 `engine.eventLog`；`vote_result` 用 `displayHalf` 展示 `3.5`/`2.5`（FR-089）
  - 规则：§8、§9、FR-089

- [ ] T114 [P] 重写 `src/ui/InputPanel.tsx` 第一批（夜间 3 面板）：`wolf-kill`（只列 `legalTargets` + 队友只读标记）/ `witch-action`（刀口 + 药况 + 三选一）/ `seer-check`（不含自己 + 上次查验回显）
  - 文件：`src/ui/InputPanel.tsx`
  - 依赖：T107
  - 验收：非法目标不出现在选项里；女巫面板显示「本夜刀口：N 号」（FR-010/082）
  - 规则：§8、FR-009/010/016/082

- [ ] T115 重写 `InputPanel.tsx` 第二批（竞选 4 面板）：`sheriff-signup`（上警/不上警 + 名单与人数 + 第 k/m 位）/ `withdraw`（二选一 + 不可撤销提示）/ 竞选 `speech`（文本框 + 跳过 + claim 快捷）/ 竞选 `vote`（只列候选人 + 弃票 + 警上 N / 警下 M + 本人票权 1）
  - 文件：`src/ui/InputPanel.tsx`
  - 依赖：T114
  - 验收：面板要素逐项对照 FR-085；PK 提示与 `tie-exhausted` 公告（FR-086）
  - 规则：§8-5、FR-085/086

- [ ] T116 重写 `InputPanel.tsx` 第三批（定序 + 白天）：`speech-order`（起点 + 方向 + **实时预览完整顺序**，无警长不渲染）/ 白天 `speech` / 放逐 `vote`（9 宫格含自己 + 弃票 + 票权 1.5/1）
  - 文件：`src/ui/InputPanel.tsx`
  - 依赖：T115
  - 验收：预览顺序与 dispatch 后 `day_speech_order.order` 一致；无警长时该面板不出现（FR-087/089）
  - 规则：§8、FR-087/089

- [ ] T117 重写 `InputPanel.tsx` 第四批（死亡后续 + 预设）：`last-words`（文本框 + 跳过 + 警长时警徽处置三选一，**默认沿用生前预设** + 「遗言后才开枪」提示）/ `hunter-shoot`（存活者 + 弃枪）/ `preset-window`（遮挡页内 9 宫格 + 暂不设置）
  - 文件：`src/ui/InputPanel.tsx`
  - 依赖：T116
  - 验收：警徽处置默认值 = 沿用预设；预设控件只对警长本人显示（非警长连提示都没有）；目标已出局给红字警示（FR-088/090）
  - 规则：§5.4、§8、FR-088/090

- [ ] T118 改造 `src/ui/useGame.ts`：驱动循环四分支 + 多真人会话 + **投影座位 = `lastHumanActor`** + 观战 + 死者操作权 + StrictMode 防重指纹保留
  - 文件：`src/ui/useGame.ts`
  - 依赖：T117
  - 验收：AI 行动不改变投影座位；纯 AI 阶段可读延时 300–800ms（engine 恒同步）；`dawn`/`day_exile`/`badge_transfer` 自动 `confirm`
  - 规则：§8-3、FR-083/091；contracts/hotseat-ui.md §3

- [ ] T119 实现观战与死者操作权：真人出局后收起常规输入面板、日志继续到终局；但 `last_words` / `hunter_shoot` 仍可操作，动作完成后才转观战
  - 文件：`src/ui/useGame.ts`、`src/ui/App.tsx`
  - 依赖：T118
  - 验收：`screen === 'spectate'` 时无常规面板；遗言/开枪阶段面板仍出现；日志不中断（FR-091/SC-011）
  - 规则：§10-V22、FR-024/091

- [ ] T120 实现终局页：胜负阵营 + 判定原因 + 全员 9 行身份表 + 警徽流转记录 + 「导出整局记录」按钮（Blob 下载 `.json`）
  - 文件：`src/ui/App.tsx`（终局屏）
  - 依赖：T119
  - 验收：导出文件含 `schemaVersion:2`/`config`/`events` 且 `seq` 递增；11 行信息可滚动看全（FR-093）
  - 规则：§8、FR-062/093

- [ ] T121 改造 `index.html`：标题与描述对齐 v2（视口 meta 保留 `width=device-width, initial-scale=1`）
  - 文件：`index.html`
  - 依赖：T107
  - 验收：`pnpm build` 成功；视口 meta 存在（375 基准前提）
  - 规则：§8

- [ ] T122 竖屏 375×812 走查（人工，quickstart §1.2 十项）：页面加载无横向滚动 / 状态条 / 9 张座位卡 / 日志自滚 / 面板单列且命中区 ≥40 / 女巫面板 / 竞选面板 / 定序实时预览 / 0.5 步进计票 / 终局页
  - 文件：`specs/002-nine-player-board/quickstart.md` §1.2（对照走查，不改文件）
  - 依赖：T120、T121
  - 验收：`document.documentElement.scrollWidth === 375`；横向滚动 **0 次**、被裁切或不可点控件 **0 个**（SC-010）；十项逐项留证
  - 规则：§8、V01、SC-010

- [ ] T123 hot-seat 五场景人工走查（quickstart §2 A–E）：A 2 真人夜间换手 / B 同一真人连续操作（遗言→开枪）/ C 两名真人同为狼（D77）/ D 接任警长设警徽流走遮挡页（D78）/ E 预设只能在自己回合改（D79）
  - 文件：`specs/002-nine-player-board/quickstart.md` §2 A–E（对照走查，不改文件）
  - 依赖：T122
  - 验收：五场景逐项命中；遮挡页次数与 `decideCover` 预期一致；D77 非代表真人狼只看到「等待狼队决定」
  - 规则：§8-3、§10-V23、SC-009

- [ ] T124 M9 收口：`pnpm build` + `pnpm test` 全绿 + 375 宽截图留证 + 暗牌局走查（quickstart §3：死亡只公布座位、终局全翻）
  - 文件：`src/ui/styles.css`、`dist/`（构建产物与截图）
  - 依赖：T123
  - 验收：`pnpm build` 成功；`pnpm test` 全绿（此刻应有 M1–M8 的全部套件）；暗牌局无身份泄漏
  - 规则：§4、FR-063

---

## 阶段 10：M10 验收走查（T125–T132）

**目标**: 规则 §10 的 V01–V29 逐条勾；导出 10 局抽检；spec 23 条边界复验；保留 20 条零改动核对。
**独立验收**: ① `pnpm test` 全绿（276 用例）；② quickstart §8 表格 29 行全勾；③ `boundary.test.ts` + `termination.test.ts` 绿（**`termination` 的 4 条全部在 T127–T128 一次写全，M2 不写其中任何一条**）。

- [ ] T125 [P] 先写 `tests/boundary.test.ts`（红）10 条：spec 23 条边界里可自动化的部分——首夜 0 死 / 同目标刀+毒 / 预设目标先死 / 枪杀新警长 / 反复平票 / 双屠边优先 / 最后一狼被毒 / 全员上警 / 退水后剩 1 人 / 竞选期无死亡
  - 文件：`tests/boundary.test.ts`（新建）
  - 依赖：T124
  - 验收：`pnpm vitest run tests/boundary.test.ts` 失败（红，缺口未补齐的部分）
  - 规则：§5.8、spec「边界情形」

- [ ] T126 补齐 `boundary.test.ts` 暴露的实现缺口（逐条修实现，不修测试）
  - 文件：`src/engine/`（按 T125 暴露的缺口逐文件定位）
  - 依赖：T125
  - 验收：`tests/boundary.test.ts` **10 绿**；每条缺口在任务记录里写「哪条边界 → 哪个文件 → 怎么修」
  - 规则：§5.8

- [ ] T127 [P] 先写 `tests/termination.test.ts`（红）**全部 4 条**（整局可达性 4 条在此一次写全，M2 不写其中任何一条）：`idle → game_over` 整局可达性（9 人局按 humans 配置抽样身份）/ ≤10 轮终止（**只断言上界，不写死典型轮次**）/ `humans` 1–9 任意配置都能到 `game_over` / 0 卡死（100 局抽跑）
  - 文件：`tests/termination.test.ts`
  - 依赖：T126
  - 验收：`pnpm vitest run tests/termination.test.ts` 失败（红，4 条全红）
  - 规则：SC-002、§6

- [ ] T128 改造 `tests/helpers/autoplay.ts` 为 v2：`autoplay(seed, config?)` + `humans`/`mode` + 狼队代表解析 + 死者阶段（遗言/开枪）也由 decider 代打，使 T127 一次写全的 4 条转绿
  - 文件：`tests/helpers/autoplay.ts`
  - 依赖：T127
  - 验收：`tests/termination.test.ts` **4 绿**（整局可达性 / ≤10 轮上界 / humans 1–9 / 0 卡死）；autoplay 与 `useGame` 驱动循环同构（薄副本，不抽第五模块）
  - 规则：research D5

- [ ] T129 **保留 20 条「原样保留、断言零改动」核对** + 全量复跑：`tests/rng.test.ts` 12 条（T002 已锁）+ `tests/reproducibility.test.ts` 8 条（附录 B #90–97，**只允许改 `createGame(config)`/autoplay 调用行**）+ `pnpm test` + `tsc --noEmit`
  - 文件：`tests/rng.test.ts`、`tests/reproducibility.test.ts`（断言行零改动）
  - 依赖：T128
  - 验收：`git diff` 中这 20 条的**断言行零改动**；`pnpm test` **276 绿**；`tsc --noEmit` **0 错误**；`src/engine`、`src/ai` 的 `Math.random` 扫描 0 命中（保留类 #95/#96 仍通过）
  - 规则：§10-V29

- [ ] T130 四条自锁落成可执行检查并复跑：`Math.random` 零字面 / `engine` 与 `ai` 零 DOM（无 react、无 `window`/`document`/`performance`/`Date`）/ 事件可序列化 / AI 只用投影（`ai/` import 白名单）
  - 文件：`tests/reproducibility.test.ts`、`src/engine/`、`src/ai/`（扫描对象）
  - 依赖：T129
  - 验收：四条扫描各 0 违规；扫描脚本或测试若发现遗漏，补断言（不改实现口径）
  - 规则：硬约束 1–4、A1–A5

- [ ] T131 导出 10 局抽检（SC-012）：不同 seed / 不同 `humans` 配置 / 明暗牌各取若干局，`replay` 重建「发言顺序 / 投票结果 / 死亡顺序 / 终局原因」四问 100% 一致
  - 文件：`tests/helpers/`（抽检脚本）、`specs/002-nine-player-board/checklists/v2-验收走查.md`
  - 依赖：T130
  - 验收：10 份 `GameRecord` + `ReplayTimeline` 比对全部一致；抽检清单（seed、配置、结论）落盘
  - 规则：§9、SC-012

- [ ] T132 规则 §10 V01–V29 逐条勾选留证 + 走查记录落盘 `specs/002-nine-player-board/checklists/v2-验收走查.md` + 交付报告（276 用例实数、与 plan 的偏差、遗留项）
  - 文件：`specs/002-nine-player-board/checklists/v2-验收走查.md`（新建）
  - 依赖：T131
  - 验收：29 行全勾（含 V29 = `pnpm test` 276 绿）；记录含每条的「验证方式 + 证据（命令输出/截图/种子）」；**用真实操作完整玩一局，不编样例**
  - 规则：§10 全部

---

## 依赖与执行顺序

### 里程碑链（与 plan 一致）

```text
M1（T001–T010）→ M2（T011–T024）→ M3（T025–T036）→ M4（T037–T044）
                                    ↘ M6（T061–T078）   ← 与 M4 无依赖，可并行
M4 → M5（T045–T060）→ M6 → M7（T079–T094）→ M8（T095–T104）→ M9（T105–T124）→ M10（T125–T132）
                       ↘ M8 可在 M5 完成后与 M6/M7 并行
```

- 名义主链 **M1 → M2 → M3 → {M4} → M5 → M6 → M7 → M8 → M9 → M10**
- **M4 ∥ M6**：M3 完成后两者互不依赖（M4 只碰 `victory.ts` / 判胜调用点 / 明暗牌投影；M6 只碰竞选状态机与放逐计票）
- **M8 ∥ M6/M7**：M5 完成后 M8 只依赖事件与可见性，不依赖竞选与 AI 语义
- 所有依赖**向后指**，无循环；每个「红」任务只依赖前一个「绿」任务

### 任务内顺序（TDD 纪律）

- 每个「先写测试（红）」任务必须**真实跑红**（贴失败输出）后才开工对应实现任务
- 实现任务以对应断言转绿为完成判据；**测试失败修实现不修测试**
- 三条状态机（身份分配 / 昼夜流转 / 投票）必须以纯函数断言为准，不依赖 UI

### 四批交付物

| 批次 | 交付物 | 判定 |
|---|---|---|
| 批 1（M1–M4） | 引擎可裸驱动：18 阶段骨架 + 夜间三角色 + 屠边判胜 + 明暗牌 | 95 用例绿 + `tsc` 0 + M4 检查点 |
| 批 2（M5–M6） | 单局可完整结束 + 警长玩法（死亡链 / 遗言 / 警徽 / 竞选 / 1.5 票） | 167 用例绿 + 两份对抗审查通过 |
| 批 3（M7–M10） | 全 AI 补位 + 19 类事件导出重放 + 竖屏 hot-seat 可玩 + 29 条验收 | 276 用例绿 + 29 行全勾 |

## 并行说明

### 可并行（不同文件、依赖已闭合）

- **T002**：只校验 `src/rng/` 与 `tests/rng.test.ts`，不碰新代码，可与 M1 其余任务同时开工
- **各里程碑的「新测试文件」任务**（各自独占文件，依赖由前一任务闭合）：
  `T011`（pending-matrix）、`T025`（witch）、`T037`（victory）、`T039`（victory-edge）、`T042`（mode）、
  `T045`（death-chain）、`T051`（preset）、`T053`（hunter）、`T061`（sheriff）、`T073`（voting）、
  `T079`（decision-request）、`T081`（ai）、`T091`（witch 追加）、`T093`（preset 追加）、
  `T095`（events）、`T101`（record-replay）、`T103`（isolation）、`T105`（hotseat）、`T125`（boundary）、`T127`（termination）
- **M9 四个新屏幕文件**：`T108`（SetupScreen）∥ `T109`（CoverScreen）∥ `T110`（StatusBar）∥ `T111`（SeatBoard），
  同依赖 T107、不同文件
- **M9 两个改造文件**：`T113`（GameLog）∥ `T114`（InputPanel 第一批），不同文件
- **里程碑级**：**M4 ∥ M6**（plan 明文无依赖）；**M8 ∥ M6/M7**（M5 完成后）

### 不允许并行（理由）

- **同文件连续任务**一律串行：
  `types.ts`（T003–T005）、`transition.ts`（T014、T026–T029、T054、T062–T075 的白天分支）、
  `engine.ts`（T009、T016、T080）、`events.ts`（T019、T096–T102）、`view.ts`（T036、T043、T104）、
  `settle.ts`（T032、T034、T040）、`chain.ts`（T046–T059）、`decider.ts`（T082–T092）、
  `InputPanel.tsx`（T114–T117）、`styles.css`（T112 独占）
- **「红 → 绿」配对不可拆并行**：红的验收就是「跑红」，绿依赖红的测试文件已存在（如 T006→T007、T011→T012、T105→T106）
- **M5 与 M6 不建议强行并行**：plan 说 M4 与 M6 无依赖，但两者都要改 `transition.ts` 的同一批分派入口与 `settle` 调用点；本清单按 M4 → M5 → M6 串行排号，若强行并行须先拆 `transition.ts` 的夜间/白天分派边界
- **T118（useGame）必须在 T106–T117 之后**：驱动循环要消费 `decideCover` 与全部 `pending.kind` 面板
- **审查任务（T060、T078）不可与对应里程碑的实施任务并行**：审查对象是已完成的实现
- **M10 的 T129–T132 串行**：保留类核对 → 自锁扫描 → 导出抽检 → 29 条勾选，后一步依赖前一步的结论

## 备注与偏差

1. **任务总数 132，与 plan 逐里程碑一致**（10 / 14 / 12 / 8 / 16 / 18 / 16 / 10 / 20 / 8），无增减。
2. **`sheriff.test.ts` 的 26 条全部为规则断言**；plan 新套件表里列的「AI 上警与投票 / AI 永不退水」按 plan 附录 A 的验证列归入 `ai.test.ts`（FR-068/070/071/072），不占 sheriff 的 26 条——**套件总数与用例总数不变**。
3. **`hunter.test.ts` 的 12 条中「AI 开枪」1 条在 M7（T088）追加**；M5 结束时只有 11 条规则断言可绿（M5 验收口径按 11 条，见 T059）。
4. **`witch.test.ts` 的 17 条 = M3 的 14 条 + M7 的 3 条**（D13 的 P1/P2/P4）；P3（确定性 + 不耗 rng）与 P5（边界）并入 T092 的断言，不另立用例。
5. **`isolation.test.ts` 的 12 条拆两处**：M3 T035 的 4 条（女巫私有窗口）+ M8 T103 的 8 条（键集合闭包 / 五角色 × 9 座 / 暗牌 / 无聚合泄漏）。
6. **规则 §10-V11 的表述待同步**（规则文档写「投票人 = 有效候选人之外的存活者」，字面排除退水者；spec FR-045 与 data-model 均按「退水者仍投票」实现）。本清单按 **FR-045** 执行，规则原文修订由 Lisa/小明回改。
7. **D78/D79 的规则表述待同步**（§5.4「相位无关」→ 回合闸门；§8-9「同一屏」→ 遮挡页）。本清单按 plan 与 `contracts/hotseat-ui.md` §5 执行。
8. **M2 的可达性口径收窄（与 plan M2 验收 ③ 的差异）**：plan 写「脚本动作序列能从 `idle` 走到 `game_over`」，
   但 M2 明文「不含结算细节」——空转骨架无法承载真实死亡与终局，硬要求 `game_over` 会让 `termination` 的 4 条反复重写、
   并把同一套件劈成 M2/M10 两处。故本清单改为：**M2 只断单轮骨架**（`idle → night_wolf → night_witch → night_seer → dawn → day_speak`，
   断言 `phase` 与 `pendingDecision`，落 `tests/phases.test.ts` 的 16 条之一）；**整局可达性等 4 条全部在 M10 的 T127–T128 一次写全**。
   套件数与用例总数不变（`termination` 仍 4 条），只调整验收时机。

---

## 附录 A：97 条 FR → 承接任务（逐条，无减项）

| FR | 承接任务 | 验证套件 |
|---|---|---|
| FR-001 | T003、T018 | `identity` |
| FR-002 | T018 | `identity` |
| FR-003 | T009、T018 | `identity`、`pending-matrix` |
| FR-004 | T108 | 人工 quickstart §1.3 |
| FR-005 | T103、T104 | `isolation` |
| FR-006 | T018、T062 | `identity`、`death-chain` |
| FR-007 | T009、T043 | `mode` |
| FR-008 | T028、T029 | `phases`、`pending-matrix` |
| FR-009 | T027 | `phases`、`decision-request` |
| FR-010 | T026、T036 | `witch`、`isolation` |
| FR-011 | T026 | `witch` |
| FR-012 | T026 | `witch` |
| FR-013 | T029 | `phases` |
| FR-014 | T031 | `witch` |
| FR-015 | T031、T032 | `witch`、`death-chain` |
| FR-016 | T028、T036 | `phases`、`isolation` |
| FR-017 | T032、T043 | `events`、`mode` |
| FR-018 | T031、T054 | `witch`、`hunter` |
| FR-019 | T040 | `death-chain`、`victory-edge` |
| FR-020 | T045、T046 | `death-chain` |
| FR-021 | T046、T057 | `death-chain` |
| FR-022 | T047 | `death-chain`、`events` |
| FR-023 | T044、T059 | `victory-edge` |
| FR-024 | T047、T119 | `death-chain`、`hotseat` |
| FR-025 | T050 | `preset` |
| FR-026 | T050、T052 | `preset`、`isolation` |
| FR-027 | T049 | `death-chain`、`preset` |
| FR-028 | T049 | `preset` |
| FR-029 | T063、T071 | `sheriff`、`preset` |
| FR-030 | T049、T052、T117 | `preset`、`hotseat` |
| FR-031 | T049 | `events`、`preset` |
| FR-032 | T072、T074 | `tally`、`sheriff` |
| FR-033 | T053、T054 | `hunter` |
| FR-034 | T054 | `hunter`、`death-chain` |
| FR-035 | T054、T056 | `hunter` |
| FR-036 | T046、T057 | `death-chain` |
| FR-037 | T055、T057 | `death-chain` |
| FR-038 | T062 | `sheriff` |
| FR-039 | T062 | `sheriff`、`events` |
| FR-040 | T063 | `sheriff` |
| FR-041 | T063 | `sheriff` |
| FR-042 | T065 | `sheriff` |
| FR-043 | T066 | `sheriff` |
| FR-044 | T063 | `sheriff` |
| FR-045 | T067、T068 | `sheriff`、`tally` |
| FR-046 | T068、T069 | `sheriff`、`tally` |
| FR-047 | T063、T069 | `sheriff` |
| FR-048 | T070 | `sheriff` |
| FR-049 | T004、T074 | `tally` |
| FR-050 | T004、T073、T074 | `tally`、`voting` |
| FR-051 | T004、T068、T077 | `tally`、`voting` |
| FR-052 | T074、T075 | `voting`、`victory` |
| FR-053 | T004、T068 | `tally`、`sheriff` |
| FR-054 | T070 | `sheriff`、`events` |
| FR-055 | T071 | `phases`、`sheriff` |
| FR-056 | T071 | `phases` |
| FR-057 | T071、T072 | `phases`、`voting` |
| FR-058 | T038 | `victory` |
| FR-059 | T038 | `victory` |
| FR-060 | T040 | `victory-edge` |
| FR-061 | T039、T040 | `victory-edge` |
| FR-062 | T041 | `events`、`preset` |
| FR-063 | T043 | `mode`、`isolation` |
| FR-064 | T103、T104 | `isolation` |
| FR-065 | T043 | `mode`、`death-chain` |
| FR-066 | T082、T103 | `ai`、`isolation` |
| FR-067 | T081、T094 | `reproducibility`、`ai` |
| FR-068 | T090 | `ai` |
| FR-069 | T084、T090 | `ai` |
| FR-070 | T090 | `ai` |
| FR-071 | T090 | `ai` |
| FR-072 | T090 | `ai`、`sheriff` |
| FR-073 | T084、T088 | `ai`、`death-chain` |
| FR-074 | T093、T094 | `preset` |
| FR-075 | T088 | `ai`、`hunter` |
| FR-076 | T090 | `ai`、`sheriff` |
| FR-077 | T098 | `events` |
| FR-078 | T100 | `events`、`preset` |
| FR-079 | T098、T100 | `events` |
| FR-080 | T096、T102 | `events`、`record-replay` |
| FR-081 | T112 | 人工 quickstart §1.2 |
| FR-082 | T114、T115、T116、T117 | 人工 quickstart §1.2 |
| FR-083 | T106、T118 | `hotseat`、`pending-matrix` |
| FR-084 | T106 | `hotseat` |
| FR-085 | T115 | 人工 quickstart §2 / §4 |
| FR-086 | T115、T069 | `sheriff`、人工 §4 |
| FR-087 | T116 | 人工 §1.2、`sheriff` |
| FR-088 | T117 | 人工 §5.1、`death-chain` |
| FR-089 | T110、T111、T116 | 人工 §1.2、`tally` |
| FR-090 | T052、T117 | `preset`、人工 §2.5 |
| FR-091 | T119 | `hotseat`、人工 §6 |
| FR-092 | T108 | 人工 §0 |
| FR-093 | T120 | 人工 §7 |
| FR-094 | T091、T092 | `witch`、`ai` |
| FR-095 | T084、T086 | `ai`、`reproducibility` |
| FR-096 | T084、T086 | `ai` |
| FR-097 | T092、T128 | `ai`、`termination`、`witch` |
