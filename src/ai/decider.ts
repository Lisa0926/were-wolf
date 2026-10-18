/**
 * AI 决策器（tasks T022；data-model §7；规则 §5 策略表逐行落实）
 *
 * 契约要点：
 * - `deciderFor(role)` 返回 `(req: DecisionRequest) => Action` 的纯函数；
 * - 输入只有 `req.view` / `req.legalTargets` / `req.rng`（FR-008）；
 *   本模块不 import 引擎内部状态（engine/transition/settle/engine），
 *   也不读 `eventLog`——一切事实都来自可见视图（隔离唯一咽喉点）；
 * - 随机只经 `req.rng`（硬约束 2）；同视图 + 同 rng 状态 → 同决策；
 * - **不看 `view.pending`**：该做什么由引擎给出的 `req.kind` 决定
 *   （view.pending 只在本人存活且有权行动时出现，不足以描述狼队行动）。
 *
 * 规则留白处的实现口径（规则 §5 未规定；主会话 2026-10-18 裁定批准，
 * 决策记录见交付报告「规则留白口径」一节；另：狼「被查杀」若发生在自己
 * 发言之后，则在后续白天按同一模板反驳，不新增随机）：
 * 1. 预言家在第 2 个白天及以后仍用同一句「公布最新查验」带 claim——
 *    §5 只钉了「首个白天立即跳」，后续白天不引入任何新行为，只是把
 *    「最新查验」继续报出来（同一个 claim 形状、同一个信息来源）；
 * 2. 预言家/村民「否则随机」的随机域 = 存活他人（不含自己）——好人不会
 *    投自己；S0 引擎允许投自己，但那是给真人的自由，不是 AI 策略；
 * 3. 「有存活查杀」含历史查验：只要查杀目标仍存活就投，多个取**最近一次**
 *    （确定性，不多耗随机数）；
 * 4. 预言家所有存活他人都验过（引擎要求每夜必验）时，退化为在合法目标中
 *    随机——避免自锁，不新增动作类型。
 * 5. 角色收到自己没有的夜间 kind（如村民收到 wolf-kill）→ 显式抛错，
 *    让驱动层 bug 立刻暴露，而不是静默产出非法动作。
 */
import type { Action, Role } from '../engine/types';
import type { DecisionRequest, VisibleView } from '../engine/view';
import {
  seerClaimGood,
  seerClaimWerewolf,
  villagerNoInfo,
  villagerStandWithSeer,
  wolfDisguiseVillager,
  wolfRebuttal,
} from './speech-templates';

/** 决策器类型（data-model §7 的 Decider 落位） */
export type Decider = (req: DecisionRequest) => Action;

/** 按角色取决策器（三角色各一个纯函数） */
export function deciderFor(role: Role): Decider {
  const deciders: Record<Role, Decider> = {
    werewolf: werewolfDecider,
    seer: seerDecider,
    villager: villagerDecider,
  };
  return deciders[role];
}

// —————————————————————— 可见信息小工具（只吃 view） ——————————————————————

const aliveSeats = (view: VisibleView): number[] =>
  view.players
    .filter((p) => p.alive)
    .map((p) => p.seat)
    .sort((a, b) => a - b);

/** legalTargets ∩ 存活座位（引擎已给合法集，这里再按视图收一道） */
function inPlay(view: VisibleView, legalTargets: readonly number[]): number[] {
  const alive = new Set(aliveSeats(view));
  return legalTargets.filter((t) => alive.has(t));
}

/** 从候选池随机取一个；池空时回退 legalTargets（防御性，结构上不可达） */
function pickTarget(req: DecisionRequest, pool: readonly number[]): number {
  const candidates = pool.length > 0 ? [...pool] : [...req.legalTargets];
  if (candidates.length === 0) {
    throw new Error(`${req.kind}: 无合法目标可选（引擎未给出 legalTargets）`);
  }
  return req.rng.pick(candidates);
}

/** 最近一次「查杀我」的指控者座位（规则 §5 狼被查杀 → 反驳） */
function accuserOf(view: VisibleView): number | undefined {
  let accuser: number | undefined;
  for (const speech of view.speeches) {
    const claim = speech.claim;
    if (claim && claim.target === view.you.seat && claim.result === 'werewolf') accuser = speech.seat;
  }
  return accuser;
}

/** 最近一次预言家声明的座位（村民站边对象） */
function lastSeerClaimant(view: VisibleView): number | undefined {
  let claimant: number | undefined;
  for (const speech of view.speeches) {
    if (speech.claim) claimant = speech.seat;
  }
  return claimant;
}

// —————————————————————— 狼人（规则 §5 第一行） ——————————————————————

function werewolfDecider(req: DecisionRequest): Action {
  const seat = req.view.you.seat;
  const mates = new Set(req.view.teammates ?? []);
  switch (req.kind) {
    case 'wolf-kill': {
      // 夜：从存活好人中随机选刀口（teammates 含自己，故队友与自己都被排除）
      const good = inPlay(req.view, req.legalTargets).filter((t) => !mates.has(t));
      return { type: 'wolfKill', target: pickTarget(req, good) };
    }
    case 'speech': {
      // 昼：被查杀则反驳，否则伪装村民
      const accuser = accuserOf(req.view);
      const text = accuser === undefined ? wolfDisguiseVillager() : wolfRebuttal(accuser);
      return { type: 'speak', text, actor: seat };
    }
    case 'vote': {
      // 票：随机投存活好人（不投队友、不投自己）
      const good = inPlay(req.view, req.legalTargets).filter((t) => !mates.has(t));
      return { type: 'castVote', target: pickTarget(req, good), actor: seat };
    }
    case 'seer-check':
      throw new Error('狼人无查验动作：deciderFor("werewolf") 不该收到 seer-check');
  }
}

// —————————————————————— 预言家（规则 §5 第二行） ——————————————————————

function seerDecider(req: DecisionRequest): Action {
  const seat = req.view.you.seat;
  const checks = req.view.seerChecks ?? [];
  switch (req.kind) {
    case 'seer-check': {
      // 夜：只从「未验过的存活者」中随机验（自己不在 legalTargets 内）
      const checked = new Set(checks.map((c) => c.target));
      const fresh = inPlay(req.view, req.legalTargets).filter((t) => !checked.has(t));
      return { type: 'seerCheck', target: pickTarget(req, fresh) };
    }
    case 'speech': {
      // 昼：公布最新查验（金水/查杀）并挂结构化 claim
      const latest = checks[checks.length - 1];
      if (!latest) {
        // 结构上不可达：预言家存活 ⇒ 首夜必已查验；退化为跳过，不编造声明
        return { type: 'skip', actor: seat };
      }
      const claim = { kind: 'seer-claim' as const, target: latest.target, result: latest.result };
      const text = latest.result === 'werewolf' ? seerClaimWerewolf(latest.target) : seerClaimGood(latest.target);
      return { type: 'speak', text, claim, actor: seat };
    }
    case 'vote': {
      // 票：有存活查杀 → 投查杀（多个取最近一次）；否则在存活他人中随机
      const alive = new Set(aliveSeats(req.view));
      const kills = checks.filter(
        (c) => c.result === 'werewolf' && alive.has(c.target) && req.legalTargets.includes(c.target),
      );
      const target = kills.length > 0 ? kills[kills.length - 1]!.target : undefined;
      if (target !== undefined) return { type: 'castVote', target, actor: seat };
      const others = inPlay(req.view, req.legalTargets).filter((t) => t !== seat);
      return { type: 'castVote', target: pickTarget(req, others), actor: seat };
    }
    case 'wolf-kill':
      throw new Error('预言家无刀人动作：deciderFor("seer") 不该收到 wolf-kill');
  }
}

// —————————————————————— 村民（规则 §5 第三行） ——————————————————————

function villagerDecider(req: DecisionRequest): Action {
  const seat = req.view.you.seat;
  switch (req.kind) {
    case 'speech': {
      // 昼：无信息模板句 / 站边跳出的预言家
      const claimant = lastSeerClaimant(req.view);
      const text = claimant === undefined ? villagerNoInfo() : villagerStandWithSeer(claimant);
      return { type: 'speak', text, actor: seat };
    }
    case 'vote': {
      // 票：同预言家逻辑——公开 claim 里有存活查杀就投，否则在存活他人中随机
      const alive = new Set(aliveSeats(req.view));
      const kills = req.view.speeches.filter((s) => {
        const claim = s.claim;
        return (
          claim !== undefined &&
          claim.result === 'werewolf' &&
          alive.has(claim.target) &&
          req.legalTargets.includes(claim.target)
        );
      });
      const target = kills.length > 0 ? kills[kills.length - 1]!.claim!.target : undefined;
      if (target !== undefined) return { type: 'castVote', target, actor: seat };
      const others = inPlay(req.view, req.legalTargets).filter((t) => t !== seat);
      return { type: 'castVote', target: pickTarget(req, others), actor: seat };
    }
    case 'wolf-kill':
    case 'seer-check':
      throw new Error(`村民无夜间动作：deciderFor("villager") 不该收到 ${req.kind}`);
  }
}
