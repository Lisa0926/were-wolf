/**
 * 无头整局驱动（tasks T024；research D5「驱动循环很薄，ui 与 tests 各一份」）
 *
 * 循环形状（与 ui/useGame 同构，不抽第五模块）：
 *   pendingDecision 行动者（含真人座位——测试中由 decider 代打，保证确定性）
 *   → deciderFor(该座位角色) → dispatch；pendingDecision 为 null（dawn / exile）
 *   → 自动 confirm；直到 game_over。
 *
 * rng 口径（登记在交付报告）：research D3 / contracts §2 的「引擎把 rng 借出」
 * 在 Engine 门面上还没有对应入口（rng 是 private），因此驱动层按 seed 自建
 * **一条**决策流并全程复用——取数顺序由本循环固定，同 seed 仍逐字节可复现。
 * decider 本身只拿得到 DecisionRequest，碰不到这条流以外的东西。
 *
 * 驱动是宿主（等价于 UI 进程），可以读 `engine.state` 找到"狼队该由哪个座位
 * 代表行动"；decider 只消费 `engine.viewFor(seat)` 的可见视图。
 */
import { deciderFor } from '../../src/ai/decider';
import { createGame, type Engine } from '../../src/engine/engine';
import type { Action, PendingDecision } from '../../src/engine/types';
import type { DecisionRequest } from '../../src/engine/view';
import { createRng, type Rng } from '../../src/rng/rng';

/** 单局步数上限：只把「驱动死循环」变成明确失败，不是规则上限（§4.5 平票无上限） */
const MAX_STEPS = 10_000;

export function autoplay(seed: string): Engine {
  const engine = createGame(seed);
  const rng = createRng(`autoplay:${seed}`);
  must(engine, { type: 'startGame', seed });

  for (let step = 0; step < MAX_STEPS && engine.state.phase !== 'game_over'; step++) {
    const pending = engine.pendingDecision;
    if (!pending) {
      must(engine, { type: 'confirm' }); // dawn / exile 自动推进（S0 无人工确认）
      continue;
    }
    const seat = actingSeat(engine, pending);
    const req = buildRequest(engine, seat, pending, rng);
    must(engine, deciderFor(req.view.you.role)(req));
  }

  if (engine.state.phase !== 'game_over') {
    throw new Error(`autoplay(${JSON.stringify(seed)}) 未在 ${MAX_STEPS} 步内到达 game_over`);
  }
  return engine;
}

/**
 * 构造一次决策请求（驱动循环与引擎门面之间唯一的接缝）。
 *
 * TODO(rng 借出)：待 `engine.decisionRequest(seat)` 落地后整体替换本函数——
 * research D3 / contracts §2 要求 rng 由引擎随请求借出，目前 Engine 门面
 * 无该入口，故这里用驱动自建的确定性流（见文件头口径）。替换后调用点不变。
 */
function buildRequest(
  engine: Engine,
  seat: number,
  pending: PendingDecision,
  rng: Rng,
): DecisionRequest {
  return { kind: pending.kind, view: engine.viewFor(seat), legalTargets: [...pending.legalTargets], rng };
}

/** 狼队「一个声音」：由存活狼里座位最小的那只代表（确定性，research D6） */
function actingSeat(engine: Engine, pending: PendingDecision): number {
  if (pending.actor !== 'wolf-team') return pending.actor;
  const seat = engine.state.players
    .filter((p) => p.alive && p.role === 'werewolf')
    .map((p) => p.seat)
    .sort((a, b) => a - b)[0];
  if (seat === undefined) throw new Error('autoplay: 狼队已无存活狼，却仍有 wolf-team 待决策');
  return seat;
}

function must(engine: Engine, action: Action): void {
  const res = engine.dispatch(action);
  if (!Array.isArray(res)) {
    throw new Error(`autoplay 动作被拒 ${JSON.stringify(action)}: ${JSON.stringify(res)}`);
  }
}
