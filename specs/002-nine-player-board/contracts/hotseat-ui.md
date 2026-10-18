# 契约：hot-seat 交互与竖屏界面（v2）

**特性**: 002-nine-player-board | **模块**: `projects/werewolf/src/ui/`
**消费者**: 真人玩家（1–9 人共机）、`tests/hotseat.test.ts`（纯函数裸测）、
将来的联机客户端（规则 §11）

本契约冻结三件事：**真人 1–9 的配置模型**、**遮挡页的触发口径**（含 D77/D78/D79）、
**竖屏优先的界面骨架**。它不涉及任何规则判定——一切判定在 engine。

---

## 1. 局前配置模型

```ts
interface GameConfig {
  seed: string;          // 允许留空 → UI 层生成（FR-004），生成后回填设置页并对玩家可见
  mode: 'open' | 'dark'; // 默认 'open'（spec 关键假设）
  humans: Seat[];        // 1–9 个、去重、座位合法
}
```

| 项 | 控件 | 校验 | 落点 |
|---|---|---|---|
| 种子 | 文本框（可空）+「随机一个」按钮 | 非空字符串（留空时 UI 生成后再校验） | `game_started.seed` |
| 明 / 暗牌 | 二选一（默认明牌） | 值 ∈ `open`/`dark`；局中不可改（FR-007） | `game_started.mode` |
| 真人座位 | 9 个座位开关（1–9 号） | 至少 1 个；未选者 AI 补位（FR-003） | `GameConfig.humans` |

**「真人座位」而非「真人数量」**：spec FR-003 要求「真人座位（1–9 个）」，
即玩家可以直接挑座位（例如「我和朋友坐 3 号、7 号」），而不是只填人数让系统分配。
`humans` 为空 → 拒绝开局（`BAD_CONFIG`）。

**AI 补位**：`humans` 之外的座位全部 `isHuman=false`，由 `deciderFor(role)` 驱动；
**真人 1 人时全程不出现遮挡页**（FR-084 末句）。

---

## 2. 屏幕状态机

```ts
type Screen = 'setup' | 'cover' | 'play' | 'spectate' | 'over';
```

| Screen | 何时进入 | 显示什么 | 退出条件 |
|---|---|---|---|
| `setup` | 页面打开 / 终局后「再来一局」 | 三项配置 + 开始按钮 | 点「开始」→ 建局成功 |
| `cover` | `decideCover()` 返回 `need=true`（§4） | **全屏遮挡页**：「请 N 号玩家操作」+ 确认按钮；不渲染任何日志/座位信息 | 点确认 → `lastHumanActor = seat` → 进 `play`/`spectate` |
| `play` | 轮到真人且有行动权 | 状态条 + 日志（投影座位）+ 输入面板 | 交付动作 / 死亡 / 终局 |
| `spectate` | 本人已死且**无**遗言/开枪权 | 状态条 + 公开日志（无输入面板） | 终局 → `over` |
| `over` | `phase === 'game_over'` | 终局结算（胜负 + 原因 + 全员身份 + 警徽流转 + 导出） | 「再来一局」→ `setup` |

**关键点**：`cover` **不是**引擎阶段（18 阶段不变），它只是 UI 在两次 dispatch 之间插入的一块屏。
因此它不产生任何事件、不改变 `phase`、不需要服务端知道。

---

## 3. 驱动循环与「投影座位」

```text
loop:
  phase = engine.state.phase
  if phase === 'game_over' → Screen='over'，停
  p = engine.pendingDecision
  actor = p === null ? null
        : (p.actor === 'wolf-team' ? resolveWolfTeamRep(engine.state) : p.actor)

  cover = decideCover({ humans, actor, phase, lastHumanActor,
                        presetWindowSeat: engine.state.sheriff.presetWindow
                                          ? engine.state.sheriff.seat : null })
  if cover.need → Screen='cover'（等确认；确认后 lastHumanActor = cover.seat）

  if p === null            → 系统阶段：自动 confirm（可读延时 300–800ms）
  else if actor 是真人      → 渲染输入面板（投影座位 = lastHumanActor）
  else                     → req = engine.decisionRequest(); dispatch(deciderFor(req.view.you.role)(req))
```

**投影座位恒等于 `lastHumanActor`**（不是"当前行动者"）：

- AI 行动时，屏幕仍属上一个操作过的真人 ⇒ 日志投影不能跟着 AI 走（否则 AI 的行动会
  被投影到某个座位的视角里，造成「AI 用某人的视野替你玩」的错觉）。
- 真人在自己的回合里，`lastHumanActor` 就是他自己 ⇒ 投影 = 自己 ✓。
- 开局首帧：`lastHumanActor = null` ⇒ 投影 = `humans[0]`（第一个真人），并立即触发首次遮挡页
  （真人数 > 1 时）。

**日志投影 = `engine.eventsFor(projectionSeat)`**；否则上一位真人的夜间私有信息会残留在屏幕上
（这正是遮挡页要解决的问题，score 见 SC-009(a)）。

---

## 4. 遮挡页触发口径（纯函数）

```ts
// src/ui/hotseat.ts —— 纯 TS，无 React / 无 DOM（可被 Vitest 裸测）
interface CoverInput {
  humans: readonly Seat[];
  actor: Seat | 'wolf-team' | null;   // 已解析：wolf-team → 代表座位；系统阶段传 null
  phase: Phase;
  lastHumanActor: Seat | null;
  presetWindowSeat: Seat | null;      // engine.state.sheriff.presetWindow ? seat : null（D78）
}
interface CoverDecision {
  need: boolean;
  seat: Seat | null;
  reason: 'switch' | 'preset-window' | 'none';
}
function decideCover(input: CoverInput): CoverDecision;
```

**判定顺序（不可调换）**：

```text
1. humans.length <= 1                       → {need:false, reason:'none'}
2. presetWindowSeat !== null ∧ 该座位是真  → {need:true, seat:presetWindowSeat, reason:'preset-window'}
   （D78：接任警长设预设，优先于其它；即使接任者本来就是 lastHumanActor 也要弹；
     引擎已保证 presetWindow 只为真人接任置位，此处再校一次作兜底）
3. actor === null（系统阶段）                → {need:false, reason:'none'}
4. actor 不是真人（AI 行动）                  → {need:false, reason:'none'}
5. actor === lastHumanActor（同一人连操作）    → {need:false, reason:'none'}
6. 其余                                      → {need:true, seat:actor, reason:'switch'}
```

### 4.1 触发点逐阶段表（对齐 FR-083 + D78）

| `phase` | 会触发遮挡页？ | 说明 |
|---|---|---|
| `idle` | — | 在 `setup` 屏 |
| `night_wolf` | ✔（代表是真人时） | 狼队代表按键；非代表真人狼只看到「等待狼队决定（由 N 号代表）」 |
| `night_witch` | ✔ | 女巫是真人 |
| `night_seer` | ✔ | 预言家是真人 |
| `dawn` | ✘ | 系统阶段（公布死讯），无行动者切换 |
| `last_words` | ✔ | 死者是真人；**同一真人紧接着开枪时不重复弹**（规则 5） |
| `badge_transfer` | ✘（系统公告） | **例外**：移交落地后 `presetWindow` 触发 `preset-window` 一次（D78） |
| `sheriff_signup` | ✔ | 逐座位表态 |
| `sheriff_speak` | ✔ | 含「退水 / 不退水」子步（同一人不重复弹） |
| `sheriff_vote` | ✔ | 只列候选人 |
| `sheriff_pk_speak` | ✔ | PK 候选人 |
| `sheriff_pk_vote` | ✔ | 同一批警下 |
| `day_order` | ✔ | 警长定序 |
| `day_speak` | ✔ | 按 `speech.order` |
| `day_vote` | ✔ | 座位升序 |
| `day_exile` | ✘ | 系统阶段 |
| `hunter_shoot` | ✔ | 死去的猎人是真人 |
| `game_over` | ✘ | 进 `over` 屏 |

### 4.2 三条硬口径

1. **遮挡页必须同步切投影**：确认后 `lastHumanActor = seat` ⇒ 日志立刻变为 `eventsFor(seat)`
   （FR-083 后半句）。
2. **同一真人连续操作不重复弹**：遗言 → 警徽移交（系统）→ 开枪，中间没有第二个真人介入，
   因此只在遗言前弹一次（规则 5 / FR-084）。
3. **AI 行动永不弹**：`actor` 不是真人直接 `none`；纯 AI 补位局（真人 1 人）全程 0 次遮挡页
   （FR-084 / 人故事 4 场景 6）。

---

## 5. D77 / D78 / D79 的落地位置

| 决策 | 口径 | 落地 | 可验证 |
|---|---|---|---|
| **D77** | 多名真人同为狼：**存活真人狼中座位号最小者**代表狼队提交；其余真人狼只看到「等待狼队决定」，提交后同见结果；狼队内部不互看他人选择 | engine `resolveWolfTeamRep`（真人优先）→ `pending.actor` 只出现在代表座位的 `view.pending`；UI 对非代表狼显示等待态；**无**任何"队友选择"字段 | `resolveWolfTeamRep` 单测 4 例（人狼在低/高座位、全 AI 狼、无存活狼）；`view.pending` 只在代表座位存在 |
| **D78** | 接任警长设预设**走遮挡页**（不共用公开的移交公告页） | engine 在 `badge_passed{to≠null}` 后置 `sheriff.presetWindow=true`；UI 的 `decideCover` 第 2 条给出 `preset-window` 遮挡页；该页只让**新警长**设置，提交 `setBadgePreset` 后窗口关闭（任何其它 dispatch 也会关闭，防悬挂） | `presetWindow` 只在 `badge_passed` 后为 true；遮挡页 seat = 新警长；提交后为 false |
| **D79** | 预设只能在该玩家**自己的操作回合**修改（含夜间行动回合）；他人回合不可改 | engine 校验：`actor` 是在位存活警长 ∧（`presetWindow` ∨ `pending===null` ∨ `pending.actor===actor` ∨ 狼队代表是自己）；否则 `NOT_YOUR_TURN` | 5 条拒绝/放行用例（他人回合拒绝、自己夜间回合放行、系统阶段放行、presetWindow 放行、非警长拒绝） |

**规则文档待同步**（不在本阶段改）：§5.4「相位无关」→ 收窄为「自己的回合或 presetWindow」；
§8-9「移交公告页同一屏设置」→ 改为「遮挡页设置」。见 plan 报告「偏差与缺口」。

### 5.1 预设控件的显示规则

| 条件 | 显示 |
|---|---|
| `you.seat !== sheriff.seat` | **不显示**（连提示都没有，避免"这里有东西"的暗示） |
| 本人是警长，`myBadgePreset === null` | 「当前警徽流：未指定」+ 9 个座位可选 + 「清空」 |
| 本人是警长，`myBadgePreset === N` 且 N 存活 | 「当前警徽流：N 号」 |
| 本人是警长，`myBadgePreset === N` 且 N 已出局 | 红字「目标已出局，警徽将作废」+ 建议改选（FR-090） |
| 本人是警长且刚接任（`presetWindow`） | 先遮挡页 → 该屏内直接设置（D78） |

---

## 6. 竖屏优先布局契约（FR-081 / SC-010）

### 6.1 单列三区（375×812 基准）

```text
┌──────────────────────────────┐
│ 状态条（固定，不滚动）         │  轮次 · 阶段 · 警长：N号/无警长 · 你的身份 · 票权
├──────────────────────────────┤
│ 座位卡区（9 张，2 列网格）      │  座位号 · 存活/出局 · 警徽 · 1.5 票 · 明牌身份
├──────────────────────────────┤
│ 日志（flex:1，自身滚动）        │  eventsFor(投影座位) 逐条渲染
├──────────────────────────────┤
│ 操作面板（固定，不滚动）        │  按 pending.kind 渲染（见 §6.3）
└──────────────────────────────┘
```

- 宽屏 `@media (min-width: 900px)`：改为「左：日志 + 座位卡（并排）；右：状态条 + 操作面板」两栏，
  功能不减（FR-081 / 人故事 4 场景 5）。
- **禁止**：固定像素宽度、横向 `overflow`、`white-space: nowrap` 的长文本、`<table>` 承载座位表
  （v1 的 `player-table` 在 375 宽下溢出，v2 必须换掉——这是 v1 已知竖屏缺口）。
- 所有可点控件最小命中区 40×40 px；操作面板按钮在竖屏下**单列纵向排列**（不做左右并排窄按钮）。

### 6.2 座位卡（9 张）

| 元素 | 数据源 | 需求 |
|---|---|---|
| 座位号 | `view.players[].seat` | — |
| 存活 / 出局 | `alive` | FR-063 |
| 身份（仅明牌死者、终局） | `revealedRole` | FR-063 |
| 警徽标记 + 「1.5 票」 | `sheriff.seat === seat` | FR-089 |
| 狼队友标记 | `teammates`（仅狼视角） | FR-005 |
| 「你」标记 | `you.seat === seat` | — |

### 6.3 操作面板（按 `pending.kind`）

| kind | 面板要素 | 需求 |
|---|---|---|
| `wolf-kill` | 9 宫格刀口选择（只列 `legalTargets`）+ 狼队友只读标记 | FR-009 |
| `witch-action` | 显示本夜刀口座位（`knifeTarget`）+ 三选一「用解药 / 用毒药（选目标）/ 不用药」+ **药况**（解药/毒药 有/无） | FR-010–012 |
| `seer-check` | 9 宫格（不含自己）+ 上次查验结果回显 | FR-016 |
| `sheriff-signup` | 「上警 / 不上警」两个按钮 + 当前上警名单与人数 + 「第 k / m 位表态」 | FR-085、FR-039 |
| `withdraw` | 仅一个二选一：「退水 / 不退水」+ 提示「退水不可撤销」 | FR-042、FR-085 |
| `speech`（竞选） | 文本框 + 跳过 + 「第 k / m 位上警者」+ 可选 claim 快捷（跳预言家/查杀/金水） | FR-085 |
| `speech`（PK） | 文本框 + 跳过 + PK 名单 | FR-086 |
| `vote`（竞选 / PK） | **只列候选人** + 弃票 + 「警上 N 人 / 警下 M 人」+「你的票权：1」 | FR-085 |
| `speech-order` | 起讲座位选择 + 方向（升/降）+ **实时预览完整顺序** + 无警长时该面板不出现 | FR-087 |
| `speech`（白天） | 文本框 + 跳过 | FR-056 |
| `vote`（放逐） | 9 宫格（含自己）+ 弃票 + 「你的票权：1.5 / 1」 | FR-089 |
| `last-words` | 文本框 + 跳过 + （死者是警长）警徽处置三选一：**默认「沿用生前预设」** / 指定座位 / 作废 + 提示「遗言结束后才进入开枪」 | FR-088 |
| `hunter-shoot` | 9 宫格（存活者）+ 「弃枪」+ 提示 | FR-033 |
| `preset-window`（非 pending，遮挡页内） | 9 宫格 + 「暂不设置」 | D78 |

### 6.4 状态条（固定区）

`第 N 轮 · 阶段中文名 · 警长：N 号 / 无警长 · 你：N 号（身份）· 票权：1.5 / 1`
无警长时必须显示「无警长」（FR-089）；暗牌局**不显示**任何阵营/边计数（FR-064）。

---

## 7. 观战与死者操作权（FR-091 / FR-024）

| 状态 | 输入面板 | 日志 | 说明 |
|---|---|---|---|
| 存活，非本人回合 | 显示「等待中」 | 投影座位可见 | — |
| 本人已死，有遗言权 | 显示 `last-words` 面板 | 同上 | 动作提交后才转观战 |
| 本人已死，是猎人且可开枪（刚遗言/刚放逐） | 显示 `hunter-shoot` 面板 | 同上 | 与遗言同一人 ⇒ **不重复弹遮挡页** |
| 本人已死，无后续动作 | **收起面板** → `spectate` | **继续滚动到终局** | FR-091 / SC-011 |
| 本人已死但在位警长，警徽待移交 | 无面板（系统执行） | 见 `badge_passed` 公告 | FR-024 末句 |

⚠️ **与 v1 的差异**：v1 的 `pendingForSeat` 对死者一律返回 `null`（`tests/phases.test.ts` 有一条
「pendingDecision 永不指向死者」）。v2 必须改成「**遗言/开枪阶段例外**」——
这条旧断言要重写，否则 FR-024 / SC-011 无法满足（见 plan 迁移总账中该用例的归类）。

---

## 8. 联机预留（v3，本版不实现）

| 要求 | 本版如何铺好 | 本版不做 |
|---|---|---|
| 服务端权威 | 客户端不计算票权、警徽归属、预设、暗牌身份；一律读 `viewFor` | 不写服务端 |
| 动作带 `actor` | 全部玩家动作必带 `actor`（v2 收紧） | 不做鉴权中间件 |
| 投影即协议 | `viewFor(seat)` / `eventsFor(seat)` 的返回值就是将来下发的报文 | 不做 WS |
| 遮挡页与投影解耦 | 遮挡页是纯 UI 状态；服务端只需下发"该座位可见的内容" | 不做多端同步 |
| 断线/重连 | **不做**（spec 明确不含持久化；刷新即重开） | 不做存档 |

---

## 9. 验收映射（本契约 → spec / 规则 §10）

| 契约小节 | 对应验收 |
|---|---|
| §1 配置模型 | FR-003 / FR-092；规则 V?? 无（工程项） |
| §2 屏幕状态机 | FR-081 / FR-091 / FR-093 |
| §3 投影座位 | SC-009(a)；规则 V23 |
| §4 遮挡页口径 | FR-083 / FR-084；SC-009(a)；规则 V23 |
| §5 D77/D78/D79 | FR-030（接任者当场设置）+ FR-083（只接受当前行动者）+ SC-009(c)；规则 V20/V24 |
| §6 竖屏布局 | FR-081 / FR-085–FR-089 / FR-090；SC-010；规则 V01 |
| §7 观战与死者操作权 | FR-024 / FR-091；SC-011；规则 V22 |
| §8 联机预留 | 规则 §11 四条（本版只做架构约束，不做联机） |
