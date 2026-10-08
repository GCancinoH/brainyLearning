import { describe, it, expect } from 'vitest';
import {
  THEME_BUDGET_MS, THEME_REST_MS, parseGameUrl, freshEntry, refreshEntry,
  isResting, restLeftMs, tickEntry, formatClock
} from './theme-time';

describe('parseGameUrl', () => {
  it('detecta el tema y si se está jugando', () => {
    expect(parseGameUrl('/games/math/space-addition')).toEqual({ theme: 'math', playing: true });
    expect(parseGameUrl('/games/japanese/listening?x=1')).toEqual({ theme: 'japanese', playing: true });
    expect(parseGameUrl('/games/math')).toEqual({ theme: 'math', playing: false });
    expect(parseGameUrl('/games/japanese/')).toEqual({ theme: 'japanese', playing: false });
  });
  it('ignora todo lo demás', () => {
    for (const u of ['/', '/dashboard', '/stickers', '/games/chinese/x', '/games/math/a/b']) {
      expect(parseGameUrl(u)).toBeNull();
    }
  });
});

describe('presupuesto y descanso', () => {
  const t0 = 1_000_000;

  it('empieza con 10 minutos', () => {
    expect(refreshEntry(undefined, t0).remainingMs).toBe(10 * 60 * 1000);
  });

  it('descuenta y no baja de cero', () => {
    let e = freshEntry(t0);
    e = tickEntry(e, 1000, t0 + 1000);
    expect(e.remainingMs).toBe(THEME_BUDGET_MS - 1000);
    e = tickEntry(e, THEME_BUDGET_MS * 2, t0 + 2000);
    expect(e.remainingMs).toBe(0);
  });

  it('al llegar a cero el tema descansa 30 min y luego se rellena', () => {
    const e = tickEntry(freshEntry(t0), THEME_BUDGET_MS, t0 + THEME_BUDGET_MS);
    const end = t0 + THEME_BUDGET_MS;
    expect(isResting(e, end)).toBe(true);
    expect(restLeftMs(e, end)).toBe(THEME_REST_MS);
    expect(isResting(e, end + THEME_REST_MS - 1)).toBe(true);
    expect(restLeftMs(e, end + 10 * 60 * 1000)).toBe(THEME_REST_MS - 10 * 60 * 1000);
    expect(isResting(e, end + THEME_REST_MS)).toBe(false);
    expect(refreshEntry(e, end + THEME_REST_MS).remainingMs).toBe(THEME_BUDGET_MS);
  });

  it('con tiempo sobrante dentro del descanso no se rellena (continúa donde iba)', () => {
    const e = tickEntry(freshEntry(t0), 3 * 60 * 1000, t0 + 3 * 60 * 1000);
    expect(refreshEntry(e, t0 + 10 * 60 * 1000).remainingMs).toBe(7 * 60 * 1000);
    expect(isResting(e, t0 + 10 * 60 * 1000)).toBe(false);
  });

  it('si estuvo lejos más de 30 min se rellena aunque no se agotara', () => {
    const e = tickEntry(freshEntry(t0), 3 * 60 * 1000, t0 + 3 * 60 * 1000);
    expect(refreshEntry(e, t0 + 3 * 60 * 1000 + THEME_REST_MS).remainingMs).toBe(THEME_BUDGET_MS);
  });

  it('un reloj del dispositivo movido hacia atrás no deja bloqueado el tema', () => {
    const e = { remainingMs: 0, lastActiveAt: t0 + 5 * 60 * 1000 };
    expect(isResting(e, t0)).toBe(false);
    expect(refreshEntry(e, t0).remainingMs).toBe(THEME_BUDGET_MS);
  });
});

describe('formatClock', () => {
  it('formatea mm:ss contando de 10:00 a 0:00', () => {
    expect(formatClock(THEME_BUDGET_MS)).toBe('10:00');
    expect(formatClock(61_000)).toBe('1:01');
    expect(formatClock(59_001)).toBe('1:00');
    expect(formatClock(1)).toBe('0:01');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
});
