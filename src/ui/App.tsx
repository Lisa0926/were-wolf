/**
 * 页面骨架（tasks T030；quickstart 场景 0 / 场景 4）
 *
 * - 开局：种子输入框 + 「开始」按钮；种子可留空（空串是合法 seed，规则同 rng）
 * - 对局：顶部显示「你是 N 号座位 · 身份」，存活玩家表（死者翻牌），
 *   左侧日志流（数据源 = eventsFor 投影），右侧阶段驱动输入面板
 * - 终局：胜负阵营 + 全员身份表（含真人）+ 「导出事件流」（Blob 下载 .json）
 * - 刷新即重开：无后端、无持久化（AGENTS.md 定位）
 *
 * 身份表与胜负都取自事件流（`victory` / `game_over` 事件的载荷），
 * 不从引擎内部状态另开通道（硬约束 4）。
 */
import { useState } from 'react';
import type { GameEvent } from '../engine/events';
import type { Phase } from '../engine/types';
import { GameLog } from './GameLog';
import { InputPanel } from './InputPanel';
import { useGame } from './useGame';

/** 身份中文名 */
const ROLE_NAME: Record<'werewolf' | 'seer' | 'villager', string> = {
  werewolf: '狼人',
  seer: '预言家',
  villager: '村民',
};

/**
 * 三身份种子：由引擎真实推算并逐局跑过（脚本一次性执行后已删除）。
 * 同一个种子重开一局，发牌与 AI 行为完全一致，因此身份是稳定的。
 */
const ROLE_SEEDS: Array<{ seed: string; seat: number; role: 'werewolf' | 'seer' | 'villager' }> = [
  { seed: 'demo-7', seat: 5, role: 'werewolf' },
  { seed: 'demo-8', seat: 2, role: 'seer' },
  { seed: 'demo-1', seat: 6, role: 'villager' },
];

/** 阶段 → 中文标题（带上第几夜/天） */
function phaseText(phase: Phase, round: number): string {
  switch (phase) {
    case 'idle':
      return '未开局';
    case 'night_wolf':
      return `第 ${round} 夜 · 狼人行动`;
    case 'night_seer':
      return `第 ${round} 夜 · 预言家查验`;
    case 'dawn':
      return `第 ${round} 天 · 天亮`;
    case 'day_speak':
      return `第 ${round} 天 · 发言`;
    case 'vote':
      return `第 ${round} 天 · 投票`;
    case 'exile':
      return `第 ${round} 天 · 放逐结算`;
    case 'game_over':
      return '终局';
  }
}

export function App() {
  const game = useGame();
  const [seedInput, setSeedInput] = useState('');
  const [exportNote, setExportNote] = useState<string | null>(null);

  const handleRestart = (): void => {
    setExportNote(null);
    game.restart();
  };

  const handleStart = (): void => {
    setExportNote(null);
    game.start(seedInput);
  };

  const handleExport = (): void => {
    const record = game.exportRecord();
    if (!record) return;
    const json = JSON.stringify(record, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const safeSeed = record.seed.replace(/[^\w.-]+/g, '_') || 'empty-seed';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `werewolf-${safeSeed}-${stamp}.json`;
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setExportNote(`已导出 ${filename}（${record.events.length} 条事件）`);
  };

  // —— 开局页（种子输入 + 开始） ——
  if (!game.session || !game.view) {
    return (
      <div className="app">
        <header className="hero">
          <h1>狼人杀 · S0 单机试玩</h1>
          <p className="hero-sub">1 名真人 + 5 名 AI · 纯文本界面 · 一局定胜负</p>
        </header>
        <main className="start-card panel">
          <h2>开局</h2>
          <form
            className="start-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleStart();
            }}
          >
            <label htmlFor="seed-input">本局种子</label>
            <input
              id="seed-input"
              className="seed-input"
              type="text"
              value={seedInput}
              placeholder="留空也行（空串是合法种子），例如 demo-1"
              onChange={(e) => setSeedInput(e.target.value)}
            />
            <button type="submit" className="primary-btn">
              开始
            </button>
          </form>
          <p className="hint">
            同一个种子重开一局，发牌、AI 行为与结果完全一致（§8 第 3 条）。
            格式不限，可中文。
          </p>
          <div className="seed-presets">
            <span className="hint">已验证的三身份种子（点一下填进输入框）：</span>
            {ROLE_SEEDS.map((preset) => (
              <button
                key={preset.seed}
                type="button"
                className="chip-btn"
                onClick={() => setSeedInput(preset.seed)}
              >
                {preset.seed} → {preset.seat} 号 {ROLE_NAME[preset.role]}
              </button>
            ))}
          </div>
          <p className="hint">
            玩法：夜里狼人点选刀口、预言家点选查验，白天轮流发言（可跳过）后投票
            （可弃票）。全程按钮操作，不解析打字指令。
          </p>
          <p className="hint">
            想看「出局后观战」：用 demo-3（你当预言家，但第一夜就被狼刀，直接进入观战态）。
          </p>
        </main>
        {game.error && <p className="error-bar">{game.error}</p>}
      </div>
    );
  }

  const { view, events, session } = game;
  const victory = game.events.find(
    (ev): ev is Extract<GameEvent, { type: 'victory' }> => ev.type === 'victory',
  );
  const gameOverEvent = game.events.find(
    (ev): ev is Extract<GameEvent, { type: 'game_over' }> => ev.type === 'game_over',
  );
  const myMates = (view.teammates ?? []).filter((seat) => seat !== view.you.seat);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-main">
          <h1>狼人杀 · S0</h1>
          <span className={`phase-badge phase-badge--${game.phase}`}>{phaseText(game.phase, game.round)}</span>
          <span className="you-badge">
            你是 {session.humanSeat} 号座位 · 身份：{ROLE_NAME[view.you.role]}
            {myMates.length > 0 && <span className="mate-tag">队友：{myMates.map((s) => `${s} 号`).join('、')}</span>}
          </span>
        </div>
        <button type="button" className="ghost-btn" onClick={handleRestart}>
          重新开局
        </button>
      </header>

      {game.error && <p className="error-bar">{game.error}</p>}

      <main className="layout">
        <GameLog events={events} humanSeat={session.humanSeat} />

        <aside className="side">
          <section className="panel">
            <h2>玩家状态（死者已翻牌）</h2>
            <table className="player-table">
              <thead>
                <tr>
                  <th>座位</th>
                  <th>状态</th>
                  <th>身份</th>
                </tr>
              </thead>
              <tbody>
                {view.players.map((player) => {
                  const isMate = (view.teammates ?? []).includes(player.seat) && player.seat !== view.you.seat;
                  return (
                    <tr
                      key={player.seat}
                      className={
                        player.alive ? (player.seat === view.you.seat ? 'row-me' : '') : 'row-dead'
                      }
                    >
                      <td>
                        {player.seat} 号{player.isHuman ? '（你）' : ''}
                        {isMate && <span className="mate-tag">狼队友</span>}
                      </td>
                      <td>{player.alive ? '存活' : '出局'}</td>
                      <td>{player.revealedRole ? ROLE_NAME[player.revealedRole] : '未知'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {view.seerChecks && view.seerChecks.length > 0 && (
              <>
                <h3>你的查验记录</h3>
                <ul className="check-list">
                  {view.seerChecks.map((check) => (
                    <li key={`${check.round}-${check.target}`}>
                      第 {check.round} 夜 · {check.target} 号 →{' '}
                      {check.result === 'werewolf' ? '狼人' : '好人'}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {!game.gameOver && (
            <InputPanel
              key={`${session.humanSeat}-${game.round}-${game.pending?.kind ?? 'none'}-${game.pending?.actor ?? 'none'}`}
              view={view}
              pending={game.pending}
              onAction={game.submit}
            />
          )}

          {game.gameOver && (
            <section className="panel panel--settlement">
              <h2>终局结算</h2>
              <p className="settlement-winner">
                {victory
                  ? `胜利阵营：${victory.winner === 'wolves' ? '狼人阵营' : '好人阵营'}（${
                      victory.reason === 'wolves-parity' ? '存活的狼人已达半数' : '狼人全部出局'
                    }）`
                  : '（未找到 victory 事件）'}
              </p>
              {gameOverEvent && (
                <table className="player-table">
                  <thead>
                    <tr>
                      <th>座位</th>
                      <th>身份</th>
                      <th>结局</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gameOverEvent.finalTable.map((player) => (
                      <tr key={player.seat} className={player.isHuman ? 'row-me' : ''}>
                        <td>
                          {player.seat} 号{player.isHuman ? '（你）' : ''}
                        </td>
                        <td>{ROLE_NAME[player.role]}</td>
                        <td>{player.alive ? '存活' : '出局'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button type="button" className="primary-btn" onClick={handleExport}>
                导出事件流
              </button>
              {exportNote && <p className="hint">{exportNote}</p>}
            </section>
          )}
        </aside>
      </main>
    </div>
  );
}
