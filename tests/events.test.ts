import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import {
  GAME_RECORD_FEATURE,
  SCHEMA_VERSION,
  exportGame,
  type GameRecord,
} from '../src/engine/events';
import type { GameEvent } from '../src/engine/events';
import type { Action, Role } from '../src/engine/types';

/**
 * T7 事件契约序列化（tasks T018–T019；FR-009；contracts/event-stream.md §1、§3）
 *
 * 夹具口径：固定 seed 打一局覆盖契约 §1 全部 11 个具体事件类型（9 类）的
 * 完整对局——夜1 刀村民 + 查验狼 A；日1 带 claim 发言 + 放逐狼 A；夜2 刀
 * 预言家（当夜仍查验）；日2 放逐狼 B → 好人胜 game_over。
 * 「仅凭事件重建整局时间线」的断言属 T025（M6），本套件只锁序列化契约。
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

const seatsOf = (engine: Engine, role: Role) =>
  engine.state.players.filter((p) => p.role === role).map((p) => p.seat);

const aliveSeats = (engine: Engine) =>
  engine.state.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b);

/** 打一局覆盖 9 类 / 11 个具体事件类型的对局（到 game_over） */
function playFixture(seed = 'events-1'): Engine {
  const engine = startGame(seed);
  const [wolfA, wolfB] = seatsOf(engine, 'werewolf') as [number, number];
  const seer = seatsOf(engine, 'seer')[0]!;
  const villagers = seatsOf(engine, 'villager');

  // 夜1：刀村民 → 查验狼 A → 天亮（player_died night-kill）
  ok(engine, { type: 'wolfKill', target: villagers[0]! });
  ok(engine, { type: 'seerCheck', target: wolfA });
  ok(engine, { type: 'confirm' });

  // 白天1：首位带 claim 发言（public speech 含 claim），其余跳过（skipped=true）
  aliveSeats(engine).forEach((seat, i) => {
    if (i === 0) {
      ok(engine, {
        type: 'speak',
        text: '我预言家，查杀',
        claim: { kind: 'seer-claim', target: wolfB, result: 'werewolf' },
        actor: seat,
      });
    } else {
      ok(engine, { type: 'skip', actor: seat });
    }
  });
  // 全员投狼 A → vote_result(exile) + player_died(exile)
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'castVote', target: wolfA, actor: seat });
  ok(engine, { type: 'confirm' }); // exile → 夜2 night_wolf（night_started round 2）

  // 夜2：刀预言家（当夜结算前仍可查验）→ 天亮预言家死
  ok(engine, { type: 'wolfKill', target: seer });
  ok(engine, { type: 'seerCheck', target: wolfB });
  ok(engine, { type: 'confirm' });

  // 白天2：全员跳过 → 全员投狼 B → 狼=0，计票结算即好人胜 + game_over
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'castVote', target: wolfB, actor: seat });
  expect(engine.state.phase).toBe('game_over');
  return engine;
}

// —————————————————————— 契约 §1 显式形状表 ——————————————————————

/** 9 类事件 = 11 个具体 type（第 8/9 行各含两个成员） */
const CONTRACT_ROWS: Readonly<Record<number, readonly GameEvent['type'][]>> = {
  1: ['game_started'],
  2: ['roles_dealt'],
  3: ['night_started'],
  4: ['wolf_kill_decided'],
  5: ['seer_check_completed'],
  6: ['player_died'],
  7: ['speech'],
  8: ['vote_cast', 'vote_result'],
  9: ['victory', 'game_over'],
};

const SHAPES = {
  game_started: { payload: ['seed', 'board'], visibility: 'public' },
  roles_dealt: { payload: ['assignment'], visibility: 'end' },
  night_started: { payload: [], visibility: 'public' },
  wolf_kill_decided: { payload: ['target'], visibility: 'wolf-team' },
  seer_check_completed: { payload: ['target', 'result'], visibility: 'seer-private' },
  player_died: { payload: ['seat', 'revealedRole', 'cause'], visibility: 'public' },
  speech: { payload: ['seat', 'text', 'claim', 'skipped'], visibility: 'public' },
  vote_cast: { payload: ['voter', 'target'], visibility: 'public' },
  vote_result: { payload: ['tally', 'abstainCount', 'exiled', 'outcome'], visibility: 'public' },
  victory: { payload: ['winner', 'reason'], visibility: 'public' },
  game_over: { payload: ['finalTable'], visibility: 'public' },
} as const satisfies Record<GameEvent['type'], { payload: readonly string[]; visibility: string }>;

const eventsOfType = <T extends GameEvent['type']>(events: readonly GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

/** 递归收集键名（用于"无墙钟时间字段"自检） */
function collectKeys(value: unknown, acc: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      acc.push(key);
      collectKeys(v, acc);
    }
  }
  return acc;
}

/** 递归收集数字（用于"不带 epoch 毫秒"自检） */
function collectNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === 'number') acc.push(value);
  else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, acc);
  } else if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectNumbers(v, acc);
  }
  return acc;
}

// —————————————————————— 断言 ——————————————————————

describe('T7 exportGame：序列化导出格式（契约 §3，FR-009）', () => {
  it('GameRecord = { schemaVersion: 1, feature: "werewolf-s0", seed, events }，字段闭包正确', () => {
    const engine = playFixture();
    const record = engine.exportGame();
    expect(Object.keys(record).sort()).toEqual(['events', 'feature', 'schemaVersion', 'seed']);
    expect(record.schemaVersion).toBe(1);
    expect(record.schemaVersion).toBe(SCHEMA_VERSION);
    expect(record.feature).toBe('werewolf-s0');
    expect(record.feature).toBe(GAME_RECORD_FEATURE);
    expect(record.seed).toBe('events-1');
    expect(Array.isArray(record.events)).toBe(true);
    expect(record.events.length).toBe(engine.eventLog.length);
  });

  it('JSON 序列化回路：JSON.parse(JSON.stringify(exportGame())) 与 exportGame() 深相等', () => {
    const engine = playFixture();
    const record = engine.exportGame();
    expect(JSON.parse(JSON.stringify(record))).toStrictEqual(record);
    // 二次导出结构相等（不含任何非 JSON 值 / 函数 / undefined）
    expect(engine.exportGame()).toStrictEqual(record);
    // 字符串化后仍是合法 JSON，且含三个顶层字段
    const text = JSON.stringify(record);
    expect(() => JSON.parse(text) as unknown).not.toThrow();
    expect(JSON.parse(text)).toMatchObject({ schemaVersion: 1, feature: 'werewolf-s0', seed: 'events-1' });
  });

  it('导出是深拷贝：改导出结果不影响引擎日志，也不共享引用', () => {
    const engine = playFixture();
    const record = engine.exportGame();
    expect(record.events).toStrictEqual([...engine.eventLog]);
    expect(record.events[0]).not.toBe(engine.eventLog[0]);
    const first = record.events[0]!;
    first.seq = 999;
    expect(engine.eventLog[0]!.seq).toBe(1);
  });

  it('纯函数 exportGame(seed, log) 与门面导出一致；idle 未开局导出空事件表', () => {
    const engine = playFixture();
    const viaFacade = engine.exportGame();
    const viaPure = exportGame(engine.state.seed, engine.eventLog);
    expect(viaPure).toStrictEqual(viaFacade);

    const idle = createGame('idle-events');
    const idleRecord: GameRecord = idle.exportGame();
    expect(idleRecord).toStrictEqual({
      schemaVersion: 1,
      feature: 'werewolf-s0',
      seed: 'idle-events',
      events: [],
    });
  });

  it('导出含隐藏事实（roles_dealt / wolf_kill_decided / seer_check_completed）', () => {
    const engine = playFixture();
    const types = engine.exportGame().events.map((e) => e.type);
    expect(types).toContain('roles_dealt');
    expect(types).toContain('wolf_kill_decided');
    expect(types).toContain('seer_check_completed');
  });
});

describe('T7 事件公共字段：seq 从 1 起全局单调递增，round 从 1 起', () => {
  it('seq = 1..N 严格 +1、无重复；round 非递减且本夹具恰为 {1, 2}', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    expect(events.length).toBeGreaterThanOrEqual(20);

    const seqs = events.map((e) => e.seq);
    expect(seqs[0]).toBe(1);
    expect(seqs).toEqual(Array.from({ length: events.length }, (_, i) => i + 1));
    expect(new Set(seqs).size).toBe(events.length);

    const rounds = events.map((e) => e.round);
    expect(rounds.every((r) => Number.isInteger(r) && r >= 1)).toBe(true);
    for (let i = 1; i < rounds.length; i++) {
      expect(rounds[i]!).toBeGreaterThanOrEqual(rounds[i - 1]!);
    }
    expect([...new Set(rounds)]).toEqual([1, 2]);
  });
});

describe('T7 9 类事件载荷逐项对照契约 §1', () => {
  it('11 个具体 type 全部出现，且 9 个契约行全覆盖', () => {
    const engine = playFixture();
    const types = new Set(engine.exportGame().events.map((e) => e.type));
    expect([...types].sort()).toEqual(Object.keys(SHAPES).sort());
    for (const [row, rowTypes] of Object.entries(CONTRACT_ROWS)) {
      for (const t of rowTypes) {
        expect(types.has(t), `契约第 ${row} 行的事件 ${t} 未出现`).toBe(true);
      }
    }
  });

  it('公共字段与载荷字段闭包：每类事件只含 契约 §1 列出的字段，可见性标注一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const base = ['seq', 'round', 'visibility', 'type'];
    for (const ev of events) {
      const shape = SHAPES[ev.type];
      const allowed = new Set<string>([...base, ...shape.payload]);
      for (const key of Object.keys(ev)) {
        expect(allowed.has(key), `${ev.type} 出现契约外字段 ${key}`).toBe(true);
      }
      const optional = ev.type === 'speech' ? ['claim'] : [];
      for (const key of shape.payload) {
        if (!optional.includes(key)) expect(ev).toHaveProperty(key);
      }
      expect(ev.visibility).toBe(shape.visibility);
    }
  });

  it('#1 game_started：{ seed, board }，board 为 狼2/预言家1/村民3', () => {
    const engine = playFixture();
    const [started] = eventsOfType(engine.exportGame().events, 'game_started');
    expect(started).toBeDefined();
    expect(started!.seed).toBe('events-1');
    expect(started!.board).toHaveLength(6);
    expect(started!.board.filter((r) => r === 'werewolf')).toHaveLength(2);
    expect(started!.board.filter((r) => r === 'seer')).toHaveLength(1);
    expect(started!.board.filter((r) => r === 'villager')).toHaveLength(3);
  });

  it('#2 roles_dealt（end）：assignment 为 6 座位完整发牌表，与 board 多重集一致、与终局身份表一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const [dealt] = eventsOfType(events, 'roles_dealt');
    expect(dealt).toBeDefined();
    expect(Object.keys(dealt!.assignment).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    const assigned = Object.values(dealt!.assignment);
    expect(assigned.filter((r) => r === 'werewolf')).toHaveLength(2);
    expect(assigned.filter((r) => r === 'seer')).toHaveLength(1);
    expect(assigned.filter((r) => r === 'villager')).toHaveLength(3);
    const [over] = eventsOfType(events, 'game_over');
    for (const row of over!.finalTable) expect(dealt!.assignment[row.seat]).toBe(row.role);
  });

  it('#3 night_started：空载荷，每夜一条（本夹具 2 条，round 1/2）', () => {
    const engine = playFixture();
    const nights = eventsOfType(engine.exportGame().events, 'night_started');
    expect(nights).toHaveLength(2);
    expect(nights.map((e) => e.round)).toEqual([1, 2]);
  });

  it('#4 wolf_kill_decided（wolf-team）：target 为存活好人，与本局身份表一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const deaths = eventsOfType(events, 'wolf_kill_decided');
    expect(deaths).toHaveLength(2);
    const [over] = eventsOfType(events, 'game_over');
    for (const ev of deaths) {
      const truth = over!.finalTable.find((p) => p.seat === ev.target)!;
      expect(truth.role).not.toBe('werewolf');
      expect(ev.visibility).toBe('wolf-team');
    }
  });

  it('#5 seer_check_completed（seer-private）：target ≠ 预言家座位，result 与真实身份一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const checks = eventsOfType(events, 'seer_check_completed');
    expect(checks).toHaveLength(2);
    const [over] = eventsOfType(events, 'game_over');
    const seerSeat = over!.finalTable.find((p) => p.role === 'seer')!.seat;
    for (const ev of checks) {
      expect(ev.target).not.toBe(seerSeat);
      const truth = over!.finalTable.find((p) => p.seat === ev.target)!;
      expect(ev.result).toBe(truth.role === 'werewolf' ? 'werewolf' : 'good');
      expect(ev.visibility).toBe('seer-private');
    }
  });

  it('#6 player_died（public）：seat/revealedRole/cause 齐全，翻牌角色与身份表一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const deaths = eventsOfType(events, 'player_died');
    // 夜1 村民、日1 狼 A、夜2 预言家、日2 狼 B（终局放逐）
    expect(deaths).toHaveLength(4);
    expect(deaths.map((e) => e.cause).sort()).toEqual(['exile', 'exile', 'night-kill', 'night-kill']);
    const [over] = eventsOfType(events, 'game_over');
    for (const ev of deaths) {
      const truth = over!.finalTable.find((p) => p.seat === ev.seat)!;
      expect(ev.revealedRole).toBe(truth.role);
      expect(ev.visibility).toBe('public');
    }
  });

  it('#7 speech（public）：seat/text/skipped 齐全，claim 仅预言家声明形态', () => {
    const engine = playFixture();
    const speeches = eventsOfType(engine.exportGame().events, 'speech');
    expect(speeches.length).toBeGreaterThan(0);
    expect(speeches.some((e) => e.skipped)).toBe(true);
    expect(speeches.some((e) => !e.skipped)).toBe(true);
    const claimed = speeches.filter((e) => e.claim);
    expect(claimed).toHaveLength(1);
    for (const ev of speeches) {
      expect(typeof ev.text).toBe('string');
      expect(typeof ev.skipped).toBe('boolean');
      expect(Number.isInteger(ev.seat) && ev.seat >= 1 && ev.seat <= 6).toBe(true);
      if (ev.claim) {
        expect(ev.claim.kind).toBe('seer-claim');
        expect(Number.isInteger(ev.claim.target) && ev.claim.target >= 1 && ev.claim.target <= 6).toBe(true);
        expect(['good', 'werewolf']).toContain(ev.claim.result);
      }
    }
  });

  it('#8 vote_cast / vote_result（public）：voter/target 与 tally/abstainCount/exiled/outcome 口径一致', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    // 每轮收齐的票数 = tally 票数 + 弃票数
    let casts = 0;
    let results = 0;
    for (const ev of events) {
      if (ev.type === 'vote_cast') {
        casts++;
        expect(Number.isInteger(ev.voter) && ev.voter >= 1 && ev.voter <= 6).toBe(true);
        expect(ev.target === 'abstain' || (Number.isInteger(ev.target) && ev.target >= 1 && ev.target <= 6)).toBe(true);
        expect(ev.visibility).toBe('public');
      }
      if (ev.type === 'vote_result') {
        results++;
        const tallySum = Object.values(ev.tally).reduce((a, b) => a + b, 0);
        expect(tallySum + ev.abstainCount).toBe(casts);
        expect(['exile', 'tie', 'all-abstain']).toContain(ev.outcome);
        expect(ev.exiled === null || (Number.isInteger(ev.exiled) && ev.exiled >= 1 && ev.exiled <= 6)).toBe(true);
        expect(ev.exiled === null).toBe(ev.outcome !== 'exile');
        expect(ev.abstainCount).toBeGreaterThanOrEqual(0);
        for (const [seat, count] of Object.entries(ev.tally)) {
          expect(Number(seat) >= 1 && Number(seat) <= 6).toBe(true);
          expect(count).toBeGreaterThan(0);
        }
        expect(ev.visibility).toBe('public');
        casts = 0;
      }
    }
    expect(results).toBe(2);
    expect(casts).toBe(0); // 每轮票都收齐了
  });

  it('#9 victory + game_over（public）：winner/reason 配对一致，finalTable 为 6 人终表', () => {
    const engine = playFixture();
    const events = engine.exportGame().events;
    const [victory] = eventsOfType(events, 'victory');
    const [over] = eventsOfType(events, 'game_over');
    expect(victory).toBeDefined();
    expect(over).toBeDefined();
    expect(['wolves', 'good']).toContain(victory!.winner);
    expect(['wolves-eliminated', 'wolves-parity']).toContain(victory!.reason);
    expect(victory!.winner === 'good' ? 'wolves-eliminated' : 'wolves-parity').toBe(victory!.reason);

    expect(victory!.seq).toBeLessThan(over!.seq); // victory 先于 game_over
    expect(over!.finalTable).toHaveLength(6);
    for (const row of over!.finalTable) {
      expect(Object.keys(row).sort()).toEqual(['alive', 'isHuman', 'role', 'seat']);
      expect(['werewolf', 'seer', 'villager']).toContain(row.role);
      expect(typeof row.alive).toBe('boolean');
      expect(typeof row.isHuman).toBe('boolean');
    }
    expect(over!.finalTable.filter((p) => p.isHuman)).toHaveLength(1);
    // 本局好人胜 → 终局时没有存活狼
    expect(victory!.winner).toBe('good');
    expect(over!.finalTable.filter((p) => p.alive && p.role === 'werewolf')).toHaveLength(0);
  });
});

describe('T7 事件不含墙钟时间字段（SC-003 复现承诺的前提）', () => {
  it('递归扫描所有键名：无 time/timestamp/date/clock 类字段；数字量级不含 epoch 毫秒', () => {
    const engine = playFixture();
    const record = engine.exportGame();
    const keys = collectKeys(record);
    expect(keys.filter((k) => /time|timestamp|date|clock|epoch|createdAt|updatedAt/i.test(k))).toEqual([]);

    const numbers = collectNumbers(record);
    expect(numbers.length).toBeGreaterThan(0);
    expect(numbers.every((n) => Number.isFinite(n) && Math.abs(n) < 1e12)).toBe(true);
  });
});
