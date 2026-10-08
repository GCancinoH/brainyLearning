import { describe, it, expect } from 'vitest';
import { generateMultiplyProblem, getMultiplyRange } from './multiply-problem';
import { ProblemPicker } from '../../../../core/games/problem-picker';

describe('generateMultiplyProblem', () => {
  it('calcula la respuesta como grupos × elementos', () => {
    for (let level = 1; level <= 20; level++) {
      for (let i = 0; i < 50; i++) {
        const p = generateMultiplyProblem(level);
        expect(p.answer).toBe(p.groups * p.perGroup);
      }
    }
  });

  it('ofrece 3 opciones distintas, positivas y con la correcta incluida', () => {
    for (let level = 1; level <= 20; level++) {
      for (let i = 0; i < 100; i++) {
        const p = generateMultiplyProblem(level);
        expect(p.options).toHaveLength(3);
        expect(new Set(p.options).size).toBe(3);
        expect(p.options).toContain(p.answer);
        expect(p.options.every(o => o > 0)).toBe(true);
      }
    }
  });

  it('respeta el rango de cada nivel', () => {
    for (const level of [1, 3, 4, 6, 7, 10, 11, 15, 16, 20]) {
      const range = getMultiplyRange(level);
      for (let i = 0; i < 100; i++) {
        const p = generateMultiplyProblem(level);
        expect(p.groups).toBeGreaterThanOrEqual(range.groups[0]);
        expect(p.groups).toBeLessThanOrEqual(range.groups[1]);
        expect(p.perGroup).toBeGreaterThanOrEqual(range.perGroup[0]);
        expect(p.perGroup).toBeLessThanOrEqual(range.perGroup[1]);
      }
    }
  });

  it('no repite el mismo problema dos veces seguidas', () => {
    let prev = generateMultiplyProblem(1);
    for (let i = 0; i < 300; i++) {
      const next = generateMultiplyProblem(1, prev);
      expect(next.groups === prev.groups && next.perGroup === prev.perGroup).toBe(false);
      prev = next;
    }
  });
});

describe('generateMultiplyProblem con selector', () => {
  it('nunca repite familia seguida (2×3 y 3×2 cuentan igual) y ya no hay ×1', () => {
    for (const level of [1, 5, 9, 14, 18]) {
      const picker = new ProblemPicker();
      let prev = '';
      for (let i = 0; i < 300; i++) {
        const p = generateMultiplyProblem(level, null, Math.random, picker);
        const fam = [p.groups, p.perGroup].sort((a, b) => a - b).join('x');
        expect(fam).not.toBe(prev);
        expect(p.groups).toBeGreaterThanOrEqual(2);
        expect(p.perGroup).toBeGreaterThanOrEqual(2);
        prev = fam;
      }
    }
  });
});
