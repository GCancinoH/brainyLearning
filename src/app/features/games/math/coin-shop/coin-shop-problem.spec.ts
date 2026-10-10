import { describe, it, expect } from 'vitest';
import {
  buildCoinProblem,
  clampLevel,
  comboKey,
  expandSupply,
  MAX_LEVEL,
  scatter,
  waysFor,
} from './coin-shop-problem';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITER = 200;

/**
 * Los tests de 'pay' recalculan las formas de pago desde cero (a propósito: si se usara
 * `p.waysTotal` la aserción sería tautológica y no detectaría nada). Eso cuesta O(2^n) por
 * llamada, así que van con menos iteraciones y con un timeout holgado: si el pool de tests va
 * saturado, el test no debe caer por tiempo y dar un falso positivo.
 */
const ITER_PAY = 80;
const PAY_TIMEOUT = 30_000;

describe('expandSupply / waysFor', () => {
  it('expandSupply convierte el registro en un array plano con las repetitions', () => {
    expect(expandSupply({ 1: 4, 2: 3 }).sort((a, b) => a - b)).toEqual([1, 1, 1, 1, 2, 2, 2]);
    expect(expandSupply({})).toEqual([]);
  });

  it('respeta el límite: no usa más monedas de las que hay', () => {
    // Con un solo $5, 10 no se puede pagar aunque "sobre el papel" 5+5 cuadre
    expect(waysFor({ 5: 1 }, 10)).toEqual([]);
    expect(waysFor({ 5: 2 }, 10)).toEqual(['5+5']);
  });

  it('sin duplicados por permutación y cada forma suma el objetivo', () => {
    const supply: Record<number, number> = { 1: 4, 2: 4, 5: 2 };
    for (let target = 1; target <= 20; target++) {
      const ways = waysFor(supply, target);
      expect(new Set(ways).size, `duplicados en ${target}`).toBe(ways.length);
      for (const w of ways) {
        const sum = w.split('+').reduce((s, v) => s + Number(v), 0);
        expect(sum).toBe(target);
        const used: Record<string, number> = {};
        for (const c of w.split('+')) used[c] = (used[c] ?? 0) + 1;
        for (const [v, n] of Object.entries(used)) {
          expect(n, `usa ${n} monedas de ${v}`).toBeLessThanOrEqual(supply[Number(v)]!);
        }
      }
    }
  });

  it('objetivos no positivos no dan formas', () => {
    expect(waysFor({ 1: 4 }, 0)).toEqual([]);
    expect(waysFor({ 1: 4 }, -3)).toEqual([]);
  });
});

describe('comboKey', () => {
  it('es canónica: el orden de las monedas no importa', () => {
    expect(comboKey([1, 5, 2])).toBe('1+2+5');
    expect(comboKey([5, 1, 2])).toBe('1+2+5');
    expect(comboKey([2, 2, 1])).toBe('1+2+2');
  });
});

describe('scatter', () => {
  it('en fila: todos a la misma altura y repartidos', () => {
    const rng = mulberry32(11);
    const pts = scatter(6, true, rng);
    expect(pts.length).toBe(6);
    expect(new Set(pts.map(p => p.y)).size).toBe(1);
    expect(new Set(pts.map(p => Math.round(p.x))).size).toBe(6);
  });

  it('disperso: NADA se solapa', () => {
    const rng = mulberry32(22);
    for (let n = 1; n <= 13; n++) {
      for (let t = 0; t < 60; t++) {
        const pts = scatter(n, false, rng);
        for (let a = 0; a < pts.length; a++) {
          for (let b = a + 1; b < pts.length; b++) {
            const dx = Math.abs(pts[a]!.x - pts[b]!.x);
            const dy = Math.abs(pts[a]!.y - pts[b]!.y);
            expect(Math.max(dx, dy), `n=${n} se solapan ${JSON.stringify(pts[a])} ${JSON.stringify(pts[b])}`).toBeGreaterThan(6);
          }
        }
      }
    }
  });

  it('disperso: cabe siempre (rejilla 5x3 = 15) y queda dentro del marco', () => {
    const rng = mulberry32(33);
    for (let n = 1; n <= 13; n++) {
      const pts = scatter(n, false, rng);
      expect(pts.length).toBe(n);
      for (const p of pts) {
        expect(p.x).toBeGreaterThan(0);
        expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThan(0);
        expect(p.y).toBeLessThan(100);
      }
    }
  });

  it('en niveles altos se sale de la fila (contar de verdad, no de memoria)', () => {
    const rng = mulberry32(44);
    const spreads = Array.from({ length: 60 }, () => new Set(scatter(9, false, rng).map(p => Math.round(p.y))).size);
    expect(Math.max(...spreads)).toBeGreaterThan(1);
  });
});

describe('buildCoinProblem — 4 años (count / give)', () => {
  it('todos los niveles son coherentes', () => {
    const rng = mulberry32(4007);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p = buildCoinProblem(level, 4, rng);

        expect(['count', 'give']).toContain(p.mode);
        expect(p.items).toBeGreaterThanOrEqual(3);
        expect(p.items).toBeLessThanOrEqual(10);
        expect(p.positions.length).toBe(p.shelfCount);

        if (p.mode === 'count') {
          // el estante tiene exactamente los que hay que contar
          expect(p.shelfCount).toBe(p.items);
          expect(p.options).toContain(p.items);
          expect(p.options.length).toBe(3);
          expect(new Set(p.options).size).toBe(3);
          expect(p.options.every(o => o >= 1)).toBe(true);
          expect(p.options.every(o => Math.abs(o - p.items) <= 3)).toBe(true);
        } else {
          // en 'give' hay 3 de sobra: no basta con llevárselos todos
          expect(p.shelfCount).toBe(p.items + 3);
          expect(p.options).toEqual([]);
          expect(level, `"dame N" antes del nivel 5`).toBeGreaterThanOrEqual(5);
        }

        expect(p.item).not.toBe('');
      }
    }
  });

  it('hasta el nivel 4 va en fila, y "dame N" nunca en fila', () => {
    const rng = mulberry32(4009);
    for (let level = 1; level <= 4; level++) {
      for (let i = 0; i < 60; i++) {
        expect(buildCoinProblem(level, 4, rng).inLine).toBe(true);
      }
    }
    for (let level = 5; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 60; i++) {
        const p = buildCoinProblem(level, 4, rng);
        if (p.mode === 'give') expect(p.inLine).toBe(false);
      }
    }
  });

  it('no deja campos del modo pay sucios', () => {
    const rng = mulberry32(404);
    const p = buildCoinProblem(3, 4, rng);
    expect(p.price).toBe(0);
    expect(p.denominations).toEqual([]);
    expect(p.supply).toEqual({});
    expect(p.prePaid).toBe(0);
    expect(p.ways).toBe(0);
  });
});

describe('buildCoinProblem — 6 años (pay)', () => {
  it('INVARIANTE CENTRAL: siempre hay formas suficientes para lo que se pide', () => {
    const rng = mulberry32(6007);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER_PAY; i++) {
        const p = buildCoinProblem(level, 6, rng);
        const cap = p.price - p.prePaid;

        expect(p.mode).toBe('pay');
        expect(cap).toBeGreaterThanOrEqual(1);

        // Con stock LIMITADO esta es la invariante que puede romperse:
        // nunca pedir más formas de las que la cartera permite
        const available = waysFor(p.supply, cap).length;
        expect(available).toBeGreaterThanOrEqual(p.ways);
        expect(p.waysTotal).toBe(available);

        // La cartera debe alcanzar el precio (aunque el prePaid ya lo cubra)
        expect(waysFor(p.supply, p.price).length).toBeGreaterThanOrEqual(1);

        // el prePaid deja siempre al menos 2 monedas por poner
        if (p.prePaid > 0) expect(cap).toBeGreaterThanOrEqual(Math.ceil(p.price / 3));
      }
    }
  }, PAY_TIMEOUT);

  it('el prePaid solo a partir del nivel 7', () => {
    const rng = mulberry32(6009);
    for (let level = 1; level <= 6; level++) {
      for (let i = 0; i < ITER; i++) {
        expect(buildCoinProblem(level, 6, rng).prePaid).toBe(0);
      }
    }
    let sawMissing = false;
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        if (buildCoinProblem(level, 6, rng).prePaid > 0) sawMissing = true;
      }
    }
    expect(sawMissing).toBe(true);
  });

  it('la moneda de $10 solo en niveles altos', () => {
    const rng = mulberry32(6013);
    for (let level = 1; level <= 6; level++) {
      for (let i = 0; i < 40; i++) {
        expect(buildCoinProblem(level, 6, rng).denominations).not.toContain(10);
      }
    }
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 20; i++) {
        expect(buildCoinProblem(level, 6, rng).denominations).toContain(10);
      }
    }
  });

  it('siempre hay al menos una moneda de $1 (garantía de solución)', () => {
    const rng = mulberry32(6017);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 60; i++) {
        const p = buildCoinProblem(level, 6, rng);
        expect(p.supply[1], `nivel ${level} sin $1`).toBeGreaterThan(0);
      }
    }
  });

  it('el precio queda dentro de la banda de su nivel', () => {
    const bands: Array<[number, number, number, number]> = [
      [1, 3, 4, 6],
      [4, 6, 7, 10],
      [7, 8, 11, 15],
      [9, MAX_LEVEL, 16, 22],
    ];
    const rng = mulberry32(6029);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const band = bands.find(([f, t]) => level >= f && level <= t)!;
      for (let i = 0; i < ITER; i++) {
        const { price } = buildCoinProblem(level, 6, rng);
        expect(price).toBeGreaterThanOrEqual(band[2]);
        expect(price).toBeLessThanOrEqual(band[3]);
      }
    }
  });

  it('las formas exigidas suben con el nivel', () => {
    const rng = mulberry32(6033);
    const waysOf = (lvl: number) => {
      const seen = new Set<number>();
      for (let i = 0; i < 150; i++) seen.add(buildCoinProblem(lvl, 6, rng).ways);
      return Math.max(...seen);
    };
    expect(waysOf(1)).toBe(1);
    expect(waysOf(5)).toBe(2);
    expect(waysOf(10)).toBe(3);
  });

  it('el mensaje nombra lo ya cobrado cuando el cajero cobró una parte', () => {
    const rng = mulberry32(6031);
    let sawMissing = false;
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p = buildCoinProblem(level, 6, rng);
        if (p.prePaid > 0) {
          sawMissing = true;
          expect(p.prompt).toContain(`$${p.prePaid}`);
        } else {
          expect(p.prompt).not.toContain('ya cobró');
        }
      }
    }
    expect(sawMissing).toBe(true);
  });
});

describe('buildCoinProblem — despacho por edad', () => {
  it('4 años nunca paga, 6 años siempre paga', () => {
    const rng = mulberry32(6060);
    // umbral en 5 años: 4 y menos cuentan, 5 y más pagan
    for (const age of [3, 4]) {
      expect(['count', 'give']).toContain(buildCoinProblem(5, age, rng).mode);
    }
    for (const age of [5, 6, 8]) {
      expect(buildCoinProblem(5, age, rng).mode).toBe('pay');
    }
    // el modo concreto de 4 años puede ser count o give, nunca pay
    for (let level = 1; level <= MAX_LEVEL; level++) {
      expect(['count', 'give']).toContain(buildCoinProblem(level, 4, rng).mode);
      expect(buildCoinProblem(level, 6, rng).mode).toBe('pay');
    }
  });

  it('un nivel fuera de rango se recorta en vez de romper', () => {
    const rng = mulberry32(6061);
    for (const level of [-5, 0, 1, 10, 999]) {
      expect(() => buildCoinProblem(level, 4, rng)).not.toThrow();
      expect(() => buildCoinProblem(level, 6, rng)).not.toThrow();
      const c = buildCoinProblem(level, 4, rng);
      expect(c.positions.length).toBe(c.shelfCount);
      const p = buildCoinProblem(level, 6, rng);
      expect(waysFor(p.supply, p.price - p.prePaid).length).toBeGreaterThanOrEqual(p.ways);
    }
    expect(clampLevel(-3)).toBe(1);
    expect(clampLevel(999)).toBe(MAX_LEVEL);
  });
});