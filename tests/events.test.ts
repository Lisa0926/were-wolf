import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import {
  GAME_RECORD_FEATURE,
  SCHEMA_VERSION,
  exportGame,
  type GameRecord,
} from '../src/engine/events';
import type { GameEvent, VictoryReason, VoteOutcome } from '../src/engine/events';
import type { Action, Claim, Faction, Role } from '../src/engine/types';
import { autoplay } from './helpers/autoplay';

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

// —————————————————————— T025（M6）：仅凭事件重建整局时间线（SC-004） ——————————————————————

/**
 * T025 口径（tasks T025；SC-004）：把 autoplay 整局的 `exportGame().events`
 * 当作**唯一数据源**重建时间线——不读引擎 state、不读 eventLog——断言
 * 「谁在哪个白天说了什么 / 投了谁 / 谁何时死 / 何时终局」全部可还原、无信息缺失。
 *
 * 最强的一条是「当轮存活集合」由死亡事件反推后逐轮精确比对：
 *   当轮发言者/投票者 = 1..6 −（round ≤ r 的夜刀死者）−（round < r 的放逐死者）
 * 若事件流少任何一条发言/投票/死亡，这个集合立刻就与断言不符。
 */

interface DeathRow {
  seq: number;
  round: number;
  seat: number;
  role: Role;
  cause: 'night-kill' | 'exile';
}

interface SpeechRow {
  round: number;
  seat: number;
  text: string;
  skipped: boolean;
  claim?: Claim;
}

interface VoteRow {
  round: number;
  voter: number;
  target: number | 'abstain';
}

interface VoteResultRow {
  round: number;
  tally: Record<number, number>;
  abstainCount: number;
  exiled: number | null;
  outcome: VoteOutcome;
}

interface Timeline {
  seed: string;
  board: Role[];
  nights: number[];
  wolfKills: Map<number, number>;
  seerChecks: Array<{ round: number; target: number; result: 'good' | 'werewolf' }>;
  deaths: DeathRow[];
  speeches: SpeechRow[];
  votes: VoteRow[];
  results: VoteResultRow[];
  victory?: { winner: Faction; reason: VictoryReason; round: number };
  finalTable?: Array<{ seat: number; role: Role; alive: boolean; isHuman: boolean }>;
}

/** 只吃事件数组：整局时间线重建（SC-004 的"可重建"落点） */
function buildTimeline(events: readonly GameEvent[]): Timeline {
  const t: Timeline = {
    seed: '',
    board: [],
    nights: [],
    wolfKills: new Map(),
    seerChecks: [],
    deaths: [],
    speeches: [],
    votes: [],
    results: [],
  };
  for (const ev of events) {
    switch (ev.type) {
      case 'game_started':
        t.seed = ev.seed;
        t.board = [...ev.board];
        break;
      case 'night_started':
        t.nights.push(ev.round);
        break;
      case 'wolf_kill_decided':
        t.wolfKills.set(ev.round, ev.target);
        break;
      case 'seer_check_completed':
        t.seerChecks.push({ round: ev.round, target: ev.target, result: ev.result });
        break;
      case 'player_died':
        t.deaths.push({
          seq: ev.seq,
          round: ev.round,
          seat: ev.seat,
          role: ev.revealedRole,
          cause: ev.cause,
        });
        break;
      case 'speech':
        t.speeches.push({
          round: ev.round,
          seat: ev.seat,
          text: ev.text,
          skipped: ev.skipped,
          ...(ev.claim ? { claim: ev.claim } : {}),
        });
        break;
      case 'vote_cast':
        t.votes.push({ round: ev.round, voter: ev.voter, target: ev.target });
        break;
      case 'vote_result':
        t.results.push({
          round: ev.round,
          tally: { ...ev.tally },
          abstainCount: ev.abstainCount,
          exiled: ev.exiled,
          outcome: ev.outcome,
        });
        break;
      case 'victory':
        t.victory = { winner: ev.winner, reason: ev.reason, round: ev.round };
        break;
      case 'game_over':
        t.finalTable = ev.finalTable.map((p) => ({ ...p }));
        break;
      case 'roles_dealt':
        // 发牌表（end 可见性）不进公开时间线：终局身份由 game_over.finalTable 还原
        break;
    }
  }
  return t;
}

/**
 * 当轮发言/投票的存活集合（纯事件反推）：
 * 夜刀当轮结算（round ≤ r 死），放逐在投票之后（round < r 才算已死）。
 */
function aliveAt(deaths: readonly DeathRow[], round: number): number[] {
  const alive: number[] = [];
  for (let seat = 1; seat <= 6; seat++) {
    const dead = deaths.some((d) =>
      d.seat === seat && (d.cause === 'night-kill' ? d.round <= round : d.round < round),
    );
    if (!dead) alive.push(seat);
  }
  return alive;
}

function groupByRound<T extends { round: number }>(rows: readonly T[]): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const row of rows) {
    const list = out.get(row.round) ?? [];
    list.push(row);
    out.set(row.round, list);
  }
  return out;
}

const T025_SEEDS = ['events-autoplay-1', 'demo-1', 'repro-fixed', ''] as const;
const T025_GAMES = T025_SEEDS.map((seed) => ({ seed, engine: autoplay(seed) }));
const T025_TIMELINES = T025_GAMES.map((g) => buildTimeline(g.engine.exportGame().events));

describe('T025 仅凭事件重建整局时间线（SC-004）', () => {
  it('事件序完整：seq 1..N 连续、round 非递减、game_started 开头、victory→game_over 收尾', () => {
    T025_GAMES.forEach((game, i) => {
      const events = game.engine.exportGame().events;
      const timeline = T025_TIMELINES[i]!;
      expect(timeline.seed).toBe(T025_SEEDS[i]);
      expect(timeline.board).toHaveLength(6);
      expect(events[0]!.type).toBe('game_started');
      expect(events[events.length - 1]!.type).toBe('game_over');
      expect(events.map((e) => e.seq)).toEqual(events.map((_, k) => k + 1));
      const rounds = events.map((e) => e.round);
      for (let k = 1; k < rounds.length; k++) {
        expect(rounds[k]!).toBeGreaterThanOrEqual(rounds[k - 1]!);
      }
      const victorySeq = events.find((e) => e.type === 'victory')!.seq;
      expect(events[events.length - 1]!.seq).toBe(victorySeq + 1);
      expect(timeline.finalTable).toHaveLength(6);
    });
  });

  it('每轮恰好一条 night_started（round = 1..maxRound），且当夜必有狼刀', () => {
    for (const timeline of T025_TIMELINES) {
      expect(timeline.nights.length).toBeGreaterThan(0);
      expect(timeline.nights).toEqual(timeline.nights.map((_, k) => k + 1));
      for (const round of timeline.nights) {
        expect(timeline.wolfKills.has(round), `round ${round} 缺 wolf_kill_decided`).toBe(true);
      }
      // 每个刀口都对应一条当轮夜刀死亡（无信息缺失）
      for (const [round, target] of timeline.wolfKills) {
        expect(
          timeline.deaths.some((d) => d.round === round && d.seat === target && d.cause === 'night-kill'),
          `round ${round} 刀口 ${target} 没有对应死亡`,
        ).toBe(true);
      }
    }
  });

  it('发言重建：每个白天「当轮存活者」恰好各一条 speech（含跳过），按座次升序、无遗漏无重复', () => {
    for (const timeline of T025_TIMELINES) {
      const byRound = groupByRound(timeline.speeches);
      expect(byRound.size).toBeGreaterThan(0);
      for (const [round, rows] of byRound) {
        const expected = aliveAt(timeline.deaths, round);
        expect(rows.map((r) => r.seat), `round ${round} 发言座次不完整`).toEqual(expected);
        expect(new Set(rows.map((r) => r.seat)).size).toBe(rows.length);
        // 白天一定走到投票（有发言就有计票）
        expect(timeline.results.some((r) => r.round === round), `round ${round} 有发言无计票`).toBe(true);
      }
    }
  });

  it('投票重建：当轮存活者各投一票（可弃），票面重算与 tally/abstainCount/outcome/exiled 完全一致', () => {
    for (const timeline of T025_TIMELINES) {
      const votesByRound = groupByRound(timeline.votes);
      expect(votesByRound.size).toBeGreaterThan(0);
      for (const result of timeline.results) {
        const alive = aliveAt(timeline.deaths, result.round);
        const rows = votesByRound.get(result.round) ?? [];
        expect(rows.map((r) => r.voter), `round ${result.round} 投票人不完整`).toEqual(alive);

        const tally: Record<number, number> = {};
        let abstain = 0;
        for (const row of rows) {
          if (row.target === 'abstain') {
            abstain++;
          } else {
            expect(alive, `round ${result.round} 投给了非存活者 ${row.target}`).toContain(row.target);
            tally[row.target] = (tally[row.target] ?? 0) + 1;
          }
        }
        expect(tally).toEqual(result.tally);
        expect(abstain).toBe(result.abstainCount);

        const cast = Object.values(tally).reduce((a, b) => a + b, 0);
        expect(cast + abstain).toBe(alive.length);
        const max = Math.max(0, ...Object.values(tally));
        const top = Object.keys(tally)
          .map(Number)
          .filter((seat) => tally[seat] === max);
        const expectedOutcome: VoteOutcome =
          cast === 0 ? 'all-abstain' : top.length === 1 ? 'exile' : 'tie';
        expect(result.outcome).toBe(expectedOutcome);
        expect(result.exiled).toBe(expectedOutcome === 'exile' ? top[0] : null);
      }
      for (const round of votesByRound.keys()) {
        expect(timeline.results.some((r) => r.round === round), `round ${round} 有投票无计票`).toBe(true);
      }
    }
  });

  it('死亡重建：夜刀死者 = 当夜刀口、放逐死者 = 当轮放逐，翻牌角色与终表一致，且与终表互补', () => {
    for (const timeline of T025_TIMELINES) {
      const finalTable = timeline.finalTable!;
      for (const death of timeline.deaths) {
        const row = finalTable.find((p) => p.seat === death.seat)!;
        expect(row.role).toBe(death.role); // 死亡即翻牌：事件里的翻牌与终表一致
        expect(row.alive).toBe(false);
        if (death.cause === 'night-kill') {
          expect(timeline.wolfKills.get(death.round)).toBe(death.seat);
        } else {
          const result = timeline.results.find((r) => r.round === death.round)!;
          expect(result.outcome).toBe('exile');
          expect(result.exiled).toBe(death.seat);
        }
      }
      // 同一座位不重复死亡；死亡事件的 round 非递减（谁何时死）
      const deadSeats = timeline.deaths.map((d) => d.seat);
      expect(new Set(deadSeats).size).toBe(deadSeats.length);
      for (let k = 1; k < timeline.deaths.length; k++) {
        expect(timeline.deaths[k]!.round).toBeGreaterThanOrEqual(timeline.deaths[k - 1]!.round);
      }
      // 终表 alive 与死亡事件严格互补（无"没记录的死亡"或"记录了还活着"）
      for (const row of finalTable) expect(row.alive).toBe(!deadSeats.includes(row.seat));
    }
  });

  it('发言内容可重建：未跳过必有文本、跳过必为空文本；claim 只出自真预言家且载荷为真', () => {
    for (const timeline of T025_TIMELINES) {
      const finalTable = timeline.finalTable!;
      const seerSeat = finalTable.find((p) => p.role === 'seer')!.seat;
      expect(timeline.speeches.length).toBeGreaterThan(0);
      for (const speech of timeline.speeches) {
        if (speech.skipped) {
          expect(speech.text).toBe('');
        } else {
          expect(speech.text.length).toBeGreaterThan(0);
        }
        if (speech.claim) {
          expect(speech.seat).toBe(seerSeat); // 只有真预言家会发 claim
          const truth = finalTable.find((p) => p.seat === speech.claim!.target)!;
          expect(speech.claim.result).toBe(truth.role === 'werewolf' ? 'werewolf' : 'good');
        }
      }
      // 非预言家座位永不带 claim（狼伪装成村民、村民无信息）
      for (const speech of timeline.speeches) {
        if (speech.seat !== seerSeat) expect(speech.claim).toBeUndefined();
      }
      // 查验史：目标为他人，结果二值（预言家自己的记录可重建）
      for (const check of timeline.seerChecks) {
        expect(check.target).not.toBe(seerSeat);
        expect(['good', 'werewolf']).toContain(check.result);
      }
    }
  });

  it('终局重建：victory 与终表存活口径一致（狼 0 → 好人胜；狼 ≥ 好 → 狼胜）', () => {
    for (const timeline of T025_TIMELINES) {
      const finalTable = timeline.finalTable!;
      const wolves = finalTable.filter((p) => p.alive && p.role === 'werewolf').length;
      const good = finalTable.filter((p) => p.alive && p.role !== 'werewolf').length;
      const victory = timeline.victory!;
      if (wolves === 0) {
        expect(victory.winner).toBe('good');
        expect(victory.reason).toBe('wolves-eliminated');
      } else {
        expect(wolves).toBeGreaterThanOrEqual(good);
        expect(victory.winner).toBe('wolves');
        expect(victory.reason).toBe('wolves-parity');
      }
      // 终局回合 = 最后一轮（victory.round 与最后一条 night_started 同轮或同轮放逐）
      expect(victory.round).toBe(timeline.nights[timeline.nights.length - 1]);
    }
  });
});
