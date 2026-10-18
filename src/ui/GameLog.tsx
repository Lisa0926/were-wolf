/**
 * 对局日志流（tasks T028；硬约束 4「UI 只消费事件流」）
 *
 * 数据源只有一个：`useGame().events` = `engine.eventsFor(humanSeat)` 的可见投影。
 * 本组件**不读引擎内部状态、不读完整日志**——观战（真人已死）时投影流继续
 * 追加公开事件，日志因此能一直滚到终局（FR-007）。
 *
 * 展示口径（规则 §6「输出」）：
 * - 阶段标题：开局 / 第 N 夜·天黑 / 第 N 天·天亮 / 发言 / 投票 / 终局
 * - 死讯：**含翻牌身份**（死亡即翻牌，规则 §4.3）
 * - 发言：原文 + 结构化 claim（预言家的公开声明）
 * - 计票：票数明细 / 弃票数 / 放逐或平票或全弃票
 * - 判定：胜利阵营 + 原因
 *
 * 阶段标题的推导：事件契约里只有 `night_started` 这一个节奏事件，
 * 「天亮 / 发言 / 投票」没有独立事件——因此按事件出现顺序在**首次出现**时
 * 补标题（同一轮同一节只补一次），标题只是排版，不引入任何新事实。
 */
import { useEffect, useRef } from 'react';
import type { GameEvent } from '../engine/events';
import type { Role } from '../engine/types';

interface GameLogProps {
  /** `engine.eventsFor(humanSeat)` 投影流（唯一数据源） */
  events: GameEvent[];
  humanSeat: number;
}

type Tone = 'night' | 'day' | 'vote' | 'end' | 'death' | 'speech' | 'system';

interface LogEntry {
  key: string;
  kind: 'header' | 'line';
  text: string;
  tone: Tone;
}

const ROLE_NAME: Record<Role, string> = {
  werewolf: '狼人',
  seer: '预言家',
  villager: '村民',
};

/** 座位称呼：真人座位带「（你）」 */
function seatName(seat: number, humanSeat: number): string {
  return seat === humanSeat ? `${seat} 号（你）` : `${seat} 号`;
}

/** 把投影流翻译成「标题 + 行」的日志条目（纯函数，无 React 依赖） */
export function buildLogEntries(events: GameEvent[], humanSeat: number): LogEntry[] {
  const out: LogEntry[] = [];
  const seenHeaders = new Set<string>();
  let n = 0;

  const line = (text: string, tone: Tone): void => {
    out.push({ key: `l${n++}`, kind: 'line', text, tone });
  };
  const header = (id: string, text: string, tone: Tone): void => {
    if (seenHeaders.has(id)) return;
    seenHeaders.add(id);
    out.push({ key: `l${n++}`, kind: 'header', text, tone });
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'game_started': {
        header('start', '开局', 'end');
        const board = ev.board;
        const count = (role: Role): number => board.filter((r) => r === role).length;
        line(
          `种子「${ev.seed}」· 板子：狼人 ${count('werewolf')} / 预言家 ${count('seer')} / 村民 ${count('villager')}`,
          'system',
        );
        break;
      }
      case 'roles_dealt':
        // 终局翻牌由下方「终局结算」身份表呈现，这里不重复铺开 6 人身份
        break;
      case 'night_started':
        header(`night-${ev.round}`, `第 ${ev.round} 夜 · 天黑`, 'night');
        break;
      case 'wolf_kill_decided':
        // 只有狼能看到这条（visibility = wolf-team）
        line(`狼队决定袭击 ${seatName(ev.target, humanSeat)}`, 'system');
        break;
      case 'seer_check_completed':
        // 只有预言家能看到这条（visibility = seer-private）
        line(
          `你查验了 ${seatName(ev.target, humanSeat)}：${ev.result === 'werewolf' ? '狼人' : '好人'}`,
          'system',
        );
        break;
      case 'player_died':
        if (ev.cause === 'night-kill') {
          header(`dawn-${ev.round}`, `第 ${ev.round} 天 · 天亮`, 'day');
          line(
            `昨夜 ${seatName(ev.seat, humanSeat)} 被狼人杀害，翻牌身份：${ROLE_NAME[ev.revealedRole]}`,
            'death',
          );
        } else {
          line(
            `${seatName(ev.seat, humanSeat)} 被投票放逐，翻牌身份：${ROLE_NAME[ev.revealedRole]}`,
            'death',
          );
        }
        break;
      case 'speech':
        header(`speak-${ev.round}`, `第 ${ev.round} 天 · 发言`, 'day');
        line(
          ev.skipped ? `${seatName(ev.seat, humanSeat)}：跳过发言` : `${seatName(ev.seat, humanSeat)}：${ev.text}`,
          'speech',
        );
        if (ev.claim) {
          line(
            `　↳ 公开声明（预言家）：查验 ${ev.claim.target} 号为${
              ev.claim.result === 'werewolf' ? '狼人（查杀）' : '好人（金水）'
            }`,
            'system',
          );
        }
        break;
      case 'vote_cast':
        header(`vote-${ev.round}`, `第 ${ev.round} 天 · 投票`, 'vote');
        line(
          ev.target === 'abstain'
            ? `${seatName(ev.voter, humanSeat)} 弃票`
            : `${seatName(ev.voter, humanSeat)} → 投给 ${ev.target} 号`,
          'vote',
        );
        break;
      case 'vote_result': {
        const parts = Object.keys(ev.tally)
          .map(Number)
          .sort((a, b) => a - b)
          .map((seat) => `${seat} 号 ${ev.tally[seat]} 票`);
        const abstain = ev.abstainCount > 0 ? `；弃票 ${ev.abstainCount} 票` : '';
        line(`计票：${parts.length > 0 ? parts.join(' / ') : '无人得票'}${abstain}`, 'vote');
        if (ev.outcome === 'exile' && ev.exiled !== null) {
          line(`→ ${ev.exiled} 号得票最多，被放逐`, 'death');
        } else if (ev.outcome === 'tie') {
          line('→ 平票，无人放逐（平安日，游戏继续）', 'system');
        } else {
          line('→ 全员弃票，无人放逐（平安日，游戏继续）', 'system');
        }
        break;
      }
      case 'victory':
        header('end', '终局', 'end');
        line(
          `胜利阵营：${ev.winner === 'wolves' ? '狼人阵营' : '好人阵营'}（${
            ev.reason === 'wolves-parity' ? '存活的狼人已达半数' : '狼人全部出局'
          }）`,
          'end',
        );
        break;
      case 'game_over':
        line('全员身份已公开 —— 见下方「终局结算」身份表', 'system');
        break;
    }
  }
  return out;
}

export function GameLog({ events, humanSeat }: GameLogProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const entries = buildLogEntries(events, humanSeat);

  // 新事件到达时滚到底部（观战态同样持续滚动）
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  return (
    <section className="panel panel--log">
      <h2>对局日志</h2>
      <div className="log-body" ref={listRef}>
        {entries.map((entry) =>
          entry.kind === 'header' ? (
            <div key={entry.key} className={`log-header log-header--${entry.tone}`}>
              {entry.text}
            </div>
          ) : (
            <div key={entry.key} className={`log-line log-line--${entry.tone}`}>
              {entry.text}
            </div>
          ),
        )}
        {entries.length === 0 && <div className="log-line log-line--system">（等待第一个事件…）</div>}
      </div>
    </section>
  );
}
