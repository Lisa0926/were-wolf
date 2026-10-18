import { describe, expect, it } from 'vitest';
import { deciderFor } from '../src/ai/decider';
import type { Action, PendingDecision, Phase, Role } from '../src/engine/types';
import type { VisiblePlayer, VisibleSpeech, VisibleView } from '../src/engine/view';
import { createRng } from '../src/rng/rng';

/**
 * T020 AI 策略（tasks T020；FR-002/FR-008 策略面；规则 §5 策略表逐行）
 *
 * 口径（先口径后断言）：
 * - 夹具是**手写 VisibleView**（不经过引擎）：AI 的唯一输入是 DecisionRequest，
 *   策略断言只针对「可见信息 → 决策」这一层，不需要真实对局就能逐行锁 §5。
 * - 规则 §5 策略表三行 × 三列逐条落断言：
 *   狼    夜：只从存活好人中选刀口（不含狼队友/自己/死者）
 *         昼：伪装村民模板句；被查杀（claim 命中自己且 result=werewolf）则反驳指控者
 *         票：随机投存活好人——不投队友（teammates 含自己，故自己也不会被投）
 *   预言家 夜：只从**未验过**的存活者中验（seerChecks 已验者排除）
 *         昼：首个白天跳身份，公布最新查验（金水/查杀）并带
 *             claim {kind:'seer-claim', target, result}
 *         票：有存活查杀 → 投查杀；否则随机
 *   村民  昼：模板句——无信息 / 站边跳出的预言家
 *         票：同预言家逻辑（有存活查杀投查杀，否则随机），查杀来自公开 claim
 * - 「同视图 + 同 rng 状态 → 同决策」逐组合断言；「随机只经 req.rng」由
 *   同 seed 复现 + 异 seed 出现不同选择两侧夹住。
 * - AI **不看** view.pending（任务书 §四.2）：本文件的夹具默认不带 pending，
 *   另有一条断言证明 pending 有无不改变决策。
 */

// —————————————————————— 夹具 ——————————————————————

/**
 * 手写可见视图：座位 1–6，`dead` 中的座位视为已死并翻牌
 * （狼队座位的翻牌角色为 werewolf，其余为 villager）。
 */
function mkView(o: {
  seat: number;
  role: Role;
  dead?: number[];
  teammates?: number[];
  seerChecks?: NonNullable<VisibleView['seerChecks']>;
  speeches?: VisibleSpeech[];
  round?: number;
  phase?: Phase;
  pending?: VisibleView['pending'];
}): VisibleView {
  const dead = new Set(o.dead ?? []);
  const wolfSeats = new Set(o.teammates ?? (o.role === 'werewolf' ? [o.seat] : []));
  const players: VisiblePlayer[] = [1, 2, 3, 4, 5, 6].map((seat) => ({
    seat,
    alive: !dead.has(seat),
    isHuman: seat === 6,
    ...(dead.has(seat) ? { revealedRole: wolfSeats.has(seat) ? ('werewolf' as const) : ('villager' as const) } : {}),
  }));
  const view: VisibleView = {
    round: o.round ?? 1,
    phase: o.phase ?? 'day_speak',
    you: { seat: o.seat, role: o.role, alive: !dead.has(o.seat) },
    players,
    speeches: o.speeches ?? [],
    voteResults: [],
  };
  if (o.teammates) view.teammates = [...o.teammates];
  if (o.role === 'seer') view.seerChecks = o.seerChecks ?? [];
  if (o.pending) view.pending = o.pending;
  return view;
}

/** 构造一次决策（rng 由 seed 现场创建，等价于引擎"借出单流"的形状） */
function decide(
  role: Role,
  kind: PendingDecision['kind'],
  view: VisibleView,
  legalTargets: number[],
  seed = 'rng-1',
): Action {
  return deciderFor(role)({ kind, view, legalTargets, rng: createRng(seed) });
}

const SEEDS = Array.from({ length: 40 }, (_, i) => `rng-${i}`);

/** 同一次决策对 40 个 rng seed 的结果集合 */
function targetSet(
  role: Role,
  kind: PendingDecision['kind'],
  view: VisibleView,
  legalTargets: number[],
): number[] {
  return SEEDS.map((seed) => {
    const action = decide(role, kind, view, legalTargets, seed);
    if (action.type !== 'wolfKill' && action.type !== 'seerCheck' && action.type !== 'castVote') {
      throw new Error(`${role}/${kind} 未产出目标类动作：${JSON.stringify(action)}`);
    }
    return action.target;
  });
}

const speechOf = (action: Action) => {
  if (action.type !== 'speak') throw new Error(`期望 speak，收到 ${JSON.stringify(action)}`);
  return action;
};

const claimOf = (seat: number, target: number, result: 'good' | 'werewolf', round = 1): VisibleSpeech => ({
  round,
  seat,
  text: `夹具发言：${seat} 号声明查验 ${target} 号为 ${result}`,
  claim: { kind: 'seer-claim', target, result },
});

// —————————————————————— 狼人（规则 §5 第一行） ——————————————————————

describe('T020 狼人：夜刀只从存活好人中选', () => {
  const view = mkView({ seat: 1, role: 'werewolf', teammates: [1, 4], dead: [6], phase: 'night_wolf' });

  it('候选恒为存活好人（不含队友 4、不含自己 1、不含死者 6）', () => {
    const kills = targetSet('werewolf', 'wolf-kill', view, [2, 3, 5]);
    for (const target of kills) expect([2, 3, 5]).toContain(target);
    expect(new Set(kills).size).toBe(3); // 三个候选都能被抽到 → 随机确实经 req.rng
  });

  it('legalTargets 里混入队友时仍然不刀队友（策略按视图再过滤一遍）', () => {
    const kills = targetSet('werewolf', 'wolf-kill', view, [2, 3, 4, 5]);
    for (const target of kills) expect([2, 3, 5]).toContain(target);
    expect(kills).not.toContain(4);
  });
});

describe('T020 狼人：投票不投队友（teammates 含自己）', () => {
  const view = mkView({ seat: 1, role: 'werewolf', teammates: [1, 4], dead: [6], phase: 'vote' });

  it('只投存活好人——不投队友 4，也不投自己 1', () => {
    const votes = targetSet('werewolf', 'vote', view, [1, 2, 3, 4, 5]);
    for (const target of votes) expect([2, 3, 5]).toContain(target);
    expect(votes).not.toContain(1);
    expect(votes).not.toContain(4);
    expect(new Set(votes).size).toBe(3);
  });
});

describe('T020 狼人：白天伪装村民模板句', () => {
  it('未被查杀 → 伪装村民（不点身份、不带 claim）', () => {
    const view = mkView({ seat: 1, role: 'werewolf', teammates: [1, 4] });
    const action = speechOf(decide('werewolf', 'speech', view, [1]));
    expect(action.actor).toBe(1);
    expect(action.text).toContain('村民');
    expect(action.text).not.toContain('预言家');
    expect(action.text).not.toContain('查杀');
    expect(action).not.toHaveProperty('claim');
  });

  it('被其他座位的查杀声明命中别人 → 仍是伪装村民', () => {
    const view = mkView({
      seat: 1,
      role: 'werewolf',
      teammates: [1, 4],
      speeches: [claimOf(2, 5, 'werewolf')],
    });
    const action = speechOf(decide('werewolf', 'speech', view, [1]));
    expect(action.text).toContain('村民');
    expect(action.text).not.toContain('悍跳');
  });
});

describe('T020 狼人：被查杀则反驳（「我不是狼，X 是悍跳」）', () => {
  it('claim 命中自己且 result=werewolf → 点名指控者为悍跳', () => {
    const view = mkView({
      seat: 1,
      role: 'werewolf',
      teammates: [1, 4],
      speeches: [claimOf(2, 1, 'werewolf')],
    });
    const action = speechOf(decide('werewolf', 'speech', view, [1]));
    expect(action.actor).toBe(1);
    expect(action.text).toContain('我不是狼');
    expect(action.text).toContain('悍跳');
    expect(action.text).toContain('2');
    expect(action).not.toHaveProperty('claim'); // 狼不跳身份（S0 策略表无悍跳申报）
  });

  it('后续轮次的历史查杀仍触发反驳（指控者取最近一次）', () => {
    const view = mkView({
      seat: 3,
      role: 'werewolf',
      teammates: [1, 3],
      round: 2,
      speeches: [claimOf(2, 3, 'werewolf', 1), claimOf(5, 3, 'werewolf', 2)],
    });
    const action = speechOf(decide('werewolf', 'speech', view, [3]));
    expect(action.text).toContain('我不是狼');
    expect(action.text).toContain('悍跳');
    expect(action.text).toContain('5');
  });
});

// —————————————————————— 预言家（规则 §5 第二行） ——————————————————————

describe('T020 预言家：只从「未验过」的存活者中验', () => {
  const view = mkView({
    seat: 2,
    role: 'seer',
    dead: [6],
    phase: 'night_seer',
    seerChecks: [
      { target: 3, result: 'good', round: 1 },
      { target: 5, result: 'werewolf', round: 1 },
    ],
  });

  it('已验过的 3/5、自己 2、死者 6 全部排除', () => {
    const checks = targetSet('seer', 'seer-check', view, [1, 3, 4, 5]);
    for (const target of checks) expect([1, 4]).toContain(target);
    expect(new Set(checks).size).toBe(2);
  });

  it('所有存活他人都验过时仍能给出合法目标（不抛错、不自锁）', () => {
    const allChecked = mkView({
      seat: 2,
      role: 'seer',
      phase: 'night_seer',
      seerChecks: [
        { target: 1, result: 'good', round: 1 },
        { target: 3, result: 'good', round: 1 },
        { target: 4, result: 'good', round: 1 },
        { target: 5, result: 'werewolf', round: 1 },
      ],
    });
    const checks = targetSet('seer', 'seer-check', allChecked, [1, 3, 4, 5]);
    for (const target of checks) expect([1, 3, 4, 5]).toContain(target);
    expect(checks).not.toContain(2);
  });
});

describe('T020 预言家：首个白天跳身份并公布最新查验', () => {
  it('最新查验是查杀 → claim 带 result=werewolf，模板句含「查杀」', () => {
    const view = mkView({
      seat: 2,
      role: 'seer',
      seerChecks: [{ target: 5, result: 'werewolf', round: 1 }],
      round: 1,
    });
    const action = speechOf(decide('seer', 'speech', view, [2]));
    expect(action.actor).toBe(2);
    expect(action.claim).toStrictEqual({ kind: 'seer-claim', target: 5, result: 'werewolf' });
    expect(action.text).toContain('预言家');
    expect(action.text).toContain('查杀');
    expect(action.text).toContain('5');
  });

  it('最新查验是金水 → claim 带 result=good，模板句含「金水」', () => {
    const view = mkView({
      seat: 2,
      role: 'seer',
      seerChecks: [
        { target: 3, result: 'werewolf', round: 1 },
        { target: 4, result: 'good', round: 1 },
      ],
    });
    const action = speechOf(decide('seer', 'speech', view, [2]));
    expect(action.claim).toStrictEqual({ kind: 'seer-claim', target: 4, result: 'good' });
    expect(action.text).toContain('预言家');
    expect(action.text).toContain('金水');
    expect(action.text).toContain('4');
  });

  it('第 2 个白天公布最新查验（规则 §5 只钉首个白天，后续沿用同一「公布最新查验」口径）', () => {
    const view = mkView({
      seat: 2,
      role: 'seer',
      round: 2,
      seerChecks: [
        { target: 4, result: 'good', round: 1 },
        { target: 5, result: 'werewolf', round: 2 },
      ],
    });
    const action = speechOf(decide('seer', 'speech', view, [2]));
    expect(action.claim).toStrictEqual({ kind: 'seer-claim', target: 5, result: 'werewolf' });
  });
});

describe('T020 预言家：有存活查杀投查杀，否则随机', () => {
  it('查验史里有存活查杀 → 投该查杀（不看 rng）', () => {
    const view = mkView({
      seat: 2,
      role: 'seer',
      phase: 'vote',
      seerChecks: [
        { target: 3, result: 'good', round: 1 },
        { target: 5, result: 'werewolf', round: 1 },
      ],
    });
    const votes = targetSet('seer', 'vote', view, [1, 3, 4, 5]);
    expect(new Set(votes)).toEqual(new Set([5]));
  });

  it('查杀已死 → 回到随机（在存活他人中，不投自己）', () => {
    const view = mkView({
      seat: 2,
      role: 'seer',
      phase: 'vote',
      dead: [5],
      seerChecks: [
        { target: 3, result: 'good', round: 1 },
        { target: 5, result: 'werewolf', round: 1 },
      ],
    });
    const votes = targetSet('seer', 'vote', view, [1, 3, 4]);
    for (const target of votes) expect([1, 3, 4]).toContain(target);
    expect(votes).not.toContain(2);
    expect(new Set(votes).size).toBe(3);
  });
});

// —————————————————————— 村民（规则 §5 第三行） ——————————————————————

describe('T020 村民：模板句（无信息 / 站边跳出的预言家）', () => {
  it('没有任何预言家声明 → 无信息模板句，不带 claim', () => {
    const view = mkView({ seat: 1, role: 'villager' });
    const action = speechOf(decide('villager', 'speech', view, [1]));
    expect(action.actor).toBe(1);
    expect(action.text).toContain('村民');
    expect(action).not.toHaveProperty('claim');
  });

  it('有预言家跳出 → 站边该预言家（点名座位），自己不带 claim', () => {
    const view = mkView({
      seat: 1,
      role: 'villager',
      speeches: [claimOf(2, 5, 'werewolf')],
    });
    const action = speechOf(decide('villager', 'speech', view, [1]));
    expect(action.text).toContain('站');
    expect(action.text).toContain('2');
    expect(action).not.toHaveProperty('claim');
  });
});

describe('T020 村民：投票同预言家逻辑（有存活查杀投查杀，否则随机）', () => {
  it('公开 claim 里有存活查杀 → 投该查杀', () => {
    const view = mkView({
      seat: 1,
      role: 'villager',
      phase: 'vote',
      speeches: [claimOf(2, 5, 'werewolf')],
    });
    const votes = targetSet('villager', 'vote', view, [1, 2, 3, 4, 5]);
    expect(new Set(votes)).toEqual(new Set([5]));
  });

  it('查杀已死 / 只有金水 → 在存活他人中随机（不投自己）', () => {
    const view = mkView({
      seat: 1,
      role: 'villager',
      phase: 'vote',
      dead: [5],
      speeches: [claimOf(2, 3, 'good')],
    });
    const votes = targetSet('villager', 'vote', view, [1, 2, 3, 4]);
    for (const target of votes) expect([2, 3, 4]).toContain(target);
    expect(votes).not.toContain(1);
    expect(new Set(votes).size).toBe(3);
  });
});

// —————————————————————— 纯函数性（任务书 §六.6 末条） ——————————————————————

describe('T020 决策是 req 的纯函数：同视图 + 同 rng 状态 → 同决策', () => {
  const wolfView = mkView({
    seat: 1,
    role: 'werewolf',
    teammates: [1, 4],
    dead: [6],
    phase: 'night_wolf',
  });
  const seerView = mkView({
    seat: 2,
    role: 'seer',
    dead: [6],
    seerChecks: [{ target: 5, result: 'werewolf', round: 1 }],
  });
  const villagerView = mkView({
    seat: 3,
    role: 'villager',
    speeches: [claimOf(2, 5, 'werewolf')],
  });

  const cases: Array<{ role: Role; kind: PendingDecision['kind']; view: VisibleView; legalTargets: number[] }> = [
    { role: 'werewolf', kind: 'wolf-kill', view: wolfView, legalTargets: [2, 3, 5] },
    { role: 'werewolf', kind: 'speech', view: wolfView, legalTargets: [1] },
    { role: 'werewolf', kind: 'vote', view: wolfView, legalTargets: [1, 2, 3, 4, 5] },
    { role: 'seer', kind: 'seer-check', view: seerView, legalTargets: [1, 3, 4, 5] },
    { role: 'seer', kind: 'speech', view: seerView, legalTargets: [2] },
    { role: 'seer', kind: 'vote', view: seerView, legalTargets: [1, 3, 4, 5] },
    { role: 'villager', kind: 'speech', view: villagerView, legalTargets: [3] },
    { role: 'villager', kind: 'vote', view: villagerView, legalTargets: [1, 2, 3, 4, 5] },
  ];

  it('8 个（角色 × kind）组合：同输入两次调用结果全等', () => {
    for (const c of cases) {
      const a = decide(c.role, c.kind, c.view, c.legalTargets, 'same-seed');
      const b = decide(c.role, c.kind, c.view, c.legalTargets, 'same-seed');
      expect(a, `${c.role}/${c.kind}`).toStrictEqual(b);
    }
  });

  it('随机类决策对异 rng 状态会给出不同选择（随机确实来自 req.rng，而非常量）', () => {
    const c = cases[0]!;
    const picks = new Set(
      SEEDS.map((seed) => JSON.stringify(decide(c.role, c.kind, c.view, c.legalTargets, seed))),
    );
    expect(picks.size).toBeGreaterThan(1);
  });

  it('AI 不看 view.pending：带 pending 与不带 pending 的决策完全相同', () => {
    for (const c of cases) {
      const withPending: VisibleView = {
        ...c.view,
        pending: { actor: c.role === 'werewolf' && c.kind === 'wolf-kill' ? 'wolf-team' : c.view.you.seat, kind: c.kind },
      };
      const a = decide(c.role, c.kind, c.view, c.legalTargets, 'same-seed');
      const b = decide(c.role, c.kind, withPending, c.legalTargets, 'same-seed');
      expect(b, `${c.role}/${c.kind}`).toStrictEqual(a);
    }
  });
});

describe('T020 决策器边界：无夜间技能的角色收到夜间 kind → 显式报错', () => {
  it('村民/预言家收到 wolf-kill、狼与村民收到 seer-check 均抛错（结构误用不静默）', () => {
    const villagerView = mkView({ seat: 1, role: 'villager' });
    const wolfView = mkView({ seat: 1, role: 'werewolf', teammates: [1, 4] });
    expect(() => decide('villager', 'wolf-kill', villagerView, [2], 'x')).toThrow();
    expect(() => decide('villager', 'seer-check', villagerView, [2], 'x')).toThrow();
    expect(() => decide('werewolf', 'seer-check', wolfView, [2], 'x')).toThrow();
    expect(() => decide('seer', 'wolf-kill', mkView({ seat: 2, role: 'seer' }), [2], 'x')).toThrow();
  });
});
