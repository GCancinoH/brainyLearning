/**
 * Generador de problemas de "La Tiendita de Monedas".
 * Lógica pura, sin Angular, para poder probarla aparte.
 *
 * Un solo juego con dos modos, según la edad del perfil:
 *
 *  - `count` (4 años): contar manzanas reales y elegir el número correcto. El componente
 *    además obliga a la correspondencia uno a uno antes de dejar reintentar.
 *  - `pay` (6 años): pagar el precio exacto de un juguete combinando monedas, y desde
 *    ciertos niveles descubrir más de una forma distinta de hacerlo.
 *
 * A diferencia de `buildFuelProblem`, aquí NO hay bucle de reintentos: las monedas son de
 * suministro ilimitado, así que en cuanto existe una moneda de $1 cualquier objetivo es
 * alcanzable. Solo hace falta recortar `ways` a lo que de verdad existe.
 */

import { coinWays } from '../../../../core/games/combinations';
import { ProblemPicker, Rng } from '../../../../core/games/problem-picker';
import { getProfileGameConfig } from '../../../../core/games/game-types';

export type CoinMode = 'count' | 'pay';

export interface CoinProblem {
  mode: CoinMode;

  // ---- modo 'count' (4 años) ----
  /** Cuántas manzanas hay que contar */
  items: number;
  /** Números entre los que hay que elegir (siempre contiene `items`) */
  options: number[];

  // ---- modo 'pay' (6 años) ----
  /** Precio del juguete */
  price: number;
  /** Denominaciones disponibles en el cajón */
  denominations: number[];
  /** Ya cobrado por el cajero (0 en modo normal) */
  prePaid: number;
  /** Cuántas combinaciones distintas hay que descubrir */
  ways: number;

  /** Instrucción para el componente compartido de feedback */
  prompt: string;
}

/** Denominaciones disponibles, de menor a mayor valor */
export const DENOMS = [1, 2, 5, 10] as const;

export const MAX_LEVEL = 10;

/** Memoria corta: no repetir el mismo precio 4 problemas seguidos */
const pricePicker = new ProblemPicker(4);

// ============================================
// ESCALADO POR NIVEL
// ============================================

/** 6 años. El precio sube, el $10 entra en el nivel 7 y "otra forma" en el 4. */
const PAY_RANGES: ReadonlyArray<{
  maxLevel: number;
  price: readonly [number, number];
  denoms: readonly number[];
  ways: number;
  /** Nivel a partir del cual el cajero puede haber cobrado ya una parte */
  missingFrom: number;
}> = [
  { maxLevel: 3, price: [5, 7], denoms: [1, 2, 5], ways: 1, missingFrom: 99 },
  { maxLevel: 6, price: [8, 10], denoms: [1, 2, 5], ways: 2, missingFrom: 99 },
  { maxLevel: 9, price: [11, 13], denoms: [1, 2, 5, 10], ways: 2, missingFrom: 7 },
  { maxLevel: Infinity, price: [14, 15], denoms: [1, 2, 5, 10], ways: 2, missingFrom: 7 },
];

/** 4 años. El número de opciones sale de PROFILE_GAME_CONFIGS[4], no está hardcodeado. */
const COUNT_RANGES: ReadonlyArray<{
  maxLevel: number;
  items: readonly [number, number];
  options: 'min' | 'max';
}> = [
  { maxLevel: 5, items: [3, 4], options: 'min' },
  { maxLevel: 9, items: [4, 6], options: 'max' },
  { maxLevel: Infinity, items: [6, 10], options: 'max' },
];

// ============================================
// GENERADOR
// ============================================

export function buildCoinProblem(
  level: number,
  age: number,
  rng: Rng = Math.random,
): CoinProblem {
  return age <= 4 ? buildCountProblem(level, rng) : buildPayProblem(level, rng);
}

// ---------- modo 'count' ----------

function buildCountProblem(level: number, rng: Rng): CoinProblem {
  const lvl = clampLevel(level);
  const range = COUNT_RANGES.find(r => lvl <= r.maxLevel)!;
  const cfg = getProfileGameConfig(4);
  const howMany = range.options === 'min' ? cfg.minOptions : cfg.maxOptions;

  const items = rand(range.items[0], range.items[1], rng);

  return {
    mode: 'count',
    items,
    options: buildCountOptions(items, howMany, rng),
    prompt: '¿Cuántas manzanas hay?',
    price: 0,
    denominations: [],
    prePaid: 0,
    ways: 0,
  };
}

/**
 * A los 4 años solo se ofrecen vecinos de la respuesta. Un número lejano no sería un
 * distractor, sería ruido: la niña no sabe todavía qué preguntas hacerse.
 */
function buildCountOptions(answer: number, howMany: number, rng: Rng): number[] {
  const pool = new Set<number>([answer]);
  for (const d of [answer - 1, answer + 1, answer + 2, answer - 2]) {
    if (d >= 1 && pool.size < howMany) pool.add(d);
  }
  // Salvaguarda determinista, mismo criterio que buildOptions de multiply-problem
  for (let k = 1; pool.size < howMany; k++) {
    const extra = answer + k;
    if (extra !== answer) pool.add(extra);
  }
  return shuffle([...pool], rng);
}

// ---------- modo 'pay' ----------

function buildPayProblem(level: number, rng: Rng): CoinProblem {
  const lvl = clampLevel(level);
  const range = PAY_RANGES.find(r => lvl <= r.maxLevel)!;

  // El precio no se repite hasta agotar la bolsa del ProblemPicker
  const prices: number[] = [];
  for (let p = range.price[0]; p <= range.price[1]; p++) prices.push(p);
  const price = pricePicker.next(`pay-${range.maxLevel}`, prices, p => String(p), rng);

  // Modo "faltante": el cajero ya cobró una parte. Se acota a un tercio del precio para
  // que siempre queden al menos 2 monedas por poner.
  const missing = lvl >= range.missingFrom && rng() < 0.4;
  const prePaid = missing ? rand(1, Math.max(1, Math.floor(price / 3)), rng) : 0;
  const cap = price - prePaid;

  // Nunca pedir más formas de las que existen de verdad
  const ways = Math.max(1, Math.min(range.ways, coinWays(range.denoms, cap).length));

  return {
    mode: 'pay',
    items: 0,
    options: [],
    price,
    denominations: [...range.denoms],
    prePaid,
    ways,
    prompt: prePaid > 0
      ? `El cajero ya cobró $${prePaid}. Paga el juguete de $${price}`
      : `Paga el juguete de $${price}`,
  };
}

// ============================================
// UTILIDADES
// ============================================

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(level, MAX_LEVEL));
}

function rand(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}