import { beforeAll, describe, expect, it } from 'vitest';
import { fisherYates } from '../src/rng/shuffle';

/**
 * M1 rng 模块测试（tasks T002–T004）
 *
 * 结构说明：fisherYates（shuffle.ts）静态引入，createRng（rng.ts）在独立
 * describe 内动态引入——T003 阶段仅 shuffle.ts 落地时，shuffle 断言可独立转绿，
 * createRng 组保持红；T004 后全绿。
 */

describe('fisherYates（src/rng/shuffle.ts）', () => {
  it('返回新数组（不同引用）且不修改入参', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const snapshot = [...input];
    let i = 0;
    const floats = [0.99, 0.5, 0.0, 0.3, 0.7, 0.1];
    const next = () => floats[i++ % floats.length]!;
    const out = fisherYates(input, next);
    expect(out).not.toBe(input);
    expect(input).toEqual(snapshot);
    expect(out).toHaveLength(input.length);
  });

  it('结果是原多重集的排列（含重复元素）', () => {
    const input = [1, 1, 2, 2, 3, 3, 4, 5, 6, 7, 8, 9, 10, 0, 0];
    const snapshot = [...input].sort((a, b) => a - b);
    // 线性同余产生确定性浮点流，避开 Math.random（硬约束 2 同样适用于测试）
    let s = 123456789;
    const next = () => {
      s = (Math.imul(s, 1103515245) + 12345) >>> 0;
      return s / 2 ** 32;
    };
    const out = fisherYates(input, next);
    expect([...out].sort((a, b) => a - b)).toEqual(snapshot);
  });

  it('同一浮点流序列 → 同一洗牌结果（确定性）', () => {
    const mkNext = () => {
      let i = 0;
      const floats = [0.1, 0.6, 0.35, 0.85, 0.02, 0.5];
      return () => floats[i++ % floats.length]!;
    };
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(fisherYates(input, mkNext())).toEqual(fisherYates(input, mkNext()));
  });

  it('边界：空数组与单元素数组', () => {
    expect(fisherYates([], () => 0.5)).toEqual([]);
    expect(fisherYates([7], () => 0.5)).toEqual([7]);
  });
});

describe('createRng（src/rng/rng.ts）', () => {
  let createRng: typeof import('../src/rng/rng')['createRng'];

  beforeAll(async () => {
    ({ createRng } = await import('../src/rng/rng'));
  });

  it("同 seed（'lisa'）前 100 个 next() 两次调用逐个相等", () => {
    const take100 = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 100 }, () => rng.next());
    const seqA = take100(createRng('lisa'));
    const seqB = take100(createRng('lisa'));
    expect(seqA).toEqual(seqB);
    expect(seqA).toHaveLength(100);
  });

  it('异 seed 序列不同', () => {
    const take100 = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 100 }, () => rng.next());
    const seqA = take100(createRng('lisa'));
    const seqB = take100(createRng('demo-1'));
    expect(seqA).not.toEqual(seqB);
  });

  it('空串 seed 稳定映射不抛错（FNV-1a 对空串稳定）', () => {
    const take100 = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 100 }, () => rng.next());
    const seqA = take100(createRng(''));
    const seqB = take100(createRng(''));
    expect(seqA).toEqual(seqB);
    for (const v of seqA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('Unicode seed（中文）同样稳定', () => {
    const take50 = (rng: ReturnType<typeof createRng>) =>
      Array.from({ length: 50 }, () => rng.next());
    expect(take50(createRng('狼人杀'))).toEqual(take50(createRng('狼人杀')));
    expect(take50(createRng('狼人杀'))).not.toEqual(take50(createRng('狼人杀2')));
  });

  it('next() 恒在 [0, 1)（10000 次采样）', () => {
    const rng = createRng('uniform');
    for (let i = 0; i < 10000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int(min, max) 落在 [min, max)：常规/负区间/单位区间', () => {
    const rng = createRng('int-range');
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(0, 6);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(6);
    }
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(-3, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThan(3);
    }
    for (let i = 0; i < 100; i++) {
      expect(rng.int(5, 6)).toBe(5);
    }
  });

  it('pick：空数组抛错；非空返回元素之一；同 seed 同位置结果锁定', () => {
    const rng = createRng('pick');
    expect(() => rng.pick([])).toThrow();
    const items = ['x', 'y', 'z'];
    expect(items).toContain(rng.pick(items));
    const r1 = createRng('pick');
    const r2 = createRng('pick');
    expect(r1.pick(items)).toBe(r2.pick(items));
  });

  it('shuffle：返回新数组、是原多重集的排列、同 seed 结果锁定', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const snapshot = [...input];
    const outA = createRng('sh').shuffle(input);
    const outB = createRng('sh').shuffle(input);
    expect(outA).not.toBe(input);
    expect(input).toEqual(snapshot); // 入参未被修改
    expect([...outA].sort((a, b) => a - b)).toEqual(input); // 是排列
    expect(outA).toEqual(outB); // 同 seed 锁定
  });
});
