# 契约：Engine 公开 API

**特性**: 001-werewolf-s0-slice | **模块**: `projects/werewolf/src/engine/`
**消费者**: `ui/`（人类输入）、`ai/`（决策）、`tests/`（裸驱动）、未来的复盘/知识库工具

本契约定义 engine 对外的全部公开面。未列出的成员一律视为模块私有。
engine 不 import react/DOM/ai/ui（硬约束 1），纯同步、确定性。

---

## 1. 生命周期与驱动

```ts
/** 从 idle 开始一局。seed 为 string（research D2）。 */
function createGame(seed: string, humanSeat?: never): Engine;
// S0 固定 1 真人：真人座位由发牌随机决定（FR-001），不作为参数。

interface Engine {
  /** 只读快照（浅冻结）。UI/测试不得直接改。 */
  readonly state: GameState;

  /** 提交一个动作。合法 → 推进并返回本次产出的事件；
      非法 → 状态不变，返回 Err<EngineError>（不 throw 裸异常）。 */
  dispatch(action: Action): GameEvent[] | Err<EngineError>;

  /** 当前等待谁的什么动作；game_over 或 idle 时为 null。
      这是 UI 决定"渲染哪种输入面板 / 是否自动推进 AI"的唯一依据。 */
  readonly pendingDecision: PendingDecision | null;

  /** 当前待决策的请求（kind / view / legalTargets / rng）；无待决策
      （idle / dawn / exile / game_over）时为 null。
      - 行动者解析：pendingDecision.actor 是座位就用它；是 'wolf-team'
        则取**存活狼中座位最小者**（确定性选择，research D6）；
      - rng 是 startGame 时创建的**唯一**随机流，随请求借出（research D3）：
        本方法不推进它、也不派生新流，decider 仅在本次决策内消费。
      这是驱动层构造 DecisionRequest 的唯一入口。 */
  decisionRequest(): DecisionRequest | null;

  /** 某座位的可见信息视图（人类渲染与 AI 决策共用，data-model §6）。 */
  viewFor(seat: number): VisibleView;

  /** 某座位可见的事件投影流（UI 日志渲染数据源，硬约束 4）。 */
  eventsFor(seat: number): GameEvent[];

  /** 完整事件日志（含隐藏事实），终局复盘/导出用（FR-009）。 */
  readonly eventLog: readonly GameEvent[];

  /** 序列化导出（格式见 event-stream.md §3）。 */
  exportGame(): GameRecord;
}
```

## 2. PendingDecision（驱动循环的枢纽）

```ts
interface PendingDecision {
  kind: 'wolf-kill' | 'seer-check' | 'speech' | 'vote';
  actor: number | 'wolf-team';   // 狼刀为狼队一个声音（research D6）
  legalTargets: number[];        // speech 时为 [actor]；vote 含自己，弃票由 abstain 表达
}
```

驱动循环（ui hook 与测试 helper 各持一份薄实现，~10 行）：

```
while (engine.pendingDecision !== null):
    行动者为真人 → 渲染输入面板，等待 dispatch（不调 decider）
    行动者为 AI  → req = engine.decisionRequest()   // rng 随请求借出 = 引擎唯一流
                   dispatch(decider(req))
pendingDecision 为 null（dawn/exile） → 自动 confirm（无人工确认交互）
phase = game_over                    → 终局结算渲染
```

> 实施期补充（T034，2026-10-18）：`decisionRequest()` 已落地，是驱动层
> 构造 `DecisionRequest` 的**唯一入口**——`rng` 由引擎借出，驱动层不得
> 自建随机流（research D3 单流口径）。

节奏（规则 §6）：纯 AI 阶段的"可读延时"由 **ui 层 setTimeout** 实现，
engine 恒为同步即时——可测性与复现不受延时影响。

## 3. 错误分类（EngineError.code）

| code | 触发 |
|---|---|
| `WRONG_PHASE` | 动作与当前 phase 不匹配（如非 night_wolf 提交 wolfKill） |
| `NOT_YOUR_TURN` | 行动者与 pendingDecision.actor 不符 |
| `ILLEGAL_TARGET` | 目标死亡 / 刀口为狼 / 查验自己 / 投票目标不存活 |
| `GAME_OVER` | 终局后提交任何动作 |

## 4. rng 模块契约（`src/rng/`）

```ts
interface Rng {
  /** [0, 1) 均匀浮点；一切随机性的底层原语 */
  next(): float64;
  /** 均匀整数 [minIncl, maxExcl) */
  int(minIncl: number, maxExcl: number): number;
  /** 均匀抽取一个元素（空数组抛错） */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates 洗牌，返回新数组（规则 §4.4 发牌即用它） */
  shuffle<T>(items: readonly T[]): T[];
}
function createRng(seed: string): Rng;   // mulberry32 + FNV-1a（research D1/D2）
```

约束：`engine/` 与 `ai/` 内出现 `Math.random` 即测试失败（自锁测试，见 plan T7）。

## 5. ai 模块契约（`src/ai/`）

```ts
/** 按角色返回决策器；纯函数，随机性仅经 req.rng */
function deciderFor(role: Role): Decider;
```

ai/ 对 engine 的依赖仅限类型与 `Rng` 接口；不得 import 引擎内部状态、
不得读 `eventLog`（只能读 `req.view`，FR-008）。
