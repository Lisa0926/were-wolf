import { describe, expect, it } from 'vitest';
import { deciderFor } from '../src/ai/decider';
import { createGame, type Engine } from '../src/engine/engine';
import type { Action, Role } from '../src/engine/types';
import { autoplay } from './helpers/autoplay';

/**
 * T034 决策请求借出（tasks.md「补充任务（实施期发现）」；research D3）
 *
 * 契约（contracts/engine-api.md §1–§2）：
 *   decisionRequest(): DecisionRequest | null
 *
 * 口径（逐条断言）：
 * 1. 无待决策（idle / dawn / exile / game_over）→ null；
 * 2. request 形状 = { kind, view, legalTargets, rng }，kind/legalTargets 与
 *    pendingDecision 等价，view 恰等于 viewFor(解析出的行动者座位)；
 * 3. 行动者解析：pending.actor 是座位就用它；是 'wolf-team' 就用**存活狼中
 *    座位最小者**（确定性，与 autoplay 的既有选择一致）；
 * 4. legalTargets 是快照副本（改返回值不影响引擎状态）；
 * 5. 单流：request.rng 就是 startGame 时创建的那条唯一流——两次调用返回同一
 *    实例、调用本身不推进流；经由它多取 1 个数会改变同一引擎后续整局事件。
 */

// —————————————————————— 夹具小工具 ——————————————————————

function ok(engine: Engine, action: Action): void {
  const res = engine.dispatch(action);
  if (!Array.isArray(res)) throw new Error(`dispatch ${JSON.stringify(action)} 被拒: ${JSON.stringify(res)}`);
}

function start(seed: string): Engine {
  const engine = createGame(seed);
  ok(engine, { type: 'startGame', seed });
  return engine;
}

const seatsOf = (engine: Engine, role: Role): number[] =>
  engine.state.players.filter((p) => p.role === role).map((p) => p.seat);

const aliveSeats = (engine: Engine): number[] =>
  engine.state.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b);

/** 与 autoplay 等价的最小驱动：只经 decisionRequest 取请求（不另建 rng） */
function drive(engine: Engine): void {
  for (let guard = 0; guard < 10_000 && engine.state.phase !== 'game_over'; guard++) {
    const req = engine.decisionRequest();
    if (!req) {
      ok(engine, { type: 'confirm' }); // dawn / exile 自动推进
      continue;
    }
    ok(engine, deciderFor(req.view.you.role)(req));
  }
  expect(engine.state.phase).toBe('game_over');
}

/** 打一局到「一狼被放逐、进入第 2 夜」：用于验证 wolf-team 行动者解析 */
function gameWithOneWolfExiled(seed: string): { engine: Engine; remainingWolf: number } {
  const engine = start(seed);
  const wolves = seatsOf(engine, 'werewolf');
  const wolfA = wolves[0]!;
  const villager = seatsOf(engine, 'villager')[0]!;
  ok(engine, { type: 'wolfKill', target: villager });
  ok(engine, { type: 'seerCheck', target: wolfA });
  ok(engine, { type: 'confirm' }); // → day_speak
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });
  for (const seat of aliveSeats(engine)) ok(engine, { type: 'castVote', target: wolfA, actor: seat });
  ok(engine, { type: 'confirm' }); // exile → night_wolf(round 2)
  expect(engine.state.phase).toBe('night_wolf');
  return { engine, remainingWolf: wolves[1]! };
}

// —————————————————————— 断言 ——————————————————————

describe('T034 decisionRequest：null 语义（无待决策 → null）', () => {
  it('idle（未发牌）：pendingDecision 与 decisionRequest 同为 null', () => {
    const engine = createGame('dr-idle');
    expect(engine.pendingDecision).toBeNull();
    expect(engine.decisionRequest()).toBeNull();
  });

  it('dawn / exile：无待决策 → null；vote 阶段则指向首票行动者', () => {
    const engine = start('dr-null');
    const wolf = seatsOf(engine, 'werewolf')[0]!;
    ok(engine, { type: 'wolfKill', target: seatsOf(engine, 'villager')[0]! });
    ok(engine, { type: 'seerCheck', target: wolf });

    expect(engine.state.phase).toBe('dawn');
    expect(engine.pendingDecision).toBeNull();
    expect(engine.decisionRequest()).toBeNull();

    ok(engine, { type: 'confirm' }); // dawn → day_speak
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'skip', actor: seat });

    expect(engine.state.phase).toBe('vote');
    expect(engine.decisionRequest()!.view.you.seat).toBe(aliveSeats(engine)[0]);

    // 全员自票 → 平票 → exile（无人放逐），此时无待决策
    for (const seat of aliveSeats(engine)) ok(engine, { type: 'castVote', target: seat, actor: seat });
    expect(engine.state.phase).toBe('exile');
    expect(engine.decisionRequest()).toBeNull();
  });

  it('game_over：终局后返回 null', () => {
    const engine = autoplay('dr-over');
    expect(engine.state.phase).toBe('game_over');
    expect(engine.pendingDecision).toBeNull();
    expect(engine.decisionRequest()).toBeNull();
  });
});

describe('T034 decisionRequest：request 与 pendingDecision 等价、view 指向行动者', () => {
  it('night_wolf：kind/legalTargets 等价，view 恰为 viewFor(狼队代表座位)，字段闭包正确', () => {
    const engine = start('dr-wolf');
    const pending = engine.pendingDecision!;
    expect(pending.actor).toBe('wolf-team');

    const req = engine.decisionRequest()!;
    expect(Object.keys(req).sort()).toEqual(['kind', 'legalTargets', 'rng', 'view']);
    expect(req.kind).toBe(pending.kind);
    expect(req.legalTargets).toStrictEqual(pending.legalTargets);
    expect(req.view).toStrictEqual(engine.viewFor(req.view.you.seat));

    // 两狼都活 → 代表座位取最小（确定性）
    expect(req.view.you.seat).toBe(seatsOf(engine, 'werewolf')[0]);
    expect(req.view.you.role).toBe('werewolf');
    expect(req.view.you.alive).toBe(true);
    expect(req.view.teammates).toContain(req.view.you.seat);
  });

  it('night_seer：行动者解析为预言家座位，kind=seer-check，legalTargets 与 pending 一致', () => {
    const engine = start('dr-seer');
    const seer = seatsOf(engine, 'seer')[0]!;
    ok(engine, { type: 'wolfKill', target: seatsOf(engine, 'villager')[0]! });
    expect(engine.state.phase).toBe('night_seer');

    const req = engine.decisionRequest()!;
    expect(req.kind).toBe('seer-check');
    expect(req.view.you.seat).toBe(seer);
    expect(req.view.you.role).toBe('seer');
    expect(req.legalTargets).toStrictEqual(engine.pendingDecision!.legalTargets);
    expect(req.legalTargets).not.toContain(seer); // 禁自验由引擎合法集表达
  });

  it('legalTargets 是快照副本：改动返回值不污染引擎', () => {
    const engine = start('dr-copy');
    const before = [...engine.pendingDecision!.legalTargets];
    const req = engine.decisionRequest()!;
    req.legalTargets.push(99);
    expect(engine.pendingDecision!.legalTargets).toStrictEqual(before);
    expect(engine.decisionRequest()!.legalTargets).toStrictEqual(before);
  });

  it('wolf-team 解析到「存活狼中座位最小者」：一狼出局后自动换到剩下那只', () => {
    const { engine, remainingWolf } = gameWithOneWolfExiled('dr-wolves');
    const aliveWolves = engine.state.players.filter((p) => p.alive && p.role === 'werewolf').map((p) => p.seat);
    expect(aliveWolves).toEqual([remainingWolf]);

    const req = engine.decisionRequest()!;
    expect(req.view.you.seat).toBe(Math.min(...aliveWolves));
    expect(req.view.you.seat).toBe(remainingWolf);
    expect(req.view.you.role).toBe('werewolf');
    expect(req.view.you.alive).toBe(true);
    expect(req.legalTargets).toStrictEqual(engine.pendingDecision!.legalTargets);
  });
});

describe('T034 单流证据：request.rng 就是引擎 startGame 时那条唯一流', () => {
  it('两次调用返回同一 Rng 实例，且调用本身不推进流（连续两数 == 同 seed 新局前两数）', () => {
    const engine = start('dr-stream-shape');
    const first = engine.decisionRequest()!;
    const a = first.rng.next();
    const second = engine.decisionRequest()!;
    const b = second.rng.next();
    expect(second.rng).toBe(first.rng); // 同一实例，不是每次新建/派生的流

    // 同 seed、同样发牌之后，新局的这条流前两个数应与上面完全一致
    const fresh = start('dr-stream-shape');
    const freshReq = fresh.decisionRequest()!;
    expect([a, b]).toEqual([freshReq.rng.next(), freshReq.rng.next()]);
  });

  it('经由 request.rng 多取 1 个数 → 同一引擎后续整局事件改变（同 seed 对照）', () => {
    const seed = 'dr-stream-proof';
    const baseline = JSON.stringify(autoplay(seed).exportGame());

    const engine = start(seed);
    const opening = engine.exportGame().events; // 发牌 3 条：game_started / night_started / roles_dealt
    expect(opening.map((e) => e.type)).toEqual(['game_started', 'night_started', 'roles_dealt']);

    // 还没取数：与对照局的整局事件流前 3 条逐字节一致
    const pristine = JSON.parse(baseline) as { events: unknown[] };
    expect(JSON.stringify(opening)).toBe(JSON.stringify(pristine.events.slice(0, opening.length)));

    engine.decisionRequest()!.rng.next(); // 多取 1 个数 → 推进的是引擎那条流
    drive(engine);

    const mutated = engine.exportGame();
    // 取数之后牌面不变（差异只可能来自后续决策取数）
    expect(mutated.events.slice(0, opening.length)).toStrictEqual(opening);
    expect(JSON.stringify(mutated)).not.toBe(baseline);
  });
});
