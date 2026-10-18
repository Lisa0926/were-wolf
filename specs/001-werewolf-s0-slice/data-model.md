# 数据模型：狼人杀 S0 垂直切片

**特性**: 001-werewolf-s0-slice | **日期**: 2026-10-18
**规则唯一事实来源**: `projects/werewolf/docs/游戏规则.md`（冲突以其为准）

类型均以 TypeScript 表达，落位 `projects/werewolf/src/engine/types.ts`
（视图类型同目录，事件类型见 [contracts/event-stream.md](contracts/event-stream.md)）。

---

## 1. 实体（对应 spec 的 Key Entities 节）

### 1.1 角色 Role 与阵营 Faction

```ts
type Role = 'werewolf' | 'seer' | 'villager';
type Faction = 'wolves' | 'good';
const BOARD: readonly Role[] = ['werewolf','werewolf','seer','villager','villager','villager'];
// 规则 §2：狼2 / 预言家1 / 村民3（好人共 4）
factionOf(role): werewolf→wolves；seer/villager→good
```

### 1.2 玩家 PlayerState

```ts
interface PlayerState {
  seat: 1|2|3|4|5|6;          // 座位固定 1–6
  role: Role;                  // 发牌后不可变
  isHuman: boolean;            // 恰好 1 个真人席位
  alive: boolean;
  death?: { cause: 'night-kill' | 'exile'; round: number };  // 死亡记录
}
```

### 1.3 阶段 Phase（枚举与规则 §4.1 完全一致，不增不减）

```ts
type Phase =
  | 'idle'        // 未开始
  | 'night_wolf'  // 夜·狼刀
  | 'night_seer'  // 夜·查验（预言家已死则跳过）
  | 'dawn'        // 天亮·死讯+翻牌
  | 'day_speak'   // 白天·按座次发言
  | 'vote'        // 投票
  | 'exile'       // 放逐结算
  | 'game_over';  // 终局
```

轮次编号 `round: number`：首夜 = 1；`round` 对应"第 N 夜/第 N 白天"同一编号。

### 1.4 对局 GameState（engine 内部完整状态，含所有事实）

```ts
interface GameState {
  phase: Phase;
  round: number;                 // 从 1（首夜）递增
  players: PlayerState[];        // 按座位升序，长度恒 6
  seed: string;                  // 本局种子（导出/复现用）
  speech: { day: number; order: number[]; cursor: number };  // 本轮发言：存活座次序列 + 游标
  votes: Partial<Record<seat, seat | 'abstain'>>;            // 本轮已收选票
  nightKill?: seat;              // 本轮刀口工作数据（转移 2 决定 → 转移 3 进 dawn 时结算消费；
                                 // 与 votes 同级的"本轮数据，历史在日志"模式。实现期补，2026-10-18）
  winner?: { faction: Faction; reason: 'wolves-eliminated' | 'wolves-parity' };
}
```

派生事实（不重复存储，避免双账漂移）：
- 存活名单 = `players.filter(alive)`
- 预言家查验史、发言史、历轮计票 —— 全部从事件日志派生（唯一事实在日志）

### 1.5 引擎持有的非状态成员（不序列化进 GameState）

```ts
class Engine {
  private state: GameState;
  private rng: Rng;              // 唯一随机流实例（D3）
  private log: GameEvent[];      // 完整事件日志（含隐藏事实，D4）
}
```

---

## 2. 动作 Action（外部输入的唯一形态）

```ts
type Action =
  | { type: 'startGame'; seed: string }
  | { type: 'wolfKill';   target: seat }     // 狼队一个声音（research D6）
  | { type: 'seerCheck';  target: seat }
  | { type: 'speak';      text: string; claim?: Claim }
  | { type: 'skip' }
  | { type: 'castVote';   target: seat }     // 可投自己
  | { type: 'abstain' }
  | { type: 'confirm' };                     // dawn / exile 的推进确认
```

> **实现期补充（2026-10-18）**：speak / skip / castVote / abstain 四种动作
> 实际带可选 `actor?: seat` 字段——否则 `NOT_YOUR_TURN` 校验在结构上
> 不可判定（契约 §3 要求该错误码）。省略时引擎按 `pendingDecision`
> 的行动者处理，向后兼容。

非法动作（未通过前置校验、阶段不符、行动者不符）→ 返回类型化错误
`EngineError { code, message }`，**状态不变、不产生事件**。
UI 侧只展示合法目标（预防），引擎校验为最终防线（兜底）。

---

## 3. 状态机转移表（逐行映射规则 §4.2，唯一实现依据）

| # | 当前状态 | 动作 | 前置校验（引擎逐条执行） | 下一状态 | 产出事件 |
|---|---|---|---|---|---|
| 1 | idle | `startGame({seed})` | seed 为 string（空串合法，FNV-1a 稳定哈希） | night_wolf (round=1) | `game_started`、`roles_dealt`（隐藏） |
| 2 | night_wolf | `wolfKill(target)` | target 存活 **且** `role ≠ werewolf` | 预言家存活 → night_seer；预言家已死 → dawn | `wolf_kill_decided`（狼队可见） |
| 3 | night_seer | `seerCheck(target)` | target 存活、**target ≠ 预言家自己**；重复验同一人**合法**（§4.2 注） | dawn | `seer_check_completed`（预言家可见） |
| 4 | dawn | `confirm` | —（死讯+翻牌已在进入 dawn 的结算中产出，见 §4） | day_speak（首位存活者起，按座次） | — |
| 5 | day_speak | `speak(text)` / `skip` | 行动者 = 当前游标座次；text 可为空串 | 有下一位存活者 → 游标+1；全员说完 → vote | `speech`（公开） |
| 6 | vote | `castVote(target)` / `abstain` × 存活者数 | target 为存活者（**可投自己**）；**可弃票**；行动者按座次轮到 | 收齐最后一张 → 计票 → exile | `vote_cast`（公开）× n，收齐时 `vote_result`（公开） |
| 7 | exile | `confirm` | — | **胜负判定**：狼=0 → game_over(好人胜)；狼≥好 → game_over(狼胜)；否则 → night_wolf (round+1) | `player_died`(若有放逐，在计票结算时产出)、`victory`、`game_over` |

补充口径（都来自规则原文，无新增）：

- 转移 2 → 预言家已死直跳 dawn = **FR-006**（§4.5 第 1 行）。
- 转移 4 的 `confirm` 与转移 7 的 `confirm` 在驱动层**自动推进**（S0 无人工确认交互），
  但在转移表中保留为显式步骤，测试可直接对 transition 函数打点。
- 转移 7 胜负判定为**存活口径**，在每次死亡结算后立即执行（见 §4.3 时机说明）。

## 4. 结算与判定规则（规则 §4.3 的实现落点）

| 规则 | 实现落点 |
|---|---|
| 夜晚结算：刀口立即死亡，无救治 | **进入 dawn 时**结算（无论经转移 3 正常路径，还是转移 2 预言家已死的直跳路径，同一结算点）：标记死亡、产出 `player_died`（含 revealedRole，死亡即翻牌）、立即判定 |
| 放逐结算：得票最多者放逐并翻牌；平票=平安日；全员弃票=平安日 | 转移 6 收齐时计票：max 唯一 → 放逐（`player_died` cause='exile'）；max 并列或 0 票 → 无人放逐（outcome='tie'/'all-abstain'） |
| 判定时机：每次死亡结算后立即（存活口径） | `checkVictory(state)`：狼=0 → 好人胜；狼 ≥ 好 → 狼胜。在**每处** `player_died` 产出后立即调用：夜刀结算点、放逐结算点。触发即跳 game_over，不再进入下一阶段 |
| game_over 展示 | `game_over` 事件携带全员身份与存活终表 |

推演自检（对齐 §2 节奏推演，好人总数 4）：首夜刀 1 好 → 2狼3好（不触发）；
白天放逐 1 好 → 2狼2好 → 狼胜（1 夜 1 日）；好人最快 2 夜 2 日（§2 原文路径）。

## 5. 边界情形映射（规则 §4.5 → 实现口径）

| 情形 | 实现口径 |
|---|---|
| 预言家已死 | 转移 2 直接 night_wolf → dawn（无 night_seer 停留） |
| 真人死亡 | `pendingDecision` 永不再指向该座位；UI 对真人置 spectator 态（输入禁用、公开日志继续）；**投影不变**（死者仍只见公开信息 + 自己已知信息，FR-007） |
| 死者座次 | 发言 order / 投票轮转 / 刀口与查验目标校验，一律以 `alive` 为口径过滤 |
| 平票反复 | 转移 7 判定不触发 → night_wolf(round+1)，无循环上限 |
| 全员弃票 | 计票 0 票 → 与平票同路：outcome='all-abstain'，无人放逐 |

---

## 6. 可见信息视图 VisibleView（信息隔离的唯一咽喉点）

`viewFor(seat)`：由**完整状态 + 事件日志投影**生成，狼/预言家/村民三种模板。
人类与 AI 消费同一投影（research D4）。

```ts
interface VisibleView {
  round: number; phase: Phase;                    // 公开节奏
  you: { seat: number; role: Role; alive: boolean };
  players: Array<{ seat: number; alive: boolean; isHuman: boolean;
                   revealedRole?: Role }>;         // 仅死者有 revealedRole（死亡即翻牌）
  // —— 以下字段按角色条件存在，类型层不存在任何"他人隐藏身份"字段 ——
  teammates?: number[];                           // 仅 werewolf：狼队座位
  seerChecks?: Array<{ target: number; result: 'good'|'werewolf'; round: number }>;
                                                  // 仅 seer：自己的查验史
  speeches: Array<{ round: number; seat: number; text: string; claim?: Claim }>;
  voteResults: Array<{ round: number; tally: Record<seat, number>;
                       abstainCount: number; exiled: number | null;
                       outcome: 'exile'|'tie'|'all-abstain' }>;
  pending?: { actor: number | 'wolf-team'; kind: 'wolf-kill'|'seer-check'|'speech'|'vote' };
}
```

**结构性隔离**：`VisibleView` 的类型本身无法表达"他人存活角色的明文"——
隔离在编译期即部分成立；运行期再由投影测试锁定（见 plan 测试布局 T5）。

## 7. AI 决策接口（ai/ 对 engine 的全部依赖）

```ts
interface DecisionRequest {
  kind: 'wolf-kill' | 'seer-check' | 'speech' | 'vote';
  view: VisibleView;          // 决策输入唯一来源（FR-008）
  legalTargets: number[];     // 引擎算好的合法目标（vote 含"自己"与 abstain 语义）
  rng: Rng;                   // 单流借出（research D3），仅本次决策内使用
}
type Decider = (req: DecisionRequest) => Action;
```

AI 策略按角色 × 阶段实现（规则 §5 策略表逐行落实，含：狼不投队友、
预言家跳身份公布最新查验、村民站边跳出的预言家、有查杀投查杀否则随机）。
策略函数是 `(req) => Action` 的纯函数（随机性全部经 `req.rng`）。

## 8. 数据校验规则（来自需求）

| 来源 | 校验 | 落点 |
|---|---|---|
| FR-001 | 发牌恰好 2/1/3，座位随机 | startGame 断言 BOARD 多重集；测试跑 1000 seed |
| FR-002 | 禁刀狼队友；禁自验；查验二值 | 转移 2/3 前置校验 |
| FR-003 | 死亡即翻牌；判定即时 | `player_died.revealedRole`；`checkVictory` 调用点 |
| FR-005 | 可投自己/可弃票/平票与全弃平安 | 转移 6 计票逻辑 |
| FR-008 | 决策输入仅 VisibleView | DecisionRequest 类型 + 投影测试 |
| FR-010 | 单流复现 | Engine 持唯一 Rng；同 seed 重放断言事件日志全等 |
