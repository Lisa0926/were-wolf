# 数据模型：狼人杀 v2 · 9 人局扩展

**特性**: 002-nine-player-board | **日期**: 2026-10-18
**规则唯一事实来源**: `docs/游戏规则.md`（v2，2026-10-18 生效）。本文件与其冲突时以其为准。

类型均以 TypeScript 表达，落位 `projects/werewolf/src/engine/`；
事件类型见 [contracts/event-stream.md](contracts/event-stream.md)，可见性见
[contracts/visibility.md](contracts/visibility.md)，交互见 [contracts/hotseat-ui.md](contracts/hotseat-ui.md)。

---

## 0. 事实分层（先定谁说了算）

| 层 | 内容 | 是否序列化 | 谁能读 |
|---|---|---|---|
| **引擎状态** `GameState` | 阶段、轮次、玩家、警长、竞选、票箱、夜间工作数据、死亡链、胜负 | 否（内部） | engine 内部 |
| **事件日志** `GameEvent[]` | 19 类事件，含隐藏事实（刀口、查验、药、预设不产事件） | 是 | engine → 导出 / 复盘 |
| **座位视图** `VisibleView` | `viewFor(seat)` 投影 | 是（纯 JSON） | 该座位的 AI / 该座位的 UI |
| **投影事件流** `GameEvent[]` | `eventsFor(seat)` 过滤 | 是 | 该座位的 UI 日志 |
| **整局记录** `GameRecord` | `{schemaVersion, feature, config, events}` | 是 | 导出文件 / 重放 |

**唯一事实**：
- 状态类事实（存活、警长、票箱、链条进度）→ `GameState`（**不双写**）。
- 叙事类事实（谁说了什么、谁投了谁、谁死了、为什么终局）→ **事件日志**（唯一事实）。
  查验史、发言史、历轮计票、遗言史、警徽流转史一律**从日志派生**，不在 state 里存第二份。

---

## 1. 实体

### 1.1 座位、角色、阵营、边

```ts
type Seat = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
type Role = 'werewolf' | 'seer' | 'witch' | 'hunter' | 'villager';
type Faction = 'wolves' | 'good';
type Edge = 'wolf' | 'god' | 'villager';        // 屠边判定用

/** 规则 §2 板子：狼 3 / 预言家 1 / 女巫 1 / 猎人 1 / 村民 3 */
const BOARD: readonly Role[] = [
  'werewolf', 'werewolf', 'werewolf',
  'seer', 'witch', 'hunter',
  'villager', 'villager', 'villager',
];

factionOf(role): werewolf → 'wolves'；其余 → 'good'
edgeOf(role):    werewolf → 'wolf'；seer|witch|hunter → 'god'；villager → 'villager'
```

### 1.2 局前配置

```ts
type Mode = 'open' | 'dark';            // 明牌 / 暗牌（FR-007：局中不可改）

interface GameConfig {
  seed: string;          // 非空；留空由 UI 层生成后传入（FR-004，见 research D11 备注）
  mode: Mode;
  humans: Seat[];        // 1–9 个、去重、座位合法（FR-003）
}
```

**校验（`createGame` 前置，违反 → `BAD_CONFIG`，不建局）**：
`seed.length > 0`；`humans.length ∈ [1, 9]`；`humans` 无重复；每个座位 ∈ 1..9。

> **seed 留空的落点**：engine 内禁止 `Math.random`／`Date`（硬约束 2、SC-003），
> 因此「系统生成种子」在 `ui/` 层完成（`crypto.randomUUID()` 或时间戳），**生成后立即回填到设置页**
> 并对玩家可见（FR-004）。engine 只接受显式字符串种子 ⇒ 复现口径不被污染。

### 1.3 玩家

```ts
interface DeathRecord {
  seat: Seat;
  cause: 'night-kill' | 'poison' | 'exile' | 'hunter-shot';
  round: number;
  window: 'first-night' | 'night' | 'day';   // 死亡时点窗口（§5.3 遗言权判定）
  wasSheriff: boolean;                        // 死亡瞬间是否在位警长（快照，见 research D2）
  revealed: boolean;                          // 本次死讯是否公开身份（= mode==='open'）
}

interface PlayerState {
  seat: Seat;
  role: Role;            // 发牌后不可变
  isHuman: boolean;      // = config.humans.includes(seat)
  alive: boolean;
  death?: DeathRecord;   // alive=false 时必存在
}
```

### 1.4 警长与竞选

```ts
interface SheriffState {
  seat: Seat | null;              // 当前警长；null = 无警长
  electedRound: number | null;    // 当选轮次（本版恒 1）
  badgeLost: boolean;             // 已流失：不可回退、不再竞选、day_order 不再出现
  badgePreset: Seat | null;       // 生前预设（隐藏字段，仅真人警长经动作写入；AI 走 PresetPolicy）
  presetWindow: boolean;          // D78 瞬时窗口：移交刚落地、等待新警长设预设
}

interface ElectionState {
  signupOrder: Seat[];            // 报名轮转顺序（= 当日存活者座位升序，开局快照）
  signupCursor: number;           // 报名游标
  signups: Seat[];                // 已上警（座位升序）
  withdrawn: Seat[];              // 已退水（公开）
  speakCursor: number;            // sheriff_speak 游标（在 signups 内）
  speakStep: 'speech' | 'withdraw';   // 每位候选人的两个小步（§5.2-9）
  candidates: Seat[];             // 有效候选（冻结于 sheriff_vote 入口）
  voters: Seat[];                 // 警下集合（冻结于 sheriff_vote 入口，PK 复用同一集合）
  pkSeats: Seat[];                // 进入 PK 的并列者
  result: { seat: Seat | null; reason: SheriffElectReason } | null;
}

type SheriffElectReason =
  | 'elected' | 'single-candidate' | 'pk'
  | 'no-candidate' | 'all-withdrawn' | 'no-vote' | 'tie-exhausted';
```

派生（不存储）：`有效候选人 = signups − withdrawn`；`警下 = 存活者 − 有效候选人`。
但**冻结副本** `candidates` / `voters` 必须存储——PK 再投的投票人是「同一批警下」（FR-046），
不能让中间任何状态变化悄悄改动投票人集合。

### 1.5 投票与票权

```ts
type Weight = 1 | 1.5;          // 展示值（事件 vote_cast.weight）
type WeightHalf = 2 | 3;        // 计票值：1 票 = 2 半票；1.5 票 = 3 半票（规则 §5.5）
type HalfVote = number;         // 半票整数合计
type VoteScope = 'sheriff' | 'sheriff-pk' | 'exile';

interface Ballot { voter: Seat; target: Seat | 'abstain'; weight: Weight; }

interface VoteRound {
  scope: VoteScope;
  candidates: Seat[];       // 可投目标（竞选：有效候选人；PK：pkSeats；放逐：全存活）
  voters: Seat[];           // 应投票人（放逐：全存活；竞选：警下）
  cursor: number;           // 轮转游标（座位升序）
  ballots: Ballot[];        // 已收票（按提交顺序，实际恒为座位升序）
}
```

### 1.6 夜间工作数据

```ts
interface NightState {
  round: number;
  wolfTarget?: Seat;                                  // 狼刀（wolf-team 可见）
  witch?: { use: 'save' | 'poison' | 'none'; target?: Seat };
  seerCheck?: { target: Seat; result: 'good' | 'werewolf' };
}

/** 女巫药况（隐藏；仅女巫本人 + 导出记录可见） */
interface Potions { antidote: boolean; poison: boolean; }   // true = 仍在
```

### 1.7 发言与发言顺序

```ts
interface SpeechState {
  round: number;
  start: Seat;                        // 起讲座位（警长指定；无警长 = 最小存活座位）
  direction: 'asc' | 'desc';
  order: Seat[];                      // 完整顺序（已过滤死者）
  cursor: number;
}
```

### 1.8 死亡后续链与待公布结算

```ts
type DeathWindow = 'first-night' | 'night' | 'day';

interface SettlementState {
  queue: DeathRecord[];               // queue[0] = 当前处理者；空 = 链条结束
  window: DeathWindow;                // 本结算点窗口（枪杀新死者继承）
  resume: ChainResume;                // 链条结束后去哪（记录「规则」，出队时才解析成具体阶段）
  step: 'last-words' | 'badge' | 'shoot';
  badgeDirect?: Seat | null;          // 遗言显式指定（null = 明确作废；undefined = 未指定）
}

/**
 * 链条结束后的去向：存「规则」而不是「阶段」。
 * 原因：先存阶段会在「警长当夜被刀」时算错——入链时 sheriff.seat 还是死者，
 * 出链时已经换了人（或已流失）。因此必须等队列清空后再解析。
 */
type ChainResume =
  | { kind: 'first-night' }   // → 恒 sheriff_signup（首夜无警长，与谁死了无关）
  | { kind: 'day-after' }     // → 此刻（链条结束后）有存活警长 ? day_order : day_speak
  | { kind: 'next-night' };   // → night_wolf(round + 1)

function resolveResume(state: GameState): Phase {
  switch (state.settle.resume.kind) {
    case 'first-night': return 'sheriff_signup';
    case 'day-after':   return state.sheriff.seat !== null ? 'day_order' : 'day_speak';
    case 'next-night':  return 'night_wolf';
  }
}
```

### 1.9 对局状态（engine 内部唯一事实）

```ts
interface GameState {
  phase: Phase;
  round: number;                      // 首夜 = 1；第 N 夜与第 N 个白天同号
  config: GameConfig;
  players: PlayerState[];             // 按座位升序；发牌后长度恒 9
  potions: Potions;

  sheriff: SheriffState;
  election: ElectionState | null;     // null = 尚未进入过竞选
  speech: SpeechState | null;         // null = 尚未定过序
  votes: VoteRound | null;            // null = 不在投票中
  night: NightState | null;           // null = 不在夜晚

  settle: SettlementState | null;     // 死亡后续链（§5.3）
  winner: { faction: Faction; reason: VictoryReason } | null;
}

type VictoryReason = 'wolves-eliminated' | 'gods-eliminated' | 'villagers-eliminated';
```

---

## 2. 阶段全集（18 态，与规则 §5.1 逐个一致：数量、名字、顺序）

| # | `Phase` | 中文名 | 谁行动 | 动作形态 | 有 `pending` |
|---|---|---|---|---|---|
| 1 | `idle` | 未开始 | — | `startGame` | 否 |
| 2 | `night_wolf` | 夜·狼刀 | 狼队（代表座位） | `wolfKill` | 是（`wolf-kill`） |
| 3 | `night_witch` | 夜·女巫 | 女巫 | `witchAction` | 是（`witch-action`） |
| 4 | `night_seer` | 夜·查验 | 预言家 | `seerCheck` | 是（`seer-check`） |
| 5 | `dawn` | 天亮·公布死讯 | 全体（确认） | `confirm` | 否（系统推进） |
| 6 | `last_words` | 遗言 | 当前死者 | `lastWords` / `skipLastWords` | 是（`last-words`） |
| 7 | `badge_transfer` | 警徽移交 | 系统执行（确认） | `confirm` | 否（系统推进） |
| 8 | `sheriff_signup` | 竞选·上警报名 | 全体存活者（座位升序） | `sheriffSignup` | 是（`sheriff-signup`） |
| 9 | `sheriff_speak` | 竞选·上警者发言 | 候选人（座位升序） | `speak` / `skip`，随后 `withdrawElection` / `confirm` | 是（`speech` / `withdraw`） |
| 10 | `sheriff_vote` | 竞选·警下投票 | 警下（座位升序） | `castVote` / `abstain` | 是（`vote`） |
| 11 | `sheriff_pk_speak` | 竞选·PK 发言 | PK 候选人（座位升序） | `speak` / `skip` | 是（`speech`） |
| 12 | `sheriff_pk_vote` | 竞选·PK 再投 | 警下（同一批） | `castVote` / `abstain` | 是（`vote`） |
| 13 | `day_order` | 白天·定发言顺序 | 存活警长 | `setSpeechOrder` | 是（`speech-order`） |
| 14 | `day_speak` | 白天·发言 | 存活者（按 `speech.order`） | `speak` / `skip` | 是（`speech`） |
| 15 | `day_vote` | 白天·放逐投票 | 存活者（座位升序） | `castVote` / `abstain` | 是（`vote`） |
| 16 | `day_exile` | 放逐结算 | 全体（确认） | `confirm` | 否（系统推进） |
| 17 | `hunter_shoot` | 猎人开枪 | 猎人 | `hunterShoot` / `hunterPass` | 是（`hunter-shoot`） |
| 18 | `game_over` | 终局 | — | —（只读） | 否 |

```ts
type Phase =
  | 'idle' | 'night_wolf' | 'night_witch' | 'night_seer' | 'dawn'
  | 'last_words' | 'badge_transfer'
  | 'sheriff_signup' | 'sheriff_speak' | 'sheriff_vote'
  | 'sheriff_pk_speak' | 'sheriff_pk_vote'
  | 'day_order' | 'day_speak' | 'day_vote' | 'day_exile'
  | 'hunter_shoot' | 'game_over';
```

**退水不新增阶段**：它是 `sheriff_speak` 内、候选人本人发言/跳过后的一次附加决策
（`ElectionState.speakStep`），与规则 §5.1 注一致。

---

## 3. 动作全集（17 个成员，纯 JSON）

```ts
type Actor = Seat;                    // 玩家动作必带 actor（v2 收紧，见 §3.1）

type Action =
  | { type: 'startGame'; config: GameConfig }
  | { type: 'wolfKill'; target: Seat; actor: Actor }
  | { type: 'witchAction'; use: 'save' | 'poison' | 'none'; target?: Seat; actor: Actor }
  | { type: 'seerCheck'; target: Seat; actor: Actor }
  | { type: 'sheriffSignup'; join: boolean; actor: Actor }
  | { type: 'speak'; text: string; claim?: Claim; actor: Actor }
  | { type: 'skip'; actor: Actor }
  | { type: 'withdrawElection'; actor: Actor }
  | { type: 'castVote'; target: Seat; actor: Actor }
  | { type: 'abstain'; actor: Actor }
  | { type: 'setSpeechOrder'; start: Seat; direction: 'asc' | 'desc'; actor: Actor }
  | { type: 'lastWords'; text: string; badgeTo?: Seat | null; claims?: Claim[]; actor: Actor }
  | { type: 'skipLastWords'; badgeTo?: Seat | null; actor: Actor }
  | { type: 'hunterShoot'; target: Seat; actor: Actor }
  | { type: 'hunterPass'; actor: Actor }
  | { type: 'setBadgePreset'; target: Seat | null; actor: Actor }
  | { type: 'confirm' };

interface Claim { kind: 'seer-claim'; target: Seat; result: 'good' | 'werewolf' }
```

### 3.1 三条动作层口径

1. **`actor` 必填（相对 v1 的收紧）**：v1 的 `speak / skip / castVote / abstain` 的 `actor` 是可选的
   （省略 = 当前行动者）。v2 起**所有玩家动作必带 `actor`**，engine 逐个校验。
   理由：hot-seat 下「当前行动者」有多个信息源（遮挡页、pending、UI 焦点），
   省略语义会让「谁按的键」无法审计；联机时服务端也要按 `actor` 鉴权（规则 §11-5）。
   `confirm` 与 `startGame` 不带 `actor`（系统动作）。
2. **`badgeTo` 三态**：`undefined` = 不调整、沿用生前预设；`null` = 明确作废（**不回落**预设）；
   `Seat` = 指定（须存活且 ≠ 自己）。三者语义不同，JSON 里分别表现为「键缺失 / null / 数字」。
3. **`setBadgePreset` 相位无关但有回合闸门**（D79）：`actor` 必须是在位且存活的警长，且处于
   「自己的操作回合」或 `presetWindow` 窗口（见 [contracts/hotseat-ui.md](contracts/hotseat-ui.md) §5）。
   该动作**不推进流程、不产生事件、不进 `eventsFor`**（FR-026 / 规则 §5.7-10）。

---

## 4. 内部结构（模块分层）

```text
src/engine/
├── types.ts       阶段/动作/状态/配置/座位/角色/边（本文件 §1–§3）
├── events.ts      19 类事件 + 构造器 + GameRecord v2 + exportGame
├── tally.ts       weightHalf / tallyHalf / displayHalf / resolveMajority（计票唯一实现）
├── victory.ts     checkVictory（屠边 3 条 + 优先序）
├── settle.ts      结算点：recordDeaths / settlePoint / applyVictory / finalTable
├── chain.ts       死亡后续链：advanceChain / hasLastWords / resolveBadgeTarget / hunterCanShoot
├── phases.ts      PHASES 规格表（18 项：actor / legalTargets / acceptedKinds / enter）
├── transition.ts  纯函数 transition(state, action, ctx)
├── view.ts        viewFor / eventsFor（隔离唯一咽喉点）
└── engine.ts      Engine 门面 + Deps{presetPolicy} + 配置校验
```

> 相较 v1 的 6 个文件，v2 拆出 `tally / victory / chain / phases` 四个文件。
> 判据：这四处是 **v2 最高风险 + 可纯函数化**的部分（SC-004 / SC-005 / §5.3 五性质 / 18 阶段对账），
> 每处都需要独立的测试面与 review 单元。`AGENTS.md` 的目录结构是**约定**（非硬约束），
> engine 内部拆文件不改变模块边界（engine 仍零 DOM、零 ai 依赖）。

---

## 5. 转移表（18 行，逐行对应规则 §5.2；实现级补充「进入钩子」与「下一阶段解析」）

> 通用前提：`phase === 'game_over'` 时任何动作 → `GAME_OVER`；
> 动作不属于该阶段 → `WRONG_PHASE`；`actor` 不符 → `NOT_YOUR_TURN`；目标不合法 → `ILLEGAL_TARGET`。
> 非法动作**状态不变、不产事件**。

| # | 当前阶段 | 动作 | 实现级前置校验 | 下一阶段 | 产出事件 |
|---|---|---|---|---|---|
| 1 | `idle` | `startGame(config)` | `phase==='idle'`；config 三项校验（§1.2） | `night_wolf`（round=1） | `game_started` → `night_started` → `roles_dealt`（`end`） |
| 2 | `night_wolf` | `wolfKill(target)` | `actor === resolveWolfTeamRep()`；存在存活狼；target 存活 ∧ `role≠werewolf` | 女巫存活 → `night_witch`；否则预言家存活 → `night_seer`；否则 →「夜结算」（§6.2） | `wolf_kill_decided`（`wolf-team`） |
| 3 | `night_witch` | `witchAction` | 女巫存活；`night.witch` 未写（同夜只用一瓶）；`save` ⇒ 刀口存在 ∧ 解药在；`poison` ⇒ 毒药在 ∧ 目标存活 ∧ ≠ 自己；`none` 恒合法 | 预言家存活 → `night_seer`；否则 →「夜结算」 | `witch_action`（`witch-private`） |
| 4 | `night_seer` | `seerCheck(target)` | 预言家存活；target 存活 ∧ ≠ 自己；重复验同一人**合法** | 「夜结算」→ `dawn`；若判胜 → `game_over` | `seer_check_completed`（`seer-private`）→ `player_died`×0–2 →（判胜时）`victory` → `game_over` |
| 5 | `dawn` | `confirm` | 死讯已在「夜结算」公布 | 有死者 → 启动死亡链（首个可执行段）；无死者 → 直接 `resolveResume()` | 本行不产事件 |
| 6 | `last_words` | `lastWords` / `skipLastWords` | `actor === settle.queue[0].seat`；`hasLastWords(queue[0])`；`badgeTo` 仅当 `queue[0].wasSheriff`（`Seat` 须存活且 ≠ 自己，或 `null`）；`claims` 可选（0..n，见 §12.2） | 转 `badge` 段：`wasSheriff` → `badge_transfer`；否则 → `hunter_shoot` 或出队 | `last_words`（`public`） |
| 7 | `badge_transfer` | `confirm` | `settle.queue[0].wasSheriff`（结构上必真） | 转 `shoot` 段 → `hunter_shoot` 或出队 | `badge_passed`（`public`，`to:null` = 流失）；`to≠null` 时置 `presetWindow` |
| 8 | `sheriff_signup` | `sheriffSignup(join)` | `round===1` ∧ `election.result===null`；`actor === signupOrder[signupCursor]` | 收齐后：\|signups\|=0 → `sheriff_elected{null,'no-candidate'}` + `badgeLost` → `day_speak`；=1 → `{seat,'single-candidate'}` → `day_order`；≥2 → `sheriff_speak` | `sheriff_signup`（`public`）×存活者 →（边界时）`sheriff_elected` |
| 9 | `sheriff_speak` | `speak` / `skip`（`speakStep='speech'`）；`withdrawElection` / `confirm`（`speakStep='withdraw'`） | `actor === signups[speakCursor]`；退水仅 `speakStep==='withdraw'` 且每人一次；PK 期不开放退水 | 下一位候选人；全部处理完：\|candidates\|=0 → `{null,'all-withdrawn'}`+`badgeLost` → `day_speak`；=1 → `{seat,'single-candidate'}` → `day_order`；≥2 → `sheriff_vote`（冻结 `candidates` / `voters`） | `speech`（`stage:'sheriff'`）→（退水）`sheriff_withdraw`（`public`）→（边界时）`sheriff_elected` |
| 10 | `sheriff_vote` | `castVote` / `abstain` | `actor === voters[cursor]`；target ∈ `candidates`；票权恒 1（场上无警长） | 收齐 → 计票：唯一最高 → `{seat,'elected'}` → `day_order`；并列 → `sheriff_pk_speak`；\|\|tally\|\|=0 → `{null,'no-vote'}`+`badgeLost` → `day_speak` | `vote_cast`×n（`weight:1`）→ `vote_result`（`scope:'sheriff'`）→ `sheriff_elected` |
| 11 | `sheriff_pk_speak` | `speak` / `skip` | `actor === pkSeats[cursor]` | 全员说完 → `sheriff_pk_vote` | `speech`（`stage:'sheriff-pk'`） |
| 12 | `sheriff_pk_vote` | `castVote` / `abstain` | `actor ∈ voters`（同一批，座位升序）；target ∈ `pkSeats`；**不开放退水** | 唯一最高 → `{seat,'pk'}` → `day_order`；并列 → `{null,'tie-exhausted'}`+`badgeLost` → `day_speak`；0 票 → `{null,'no-vote'}`+`badgeLost` → `day_speak` | `vote_cast`×n（`weight:1`）→ `vote_result`（`scope:'sheriff-pk'`）→ `sheriff_elected` |
| 13 | `day_order` | `setSpeechOrder` | `actor === sheriff.seat` ∧ 存活；`start` 存活（可为自己）；`direction ∈ {asc,desc}`；每轮白天一次 | `day_speak`（`order` = 从 `start` 按方向绕行、过滤死者） | `day_speech_order`（`public`） |
| 14 | `day_speak` | `speak` / `skip` | `actor === speech.order[speech.cursor]`；文本可为空串 | 有下一位 → `day_speak`；说完 → `day_vote`（初始化票箱：`scope:'exile'`，voters=candidates=全存活） | `speech`（`stage:'day'`） |
| 15 | `day_vote` | `castVote` / `abstain` | `actor === 存活座位升序游标`；target 存活（**可投自己**）；票权 = `weightHalf(sheriff.seat, voter)` | 收齐 → 计票 → 唯一最高 → 记录死亡（`cause:'exile'`）+ 判胜 → `day_exile`（或 `game_over`）；并列/全弃 → `day_exile`（无死者） | `vote_cast`×n（含 `weight`）→ `vote_result`（`scope:'exile'`）→（放逐时）`player_died` →（判胜时）`victory` → `game_over` |
| 16 | `day_exile` | `confirm` | 计票与判胜已在入场完成 | 有死者 → 启动死亡链（`resume = {kind:'next-night'}`）；无死者 → `night_wolf(round+1)` | 本行不产事件（进夜时产 `night_started`） |
| 17 | `hunter_shoot` | `hunterShoot(target)` / `hunterPass()` | `actor === settle.queue[0].seat` ∧ 该死者 `role==='hunter'` ∧ `cause ∈ {night-kill, exile}`；target 存活 ∧ ≠ 自己 | 命中 → 以「新结算点」记录死亡 + 判胜 → 胜则 `game_over`；否则 `queue.unshift(新死者)` 并回到 `last-words` 段；弃枪 → 出队 → 下一位/结束 | `hunter_shot`（`public`）→（命中时）`player_died`（`cause:'hunter-shot'`）→（判胜时）`victory` → `game_over` |
| 18 | `game_over` | —（只读） | 任何动作 → `GAME_OVER` | 终局 | 判胜时已产 `victory` → `game_over`（终表 + 警徽流转） |

### 5.1 阶段跳过的唯一口径

`advanceTo(next)` 只在**夜间**做跳过，且只跳「行动者已死」的环节（FR-013）：

```text
进入夜晚（round N）：phase = night_wolf → 产 night_started
night_wolf 出口：女巫存活 ? night_witch : (预言家存活 ? night_seer : 夜结算)
night_witch 出口：预言家存活 ? night_seer : 夜结算
night_seer 出口：夜结算
```

**重要口径**：夜间各环节的「行动者存活」判定 = **进入该环节时的存活状态**。
本夜死亡在 `dawn` 入口才结算，所以「当夜被刀的预言家仍能查验」「当夜被刀的女巫仍能用药」
（若药未用）都是**合法**的——这不是 bug，是结算时点的必然结果（规则 §5.1 / §5.7-2）。

### 5.2 阶段进入钩子（`enter` 的必做初始化，遗漏即为 bug）

| 进入 | 必做 |
|---|---|
| `night_wolf` | `round` = 首夜 1 / 否则 `+1`；清空 `night`、`speech`、`votes`、`settle`；产 `night_started` |
| `dawn` | 见 §6.2「夜结算」：记录 0–2 名死者 → 判胜 → 建 `settle` |
| `sheriff_signup` | `election = { signupOrder: 存活座位升序快照, signupCursor: 0, signups: [], withdrawn: [], speakCursor: 0, speakStep: 'speech', candidates: [], voters: [], pkSeats: [], result: null }` |
| `sheriff_vote` / `sheriff_pk_vote` | `votes = { scope, candidates: 冻结副本, voters: 冻结副本, cursor: 0, ballots: [] }` |
| `day_speak`（**两个入口**） | ① 由 `day_order` 进入 → `speech` 已由该动作写好；② 无警长（`badgeLost` 或本局无警长）进入 → 初始化 `speech = { round, start: 最小存活座位, direction: 'asc', order: 存活座位升序, cursor: 0 }` |
| `day_vote` | `votes = { scope:'exile', candidates: 存活座位, voters: 存活座位, cursor: 0, ballots: [] }` |
| `day_exile` | 计票与判胜已在 `day_vote` 收齐时完成，本阶段只做展示 |
| `game_over` | 无（判胜时已产 `victory` + `game_over`） |

### 5.3 「当选」与「无警长」的唯一写法

```text
# 三条当选分支（single-candidate / elected / pk）都执行同一段：
sheriff = { seat: 当选座位, electedRound: 1, badgeLost: false, badgePreset: null, presetWindow: false }
# 四条无警长分支（no-candidate / all-withdrawn / no-vote / tie-exhausted）都执行：
sheriff = { seat: null, electedRound: null, badgeLost: true, badgePreset: null, presetWindow: false }
```

- `election.result` 写 `{seat, reason}`，**一局恰有一条** `sheriff_elected` 事件。
- 当选者若是**真人** → 其预设控件可用（`myBadgePreset = null` 初始「未指定」）；
  当选者若是 **AI** → 预设由 `presetPolicy` 在移交时求值（research D5）。

---

## 6. 结算点与死亡后续链（本文件最重要的一节）

### 6.1 三种结算点

| 结算点 | 触发位置 | 死亡数 | `window` | `resume` |
|---|---|---|---|---|
| 夜间 | `night_seer` 出口 / `night_witch` 出口（预言家已死） | 0–2（狼刀 + 毒；解药生效 0；同目标算 1） | round=1 ? `first-night` : `night` | round=1 → `{kind:'first-night'}`；round≥2 → `{kind:'day-after'}`（**出链时**才看警长是否存活） |
| 放逐 | `day_vote` 收齐计票后 | 0–1（唯一最高才有） | `day` | `{kind:'next-night'}` |
| 枪杀 | `hunter_shoot` 命中后 | 0–1 | **继承**当前 `settle.window` | **继承**当前 `settle.resume`（不新建） |

### 6.2 夜结算（进入 `dawn` 前的入场处理）

```text
settleNight(state):
  1. 判定解药：night.witch?.use === 'save' ∧ 目标 === wolfTarget
       → 该刀口不死亡、不产 player_died（FR-014）
  2. 否则记录刀口死亡：cause='night-kill'
  3. 若 night.witch?.use === 'poison':
       target 已在死者集合 → 不新增（同目标只算 1 死），且该死者 cause 改写为 'poison'（§12.1-P③）
       否则 → 追加死者 cause='poison'，顺序恒为「狼刀 → 毒药」
  4. 对每位死者：wasSheriff = (sheriff.seat === seat)；revealed = (config.mode === 'open')
  5. 产 player_died × n（明牌带 revealedRole，暗牌不带）——n ∈ {0,1,2}
  6. 判胜一次（§8）：成立 → victory + game_over，phase='game_over'，**不进入 dawn**
  7. 否则 phase='dawn'，settle = { queue: 死者（狼刀序→毒药序）, window,
             resume: (round===1 ? {kind:'first-night'} : {kind:'day-after'}), step:'last-words' }
```

### 6.3 结算点伪代码（`settle.ts` + `chain.ts`）

```text
# 三种结算点共用的唯一入口
enterSettlement(state, deaths, window, resume):
  1. for d in deaths:                       # ① 全部记录完
       markDead(d); emit player_died(d)     #    明牌带 revealedRole / 暗牌不带
  2. v = checkVictory(state)                # ② 全部记录完才判一次（避免"先死先赢"）
     if v: applyVictory(v); emit victory; emit game_over; phase = 'game_over'
           return state                    # → ③ 遗言/移交/开枪全部跳过（判胜优先）
  3. state.settle = { queue: deaths, window, resume, step: 'last-words' }
     return advanceChain(state)             # → ③ 逐个处理后续事项

advanceChain(state):
  if settle === null: return state
  loop:
    if settle.queue 为空:
        phase = resolveResume(state); settle = null      # ★ 出队时才解析
        if phase === 'night_wolf': round += 1; emit night_started
        return state
    d = settle.queue[0]
    if settle.step === 'last-words':
        if hasLastWords(d):                    # window==='first-night' || cause==='exile'
            phase = 'last_words'; return state          # 等动作
        else: settle.step = 'badge'; continue
    if settle.step === 'badge':
        if d.wasSheriff:
            phase = 'badge_transfer'; return state      # 等 confirm
        else: settle.step = 'shoot'; continue
    if settle.step === 'shoot':
        if d.role === 'hunter' and d.cause ∈ {'night-kill','exile'}:
            phase = 'hunter_shoot'; return state        # 等动作（弃枪也走这里）
        else: settle.queue.shift(); settle.step = 'last-words'; continue
  end loop

# 遗言动作落地
onLastWords(state, action):
  d = settle.queue[0]
  emit last_words(public, seat=d.seat, text, skipped, cause=d.cause, window=settle.window)
  settle.badgeDirect = action.badgeTo        # undefined | null | Seat 三态原样保留
  settle.step = 'badge'
  return advanceChain(state)

# 警徽移交（系统 confirm）
onBadgeTransfer(state):
  d = settle.queue[0]
  { to, reason } = resolveBadgeTarget(state, d, settle.badgeDirect)
  updateSheriff(to)                          # to=null → badgeLost = true
  emit badge_passed(public, from=d.seat, to, reason)
  if to !== null ∧ players[to].isHuman: sheriff.presetWindow = true   # D78：仅真人接任才开窗口
  settle.step = 'shoot'
  return advanceChain(state)

resolveBadgeTarget(state, dead, direct):
  if direct === null                            → { to: null, reason: 'last-words' }   # 显式作废，不回落
  if direct 是合法座位（存活 ∧ ≠ dead）          → { to: direct, reason: 'last-words' }
  # direct === undefined，或 direct 非法（已死/自己/不存在）→ 视为未指定，回落预设
  preset = dead 是真人 ? sheriff.badgePreset : presetPolicy(dead.seat, viewFor(dead.seat))
  if preset 是合法座位（存活 ∧ ≠ dead）          → { to: preset, reason: 'preset' }
  → { to: null, reason: 'invalid' }                                                  # 流产

# 猎人开枪
onHunterShoot(state, target | null):
  d = settle.queue[0]
  emit hunter_shot(public, seat=d.seat, target)
  settle.queue.shift()                       # 猎人自己的后续事项到此结束
  settle.step = 'last-words'
  if target === null: return advanceChain(state)          # 弃枪不判胜（FR-035）
  victim = players[target]
  # 枪杀是**另一个结算点**：记录 → 判胜 → 其后续链
  markDead(victim, cause='hunter-shot', window=settle.window,
           wasSheriff = (sheriff.seat === target))       # 可在这一步继承警徽后为 true
  emit player_died(victim)
  v = checkVictory(state)
  if v: applyVictory(v); emit victory; emit game_over; phase='game_over'; settle=null; return state
  settle.queue.unshift(victim)               # ★ 队首插入 = 深度优先
  return advanceChain(state)
```

### 6.4 逐条对上规则 §5.3 的五条关键性质

| 规则性质 | 本设计的保证方式 | 可断言点 |
|---|---|---|
| **1. 遗言与警徽移交解耦** | `last-words` 与 `badge` 是两个独立 `step`；`hasLastWords` 只决定是否进入 `last_words`，**不影响**是否进入 `badge_transfer` | 第 2 夜警长被刀：`last_words` 事件数 = 0，`badge_passed` 事件数 = 1 |
| **2. 先遗言、后警徽、再开枪** | `step` 的枚举顺序固定为 `last-words → badge → shoot`，且每次只前进不后退 | 猎人兼警长被放逐：三段事件的 `seq` 严格递增且顺序为 `last_words < badge_passed < hunter_shot` |
| **3. 同一次死亡最多 1 次移交；枪杀是另一次结算** | 移交只由 `step==='badge'` 且 `d.wasSheriff` 触发；`wasSheriff` 是**死亡瞬间快照**；枪杀新建 `DeathRecord` 入队首，若其 `wasSheriff` 为真则再走一次 `badge` | 同夜双死（A 刀、B 毒，A 是警长）：`badge_passed` = 1（A 的），B 不触发 |
| **4. 判胜优先于一切后续动作** | `enterSettlement` 的第 2 步在任何 `advanceChain` 之前；判胜即 `phase='game_over'` 且 `settle=null`，链条**根本没有启动** | 猎人自身死亡即判狼胜：`last_words` = 0、`badge_passed` = 0、`hunter_shot` = 0 |
| **5. 同夜可双死，判胜用一次检查，枪杀新死亡先处理完** | ① 死亡全部记录完后 **只调一次** `checkVictory`；② 队列顺序「狼刀 → 毒药」；③ 枪杀新死者 `queue.unshift` ⇒ 深度优先 | 狼刀屠神边 + 毒药屠民边同时成立 → `reason = 'gods-eliminated'`（顺序靠前者）；首夜枪伤链的事件序为 `last_words(猎人) < hunter_shot < last_words(被枪者) < sheriff_signup` |

### 6.5 队列演进示例（首夜：猎人被刀 → 枪杀 B；女巫毒 C）

```text
t0  settleNight: deaths = [A(猎人, night-kill), C(poison)]
    enterSettlement → 记录 A、C（player_died ×2）→ 判胜未成立
    settle.queue = [A, C], window='first-night', step='last-words'
t1  advanceChain → A 有遗言 → phase=last_words(actor=A)          ← 停
t2  lastWords(A) → 事件 last_words → step='badge' → A 非警长 → step='shoot'
t3  advanceChain → A 是猎人且 cause=night-kill → phase=hunter_shoot ← 停
t4  hunterShoot(B) → 记录 B（cause=hunter-shot, window='first-night', wasSheriff=?）
    → 判胜未成立 → queue.unshift(B) ⇒ queue = [B, C], step='last-words'
t5  advanceChain → B 有遗言（window='first-night'）→ phase=last_words(actor=B) ← 停
t6  lastWords(B) → step='badge' → B 非警长 → step='shoot' → B 非猎人 → shift
    → queue = [C], step='last-words'
t7  advanceChain → C 有遗言（首夜被毒）→ phase=last_words(actor=C) ← 停
t8  lastWords(C) → 非警长、非猎人 → shift → queue = []
t9  advanceChain → 队列空 → resolveResume() = sheriff_signup（round=1）
```

事件序即：`player_died(A)` `player_died(C)` `last_words(A)` `hunter_shot(B)` `player_died(B)`
`last_words(B)` `last_words(C)` `sheriff_signup …` —— 与规则 §5.6 首日固定顺序完全一致。

---

## 7. 计票模型（1.5 票 = 半票整数）

### 7.1 类型与函数签名（唯一实现：`engine/tally.ts`）

```ts
type HalfVote = number;
type WeightHalf = 2 | 3;

/** 半票票权：警长 3、其他 2（规则 §5.5 原文） */
function weightHalf(sheriffSeat: Seat | null, voter: Seat): WeightHalf;

/** 半票合计：只统计有效票，弃票不计（FR-050） */
function tallyHalf(ballots: readonly Ballot[], sheriffSeat: Seat | null): Record<Seat, HalfVote>;

/** 展示值：'3' | '3.5'（只用于 UI 与事件；禁止参与比较） */
function displayHalf(h: HalfVote): string;

interface Majority {
  max: HalfVote;            // 最高半票数（全弃时 0）
  winners: Seat[];          // 取到 max 的座位（升序）
  abstainCount: number;
  totalHalf: HalfVote;      // 已投票的票权之和（未弃票者）
}
/** 相对多数：|winners|=1 唯一；≥2 并列；max=0 全弃（FR-051：不设过半数门槛） */
function resolveMajority(tally: Record<Seat, HalfVote>, abstainCount: number): Majority;
```

**硬约束**：`HalfVote` 全生命周期为整数；任何 `===` / `<` / `>` 比较只出现在整数上；
`displayHalf` 是唯一产出小数的地方（UI 与事件展示）。

### 7.2 规则 §5.5 的 5 个防歧义用例（逐条可断言）

| # | 场景（9 人存活） | `tallyHalf` | `displayHalf` | `resolveMajority` |
|---|---|---|---|---|
| 1 | 警长 + 2 人投 A；3 人投 B；3 人弃票 | A=7, B=6 | `3.5 : 3` | `winners=[A]`（**不是平票**） |
| 2 | 警长 + 1 人投 A；2 人投 B；5 人弃票 | A=5, B=4 | `2.5 : 2` | `winners=[A]` |
| 3 | 警长投 A；3 人投 B；3 人投 C；2 人弃票 | A=3, B=6, C=6 | `1.5 : 3 : 3` | `winners=[B,C]` → PK / 平安日 |
| 4 | 全员弃票 | 空（max=0） | `0` | `winners=[]` → 无人当选 / 平安日 |
| 5 | 警长投 A；3 人投 B；5 人弃票 | A=3, B=6 | `1.5 : 3` | `winners=[B]` → 放逐 |

### 7.3 三条派生不变式（属性测试用）

1. **奇偶律**：含警长票的一方 `tallyHalf` 为奇数，不含者为偶数 ⇒ **两个 x.5 永不并列**
   （规则 §5.5「推论」）。
2. **守恒律**：`Σ tallyHalf + Σ 弃票票权 = Σ 全部投票人票权`。
3. **单调律**：同一票箱里去掉任意一票，`max` 不增。

---

## 8. 胜负判定（`engine/victory.ts`，规则 §6）

```ts
function checkVictory(state: GameState): { faction: Faction; reason: VictoryReason } | null {
  const alive = state.players.filter(p => p.alive);
  const wolves = alive.filter(p => p.role === 'werewolf').length;
  const gods   = alive.filter(p => edgeOf(p.role) === 'god').length;
  const villagers = alive.filter(p => edgeOf(p.role) === 'villager').length;

  if (wolves === 0)    return { faction: 'good',  reason: 'wolves-eliminated' };   // ①
  if (gods === 0)      return { faction: 'wolves', reason: 'gods-eliminated' };    // ②
  if (villagers === 0) return { faction: 'wolves', reason: 'villagers-eliminated' }; // ③
  return null;
}
```

| 规则要求 | 落点 |
|---|---|
| 判胜顺序固定（狼灭 → 神灭 → 民灭） | 上面三条 `if` 的**书写顺序**即口径；`gods` 与 `villagers` 同时为 0 时取 `gods-eliminated` |
| 只用存活口径 | `alive` 过滤；死者不计 |
| 每次死亡结算后立即判一次 | 只在 `enterSettlement` 第 2 步调用；**全代码仅此一处**调用 `checkVictory` |
| 遗言阶段不判胜 | `last_words` 不产生死亡、不改存活 ⇒ 无调用点 |
| 警徽移交不判胜 | 移交只改 `sheriff`，不改 `alive` ⇒ 无调用点 |
| 枪杀立即判胜 | `onHunterShoot` 命中后立即调用（与 `enterSettlement` 同口径） |
| 判胜后跳过遗言/移交/开枪 | `applyVictory` 置 `phase='game_over'` 且 `settle=null`；`advanceChain` 首行即返回 |
| 终局公布 | `game_over` 事件带 `finalTable`（9 项：seat/role/alive/isHuman）+ `badgeFlow`（移交史） |

---

## 9. 状态机不变式（可在任意 `dispatch` 后断言）

| # | 不变式 |
|---|---|
| I1 | `players.length === 9`（`phase !== 'idle'`） |
| I2 | 角色计数恒为 狼 3 / 预言家 1 / 女巫 1 / 猎人 1 / 村民 3 |
| I3 | `alive` 单调递减（无复活路径） |
| I4 | `phase === 'game_over'` ⇔ `winner !== null` |
| I5 | `settle !== null` ⇒ `phase ∈ {last_words, badge_transfer, hunter_shoot}` |
| I6 | `phase ∈ {last_words, badge_transfer, hunter_shoot}` ⇒ `settle !== null` ∧ `settle.queue.length > 0` |
| I7 | `round` 单调不减；只在进入 `night_wolf` 时 `+1` |
| I8 | `votes !== null` ⇒ `ballots.length ≤ voters.length`；计票只发生在 `ballots.length === voters.length` 的那一次 dispatch |
| I9 | `sheriff.badgeLost === true` ⇒ `sheriff.seat === null`（反之不成立：首日竞选前两者皆空/假） |
| I10 | `sheriff.presetWindow === true` ⇒ 上一次产生的事件是 `badge_passed` 且 `to !== null` |
| I11 | 每个座位最多一条 `player_died` 事件；`alive=false` ⇔ 存在 `death` |
| I12 | `badge_passed` 事件数 ≤ 死亡事件数（每次死亡最多一次移交） |
| I13 | `victory` 事件最多 1 条，且必为倒数第二条（紧跟 `game_over`） |
| I14 | 事件 `seq` 从 1 连续递增；无时间戳字段 |
| I15 | 竞选（`sheriff_signup` 起至 `sheriff_elected` 止）区间内 `player_died` 事件数 = 0（FR-048） |

---

## 10. 边界情形映射（spec「边界情形」23 条 → 实现口径）

| # | spec 边界情形 | 实现口径 |
|---|---|---|
| 1 | 首夜 0 死（解药救下刀口） | `settleNight` 第 1 步：不产 `player_died` ⇒ `dawn` 的 `settle.queue` 为空 ⇒ confirm 直接 `resolveResume()`（round=1 → `sheriff_signup`） |
| 2 | 首夜死者被毒（非被刀）→ 仍有遗言；若是猎人不能开枪 | `window='first-night'` ⇒ `hasLastWords=true`；`cause='poison'` ∉ `{night-kill, exile}` ⇒ `shoot` 段直接出队 |
| 3 | 首夜猎人被刀 → 遗言 → 开枪 → 被枪者遗言 → 才进竞选 | §6.5 的队列演进示例（t0–t9） |
| 4 | 首夜猎人被毒 → 有遗言、不能开枪 | 同 #2 |
| 5 | 首夜双死、目标不同 → 两人都有遗言，先刀后毒 | `queue` 顺序固定「狼刀 → 毒药」；两名死者 `window` 同为 `first-night` |
| 6 | 同一目标同时被刀又被毒 → 1 死、`cause='poison'`、猎人不能开枪 | `settleNight` 第 3 步改写 `cause='poison'` 且不追加死者 |
| 7 | 第 2 夜起被刀/被毒 → 无遗言；警长仍按预设移交 | `window='night'` 且 `cause≠exile` ⇒ 跳过 `last_words`；`step='badge'` 独立执行 |
| 8 | 警长被放逐 → 遗言（可改流向）→ 移交 →（若是猎人）开枪 | `window='day'` 且 `cause='exile'` ⇒ 有遗言；`badgeDirect` 优先于预设；再进 `shoot` |
| 9 | 枪杀打死刚接任的警长 → 无遗言；按其自己的预设移交；无预设流失 | 枪杀新建 `DeathRecord` 时 `wasSheriff=(sheriff.seat===target)` → 新链条 `step='badge'`；`window` 继承（非首夜则无遗言） |
| 10 | 预设目标先于警长死亡 → 视为未指定 → 流失 | `resolveBadgeTarget` 要求目标**当前存活**；不满足 → `{to:null, reason:'invalid'}` |
| 11 | 无人上警 → 无警长，座位升序发言 | `{null,'no-candidate'}` + `badgeLost=true` → `day_speak`（`order` = 存活座位升序） |
| 12 | 仅 1 人上警 → 直接当选 | `{seat,'single-candidate'}` → `day_order` |
| 13 | 全员上警且无人退水（无合格投票人） | `candidates = 全部存活` ⇒ `voters = ∅` ⇒ 未投票即收齐 ⇒ `{null,'no-vote'}` + `badgeLost` → `day_speak` |
| 14 | 上警者全部退水 → 无警长 | `candidates = ∅` ⇒ `{null,'all-withdrawn'}` + `badgeLost` → `day_speak`（此时全员警下） |
| 15 | 退水后只剩 1 名候选 → 直接当选 | `candidates.length === 1` ⇒ `{seat,'single-candidate'}` → `day_order` |
| 16 | **退水者仍投票** | `voters` = 存活 − `candidates`（冻结）⇒ 已退水者天然在 `voters` 里；`castVote` 校验只要求 `actor ∈ voters` ∧ `target ∈ candidates`，退水者不会被列为目标 |
| 17 | 竞选（含 PK）期间有人死亡 → 规则上不可达 | 竞选区间内不存在结算点（`settle` 只在 `dawn`/`day_vote`/`hunter_shoot` 产生）⇒ 不变式 I15 断言 |
| 18 | 放逐阶段平票 / 全员弃票 → 平安日 | `resolveMajority` 返回 `winners.length ≥ 2` 或 `max=0` ⇒ 不记录死亡、`day_exile` 队列空 → `night_wolf(round+1)` |
| 19 | 真人出局但仍有遗言/开枪 → 保操作权，动作完成后转观战 | `last_words` / `hunter_shoot` 的 `pending.actor` = 死者座位；`viewFor(死者)` 保留 `pending`（与 v1 的「死者无 pending」不同，见 contracts/visibility.md §4） |
| 20 | 同夜双死同时满足两条屠边 → 取「神职全灭」 | `checkVictory` 的 ② 先于 ③ |
| 21 | 同夜双死且最后一狼也被毒死 → 好人胜 | ① 先于 ②③（`wolves===0` 优先） |
| 22 | 猎人自己就是最后一名神/民 → 遗言与开枪都跳过 | 死亡结算即判胜 ⇒ `settle=null` ⇒ 链条不启动 |
| 23 | 一局反复平票 → 允许连续平安日，仍须有限轮次终止 | 平安日不产生死亡，但每夜狼刀必生效 ⇒ 死亡数单调增长 ⇒ ≤10 轮终止（SC-002） |

---

## 11. 派生事实与存储边界（防双账）

| 事实 | 存储位置 | 说明 |
|---|---|---|
| 存活名单 | `players[].alive` | 唯一，不另存 `aliveSeats` |
| 查验史 | **事件** `seer_check_completed` | `viewFor(seer).seerChecks` 由日志派生 |
| 发言史 / 遗言史 | **事件** `speech` / `last_words` | `view.lastWords` / `view.speeches` 由日志派生 |
| 历轮计票 | **事件** `vote_result` | `view.voteResults` 由日志派生（含 `scope` 与半票明细） |
| 警徽流转史 | **事件** `badge_passed` | 终局 `badgeFlow` 由日志派生（FR-062） |
| 当前票箱 | `votes`（工作数据） | 只存当前轮；收齐即计票并清空 |
| 当前夜间动作 | `night`（工作数据） | 每夜清空；历史在日志 |
| 死亡链进度 | `settle`（工作数据） | 链条结束后置 `null` |
| 警徽预设 | `sheriff.badgePreset`（隐藏） | 不产事件、不进视图（除本人） |
| 药况 | `potions` | 不产独立事件；`witch_action` 记在日志（`witch-private`） |

---

## 12. AI 策略口径（v2；决策矩阵见 contracts/engine-api.md §6.1）

> 原则沿用 v1：**确定性、只用自己可见的信息（`VisibleView`）、随机只走注入的 rng**。
> AI 策略不是游戏规则（规则 §7 已声明「本节是实现口径」），但它是可测的确定性契约。

### 12.1 新增角色：女巫用毒（research D13，Lisa 2026-10-18 裁定）

> ⚠️ **本条推翻**规则 §12.1-D 与 spec FR-094 的旧口径（「毒药只在有存活公开查杀时用，否则不用」）。
> 新原则：**毒药不能烂在手里**。规则文档与 spec 需先同步修订（plan §风险与未决 第 0 项）。

```text
aiWitchAction(view, round) → Action          // 纯函数，不耗 rng
  1. 解药在 ∧ 本夜刀口存在            → {use:'save', target: 刀口}        # FR-094 前半句不变
  2. 候选池 = 存活 ∧ ≠ 自己；空 → {use:'none'}                            # 结构上不可达
  3. ① 存在「公开查杀 ∧ 目标存活」     → {use:'poison', target: 最近一次查杀目标}
        （公开 claim 并集 = speeches[].claim ∪ lastWords[].claims，按事件序）
  4. ② round ≥ 2 ∧ 毒药在              → {use:'poison', target: argmax score(s)}
  5. 毒药不在                          → {use:'none'}
```

**评分函数（权重写死，确定性）**：

| 信号 | 定义（全部来自 `VisibleView` 的公开信息） | 权重 |
|---|---|---|
| A | 公开查杀指向 s 的次数（`claims: result='werewolf' ∧ target=s`） | **+3** |
| B | 公开金水指向 s 的次数（`claims: result='good' ∧ target=s`） | **−3** |
| C | s 投过票、且目标已被公开证明为好人的票数（明牌局已死翻牌好人 ∪ 存活公开金水） | **+2** |
| D | s 本人曾发出 `seer-claim`（跳预言家）→ 1，否则 0 | **−5** |
| E | s 曾把票投给任一 `seer-claimant`（与跳预言家者对立）→ 1，否则 0 | **+2** |

```text
score(s) = 3A − 3B + 2C − 5D + 2E
tie-break：分数相同 → 座位号最小者
```

**为什么 D 是 −5**：跳预言家的人可能是真预言家（毒掉等于自杀式失误），
也可能是悍跳狼——但**悍跳狼会同时被 A 拉高**（它给的查杀指向别人，不是它自己），
因此「宁可放过悍跳狼，也不毒掉可能的真预言家」是更稳的默认。

**关键性质（`tests/witch.test.ts` 必测）**：

| # | 性质 | 断言 |
|---|---|---|
| P1 | **毒药不许烂在手里** | 毒药在 ∧ 女巫存活 ∧ `round ≥ 2` ⇒ 本夜必 `use:'poison'` ∧ target ∈ 存活他人 |
| P2 | 查杀优先于评分 | 存在存活公开查杀 ⇒ target = 最近一次查杀目标（与 score 无关） |
| P3 | 确定性 | 同一 `view` 两次求值相同；**不消耗 rng**（前后 rng 位置不变） |
| P4 | 全同分可复现 | 候选全同分 ⇒ 取座位号最小者 |
| P5 | 边界 | 女巫死 / 毒药已用 / `round===1` ∧ 无公开查杀 ⇒ 不毒（走 `save` 或 `none`） |

**对统计口径的影响（全 AI 局）**：
- 首夜：解药必用（若女巫存活）⇒ **0 死**；
- 第 2 夜起：毒药必用 ⇒ 每夜 ≥1 死、可能 2 死（同目标刀+毒只算 1 死）；
- 因此「0 死之夜」在一局中**最多 1 次**（首夜），v1 时代「夜夜 1 死」的统计断言必须按此重写
  （`termination.test.ts` 只断言 ≤10 轮的**上界**，不写死典型轮次）；
- 复现自锁（同 seed ×100 逐字节全等）**不受影响**：新决策是纯函数、不耗 rng。

### 12.2 其余 AI 策略：与规则 §7 一致，未变

| 决策 | 口径（出处） | 是否耗 rng |
|---|---|---|
| 狼刀 | 从存活好人中随机选 1 个（§7.1） | 是 |
| 预言家验人 | 从未验过的存活者中随机（§7.1）；全验过则从存活他人中随机 | 是 |
| 上警名单 | 存活狼中座位最小者上警；预言家必上；其余不上（§7.2） | 否 |
| 竞选发言 | 狼悍跳并查杀座位最小的存活好人；预言家公布首夜查验（§7.2） | 否 |
| 好人警下投票 | 1 个 claim → 投他；≥2 → 座位最小的 claim 者；无人 claim → 座位最小的候选；不弃票（§7.2） | 否 |
| 狼警下投票 | 投上警的狼队友；否则非狼候选最小（§7.2） | 否 |
| 退水 | **永不退水**（§7.2） | 否 |
| 白天发言 / 遗言文本 | 确定性模板句（§7.5、FR-096） | 否 |
| 遗言结构化声明 `claims[]` | 预言家：**全部查验**（按轮次，多条）；狼人/女巫/猎人/村民：**不产 claim**（§7.5 不承认/反咬不构成 seer-claim） | 否 |
| 猎人开枪 | 有公开存活查杀 → 打他；否则 `rng.pick` 一名存活者；无目标 → 弃枪（§7.1/FR-075） | 是 |
| 警徽预设 | `aiBadgePreset`（§7.3，research D5 注入） | 否 |
| 定发言顺序 | 起点 = 自己，方向 = `asc`（§7.4） | 否 |
| 女巫解药 | 解药在 ∧ 刀口存在 → 救（含自救）（§7.1 / FR-094 前半句） | 否 |
| **女巫毒药** | **D13：查杀优先 → round≥2 评分；必用** | **否** |
