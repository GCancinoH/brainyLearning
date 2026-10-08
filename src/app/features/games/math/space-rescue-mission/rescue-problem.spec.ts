import { describe, it, expect } from 'vitest';
import { buildRescueProblem, starsFor } from './rescue-problem';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('buildRescueProblem', () => {
  it('need = have + boxSize * boxes y el plan correcto llena exactamente la petición', () => {
    const rng = mulberry32(5);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 300; i++) {
        const p = buildRescueProblem(level, rng);
        expect(p.need).toBe(p.have + p.boxSize * p.boxes);
        expect(starsFor(p.have, p.boxSize, p.boxes)).toBe(p.need);
      }
    }
  });

  it('las opciones son 3, distintas, positivas e incluyen la correcta; los planes malos no llenan', () => {
    const rng = mulberry32(9);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 300; i++) {
        const p = buildRescueProblem(level, rng);
        expect(p.planOptions).toHaveLength(3);
        expect(new Set(p.planOptions).size).toBe(3);
        expect(p.planOptions.every(o => o >= 1)).toBe(true);
        expect(p.planOptions).toContain(p.boxes);
        const wrong = p.planOptions.filter(o => o !== p.boxes);
        expect(wrong.every(o => starsFor(p.have, p.boxSize, o) !== p.need)).toBe(true);
      }
    }
  });

  it('el almacén siempre tiene cajas de sobra (pero no más de 8)', () => {
    const rng = mulberry32(3);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 200; i++) {
        const p = buildRescueProblem(level, rng);
        expect(p.pool).toBeGreaterThanOrEqual(Math.min(p.boxes + 1, 8));
        expect(p.pool).toBeLessThanOrEqual(8);
      }
    }
  });

  it('"ya tiene estrellas" solo aparece desde el nivel 9', () => {
    const rng = mulberry32(21);
    for (let i = 0; i < 400; i++) {
      for (let level = 1; level <= 8; level++) {
        expect(buildRescueProblem(level, rng).have).toBe(0);
      }
    }
    const seen = Array.from({ length: 300 }, () => buildRescueProblem(10, rng).have);
    expect(seen.some(v => v > 0)).toBe(true);
    expect(seen.some(v => v === 0)).toBe(true);
  });

  it('la petición crece con el nivel', () => {
    const avg = (lvl: number) => {
      const rng = mulberry32(lvl);
      return Array.from({ length: 300 }, () => buildRescueProblem(lvl, rng).need)
        .reduce((a, b) => a + b, 0) / 300;
    };
    expect(avg(1)).toBeLessThan(avg(5));
    expect(avg(5)).toBeLessThan(avg(10));
  });
});
