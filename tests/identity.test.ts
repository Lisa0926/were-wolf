import { describe, expect, it } from 'vitest';
import { createGame } from '../src/engine/engine';

/**
 * T1 身份分配（tasks T005–T007；FR-001；规则 §8 第 4 条）
 *
 * 口径先行（工作区交付规范）：
 * - 样本：1000 个不同 seed（`w0`…`w999`），每 seed 各发一次牌
 * - 每局断言：6 座位恰为 1–6；角色多重集恰为 BOARD（狼 2 / 预言家 1 / 村民 3）；
 *   isHuman 恰 1 个
 * - 频率口径：座位 s 拿到角色 r 的频率 = count(s 得 r 的局数) / 1000，
 *   期望 p = 该角色数量 / 6（狼 2/6≈33.3%、预言家 1/6≈16.7%、村民 3/6=50%），
 *   容差 ±5 个百分点（二项 σ≈1.05pp，±5pp ≈ 4.8σ，防 flaly）
 * - 真人口径：真人座位频率期望 1/6≈16.7%，同样 ±5pp
 */

const N = 1000;
const SEEDS = Array.from({ length: N }, (_, i) => `w${i}`);

function dealOnce(seed: string) {
  const engine = createGame(seed);
  const res = engine.dispatch({ type: 'startGame', seed });
  if (!Array.isArray(res)) throw new Error(`startGame 被拒: ${JSON.stringify(res)}`);
  return { state: engine.state, events: res };
}

describe('T1 身份分配（FR-001）', () => {
  it('1000 个 seed：每局恰为 狼2/预言家1/村民3，座位 1–6 各一次，真人恰 1 个', () => {
    for (const seed of SEEDS) {
      const { state } = dealOnce(seed);
      expect(state.players).toHaveLength(6);
      expect(state.players.map((p) => p.seat).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
      const roles = state.players.map((p) => p.role);
      expect(roles.filter((r) => r === 'werewolf')).toHaveLength(2);
      expect(roles.filter((r) => r === 'seer')).toHaveLength(1);
      expect(roles.filter((r) => r === 'villager')).toHaveLength(3);
      expect(state.players.filter((p) => p.isHuman)).toHaveLength(1);
    }
  });

  it('每座位拿到各角色的频率与期望（2/6、1/6、3/6）偏差 ≤ 5 个百分点', () => {
    // count[seat][role]
    const count: Record<number, Record<string, number>> = {};
    for (let seat = 1; seat <= 6; seat++) count[seat] = { werewolf: 0, seer: 0, villager: 0 };
    for (const seed of SEEDS) {
      const { state } = dealOnce(seed);
      for (const p of state.players) count[p.seat][p.role]++;
    }
    const expected: Record<string, number> = { werewolf: 2 / 6, seer: 1 / 6, villager: 3 / 6 };
    for (let seat = 1; seat <= 6; seat++) {
      for (const role of ['werewolf', 'seer', 'villager'] as const) {
        const freq = count[seat][role] / N;
        expect(Math.abs(freq - expected[role])).toBeLessThanOrEqual(0.05);
      }
    }
  });

  it('真人座位恰 1 个且随 seed 均匀分布（期望 1/6，±5 个百分点）', () => {
    const count: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    for (const seed of SEEDS) {
      const { state } = dealOnce(seed);
      const humans = state.players.filter((p) => p.isHuman);
      expect(humans).toHaveLength(1);
      count[humans[0]!.seat]++;
    }
    for (let seat = 1; seat <= 6; seat++) {
      expect(Math.abs(count[seat] / N - 1 / 6)).toBeLessThanOrEqual(0.05);
    }
  });

  it('发牌后进入 night_wolf（round=1），事件序列 game_started → night_started → roles_dealt', () => {
    const { state, events } = dealOnce('w0');
    expect(state.phase).toBe('night_wolf');
    expect(state.round).toBe(1);
    expect(events.map((e) => e.type)).toEqual(['game_started', 'night_started', 'roles_dealt']);
    const rolesDealt = events.find((e) => e.type === 'roles_dealt');
    expect(rolesDealt?.visibility).toBe('end');
  });

  it('同 seed 重发一致（FR-010 前置）', () => {
    const a = dealOnce('w0').state;
    const b = dealOnce('w0').state;
    expect(a.players.map((p) => `${p.seat}:${p.role}:${p.isHuman}`)).toEqual(
      b.players.map((p) => `${p.seat}:${p.role}:${p.isHuman}`),
    );
  });
});
