# 契约：Engine 公开 API（v2）

**特性**: 002-nine-player-board | **模块**: `projects/werewolf/src/engine/`
**消费者**: `ui/`（人类输入与渲染）、`ai/`（决策）、`tests/`（裸驱动）、导出/重放工具、将来的联机服务端

本契约定义 engine 对外的**全部**公开面。未列出的成员一律模块私有。
engine 不 import react / DOM / ai / ui（硬约束 1），纯同步、确定性、无全局状态、无 I/O。

> **相对 v1 的破坏性变更**（逐条见 §9）：`createGame` 签名、`Action` 全部带 `actor`、
> 19 类事件、`schemaVersion = 2`、`PendingDecision` 10 种 kind、新增 `Deps.presetPolicy`。

---

## 1. 生命周期与门面

```ts
interface GameConfig {
  seed: string;              // 非空字符串（留空由调用方生成后传入）
  mode: 'open' | 'dark';     // 明牌 / 暗牌
  humans: Seat[];            // 1–9 个、去重、座位合法
}

interface EngineDeps {
  /** AI 警徽预设求值（规则 §7.3）。由调用方注入 ai/ 的实现（research D5）。 */
  presetPolicy?: (seat: Seat, view: VisibleView) => Seat | null;
}

/** 创建一局（phase = 'idle'）。配置非法 → 抛 BadConfigError（不返回半初始化对象）。 */
function createGame(config: GameConfig, deps?: EngineDeps): Engine;

interface Engine {
  /** 只读快照（浅冻结）。UI/测试不得直接改。 */
  readonly state: GameState;

  /** 提交一个动作。合法 → 返回本次产出的事件（可能为空数组）；
      非法 → 状态不变、不产事件，返回 Err<EngineError>（不抛裸异常）。 */
  dispatch(action: Action): GameEvent[] | Err<EngineError>;

  /** 当前等待谁做什么；`idle` / `dawn` / `day_exile` / `badge_transfer` / `game_over` 时为 null。
      这是 UI 决定「渲染哪种面板 / 是否自动推进」的唯一依据。 */
  readonly pendingDecision: PendingDecision | null;

  /** 当前待决策的请求（view / legalTargets / rng）；无待决策时为 null。
      驱动层构造 DecisionRequest 的**唯一**入口（research D3 单流口径，v1 已实现，保留）。 */
  decisionRequest(): DecisionRequest | null;

  /** 某座位的可见信息（人类渲染与 AI 决策共用，contracts/visibility.md）。 */
  viewFor(seat: Seat): VisibleView;

  /** 某座位可见的事件投影流（UI 日志数据源，硬约束 4）。 */
  eventsFor(seat: Seat): GameEvent[];

  /** 完整事件日志（含隐藏事实），复盘/导出用。 */
  readonly eventLog: readonly GameEvent[];

  /** 序列化导出（格式见 contracts/event-stream.md §3）。 */
  exportGame(): GameRecord;
}
```

**三条不变量**（实现与测试共同保证）：

1. `dispatch` 是**唯一**改状态的入口；`state` 冻结，外部无法绕过校验。
2. `dispatch` 失败时 `state`、`eventLog`、`pendingDecision` 三者均不变（可断言）。
3. engine 内不出现 `Math.random` / `Date` / `performance` / `window` / `document`（扫描测试锁定）。

---

## 2. PendingDecision（驱动循环的枢纽）

```ts
type PendingKind =
  | 'wolf-kill' | 'witch-action' | 'seer-check'          // 夜间
  | 'last-words' | 'hunter-shoot'                        // 死亡后续
  | 'sheriff-signup' | 'withdraw' | 'speech' | 'speech-order' | 'vote';  // 白天/竞选

interface PendingDecision {
  kind: PendingKind;
  actor: Seat | 'wolf-team';
  /** 该动作的合法目标；`speech` 为 `[actor]`；`vote` 为可投座位集合（含自己）；
      弃票 / 跳过 / 弃枪由对应动作类型表达，不占 legalTargets。 */
  legalTargets: Seat[];
}
```

| `phase` | `kind` | `actor` | `legalTargets` |
|---|---|---|---|
| `night_wolf` | `wolf-kill` | `'wolf-team'` | 存活且非狼的座位 |
| `night_witch` | `witch-action` | 女巫座位 | 存活座位（`save` 另受「当夜刀口 ∧ 解药在」约束） |
| `night_seer` | `seer-check` | 预言家座位 | 存活且 ≠ 自己的座位 |
| `last_words` | `last-words` | `settle.queue[0].seat`（死者） | `[该座位]` |
| `hunter_shoot` | `hunter-shoot` | 该猎人座位（死者） | 存活且 ≠ 自己的座位 |
| `sheriff_signup` | `sheriff-signup` | `signupOrder[cursor]` | `[该座位]` |
| `sheriff_speak` | `speech`（`speakStep='speech'`）/ `withdraw`（`speakStep='withdraw'`） | 当前候选人 | `[该座位]` |
| `sheriff_vote` | `vote` | `voters[cursor]` | `candidates` |
| `sheriff_pk_speak` | `speech` | `pkSeats[cursor]` | `[该座位]` |
| `sheriff_pk_vote` | `vote` | `voters[cursor]`（同一批） | `pkSeats` |
| `day_order` | `speech-order` | 存活警长 | 存活座位 |
| `day_speak` | `speech` | `speech.order[cursor]` | `[该座位]` |
| `day_vote` | `vote` | 存活座位升序游标 | 全存活座位（含自己） |

**18 = 13 个有 `pending` 的阶段（上表）+ 5 个无 `pending` 的系统阶段**
（`idle` / `dawn` / `badge_transfer` / `day_exile` / `game_over`，由驱动层自动推进或只读）。

`legalTargets` 是**预防**（UI 只列合法目标）；engine 的 `ILLEGAL_TARGET` 是**兜底**。
两者必须同源（同一份校验函数），不允许各算一遍。

### 2.1 `decisionRequest()` 的 `rng` 借出（v1 保留，v2 强化）

- `rng` 是 `createGame` 时的**唯一**随机流；`decisionRequest()` 不推进它、不派生新流。
- 消费顺序 = 状态机动作顺序 ⇒ 同 seed + 同动作序列 ⇒ 同局（SC-003）。
- **v2 新增约束**：`ai/` 的一切随机只能经 `req.rng`；`engine/` 自身**不消费** rng（v1 只在发牌时消费）。

### 2.2 狼队代表解析（D77）

```ts
/** pending.actor === 'wolf-team' 时，实战行动者 = 本函数返回值 */
function resolveWolfTeamRep(state: GameState): Seat | null {
  const aliveWolves = state.players.filter(p => p.alive && p.role === 'werewolf');
  const humanWolves = aliveWolves.filter(p => p.isHuman);
  return (humanWolves[0] ?? aliveWolves[0])?.seat ?? null;   // 已按座位升序
}
```

- `decisionRequest()` 用该座位的 `viewFor` 构造请求。
- 非代表真人狼的 `VisibleView.pending` 不出现；其 `wolfKill` 动作被拒（`NOT_YOUR_TURN`）。
- 狼队**没有**内部表决层，也**没有**「查看队友选择」的字段（D77 第 3 句）。

---

## 3. 错误分类（`EngineError.code`）

```ts
type EngineErrorCode =
  | 'WRONG_PHASE'      // 动作与当前 phase 不匹配
  | 'NOT_YOUR_TURN'    // actor 与 pendingDecision 行动者不符（含非代表的真人狼）
  | 'ILLEGAL_TARGET'   // 目标死亡 / 刀狼队友 / 验自己 / 毒自己 / 投非候选人 / 不存在的座位
  | 'GAME_OVER'        // 终局后提交任何动作
  | 'BAD_CONFIG';      // createGame 配置非法（seed 空 / humans 越界或重复 / mode 非法）
```

**错误返回契约**：`dispatch` 返回 `{ error: { code, message } }`，`message` 为中文人话；
`state` / `eventLog` / `pendingDecision` 三者不变；**不抛异常**（`BAD_CONFIG` 例外，在 `createGame` 抛）。

**新增的两类校验**（v1 没有）：

| 校验 | code | 触发例 |
|---|---|---|
| `actor` 缺失 | `NOT_YOUR_TURN` | 提交 `{type:'speak', text:'…'}` 无 `actor` |
| 预设回合闸门（D79） | `NOT_YOUR_TURN` | 非警长提交 `setBadgePreset`；或警长在他人的 pending 回合提交且 `presetWindow=false` |

---

## 4. 计票 API（`engine/tally.ts`，全项目唯一口径）

```ts
type HalfVote = number;
type WeightHalf = 2 | 3;

function weightHalf(sheriffSeat: Seat | null, voter: Seat): WeightHalf;  // 警长 3 / 其他 2
function tallyHalf(ballots: readonly Ballot[], sheriffSeat: Seat | null): Record<Seat, HalfVote>;
function displayHalf(h: HalfVote): string;                               // '3' | '3.5'
function resolveMajority(tally: Record<Seat, HalfVote>, abstainCount: number): Majority;
```

**契约要求**：

1. 三处投票（竞选 / PK / 放逐）**必须**共用 `resolveMajority`。
2. 返回的 `Majority.max` / `winners` 参与**整数**比较；UI 只能用 `displayHalf` 展示。
3. 事件里的 `vote_cast.weight: 1 | 1.5` 是**展示值**，计票不得回读它（防双账，见 data-model §7）。
4. `resolveMajority` 的判定顺序：`max === 0` → `winners = []`；否则取到 `max` 的座位升序集合。

---

## 5. rng 契约（`src/rng/`，**v1 原样保留**）

```ts
interface Rng {
  next(): number;                              // [0, 1)
  int(minIncl: number, maxExcl: number): number;
  pick<T>(items: readonly T[]): T;             // 空数组抛错
  shuffle<T>(items: readonly T[]): T[];        // Fisher–Yates，返回新数组
}
function createRng(seed: string): Rng;         // mulberry32 + FNV-1a（research D1/D2）
```

**不许改动的理由**：改算法 = 单方面改「同 seed 同局」的对外承诺（SC-003 / SC-012 的可比性），
且 v1 的 12 个 rng 用例已把输出序列逐个锁定。v2 只是多消费几处（发牌仍一次洗牌）。
`engine/` 与 `ai/` 内出现 `Math.random` 即测试失败（自锁扫描，v2 扫描范围自动覆盖新增文件）。

---

## 6. ai 契约（`src/ai/`）

```ts
/** 按角色返回决策器；纯函数，随机性仅经 req.rng */
function deciderFor(role: Role): Decider;
type Decider = (req: DecisionRequest) => Action;

/** 规则 §7.3 的 AI 警徽预设求值（纯函数，确定性，不耗 rng） */
function aiBadgePreset(seat: Seat, view: VisibleView): Seat | null;
```

**依赖方向**：`ai/` 可以 `import type` engine 的类型与 `Rng` 接口；**不得** import
`engine/transition`、`engine/settle`、`engine/chain`、`engine/engine` 等实现模块，
**不得**读 `eventLog`，**不得**自建 rng。

**engine → ai 的唯一反向依赖**由 `EngineDeps.presetPolicy` 注入（research D5）：
engine 只持有函数签名，实现由调用方提供。

### 6.1 决策矩阵（10 kind × 5 role = AI 必须覆盖的 50 个格）

| role \ kind | wolf-kill | witch-action | seer-check | last-words | hunter-shoot | sheriff-signup | withdraw | speech | speech-order | vote |
|---|---|---|---|---|---|---|---|---|---|---|
| werewolf | ✔ 规则 §7.1 | — | — | ✔ §7.5 | — | ✔ §7.2 | 恒不退水 | ✔ §7.2 | ✔ §7.4（若为警长） | ✔ §7.1/7.2 |
| seer | — | — | ✔ §7.1 | ✔ §7.5 | — | ✔ 必上警 | 恒不退水 | ✔ §7.2 | ✔ §7.4 | ✔ §7.1 |
| witch | — | ✔ §7.1 + **D13**（查杀优先 → round≥2 评分用毒；解药优先；不耗 rng） | — | ✔ §7.5 | — | ✘ 不上警 | 恒不退水 | ✔ §7.1 | ✔ §7.4 | ✔ §7.2 |
| hunter | — | — | — | ✔ §7.5（含开枪意图） | ✔ §7.1 | ✘ 不上警 | 恒不退水 | ✔ §7.1 | ✔ §7.4 | ✔ §7.2 |
| villager | — | — | — | ✔ §7.5 | — | ✘ 不上警 | 恒不退水 | ✔ §7.1 | ✔ §7.4 | ✔ §7.1 |

「—」= 该角色不会收到该 kind（收到即抛错，让驱动层 bug 立刻暴露，沿用 v1 口径）。
`speech-order` 只对存活警长下发（AI 警长 → `{start: 自己, direction:'asc'}`）。
`last-words` 的 AI 恒不跳过（FR-073），且**不额外指定接班人**（省略 `badgeTo`，走预设）。

---

## 7. 驱动循环契约（UI 与测试共用的四分支）

```text
while true:
  if engine.state.phase === 'game_over' → 渲染终局，break
  p = engine.pendingDecision
  if p === null:                      # dawn / day_exile / badge_transfer
        渲染「确认」/ 自动 confirm（UI 留可读延时；测试立即 confirm）
        continue
  actor = p.actor === 'wolf-team' ? resolveWolfTeamRep(engine.state) : p.actor
  if engine.state.players[actor].isHuman:
        渲染遮挡页（如需）+ 输入面板，等 dispatch
  else:
        req = engine.decisionRequest()          # rng 随请求借出（唯一入口）
        dispatch(deciderFor(req.view.you.role)(req))
```

**契约要求**：

1. 驱动层**只**用 `pendingDecision` 判断「该谁行动」，不得自己数存活者或推阶段。
2. AI 通路**只**用 `decisionRequest()` 取 rng；驱动层不得持有 rng 或自建随机。
3. 「可读延时」只在 UI（`setTimeout`）；engine 恒同步，测试无延时。
4. 遮挡页决策是**纯函数**（`ui/hotseat.ts`），驱动循环只消费其返回值
   （见 [contracts/hotseat-ui.md](hotseat-ui.md) §4）。

---

## 8. 服务端可用性检查清单（联机预留，规则 §11）

| 要求 | 本契约如何满足 | 可验证方式 |
|---|---|---|
| engine 能跑在 Node 服务端 | 零 DOM/React import；零 I/O；零全局；纯 JSON 进出 | `node --input-type=module -e "import('./src/engine/engine.ts')"`（构建后）或 Vitest 在 node 环境裸跑全部 engine 用例 |
| 服务端权威 | 票权、警徽归属、预设、暗牌身份只由 engine 计算；UI/AI 无第二实现 | `tally.ts` 是唯一计票实现（契约 §4） |
| 协议可序列化 | `Action` 与 `GameEvent` 全为纯 JSON；无函数、无 Date、无 Map/Set | 序列化回路测试（`JSON.parse(JSON.stringify(x))` 深相等） |
| 按 `actor` 鉴权 | 所有玩家动作必带 `actor`，engine 逐个校验 | 每个 kind 一条 `NOT_YOUR_TURN` 用例 |
| 客户端只拿投影 | 客户端只需要 `viewFor(seat)` + `eventsFor(seat)` | 联机时把这两个函数搬到服务端即可，无需改规则 |

**不需要改动的部分**：engine 已经是「同步、无 await、无订阅」的形态，
将来套一层 `{action, seq} → {events, seq}` 的 WS 协议即可，规则口径不变。

---

## 9. 与 v1 的差异表（迁移对照）

| 项 | v1 | v2 | 兼容性 |
|---|---|---|---|
| `createGame` | `createGame(seed)` | `createGame(config, deps?)` | **破坏** |
| 座位 | `Seat = 1..6` | `Seat = 1..9` | **破坏** |
| 角色 | 3 种 | 5 种 | **破坏** |
| 阶段 | 8 | 18 | **破坏** |
| 动作 | 9 个成员，`actor` 可选 | 17 个成员，`actor` 必填 | **破坏** |
| `PendingDecision.kind` | 4 | 10 | **破坏** |
| 事件 | 11 个具体 type | 19 个具体 type | **破坏** |
| `schemaVersion` | 1 | 2 | **破坏** |
| `decisionRequest()` | 有（单流借出） | 保留，代表解析加「真人优先」（D77） | 语义兼容 |
| `viewFor` / `eventsFor` | 有 | 保留结构，扩字段（visibility 4→5 值） | 语义兼容 |
| `exportGame()` | `{schemaVersion, feature, seed, events}` | `{schemaVersion, feature, config, events}` | **破坏** |
| `Engine.pendingDecision` | 有 | 保留 | 兼容 |
| rng 模块 | mulberry32 + FNV-1a | **原样不动** | 兼容 |
