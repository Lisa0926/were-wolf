/**
 * 无头整局驱动（tasks T024；research D5「驱动循环很薄，ui 与 tests 各一份」）
 *
 * 循环形状（与 ui/useGame 同构，不抽第五模块）：
 *   `engine.decisionRequest()`（T034：rng 随请求借出）→ deciderFor →
 *   dispatch；无待决策（dawn / exile）→ 自动 confirm；直到 game_over。
 *
 * 单流口径（research D3）：决策用的 rng 由引擎 `decisionRequest()` 借出，
 * 就是 startGame 时创建的那条唯一随机流——驱动层不再自建/派生随机流。
 * 含真人座位：测试里真人位也由 decider 代打，保证无头整局确定性。
 */
import { deciderFor } from '../../src/ai/decider';
import { createGame, type Engine } from '../../src/engine/engine';
import type { Action } from '../../src/engine/types';
import type { DecisionRequest } from '../../src/engine/view';

/** 单局步数上限：只把「驱动死循环」变成明确失败，不是规则上限（§4.5 平票无上限） */
const MAX_STEPS = 10_000;

export function autoplay(seed: string): Engine {
  const engine = createGame(seed);
  must(engine, { type: 'startGame', seed });

  for (let step = 0; step < MAX_STEPS && engine.state.phase !== 'game_over'; step++) {
    if (!engine.pendingDecision) {
      must(engine, { type: 'confirm' }); // dawn / exile 自动推进（S0 无人工确认）
      continue;
    }
    const req = buildRequest(engine);
    must(engine, deciderFor(req.view.you.role)(req));
  }

  if (engine.state.phase !== 'game_over') {
    throw new Error(`autoplay(${JSON.stringify(seed)}) 未在 ${MAX_STEPS} 步内到达 game_over`);
  }
  return engine;
}

/**
 * 取本次决策请求（驱动循环与引擎门面之间唯一的接缝）。
 *
 * T034 起由 `engine.decisionRequest()` 提供，rng 是引擎那条唯一流，
 * 狼队行动者解析（存活狼中座位最小者）也在引擎侧完成。
 */
function buildRequest(engine: Engine): DecisionRequest {
  const req = engine.decisionRequest();
  if (!req) throw new Error('autoplay: pendingDecision 非空但 decisionRequest 返回 null（不一致）');
  return req;
}

function must(engine: Engine, action: Action): void {
  const res = engine.dispatch(action);
  if (!Array.isArray(res)) {
    throw new Error(`autoplay 动作被拒 ${JSON.stringify(action)}: ${JSON.stringify(res)}`);
  }
}
