import { describe, expect, it } from 'vitest';
import { createGame, type Engine } from '../src/engine/engine';
import type {
  GameEvent,
  SeerCheckCompletedEvent,
  SpeechEvent,
  VoteResultEvent,
} from '../src/engine/events';
import { derivePending } from '../src/engine/transition';
import type { Action, GameState, PendingDecision } from '../src/engine/types';
import { eventsFor, viewFor, type DecisionRequest } from '../src/engine/view';
import { createRng } from '../src/rng/rng';

/**
 * T5 信息隔离（tasks T016–T017；FR-007/FR-008；规则 §8 第 8 条）
 *
 * 口径（先口径后断言）：
 * - 整局夹具：固定 seed 打一局真实对局到 game_over（夜1 刀预言家——当夜结算前
 *   预言家仍可查验，因此 6 个座位都真实产生过决策请求；日1 放逐狼 A；夜2
 *   预言家已死 → 收刀直跳天亮（FR-006）；日2 放逐狼 B → 好人胜）。
 *   狼 A / 预言家 / 村民均出现死亡，单局夹具同时覆盖「死者观战」与「终局翻牌」。
 * - 每个快照（每次 dispatch 之后）对全部 6 个座位扫描：
 *   1) 类型层结构：players 仅死者带 revealedRole，他人 role 无法表达；
 *   2) 角色条件字段：狼 only teammates、预言家 only seerChecks、村民两者皆无；
 *   3) 公开史投影：speeches / voteResults 与事件日志口径一致；
 *   4) pending 只给「有权行动且存活」的座位；
 *   5) 深检：任何角色值只允许出现在白名单路径（you.role / 死者 revealedRole /
 *      自己的 seerChecks / 公开 claim 载荷），其余一律判泄漏；
 *   6) 非干涉性：交换该座位看不到的他人身份后，视图必须逐字节不变。
 * - DecisionRequest（view/legalTargets/rng）同样做深检 + 非干涉性检验，
 *   并断言 6 个座位都至少真实构造过一次决策请求。
 */

// —————————————————————— 整局夹具 ——————————————————————

interface Snapshot {
  label: string;
  state: GameState;
  log: GameEvent[];
  pending: PendingDecision | null;
}

interface Fixture {
  engine: Engine;
  snapshots: Snapshot[];
  seats: { wolves: number[]; wolfA: number; wolfB: number; seer: number; villagers: number[] };
}

function ok(engine: Engine, action: Action): GameEvent[] {
  const res = engine.dispatch(action);
  if (!Array.isArray(res)) throw new Error(`dispatch ${JSON.stringify(action)} 被拒: ${JSON.stringify(res)}`);
  return res;
}

function playFixture(seed = 'isolation-1'): Fixture {
  const engine = createGame(seed);
  const snapshots: Snapshot[] = [];
  const record = (label: string): void => {
    snapshots.push({ label, state: engine.state, log: [...engine.eventLog], pending: engine.pendingDecision });
  };
  const act = (label: string, action: Action): void => {
    ok(engine, action);
    record(label);
  };
  const aliveSeats = (): number[] =>
    engine.state.players
      .filter((p) => p.alive)
      .map((p) => p.seat)
      .sort((a, b) => a - b);

  act('发牌', { type: 'startGame', seed });
  const wolves = engine.state.players
    .filter((p) => p.role === 'werewolf')
    .map((p) => p.seat)
    .sort((a, b) => a - b);
  const wolfA = wolves[0]!;
  const wolfB = wolves[1]!;
  const seer = engine.state.players.find((p) => p.role === 'seer')!.seat;
  const villagers = engine.state.players
    .filter((p) => p.role === 'villager')
    .map((p) => p.seat)
    .sort((a, b) => a - b);

  // 夜1：刀预言家（当夜结算前仍可查验）→ 天亮预言家死，转观战
  act('夜1·狼刀', { type: 'wolfKill', target: seer });
  act('夜1·查验', { type: 'seerCheck', target: wolfA });
  act('天亮1', { type: 'confirm' });

  // 白天1：首位发言者带 claim（公开声明载荷），其余跳过
  aliveSeats().forEach((seat, i) => {
    if (i === 0) {
      act('白天1·发言', {
        type: 'speak',
        text: '我预言家，查杀',
        claim: { kind: 'seer-claim', target: wolfB, result: 'werewolf' },
        actor: seat,
      });
    } else {
      act('白天1·跳过', { type: 'skip', actor: seat });
    }
  });
  // 全员投狼 A → 放逐翻牌（狼 A 死亡，此后为观战者）
  for (const seat of aliveSeats()) act('白天1·投票', { type: 'castVote', target: wolfA, actor: seat });
  act('放逐1·确认', { type: 'confirm' });

  // 夜2：预言家已死 → 收刀直跳 dawn（FR-006）；狼 A 虽死仍是 wolf-team 通道持有者
  act('夜2·狼刀', { type: 'wolfKill', target: villagers[0]! });
  act('天亮2', { type: 'confirm' });

  // 白天2：全员跳过 → 全员投最后一狼 → 狼=0，计票结算即好人胜（直接 game_over）
  for (const seat of aliveSeats()) act('白天2·跳过', { type: 'skip', actor: seat });
  for (const seat of aliveSeats()) act('白天2·投票', { type: 'castVote', target: wolfB, actor: seat });
  record('终局');

  return { engine, snapshots, seats: { wolves, wolfA, wolfB, seer, villagers } };
}

const snapAt = (snapshots: Snapshot[], label: string): Snapshot => {
  const found = snapshots.find((s) => s.label === label);
  if (!found) throw new Error(`夹具快照缺失: ${label}`);
  return found;
};

// —————————————————————— 期望口径（显式展开，不复用实现逻辑） ——————————————————————

const expectedSpeeches = (log: readonly GameEvent[]) =>
  log
    .filter((e): e is SpeechEvent => e.type === 'speech' && !e.skipped)
    .map((e) => ({ round: e.round, seat: e.seat, text: e.text, ...(e.claim ? { claim: e.claim } : {}) }));

const expectedVoteResults = (log: readonly GameEvent[]) =>
  log
    .filter((e): e is VoteResultEvent => e.type === 'vote_result')
    .map((e) => ({
      round: e.round,
      tally: e.tally,
      abstainCount: e.abstainCount,
      exiled: e.exiled,
      outcome: e.outcome,
    }));

const expectedChecks = (log: readonly GameEvent[]) =>
  log
    .filter((e): e is SeerCheckCompletedEvent => e.type === 'seer_check_completed')
    .map((e) => ({ target: e.target, result: e.result, round: e.round }));

const expectedPlayers = (state: GameState) =>
  state.players.map((p) => ({
    seat: p.seat,
    alive: p.alive,
    isHuman: p.isHuman,
    ...(p.alive ? {} : { revealedRole: p.role }),
  }));

// —————————————————————— 深检工具 ——————————————————————

const ROLE_WORDS: ReadonlySet<string> = new Set(['werewolf', 'seer', 'villager']);

/**
 * 深度遍历视图/决策请求，收集一切"隐藏身份泄漏"证据。
 * 允许出现角色值的路径（白名单）：
 * - you.role（自己的身份）
 * - players[i].revealedRole（且该座位已死——死亡即翻牌）
 * - seerChecks[i].result（预言家自己的查验史）
 * - speeches[i].claim.result（公开发言里的 claim 载荷，是"声明"不是事实）
 */
function leaksOf(value: unknown, state: GameState): string[] {
  const allowed = new Set<string>(['you.role']);
  state.players.forEach((p, i) => {
    if (!p.alive) allowed.add(`players[${i}].revealedRole`);
  });
  const patterns = [/^seerChecks\[\d+\]\.result$/, /^speeches\[\d+\]\.claim\.result$/];
  const isAllowed = (path: string): boolean => allowed.has(path) || patterns.some((re) => re.test(path));

  const leaks: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (node === null || typeof node !== 'object') return;
    for (const [key, v] of Object.entries(node as Record<string, unknown>)) {
      const p = path ? `${path}.${key}` : key;
      if (key === 'role' && p !== 'you.role') leaks.push(`${p}：出现了 role 字段`);
      if (key === 'assignment') leaks.push(`${p}：出现了发牌表 assignment`);
      if (typeof v === 'string' && ROLE_WORDS.has(v)) {
        if (!isAllowed(p)) leaks.push(`${p}：泄漏角色值 ${v}`);
      } else {
        walk(v, p);
      }
    }
  };
  walk(value, '');
  return leaks;
}

/** 在副本中交换两个座位的 role（只改 role，不动 alive/death——用于非干涉性检验） */
function swapRoles(state: GameState, a: number, b: number): GameState {
  const roleA = state.players.find((p) => p.seat === a)!.role;
  const roleB = state.players.find((p) => p.seat === b)!.role;
  return {
    ...state,
    players: state.players.map((p) =>
      p.seat === a ? { ...p, role: roleB } : p.seat === b ? { ...p, role: roleA } : p,
    ),
  };
}

/**
 * 找一对「该座位看不到身份的存活他人」，且二者角色不同（交换才有信息量）。
 * 狼的队友身份是已知的 → 不参与交换；其余存活他人对任何角色都属隐藏事实
 * （预言家的查验结论从日志派生，不随 state 中的 role 改变）。
 */
function hiddenSwapPair(state: GameState, seat: number): [number, number] | null {
  const me = state.players.find((p) => p.seat === seat)!;
  const candidates = state.players
    .filter((p) => p.alive && p.seat !== seat)
    .filter((p) => !(me.role === 'werewolf' && p.role === 'werewolf'));
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      if (candidates[i]!.role !== candidates[j]!.role) return [candidates[i]!.seat, candidates[j]!.seat];
    }
  }
  return null;
}

/** DecisionRequest 深检：字段闭包、角色值白名单、rng 不携带任何局面数据 */
function expectCleanDecisionRequest(req: DecisionRequest, seat: number, state: GameState): void {
  expect(Object.keys(req).sort()).toEqual(['kind', 'legalTargets', 'rng', 'view']);
  expect(req.view.you.seat).toBe(seat);
  // view 深检（白名单路径相对 view 根）+ 请求其余字段深检
  expect(leaksOf(req.view, state)).toEqual([]);
  expect(leaksOf({ kind: req.kind, legalTargets: req.legalTargets }, state)).toEqual([]);
  expect(req.legalTargets.every((t) => Number.isInteger(t) && t >= 1 && t <= 6)).toBe(true);
  // rng 只暴露 4 个方法，JSON 里不残留任何数据（函数被丢弃 → 空对象）
  expect(Object.keys(req.rng).sort()).toEqual(['int', 'next', 'pick', 'shuffle']);
  expect(JSON.stringify(req.rng)).toBe('{}');
}

// —————————————————————— 断言 ——————————————————————

describe('T5 viewFor：三种角色的精确投影（FR-008）', () => {
  it('狼：见 teammates（狼队座位）；无 seerChecks；夜晚持有 wolf-kill 待决策', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '发牌'); // 发牌后首夜，全员存活
    expect(viewFor(snap.state, snap.log, seats.wolfA)).toStrictEqual({
      round: 1,
      phase: 'night_wolf',
      you: { seat: seats.wolfA, role: 'werewolf', alive: true },
      players: expectedPlayers(snap.state),
      teammates: seats.wolves,
      speeches: [],
      voteResults: [],
      pending: { actor: 'wolf-team', kind: 'wolf-kill' },
    });
  });

  it('预言家：见 seerChecks（自己查验史，初始为空）；无 teammates；夜晚不持有狼刀决策', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '发牌');
    expect(viewFor(snap.state, snap.log, seats.seer)).toStrictEqual({
      round: 1,
      phase: 'night_wolf',
      you: { seat: seats.seer, role: 'seer', alive: true },
      players: expectedPlayers(snap.state),
      seerChecks: [],
      speeches: [],
      voteResults: [],
    });
  });

  it('村民：teammates / seerChecks 字段都不存在；夜晚无 pending', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '发牌');
    const view = viewFor(snap.state, snap.log, seats.villagers[0]!);
    expect(view).toStrictEqual({
      round: 1,
      phase: 'night_wolf',
      you: { seat: seats.villagers[0]!, role: 'villager', alive: true },
      players: expectedPlayers(snap.state),
      speeches: [],
      voteResults: [],
    });
    expect(view).not.toHaveProperty('teammates');
    expect(view).not.toHaveProperty('seerChecks');
    expect(view).not.toHaveProperty('pending');
  });

  it('查验后：只有预言家视图含 seerChecks；狼/村民均无该字段', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '夜1·查验'); // 查验狼 A → werewolf
    expect(viewFor(snap.state, snap.log, seats.seer).seerChecks).toEqual([
      { target: seats.wolfA, result: 'werewolf', round: 1 },
    ]);
    expect(viewFor(snap.state, snap.log, seats.wolfA)).not.toHaveProperty('seerChecks');
    expect(viewFor(snap.state, snap.log, seats.villagers[1]!)).not.toHaveProperty('seerChecks');
  });

  it('夜晚三态：狼持有 wolf-kill、预言家持有 seer-check；未发牌/非法座位抛错', () => {
    const { snapshots, seats } = playFixture();
    // 放逐确认后 → 夜2 night_wolf：存活狼持狼刀待决策，死者无操作权
    const wolfPending = snapAt(snapshots, '放逐1·确认');
    expect(wolfPending.state.phase).toBe('night_wolf');
    expect(viewFor(wolfPending.state, wolfPending.log, seats.wolfB).pending).toEqual({
      actor: 'wolf-team',
      kind: 'wolf-kill',
    });
    expect(viewFor(wolfPending.state, wolfPending.log, seats.wolfA)).not.toHaveProperty('pending');
    expect(viewFor(wolfPending.state, wolfPending.log, seats.seer)).not.toHaveProperty('pending');

    // 夜1 狼刀结算前（night_seer）：只有预言家持有 seer-check
    const seerSnap = snapAt(snapshots, '夜1·狼刀');
    expect(seerSnap.state.phase).toBe('night_seer');
    expect(viewFor(seerSnap.state, seerSnap.log, seats.seer).pending).toEqual({
      actor: seats.seer,
      kind: 'seer-check',
    });
    expect(viewFor(seerSnap.state, seerSnap.log, seats.wolfB)).not.toHaveProperty('pending');

    const idle = createGame('idle-1');
    expect(() => idle.viewFor(1)).toThrow();
    expect(() => idle.eventsFor(1)).toThrow();
  });
});

describe('T5 players 投影：仅死者带 revealedRole（死亡即翻牌）', () => {
  it('整局终局：死者 revealedRole = 真实角色，存活者无 revealedRole 字段；各视角 players 相同', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '终局');
    expect(snap.state.phase).toBe('game_over');
    const deadSeats = snap.state.players.filter((p) => !p.alive).map((p) => p.seat);
    expect(deadSeats).toContain(seats.wolfA);
    expect(deadSeats).toContain(seats.seer);

    for (const seat of [1, 2, 3, 4, 5, 6]) {
      const view = viewFor(snap.state, snap.log, seat);
      for (const p of view.players) {
        const truth = snap.state.players.find((q) => q.seat === p.seat)!;
        if (p.alive) {
          expect(p).not.toHaveProperty('revealedRole');
        } else {
          expect(p.revealedRole).toBe(truth.role);
        }
      }
      // 公开身份表与视角无关
      expect(view.players).toStrictEqual(expectedPlayers(snap.state));
    }
  });
});

describe('T5 eventsFor：可见性投影口径（event-stream §2）', () => {
  it('public 恒可见；wolf-team 仅狼；seer-private 仅预言家；end 终局前不可见', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '天亮1'); // 日志含 6 条：发牌 → 夜1 刀 → 查验 → 死讯
    const typesOf = (seat: number) => eventsFor(snap.state, snap.log, seat).map((e) => e.type);
    expect(typesOf(seats.villagers[1]!)).toEqual(['game_started', 'night_started', 'player_died']);
    expect(typesOf(seats.wolfA)).toEqual(['game_started', 'night_started', 'wolf_kill_decided', 'player_died']);
    expect(typesOf(seats.seer)).toEqual(['game_started', 'night_started', 'seer_check_completed', 'player_died']);
    // end：终局前 roles_dealt 对所有座位都不可见
    for (const seat of [1, 2, 3, 4, 5, 6]) {
      expect(typesOf(seat)).not.toContain('roles_dealt');
    }
  });

  it('终局：end（roles_dealt）对所有座位翻牌；wolf-team / seer-private 仍按角色过滤', () => {
    const { snapshots, seats } = playFixture();
    const snap = snapAt(snapshots, '终局');
    const typesOf = (seat: number) => eventsFor(snap.state, snap.log, seat).map((e) => e.type);
    // 村民：公开 + 终局翻牌的 roles_dealt，看不到狼刀与查验
    expect(typesOf(seats.villagers[1]!)).toContain('roles_dealt');
    expect(typesOf(seats.villagers[1]!)).not.toContain('wolf_kill_decided');
    expect(typesOf(seats.villagers[1]!)).not.toContain('seer_check_completed');
    // 狼：含 own 通道 + end
    expect(typesOf(seats.wolfB)).toContain('wolf_kill_decided');
    expect(typesOf(seats.wolfB)).toContain('roles_dealt');
    // 预言家：含 seer-private + end
    expect(typesOf(seats.seer)).toContain('seer_check_completed');
    expect(typesOf(seats.seer)).toContain('roles_dealt');
    // 所有投影都只包含 public / end 或本角色通道
    const hiddenTypes = new Set(['wolf_kill_decided', 'seer_check_completed']);
    for (const seat of [1, 2, 3, 4, 5, 6]) {
      const role = snap.state.players.find((p) => p.seat === seat)!.role;
      for (const ev of eventsFor(snap.state, snap.log, seat)) {
        if (hiddenTypes.has(ev.type)) {
          expect(role === 'werewolf' || role === 'seer').toBe(true);
        }
      }
    }
  });

  it('FR-007：死者观战投影与生前一致（狼仍收 wolf-team、预言家仍收 seer-private）', () => {
    const { snapshots, seats } = playFixture();
    // 狼 A 已于日1 被放逐；夜2 的狼刀（狼 B 决定）仍应出现在它的投影里
    const night2 = snapAt(snapshots, '天亮2');
    const deadWolf = viewFor(night2.state, night2.log, seats.wolfA);
    expect(deadWolf.you.alive).toBe(false);
    expect(deadWolf.teammates).toEqual(seats.wolves);
    expect(deadWolf).not.toHaveProperty('pending'); // 无操作权
    const deadWolfSeqs = eventsFor(night2.state, night2.log, seats.wolfA).map((e) => e.seq);
    expect(deadWolfSeqs).toEqual(
      night2.log
        .filter((e) => e.visibility === 'public' || e.visibility === 'wolf-team')
        .map((e) => e.seq),
    );

    // 预言家已于夜1 天亮死亡；死后仍保留完整查验史与 seer-private 投影
    const dawn1 = snapAt(snapshots, '天亮1');
    const deadSeer = viewFor(dawn1.state, dawn1.log, seats.seer);
    expect(deadSeer.you.alive).toBe(false);
    expect(deadSeer.seerChecks).toEqual([{ target: seats.wolfA, result: 'werewolf', round: 1 }]);
    expect(deadSeer).not.toHaveProperty('pending');
    expect(eventsFor(dawn1.state, dawn1.log, seats.seer).map((e) => e.type)).toContain(
      'seer_check_completed',
    );
  });
});

describe('T5 门面挂接与整局 6 座位扫描（§8 第 8 条）', () => {
  it('engine.viewFor / engine.eventsFor 与纯函数投影一致', () => {
    const { engine } = playFixture();
    const log = [...engine.eventLog];
    for (const seat of [1, 2, 3, 4, 5, 6]) {
      expect(engine.viewFor(seat)).toStrictEqual(viewFor(engine.state, log, seat));
      expect(engine.eventsFor(seat)).toStrictEqual(eventsFor(engine.state, log, seat));
    }
  });

  it('整局夹具逐快照 × 全部 6 座位：结构、角色条件字段、公开史、pending 口径、无泄漏、非干涉性', () => {
    const { snapshots, seats } = playFixture();
    const wolfSeats = seats.wolves;
    expect(snapshots.length).toBeGreaterThanOrEqual(20);

    let scanned = 0;
    let swaps = 0;
    for (const snap of snapshots) {
      const { state, log, pending } = snap;
      const currentPending = derivePending(state);
      expect(currentPending).toStrictEqual(pending);

      for (const seat of [1, 2, 3, 4, 5, 6]) {
        const me = state.players.find((p) => p.seat === seat)!;
        const view = viewFor(state, log, seat);

        // 1) 公开节奏 + 自身坐标
        expect(view.round).toBe(state.round);
        expect(view.phase).toBe(state.phase);
        expect(view.you).toStrictEqual({ seat, role: me.role, alive: me.alive });

        // 2) players 仅死者带 revealedRole；任何存活者的身份都无法在视图里表达
        expect(view.players).toHaveLength(6);
        for (const p of view.players) {
          expect(Object.keys(p).sort()).toEqual(
            p.alive ? ['alive', 'isHuman', 'seat'] : ['alive', 'isHuman', 'revealedRole', 'seat'],
          );
          const truth = state.players.find((q) => q.seat === p.seat)!;
          expect(p.alive).toBe(truth.alive);
          if (!p.alive) expect(p.revealedRole).toBe(truth.role);
        }

        // 3) 角色条件字段
        if (me.role === 'werewolf') {
          expect(view.teammates).toEqual(wolfSeats);
        } else {
          expect(view).not.toHaveProperty('teammates');
        }
        if (me.role === 'seer') {
          expect(view.seerChecks).toEqual(expectedChecks(log));
        } else {
          expect(view).not.toHaveProperty('seerChecks');
        }

        // 4) 公开史投影口径与日志一致
        expect(view.speeches).toEqual(expectedSpeeches(log));
        expect(view.voteResults).toEqual(expectedVoteResults(log));

        // 5) pending 只给「存活且本座位有权行动」的座位（死者无操作权，FR-007）
        if (!pending) {
          expect(view).not.toHaveProperty('pending');
        } else {
          const canAct =
            me.alive && (pending.actor === seat || (pending.actor === 'wolf-team' && me.role === 'werewolf'));
          if (canAct) {
            expect(view.pending).toStrictEqual({ actor: pending.actor, kind: pending.kind });
          } else {
            expect(view).not.toHaveProperty('pending');
          }
        }

        // 6) 深检：白名单之外不得出现任何角色值 / 发牌表字段
        expect(leaksOf(view, state)).toEqual([]);

        // 7) 非干涉性：交换该座位看不到的他人身份 → 视图必须完全不变
        const pair = hiddenSwapPair(state, seat);
        if (pair) {
          const mutated = swapRoles(state, pair[0], pair[1]);
          expect(viewFor(mutated, log, seat)).toStrictEqual(view);
          // 行动者视角下，legalTargets 同样不得随隐藏身份变化
          const canAct =
            pending !== null &&
            me.alive &&
            (pending.actor === seat || (pending.actor === 'wolf-team' && me.role === 'werewolf'));
          if (canAct) {
            const legalTargets = derivePending(mutated)?.legalTargets ?? [];
            expect(legalTargets).toStrictEqual(pending.legalTargets);
          }
          swaps++;
        }
        scanned++;
      }
    }
    expect(scanned).toBe(snapshots.length * 6);
    expect(swaps).toBeGreaterThan(0);
  });

  it('DecisionRequest 深检：view/legalTargets/rng 不含他人隐藏身份，且 6 座位全部覆盖', () => {
    const { snapshots } = playFixture();
    const acted = new Set<number>();
    let requests = 0;

    for (const snap of snapshots) {
      if (!snap.pending) continue;
      const actingSeats =
        snap.pending.actor === 'wolf-team'
          ? snap.state.players.filter((p) => p.alive && p.role === 'werewolf').map((p) => p.seat).sort((a, b) => a - b)
          : [snap.pending.actor];

      for (const seat of actingSeats) {
        const req: DecisionRequest = {
          kind: snap.pending.kind,
          view: viewFor(snap.state, snap.log, seat),
          legalTargets: [...snap.pending.legalTargets],
          rng: createRng(`decision-${seat}-${snap.log.length}`),
        };
        expectCleanDecisionRequest(req, seat, snap.state);

        // 非干涉性：交换隐藏身份后，决策请求的 view 与 legalTargets 均不变
        const pair = hiddenSwapPair(snap.state, seat);
        if (pair) {
          const mutated = swapRoles(snap.state, pair[0], pair[1]);
          expect(viewFor(mutated, snap.log, seat)).toStrictEqual(req.view);
          expect(derivePending(mutated)?.legalTargets ?? []).toStrictEqual(req.legalTargets);
        }
        acted.add(seat);
        requests++;
      }
    }
    expect(requests).toBeGreaterThan(0);
    // 6 个座位都至少真实构造过一次决策请求（含狼队两匹狼的 wolf-kill）
    expect([...acted].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
});
