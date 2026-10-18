import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import type { GameEvent } from '../src/engine/events';
import { transition } from '../src/engine/transition';
import type {
  Action,
  EngineError,
  Err,
  GameState,
  PlayerState,
  Role,
  Seat,
} from '../src/engine/types';
import { createRng, type Rng } from '../src/rng/rng';

/**
 * T2 昼夜流转（tasks T008–T011；FR-002/FR-004/FR-006/FR-007 引擎面；§8 第 5 条）
 *
 * 两种驱动口径（data-model §3：转移表可被测试直接打点）：
 * - engine 门面级：完整流程（发牌 → 夜晚 → 天亮）
 * - transition 纯函数级：手工构造 GameState 打前置校验/分支
 */

// —— 门面级 helpers ——

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

function seatsOf(engine: Engine, role: Role): number[] {
  return engine.state.players.filter((p) => p.role === role).map((p) => p.seat);
}

const aliveSeats = (engine: Engine) =>
  engine.state.players.filter((p) => p.alive).map((p) => p.seat).sort((a, b) => a - b);

// —— transition 级 helpers ——

interface SeatSpec {
  role: Role;
  dead?: 'night-kill' | 'exile';
}

/** 手工构造对局状态（座位 1..n，n=布局长度；isHuman 固定座位 1，与断言无关） */
function makeState(phase: GameState['phase'], round: number, layout: SeatSpec[]): GameState {
  const players: PlayerState[] = layout.map((spec, i) => ({
    seat: (i + 1) as Seat,
    role: spec.role,
    isHuman: i === 0,
    alive: !spec.dead,
    ...(spec.dead ? { death: { cause: spec.dead, round } } : {}),
  }));
  return {
    phase,
    round,
    players,
    seed: 'handmade',
    speech: { day: 0, order: [], cursor: 0 },
    votes: {},
  };
}

const ctx = (seed: string): { rng: Rng; seq: number } => ({ rng: createRng(seed), seq: 100 });

// —— 断言 ——

describe('T2 夜晚与流转（FR-002/FR-006，§8 第 5 条前半）', () => {
  it('wolfKill：目标为狼队友 → ILLEGAL_TARGET，状态不变、不产事件', () => {
    const engine = startGame('phase-1');
    const wolfSeat = seatsOf(engine, 'werewolf')[0]!;
    const before = engine.state;
    const logLen = engine.eventLog.length;
    const res = engine.dispatch({ type: 'wolfKill', target: wolfSeat });
    if (!isErr(res)) throw new Error('wolfKill 狼队友应返回 Err');
    expect(res.error.code).toBe('ILLEGAL_TARGET');
    expect(engine.state).toEqual(before);
    expect(engine.eventLog.length).toBe(logLen);
  });

  it('wolfKill：目标已死 → ILLEGAL_TARGET（transition 级）', () => {
    const state = makeState('night_wolf', 2, [
      { role: 'werewolf' },
      { role: 'werewolf' },
      { role: 'seer', dead: 'night-kill' },
      { role: 'villager' },
      { role: 'villager' },
      { role: 'villager', dead: 'exile' },
    ]);
    const res = transition(state, { type: 'wolfKill', target: 6 }, ctx('t'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ILLEGAL_TARGET');
  });

  it('阶段不符提交 → WRONG_PHASE（night_wolf 提 seerCheck/confirm；idle 提 wolfKill）', () => {
    const engine = startGame('phase-2');
    const villagerSeat = seatsOf(engine, 'villager')[0]!;
    const r1 = engine.dispatch({ type: 'seerCheck', target: villagerSeat });
    expect(isErr(r1) && r1.error.code).toBe('WRONG_PHASE');
    const r2 = engine.dispatch({ type: 'confirm' });
    expect(isErr(r2) && r2.error.code).toBe('WRONG_PHASE');

    const fresh = createGame('phase-2b');
    const r3 = fresh.dispatch({ type: 'wolfKill', target: 4 });
    expect(isErr(r3) && r3.error.code).toBe('WRONG_PHASE');
  });

  it('seerCheck：验自己 → ILLEGAL_TARGET（transition 级）', () => {
    const state = makeState('night_seer', 1, [
      { role: 'werewolf' },
      { role: 'werewolf' },
      { role: 'seer' },
      { role: 'villager' },
      { role: 'villager' },
      { role: 'villager' },
    ]);
    const res = transition(state, { type: 'seerCheck', target: 3 }, ctx('t'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe('ILLEGAL_TARGET');
  });

  it('正常夜流转：wolfKill → night_seer → seerCheck → dawn，dawn 结算夜刀死亡（翻牌）', () => {
    const engine = startGame('phase-3');
    const victim = seatsOf(engine, 'villager')[0]!;
    const seer = seatsOf(engine, 'seer')[0]!;
    const wolf = seatsOf(engine, 'werewolf')[0]!;

    const killEvents = ok(engine, { type: 'wolfKill', target: victim });
    expect(killEvents.map((e) => e.type)).toEqual(['wolf_kill_decided']);
    expect(engine.state.phase).toBe('night_seer');

    const checkEvents = ok(engine, { type: 'seerCheck', target: wolf });
    expect(engine.state.phase).toBe('dawn');
    const died = killEvents.concat(checkEvents).find((e) => e.type === 'player_died');
    expect(died).toMatchObject({ seat: victim, revealedRole: 'villager', cause: 'night-kill' });
    const victimPlayer = engine.state.players.find((p) => p.seat === victim)!;
    expect(victimPlayer.alive).toBe(false);
    expect(victimPlayer.death).toEqual({ cause: 'night-kill', round: 1 });
    expect(engine.state.nightKill).toBeUndefined();
    // 预言家查验自己的事件不改变其存活
    expect(engine.state.players.find((p) => p.seat === seer)!.alive).toBe(true);
  });

  it('查验结果为 good|werewolf 二值（验狼=werewolf，验好人=good）', () => {
    const e1 = startGame('phase-4');
    const wolf = seatsOf(e1, 'werewolf')[0]!;
    const villager = seatsOf(e1, 'villager')[0]!;
    ok(e1, { type: 'wolfKill', target: villager });
    const evs = ok(e1, { type: 'seerCheck', target: wolf });
    const check = evs.find((e) => e.type === 'seer_check_completed');
    expect(check).toMatchObject({ target: wolf, result: 'werewolf', visibility: 'seer-private' });

    const e2 = startGame('phase-4b');
    const wolf2 = seatsOf(e2, 'werewolf')[0]!;
    const villager2 = seatsOf(e2, 'villager')[0]!;
    ok(e2, { type: 'wolfKill', target: wolf2 === villager2 ? 1 : villager2 });
    const evs2 = ok(e2, { type: 'seerCheck', target: seatsOf(e2, 'villager')[1]! });
    const check2 = evs2.find((e) => e.type === 'seer_check_completed');
    expect(check2).toMatchObject({ result: 'good' });
  });

  it('FR-006：预言家已死 → wolfKill 后直跳 dawn（不经 night_seer，transition 级）', () => {
    // 夹具口径：1 狼 + 4 好（预言家前轮已死）——刀 1 好后 1狼3好，不触发判定，
    // 才能观察到"直跳 dawn"分支（若 2 狼在场，任何夜刀都触发 parity 终局）
    const state = makeState('night_wolf', 2, [
      { role: 'werewolf' },
      { role: 'seer', dead: 'exile' },
      { role: 'villager' },
      { role: 'villager' },
      { role: 'villager' },
      { role: 'villager' },
    ]);
    const res = transition(state, { type: 'wolfKill', target: 3 }, ctx('t'));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.phase).toBe('dawn');
      expect(res.state.round).toBe(2);
      const died = res.events.find((e) => e.type === 'player_died');
      expect(died).toMatchObject({ seat: 3, revealedRole: 'villager', cause: 'night-kill' });
    }
  });

  it('dawn confirm → day_speak（speech.order 为存活座位升序，cursor=0）', () => {
    const engine = startGame('phase-5');
    const victim = seatsOf(engine, 'villager')[0]!;
    ok(engine, { type: 'wolfKill', target: victim });
    ok(engine, { type: 'seerCheck', target: seatsOf(engine, 'werewolf')[0]! });
    expect(engine.state.phase).toBe('dawn');
    ok(engine, { type: 'confirm' });
    expect(engine.state.phase).toBe('day_speak');
    expect(engine.state.speech).toEqual({ day: 1, order: aliveSeats(engine), cursor: 0 });
  });

  it('FR-006 整局版：夜1刀预言家（当夜仍可查验）→ 日1放逐一狼 → 夜2直跳 dawn（随 M2 尾部转绿）', () => {
    const engine = startGame('phase-6');
    const seer = seatsOf(engine, 'seer')[0]!;
    const wolfA = seatsOf(engine, 'werewolf')[0]!;
    const wolfB = seatsOf(engine, 'werewolf')[1]!;
    const villager = seatsOf(engine, 'villager')[0]!;

    // 夜1：刀口=预言家。预言家在刀口决定时仍存活 → 当夜仍可查验（死亡于天亮结算）
    ok(engine, { type: 'wolfKill', target: seer });
    expect(engine.state.phase).toBe('night_seer');
    ok(engine, { type: 'seerCheck', target: wolfA });
    expect(engine.state.phase).toBe('dawn');
    expect(engine.state.players.find((p) => p.seat === seer)!.alive).toBe(false);

    ok(engine, { type: 'confirm' });
    expect(engine.state.phase).toBe('day_speak');
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
    expect(engine.state.phase).toBe('vote');
    // 放逐一头狼（4:1，另一狼投村民）
    for (const seat of aliveSeats(engine)) {
      ok(engine, {
        type: 'castVote',
        target: seat === wolfB ? villager : wolfA,
        actor: seat,
      });
    }
    ok(engine, { type: 'confirm' }); // exile → night_wolf
    expect(engine.state.phase).toBe('night_wolf');
    expect(engine.state.round).toBe(2);

    // 夜2：预言家已死 → 收刀直跳 dawn（FR-006）
    ok(engine, { type: 'wolfKill', target: villager });
    expect(engine.state.phase).toBe('dawn');
  });

  it('跨夜重复验同一人合法（日1放逐一狼保局，随 M2 尾部转绿）', () => {
    const engine = startGame('phase-7');
    const seer = seatsOf(engine, 'seer')[0]!;
    const wolfA = seatsOf(engine, 'werewolf')[0]!;
    const target = seatsOf(engine, 'villager')[0]!;
    ok(engine, { type: 'wolfKill', target: seatsOf(engine, 'villager')[1]! });
    ok(engine, { type: 'seerCheck', target });
    expect(engine.state.phase).toBe('dawn');
    ok(engine, { type: 'confirm' });
    // 日1 放逐一狼（否则 2 狼板子第二个夜刀必触发 parity 终局，到不了夜2 查验）
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'castVote', target: wolfA, actor: seat });
    expect(engine.state.phase).toBe('exile');
    ok(engine, { type: 'confirm' });
    expect(engine.state.phase).toBe('night_wolf');
    expect(engine.state.round).toBe(2);
    // 夜2：预言家存活 → night_seer；重复验同一目标合法（§4.2 注）
    ok(engine, { type: 'wolfKill', target: seatsOf(engine, 'villager')[2]! });
    expect(engine.state.phase).toBe('night_seer');
    expect(engine.state.players.find((p) => p.seat === seer)!.alive).toBe(true);
    const again = ok(engine, { type: 'seerCheck', target });
    expect(again.some((e) => e.type === 'seer_check_completed')).toBe(true);
    expect(engine.state.phase).toBe('dawn');
  });
});

describe('T2 白天发言与流转（FR-004/FR-007 引擎面，§8 第 5 条后半）', () => {
  /** 夜1 刀一名村民 → 查验 → 天亮 → confirm，停在 day_speak */
  function playToDaySpeak(seed: string) {
    const engine = startGame(seed);
    const victim = seatsOf(engine, 'villager')[0]!;
    ok(engine, { type: 'wolfKill', target: victim });
    ok(engine, { type: 'seerCheck', target: seatsOf(engine, 'werewolf')[0]! });
    ok(engine, { type: 'confirm' });
    return { engine, victim };
  }

  const actorSeat = (engine: Engine): number => {
    const pending = engine.pendingDecision;
    if (!pending || pending.actor === 'wolf-team') throw new Error(`期望个人行动者，得到 ${JSON.stringify(pending)}`);
    return pending.actor;
  };

  it('speech.order = 存活座位升序（死者不在列）；游标按序推进', () => {
    const { engine, victim } = playToDaySpeak('day-1');
    const alive = aliveSeats(engine);
    expect(engine.state.speech.order).toEqual(alive);
    expect(alive).not.toContain(victim);
    expect(engine.state.speech.cursor).toBe(0);
    ok(engine, { type: 'skip', actor: alive[0]! });
    expect(engine.state.speech.cursor).toBe(1);
    ok(engine, { type: 'speak', text: '我是好人', actor: alive[1]! });
    expect(engine.state.speech.cursor).toBe(2);
  });

  it('行动者不符 → NOT_YOUR_TURN（状态不变）', () => {
    const { engine } = playToDaySpeak('day-2');
    const alive = aliveSeats(engine);
    const before = engine.state;
    const res = engine.dispatch({ type: 'skip', actor: alive[1]! });
    if (!isErr(res)) throw new Error('应返回 Err');
    expect(res.error.code).toBe('NOT_YOUR_TURN');
    expect(engine.state).toEqual(before);
    expect(engine.state.speech.cursor).toBe(0);
  });

  it('speak 空文本合法；skip 合法且事件 skipped=true；claim 原样落入 speech 事件', () => {
    const { engine } = playToDaySpeak('day-3');
    const alive = aliveSeats(engine);
    const evsEmpty = ok(engine, { type: 'speak', text: '', actor: alive[0]! });
    expect(evsEmpty[0]).toMatchObject({ type: 'speech', seat: alive[0], text: '', skipped: false });
    const evsSkip = ok(engine, { type: 'skip', actor: alive[1]! });
    expect(evsSkip[0]).toMatchObject({ type: 'speech', seat: alive[1], skipped: true });
    const claim = { kind: 'seer-claim', target: alive[2]!, result: 'werewolf' } as const;
    const evsClaim = ok(engine, { type: 'speak', text: '我预言家，查杀', claim, actor: alive[2]! });
    expect(evsClaim[0]).toMatchObject({ type: 'speech', claim });
  });

  it('FR-007 引擎面：pendingDecision 永不指向死者（含死亡真人座位）', () => {
    const { engine, victim } = playToDaySpeak('day-4');
    const deadSeats = engine.state.players.filter((p) => !p.alive).map((p) => p.seat);
    expect(deadSeats).toContain(victim);
    let guard = 0;
    while (engine.state.phase === 'day_speak' && guard++ < 20) {
      const pending = engine.pendingDecision;
      expect(pending?.kind).toBe('speech');
      if (!pending || pending.actor === 'wolf-team') throw new Error('speech 阶段行动者必须是个人');
      expect(deadSeats).not.toContain(pending.actor);
      expect(engine.state.speech.order).toContain(pending.actor);
      ok(engine, { type: 'skip', actor: pending.actor });
    }
    expect(engine.state.phase).toBe('vote');
  });

  it('全员说完 → vote', () => {
    const { engine } = playToDaySpeak('day-5');
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
    expect(engine.state.phase).toBe('vote');
    expect(engine.pendingDecision?.kind).toBe('vote');
  });

  it('连续多轮平票循环不卡死（日日全弃平安日 + 夜夜刀人，直至终局；待 T015 转绿）', () => {
    const engine = startGame('tie-loop-1');
    let guard = 0;
    while (engine.state.phase !== 'game_over' && guard++ < 100) {
      const pending = engine.pendingDecision;
      switch (engine.state.phase) {
        case 'night_wolf':
          ok(engine, { type: 'wolfKill', target: pending!.legalTargets[0]! });
          break;
        case 'night_seer':
          ok(engine, { type: 'seerCheck', target: pending!.legalTargets[0]! });
          break;
        case 'dawn':
        case 'exile':
          ok(engine, { type: 'confirm' });
          break;
        case 'day_speak':
          ok(engine, { type: 'skip', actor: actorSeat(engine) });
          break;
        case 'vote':
          ok(engine, { type: 'abstain', actor: actorSeat(engine) });
          break;
        default:
          throw new Error(`意外阶段 ${engine.state.phase}`);
      }
    }
    expect(engine.state.phase).toBe('game_over');
    expect(guard).toBeLessThan(100);
    expect(engine.state.winner).toBeDefined();
  });
});
