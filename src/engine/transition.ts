/**
 * 转移表（data-model §3，逐行映射规则 §4.2——唯一实现依据）
 *
 * 纯函数：state 进 → { state, events } 出，无副作用；
 * 随机流与事件序号由调用方（Engine 门面）经 ctx 注入。
 */
import type { Rng } from '../rng/rng';
import {
  evGameOver,
  evGameStarted,
  evNightStarted,
  evRolesDealt,
  evSeerCheckCompleted,
  evSpeech,
  evVictory,
  evVoteCast,
  evWolfKillDecided,
  type GameEvent,
} from './events';
import { applyVictory, checkVictory, finalTable, settleNightKill, settleVote } from './settle';
import {
  BOARD,
  type Action,
  type EngineError,
  type GameState,
  type PendingDecision,
  type PlayerState,
  type Role,
  type Seat,
} from './types';

export interface TransitionCtx {
  rng: Rng;
  /** 下一个可用事件序号（= 引擎日志长度 + 1） */
  seq: number;
}

export type TransitionResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: EngineError };

const err = (code: EngineError['code'], message: string): TransitionResult => ({
  ok: false,
  error: { code, message },
});

export function transition(state: GameState, action: Action, ctx: TransitionCtx): TransitionResult {
  if (state.phase === 'game_over') {
    return err('GAME_OVER', '终局后不可再提交任何动作');
  }
  switch (action.type) {
    case 'startGame':
      return startGame(state, ctx);
    case 'wolfKill':
      return wolfKill(state, action, ctx);
    case 'seerCheck':
      return seerCheck(state, action, ctx);
    case 'confirm':
      return confirm(state, ctx);
    case 'speak':
    case 'skip':
      return speakOrSkip(state, action, ctx);
    case 'castVote':
    case 'abstain':
      return castVoteOrAbstain(state, action, ctx);
    default:
      // 所有 Action 分支均已覆盖；此分支不可达
      return err('WRONG_PHASE', `当前阶段 ${state.phase} 不接受该动作`);
  }
}

/** —— 转移 1：idle --startGame--> night_wolf（round=1）—— */
function startGame(state: GameState, ctx: TransitionCtx): TransitionResult {
  if (state.phase !== 'idle') {
    return err('WRONG_PHASE', `startGame 仅在 idle 可用（当前 ${state.phase}）`);
  }
  // seed 以 createGame 为准（ctx.rng 即由它构造）；action.seed 为形态冗余字段
  const roles = ctx.rng.shuffle(BOARD); // 洗牌结果下标 i → 座位 i+1
  const humanSeat = ctx.rng.int(1, 7); // 真人座位随机（规则 §4.4）
  const players: PlayerState[] = roles.map((role, i) => ({
    seat: (i + 1) as Seat,
    role,
    isHuman: i + 1 === humanSeat,
    alive: true,
  }));
  const assignment: Record<number, Role> = {};
  for (const p of players) assignment[p.seat] = p.role;

  const nextState: GameState = {
    phase: 'night_wolf',
    round: 1,
    players,
    seed: state.seed,
    speech: { day: 0, order: [], cursor: 0 },
    votes: {},
  };
  const events: GameEvent[] = [
    evGameStarted(ctx.seq, 1, state.seed, BOARD),
    evNightStarted(ctx.seq + 1, 1),
    evRolesDealt(ctx.seq + 2, 1, assignment),
  ];
  return { ok: true, state: nextState, events };
}

/** —— 转移 2：night_wolf --wolfKill--> night_seer（预言家已死直跳 dawn，FR-006）—— */
function wolfKill(
  state: GameState,
  action: Extract<Action, { type: 'wolfKill' }>,
  ctx: TransitionCtx,
): TransitionResult {
  if (state.phase !== 'night_wolf') {
    return err('WRONG_PHASE', `wolfKill 仅在 night_wolf 可用（当前 ${state.phase}）`);
  }
  const target = state.players.find((p) => p.seat === action.target);
  if (!target || !target.alive || target.role === 'werewolf') {
    return err('ILLEGAL_TARGET', `刀口须为存活好人（收到 ${action.target}）`);
  }
  const decided: GameState = { ...state, nightKill: action.target };
  const events: GameEvent[] = [evWolfKillDecided(ctx.seq, state.round, action.target)];

  const seer = state.players.find((p) => p.role === 'seer');
  if (seer?.alive) {
    return { ok: true, state: { ...decided, phase: 'night_seer' }, events };
  }
  // 预言家已死：直跳 dawn 并结算（§4.5 第 1 行）
  const settled = settleNightKill(decided, ctx.seq + 1);
  return { ok: true, state: settled.state, events: [...events, ...settled.events] };
}

/** —— 转移 3：night_seer --seerCheck--> dawn（结算刀口死亡；重复验同一人不禁止）—— */
function seerCheck(
  state: GameState,
  action: Extract<Action, { type: 'seerCheck' }>,
  ctx: TransitionCtx,
): TransitionResult {
  if (state.phase !== 'night_seer') {
    return err('WRONG_PHASE', `seerCheck 仅在 night_seer 可用（当前 ${state.phase}）`);
  }
  const seer = state.players.find((p) => p.role === 'seer');
  if (!seer || !seer.alive) {
    return err('WRONG_PHASE', 'night_seer 阶段预言家必须存活（结构上不可达）');
  }
  const target = state.players.find((p) => p.seat === action.target);
  if (!target || !target.alive || target.seat === seer.seat) {
    return err('ILLEGAL_TARGET', `查验目标须为存活他人（收到 ${action.target}）`);
  }
  const events: GameEvent[] = [
    evSeerCheckCompleted(
      ctx.seq,
      state.round,
      action.target,
      target.role === 'werewolf' ? 'werewolf' : 'good',
    ),
  ];
  const settled = settleNightKill(state, ctx.seq + 1);
  return { ok: true, state: settled.state, events: [...events, ...settled.events] };
}

/** —— 转移 4（dawn confirm → day_speak）与转移 7（exile confirm → 判定 → night_wolf 或 game_over）—— */
function confirm(state: GameState, ctx: TransitionCtx): TransitionResult {
  if (state.phase === 'dawn') {
    const order = state.players
      .filter((p) => p.alive)
      .map((p) => p.seat)
      .sort((a, b) => a - b);
    return {
      ok: true,
      state: { ...state, phase: 'day_speak', speech: { day: state.round, order, cursor: 0 } },
      events: [],
    };
  }
  if (state.phase === 'exile') {
    // 转移 7：胜负判定（防御性复检——死亡时的即时判定已在转移 6 结算点完成，
    // 到达 exile 说明当时未触发；此处按转移表保持显式判定步骤）
    const v = checkVictory(state);
    if (v) {
      const next = applyVictory(state, v);
      return {
        ok: true,
        state: next,
        events: [
          evVictory(ctx.seq, state.round, v.faction, v.reason),
          evGameOver(ctx.seq + 1, state.round, finalTable(next)),
        ],
      };
    }
    // 未触发 → 下一夜（round+1），清空本轮工作数据
    return {
      ok: true,
      state: {
        ...state,
        phase: 'night_wolf',
        round: state.round + 1,
        speech: { day: 0, order: [], cursor: 0 },
        votes: {},
        nightKill: undefined,
      },
      events: [evNightStarted(ctx.seq, state.round + 1)],
    };
  }
  return err('WRONG_PHASE', `confirm 仅在 dawn/exile 可用（当前 ${state.phase}）`);
}

/** —— 转移 5：day_speak --speak/skip--> 下一位存活者；全员说完 → vote —— */
function speakOrSkip(
  state: GameState,
  action: Extract<Action, { type: 'speak' }> | Extract<Action, { type: 'skip' }>,
  ctx: TransitionCtx,
): TransitionResult {
  if (state.phase !== 'day_speak') {
    return err('WRONG_PHASE', `speak/skip 仅在 day_speak 可用（当前 ${state.phase}）`);
  }
  const actor = state.speech.order[state.speech.cursor];
  if (actor === undefined) {
    return err('WRONG_PHASE', '发言游标越界（结构上不可达）');
  }
  if (action.actor !== undefined && action.actor !== actor) {
    return err('NOT_YOUR_TURN', `当前发言者是 ${actor}（收到 ${action.actor}）`);
  }
  const skipped = action.type === 'skip';
  const text = skipped ? '' : action.text;
  const claim = action.type === 'speak' ? action.claim : undefined;
  const events: GameEvent[] = [evSpeech(ctx.seq, state.round, actor, text, skipped, claim)];

  const cursor = state.speech.cursor + 1;
  const speech = { ...state.speech, cursor };
  if (cursor < state.speech.order.length) {
    return { ok: true, state: { ...state, speech }, events };
  }
  // 全员说完 → vote（重新清空票箱）
  return { ok: true, state: { ...state, phase: 'vote', speech, votes: {} }, events };
}

/** —— 转移 6：vote --castVote/abstain ×存活数--> 齐票计票 → exile（或触发判定直接 game_over）—— */
function castVoteOrAbstain(
  state: GameState,
  action: Extract<Action, { type: 'castVote' }> | Extract<Action, { type: 'abstain' }>,
  ctx: TransitionCtx,
): TransitionResult {
  if (state.phase !== 'vote') {
    return err('WRONG_PHASE', `castVote/abstain 仅在 vote 可用（当前 ${state.phase}）`);
  }
  const alive = state.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  const expected = alive.find((s) => !(s in state.votes));
  if (expected === undefined) {
    return err('WRONG_PHASE', '票已收齐（结构上不可达）');
  }
  if (action.actor !== undefined && action.actor !== expected) {
    return err('NOT_YOUR_TURN', `轮到 ${expected} 投票（收到 ${action.actor}）`);
  }
  if (action.type === 'castVote') {
    const target = state.players.find((p) => p.seat === action.target);
    if (!target || !target.alive) {
      return err('ILLEGAL_TARGET', `投票目标须为存活者（收到 ${action.target}）`);
    }
  }
  const choice = action.type === 'abstain' ? ('abstain' as const) : action.target;
  const votes = { ...state.votes, [expected]: choice };
  const events: GameEvent[] = [evVoteCast(ctx.seq, state.round, expected, choice)];

  if (Object.keys(votes).length < alive.length) {
    return { ok: true, state: { ...state, votes }, events };
  }
  // 收齐 → 计票（settleVote 含 vote_result/放逐/即时判定）
  const settled = settleVote({ ...state, votes }, ctx.seq + 1);
  return { ok: true, state: settled.state, events: [...events, ...settled.events] };
}

/** —— pendingDecision 推导（驱动循环唯一依据，契约 §2）—— */
export function derivePending(state: GameState): PendingDecision | null {
  const aliveSeats = state.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  switch (state.phase) {
    case 'idle':
    case 'dawn':
    case 'exile':
    case 'game_over':
      return null;
    case 'night_wolf':
      return {
        kind: 'wolf-kill',
        actor: 'wolf-team',
        legalTargets: state.players.filter((p) => p.alive && p.role !== 'werewolf').map((p) => p.seat),
      };
    case 'night_seer': {
      const seer = state.players.find((p) => p.role === 'seer' && p.alive);
      if (!seer) return null; // 结构上不可达：night_seer 阶段预言家必存活
      return {
        kind: 'seer-check',
        actor: seer.seat,
        legalTargets: aliveSeats.filter((s) => s !== seer.seat),
      };
    }
    case 'day_speak': {
      const actor = state.speech.order[state.speech.cursor];
      if (actor === undefined) return null; // 结构上不可达：游标必在 order 内
      return { kind: 'speech', actor, legalTargets: [actor] };
    }
    case 'vote': {
      const actor = aliveSeats.find((s) => !(s in state.votes));
      if (actor === undefined) return null; // 结构上不可达：齐票即离开 vote
      return { kind: 'vote', actor, legalTargets: [...aliveSeats] };
    }
  }
}
