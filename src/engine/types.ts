/**
 * 引擎类型层（data-model.md §1–§2 的唯一实现依据）
 *
 * 硬约束：本文件及整个 engine/ 零 react/DOM import；随机只走注入的
 * seeded RNG（不自行产生随机数）。
 */

export type Role = 'werewolf' | 'seer' | 'villager';
export type Faction = 'wolves' | 'good';

/** 规则 §2 板子：狼 2 / 预言家 1 / 村民 3（好人共 4） */
export const BOARD: readonly Role[] = [
  'werewolf',
  'werewolf',
  'seer',
  'villager',
  'villager',
  'villager',
];

export type Seat = 1 | 2 | 3 | 4 | 5 | 6;

export function factionOf(role: Role): Faction {
  return role === 'werewolf' ? 'wolves' : 'good';
}

export interface Death {
  cause: 'night-kill' | 'exile';
  round: number;
}

export interface PlayerState {
  seat: Seat;
  /** 发牌后不可变 */
  role: Role;
  /** 恰好 1 个真人席位 */
  isHuman: boolean;
  alive: boolean;
  death?: Death;
}

/** 与规则 §4.1 完全一致，不增不减 */
export type Phase =
  | 'idle'
  | 'night_wolf'
  | 'night_seer'
  | 'dawn'
  | 'day_speak'
  | 'vote'
  | 'exile'
  | 'game_over';

/** 发言声明（结构化，contracts/event-stream.md §1；S0 只有预言家发声明） */
export interface Claim {
  kind: 'seer-claim';
  target: number;
  result: 'good' | 'werewolf';
}

/**
 * 对局完整状态（engine 内部唯一事实，含所有已公开/未公开事实）。
 *
 * 派生事实不重复存储（data-model §1.4）：查验史/发言史/历轮计票
 * 一律从事件日志派生。`speech`/`votes`/`nightKill` 是"本轮工作数据"，
 * 与 votes 同级——只存当前轮，历史在日志。
 */
export interface GameState {
  phase: Phase;
  /** 从 1（首夜）递增；对应"第 N 夜/第 N 白天"同一编号 */
  round: number;
  /** 按座位升序；发牌后长度恒 6（idle 时为空） */
  players: PlayerState[];
  /** 本局种子（导出/复现用） */
  seed: string;
  speech: { day: number; order: number[]; cursor: number };
  votes: Partial<Record<number, number | 'abstain'>>;
  /** 本轮刀口：night_wolf 决定、进入 dawn 时消费并清除 */
  nightKill?: number;
  winner?: { faction: Faction; reason: 'wolves-eliminated' | 'wolves-parity' };
}

/**
 * 外部输入的唯一形态（data-model §2）。
 *
 * 与 data-model 的差异（实现期补充，已登记）：speak/skip/castVote/abstain
 * 增加可选 `actor`——data-model 的 Action 列表未携带行动者，但 §2 与
 * contracts/engine-api.md §3 都要求"行动者不符 → NOT_YOUR_TURN"可判定，
 * 无 actor 字段则该错误码结构上不可达。省略时引擎视为当前 pending 行动者。
 */
export type Action =
  | { type: 'startGame'; seed: string }
  | { type: 'wolfKill'; target: number }
  | { type: 'seerCheck'; target: number }
  | { type: 'speak'; text: string; claim?: Claim; actor?: number }
  | { type: 'skip'; actor?: number }
  | { type: 'castVote'; target: number; actor?: number }
  | { type: 'abstain'; actor?: number }
  | { type: 'confirm' };

export type EngineErrorCode = 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'ILLEGAL_TARGET' | 'GAME_OVER';

export interface EngineError {
  code: EngineErrorCode;
  message: string;
}

/** 非法 dispatch 的返回形态：状态不变、不产生事件 */
export type Err<T> = { error: T };

/** 驱动循环枢纽（contracts/engine-api.md §2） */
export interface PendingDecision {
  kind: 'wolf-kill' | 'seer-check' | 'speech' | 'vote';
  actor: number | 'wolf-team';
  /** speech 时为 [actor]；vote 含自己，弃票由 abstain 表达 */
  legalTargets: number[];
}
