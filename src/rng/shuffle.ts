/**
 * Fisher–Yates 洗牌（降序经典版，规则 §4.4 发牌用）
 *
 * - 纯函数：返回**新数组**，绝不修改入参
 * - 随机源注入：由调用方传入 [0, 1) 浮点流（rng.next()），
 *   本模块不自行产生随机数（硬约束 2：随机只走注入流）
 */
export function fisherYates<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1)); // j ∈ [0, i]
    const tmp: T = out[i] as T;
    out[i] = out[j] as T;
    out[j] = tmp;
  }
  return out;
}
