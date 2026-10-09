import { describe, it, expect } from 'vitest';
import {
  buildTrailPuzzle, buildEulerPuzzle, oddNodes, hasEulerPath, eulerTrail, safeReachable,
  isConnected, edgeBetween, degrees
} from './graph-puzzle';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const adjacent = (cols: number, a: number, b: number) =>
  Math.abs((a % cols) - (b % cols)) + Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) === 1;

describe('trail (4 años)', () => {
  it('la casa siempre se alcanza por caminos seguros y hay líneas rojas', () => {
    const rng = mulberry32(1);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 300; i++) {
        const p = buildTrailPuzzle(level, rng);
        expect(p.mode).toBe('trail');
        expect(p.start % p.cols).toBe(0);                  // inicia en la columna izquierda
        expect(p.goal % p.cols).toBe(p.cols - 1);          // la casa está a la derecha
        expect(safeReachable(p.edges, p.start, p.goal)).toBe(true);
        if (level >= 2) expect(p.edges.some(e => e.kind === 'danger')).toBe(true);
      }
    }
  });

  it('solo hay puentes entre puntos vecinos, sin repetir, y ningún punto queda suelto', () => {
    const rng = mulberry32(2);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 200; i++) {
        const p = buildTrailPuzzle(level, rng);
        const keys = new Set<string>();
        for (const e of p.edges) {
          expect(adjacent(p.cols, e.a, e.b)).toBe(true);
          const k = `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`;
          expect(keys.has(k)).toBe(false);
          keys.add(k);
        }
        const ids = new Set(p.nodes.map(n => n.id));
        p.edges.forEach(e => { expect(ids.has(e.a) && ids.has(e.b)).toBe(true); });
        const deg = degrees(p.edges);
        p.nodes.forEach(n => expect((deg.get(n.id) ?? 0) > 0 || n.id === p.start || n.id === p.goal).toBe(true));
      }
    }
  });

  it('el tablero crece con el nivel', () => {
    const rng = mulberry32(3);
    expect(buildTrailPuzzle(1, rng).cols * buildTrailPuzzle(1, rng).rows).toBeLessThan(
      buildTrailPuzzle(10, rng).cols * buildTrailPuzzle(10, rng).rows);
  });
});

describe('euler (6 años)', () => {
  it('los mapas con solución tienen un recorrido que usa cada puente una sola vez', () => {
    const rng = mulberry32(4);
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 300; i++) {
        const p = buildEulerPuzzle(level, rng);
        expect(isConnected(p.edges)).toBe(true);
        if (!p.possible) continue;
        expect(hasEulerPath(p.edges)).toBe(true);
        const trail = eulerTrail(p.edges)!;
        expect(trail).not.toBeNull();
        expect(trail.length).toBe(p.edges.length + 1);
        const seen = new Set<number>();
        for (let k = 0; k + 1 < trail.length; k++) {
          const e = edgeBetween(p.edges, trail[k], trail[k + 1]);
          expect(e).toBeDefined();
          expect(seen.has(e!.id)).toBe(false);
          seen.add(e!.id);
        }
        expect(seen.size).toBe(p.edges.length);
      }
    }
  });

  it('solo hay mapas sin solución desde el nivel 8, y de verdad no la tienen', () => {
    const rng = mulberry32(5);
    let impossible = 0;
    for (let level = 1; level <= 10; level++) {
      for (let i = 0; i < 400; i++) {
        const p = buildEulerPuzzle(level, rng);
        if (!p.possible) {
          impossible++;
          expect(level).toBeGreaterThanOrEqual(8);
          expect(oddNodes(p.edges).length).toBeGreaterThanOrEqual(4);
          expect(eulerTrail(p.edges)).toBeNull();
        } else {
          expect(oddNodes(p.edges).length === 0 || oddNodes(p.edges).length === 2).toBe(true);
        }
      }
    }
    expect(impossible).toBeGreaterThan(100);
  });

  it('la cantidad de puentes crece con el nivel y las líneas no se cruzan (solo vecinos)', () => {
    const rng = mulberry32(6);
    const avg = (lvl: number) =>
      Array.from({ length: 100 }, () => buildEulerPuzzle(lvl, rng).edges.length).reduce((a, b) => a + b, 0) / 100;
    expect(avg(1)).toBeLessThan(avg(5));
    expect(avg(5)).toBeLessThan(avg(10));
    for (let level = 1; level <= 10; level++) {
      const p = buildEulerPuzzle(level, rng);
      p.edges.forEach(e => expect(adjacent(p.cols, e.a, e.b)).toBe(true));
    }
  });
});
