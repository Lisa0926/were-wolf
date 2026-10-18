/**
 * Engine 门面（contracts/engine-api.md §1–§2）
 *
 * 持有 GameState + 唯一 Rng 实例（research D3）+ 完整事件日志（含隐藏事实，D4）。
 * 非法动作返回 Err<EngineError>，状态不变、不产生事件。
 */
import { createRng, type Rng } from '../rng/rng';
import { exportGame as buildGameRecord, type GameEvent, type GameRecord } from './events';
import { derivePending, transition, type TransitionCtx } from './transition';
import type { Action, EngineError, Err, GameState, PendingDecision } from './types';
import { eventsFor, viewFor, type DecisionRequest, type VisibleView } from './view';

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

  /** 某座位的可见信息视图（人类渲染与 AI 决策共用，data-model §6） */
  viewFor(seat: number): VisibleView {
    return viewFor(this._state, this._log, seat);
  }

  /**
   * 当前待决策的请求（contracts/engine-api.md §2，research D3「单流借出」的落点，T034）
   *
   * - 无待决策（idle / dawn / exile / game_over）→ null；
   * - 行动者解析：`pendingDecision.actor` 是座位就用它；是 `'wolf-team'` 则取
   *   **存活狼中座位最小者**（确定性选择，与 research D6「狼队一个声音」一致）；
   * - `rng` 是 `startGame` 时创建的**唯一**随机流：本方法既不推进它、也不派生
   *   新流，decider 在本次决策内消费它（消费顺序 = 状态机动作顺序 ⇒ 同 seed 同局）。
   */
  decisionRequest(): DecisionRequest | null {
    const pending = this.pendingDecision;
    if (!pending) return null;
    const seat =
      pending.actor === 'wolf-team'
        ? this.state.players
            .filter((p) => p.alive && p.role === 'werewolf')
            .map((p) => p.seat)
            .sort((a, b) => a - b)[0]
        : pending.actor;
    if (seat === undefined) {
      // 结构上不可达：存在 wolf-team 待决策 ⇒ 必至少有一只存活狼
      throw new Error('decisionRequest: wolf-team 待决策但没有存活狼（结构上不可达）');
    }
    return {
      kind: pending.kind,
      view: this.viewFor(seat),
      legalTargets: [...pending.legalTargets],
      rng: this.rng,
    };
  }

  /** 某座位可见的事件投影流（UI 日志渲染数据源，硬约束 4） */
  eventsFor(seat: number): GameEvent[] {
    return eventsFor(this._state, this._log, seat);
  }

  /** 序列化导出（格式见 contracts/event-stream.md §3，FR-009） */
  exportGame(): GameRecord {
    return buildGameRecord(this._state.seed, this._log);
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
