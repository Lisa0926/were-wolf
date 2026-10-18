/**
 * 结算与判定（data-model §4 = 规则 §4.3 的实现落点）
 *
 * - 夜刀结算：进入 dawn 时结算（转移 3 正常路径与转移 2 预言家已死直跳
 *   路径共用同一结算点）：死亡即翻牌（无救治）、即时判定
 * - 放逐结算：得票最多者放逐并翻牌；平票/全员弃票 = 平安日（转移 6 收齐时调用，见 settleVote）
 * - checkVictory：存活口径——狼=0 → 好人胜；狼 ≥ 好 → 狼胜
 */
import {
  evGameOver,
  evPlayerDied,
  evVictory,
  evVoteResult,
  type GameEvent,
  type VictoryReason,
  type VoteOutcome,
} from './events';
import type { Faction, GameState } from './types';

/** 存活口径胜负判定；未触发返回 null */
export function checkVictory(state: GameState): { faction: Faction; reason: VictoryReason } | null {
  const alive = state.players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === 'werewolf').length;
  const good = alive.length - wolves;
  if (wolves === 0) return { faction: 'good', reason: 'wolves-eliminated' };
  if (wolves >= good) return { faction: 'wolves', reason: 'wolves-parity' };
  return null;
}

/** 终局身份表（game_over.finalTable：全员身份与存活终表） */
function finalTable(state: GameState) {
  return state.players.map((p) => ({ seat: p.seat, role: p.role, alive: p.alive, isHuman: p.isHuman }));
}

/**
 * 夜刀结算：进入 dawn 的统一结算点。
 * 前置：state.nightKill 已由转移 2 写入。产出 player_died（含 revealedRole，
 * 死亡即翻牌）并立即判定——触发即 game_over，不再进入 dawn。
 */
export function settleNightKill(state: GameState, seq: number): { state: GameState; events: GameEvent[] } {
  const targetSeat = state.nightKill;
  if (targetSeat === undefined) {
    // 结构上不可达：每夜必有刀口。保守处理为无事发生进入 dawn。
    return { state: { ...state, phase: 'dawn', nightKill: undefined }, events: [] };
  }
  const victim = state.players.find((p) => p.seat === targetSeat)!;
  const players = state.players.map((p) =>
    p.seat === targetSeat
      ? { ...p, alive: false, death: { cause: 'night-kill' as const, round: state.round } }
      : p,
  );
  let next: GameState = { ...state, players, phase: 'dawn', nightKill: undefined };
  const events: GameEvent[] = [
    evPlayerDied(seq, state.round, targetSeat, victim.role, 'night-kill'),
  ];
  const v = checkVictory(next);
  if (v) {
    next = applyVictory(next, v);
    events.push(evVictory(seq + 1, state.round, v.faction, v.reason));
    events.push(evGameOver(seq + 2, state.round, finalTable(next)));
  }
  return { state: next, events };
}

/** 判定生效：写入 winner 并直接终局（不进入任何中间阶段） */
export function applyVictory(
  state: GameState,
  v: { faction: Faction; reason: VictoryReason },
): GameState {
  return { ...state, phase: 'game_over', winner: v };
}

/**
 * 放逐计票（转移 6 收齐时调用；规则 §4.3）：
 * max 唯一 → 放逐并翻牌；平票 = 无人放逐（平安日）；
 * 全员弃票 = 0 票平安日（与平票同路）。产出顺序（契约 §4）：
 * vote_result →（放逐时）player_died → 即时判定 →（触发时）victory + game_over。
 */
export function settleVote(state: GameState, seq: number): { state: GameState; events: GameEvent[] } {
  const tally: Record<number, number> = {};
  let abstainCount = 0;
  for (const choice of Object.values(state.votes)) {
    if (choice === undefined || choice === 'abstain') abstainCount++;
    else tally[choice] = (tally[choice] ?? 0) + 1;
  }
  const castCount = Object.values(tally).reduce((a, b) => a + b, 0);
  const maxVotes = Math.max(0, ...Object.values(tally));
  const winners = Object.keys(tally)
    .map(Number)
    .filter((s) => tally[s] === maxVotes);

  let outcome: VoteOutcome;
  let exiled: number | null = null;
  if (castCount === 0) {
    outcome = 'all-abstain'; // 全员弃票：与平票同路的平安日
  } else if (winners.length === 1) {
    outcome = 'exile';
    exiled = winners[0]!;
  } else {
    outcome = 'tie';
  }

  const events: GameEvent[] = [
    evVoteResult(seq, state.round, tally, abstainCount, exiled, outcome),
  ];
  let next: GameState = { ...state, phase: 'exile' };

  if (exiled !== null) {
    const victim = state.players.find((p) => p.seat === exiled)!;
    const players = state.players.map((p) =>
      p.seat === exiled
        ? { ...p, alive: false, death: { cause: 'exile' as const, round: state.round } }
        : p,
    );
    next = { ...next, players };
    events.push(evPlayerDied(seq + 1, state.round, exiled, victim.role, 'exile'));
    const v = checkVictory(next);
    if (v) {
      next = applyVictory(next, v);
      events.push(evVictory(seq + 2, state.round, v.faction, v.reason));
      events.push(evGameOver(seq + 3, state.round, finalTable(next)));
    }
  }
  return { state: next, events };
}

export { finalTable };
