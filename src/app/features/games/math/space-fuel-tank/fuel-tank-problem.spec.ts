import { describe, it, expect } from 'vitest';
import { buildFuelProblem, distinctSolutions } from './fuel-tank-problem';

// RNG determinista para que las pruebas no sean aleatorias
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('distinctSolutions', () => {
  it('cuenta combinaciones por valores, sin repetir permutaciones ni bloques gemelos', () => {
    expect(distinctSolutions([2, 3, 3, 4, 6], 6).sort()).toEqual(['2+4', '3+3', '6']);
  });

  it('devuelve vacío si no hay forma de llenar', () => {
    expect(distinctSolutions([4, 4, 4], 5)).toEqual([]);
  });
});

describe('buildFuelProblem', () => {
  for (const age of [4, 6]) {
    it(`edad ${age}: todos los niveles son resolubles con las formas pedidas`, () => {
      const rng = mulberry32(age * 1000 + 7);
      for (let level = 1; level <= 10; level++) {
        for (let i = 0; i < 200; i++) {
          const p = buildFuelProblem(level, age, rng);
          const cap = p.goal - p.preFilled;

          expect(p.ways).toBeGreaterThanOrEqual(1);
          expect(p.values.length).toBeGreaterThanOrEqual(4);
          expect(p.values.length).toBeLessThanOrEqual(age <= 4 ? 5 : 7);
          // ningún bloque llena el tanque solo ni se pasa
          expect(p.values.every(v => v >= 1 && v <= cap - 1)).toBe(true);
          expect(distinctSolutions(p.values, cap).length).toBeGreaterThanOrEqual(p.ways);
        }
      }
    });
  }

  it('el modo faltante solo aparece con 6 años desde el nivel 4', () => {
    const rng = mulberry32(42);
    for (let i = 0; i < 300; i++) {
      expect(buildFuelProblem(10, 4, rng).preFilled).toBe(0);
      expect(buildFuelProblem(3, 6, rng).preFilled).toBe(0);
    }
    const seen = Array.from({ length: 300 }, () => buildFuelProblem(6, 6, rng).preFilled);
    expect(seen.some(v => v > 0)).toBe(true);
    expect(seen.some(v => v === 0)).toBe(true);
  });

  it('la meta crece con el nivel', () => {
    const rng = mulberry32(1);
    expect(buildFuelProblem(1, 4, rng).goal).toBeLessThan(buildFuelProblem(10, 4, rng).goal);
    expect(buildFuelProblem(1, 6, rng).goal).toBeLessThan(buildFuelProblem(10, 6, rng).goal);
  });
});
