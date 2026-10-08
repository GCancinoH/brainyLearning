/**
 * Generador de problemas de "El tanque de combustible" (Suma Espacial 3).
 * Lógica pura, sin Angular, para poder probarla aparte.
 *
 * Garantía: con los bloques generados siempre existen al menos `ways`
 * combinaciones distintas (por valores) que llenan exactamente el tanque.
 */

export interface FuelProblem {
  /** Capacidad total del tanque */
  goal: number;
  /** Parte ya llena y bloqueada (modo "faltante"); 0 en modo normal */
  preFilled: number;
  /** Valores de los bloques disponibles */
  values: number[];
  /** Formas distintas de llenarlo que hay que descubrir */
  ways: number;
}

import { distinctSolutions } from '../../../../core/games/combinations';

export type Rng = () => number;

const GOALS_AGE4 = [5, 5, 5, 6, 6, 6, 7, 7, 8, 8];
const GOALS_AGE6 = [8, 10, 10, 12, 12, 14, 15, 16, 18, 20];

export function buildFuelProblem(level: number, age: number, rng: Rng = Math.random): FuelProblem {
  const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const lvl = Math.max(1, Math.min(level, 10));
  const young = age <= 4;

  const goal = (young ? GOALS_AGE4 : GOALS_AGE6)[lvl - 1];

  // Modo "faltante": solo desde 6 años y nivel 4. El tanque ya trae una parte llena.
  const missing = !young && lvl >= 4 && rng() < 0.4;
  const preFilled = missing ? rand(2, goal - 3) : 0;
  const cap = goal - preFilled;

  // Formas distintas que hay que descubrir
  let ways = young ? (lvl <= 5 ? 1 : 2) : (lvl <= 2 ? 1 : lvl <= 6 ? 2 : 3);
  if (missing) ways = 1;

  const supplyCount = Math.min(young ? 5 : 7, 4 + Math.floor((lvl - 1) / 3));
  const maxByAge = young ? (lvl <= 6 ? 3 : 4) : Math.floor(cap / 2) + 2;
  const maxV = Math.max(1, Math.min(maxByAge, cap - 1));

  for (let attempt = 0; attempt < 300; attempt++) {
    const values = Array.from({ length: supplyCount }, () => rand(1, maxV));
    if (distinctSolutions(values, cap).length >= ways) {
      return { goal, preFilled, values: shuffle(values, rng), ways };
    }
  }

  // Respaldo: parejas que suman exactamente la capacidad (k + (cap - k))
  const values: number[] = [];
  for (let k = 1; k <= Math.floor(cap / 2) && values.length < supplyCount - 1; k++) {
    values.push(k, cap - k);
  }
  values.length = Math.min(values.length, supplyCount);
  while (values.length < supplyCount) values.push(rand(1, maxV));
  const found = distinctSolutions(values, cap).length;
  return { goal, preFilled, values: shuffle(values, rng), ways: Math.max(1, Math.min(ways, found)) };
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
