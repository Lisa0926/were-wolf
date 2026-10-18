/**
 * 驱动循环 hook（tasks T027；contracts/engine-api.md §2 四分支的唯一 UI 落点）
 *
 * 与 `tests/helpers/autoplay.ts` **同构**（research D5：薄副本，不抽第五模块）：
 *   1. `pendingDecision` 行动者是 AI   → `engine.decisionRequest()`（rng 随请求
 *      借出）→ `deciderFor(req.view.you.role)` → `dispatch`
 *   2. `pendingDecision` 行动者是真人 → 不排定时器，把 pending 暴露给 InputPanel
 *   3. `pendingDecision === null`（dawn / exile 等无人工确认的阶段）→ 自动 confirm
 *   4. `phase === 'game_over'`        → 终态，停止推进
 *
 * 节奏（规则 §6）：engine 恒同步、可测可复现；"纯 AI 阶段的可读延时"只在 UI 层，
 * 用 `setTimeout` 300–800ms 实现。延时值由步数**确定性推导**——UI 层不生成随机数，
 * 随机性只有一个来源：引擎注入的 seeded rng。
 *
 * React StrictMode 安全（dev 下 effect 会 setup → cleanup → setup 跑两遍）：
 * - 所有推进动作都包在 `setTimeout` 里，effect 清理函数 `clearTimeout`，
 *   第一次挂载的定时器在 cleanup 时被取消，只有第二次那一个会真正执行；
 * - 再加一道「决策指纹」校验（`pendingKey`）：即使某个决策被调度两次，
 *   第二次执行时指纹已变，直接返回，绝不重复 dispatch；
 * - 真人分支不排任何异步任务，不存在双发。
 *
 * 会话（engine 实例）只在 `start()` 里创建一次（事件处理器，不在 render 里），
 * 因此 StrictMode 的双渲染不会造出两个引擎实例。刷新即重开：无任何持久化。
 */
import { useCallback, useEffect, useState } from 'react';
import { deciderFor } from '../ai/decider';
import { createGame, type Engine } from '../engine/engine';
import type { GameEvent, GameRecord } from '../engine/events';
import type { Action, PendingDecision, Phase, Role } from '../engine/types';
import type { VisibleView } from '../engine/view';

/** 纯 AI 阶段的可读延时下界（规则 §6：带可读延时，不改引擎节奏） */
const AI_DELAY_MIN = 300;
/** 纯 AI 阶段的可读延时上界 */
const AI_DELAY_MAX = 800;
/** 自动 confirm（dawn / exile）：无人工交互，但仍留一帧延时让日志读得过来 */
const CONFIRM_DELAY = 400;

/** 一局的会话：引擎实例 + 真人座位（发牌随机决定，FR-001） */
export interface GameSession {
  engine: Engine;
  humanSeat: number;
  humanRole: Role;
}

/** `useGame()` 对外形状（App / GameLog / InputPanel 的全部输入） */
export interface GameApi {
  session: GameSession | null;
  /** 真人座位的可见信息视图（`viewFor(humanSeat)`，data-model §6） */
  view: VisibleView | null;
  /** 真人座位的可见事件投影流（`eventsFor(humanSeat)`，硬约束 4） */
  events: GameEvent[];
  /** 仅当「轮到真人」时非空；其余时刻（AI 行动 / 结算 / 终局）为 null */
  pending: PendingDecision | null;
  phase: Phase;
  round: number;
  gameOver: boolean;
  /** 真人已出局：观战态（FR-007） */
  spectator: boolean;
  /** 引擎拒绝动作时的提示（正常玩法不应出现） */
  error: string | null;
  start: (seed: string) => void;
  restart: () => void;
  submit: (action: Action) => void;
  exportRecord: () => GameRecord | null;
}

export function useGame(): GameApi {
  const [session, setSession] = useState<GameSession | null>(null);
  /** 每次 dispatch 成功后 +1，作为 effect 的重跑信号（引擎是可变对象，需外部触发重渲染） */
  const [tick, setTick] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** 开局：创建引擎 + 发牌 + 找到真人座位（发牌随机决定，不作为参数传入） */
  const start = useCallback((seed: string) => {
    const engine = createGame(seed);
    const res = engine.dispatch({ type: 'startGame', seed });
    if (!Array.isArray(res)) {
      setError(`开局失败：${res.error.code} · ${res.error.message}`);
      return;
    }
    const human = engine.state.players.find((p) => p.isHuman);
    if (!human) {
      setError('开局失败：发牌结果里没有真人座位（引擎缺陷）');
      return;
    }
    setError(null);
    setSession({ engine, humanSeat: human.seat, humanRole: human.role });
    setTick((t) => t + 1);
  }, []);

  const restart = useCallback(() => {
    setError(null);
    setSession(null);
  }, []);

  /**
   * 提交动作（真人面板 / 驱动循环共用）。非法动作不改变游戏状态，
   * 只把引擎的错误码显示出来（正常玩法里不该出现）。
   */
  const submit = useCallback(
    (action: Action) => {
      if (!session) return;
      const res = session.engine.dispatch(action);
      if (!Array.isArray(res)) {
        setError(`引擎拒绝了动作「${action.type}」：${res.error.code} · ${res.error.message}`);
        return;
      }
      setError(null);
      setTick((t) => t + 1);
    },
    [session],
  );

  /** 导出整局事件流（含隐藏事实，FR-009）；无会话时返回 null */
  const exportRecord = useCallback(
    (): GameRecord | null => (session ? session.engine.exportGame() : null),
    [session],
  );

  // ——————————————— 驱动循环本体（分支 1/2/3/4） ———————————————
  useEffect(() => {
    if (!session) return;
    const { engine } = session;
    const { phase } = engine.state;

    // 分支 4：终局 → 停止推进（引擎自己也会拒绝终局后的任何动作）
    if (phase === 'game_over' || phase === 'idle') return;

    const pending = engine.pendingDecision;

    // 分支 3：dawn / exile（pendingDecision === null）→ 自动 confirm
    if (!pending) {
      const key = pendingKey(engine);
      const timer = window.setTimeout(() => {
        if (pendingKey(engine) !== key) return; // 已被推进过（StrictMode 双调度竞争）
        submit({ type: 'confirm' });
      }, CONFIRM_DELAY);
      return () => window.clearTimeout(timer);
    }

    // 分支 2：轮到真人 → 不排定时器，等 InputPanel 的 submit
    if (isHumanDecision(pending, session)) return;

    // 分支 1：AI 行动者 → decisionRequest()（rng 随请求借出）→ deciderFor → dispatch
    const key = pendingKey(engine);
    const timer = window.setTimeout(() => {
      if (pendingKey(engine) !== key) return; // 同上：绝不重复 dispatch
      const req = engine.decisionRequest();
      if (!req) return; // 结构上不可达：pendingDecision 非空 ⇒ decisionRequest 非空
      submit(deciderFor(req.view.you.role)(req));
    }, readableDelay(tick));
    return () => window.clearTimeout(timer);
  }, [session, tick, submit]);

  const rawPending = session ? session.engine.pendingDecision : null;
  const phase: Phase = session ? session.engine.state.phase : 'idle';
  const round = session ? session.engine.state.round : 0;
  const gameOver = phase === 'game_over';
  const view = session ? session.engine.viewFor(session.humanSeat) : null;
  const events = session ? session.engine.eventsFor(session.humanSeat) : [];
  const pending =
    session && rawPending && !gameOver && isHumanDecision(rawPending, session) ? rawPending : null;

  return {
    session,
    view,
    events,
    pending,
    phase,
    round,
    gameOver,
    spectator: view !== null && !view.you.alive && !gameOver,
    error,
    start,
    restart,
    submit,
    exportRecord,
  };
}

/**
 * 该待决策是否轮到真人。
 *
 * 狼刀的行动者是 `'wolf-team'`（狼队一个声音，research D6）：真人**存活且是狼**
 * 时由真人拍板；否则（真人不是狼，或真人已经出局）交给 AI 继续推进。
 * 其余 kind 的行动者是具体座位，等于真人座位即轮到真人。
 */
function isHumanDecision(pending: PendingDecision, session: GameSession): boolean {
  const me = session.engine.state.players.find((p) => p.seat === session.humanSeat);
  if (!me || !me.alive) return false; // 死者无操作权（FR-007）
  if (pending.actor === 'wolf-team') return me.role === 'werewolf';
  return pending.actor === session.humanSeat;
}

/**
 * 决策指纹：阶段 + 轮次 + 待决策（kind:actor）+ 发言游标 + 已收票。
 *
 * 用于在 setTimeout 回调里确认「这个定时器调的决策还没被别人推进过」——
 * StrictMode 双调度、以及真人抢在 AI 定时器前操作（理论上不会发生）都靠它兜底。
 */
function pendingKey(engine: Engine): string {
  const state = engine.state;
  const pending = engine.pendingDecision;
  return [
    state.phase,
    state.round,
    pending === null ? '-' : `${pending.kind}:${String(pending.actor)}`,
    state.speech.cursor,
    JSON.stringify(state.votes),
  ].join('|');
}

/** 可读延时：300–800ms，由步数确定性推导（不用随机数） */
function readableDelay(step: number): number {
  const span = AI_DELAY_MAX - AI_DELAY_MIN + 1;
  return AI_DELAY_MIN + ((step * 137) % span);
}
