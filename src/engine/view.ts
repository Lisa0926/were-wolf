/**
 * 可见信息投影（信息隔离的唯一咽喉点，data-model §6 + contracts/event-stream.md §2）
 *
 * 人类与 AI 消费同一投影（research D4）：UI 只渲染 `eventsFor(humanSeat)`，
 * AI 只读 `viewFor(seat)`——不存在第三条信息通道。
 *
 * 结构性隔离：`VisibleView` 的类型本身**无法表达"他人存活角色的明文"**——
 * players 只有 seat/alive/isHuman/revealedRole（死者才翻牌）；他人的身份
 * 在类型层就没有落点。运行期再由 tests/isolation.test.ts 锁定。
 *
 * 口径说明（实现期明确化的三处判断，均已登记在交付报告）：
 * 1. `teammates` = 全部狼队座位（含自己）——data-model §6 原文"狼队座位"，
 *    规则 §3「狼队互知身份」，因此狼对整张狼队名单是全知的。
 * 2. `speeches` 只收**实际发言**（`skipped=false`）：data-model §6 的
 *    VisibleSpeech 无 skipped 字段，若把跳过也写成空文本，会与"真空发言"
 *    不可区分；跳过事实仍可经 `eventsFor` 的公开 speech 事件获得。
 * 3. `pending` 只在**本座位存活且有权行动**时出现（狼刀：本座位是存活狼）。
 *    否则不出现——避免"night_seer 阶段的 pending.actor = 预言家座位"把
 *    预言家身份泄露给其他座位（推测型泄漏，比字段泄漏更隐蔽）。
 */
import type { Claim, GameState, PendingDecision, Phase, PlayerState, Role } from './types';
import type { CheckResult, GameEvent, VoteOutcome } from './events';
import type { Rng } from '../rng/rng';
import { derivePending } from './transition';

/** 公开可见的玩家条目：存活者只有公开事实，死者翻牌 */
export interface VisiblePlayer {
  seat: number;
  alive: boolean;
  isHuman: boolean;
  /** 仅死者携带（死亡即翻牌，规则 §4.3） */
  revealedRole?: Role;
}

/** 公开发言史条目（claim 为公开声明载荷） */
export interface VisibleSpeech {
  round: number;
  seat: number;
  text: string;
  claim?: Claim;
}

/** 公开计票史条目 */
export interface VisibleVoteResult {
  round: number;
  tally: Record<number, number>;
  abstainCount: number;
  exiled: number | null;
  outcome: VoteOutcome;
}

/** 本座位的待决策（仅当本座位有权且存活时出现） */
export interface VisiblePending {
  actor: number | 'wolf-team';
  kind: PendingDecision['kind'];
}

/** 某座位的可见信息视图（data-model §6；人类渲染与 AI 决策共用） */
export interface VisibleView {
  round: number;
  phase: Phase;
  you: { seat: number; role: Role; alive: boolean };
  /** 按座位升序，长度恒 6；他人存活身份无字段可表达 */
  players: VisiblePlayer[];
  /** 仅 werewolf：狼队座位（含自己） */
  teammates?: number[];
  /** 仅 seer：自己的查验史（从事件日志派生，唯一事实在日志） */
  seerChecks?: Array<{ target: number; result: CheckResult; round: number }>;
  speeches: VisibleSpeech[];
  voteResults: VisibleVoteResult[];
  pending?: VisiblePending;
}

/** AI 决策输入（data-model §7；ai/ 对 engine 的全部依赖） */
export interface DecisionRequest {
  kind: PendingDecision['kind'];
  /** 决策输入唯一来源（FR-008） */
  view: VisibleView;
  /** 引擎算好的合法目标（vote 含"自己"，弃票由 abstain 语义表达） */
  legalTargets: number[];
  /** 单流借出（research D3），仅本次决策内使用 */
  rng: Rng;
}

/** 取本座位玩家；未发牌（idle）或非法座位直接抛错——投影的前置条件 */
function requirePlayer(state: GameState, seat: number): PlayerState {
  const player = state.players.find((p) => p.seat === seat);
  if (!player) throw new Error(`投影失败：座位 ${seat} 不在本局中（未发牌或非法座位）`);
  return player;
}

/** 本座位可见的事件投影流（UI 日志渲染数据源，硬约束 4） */
export function eventsFor(state: GameState, log: readonly GameEvent[], seat: number): GameEvent[] {
  const me = requirePlayer(state, seat);
  return log.filter((ev) => visibleTo(ev, state, me.seat, me.role));
}

function visibleTo(ev: GameEvent, state: GameState, seat: number, role: Role): boolean {
  switch (ev.visibility) {
    case 'public':
      return true;
    case 'wolf-team':
      return role === 'werewolf';
    case 'seer-private':
      return role === 'seer';
    case 'end':
      // 终局翻牌，或载荷只关于本人（S0 唯一的 end 事件是 roles_dealt，
      // 它总是全座位载荷，故终局前对所有人不可见——本人身份由 view.you 得知）
      return state.phase === 'game_over' || onlyAboutSeat(ev, seat);
  }
}

/** 载荷是否只关于该座位本人（end 可见性的第二分支） */
function onlyAboutSeat(ev: GameEvent, seat: number): boolean {
  if (ev.type === 'roles_dealt') {
    const seats = Object.keys(ev.assignment);
    return seats.length === 1 && Number(seats[0]) === seat;
  }
  // 其余类型目前都不是 end 可见性；保守口径：不外泄
  return false;
}

/** 某座位的可见信息视图（data-model §6） */
export function viewFor(state: GameState, log: readonly GameEvent[], seat: number): VisibleView {
  const me = requirePlayer(state, seat);

  const view: VisibleView = {
    round: state.round,
    phase: state.phase,
    you: { seat: me.seat, role: me.role, alive: me.alive },
    players: state.players.map((p) => ({
      seat: p.seat,
      alive: p.alive,
      isHuman: p.isHuman,
      // 存活者**没有** revealedRole 字段——他人隐藏身份在类型层无落点
      ...(p.alive ? {} : { revealedRole: p.role }),
    })),
    speeches: log
      .filter((ev): ev is Extract<GameEvent, { type: 'speech' }> => ev.type === 'speech' && !ev.skipped)
      .map((ev) => ({
        round: ev.round,
        seat: ev.seat,
        text: ev.text,
        ...(ev.claim ? { claim: { ...ev.claim } } : {}),
      })),
    voteResults: log
      .filter((ev): ev is Extract<GameEvent, { type: 'vote_result' }> => ev.type === 'vote_result')
      .map((ev) => ({
        round: ev.round,
        tally: { ...ev.tally },
        abstainCount: ev.abstainCount,
        exiled: ev.exiled,
        outcome: ev.outcome,
      })),
  };

  // 狼：狼队座位（规则 §3 狼队互知身份）
  if (me.role === 'werewolf') {
    view.teammates = state.players
      .filter((p) => p.role === 'werewolf')
      .map((p) => p.seat)
      .sort((a, b) => a - b);
  }
  // 预言家：自己的查验史（从日志派生）
  if (me.role === 'seer') {
    view.seerChecks = log
      .filter((ev): ev is Extract<GameEvent, { type: 'seer_check_completed' }> => ev.type === 'seer_check_completed')
      .map((ev) => ({ target: ev.target, result: ev.result, round: ev.round }));
  }
  // pending：只在本人存活且有权行动时出现（口径见文件头第 3 条）
  const pending = pendingForSeat(state, me);
  if (pending) view.pending = pending;

  return view;
}

/** 本座位是否有权行动；无操作权（死者）恒为 null */
function pendingForSeat(state: GameState, me: PlayerState): VisiblePending | null {
  if (!me.alive) return null;
  const pending = derivePending(state);
  if (!pending) return null;
  if (pending.actor === me.seat) return { actor: pending.actor, kind: pending.kind };
  // 狼刀为狼队一个声音：存活狼都能拿到这条待决策
  if (pending.actor === 'wolf-team' && me.role === 'werewolf') {
    return { actor: pending.actor, kind: pending.kind };
  }
  return null;
}
