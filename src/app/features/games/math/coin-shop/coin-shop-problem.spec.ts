import { describe, it, expect } from 'vitest';
import { buildCoinProblem, MAX_LEVEL } from './coin-shop-problem';
import { coinWays } from '../../../../core/games/combinations';

// RNG determinista para que las pruebas no sean aleatorias
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITERATIONS = 200;

describe('buildCoinProblem — 4 años (modo count)', () => {
  it('todos los niveles son resolubles y con distractores válidos', () => {
    const rng = mulberry32(4007);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        const p = buildCoinProblem(level, 4, rng);

        expect(p.mode).toBe('count');
        expect(p.items).toBeGreaterThanOrEqual(3);
        expect(p.items).toBeLessThanOrEqual(10);

        // La respuesta está siempre entre las opciones
        expect(p.options).toContain(p.items);

        // 2 opciones hasta el nivel 5, 3 después (PROFILE_GAME_CONFIGS[4])
        expect(p.options.length).toBe(level <= 5 ? 2 : 3);
        expect(new Set(p.options).size).toBe(p.options.length);
        expect(p.options.every(o => o >= 1)).toBe(true);

        // Ninguna opción se aleja más de 3 de la respuesta
        expect(p.options.every(o => Math.abs(o - p.items) <= 3)).toBe(true);
      }
    }
  });

  it('no deja campos del modo pay sucios', () => {
    const rng = mulberry32(404);
    const p = buildCoinProblem(3, 4, rng);
    expect(p.price).toBe(0);
    expect(p.denominations).toEqual([]);
    expect(p.prePaid).toBe(0);
    expect(p.ways).toBe(0);
  });
});

describe('buildCoinProblem — 6 años (modo pay)', () => {
  it('pide solo combinaciones que existen de verdad', () => {
    const rng = mulberry32(6007);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        const p = buildCoinProblem(level, 6, rng);

        expect(p.mode).toBe('pay');
        expect(p.items).toBe(0);
        expect(p.options).toEqual([]);

        const cap = p.price - p.prePaid;
        expect(cap).toBeGreaterThanOrEqual(1);
        expect(p.ways).toBeGreaterThanOrEqual(1);

        // INVARIANTE CENTRAL: siempre hay forma de pagar lo que se pide
        const available = coinWays(p.denominations, cap).length;
        expect(available).toBeGreaterThanOrEqual(p.ways);

        // El prePaid nunca se come casi todo el precio: deben quedar 2+ monedas
        expect(cap).toBeGreaterThanOrEqual(Math.ceil(p.price / 3));
        expect(p.prePaid).toBeLessThan(p.price);
      }
    }
  });

  it('el prePaid solo puede activarse a partir del nivel 7', () => {
    const rng = mulberry32(6009);
    for (let level = 1; level <= 6; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        expect(buildCoinProblem(level, 6, rng).prePaid).toBe(0);
      }
    }
    // Y en niveles altos sí aparece alguna vez (si no, el modo faltante no existiría)
    const late = new Set<number>();
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        late.add(buildCoinProblem(level, 6, rng).prePaid);
      }
    }
    expect([...late].some(v => v > 0)).toBe(true);
  });

  it('la moneda de $10 solo aparece en niveles altos', () => {
    const rng = mulberry32(6013);
    for (let level = 1; level <= 6; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        expect(buildCoinProblem(level, 6, rng).denominations).not.toContain(10);
      }
    }
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < 20; i++) {
        expect(buildCoinProblem(level, 6, rng).denominations).toContain(10);
      }
    }
  });

  it('pide una sola forma al principio y varias desde el nivel 4', () => {
    const rng = mulberry32(6019);
    for (let level = 1; level <= 3; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        expect(buildCoinProblem(level, 6, rng).ways).toBe(1);
      }
    }
    for (let level = 4; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        expect(buildCoinProblem(level, 6, rng).ways).toBe(2);
      }
    }
  });

  it('el precio se mantiene dentro de la banda de su nivel', () => {
    // Dentro de una misma banda el ProblemPicker barrea el orden (no repite el último
    // precio), así que el precio NO es monótono nivel a nivel. Lo que debe cumplirse es que
    // cada precio cae en el rango que le toca a su nivel.
    const bands: Array<[number, number, number, number]> = [
      // [nivelDesde, nivelHasta, precioMin, precioMax]
      [1, 3, 5, 7],
      [4, 6, 8, 10],
      [7, 9, 11, 13],
      [10, MAX_LEVEL, 14, 15],
    ];
    const rng = mulberry32(6029);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const band = bands.find(([from, to]) => level >= from && level <= to)!;
      for (let i = 0; i < ITERATIONS; i++) {
        const { price } = buildCoinProblem(level, 6, rng);
        expect(price).toBeGreaterThanOrEqual(band[2]);
        expect(price).toBeLessThanOrEqual(band[3]);
      }
    }
  });

  it('el mensaje nombra lo ya cobrado cuando el cajero cobró una parte', () => {
    const rng = mulberry32(6031);
    let sawMissing = false;
    for (let level = 7; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITERATIONS; i++) {
        const p = buildCoinProblem(level, 6, rng);
        if (p.prePaid > 0) {
          sawMissing = true;
          expect(p.prompt).toContain(`$${p.prePaid}`);
          expect(p.prompt).toContain(`$${p.price}`);
        } else {
          expect(p.prompt).toBe(`Paga el juguete de $${p.price}`);
        }
      }
    }
    expect(sawMissing).toBe(true);
  });
});

describe('buildCoinProblem — despacho por edad', () => {
  it('4 años cuenta, 6 años paga; 5 años paga (umbral en 5)', () => {
    const rng = mulberry32(6060);
    for (const age of [3, 4, 5, 6, 8]) {
      const mode = buildCoinProblem(5, age, rng).mode;
      expect(mode).toBe(age <= 4 ? 'count' : 'pay');
    }
  });

  it('un nivel fuera de rango se recorta en vez de romper', () => {
    const rng = mulberry32(6061);
    for (const level of [-5, 0, 1, 10, 11, 999]) {
      const p = buildCoinProblem(level, 6, rng);
      expect(p.price).toBeGreaterThan(0);
      expect(p.price).toBeLessThanOrEqual(15);

      const c = buildCoinProblem(level, 4, rng);
      expect(c.items).toBeGreaterThanOrEqual(3);
      expect(c.items).toBeLessThanOrEqual(10);
    }
  });
});