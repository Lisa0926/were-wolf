# 研究记录：狼人杀 v2 · 9 人局扩展

**特性**: 002-nine-player-board | **日期**: 2026-10-18 | **状态**: Phase 0 完成

## 输入盘点（无外部未知项，无 NEEDS CLARIFICATION）

技术上下文**没有** NEEDS CLARIFICATION：板子（3 狼 + 预言家 + 女巫 + 猎人 + 3 村民）、
18 阶段、19 类事件、1.5 票口径、死亡结算链、AI 策略、明暗牌、真人 1–9、
技术栈（TS5 + Vite + React 18 + Vitest）全部已由 Lisa 定案，落点在
`docs/游戏规则.md`（v2，§12.2 明示「无未定项」）与本特性 `spec.md`（97 FR / 13 SC / 39 场景）。

因此本研究**不做外部技术调研**，只对**实现级设计决策**逐条给出
「决策 / 理由 / 备选方案与被否理由」，供 plan / data-model / contracts 直接引用。

三条已定口径（**D77 / D78 / D79**，见 `docs/决策与待办.md`）在本阶段首次落成技术方案，
分别对应 D8 / D9 / D9（下文逐条展开）；它们同时是规则文档 §5.4 与 §8-9 的**收窄**，
需回改规则文档（见报告「与 spec 的偏差」）。

**迁移基线**：v1 代码现状 = `src/` 6 + 2 + 4 + 2 个文件、`tests/` 10 文件 **125 用例全绿**
（本次实测 `125 passed`）。v2 迁移策略见 D11。

---

## D1. 18 阶段状态机的组织：阶段规格表 + 纯转移函数 + 门面

**决策**：`engine/` 内分三层，职责单向：

1. **阶段规格表** `phases.ts`：`PHASES: Record<Phase, PhaseSpec>`，18 项，每项声明
   `actor(state)` / `legalTargets(state, actor)` / `accepts(action)` / `enter(state)`。
   「谁行动、能选谁、接受哪些动作」全部是**数据**，不是 if 分支。
2. **纯转移函数** `transition.ts`：`transition(state, action, ctx) → {state, events} | {error}`，
   按 `action.type` 分派到 17 个动作处理器；处理器只读 `PHASES[state.phase]` 做校验，
   再产出「新状态 + 事件 + 下一阶段」。
3. **门面** `engine.ts`：唯一持有 Rng 与事件日志，暴露 `dispatch / viewFor / eventsFor /
   decisionRequest / exportGame`。不 import react/DOM/ai/ui。

**理由**：

- 规则 §5.2 的转移表是**18 行 × 显式校验**，规格表能让「代码条目数 = 规则行数」可逐行对账；
  单一大 switch 会让 18 阶段 × 17 动作散成 306 个分支，无法核对，也无法在 review 时发现漏项。
- 纯函数层让测试不经过门面直接打转移表（v1 已验证有效：`tests/phases.test.ts` 16 例）。
- 门面保持 v1 形态，`ui/` 与 `tests/` 的驱动循环几乎不用改（迁移成本最低）。
- 零 DOM、零全局、零单例 ⇒ 同一份代码能被 Vitest 裸驱动、能被 Node 服务端直接 import（联机预留，规则 §11）。

**备选方案**：

- **单一大 switch（`switch (state.phase)` 再嵌 `switch (action.type)`）**：规则可读性最强的错觉，
  实际是 306 分支的散射；新增一个阶段要动 4 处（校验、事件、pending、驱动），漏一处就是静默 bug。弃。
- **每阶段一个类 + 事件总线（命令模式）**：18 个类 + 注册表 + 中间件，为「将来可能插件化」付出代价，
  而本项目板子固定（spec「板子固定，不提供配置项」）⇒ 投机性抽象。弃。
- **引入 XState 等状态机库**：状态图表达力强，但 (a) 与「动作/事件纯 JSON」的既有口径要另做序列化层，
  (b) 拒绝非法动作的类型化错误码要自己包一层，(c) 新增运行时依赖（v1 零运行时依赖是刻意选择）。弃。
- **纯 reducer 无门面**：rng 借出、日志累积、投影全部外推给调用方，UI/测试各写一份，双账易漂移。弃。

---

## D2. 死亡结算链：显式队列 + `ChainResume` + `step` 子状态机

**决策**：把规则 §5.3 的 `settlePoint` / `afterDeath` 落成**可序列化的显式队列**，不做递归：

```ts
interface DeathRecord {
  seat: Seat;
  cause: 'night-kill' | 'poison' | 'exile' | 'hunter-shot';
  round: number;
  window: 'first-night' | 'night' | 'day';   // 死亡时点窗口（决定遗言权）
  wasSheriff: boolean;                        // 死亡瞬间是否在位警长（快照）
  revealed: boolean;                           // 本次死讯是否公开身份（明/暗牌）
}
interface SettlementState {
  queue: DeathRecord[];        // queue[0] = 当前处理中的死者；空 = 链条结束
  window: DeathWindow;         // 本结算点窗口（枪杀新死者继承）
  resume: ChainResume;         // 链条结束后的去向：'first-night' | 'day-after' | 'next-night'
  step: 'last-words' | 'badge' | 'shoot';  // 当前死者的下一段
  badgeDirect?: Seat | null;   // 遗言里显式给出的警徽目标（null = 明确作废；undefined = 未指定）
}
```

**推进规则**（`chain.ts: advanceChain(state)`，纯函数，每次 dispatch 后调用一次）：

```text
if queue 为空 → phase = resolveResume(state)     # ★ 链条跑完才解析，见下
                 （'first-night' → sheriff_signup；'day-after' → 有存活警长 ? day_order : day_speak；
                   'next-night' → night_wolf，round+1 并产 night_started）
d = queue[0]
step = 'last-words': 有遗言权 → phase='last_words'（actor = d.seat），停
                     无遗言权 → step='badge'，继续
step = 'badge':      d.wasSheriff → phase='badge_transfer'（系统，需 confirm），停
                     否则 → step='shoot'，继续
step = 'shoot':      d 是猎人且 d.cause ∈ {night-kill, exile} → phase='hunter_shoot'，停
                     否则 → 弹出 queue[0]，step='last-words'，回到开头
```

**枪杀新死亡的插入方式**：`hunterShoot` 命中 → 先按「另一个结算点」记录死亡 + 判胜，
未判胜则 **`queue.unshift(newDeath)`**，`step='last-words'`。由于队首插入 = 深度优先，
「被枪打中者的遗言先处理完，再轮到队列下一位死者」是**结构保证**，不依赖调用顺序的巧合。

**理由**：

- 遗言（文本）、开枪（目标）都需要**人类或 AI 输入**，一次性递归跑完整条链在结构上不可能；
  必须能在段与段之间暂停。显式队列 = 暂停点天然存在。
- **`resume` 存「规则」不存「阶段」**：若在入链时就把 `resumeAfter` 算成具体阶段，
  「警长当夜被刀」这一常见局面会算错——入链时 `sheriff.seat` 还是死者，出链时已换人或已流失。
  因此存 `ChainResume` 三元枚举，等队列清空后再 `resolveResume()`。
- 队列、`step`、`resume`、`window` 全是纯 JSON ⇒ 「动作/事件/状态可原样传输」（规则 §11-3）、
  可在任意段做快照断言、可在测试里只推进一段而不跑完整局。
- `wasSheriff` 做**死亡瞬间快照**，解决一个真实陷阱：同夜双死（刀 A、毒 B）时 B 在 A 的移交中
  可能「继承」警徽，但 B 死亡时并非警长，**不应**再触发一次移交。若用「现值比对」（`state.sheriff.seat === d.seat`）
  就会多传一次警徽。规格文字（§5.3 性质 3）要求「同一次死亡最多 1 次移交、枪杀是另一次结算」，
  只有快照能表达。
- 判胜位置固定：`settlePoint` 第 2 步（全部死亡记录完后判一次），因此不存在「先死先赢」。

**备选方案**：

- **一次性递归 `settlePoint()`**：不能暂停等输入、不能断点、「回哪去」只能压栈或参数透传，
  且测试无法只测一段。弃。
- **回调/生成器（`function*` 让出）**：能暂停，但「把状态藏进闭包/生成器」直接违反
  「动作与记录可原样传输」（规则 §11-3），联机时服务端无法存续一局。弃。
- **为每位死者建一个子阶段（`last_words_1` / `last_words_2`）**：阶段枚举被死亡人数污染，
  与规则 §5.1「18 态」冲突。弃。
- **先判胜、后遗言（把判胜挪到链条末尾）**：会让「已终局还能开枪/换警徽」，与 §6 / D71 直接冲突。弃。

---

## D3. 遗言权与「死亡时点窗口」：死因 × 窗口二维判定

**决策**：`DeathRecord.window` 在**记录死亡时**按结算点类型写入：
夜间 round=1 → `'first-night'`；夜间 round≥2 → `'night'`；白天（放逐/枪杀）→ `'day'`。
遗言权纯函数：

```ts
hasLastWords(d: DeathRecord): boolean =
  d.window === 'first-night' || d.cause === 'exile';
```

枪杀新死者**继承** `SettlementState.window`（首夜开枪 → 被枪者仍是 `'first-night'` → 有遗言；
白天开枪 → `'day'` 且 cause=`hunter-shot` → 无遗言）。

**理由**：规则 §5.3 表格是「时点 + 场合」二维表，且明确「不看死因」。把两个维度落成数据结构，
判定就退化为一行布尔表达式，可被 5 类死亡场合的表驱动测试逐一覆盖（SC-006）。

**备选方案**：

- **按死因判定（`cause==='night-kill'||'exile'` 才有遗言）**：首夜被毒者会失去遗言，与 §5.3 表格冲突。弃。
- **把遗言权写进 `player_died` 事件由 UI 判断**：判定权外流到展示层，违反「判定权集中」。弃。

---

## D4. 1.5 票：半票整数（`weightHalf`），全程禁浮点比较

**决策**：计票唯一实现收在 `engine/tally.ts`，单位为**半票整数**：

```ts
type HalfVote = number;                            // 1 票 = 2 半票；警长 1.5 票 = 3 半票
type WeightHalf = 2 | 3;

function weightHalf(sheriffSeat: Seat | null, voter: Seat): WeightHalf;
function tallyHalf(ballots: readonly Ballot[], sheriffSeat: Seat | null): Record<Seat, HalfVote>;
function displayHalf(h: HalfVote): string;          // '3' | '3.5'（只用于 UI/事件展示）
function resolveMajority(tally: Record<Seat, HalfVote>): {
  max: HalfVote; winners: Seat[]; abstainCount: number; totalHalf: HalfVote;
};
```

- 三处投票（竞选首投 / PK 再投 / 放逐）**共用** `resolveMajority`，差别只有「票权是否启用 1.5」
  （竞选期场上无警长 ⇒ 恒 2 半票）。
- `vote_cast.weight: 1 | 1.5` 是**展示值**；计票永远用 `tallyHalf` 的半票整数，
  且**从投票人座位重新求** `weightHalf`，不读事件里的 `weight`（防双账漂移）。
- 比较一律整数：`max` 用 `>`，并列用 `winners.length`，**不出现 `3.5 === 3.5` 这类浮点比较**。
- 推论可直接作为属性测试：含警长票一方半票数为**奇数**、不含者为**偶数** ⇒ 两个 x.5 不可能并列。

**理由**：`1.5` 在 IEEE-754 下可精确表示，所以本决策不是「怕算错」，而是**怕写法漂移**——
一旦某处写成 `tally[x] += 1.5` 再与整数比较，后续任何一次重排（比如改用 `reduce` 浮点累加、
或引入「警长 2 票」变体）就会踩坑。整数单位把「最小计量单位」显式化，与规则 §5.5 原文一致。

**备选方案**：

- **浮点 `1.5` 直接累加**：当前二进制可精确表示，但比较语义与展示语义混在一起，且与规则
  §5.5「比较一律用 `tallyHalf` 整数」的原文不符。弃。
- **`decimal.js` / 分数库**：为一个只有分母 2 的量引入依赖，属过度工程。弃。
- **字符串分数（`'3/2'`）**：比较要写解析器，可读性更差。弃。

---

## D5. AI 警徽预设的求值位置：engine 接受注入的纯函数（`PresetPolicy`）

**决策**：`GameState` 只存**真人**警长的 `badgePreset`（由 `setBadgePreset` 动作写入）。
AI 警长的预设由 engine 在移交瞬间调用**注入的纯函数**求得：

```ts
// engine/types.ts —— 签名定义在 engine，实现放在 ai/（依赖方向 engine ← ai 的倒置由 driver 完成）
type PresetPolicy = (seat: Seat, view: VisibleView) => Seat | null;

class Engine {
  constructor(config: GameConfig, deps?: { presetPolicy?: PresetPolicy });
}
```

`ai/badge-preset.ts` 实现规则 §7.3 的确定性求值；`ui/useGame.ts` 与 `tests/helpers/autoplay.ts`
在构造 `Engine` 时把 `aiBadgePreset` 注入。engine 源码**不出现** `import '../ai/*'`。

**理由**：

- 规则 §7.3 说「AI 预设恒等于当前可见信息的函数值」，纯函数 + 注入是唯一同时满足
  「engine 不依赖 ai」（硬约束 1/分层）与「同 seed 必同结果」（SC-003）的形态。
- 若让 engine 直接 import ai，分层方向反转，engine 就再也无法单独搬到服务端（规则 §11-1）。
- 与被否方案相比，这个方案把「AI 策略」和「规则判定」的边界放在**构造期注入**，
  是显式的、可测的、可替换的。

**备选方案**：

- **engine 直接 `import { aiBadgePreset } from '../ai/badge-preset'`**：分层反转，engine 无法独立打包/搬到服务端。弃。
- **由 driver 在「可见信息变化时」主动 dispatch `setBadgePreset` 刷新**：驱动层漏一次刷新，
  同 seed 的两局就会产生不同警徽流，直接违反 SC-003；且「何时算变化」无法穷举。弃。
- **把 AI 预设做成 pending 决策（让已死 AI 警长经 decider 提交）**：能复用单一决策通道，
  但把「系统执行」的移交步骤变成「死者行动」，与规则 §5.2-7「系统执行（确认）」冲突，
  且给热座/UI 增加一个不可能有真人对应的 pending。弃。
- **不存也不求值，靠遗言兜底**：第 2 夜被刀（无遗言）时警徽必流失，规则 §5.4 的「预设让它始终可执行」失去意义。弃。

---

## D6. 信息隔离：双通道（`viewFor` / `eventsFor`）+ 五值可见性

**决策**：保留 v1 的「单一投影咽喉点」，扩为两条**同源**通道：

- `viewFor(seat) → VisibleView`：AI 决策输入 + UI 渲染输入。
- `eventsFor(seat) → GameEvent[]`：UI 日志流（硬约束 4）。
- 事件 `visibility` 由 4 值扩为 5 值：`public` / `wolf-team` / `seer-private` / `witch-private` / `end`。
- `VisibleView` 的**类型层**不存在「他人身份」「他人预设」「边计数」字段——编译期就写不出来。

新增/收紧的字段（完整清单见 `contracts/visibility.md`）：
`you.alive` 之外的 `teammates`、`seerChecks`、`myPotions`、`knifeTarget`（仅女巫、仅本夜）、
`myBadgePreset`（仅警长本人）、`myCanShoot`（仅猎人本人）、`sheriff`、`candidates`、`withdrawn`、
`lastWords`、`speechOrder`、`voteResults[].scope`、`wolfRep`（仅狼）。

**理由**：

- v1 的 `VisibleView` 已被 12 例隔离测试锁住，结构是对的，v2 只需**扩字段**而不是换机制，
  迁移风险最低（D11 的判据）。
- 新增 `witch-private` 而不是复用 `seer-private`：两者的可见者恰好都是单人，但语义不同，
  复用会让「谁能看什么」的审查退化为「按角色名猜」。
- 暗牌局的「不泄漏边计数」在类型层就成立——`VisibleView` 里没有任何 `faction` / `edge` 聚合字段，
  UI 只能渲染 `players[].alive`（公开事实）。

**备选方案**：

- **每类信息各自一个投影函数**（`wolfView` / `seerView` / …）：咽喉点分裂成 5 个，漏一个就是泄漏。弃。
- **引擎记「公开账」+「隐藏账」两套日志**：双写必然漂移，且终局翻牌要改两处。弃。
- **在 UI 层做过滤**（引擎给全量、UI 自己藏）：等于把隔离交给每个渲染分支，`tests/isolation.test.ts`
  就再也测不到东西。弃。

---

## D7. 多真人 hot-seat：屏幕状态机 + 纯函数遮挡页闸门

**决策**：

1. `GameConfig.humans: Seat[]`（1–9，非空、去重、座位合法）随 `startGame` 进入 `GameState.config`；
   `PlayerState.isHuman = humans.includes(seat)`。
2. UI 屏幕状态机 `Screen = 'setup' | 'cover' | 'play' | 'spectate' | 'over'`。
3. 遮挡页决策抽成**纯函数**（`ui/hotseat.ts`，无 React/DOM）：

```ts
interface CoverInput {
  humans: readonly Seat[];
  pendingActor: Seat | 'wolf-team' | null;   // 引擎当前行动者（null = 系统阶段）
  lastHumanActor: Seat | null;              // 上一次「已确认操作过」的真人座位
  phase: Phase;
}
interface CoverDecision { need: boolean; seat: Seat | null; reason: 'switch' | 'preset-window' | 'none'; }
```

4. **触发点**（= FR-083 清单）：夜间三个环节 / 报名 / 竞选发言（含退水）/ 竞选投票 / PK 发言 /
   PK 再投 / 定序 / 放逐投票 / 遗言 / 猎人开枪；**外加 D78 的「接任警长设预设」**。
   不触发：`dawn` / `day_exile` / `badge_transfer`（系统）、AI 行动、同一真人连续操作、
   `humans.length === 1`。

**理由**：遮挡页是**表现层**规则（谁在什么时候该遮屏），但它必须**可测**——SC-009 要求
「每次切换 100% 出现遮挡页」。把它做成纯函数 + 一张触发点表，就能用 Vitest 裸测，
不需要 DOM/jsdom；而 React 组件只负责画那块屏。

**备选方案**：

- **放进 engine 当一个阶段（`cover`）**：规则 §5.1 固定 18 阶段，加第 19 个会破坏「18 态」口径，
  且服务端不需要知道屏幕遮挡。弃。
- **每个输入面板各自判断要不要先弹遮挡**：9 个面板 × 各自实现 = 必然漏一处。弃。
- **用 `useEffect` 里比较 ref 的「上一次 render 的行动者」**：StrictMode 双执行下会重复弹或漏弹，
  且无法离线测试。弃。

---

## D8. 狼队一个声音（D77 落地）：代表座位解析在 engine，真人优先

**决策**：`pending.actor = 'wolf-team'` 的代表座位由 engine 的**单一函数**解析：

```ts
resolveWolfTeamRep(state): Seat | null =
  1. 存活且 isHuman 的狼中座位号最小者
  2. 否则：存活狼中座位号最小者
  3. 无存活狼 → null（结构上不可达：有存活狼队才有狼刀）
```

- `Engine.decisionRequest()` 用该代表座位调 `viewFor(rep)`——沿用 v1 的「单流借出」入口。
- 其余真人狼的 `VisibleView.pending` **不出现**（`viewFor` 只对代表给 `wolf-kill`）；
  UI 对他们显示「等待狼队决定（由 N 号代表）」。
- engine 对非代表的 `wolfKill` 返回 `NOT_YOUR_TURN`。
- 狼队内部**不互看**他人选择：没有任何字段承载「某个狼队友想刀谁」，也没有狼队投票层。

**理由**：这是 D77 的字面落地，且是 v1 已有结构的**最小改动**（v1 `decisionRequest` 已经
按「存活狼中座位最小者」解析代表，v2 只加一条「真人优先」）。多人共机时狼队可以口头商量，
引擎不需要表决层（D77 备注原文）。

**备选方案**：

- **按座位最小者（不分真人/AI）**：会出现「3 号 AI 狼替 5 号真人狼按键」，真人失去操作权。弃。
- **狼队内投票（多数决）**：引擎要多一个「狼队投票」子状态 + 平票规则，规则文档没有、也不需要。弃。
- **每只真人狼各提交一次，取最后提交者**：同一夜两个刀口 = 违反「一队一个声音」。弃。

---

## D9. 警徽预设的隐私窗口（D78 + D79 落地）：`presetWindow` 瞬时标志 + 回合闸门

**决策**：

- **D79（回合闸门）**：`setBadgePreset` 被接受的条件 =
  `actor === sheriff.seat` ∧ `sheriff.seat !== null` ∧ 该警长存活 ∧
  （`pending === null` ∨ `pending.actor === actor` ≈「自己的操作回合」；
   `wolf-team` 的代表为该警长时也算）。
- **D78（遮挡页）**：`badge_transfer` 产出 `badge_passed` 且 `to !== null` **且新警长是真人**
  （`players[to].isHuman`）时，engine 置 `state.sheriff.presetWindow = true`
  （**唯一**的瞬时窗口标志；AI 接任不置位，避免悬挂窗口）。该标志在**下一次非
  `setBadgePreset` 的 dispatch** 时清除。UI 见 `presetWindow === true` 且真人数 > 1 时，
  弹「请 N 号玩家（新警长）设置警徽流」遮挡页；该页提交
  `setBadgePreset`（或「暂不设置」= 关闭窗口）后，链条继续。
- 1 名真人时 `presetWindow` 照置位但不弹遮挡页（隐私无意义），控件直接出现在其操作面板。

**理由**：

- 规则 §5.4 写「相位无关」，D79 把它收窄为「自己的操作回合」；两者必须有一个**显式状态**
  来区分「他人回合」与「刚接任的这一瞬」——`presetWindow` 就是那个状态，且它是纯 JSON 布尔，
  可序列化、可断言、可被 SC-009(c) 的「预设 0 次出现在公开记录」测试覆盖。
- 不加新阶段（规则 §8-9「不额外开阶段」），也不让 UI 自己判断「是不是刚接任」——
  否则驱动层与测试会各判一次，必然漂移。

**备选方案**：

- **严格按 D79（只在自己的 pending 回合）**：第 2 夜接任的警长要等到下一个白天才能设预设，
  D78 要求「当场」——冲突。弃。
- **在 `badge_transfer` 阶段再加一个 `setBadgePreset` 子步**：等于给系统阶段加人工动作，
  规则 §5.2-7 的动作是 `confirm`，且会给「不是警长的所有玩家」多一个空转步骤。弃。
- **UI 侧记录「刚接任」并放行**：判定权外流（谁算「刚」？刷新后还在吗？），冷启动/恢复即失效。弃。

---

## D10. 事件版本与重放：`schemaVersion = 2`，重放是「按记录重建时间线」的纯函数

**决策**：

- 19 类事件（v1 11 类 → v2 19 类），公共字段仍为 `seq` / `round` / `visibility`，**没有墙钟时间**。
- 导出文档升版：`{ schemaVersion: 2, feature: 'werewolf-v2', config, events }`。
- 另出**只读重放**函数（不还原引擎内部状态，只重建可核对的时间线）：

```ts
interface ReplayTimeline {
  rounds: Array<{ round: number; deaths: DeathRecord[]; speeches: Seat[];
                  votes: Array<{ scope: VoteScope; tallyHalf: Record<Seat, HalfVote>; outcome: string }>;
                  sheriff?: { elected?: Seat | null; passed?: Array<{ from: Seat; to: Seat | null }> } }>;
  finalTable: Array<{ seat: Seat; role: Role; alive: boolean }>;
  winner: { faction: Faction; reason: VictoryReason };
}
function replay(record: GameRecord): ReplayTimeline;
```

**理由**：SC-012 要求「第三方仅凭记录 100% 重建发言顺序、投票结果、死亡顺序与终局原因」。
把重放定义成**事件 → 时间线**的纯函数（而不是「事件 → 引擎状态」），可以用最少的代码
证明记录自足：任何一条信息如果时间线里缺失，就说明事件集合漏了字段。

**备选方案**：

- **靠事件反推完整引擎状态**：等于写第二套状态机（含隐藏字段的还原），成本翻倍且易与主实现分叉。弃。
- **只导出、不提供重放函数**：SC-012 只能靠人工口述验证，不可回归。弃。
- **持久化存档（可恢复对局）**：spec 明确「本版不含持久化」。弃。

---

## D11. v1 迁移策略：结构与自锁机制保留，规则相关全部重写

**决策**（逐文件分类见 plan「v1 迁移分类」表）：

| 类别 | 对象 | 判据 |
|---|---|---|
| **原样保留** | `rng/rng.ts`、`rng/shuffle.ts`、`src/main.tsx` | 与规则无关的底座：单流 mulberry32 / FNV-1a / Fisher–Yates。改它等于单方面改「同 seed 同局」的承诺（SC-003）。 |
| **改造（保结构扩字段）** | `events.ts`、`view.ts`、`engine.ts`、`ai/speech-templates.ts`、`ui/App.tsx`、`ui/GameLog.tsx`、`ui/useGame.ts`、`index.html`、`tests/helpers/autoplay.ts` | 形态是对的（19 类事件的骨架、投影咽喉点、门面、驱动循环），只是 v2 要加字段/加分支/加屏幕。 |
| **重写** | `engine/types.ts`、`engine/settle.ts`、`engine/transition.ts`、`ai/decider.ts`、`ui/InputPanel.tsx`、`ui/styles.css` | 规则形态变了：Seat 6→9、角色 3→5、阶段 8→18、动作 9→17、v1 的「单死即判胜」与「人数比胜负」整段作废。 |
| **新增** | `engine/tally.ts`、`engine/victory.ts`、`engine/chain.ts`、`engine/phases.ts`、`ai/badge-preset.ts`、`ui/hotseat.ts` | v2 独有子系统，且都是**高风险 + 可纯函数化**的部分，值得独立文件与独立测试面。 |

**必须保留的两类「自锁」**：

1. **复现自锁**：`tests/reproducibility.test.ts` 的「同 seed ×100 逐字节全等」+
   「`src/engine`、`src/ai` 源码扫描 `Math.random` 零字面」+「`ai/` 只 import 类型」三条。
   它们不是普通用例，而是**约束的可执行形式**（硬约束 2/3）；v2 加了 5 个新文件后，
   扫描范围自动覆盖新文件。**一条都不许删**。
2. **投影自锁**：`tests/isolation.test.ts` 的「整局夹具 × 全座位快照比对」与
   「DecisionRequest 深检」。v2 扩字段后，这两条要从「3 角色 × 6 座」扩到「5 角色 × 9 座 × 新增隐藏字段」，
   但**方法保留**：新增一个隐藏字段就先在快照测试里加一条「他人视图中不存在该键」的断言。

**理由**：v1 的 125 个用例里，77 条的**断言口径**在 v2 仍然成立（rng、复现、事件序列、
隔离方法、AI 基本策略、投票基本语义），48 条因规则变化必须重写。全量重写会丢掉这两类自锁，
而它们正是 v1 最有价值的资产；照着 v1 加 `if (v2)` 又会让 18 阶段逻辑长在 8 阶段的骨架上。

**备选方案**：

- **推倒重来（新目录 `src/v2/`）**：丢掉 rng 与自锁测试的连续性，且 `ui/` 驱动循环要重写一遍
  （v1 的 StrictMode/指纹防重的坑已经踩平）。弃。
- **在 v1 文件里加 `if (config.board === '9p')` 分支**：两套规则共存于同一函数，18 条转移要写两遍，
  review 与测试都无法确认「当前跑的是哪套」。弃。

---

## D12. 竖屏手机优先：CSS 单列 + 断点两栏，不引入 UI 组件库

**决策**：

- 布局：`.app` 为单列 flex，顺序固定为「顶部状态条 / 中部日志（自身滚动区）/ 底部操作面板」（FR-081）。
- `@media (min-width: 900px)` 才把布局切成「左日志 + 右侧栏（座位卡 / 状态 / 终局）」两栏；
  断点之前**没有**任何固定宽度、没有任何 `nowrap` 的横向内容（SC-010：375×812 横向滚动 0 次）。
- 座位信息用 9 宫格式的卡片流（竖屏 2 列 × 5 行以内），不用 `<table>`（v1 的 `player-table`
  在 375 宽下会横向溢出——这是 v1 已知的一处竖屏缺口，v2 必须换掉）。
- 不引入 Tailwind / MUI / 任何 UI 库：单文件 `styles.css` 足够，且避免构建链变化。

**理由**：SC-010 是**可数的硬指标**（横向滚动 0 次、不可点控件 0 个），纯 CSS 就能满足；
引入组件库会带来主题/断点/SSR 之外的一整套约定，收益为零。

**备选方案**：

- **响应式三栏 + `max-width` 收缩**：v1 走的这条路，实测 375 宽下按钮被裁（已知缺口）。弃。
- **桌面优先再写 `@media (max-width: …)` 收缩**：CSS 里「收缩」比「先单列再展开」更容易溢出。弃。
- **引入 Tailwind**：多一层构建与 class 约定，对一个 9 屏的纯文本界面属过度。弃。

---

## D13. AI 女巫用毒：查杀优先 + round ≥ 2 确定性可疑度评分（毒药不许烂在手里）

> **来源**：Lisa 2026-10-18 新裁定，**推翻**规则 §12.1-D 与 spec FR-094 里
> 「毒药只在存在公开且存活查杀目标时才用，否则不用」的口径。裁定原则：**毒药不能烂在手里**。

**决策**：`aiWitchAction(view) → Action` 的确定性六步（**不耗 rng**，因此不影响随机流的形状）：

```text
1. 若解药在 ∧ 本夜刀口存在 → {use:'save', target: 刀口}
   （FR-094 前半句不变；刀口是女巫自己时同样自救）
2. 否则取候选池：存活 ∧ ≠ 自己
3. ① 查杀优先：公开 claim 里存在 result='werewolf' 且目标仍存活者 →
   取**事件序最近一次**那条的 target → {use:'poison', target}
   （公开 claim 的取数范围 = speech.claim + last_words.claims，见 event-stream §1.2）
4. ② 否则若 round ≥ 2 ∧ 毒药在 → 对候选池逐个打分，取最高分 → {use:'poison', target}
5. 若毒药不在 → {use:'none'}
6. 兜底（候选池空，结构上不可达）→ {use:'none'}
```

**评分函数（确定性，权重固定，写死在代码里）**：

```text
score(s) = 3·A(s) − 3·B(s) + 2·C(s) − 5·D(s) + 2·E(s)

A(s) = 公开查杀指向 s 的次数（claims: result='werewolf' ∧ target=s）
B(s) = 公开金水指向 s 的次数（claims: result='good'   ∧ target=s）
C(s) = s 投过票、且该目标已被公开证明为好人的票数
       （「公开证明」= 明牌局已死且翻牌为好人；或该目标被公开金水且仍存活）
D(s) = 1 若 s 本人曾公开发出 seer-claim（跳预言家），否则 0      ← 避免毒掉跳预言家的人
E(s) = 1 若 s 曾把票投给任何一个 seer-claimant，否则 0            ← 与跳预言家者对立

tie-break：全同分时取**座位号最小**者（保证可复现）
```

- **只用结构化数据**：`claim` / `claims` 与投票记录；**不解析中文发言文本**
  （沿用 v1 research D6 的「发言不解析」口径）。
- **不耗 rng**：女巫的决策是纯函数 ⇒ 随机流的消费顺序不变，
  v1 的「同 seed ×100 逐字节全等」自锁照旧成立（新增决策不改变流形状）。

**关键性质（必须写成可测断言）**：

| # | 性质 | 断言形式 |
|---|---|---|
| P1 | **毒药不许烂在手里** | 毒药在 ∧ 女巫存活 ∧ `round ≥ 2` ⇒ 本夜动作必为 `use:'poison'`，目标 ∈ 存活他人 |
| P2 | 查杀优先于评分 | 存在存活公开查杀 ⇒ 目标 = 最近一次查杀的目标（不看 score） |
| P3 | 确定性 | 同一 `view` 两次求值结果相同；不消耗 rng（前后 `rng` 位置不变） |
| P4 | 全同分可复现 | 候选池全同分 ⇒ 取座位号最小者 |
| P5 | 边界 | 女巫死亡 / 毒药已用 / `round === 1` 且无公开查杀 ⇒ `use:'none'`（或 `save`，按第 1 步） |

**理由**：

1. 旧口径（只在有查杀时用毒）在 AI 全托管局里几乎等于**永远不用毒**——女巫的 1 瓶毒药
   是好人方唯一的「抢节奏」手段（规则 §2 的节奏推演以它为前提），烂在手里等于废掉一个角色。
2. `round ≥ 2` 才启用评分，是为了**不破坏首夜的确定性节奏**：首夜女巫要么救人、要么按查杀下毒，
   不做主观判断；第二夜起才允许按公开信息推断。
3. 分数只看**公开、结构化**信号（claim / 投票），因此信息隔离不受影响（A3/C3 硬约束照旧）；
   tie-break 用座位号升序保证「同局面必同结果」（SC-003）。

**备选方案**：

- **旧口径（仅查杀时用毒）**：Lisa 明确推翻。弃。
- **随机选一个存活目标下毒**：确定性破功（虽然可用 rng 保持复现），但会让 AI 经常毒好人，
  且「为什么毒他」无法解释。弃。
- **用阈值（如 score ≥ 3 才毒）**：阈值是浮动口径，且会出现「全都不够分 → 永不使用」，
  与新裁定的核心原则直接冲突。弃。
- **引入发言文本关键词**：脆弱、不可测、且违反「不解析自然语言」。弃。
- **六维线性回归/调参**：本版明确「不做数值平衡调优」（spec 范围边界）。弃。

**对既有断言的影响（必须同步改）**：

1. AI 全托管局里「毒药未被使用」不再是常态：女巫首夜救人（解药必用）→ **第 2 夜必用毒**，
   因此「0 死之夜」在全 AI 局中**最多 1 次**（首夜）。
2. 相关统计与复现断言要按新口径重算：
   - 事件流统计（如「每夜恰 1 名死者」）必须改成「首夜 0 死；第 2 夜起 ≥1 死，可能 2 死」。
   - 终局轮次的分布（SC-002 的 ≤10 轮）**上界不变**（毒药只会加速死亡），但
     「典型终止轮次」会下降——`termination.test.ts` 只断言**上界**，不写死典型值。
   - `reproducibility.test.ts` 的「逐字节全等」**不受影响**（新决策是纯函数、不耗 rng）。
3. **规则文档与 spec 需要同步修订**（硬约束 5：先改文档再改代码）：
   - `docs/游戏规则.md` §7.1 表格「毒药仅在有存活查杀公开时用」与 §12.1-D → 按本决策改写；
   - `spec.md` FR-094 后半句「否则 MUST 不用」→ 改为「round ≥ 2 按确定性评分用毒」；
   - FR-097 中「女巫选择不用药」的合法情形随之收窄（只剩 round 1 无查杀 / 药已用 / 已死）。
   **在本 plan 阶段不改这两份文件**（交付纪律），但它是 M3/M7 的**前置阻塞项**，见 plan §风险与未决。

---

## 与规则文档的一致性核对（Phase 0 顺带完成）

D1–D12 均为实现层选择，**未引入任何新游戏规则**；**D13 是规则变更**（Lisa 2026-10-18 裁定，推翻 §12.1-D），需先改规则文档再实现。逐项对照：

| 规则条款 | 本研究的落点 | 是否改动规则 |
|---|---|---|
| §5.1 18 阶段（数量/名字/顺序） | D1 阶段规格表 18 项 | 否 |
| §5.2 18 行转移表 | D1 规格表 `accepts` + data-model §5 | 否 |
| §5.3 死亡结算链 + 5 条性质 | D2 显式队列 + `wasSheriff` 快照 | 否 |
| §5.4 警徽流（预设/移交/流失） | D5 求值位置 + D9 隐私窗口 | **D78/D79 收窄了「相位无关」与「同一屏」**，需回改规则文档（见报告） |
| §5.5 计票口径 | D4 半票整数 | 否 |
| §6 判胜顺序与时机 | data-model §8（`victory.ts`） | 否 |
| §7 AI 策略（含 7.3 预设） | D5 注入纯函数；ai 侧逐行实现 | 否（§7.3 预设不变） |
| §7.1 女巫用毒口径 + §12.1-D | **D13** | **是**：改为「查杀优先 + round ≥ 2 评分用毒」，需回改规则文档与 spec FR-094 |
| §8 交互（含 8-3 遮挡页、8-9 预设控件） | D7 遮挡页闸门 + D9 `presetWindow` | **8-9「同一屏直接提示」改为遮挡页**（D78） |
| §9 19 类事件与可见性 | D6 五值可见性 + D10 导出版本 | 否（`witch_action` 的可见性规则文档未列，本设计补为 `witch-private`，见报告缺口） |
| §11 联机预留（4 条架构要求） | D1（零 DOM）/ D5（依赖倒置）/ D6（投影）/ D10（纯 JSON） | 否 |

**结论**：无规则变更；有两处**规则文档表述需要同步**（D78/D79），已列入报告的「偏差与缺口」，
不在本 plan 阶段改 `docs/游戏规则.md`（硬约束 5 + 本任务交付纪律）。
