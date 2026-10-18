/**
 * Engine 门面（contracts/engine-api.md §1–§2）
 *
 * 持有 GameState + 唯一 Rng 实例（research D3）+ 完整事件日志（含隐藏事实，D4）。
 * 非法动作返回 Err<EngineError>，状态不变、不产生事件。
 */
import { createRng, type Rng } from '../rng/rng';
import type { GameEvent } from './events';
import { derivePending, transition, type TransitionCtx } from './transition';
import type { Action, EngineError, Err, GameState, PendingDecision } from './types';

/** 从 idle 开始一局；seed 为 string（空串合法）。真人座位由发牌随机决定。 */
export function createGame(seed: string): Engine {
  return new Engine(seed);
}

export class Engine {
  private _state: GameState;
  private readonly rng: Rng;
  private readonly _log: GameEvent[] = [];

  constructor(seed: string) {
    this._state = freezeState(initialState(seed));
    this.rng = createRng(seed);
  }

  /** 只读快照（浅冻结），UI/测试不得直接改 */
  get state(): GameState {
    return this._state;
  }

  /** 当前等待谁的什么动作；game_over 或 idle 时为 null */
  get pendingDecision(): PendingDecision | null {
    return derivePending(this._state);
  }

  /** 完整事件日志（含隐藏事实），终局复盘/导出用 */
  get eventLog(): readonly GameEvent[] {
    return this._log;
  }

  dispatch(action: Action): GameEvent[] | Err<EngineError> {
    const ctx: TransitionCtx = { rng: this.rng, seq: this._log.length + 1 };
    const res = transition(this._state, action, ctx);
    if (!res.ok) return { error: res.error };
    this._state = freezeState(res.state);
    this._log.push(...res.events);
    return res.events;
  }
}

function initialState(seed: string): GameState {
  return {
    phase: 'idle',
    round: 0,
    players: [],
    seed,
    speech: { day: 0, order: [], cursor: 0 },
    votes: {},
  };
}

/** 浅冻结：state 对象、players 数组与各 player、speech、votes */
function freezeState(state: GameState): GameState {
  for (const p of state.players) Object.freeze(p);
  Object.freeze(state.players);
  Object.freeze(state.speech);
  Object.freeze(state.votes);
  return Object.freeze(state);
}
