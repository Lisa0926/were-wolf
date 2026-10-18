import { fisherYates } from './shuffle';

/**
 * seeded RNG（research D1/D2）：mulberry32 + FNV-1a，零第三方依赖。
 * 同 seed → 输出序列永久锁定（FR-010 复现承诺的底座）。
 */

/** rng 模块公开契约（contracts/engine-api.md §4） */
export interface Rng {
  /** [0, 1) 均匀浮点；一切随机性的底层原语 */
  next(): number;
  /** 均匀整数 [minIncl, maxExcl) */
  int(minIncl: number, maxExcl: number): number;
  /** 均匀抽取一个元素（空数组抛错） */
  pick<T>(items: readonly T[]): T;
  /** Fisher–Yates 洗牌，返回新数组 */
  shuffle<T>(items: readonly T[]): T[];
}

/** FNV-1a（32 位）字符串哈希：任意字符串（含空串/Unicode）稳定映射到 uint32 */
export function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32（32 位 PRNG）：返回 [0, 1) 浮点流 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 组装：字符串 seed → FNV-1a → mulberry32 */
export function createRng(seed: string): Rng {
  const next = mulberry32(fnv1a(seed));
  return {
    next,
    int: (minIncl, maxExcl) => minIncl + Math.floor(next() * (maxExcl - minIncl)),
    pick: (items) => {
      if (items.length === 0) throw new Error('rng.pick: 空数组不可抽取');
      return items[Math.floor(next() * items.length)];
    },
    shuffle: (items) => fisherYates(items, next),
  };
}
