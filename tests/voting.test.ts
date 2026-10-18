import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import type { GameEvent } from '../src/engine/events';
import type { Action, EngineError, Err, Role } from '../src/engine/types';

/**
 * T3 投票（tasks T012–T013；FR-005；§8 第 6 条）
 * 口径：夜1刀1村民后进入首个白天（存活 5 人），全员 skip 进入 vote；
 * 行动者按座次轮到（显式带 actor 校验 NOT_YOUR_TURN）
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

/** 夜1 刀首村民 → 预言家查验 → 天亮 → 全员跳过 → 停在 vote（存活 5 人） */
function playToVote(seed: string) {
  const engine = startGame(seed);
  const victim = seatsOf(engine, 'villager')[0]!;
  ok(engine, { type: 'wolfKill', target: victim });
  ok(engine, { type: 'seerCheck', target: seatsOf(engine, 'werewolf')[0]! });
  ok(engine, { type: 'confirm' });
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
  expect(engine.state.phase).toBe('vote');
  return { engine, deadSeat: victim, alive: aliveSeats(engine) };
}

describe('T3 投票（FR-005，§8 第 6 条）', () => {
  it('castVote 可投任意存活者（含自己）；自票计入 tally（5 路各 1 票 → tie）', () => {
    const { engine, alive } = playToVote('vote-1');
    // 每人投自己 → 5 路 1 票平票
    let last: GameEvent[] = [];
    for (const seat of alive) last = ok(engine, { type: 'castVote', target: seat, actor: seat });
    const result = last.find((e) => e.type === 'vote_result')!;
    expect(result).toMatchObject({ exiled: null, outcome: 'tie', abstainCount: 0 });
    if (result.type !== 'vote_result') throw new Error('unreachable');
    expect(Object.values(result.tally).every((v) => v === 1)).toBe(true);
    expect(Object.keys(result.tally)).toHaveLength(alive.length);
  });

  it('收齐存活者数才计票：第 4 票后仍无 vote_result，第 5 票后产出（一致票 → 放逐）', () => {
    const { engine, alive } = playToVote('vote-2');
    const target = alive[0]!;
    for (let i = 0; i < alive.length - 1; i++) {
      const evs = ok(engine, { type: 'castVote', target, actor: alive[i]! });
      expect(evs.map((e) => e.type)).toEqual(['vote_cast']);
      expect(engine.state.phase).toBe('vote');
    }
    const last = ok(engine, { type: 'castVote', target, actor: alive[alive.length - 1]! });
    expect(last.map((e) => e.type)).toEqual(['vote_cast', 'vote_result', 'player_died']);
    expect(engine.state.phase).toBe('exile');
  });

  it('得票 max 唯一 → 放逐并翻牌（player_died cause=exile），tally/abstainCount 正确', () => {
    const { engine } = playToVote('vote-3');
    const alive = aliveSeats(engine);
    const wolf = seatsOf(engine, 'werewolf')[0]!; // 放逐狼不触发判定 → 停在 exile
    for (let i = 0; i < alive.length - 1; i++) {
      ok(engine, { type: 'castVote', target: wolf, actor: alive[i]! });
    }
    const evs = ok(engine, { type: 'abstain', actor: alive[alive.length - 1]! });
    const result = evs.find((e) => e.type === 'vote_result')!;
    expect(result).toMatchObject({
      tally: { [wolf]: alive.length - 1 },
      abstainCount: 1,
      exiled: wolf,
      outcome: 'exile',
    });
    const died = evs.find((e) => e.type === 'player_died')!;
    expect(died).toMatchObject({ seat: wolf, cause: 'exile', revealedRole: 'werewolf' });
    expect(engine.state.players.find((p) => p.seat === wolf)!.alive).toBe(false);
    expect(engine.state.players.find((p) => p.seat === wolf)!.death).toEqual({ cause: 'exile', round: 1 });
    expect(engine.state.phase).toBe('exile');
  });

  it('平票 → outcome=tie，无人放逐、无 player_died', () => {
    const { engine, alive } = playToVote('vote-4');
    const a = alive[0]!;
    const b = alive[1]!;
    ok(engine, { type: 'castVote', target: a, actor: alive[0]! });
    ok(engine, { type: 'castVote', target: a, actor: alive[1]! });
    ok(engine, { type: 'castVote', target: b, actor: alive[2]! });
    ok(engine, { type: 'castVote', target: b, actor: alive[3]! });
    const evs = ok(engine, { type: 'abstain', actor: alive[4]! });
    const result = evs.find((e) => e.type === 'vote_result')!;
    expect(result).toMatchObject({ tally: { [a]: 2, [b]: 2 }, abstainCount: 1, exiled: null, outcome: 'tie' });
    expect(evs.some((e) => e.type === 'player_died')).toBe(false);
    expect(engine.state.phase).toBe('exile');
    for (const seat of [a, b]) {
      expect(engine.state.players.find((p) => p.seat === seat)!.alive).toBe(true);
    }
  });

  it('全员弃票 → outcome=all-abstain（平安日，与平票同路）', () => {
    const { engine, alive } = playToVote('vote-5');
    for (const seat of alive) ok(engine, { type: 'abstain', actor: seat });
    const log = engine.eventLog;
    const result = log[log.length - 1]!;
    expect(result).toMatchObject({ type: 'vote_result', abstainCount: alive.length, exiled: null, outcome: 'all-abstain' });
    expect(engine.state.phase).toBe('exile');
  });

  it('vote_cast 事件：voter/target（弃票 target=abstain），visibility=public', () => {
    const { engine, alive } = playToVote('vote-6');
    const evs1 = ok(engine, { type: 'castVote', target: alive[1]!, actor: alive[0]! });
    expect(evs1[0]).toMatchObject({ type: 'vote_cast', voter: alive[0], target: alive[1], visibility: 'public' });
    const evs2 = ok(engine, { type: 'abstain', actor: alive[1]! });
    expect(evs2[0]).toMatchObject({ type: 'vote_cast', voter: alive[1], target: 'abstain' });
  });

  it('行动者不符 → NOT_YOUR_TURN；投死者 → ILLEGAL_TARGET', () => {
    const { engine, alive, deadSeat } = playToVote('vote-7');
    const before = engine.state;
    const wrong = engine.dispatch({ type: 'castVote', target: alive[0]!, actor: alive[1]! });
    if (!isErr(wrong)) throw new Error('应返回 Err');
    expect(wrong.error.code).toBe('NOT_YOUR_TURN');
    expect(engine.state).toEqual(before);

    const dead = engine.dispatch({ type: 'castVote', target: deadSeat, actor: alive[0]! });
    if (!isErr(dead)) throw new Error('应返回 Err');
    expect(dead.error.code).toBe('ILLEGAL_TARGET');
    expect(engine.state).toEqual(before);
  });

  it('abstain 不计票：全弃时 tally 为空对象', () => {
    const { engine, alive } = playToVote('vote-8');
    for (const seat of alive) ok(engine, { type: 'abstain', actor: seat });
    const log = engine.eventLog;
    const result = log[log.length - 1]!;
    if (result.type !== 'vote_result') throw new Error('最后事件应为 vote_result');
    expect(result.tally).toEqual({});
    expect(result.abstainCount).toBe(alive.length);
  });
});
