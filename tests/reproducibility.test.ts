/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';
import { autoplay } from './helpers/autoplay';

/**
 * T6 无头整局：复现与自锁（tasks T023–T024；FR-010/SC-003；规则 §8 第 3 条）
 *
 * 口径：
 * - 「同 seed 同一局」= `JSON.stringify(exportGame())` **逐字节全等**
 *   （事件无墙钟时间，plan §测试布局口径），同 seed 跑 100 局比对基线；
 *   空串 seed 也是合法 seed（FNV-1a 稳定哈希，research D2），一并锁。
 * - 异 seed 两局不同（否则 seed 没进流）。
 * - 自锁扫描（硬约束 2 自执行）：`src/engine` 与 `src/ai` 全部 .ts 源码
 *   不含 `Math.random` 字面；ai/ 另加一条「只能 import 可见视图/类型与
 *   ai 内部模块」的结构扫描（不 import 引擎内部状态、不 import rng 自建流）。
 *
 * 源码读取用 Vite 的 `?raw` 通配导入（本项目未装 @types/node，不为一次
 * 静态扫描引入依赖；?raw 读到的就是文件原文）。
 */

const ENGINE_SOURCES = import.meta.glob('../src/engine/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const AI_SOURCES = import.meta.glob('../src/ai/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** 一局的无头回放产物（逐字节比较用） */
function play(seed: string): string {
  return JSON.stringify(autoplay(seed).exportGame());
}

// —————————————————————— 同 seed 复现（×100） ——————————————————————

describe('T6 同 seed → 同一局（SC-003，§8 第 3 条）', () => {
  for (const seed of ['repro-fixed', '']) {
    const label = seed === '' ? '空串 seed' : `seed=${seed}`;
    it(`${label}：autoplay ×100 局 JSON.stringify(exportGame()) 逐字节全等`, () => {
      const engine = autoplay(seed);
      expect(engine.state.phase).toBe('game_over');
      expect(engine.eventLog.length).toBeGreaterThan(20);
      expect(engine.eventLog.some((e) => e.type === 'game_over')).toBe(true);

      const baseline = JSON.stringify(engine.exportGame());
      expect(baseline.length).toBeGreaterThan(500);
      for (let i = 1; i <= 100; i++) {
        expect(play(seed), `${label} 第 ${i + 1} 局与基线不一致`).toBe(baseline);
      }
    });
  }

  it('同 seed 的导出文档本身可 JSON 无损往返，且 seed 字段原样保留', () => {
    for (const seed of ['repro-fixed', '']) {
      const record = autoplay(seed).exportGame();
      expect(record.seed).toBe(seed);
      expect(JSON.parse(JSON.stringify(record))).toStrictEqual(record);
      expect(record.schemaVersion).toBe(1);
      expect(record.feature).toBe('werewolf-s0');
    }
  });
});

describe('T6 异 seed → 不同局（seed 确实进了随机流）', () => {
  it('repro-a 与 repro-b 的整局事件流不同', () => {
    expect(play('repro-a')).not.toBe(play('repro-b'));
  });

  it('同一批 seed 各自复现（异 seed 也不同）', () => {
    const seeds = ['repro-alpha', 'repro-beta', 'repro-gamma'];
    const games = seeds.map((seed) => ({ seed, text: play(seed), again: play(seed) }));
    for (const game of games) expect(game.again, game.seed).toBe(game.text);
    expect(new Set(games.map((g) => g.text)).size).toBe(seeds.length);
  });
});

// —————————————————————— 自锁扫描（硬约束 2 自执行） ——————————————————————

const RANDOM_LITERAL = /Math\s*\.\s*random/;

describe('T023 自锁扫描：engine/ 与 ai/ 源码无 Math.random 字面', () => {
  it(`src/engine 全部 .ts（${Object.keys(ENGINE_SOURCES).length} 个）无 Math.random`, () => {
    const files = Object.keys(ENGINE_SOURCES);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const [path, code] of Object.entries(ENGINE_SOURCES)) {
      expect(typeof code, `${path} 未读到源码`).toBe('string');
      expect(code, path).not.toMatch(RANDOM_LITERAL);
    }
  });

  it(`src/ai 全部 .ts（${Object.keys(AI_SOURCES).length} 个）无 Math.random`, () => {
    const files = Object.keys(AI_SOURCES);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const [path, code] of Object.entries(AI_SOURCES)) {
      expect(typeof code, `${path} 未读到源码`).toBe('string');
      expect(code, path).not.toMatch(RANDOM_LITERAL);
    }
  });

  it('ai/ 只 import 可见视图/类型（type-only）与 ai 内部模块：不碰引擎内部状态、不自建 rng', () => {
    // 行首锚定：避开注释里出现的 "import" 字样；多行 import 由 [^'"]*? 跨行覆盖
    const importsOf = (code: string) => [
      ...code.matchAll(/^\s*import\s+(type\s+)?[^'"]*?from\s+'([^']+)'/gm),
    ];
    for (const [path, code] of Object.entries(AI_SOURCES)) {
      // 零 import（如纯模板模块）是合法且最理想的状态；有 import 才逐条校验
      const imports = importsOf(code);
      for (const [, isType, target] of imports) {
        expect(target, `${path} 引用了 ai/ 之外的非引擎模块`).toMatch(/^(\.\/|\.\.\/engine\/)/);
        if (target!.startsWith('../engine/')) {
          expect(isType, `${path} 以值方式 import 引擎模块 ${target}（应只 import type）`).toBeTruthy();
          expect(
            ['../engine/view', '../engine/types'],
            `${path} import 了引擎外部不可见的模块 ${target}`,
          ).toContain(target);
        }
      }
    }
  });
});
