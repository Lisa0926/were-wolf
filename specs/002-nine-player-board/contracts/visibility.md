# 契约：隐藏信息与可见性（信息隔离的唯一咽喉点）

**特性**: 002-nine-player-board | **模块**: `projects/werewolf/src/engine/view.ts`
**消费者**: `ui/`（渲染该座位可见的一切）、`ai/`（决策输入）、`tests/isolation.test.ts`（回归）

本契约冻结「**谁在什么时候能看到什么**」。它是 spec 中全部隔离类需求的唯一落点，
也是将来联机（规则 §11-2「客户端只拿投影」）时服务端唯一需要下发的形状。

**一句话原则**：一个事实只能经**两条同源通道**到达一个座位——
`viewFor(seat)`（快照）与 `eventsFor(seat)`（叙事）；没有第三条通道。

---

## 1. 三层隔离机制

| 层 | 机制 | 拦住什么 | 谁来保证 |
|---|---|---|---|
| **编译期** | `VisibleView` 的类型**不存在**「他人身份」「他人预设」「边计数」字段 | 让"读到隐藏信息"在写代码时就写不出来 | TypeScript（`tsc --noEmit` 通过） |
| **运行期** | `viewFor` / `eventsFor` 单一实现 + 条件字段 | 让"该出现的出现、不该出现的不出现"可被断言 | `tests/isolation.test.ts` |
| **结构性** | AI 的入参只有 `DecisionRequest{view, legalTargets, rng}` | AI 拿不到 `state` / `eventLog` / 别的座位视图 | `ai/` 的 import 白名单扫描（V26） |

> **反例（v1 已修过同类坑，v2 必须延续）**：若 `view.pending` 对**所有**座位都给出
> 「当前行动者是 N 号」，那么 `night_seer` 阶段就等于向全村广播「N 号是预言家」。
> 因此 `pending` **只在本人有行动权时出现**（data-model §2 的 `pending` 列已逐阶段标注）。

---

## 2. 隐藏信息清单（逐项：谁可见 / 存哪 / 泄露后果 / 需求编号）

| # | 信息项 | 谁知道 | 存储 / 通道 | 若泄露会怎样 | 需求 |
|---|---|---|---|---|---|
| **H1** | **全座位发牌表** | 终局前：**无人**（本人只知自己；狼额外知狼队）。终局：全体 | 引擎 `players[].role`；`roles_dealt` 事件 `visibility:'end'` | 一局直接失去推理意义 | FR-001、FR-002、FR-005、FR-063 |
| **H2** | **狼队身份**（谁是狼队友） | 每只狼（含已死狼观战）；好人不知 | `view.teammates`（仅 `role==='werewolf'`，含自己） | 好人知道狼队 = 直接算票 | FR-005、FR-066 |
| **H3** | **狼刀口**（本夜杀谁） | 狼队（`wolf_kill_decided` → `wolf-team`）；**女巫**在自己行动回合知道座位号；其他人不知 | 引擎 `night.wolfTarget`；`view.knifeTarget`（仅女巫 ∧ `phase==='night_witch'`） | 知道刀口 = 知道狼队意图，白天发言/投票全裸 | FR-009、FR-010、FR-066 |
| **H4** | **预言家查验**（目标 + 结果） | **仅预言家本人**；他人只能靠其公开发言（`claim`）得知 | `view.seerChecks`（仅 `role==='seer'`，含历史）；`seer_check_completed` → `seer-private` | 查验公开 = 预言家不用跳身份也能带队 | FR-016、FR-066、SC-009(b) |
| **H5** | **女巫用药**（用没用 / 用哪种 / 目标） | **仅女巫本人**；他人永远看不到（含终局）；`GameRecord` 里有（供复盘/测试） | 引擎 `night.witch` + `potions`；`view.myPotions`（仅女巫）；`witch_action` → `witch-private`（永不公开） | 解药目标 = 刀口；毒药目标 = 女巫的独立击杀 → 等于公开女巫 | FR-010、FR-011、FR-012、FR-066 |
| **H6** | **女巫剩余药量** | 仅女巫本人 | `view.myPotions.antidote/poison`（仅女巫） | "还有几瓶解药"直接决定狼队要不要继续刀神 | FR-010 |
| **H7** | **警徽预设**（生前接班人） | **仅警长本人**；AI 警长的预设连它自己也不需要"知道"（纯函数求值）；**终局不回溯公布** | 引擎 `sheriff.badgePreset`；`view.myBadgePreset`（仅 `you.seat === sheriff.seat`）；**无事件** | 旁人知「警长信任谁」= 免费拿到一条金水关系 | FR-025、FR-026、FR-090、SC-009(c) |
| **H8** | **暗牌局死者身份** | 终局前：**无人**（含观战者、含 AI）；终局：全体 | `view.players[].revealedRole` **仅在 `mode==='open'` 或 `phase==='game_over'` 时存在**；`player_died.revealedRole` 同理 | 暗牌局退化为明牌局 | FR-063、FR-064、FR-065 |
| **H9** | **边计数 /「哪条边快被屠尽」** | 无人可获得（引擎不提供任何聚合） | `VisibleView` 无 `faction` / `edge` 聚合字段；UI 不得自行统计（评审项） | 暗牌局泄漏屠边进度 → 狼队可精确抢边 | FR-064、SC-009(b) |
| **H10** | **猎人开枪意图 / 可开枪性** | 意图：开枪前**仅本人**（遗言里可主动公开"我要打 X"）；可开枪性：本人（由死因决定） | `view.myDeathCause`（仅死者本人）；`hunter_shot` 事件在动作提交后才公开 | 提前知道猎人要打谁 → 投票/发言被操纵 | FR-033、FR-035、FR-073 |
| **H11** | **狼队内部他人选择** | **同队狼之间也不互看**（D77 明文）；只有代表座位能提交 | 无任何字段承载；`pending` 只出现在代表座位 | 多人共机下等于"亮牌商量"，破坏一队一个声音的边界 | FR-009 + D77 |
| **H12** | **「现在轮到谁」**（推测性泄漏） | 只有当前行动者本人（`view.pending`）；其他座位不出现 | `view.pending` 仅当「本人存活 ∨ 本人是遗言/开枪阶段的死者」∧ 本人是行动者 | `night_seer` 阶段的 pending = 广播预言家座位号 | FR-005、FR-066 |
| **H13** | **死因 `cause`** | **公开**（含在 `player_died` 与 `last_words` 载荷里，规则 §9 的字段扩展即为公开口径） | 事件载荷 | ⚠️ **残留泄漏**：`cause='poison'` 等于公开「女巫毒了这名死者」。规则文档未表态，见 plan 报告「spec 缺口」；若要收紧要改 `eventsFor` 做字段级剥离 | FR-015（口径）、FR-017 |
| **H14** | **真人 / AI 标记** | **公开**（局前配置本来就公开：谁是真人是玩家自己选的） | `players[].isHuman` | 不视为隐藏信息 | FR-003 |

> **H13 的取舍已定案**：本轮采用「`cause` 公开」，因为 (a) 规则 §9 明确要求 `player_died`
> 扩展 `cause` 四值、`last_words` 载荷也含 `cause`；(b) 死亡数 + 同夜只用一瓶 已能反推出
> 大部分死因。若 Lisa 要求收紧，改动点只有一处：`eventsFor` 对 `player_died` 剥离 `cause`
> （`witch_action` 本来就永不公开），不需要动任何规则判定。

---

## 3. 角色 × 信息矩阵

| 信息项 | 狼人 | 预言家 | 女巫 | 猎人 | 村民 | 死者（观战） | 导出记录 |
|---|---|---|---|---|---|---|---|
| H1 全座位身份 | 仅狼队 | 仅自己 | 仅自己 | 仅自己 | 仅自己 | 同生前 | 全量 |
| H2 狼队身份 | ✔ 全部狼 | ✘ | ✘ | ✘ | ✘ | 同生前（死后仍是狼视野） | 全量 |
| H3 狼刀口 | ✔ | ✘ | ✔（仅自己回合） | ✘ | ✘ | 同生前 | 全量 |
| H4 预言家查验 | ✘ | ✔ 全部历史 | ✘ | ✘ | ✘ | 同生前 | 全量 |
| H5 女巫用药 | ✘ | ✘ | ✔ | ✘ | ✘ | 同生前 | 全量 |
| H6 药量 | ✘ | ✘ | ✔ | ✘ | ✘ | 同生前 | 全量 |
| H7 警徽预设 | 仅当本人是警长 | 仅当本人是警长 | 仅当本人是警长 | 仅当本人是警长 | 仅当本人是警长 | 若死者曾是警长：仍可见自己的预设 | 全量（仅复盘） |
| H8 暗牌死者身份 | ✘（终局前） | ✘ | ✘ | ✘ | ✘ | ✘（观战者也不翻牌） | 全量 |
| H9 边计数 | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ | 可派生 |
| H10 开枪意图 | 仅当本人是猎人 | 仅当本人是猎人 | 仅当本人是猎人 | ✔ | 仅当本人是猎人 | 遗言公开后才人人可见 | 全量 |
| H11 队友选择 | ✘（含队友之间） | — | — | — | — | — | 无此数据 |
| H12 当前行动者 | 仅代表座位 | 仅自己回合 | 仅自己回合 | 仅自己回合 | 仅自己回合 | 仅遗言/开枪回合 | 全量 |
| H13 死因 | 公开 | 公开 | 公开 | 公开 | 公开 | 公开 | 公开 |

**「同生前」的含义**：死亡不改变可见性过滤（H1/H2/H4/H5 该看到的历史仍然看得到），
但死亡会**取消常规行动权**（FR-024 例外：遗言与开枪仍属死者）。

---

## 4. `VisibleView` 完整形状（v2）

```ts
interface VisibleView {
  round: number;
  phase: Phase;
  mode: Mode;

  you: { seat: Seat; role: Role; alive: boolean };

  /** 按座位升序，长度恒 9（idle 时为空数组） */
  players: Array<{
    seat: Seat;
    alive: boolean;
    isHuman: boolean;
    revealedRole?: Role;        // 仅 mode==='open' 的死者，或 phase==='game_over'
  }>;

  sheriff: { seat: Seat | null; badgeLost: boolean };
  candidates: Seat[];           // 当前有效候选人（已扣退水）
  withdrawn: Seat[];            // 已退水

  speeches: Array<{ round: number; seat: Seat; text: string; claim?: Claim;
                    stage: 'day' | 'sheriff' | 'sheriff-pk' }>;
  lastWords: Array<{ round: number; seat: Seat; text: string;
                     window: DeathWindow; claims?: Claim[] }>;
  voteResults: Array<{ round: number; scope: VoteScope;
                       tally: Record<Seat, number>;       // 展示值（0.5 步进）
                       abstainCount: number;
                       outcome: 'unique' | 'tie' | 'all-abstain' }>;
  speechOrder?: { round: number; start: Seat; direction: 'asc' | 'desc'; order: Seat[] };

  /** 仅当本人有行动权时出现（防推测性泄漏，H12） */
  pending?: { actor: Seat | 'wolf-team'; kind: PendingKind };

  // —————— 以下字段按角色/条件存在；类型里不存在"他人的同名信息" ——————
  teammates?: Seat[];                                    // 仅 werewolf（含自己）
  wolfRep?: Seat;                                        // 仅 werewolf（D77 代表座位）
  seerChecks?: Array<{ round: number; target: Seat; result: 'good' | 'werewolf' }>;  // 仅 seer
  myPotions?: { antidote: boolean; poison: boolean };     // 仅 witch
  knifeTarget?: Seat;                                     // 仅 witch ∧ phase==='night_witch'
  myBadgePreset?: Seat | null;                            // 仅 you.seat === sheriff.seat
  myDeathCause?: DeathCause;                              // 仅本人已死
}
```

**类型层的三个「写不出来」**：

1. 没有 `players[].role`（只有 `revealedRole`，且带存在条件）⇒ 无法表达「他人存活身份」。
2. 没有 `badgePreset` / `othersPresets` ⇒ 只有 `myBadgePreset`，无法表达「他人预设」。
3. 没有 `factionCounts` / `edgeStatus` / `aliveWolves` ⇒ 无法表达「边计数」（H9）。

---

## 5. 逐字段投影规则（`viewFor(seat)` 的唯一实现口径）

| 字段 | 出现条件 | 数据来源 | 需求 |
|---|---|---|---|
| `round` / `phase` / `mode` | 恒 | state | — |
| `you` | 恒 | `players[seat]` | FR-005 |
| `players[].seat/alive/isHuman` | 恒 | state | FR-003 |
| `players[].revealedRole` | `mode==='open'` ∧ 该玩家已死，或 `phase==='game_over'` | `players[].role` | FR-063 |
| `sheriff` | 恒 | state.sheriff 的公开部分（`preset` 不在其中） | FR-089 |
| `candidates` / `withdrawn` | 恒（无竞选时为空数组） | election 派生（公开事实） | FR-085 |
| `speeches` | 恒（只收 `skipped===false`） | 日志 `speech` 投影 | FR-022/056/079 |
| `lastWords` | 恒（含 `claims`，`skipped` 为真的没内容） | 日志 `last_words` 投影 | FR-022、FR-073 |
| `voteResults` | 恒 | 日志 `vote_result` 投影 | FR-049 |
| `speechOrder` | 已定过序 | 日志 `day_speech_order` | FR-054 |
| `pending` | 本人是当前行动者（含狼队代表）；或本人是 `last_words`/`hunter_shoot` 阶段的死者 | `pendingDecision` + `resolveWolfTeamRep` | FR-083、H12 |
| `teammates` | `you.role==='werewolf'` | state（狼队名单，含自己） | FR-005 |
| `wolfRep` | `you.role==='werewolf'` | `resolveWolfTeamRep` | D77 |
| `seerChecks` | `you.role==='seer'` | 日志 `seer_check_completed`（**只取自己的**） | FR-016 |
| `myPotions` | `you.role==='witch'` | state.potions | FR-010 |
| `knifeTarget` | `you.role==='witch'` ∧ `phase==='night_witch'` | `night.wolfTarget` | FR-010 |
| `myBadgePreset` | `you.seat === sheriff.seat` | state.sheriff.badgePreset | FR-026/090 |
| `myDeathCause` | `you.alive === false` | `players[seat].death.cause` | FR-033/091 |

**「只取自己的」为什么重要**：`seerChecks` 若从日志里按 `visibility` 过滤而不按座位过滤，
预言家会看到**所有**查验事件——v2 只有 1 个预言家所以暂时等价，但这是错误的口径，
一旦将来支持多预言家板子就会泄漏。v2 的实现必须按 `ev.seat === seat`（用 `target` 归属到本人）
再过滤一次（`tests/isolation.test.ts` 加一条断言：非预言家 `seerChecks` 键不存在，
且预言家的 `seerChecks.length` = 自己的查验次数）。

---

## 6. 隔离类需求的逐条落点（FR 对账）

| FR | 要求（摘要） | 落点 | 断言 |
|---|---|---|---|
| FR-005 | 只能看自己身份；狼看全部队友 | `you.role` / `players[].revealedRole` 条件 / `teammates` | 非狼视图无 `teammates`；存活者无 `revealedRole` |
| FR-016 | 查验结果仅预言家可见 | `seerChecks` 条件字段 + `seer-private` | 狼/女巫/村民视图无 `seerChecks` |
| FR-025/026 | 预设仅本人可见、无公开记录、终局不回溯 | `myBadgePreset` 条件字段 + 无事件 | 全事件扫描无 `badgePreset`/`preset` 键；他人视图无该键 |
| FR-064 | 暗牌局不泄漏边计数 | 视图无聚合字段 | 递归扫描 `VisibleView` 键名，无 `faction/edge/count/wolves/gods/villagers` 类聚合键 |
| FR-066 | AI 只用可见信息 | `DecisionRequest` 唯一入参 | `ai/` import 白名单；决策函数签名不接受 state |
| FR-083 | 只接受当前行动者的操作 | engine `NOT_YOUR_TURN` + `pending` 只在行动者出现 | 每个 kind 一条拒绝用例 |
| FR-085/086 | 竞选界面只列候选人与退水名单 | `candidates` / `withdrawn` / `sheriff` | 退水者立刻从 `candidates` 消失且出现在 `withdrawn` |
| FR-090 | 预设控件只对警长本人可见 + 目标已出局的警示 | `myBadgePreset` + UI 判定（目标 `alive===false`） | 警长视图有该键；非警长无 |
| FR-063/065 | 明牌翻牌 / 暗牌不翻 / 遗言不改变口径 | `players[].revealedRole` 条件 | 暗牌局 `revealedRole` 在终局前恒缺省；有遗言的死者也不翻牌 |
| SC-009 | (a) 真人切换遮挡页 (b) 暗牌 AI 不引用未公开身份 (c) 预设 0 次公开 | 见 `contracts/hotseat-ui.md` §4/§6 + 本节 | 三条各自一条用例 |

---

## 7. 泄漏回归清单（`tests/isolation.test.ts` 必须覆盖的断言形状）

1. **三模板**：狼 / 预言家 / 女巫 / 猎人 / 村民 五种视图的**键集合**精确断言（多一个键就失败）。
2. **键集合闭包**：`Object.keys(view)` 与契约 §4 的白名单逐字相等；`players[]` 元素键集合亦然。
3. **无聚合泄漏**：递归扫描全部键名与数值，不存在边计数、阵营计数、存活狼数。
4. **预设隔离**：构造「警长设了预设」的局面，断言：`eventsFor` 无任何预设记录、
   `viewFor(非警长).myBadgePreset === undefined`、`exportGame()` 里也**没有**预设字段
   （预设只存在于引擎 `state`，不进日志 ⇒ 复盘也拿不到）。
5. **暗牌隔离**：`mode='dark'` 下，整局任意时刻 `players[].revealedRole` 仅在终局出现；
   终局后全员出现。
6. **pending 反推测**：`night_seer` 阶段，非预言家座位的 `view.pending === undefined`
   （这是 v1 修过的坑，v2 必须保留断言）。
7. **DecisionRequest 深检**：`JSON.stringify(req)` 里不出现他人 `role`、不出现 `badgePreset`、
   不出现 `potions`（除非本人是女巫）。
8. **同源一致性**：整局每步快照 × 9 座位：`viewFor` 里的事实都能由该座位可见事件推导
   （反之亦然）。
9. **女巫窗口**：`knifeTarget` 只在 `phase==='night_witch'` ∧ 本人是女巫时存在；
   进入 `night_seer` 后立刻消失。
