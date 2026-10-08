import { describe, it, expect } from 'vitest';
import { ProblemPicker, pairsOf, unordered, ordered } from './problem-picker';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('ProblemPicker', () => {
  const pool = pairsOf([1, 5], [1, 5]);   // 25 sumas -> 15 familias sin orden

  it('nunca repite la misma familia dos veces seguidas (3+1 y 1+3 cuentan igual)', () => {
    const rng = mulberry32(1);
    const picker = new ProblemPicker();
    let prev = '';
    for (let i = 0; i < 2000; i++) {
      const p = picker.next('add-1', pool, unordered, rng);
      expect(unordered(p)).not.toBe(prev);
      prev = unordered(p);
    }
  });

  it('no repite ninguna de las últimas 5 familias', () => {
    const rng = mulberry32(2);
    const picker = new ProblemPicker(5);
    const seen: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const k = unordered(picker.next('add-1', pool, unordered, rng));
      expect(seen.slice(-5)).not.toContain(k);
      seen.push(k);
    }
  });

  it('recorre todas las familias antes de repetir (rondas completas)', () => {
    const rng = mulberry32(3);
    const picker = new ProblemPicker();
    const families = new Set(pool.map(unordered)).size;   // 15
    const firstRound = Array.from({ length: families }, () => unordered(picker.next('add-1', pool, unordered, rng)));
    expect(new Set(firstRound).size).toBe(families);
  });

  it('todas las familias aparecen con frecuencia pareja', () => {
    const rng = mulberry32(4);
    const picker = new ProblemPicker();
    const count = new Map<string, number>();
    const N = 1500;
    for (let i = 0; i < N; i++) {
      const k = unordered(picker.next('add-1', pool, unordered, rng));
      count.set(k, (count.get(k) ?? 0) + 1);
    }
    const avg = N / count.size;
    for (const c of count.values()) {
      expect(c).toBeGreaterThan(avg * 0.8);
      expect(c).toBeLessThan(avg * 1.2);
    }
  });

  it('también ordena variantes al azar dentro de la familia (3+1 o 1+3)', () => {
    const rng = mulberry32(5);
    const picker = new ProblemPicker();
    const orders = new Set<string>();
    for (let i = 0; i < 400; i++) {
      const p = picker.next('add-1', pool, unordered, rng);
      if (unordered(p) === '1,3') orders.add(ordered(p));
    }
    expect(orders.size).toBe(2);
  });

  it('funciona con rangos pequeños y de una sola familia', () => {
    const rng = mulberry32(6);
    const picker = new ProblemPicker();
    const one = [[2, 2] as [number, number]];
    for (let i = 0; i < 10; i++) expect(picker.next('x', one, ordered, rng)).toEqual([2, 2]);

    const two = [[1, 1], [2, 2]] as Array<[number, number]>;
    let prev = '';
    for (let i = 0; i < 50; i++) {
      const k = ordered(picker.next('y', two, ordered, rng));
      expect(k).not.toBe(prev);
      prev = k;
    }
  });

  it('al cambiar de rango no repite justo la última familia', () => {
    const rng = mulberry32(7);
    const picker = new ProblemPicker();
    for (let i = 0; i < 30; i++) {
      const last = unordered(picker.next('a', pool, unordered, rng));
      const first = unordered(picker.next('b', pool, unordered, rng));
      expect(first).not.toBe(last);
    }
  });
});

describe('antes vs ahora (nivel 1 de sumas, 1..4 + 1..4)', () => {
  const pool4 = pairsOf([1, 4], [1, 4]);

  function stats(next: () => [number, number], n = 15) {
    let repeats = 0, closeRepeats = 0;
    const seen: string[] = [];
    for (let i = 0; i < n; i++) {
      const k = unordered(next());
      if (seen[seen.length - 1] === k) repeats++;
      if (seen.slice(-3).includes(k)) closeRepeats++;
      seen.push(k);
    }
    return { repeats, closeRepeats };
  }

  it('el azar puro repite bastante; el selector no', () => {
    let oldClose = 0, newClose = 0, oldRep = 0, newRep = 0;
    for (let s = 0; s < 200; s++) {
      const rng = mulberry32(100 + s);
      const o = stats(() => [Math.floor(rng() * 4) + 1, Math.floor(rng() * 4) + 1]);
      const picker = new ProblemPicker();
      const nn = stats(() => picker.next('l1', pool4, unordered, rng));
      oldClose += o.closeRepeats; newClose += nn.closeRepeats;
      oldRep += o.repeats; newRep += nn.repeats;
    }
    console.log(`15 sumas: repetidas seguidas -> antes ${(oldRep / 200).toFixed(2)}, ahora ${(newRep / 200).toFixed(2)}; ` +
      `repetidas en las últimas 3 -> antes ${(oldClose / 200).toFixed(2)}, ahora ${(newClose / 200).toFixed(2)}`);
    expect(newRep).toBe(0);
    expect(newClose).toBeLessThan(oldClose / 4);
  });
});
