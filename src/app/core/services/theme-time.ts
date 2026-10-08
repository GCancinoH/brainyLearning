/**
 * Reloj de juego por tema: lógica pura (sin Angular) para poder probarla.
 *
 * Cada tema (matemáticas, japonés...) tiene un presupuesto de tiempo de juego.
 * Cuando se agota, el tema "descansa" un rato y el presupuesto se rellena al volver.
 * Los dos números están en un solo sitio para que sean fáciles de cambiar.
 */

export type Theme = 'math' | 'japanese';

/** Tiempo de juego por tema antes de pedir un descanso */
export const THEME_BUDGET_MS = 10 * 60 * 1000;
/** Cuánto descansa el tema (y desde cuándo, sin jugarlo, se rellena el presupuesto) */
export const THEME_REST_MS = 30 * 60 * 1000;

export interface ThemeTimeEntry {
  remainingMs: number;
  lastActiveAt: number;
}

export interface ParsedGameUrl {
  theme: Theme;
  /** true dentro de un juego; false en el menú del tema (el reloj no corre en menús) */
  playing: boolean;
}

/** '/games/math/space-addition?x=1' -> { theme: 'math', playing: true } */
export function parseGameUrl(url: string): ParsedGameUrl | null {
  const path = url.split('?')[0].split('#')[0];
  const m = /^\/games\/(math|japanese)(\/[^/]+)?\/?$/.exec(path);
  if (!m) return null;
  return { theme: m[1] as Theme, playing: !!m[2] };
}

export function freshEntry(now: number, budget = THEME_BUDGET_MS): ThemeTimeEntry {
  return { remainingMs: budget, lastActiveAt: now };
}

/** Entrada vigente: si pasó el descanso desde la última vez, se rellena */
export function refreshEntry(
  entry: ThemeTimeEntry | undefined,
  now: number,
  budget = THEME_BUDGET_MS,
  rest = THEME_REST_MS
): ThemeTimeEntry {
  if (!entry || now - entry.lastActiveAt >= rest || entry.lastActiveAt > now) return freshEntry(now, budget);
  return entry;
}

/** ¿El tema está descansando ahora mismo? */
export function isResting(entry: ThemeTimeEntry | undefined, now: number, rest = THEME_REST_MS): boolean {
  return !!entry && entry.remainingMs <= 0 && now - entry.lastActiveAt < rest && entry.lastActiveAt <= now;
}

export function restLeftMs(entry: ThemeTimeEntry | undefined, now: number, rest = THEME_REST_MS): number {
  if (!isResting(entry, now, rest)) return 0;
  return Math.max(0, rest - (now - entry!.lastActiveAt));
}

/** Descuenta tiempo jugado */
export function tickEntry(entry: ThemeTimeEntry, deltaMs: number, now: number): ThemeTimeEntry {
  return { remainingMs: Math.max(0, entry.remainingMs - Math.max(0, deltaMs)), lastActiveAt: now };
}

/** 600000 -> '10:00', 59001 -> '1:00', 0 -> '0:00' (redondea hacia arriba para no mostrar 0:00 con tiempo aún) */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
