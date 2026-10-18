/**
 * 阶段驱动输入面板（tasks T029；规则 §6「输入」）
 *
 * 面板只由「阶段 + pendingDecision」驱动：**按钮式点选，不解析自由文本指令**
 * （规则 §6 明文）。合法目标一律取引擎给好的 `pending.legalTargets`——
 * 狼队友不会出现在狼刀选项里、查验不含自己、投票含自己（弃票另设按钮），
 * 这些都是引擎算好的口径，UI 不做二次筛选（避免把引擎缺陷藏起来）。
 *
 * 三种形态：
 * - 轮到真人（pending 非空）→ 按 kind 渲染狼刀 / 查验 / 发言 / 投票
 * - 真人已出局（观战）→ 明确提示「你已出局，观战中」，不渲染任何按钮（FR-007）
 * - 纯 AI 阶段 / 结算阶段（pending 为空）→ 只显示当前阶段与等待提示
 */
import { useState } from 'react';
import type { Action, PendingDecision, Phase } from '../engine/types';
import type { VisibleView } from '../engine/view';

interface InputPanelProps {
  view: VisibleView;
  /** 仅当轮到真人时非空（useGame 已过滤） */
  pending: PendingDecision | null;
  onAction: (action: Action) => void;
}

const PHASE_LABEL: Record<Phase, string> = {
  idle: '准备中',
  night_wolf: '天黑 · 狼人行动',
  night_seer: '天黑 · 预言家查验',
  dawn: '天亮 · 公布死讯',
  day_speak: '白天 · 依次发言',
  vote: '白天 · 投票',
  exile: '放逐结算',
  game_over: '终局',
};

/** 身份称呼 */
const ROLE_LABEL: Record<VisibleView['you']['role'], string> = {
  werewolf: '狼人',
  seer: '预言家',
  villager: '村民',
};

function seatName(seat: number, humanSeat: number): string {
  return seat === humanSeat ? `${seat} 号（你）` : `${seat} 号`;
}

export function InputPanel({ view, pending, onAction }: InputPanelProps) {
  const me = view.you;
  const [text, setText] = useState('');

  // 观战：真人已出局 —— 面板禁用/隐藏，给出明确提示（FR-007）
  if (!me.alive) {
    return (
      <section className="panel panel--spectator">
        <h2>你已出局，观战中</h2>
        <p>
          你是 {me.seat} 号 · {ROLE_LABEL[me.role]}，已死亡。你没有操作权，
          但公开事件会继续进入左侧日志——AI 会把这一局打完直到终局。
        </p>
      </section>
    );
  }

  // 非真人回合：AI 思考 / 结算推进中
  if (!pending) {
    return (
      <section className="panel panel--waiting">
        <h2>等待中</h2>
        <p className="phase-now">
          当前阶段：{PHASE_LABEL[view.phase]}（第 {view.round} {view.phase.startsWith('night') ? '夜' : '天'}）
        </p>
        <p className="hint">
          {view.phase === 'dawn' || view.phase === 'exile'
            ? '结算阶段无需你确认，会自动推进。'
            : 'AI 玩家正在行动，日志会自动滚动。'}
        </p>
      </section>
    );
  }

  const targets = pending.legalTargets;

  return (
    <section className="panel panel--input">
      <h2>轮到你行动</h2>
      <p className="phase-now">
        {PHASE_LABEL[view.phase]} · 第 {view.round} {view.phase.startsWith('night') ? '夜' : '天'}
        <span className="you-tag">
          你是 {me.seat} 号 · {ROLE_LABEL[me.role]}
        </span>
      </p>

      {pending.kind === 'wolf-kill' && (
        <>
          <p className="prompt">选择今晚的刀口（狼队友不会出现在选项里）：</p>
          <div className="target-grid">
            {targets.map((seat) => (
              <button
                key={seat}
                type="button"
                className="target-btn"
                onClick={() => onAction({ type: 'wolfKill', target: seat })}
              >
                {seatName(seat, me.seat)}
              </button>
            ))}
          </div>
        </>
      )}

      {pending.kind === 'seer-check' && (
        <>
          <p className="prompt">选择今晚要查验的人（不能选自己）：</p>
          <div className="target-grid">
            {targets.map((seat) => (
              <button
                key={seat}
                type="button"
                className="target-btn"
                onClick={() => onAction({ type: 'seerCheck', target: seat })}
              >
                {seatName(seat, me.seat)}
              </button>
            ))}
          </div>
        </>
      )}

      {pending.kind === 'speech' && (
        <>
          <p className="prompt">轮到你发言。也可以直接跳过。</p>
          <textarea
            className="speech-box"
            rows={3}
            placeholder="说点什么……（不解析指令，随便说）"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="action-row">
            <button
              type="button"
              className="primary-btn"
              onClick={() => onAction({ type: 'speak', text, actor: me.seat })}
            >
              发言
            </button>
            <button type="button" className="ghost-btn" onClick={() => onAction({ type: 'skip', actor: me.seat })}>
              跳过发言
            </button>
          </div>
        </>
      )}

      {pending.kind === 'vote' && (
        <>
          <p className="prompt">选择放逐对象（可以投自己），或弃票：</p>
          <div className="target-grid">
            {targets.map((seat) => (
              <button
                key={seat}
                type="button"
                className="target-btn"
                onClick={() => onAction({ type: 'castVote', target: seat, actor: me.seat })}
              >
                {seatName(seat, me.seat)}
              </button>
            ))}
          </div>
          <div className="action-row">
            <button type="button" className="ghost-btn" onClick={() => onAction({ type: 'abstain', actor: me.seat })}>
              弃票
            </button>
          </div>
        </>
      )}
    </section>
  );
}
