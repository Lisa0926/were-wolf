import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import type { GameEvent } from '../src/engine/events';
import type { Action, EngineError, Err, Role } from '../src/engine/types';

/**
 * T4 胜负判定（tasks T014–T015；FR-003；§8 第 7 条）
 *
 * 边界矩阵口径（规则 §4.3，先口径后场景）：
 * - 夜刀 × 狼胜：夜刀把局面砍成 狼≥好 → dawn 结算即终局
 * - 放逐 × 狼胜：放逐把局面投成 狼≥好 → 计票结算即终局
 * - 放逐 × 好人胜：放逐最后一狼（狼=0）→ 计票结算即终局
 * - 夜刀 × 好人胜：结构不可达——夜刀只能刀好人，好人死亡不可能让狼=0；
 *   本套件以注释留痕，不造非法场景
 * 判定即时性：每次 player_died 后立即判定，触发即 game_over，不进入 dawn/exile
 * §2 推演复演：狼最快 1 夜 1 日；好人最快 2 夜 2 日
 */

function startGame(seed: string): Engine {
  const engine = createGame(seed);
  const res = engine.dispatch({ type: 'startGame', seed });
  if (!Array.isArray(res)) throw new Error(`startGame 被拒: ${JSON.stringify(res)}`);
  return engine;
}

function ok(engine: Engine, action: Action): GameEvent[] {
  const res = engine.dispatch(action);
  if (!Array.isArray(res)) throw new Error(`dispatch ${JSON.stringify(action)} 被拒: ${JSON.stringify(res)}`);
  return res;
}

function isErr(r: GameEvent[] | Err<EngineError>): r is Err<EngineError> {
  return !Array.isArray(r);
}

const seatsOf = (engine: Engine, role: Role) =>
  engine.state.players.filter((p) => p.role === role).map((p) => p.seat);

const aliveSeats = (engine: Engine) =>
  engine.state.players.filter((p) => p.alive).map((p) => p.seat).sort((a, b) => a - b);

const aliveCount = (engine: Engine, role: Role) =>
  engine.state.players.filter((p) => p.alive && p.role === role).length;

/** 走完一夜：狼刀 → （预言家存活则查验）→ 天亮或终局 */
function night(engine: Engine, killTarget: number): GameEvent[] {
  const evs = ok(engine, { type: 'wolfKill', target: killTarget });
  if (engine.state.phase === 'night_seer') {
    const target = engine.pendingDecision!.legalTargets[0]!;
    return [...evs, ...ok(engine, { type: 'seerCheck', target })];
  }
  return evs;
}

/** 白天：confirm dawn（若在天亮）→ 全员 skip → 全员投 target（凑齐票数） */
function dayExile(engine: Engine, target: number): GameEvent[] {
  if (engine.state.phase === 'dawn') ok(engine, { type: 'confirm' });
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
  const evs: GameEvent[] = [];
  for (const seat of aliveSeats(engine)) evs.push(...ok(engine, { type: 'castVote', target, actor: seat }));
  return evs;
}

/** 白天：全员 skip → 全员弃票（平安日）→ exile confirm（若进入 exile） */
function dayPeace(engine: Engine): void {
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'abstain', actor: seat });
  if (engine.state.phase === 'exile') ok(engine, { type: 'confirm' });
}

describe('T4 胜负判定（FR-003，§8 第 7 条）', () => {
  it('§2 狼最快 1 夜 1 日：夜刀 1 好（2狼3好）→ 放逐 1 好（2狼2好）→ 狼胜', () => {
    const engine = startGame('vic-wolf-fast');
    const victimNight = seatsOf(engine, 'villager')[0]!;
    night(engine, victimNight);
    expect(engine.state.phase).toBe('dawn');
    expect(aliveCount(engine, 'werewolf')).toBe(2);
    expect(aliveCount(engine, 'seer') + aliveCount(engine, 'villager')).toBe(3);

    const victimDay = seatsOf(engine, 'villager').find((s) => aliveSeats(engine).includes(s))!;
    const evs = dayExile(engine, victimDay);
    expect(engine.state.phase).toBe('game_over'); // 不经过 exile（判定即时）
    expect(aliveCount(engine, 'werewolf')).toBe(2);
    expect(aliveCount(engine, 'seer') + aliveCount(engine, 'villager')).toBe(2);
    expect(engine.state.winner).toEqual({ faction: 'wolves', reason: 'wolves-parity' });
    const types = evs.map((e) => e.type);
    expect(types).toEqual(['vote_cast', 'vote_cast', 'vote_cast', 'vote_cast', 'vote_cast', 'vote_result', 'player_died', 'victory', 'game_over']);
    const victory = evs.find((e) => e.type === 'victory')!;
    expect(victory).toMatchObject({ winner: 'wolves', reason: 'wolves-parity', visibility: 'public' });
  });

  it('§2 好人最快 2 夜 2 日：夜刀1好→日投1狼→夜刀1好→日投1狼 → 0 狼好人胜', () => {
    const engine = startGame('vic-good-fast');
    const wolfA = seatsOf(engine, 'werewolf')[0]!;
    const wolfB = seatsOf(engine, 'werewolf')[1]!;

    // 夜1：刀 1 村民（2狼3好）
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    // 日1：投出 wolfA（1狼3好）
    dayExile(engine, wolfA);
    expect(engine.state.phase).toBe('exile');
    ok(engine, { type: 'confirm' });
    expect(engine.state.phase).toBe('night_wolf');
    expect(engine.state.round).toBe(2);
    expect(aliveCount(engine, 'werewolf')).toBe(1);

    // 夜2：刀 1 村民（1狼2好）
    night(engine, seatsOf(engine, 'villager').find((s) => aliveSeats(engine).includes(s))!);
    ok(engine, { type: 'confirm' });
    // 日2：投出 wolfB（0 狼 → 好人胜）
    const evs = dayExile(engine, wolfB);
    expect(engine.state.phase).toBe('game_over');
    expect(engine.state.winner).toEqual({ faction: 'good', reason: 'wolves-eliminated' });
    expect(evs.some((e) => e.type === 'victory')).toBe(true);
    expect(aliveCount(engine, 'werewolf')).toBe(0);
  });

  it('夜刀 × 狼胜：夜刀把局面砍成 狼≥好 → dawn 即终局（不进入 dawn 展示）', () => {
    const engine = startGame('vic-night-wolves');
    const seer = seatsOf(engine, 'seer')[0]!;
    // 夜1 刀预言家（当夜仍查验）→ 天亮 2狼3好；日1 全弃平安日
    night(engine, seer);
    expect(engine.state.phase).toBe('dawn');
    ok(engine, { type: 'confirm' });
    dayPeace(engine);
    expect(engine.state.phase).toBe('night_wolf');
    expect(engine.state.round).toBe(2);
    // 夜2 刀 1 村民 → 2狼2好 → 狼胜（预言家已死：收刀直跳结算，无查验）
    const villager = seatsOf(engine, 'villager').find((s) => aliveSeats(engine).includes(s))!;
    const evs = night(engine, villager);
    expect(engine.state.phase).toBe('game_over');
    expect(engine.state.winner).toEqual({ faction: 'wolves', reason: 'wolves-parity' });
    expect(evs.map((e) => e.type)).toEqual(['wolf_kill_decided', 'player_died', 'victory', 'game_over']);
  });

  it('放逐 × 狼胜与即时性：放逐好人触发 parity → 不经过 exile，事件以 victory+game_over 收尾', () => {
    const engine = startGame('vic-exile-wolves');
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    // 放逐 1 好人：2狼2好 → 狼胜
    const goodSeat = [seatsOf(engine, 'seer')[0]!, ...seatsOf(engine, 'villager')].find((s) =>
      aliveSeats(engine).includes(s),
    )!;
    const evs = dayExile(engine, goodSeat);
    expect(engine.state.phase).toBe('game_over'); // 从 vote 直接跳 game_over，不停留 exile
    expect(engine.state.winner?.faction).toBe('wolves');
    const tail = evs.slice(-2).map((e) => e.type);
    expect(tail).toEqual(['victory', 'game_over']);
  });

  it('放逐 × 好人胜：投出最后一狼 → wolves-eliminated', () => {
    const engine = startGame('vic-exile-good');
    const wolfA = seatsOf(engine, 'werewolf')[0]!;
    const wolfB = seatsOf(engine, 'werewolf')[1]!;
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    dayExile(engine, wolfA); // → 1狼3好，未触发
    expect(engine.state.phase).toBe('exile');
    ok(engine, { type: 'confirm' });
    night(engine, seatsOf(engine, 'villager').find((s) => aliveSeats(engine).includes(s))!);
    ok(engine, { type: 'confirm' });
    const evs = dayExile(engine, wolfB);
    expect(engine.state.phase).toBe('game_over');
    expect(engine.state.winner).toEqual({ faction: 'good', reason: 'wolves-eliminated' });
    expect(evs.slice(-2).map((e) => e.type)).toEqual(['victory', 'game_over']);
  });

  it('game_over 事件：finalTable = 全员 6 项（身份+存活+真人标记）', () => {
    const engine = startGame('vic-final-table');
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    const goodSeat = [seatsOf(engine, 'seer')[0]!, ...seatsOf(engine, 'villager')].find((s) =>
      aliveSeats(engine).includes(s),
    )!;
    const evs = dayExile(engine, goodSeat);
    const gameOver = evs.find((e) => e.type === 'game_over')!;
    if (gameOver.type !== 'game_over') throw new Error('unreachable');
    expect(gameOver.finalTable).toHaveLength(6);
    for (const row of gameOver.finalTable) {
      expect(engine.state.players.find((p) => p.seat === row.seat)!.alive).toBe(row.alive);
      expect(engine.state.players.find((p) => p.seat === row.seat)!.role).toBe(row.role);
    }
    expect(gameOver.finalTable.filter((r) => r.isHuman)).toHaveLength(1);
  });

  it('exile confirm 未触发判定 → night_wolf（round+1，产出 night_started）', () => {
    const engine = startGame('vic-exile-continue');
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    dayExile(engine, seatsOf(engine, 'werewolf')[0]!); // 放逐狼 → 1狼3好，未触发
    expect(engine.state.phase).toBe('exile');
    const evs = ok(engine, { type: 'confirm' });
    expect(evs.map((e) => e.type)).toEqual(['night_started']);
    expect(engine.state.phase).toBe('night_wolf');
    expect(engine.state.round).toBe(2);
    expect(engine.state.votes).toEqual({});
  });

  it('终局后提交任何动作 → GAME_OVER（错误码，状态不变）', () => {
    const engine = startGame('vic-gameover-code');
    night(engine, seatsOf(engine, 'villager')[0]!);
    ok(engine, { type: 'confirm' });
    const goodSeat = [seatsOf(engine, 'seer')[0]!, ...seatsOf(engine, 'villager')].find((s) =>
      aliveSeats(engine).includes(s),
    )!;
    dayExile(engine, goodSeat);
    expect(engine.state.phase).toBe('game_over');
    const before = engine.state;
    const logLen = engine.eventLog.length;
    for (const action of [
      { type: 'confirm' },
      { type: 'wolfKill', target: 1 },
      { type: 'skip', actor: 1 },
      { type: 'castVote', target: 2, actor: 1 },
    ] as Action[]) {
      const res = engine.dispatch(action);
      if (!isErr(res)) throw new Error('应返回 Err');
      expect(res.error.code).toBe('GAME_OVER');
    }
    expect(engine.state).toEqual(before);
    expect(engine.eventLog.length).toBe(logLen);
  });
});
