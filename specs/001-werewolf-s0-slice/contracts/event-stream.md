# 契约：对局事件流

**特性**: 001-werewolf-s0-slice | **模块**: `projects/werewolf/src/engine/events.ts`
**消费者**: ui/（渲染投影流）、导出文件（FR-009）、未来本地知识库/复盘（D35）

事件流是一等公民（硬约束 4）：引擎每局产出**有序、可序列化**的事件序列。
本契约冻结事件集合与导出格式；下游只依赖此契约，不依赖引擎实现。

---

## 1. 事件集合（9 类，覆盖发牌/夜间动作/发言/投票/死亡/判定）

所有事件公共字段：`seq`（全局递增，从 1 起）、`round`（1 起）、`visibility`。

| # | 事件 type | 载荷 | visibility | 对应需求 |
|---|---|---|---|---|
| 1 | `game_started` | `{ seed, board: Role[] }` | `public` | FR-001 |
| 2 | `roles_dealt` | `{ assignment: Record<seat, Role> }` | `end`（终局前仅本人经视图可知） | FR-001 |
| 3 | `night_started` | `{}` | `public` | 节奏标记 |
| 4 | `wolf_kill_decided` | `{ target: seat }` | `wolf-team` | FR-002 |
| 5 | `seer_check_completed` | `{ target: seat, result: 'good'\|'werewolf' }` | `seer-private` | FR-002 |
| 6 | `player_died` | `{ seat, revealedRole, cause: 'night-kill'\|'exile' }` | `public`（死亡即翻牌） | FR-003 |
| 7 | `speech` | `{ seat, text, claim?: Claim, skipped: boolean }` | `public` | FR-004 |
| 8 | `vote_cast` / 收齐时 `vote_result` | 见下 | `public` | FR-005 |
| 9 | `victory` + `game_over` | `{ winner, reason }` / `{ finalTable }` | `public` | FR-003 |

`vote_result` 载荷：
`{ tally: Record<seat, number>, abstainCount: number, exiled: seat | null,
outcome: 'exile' | 'tie' | 'all-abstain' }`

`Claim`（research D6，结构化声明，AI 消费、UI 渲染 text）：
`{ kind: 'seer-claim'; target: seat; result: 'good' | 'werewolf' }`
（S0 只有预言家会发声明；集合封闭，扩角色时再扩。）

**不含墙钟时间戳**：事件只带 `seq`/`round`，保证 SC-003 的"整局全等"
比较不被时间字段污染。

## 2. 可见性投影规则（`eventsFor(seat)` 的过滤口径）

| visibility | 投影给座位 s 的条件 |
|---|---|
| `public` | 恒可见 |
| `wolf-team` | s 的 role = werewolf |
| `seer-private` | s 的 role = seer |
| `end` | 仅当 phase = game_over（终局翻牌）或载荷只关于 s 本人 |

人类 UI 只渲染 `eventsFor(humanSeat)`；AI 只读 `viewFor(seat)`——
两者同源于唯一投影函数，不存在第三条信息通道（信息隔离咽喉点）。

死者（观战）投影与生前一致 + 无操作权（FR-007）。

## 3. 序列化导出格式（FR-009）

```jsonc
// exportGame(): GameRecord —— 单 JSON 文档
{
  "schemaVersion": 1,          // 契约版本，破坏性变更时 +1 并在本文件登记
  "feature": "werewolf-s0",
  "seed": "lisa-2026-10-18",
  "events": [ /* 按序完整事件数组（含隐藏事实），每项含 type/seq/round/visibility */ ]
}
```

- 编码：UTF-8 JSON（单局内存态文档，非 JSONL；S0 无增量存储需求）
- 完整性：**仅凭 events 数组即可重建整局可见叙事**（谁说了什么、投了谁、
  谁何时死、何时终局）——SC-004 的验收口径即"用事件流回放出时间线"
- 导出通道（S0）：UI 终局"导出事件流"按钮，Blob 下载 `.json` 文件；
  测试中直接断言 `JSON.parse(JSON.stringify(exportGame()))` 深相等

## 4. 事件产出时机（与 data-model §3/§4 转移表一一对应）

| 转移 | 产出 |
|---|---|
| 1 startGame | game_started → night_started → roles_dealt |
| 2 wolfKill | wolf_kill_decided（→ 若跳查验直接进结算） |
| 3 seerCheck | seer_check_completed → 夜刀结算：player_died（若有）→ checkVictory |
| 4 dawn confirm | day_speak 起始（无事件，节奏由 state 表达） |
| 5 speak/skip | speech |
| 6 vote | vote_cast ×存活数 → 计票 → vote_result →（放逐时）player_died → checkVictory |
| 7 exile confirm | victory → game_over；或 night_started（round+1） |
