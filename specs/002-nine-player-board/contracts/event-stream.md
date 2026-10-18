# 契约：对局事件流（v2 · 19 类事件）

**特性**: 002-nine-player-board | **模块**: `projects/werewolf/src/engine/events.ts`
**消费者**: `ui/`（渲染投影流）、导出文件（FR-080）、重放函数（SC-012）、将来的复盘/知识库（D35）

事件流是一等公民（硬约束 4）：引擎每局产出**有序、可序列化、无墙钟**的事件序列。
本契约冻结事件集合、可见性与导出版本；下游只依赖此契约，不依赖引擎实现。

---

## 1. 事件集合（19 类，与规则 §9 逐条一致）

公共字段：`seq`（全局递增，从 1 起）、`round`（1 起）、`visibility`。
**无墙钟时间戳**（SC-003 的"逐条一致"比较不能被时间字段污染）。

| # | `type` | 载荷 | `visibility` | 产出位置（转移表行） | 需求 |
|---|---|---|---|---|---|
| 1 | `game_started` | `{ seed, mode, humans, board: Role[] }` | `public` | 1 `startGame` | FR-001/003 |
| 2 | `night_started` | `{}` | `public` | 进夜（`startGame` / 链条结束且 `resolveResume()` = `night_wolf`） | FR-008 |
| 3 | `roles_dealt` | `{ assignment: Record<Seat, Role> }` | `end`（终局前谁都不见；本人身份经 `view.you` 得知） | 1 `startGame` | FR-001/005 |
| 4 | `wolf_kill_decided` | `{ target: Seat }` | `wolf-team` | 2 `wolfKill` | FR-009 |
| 5 | `witch_action` | `{ use: 'save'\|'poison'\|'none'; target?: Seat }` | `witch-private` | 3 `witchAction` | FR-010–012 |
| 6 | `seer_check_completed` | `{ target: Seat; result: 'good'\|'werewolf' }` | `seer-private` | 4 `seerCheck` | FR-016 |
| 7 | `player_died` | `{ seat, cause, window, revealedRole? }` | `public` | 夜结算 / 15 计票 / 17 枪杀 | FR-015/017/063 |
| 8 | `speech` | `{ seat, text, skipped, claim?, stage: 'day'\|'sheriff'\|'sheriff-pk' }` | `public` | 9 / 11 / 14 | FR-056/079 |
| 9 | `vote_cast` | `{ voter, target: Seat\|'abstain', weight: 1\|1.5 }` | `public` | 10 / 12 / 15 | FR-049/079 |
| 10 | `vote_result` | `{ scope, tally, tallyHalf, abstainCount, totalHalf, maxHalf, outcome, tiedSeats? }` | `public` | 10 / 12 / 15 | FR-049/051/079 |
| 11 | `last_words` | `{ seat, text, skipped, cause, window, claims? }` | `public` | 6 `lastWords`/`skipLastWords` | FR-020–022、FR-073 |
| 12 | `badge_passed` | `{ from: Seat, to: Seat\|null, reason: 'last-words'\|'preset'\|'invalid' }` | `public` | 7 `badge_transfer` | FR-027/031 |
| 13 | `sheriff_signup` | `{ seat, join: boolean, order: number }` | `public` | 8 `sheriffSignup` | FR-039 |
| 14 | `sheriff_withdraw` | `{ seat, round }` | `public` | 9 `withdrawElection` | FR-043 |
| 15 | `sheriff_elected` | `{ seat: Seat\|null, reason: SheriffElectReason }` | `public` | 8 / 9 / 10 / 12 | FR-041/044/046/047 |
| 16 | `day_speech_order` | `{ round, start, direction: 'asc'\|'desc', order: Seat[] }` | `public` | 13 `setSpeechOrder` | FR-054 |
| 17 | `hunter_shot` | `{ seat, target: Seat\|null }` | `public` | 17 `hunterShoot`/`hunterPass` | FR-033–037 |
| 18 | `victory` | `{ winner: 'wolves'\|'good', reason: VictoryReason }` | `public` | 判胜点（唯一调用处） | FR-058–061 |
| 19 | `game_over` | `{ finalTable, badgeFlow }` | `public` | 判胜点（紧跟 `victory`） | FR-062 |

```ts
type Visibility = 'public' | 'wolf-team' | 'seer-private' | 'witch-private' | 'end';
type DeathCause = 'night-kill' | 'poison' | 'exile' | 'hunter-shot';
type DeathWindow = 'first-night' | 'night' | 'day';
type VoteScope = 'sheriff' | 'sheriff-pk' | 'exile';
type VictoryReason = 'wolves-eliminated' | 'gods-eliminated' | 'villagers-eliminated';
type SheriffElectReason =
  | 'elected' | 'single-candidate' | 'pk'
  | 'no-candidate' | 'all-withdrawn' | 'no-vote' | 'tie-exhausted';
```

### 1.1 `vote_result` 的载荷（三处投票共用）

```ts
interface VoteResultPayload {
  scope: VoteScope;
  tally: Record<Seat, number>;      // 展示值，按 0.5 步进（3、3.5）
  tallyHalf: Record<Seat, HalfVote>;// 规范值（整数半票）；tally[s] === tallyHalf[s] / 2
  abstainCount: number;
  totalHalf: HalfVote;              // 未弃票者的票权之和
  maxHalf: HalfVote;                // 最高半票数（全弃时 0）
  outcome: 'unique' | 'tie' | 'all-abstain';
  tiedSeats?: Seat[];               // 仅 outcome==='tie' 时出现（进 PK 的并列者）
}
```

- **不重复选举结果座位**：唯一最高时当选者 / 被放逐者分别由 `sheriff_elected.seat` /
  紧随的 `player_died(seat, cause:'exile')` 表达（规则 §9 的明文要求）。
- `tally` 与 `tallyHalf` 是**同源派生**（`tally = tallyHalf/2`），出事件时一次算好，
  测试断言两者自洽（防 UI 与计票双账）。

### 1.2 `player_died` 的载荷

```ts
interface PlayerDiedPayload {
  seat: Seat;
  cause: DeathCause;
  window: DeathWindow;      // 死亡时点窗口（遗言权判定的公开依据）
  revealedRole?: Role;      // 仅明牌局（mode === 'open'）；暗牌局该键不存在
}
```

- `cause='poison'` 承载「同目标刀+毒只算 1 死」的口径（该死者死因记毒杀，猎人因此不能开枪）。
- 暗牌局**只有 `revealedRole` 缺失**，死亡事实本身（谁出局）恒公开（FR-063）。

### 1.2.1 `last_words.claims`（v2 新增的结构化声明数组）

```ts
interface LastWordsPayload {
  seat: Seat;
  text: string;
  skipped: boolean;
  cause: DeathCause;
  window: DeathWindow;
  claims?: Claim[];     // 0..n 条结构化声明（预言家遗言「公布全部查验」= 多条）
}
```

**为什么要 `claims[]` 而不是沿用单个 `claim`**：
1. 规则 §7.5 要求预言家遗言「公布**全部**查验（按轮次排序）」——单条字段装不下；
2. 规则 §9 已把遗言定性为「与 `speech` 同级的信息源」，AI 必须能据此决策
   （女巫用毒的「公开查杀」= research D13 的 ①、猎人开枪的「公开查杀」= FR-075），
   而 AI **不解析中文文本**（v1 research D6）；
3. `speech.claim?: Claim` 仍保留单条（v1 兼容，一次发言一个主张）；
   `last_words.claims?: Claim[]` 是多条形态，两者不冲突。

**取数口径（女巫/猎人共用）**：公开 claim 的并集 =
`speeches[].claim`（单条）∪ `lastWords[].claims`（多条），按**事件序**排序；
「最近一次公开查杀」= 并集中 `result==='werewolf'` 且在排序中**最后出现**的那条。

### 1.3 哪些东西**没有**事件（刻意的）

| 隐藏/交互事实 | 为什么没有事件 |
|---|---|
| **警徽预设**（`setBadgePreset`） | FR-026 / 规则 §5.7-10：只改隐藏字段，**不推进阶段、不产生事件、终局不回溯**。公开它等于告诉旁人「警长信任谁」 |
| 女巫药况（剩余瓶数） | 由 `witch_action` 历史派生；不单独立事件 |
| 狼队内部讨论/他人选择 | D77：狼队没有表决层，也没有互看字段 |
| 遮挡页 / 屏幕切换 | 表现层概念，不是对局事实（`contracts/hotseat-ui.md`） |
| 可读延时 / 动画 | UI 层 `setTimeout`，engine 无时间概念 |

---

## 2. 可见性投影规则

`eventsFor(seat)` 的过滤口径（广播语义，**不是**状态快照）：

| `visibility` | 投影给座位 `s` 的条件 |
|---|---|
| `public` | 恒可见（含观战者、死者） |
| `wolf-team` | `s.role === 'werewolf'`（含已死狼：观战不影响其历史可见性） |
| `seer-private` | `s.role === 'seer'` |
| `witch-private` | `s.role === 'witch'`（**永不对他人公开**，含终局） |
| `end` | `phase === 'game_over'` ∨ 载荷只关于 `s` 本人（`roles_dealt` 恒为全座位载荷 ⇒ 仅终局可见） |

**三条硬口径**：

1. `eventsFor(seat)` 是**纯过滤**，不做任何字段改写、不做聚合、不排序（顺序即日志顺序）。
2. 可见性判据只依赖「该座位的角色 + 当前阶段」，**不依赖**当前行动者、
   真人/AI 标记、或任何"谁在操作"的上下文——否则会出现「同一记录、不同客户端不同结果」。
3. 死者（观战）的投影与生前一致：狼死后仍收 `wolf-team`、预言家死后仍收 `seer-private`
   （他们本来就知道这些事实）。**没有**"死亡即闭麦"的过滤。

### 2.1 与 `viewFor` 的关系（两条同源通道）

| 通道 | 形状 | 消费者 | 用途 |
|---|---|---|---|
| `eventsFor(seat)` | 有序事件数组（过滤后） | UI 日志 | 叙事阅读（硬约束 4） |
| `viewFor(seat)` | 派生快照 `VisibleView` | AI 决策 + UI 面板 | 决策与当前状态展示 |

两者**必须同源**：`viewFor` 里出现的每个事实，都必须能由该座位可见的事件 + 公开状态推导出来；
反之，任何可见事件的事实都不允许在 `viewFor` 中缺失（否则 AI 会"看不见自己刚看到的事"）。
`tests/isolation.test.ts` 的"整局快照 × 全座位"用例负责这条一致性。

---

## 3. 序列化导出格式（FR-080 / SC-012）

```jsonc
// exportGame(): GameRecord —— 单 JSON 文档
{
  "schemaVersion": 2,
  "feature": "werewolf-v2",
  "config": { "seed": "demo-9p-1", "mode": "open", "humans": [3, 7] },
  "events": [
    // 按 seq 升序的完整事件数组（含隐藏事实：wolf_kill_decided / witch_action /
    // seer_check_completed / roles_dealt），每项含 type/seq/round/visibility
  ]
}
```

- 编码：UTF-8 JSON（单局内存态文档，非 JSONL）。
- **完整性判据**（SC-012）：`replay(record)` 能重建每局的发言顺序、投票结果、死亡顺序、
  警徽流转、终局原因，且 100% 一致。
- 导出通道：UI 终局页"导出整局记录"按钮 → Blob 下载 `.json`；
  测试中直接断言 `JSON.parse(JSON.stringify(exportGame()))` 与 `exportGame()` 深相等。
- **破坏性变更流程**：`schemaVersion` +1 并在本节登记；`feature` 同步改。
  v1 → v2 的变更：`seed` 提升为 `config`（含 mode/humans）、事件 11 → 19 类、
  4 值可见性 → 5 值。

---

## 4. 重放（`replay(record) → ReplayTimeline`）

**定位**：不是"还原引擎状态"，而是"把事件折叠成可核对的时间线"。它证明**记录自足**。

```ts
interface ReplayTimeline {
  roundCount: number;
  rounds: Array<{
    round: number;
    deaths: Array<{ seat: Seat; cause: DeathCause; window: DeathWindow }>;
    speeches: Array<{ seat: Seat; stage: 'day' | 'sheriff' | 'sheriff-pk'; skipped: boolean }>;
    lastWords: Array<{ seat: Seat; skipped: boolean }>;
    votes: Array<{ scope: VoteScope; tallyHalf: Record<Seat, HalfVote>; outcome: string }>;
    sheriff: { elected?: Seat | null; electReason?: SheriffElectReason;
               passed?: Array<{ from: Seat; to: Seat | null; reason: string }> };
    speechOrders: Array<{ start: Seat; direction: 'asc' | 'desc'; order: Seat[] }>;
    shots: Array<{ seat: Seat; target: Seat | null }>;
  }>;
  finalTable: Array<{ seat: Seat; role: Role; alive: boolean }>;
  winner: { faction: Faction; reason: VictoryReason } | null;
}

function replay(record: GameRecord): ReplayTimeline;
```

**实现要求**：

1. 纯函数，只吃 `GameRecord`，不 import 引擎的任何可变状态。
2. 对 `record.events` 的**单次线性扫描**完成折叠（O(n)，无回溯）。
3. 可由 `ReplayTimeline` 反查三件事：谁在什么时候说了什么（`speeches`/`lastWords`）、
   投了谁与结果（`votes`）、谁死了与为什么终局（`deaths`/`winner`）。
4. `replay` 与 engine 的**交叉校验**：同一局 `replay(engine.exportGame())` 的 `finalTable` /
   `winner` / 每轮 `deaths` 必须与 engine 实际状态一致（`tests/record-replay.test.ts`）。

---

## 5. 事件产出时机（与 data-model §5 转移表一一对应）

| 位置 | 产出（按序） |
|---|---|
| `startGame` | `game_started` → `night_started` → `roles_dealt` |
| 进夜（round+1） | `night_started` |
| `wolfKill` | `wolf_kill_decided`（→ 若女巫与预言家皆死，直接进夜结算） |
| `witchAction` | `witch_action` |
| `seerCheck` | `seer_check_completed` → 夜结算：`player_died`×0–2 →（判胜）`victory` → `game_over` |
| `dawn.confirm` | 无（死讯已在夜结算产出） |
| `lastWords`/`skipLastWords` | `last_words` |
| `badge_transfer.confirm` | `badge_passed` |
| `sheriffSignup` | `sheriff_signup`×n →（0/1 人边界）`sheriff_elected` |
| `speak`/`skip`（`sheriff_speak`） | `speech(stage:'sheriff')` →（退水）`sheriff_withdraw` →（边界）`sheriff_elected` |
| 竞选计票收齐 | `vote_cast`×n → `vote_result(scope:'sheriff')` → `sheriff_elected` |
| `sheriff_pk_speak` | `speech(stage:'sheriff-pk')` |
| PK 计票收齐 | `vote_cast`×n → `vote_result(scope:'sheriff-pk')` → `sheriff_elected` |
| `setSpeechOrder` | `day_speech_order` |
| `speak`/`skip`（`day_speak`） | `speech(stage:'day')` |
| 放逐计票收齐 | `vote_cast`×n（含 `weight`）→ `vote_result(scope:'exile')` →（放逐）`player_died` →（判胜）`victory` → `game_over` |
| `day_exile.confirm` | 无 |
| `hunterShoot` | `hunter_shot` →（命中）`player_died` →（判胜）`victory` → `game_over` |
| `hunterPass` | `hunter_shot{target:null}` |
| 判胜（任意结算点） | `victory` → `game_over`（**唯一**调用处，全代码一处） |

---

## 6. 事件流不变式（可对任意一局断言）

| # | 不变式 | 覆盖 |
|---|---|---|
| E1 | `seq` 从 1 连续递增，无重复、无空洞 | 所有用例 |
| E2 | `round` 非递减；每个 round 恰好一条 `night_started` | 昼夜流转 |
| E3 | `game_started` 首条；`victory` 与 `game_over` 末尾成对，且 `victory` 最多 1 条 | 终局 |
| E4 | 每个座位最多一条 `player_died`；`player_died` 总数 ≤ 9 | 死亡 |
| E5 | `badge_passed` 条数 ≤ `player_died` 条数（每次死亡最多一次移交） | 警徽 |
| E6 | 一局**恰 1 条** `sheriff_elected`（每局只竞选一次；PK 路径也只出一条结论），且竞选区间内 `player_died` = 0 | 竞选 |
| E7 | 三处投票的 `vote_cast` 条数 = 该轮 `voters` 数；`vote_result` 每条 scope 恰好一条 | 计票 |
| E8 | `speech(stage:'sheriff')` 条数 = 上警人数；`stage:'sheriff-pk'` 条数 = PK 人数 | 发言 |
| E9 | `hunter_shot` 条数 ≤ 1（板子只有 1 个猎人） | 猎人 |
| E10 | 任意事件不含 `time/timestamp/date/clock/now` 类键，数字量级不含 epoch 毫秒 | 复现 |
| E11 | `witch_action` / `seer_check_completed` / `wolf_kill_decided` 从不出现在非授权座位的投影里 | 隔离 |

---

## 7. 与 v1 的对照（迁移用）

| v1 | v2 | 变更性质 |
|---|---|---|
| 11 个具体 type | 19 个 | 新增 `witch_action` / `last_words` / `badge_passed` / `sheriff_signup` / `sheriff_withdraw` / `sheriff_elected` / `day_speech_order` / `hunter_shot`（共 8 个新 type；其中 `sheriff_signup` / `last_words` 与阶段同名，分属 `Phase` 与事件 `type` 两个命名空间，规则 §9 注已先例化） |
| `player_died{cause: 2 值}` | `{cause: 4 值, window}` + 暗牌无 `revealedRole` | 扩展 |
| `speech` 无 stage | `stage: 'day'\|'sheriff'\|'sheriff-pk'` | 扩展（缺省 `'day'` 以兼容旧记录） |
| `vote_cast` 无 weight | `weight: 1\|1.5` | 扩展 |
| `vote_result{tally, abstainCount, exiled, outcome}` | `{scope, tally, tallyHalf, abstainCount, totalHalf, maxHalf, outcome, tiedSeats?}` | **破坏**（`exiled` 移除，改由 `player_died` 表达） |
| `victory.reason: 2 值` | 3 值（`wolves-eliminated` / `gods-eliminated` / `villagers-eliminated`） | **破坏** |
| `game_over.finalTable`（6 项） | 9 项 + `badgeFlow` | **破坏** |
| `schemaVersion: 1` / `feature: 'werewolf-s0'` | `2` / `'werewolf-v2'` | **破坏** |
| 可见性 4 值 | 5 值（+`witch-private`） | 扩展 |
