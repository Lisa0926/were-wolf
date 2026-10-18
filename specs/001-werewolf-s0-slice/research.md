# 研究记录：狼人杀 S0 垂直切片

**特性**: 001-werewolf-s0-slice | **日期**: 2026-10-18 | **状态**: Phase 0 完成

## 输入盘点（无外部未知项）

技术上下文无 NEEDS CLARIFICATION：板子、极简规则包、状态机、技术栈
（TS5 + Vite + React 18 + Vitest）、AI 规则驱动均已由 Lisa 在 spec 之前拍板，
记录于 `projects/werewolf/docs/游戏规则.md`、`projects/werewolf/AGENTS.md`、spec 的 Assumptions 节。
因此本研究不做外部调研，只对**实现级设计决策**逐条给出
决策 / 理由 / 备选方案，供 plan 与 tasks 阶段直接引用。

---

## D1. seeded RNG：自实现 mulberry32，零新依赖

- **决策**: `src/rng/` 内自实现 mulberry32（32 位 PRNG，~15 行），
  配 Fisher–Yates 洗牌与 `pick` 帮助函数。不引入第三方随机库。
- **理由**:
  1. FR-010 的复现承诺跨版本成立——第三方库升级可能改变序列，
     自有实现 + 固定算法 = 永久可复现；
  2. 算法公开且短，可被单测完整锁定（同 seed 断言完整输出序列）；
  3. S0 零新增依赖，规避国内网络可达性验证成本。
- **备选方案**:
  - `seedrandom` 包：成熟但引入依赖 + 版本漂移会破坏复现，弃；
  - `Math.random + 种子hack`：不可种子化，且被硬约束 2 禁止，弃；
  - crypto 弱随机：不可复现，弃。

## D2. 种子类型：公开 API 用 string，FNV-1a 哈希入 mulberry32

- **决策**: `startGame({seed})` 的 seed 为 string；rng/ 内用 FNV-1a
  （32 位）确定性哈希成 mulberry32 初始状态。空串/非法字符也必须稳定映射。
- **理由**: 界面输入与 URL 参数天然是字符串；JS number 超 2^53 丢精度，
  字符串种子无此坑。哈希 5 行、可单测。
- **备选方案**: uint32 数字种子（少一步哈希，但界面输入不友好、
  易被误传浮点，弃）。

## D3. 单随机流的传递方式：engine 持有流，决策时借给 AI

- **决策**: `startGame` 时创建**唯一** Rng 实例，engine 持有；
  发牌洗牌与每次 AI 决策都从这一条流取数。引擎向决策方下发
  `DecisionRequest` 时把 rng 实例**随请求借出**（decider 签名
  `(req) => Action`，req 含 view / legalTargets / rng）。
  消费顺序 = 状态机动作顺序 ⇒ 同 seed 必同局。
- **理由**: 规则 §4.4 明确"发牌与 AI 决策共用同一条随机流"。
  若 ai/ 自建流则变成两条流，违反口径。随请求借出可保证取数顺序
  完全由引擎驱动循环决定，且 ai/ 不需要知道 seed。
- **备选方案**:
  - ai/ 自建 rng（两条流，违反规则，弃）；
  - rng 状态存进 GameState 并序列化（为存档设计，S0 无持久化，YAGNI，弃）。

## D4. 事件可见性：全量日志 + 按座位投影，UI 与 AI 走同一投影

- **决策**: 引擎只维护一份**完整事件日志**（含夜间刀口/查验等隐藏事实，
  供终局导出与复盘，FR-009）；每个事件带 `visibility` 标注
  （`public` / `wolf-team` / `seer-private` / `revealed-at-end`）。
  引擎提供 `viewFor(seat)` 投影：把日志 + 状态投影成该座位可见的
  `VisibleView`。**UI 渲染人类座位的投影流，AI 决策输入同一投影的
  VisibleView**——信息隔离只有一个咽喉点（view builder）。
- **理由**:
  1. 硬约束 4"UI 只消费事件流"与"人类不能提前看到刀口/身份"并存，
     靠投影解决，而不是让引擎记两套账；
  2. 人类与 AI 走同一投影 = 同一公平信息口径，也是本项目信息架构的
     核心学习点（规则 §5）；
  3. 死亡即翻牌、终局全翻牌都只是把隐藏事实转公开的投影规则，
     日志本身不可变。
- **备选方案**:
  - 引擎记公开日志 + 隐藏账两套（双写易漂移，弃）；
  - 导出时从状态反推事件（丢失叙事顺序，无法重建时间线，弃）。

## D5. 引擎 API 形态：transition 纯函数 + Engine 门面类

- **决策**: `engine/` 内两层：
  - 纯转移函数 `transition(state, action) → { state, events }`，
    无副作用、可直接单测（对应规则 §4.2 转移表的每一行）；
  - `Engine` 门面类持有 GameState + Rng + 事件日志，暴露
    `dispatch(action)` / `pendingDecision` / `viewFor(seat)` /
    `exportGame()`。非法动作返回类型化错误且状态不变。
- **理由**: 门面给 UI/测试一个同步、简单的驱动面；纯函数层让
  "三核心状态机"测试不经过任何包装直接打到转移表。
  驱动循环（谁该行动 → AI 就调 decider、人类就等 UI）很薄，
  放在 ui 的 hook 与测试 helper 各一份（各 ~10 行），
  不为它加第 5 个模块或让 engine 反向依赖 ai。
- **备选方案**:
  - 纯 reducer 无门面（rng 借出与日志累积全推给调用方，UI 侧噪音大，弃）；
  - engine 内置 runner + 依赖 ai（违反分层方向 engine←ai，弃）；
  - 增加 `src/game/` 编排模块（AGENTS.md 已定死 4 模块，不扩，弃）。

## D6. 狼队决策与结构化发言声明（claim）

- **决策**:
  1. `night_wolf` 阶段引擎只收**一次** `wolfKill(target)`（狼队一个声音）；
     有人类狼时由人类提交，无人类狼时由狼 AI 用狼队视图决定一次。
  2. 发言动作 `speak(text, claim?)` 可携带结构化声明
     （如 `{ kind: 'seer-claim', target, result }`）；事件同时存 text 与
     claim。AI 村民/狼读取 claim 字段做"站边/投查杀"，不解析中文模板句。
- **理由**:
  1. 规则 §3"2 狼共同决定"未定义 S0 界面机制——人类狼提交即狼队决定，
     是交互层简化而非规则变更（前置校验仍按 §4.2：目标存活且非狼）；
  2. 规则 §5 村民"有查杀投查杀"依赖识别预言家声明，模板句正则解析
     脆弱；claim 让声明成为一等数据，UI 仍渲染 text。
- **备选方案**:
  - 两狼各提交一刀再合成（S0 无协商机制，复杂度无收益，弃）；
  - 中文模板正则解析（脆弱、双语言成本，弃）。

---

## 与规则文档的一致性核对（Phase 0 顺带完成）

D1–D6 均为实现层选择，未引入任何新游戏规则；涉及规则的点
（狼队一刀、禁刀队友、禁自验、平票/全弃平安日、死亡即翻牌、
判定时机、AI 策略表）全部逐条对照 `projects/werewolf/docs/游戏规则.md` §2–§5，
映射表见 [data-model.md](data-model.md) §3。
