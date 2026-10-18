/**
 * 对局事件流类型与构造器（contracts/event-stream.md §1 的唯一实现依据）
 *
 * 9 类事件（11 个具体 type：vote_cast/vote_result 与 victory/game_over
 * 各为契约表第 8/9 行的两个成员）。公共字段：seq（全局递增，从 1 起）、
 * round（1 起）、visibility。不含墙钟时间戳（SC-003 复现承诺）。
 */
import type { Claim, Faction, PlayerState, Role } from './types';

export type Visibility = 'public' | 'wolf-team' | 'seer-private' | 'end';

export type CheckResult = 'good' | 'werewolf';
export type VoteOutcome = 'exile' | 'tie' | 'all-abstain';
export type VictoryReason = 'wolves-eliminated' | 'wolves-parity';

interface EventBase {
  seq: number;
  round: number;
  visibility: Visibility;
}

export interface GameStartedEvent extends EventBase {
  type: 'game_started';
  seed: string;
  board: Role[];
}
export interface RolesDealtEvent extends EventBase {
  type: 'roles_dealt';
  assignment: Record<number, Role>;
}
export interface NightStartedEvent extends EventBase {
  type: 'night_started';
}
export interface WolfKillDecidedEvent extends EventBase {
  type: 'wolf_kill_decided';
  target: number;
}
export interface SeerCheckCompletedEvent extends EventBase {
  type: 'seer_check_completed';
  target: number;
  result: CheckResult;
}
export interface PlayerDiedEvent extends EventBase {
  type: 'player_died';
  seat: number;
  revealedRole: Role;
  cause: 'night-kill' | 'exile';
}
export interface SpeechEvent extends EventBase {
  type: 'speech';
  seat: number;
  text: string;
  claim?: Claim;
  skipped: boolean;
}
export interface VoteCastEvent extends EventBase {
  type: 'vote_cast';
  voter: number;
  target: number | 'abstain';
}
export interface VoteResultEvent extends EventBase {
  type: 'vote_result';
  tally: Record<number, number>;
  abstainCount: number;
  exiled: number | null;
  outcome: VoteOutcome;
}
export interface VictoryEvent extends EventBase {
  type: 'victory';
  winner: Faction;
  reason: VictoryReason;
}
export interface GameOverEvent extends EventBase {
  type: 'game_over';
  finalTable: Array<Pick<PlayerState, 'seat' | 'role' | 'alive' | 'isHuman'>>;
}

export type GameEvent =
  | GameStartedEvent
  | RolesDealtEvent
  | NightStartedEvent
  | WolfKillDecidedEvent
  | SeerCheckCompletedEvent
  | PlayerDiedEvent
  | SpeechEvent
  | VoteCastEvent
  | VoteResultEvent
  | VictoryEvent
  | GameOverEvent;

/** —— 构造器：统一收口公共字段与可见性标注 —— */

export const evGameStarted = (
  seq: number,
  round: number,
  seed: string,
  board: readonly Role[],
): GameStartedEvent => ({ type: 'game_started', seq, round, visibility: 'public', seed, board: [...board] });

export const evRolesDealt = (
  seq: number,
  round: number,
  assignment: Record<number, Role>,
): RolesDealtEvent => ({ type: 'roles_dealt', seq, round, visibility: 'end', assignment: { ...assignment } });

export const evNightStarted = (seq: number, round: number): NightStartedEvent => ({
  type: 'night_started',
  seq,
  round,
  visibility: 'public',
});

export const evWolfKillDecided = (seq: number, round: number, target: number): WolfKillDecidedEvent => ({
  type: 'wolf_kill_decided',
  seq,
  round,
  visibility: 'wolf-team',
  target,
});

export const evSeerCheckCompleted = (
  seq: number,
  round: number,
  target: number,
  result: CheckResult,
): SeerCheckCompletedEvent => ({
  type: 'seer_check_completed',
  seq,
  round,
  visibility: 'seer-private',
  target,
  result,
});

export const evPlayerDied = (
  seq: number,
  round: number,
  seat: number,
  revealedRole: Role,
  cause: 'night-kill' | 'exile',
): PlayerDiedEvent => ({
  type: 'player_died',
  seq,
  round,
  visibility: 'public',
  seat,
  revealedRole,
  cause,
});

export const evSpeech = (
  seq: number,
  round: number,
  seat: number,
  text: string,
  skipped: boolean,
  claim?: Claim,
): SpeechEvent => ({
  type: 'speech',
  seq,
  round,
  visibility: 'public',
  seat,
  text,
  ...(claim ? { claim } : {}),
  skipped,
});

export const evVoteCast = (
  seq: number,
  round: number,
  voter: number,
  target: number | 'abstain',
): VoteCastEvent => ({ type: 'vote_cast', seq, round, visibility: 'public', voter, target });

export const evVoteResult = (
  seq: number,
  round: number,
  tally: Record<number, number>,
  abstainCount: number,
  exiled: number | null,
  outcome: VoteOutcome,
): VoteResultEvent => ({
  type: 'vote_result',
  seq,
  round,
  visibility: 'public',
  tally: { ...tally },
  abstainCount,
  exiled,
  outcome,
});

export const evVictory = (
  seq: number,
  round: number,
  winner: Faction,
  reason: VictoryReason,
): VictoryEvent => ({ type: 'victory', seq, round, visibility: 'public', winner, reason });

export const evGameOver = (
  seq: number,
  round: number,
  finalTable: GameOverEvent['finalTable'],
): GameOverEvent => ({
  type: 'game_over',
  seq,
  round,
  visibility: 'public',
  finalTable: finalTable.map((p) => ({ ...p })),
});

/** —— 序列化导出（contracts/event-stream.md §3，FR-009）—— */

/** 导出契约版本：破坏性变更时 +1，并在 event-stream.md §3 登记 */
export const SCHEMA_VERSION = 1 as const;
/** 导出文档的特性标识 */
export const GAME_RECORD_FEATURE = 'werewolf-s0' as const;

/** 单局导出文档（单 JSON 文档，非 JSONL；S0 无增量存储需求） */
export interface GameRecord {
  schemaVersion: typeof SCHEMA_VERSION;
  feature: typeof GAME_RECORD_FEATURE;
  seed: string;
  events: GameEvent[];
}

/**
 * 导出整局事件流（含隐藏事实，硬约束 4 / D35）。
 *
 * - 完整性：仅凭 events 即可重建整局可见叙事（SC-004 口径，T025 断言）
 * - 纯 JSON：事件本身不含墙钟时间戳，只有 seq/round；导出走一次 JSON 往返，
 *   既保证结果与引擎日志互不共享引用（调用方可安全改写/下载），也保证
 *   返回值可被 `JSON.parse(JSON.stringify(...))` 无损往返（契约 §3）
 */
export function exportGame(seed: string, log: readonly GameEvent[]): GameRecord {
  return {
    schemaVersion: SCHEMA_VERSION,
    feature: GAME_RECORD_FEATURE,
    seed,
    events: JSON.parse(JSON.stringify(log)) as GameEvent[],
  };
}
