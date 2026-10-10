/**
 * Generador de problemas de "La Tiendita de Monedas".
 * Lógica pura, sin Angular, para poder probarla aparte.
 *
 * Un solo juego con TRES modos, según edad y nivel:
 *
 *  - `count` (4 años): contar objetos reales, uno a uno, y elegir el número. Es lo que rompe
 *    el conteo mecánico: la correspondencia 1→1 se hace con el dedo, no de memoria.
 *  - `give`  (4 años, desde nivel 5): "ponle N en la bolsa". El estante trae N+3 objetos, así
 *    que no basta con llevárselos todos. Enseña cardinalidad: el último número dicho es el total.
 *  - `pay`   (6 años): pagar el precio exacto con monedas de $1, $2 y $5 (y $10), combinando
 *    varias formas distintas, y desde el nivel 7 completando un pago ya empezado.
 *
 * Decisión clave: las monedas tienen SUMINISTRO LIMITADO ({1:4, 2:3, 5:1}). Con monedas
 * infinitas existe una única estrategia —llenar todo de $1— y la combinatoria nunca llega a
 * enseñar nada. El límite es lo que obliga a pensar qué moneda usar.
 *
 * Para contar las formas se reutiliza `distinctSolutions` de `combinations.ts`, que es
 * subset-sum sobre un suministro. Para modelar las monedas hace falta EXPANDIR el registro
 * {1:4, 2:3} al array plano [1,1,1,1, 2,2,2]: así "cada elemento se usa 0 o 1 veces" pasa a
 * querer decir "hay 4 oportunidades de usar un $1". Verificado idéntico a un multiset acotado.
 */

import { distinctSolutions } from '../../../../core/games/combinations';
import { ProblemPicker, Rng } from '../../../../core/games/problem-picker';
import { getProfileGameConfig } from '../../../../core/games/game-types';

export type CoinMode = 'count' | 'give' | 'pay';

export interface CoinProblem {
  mode: CoinMode;

  // ---------- modos 'count' y 'give' ----------
  /** Cuántos hay que contar (count) o entregar (give) */
  items: number;
  /** Cuántos objetos hay en el estante: items en 'count', items + 3 en 'give' */
  shelfCount: number;
  /** Posiciones en % (0-100) de cada objeto del estante */
  positions: Array<{ x: number; y: number }>;
  /** Emoji del objeto */
  item: string;
  /** Números entre los que elegir (solo en 'count') */
  options: number[];
  /** ¿Están en fila? (más fácil de contar) */
  inLine: boolean;

  // ---------- modo 'pay' ----------
  price: number;
  denominations: number[];
  /** Monedas disponibles: valor -> cuántas */
  supply: Record<number, number>;
  prePaid: number;
  /** Cuántas combinaciones distintas hay que descubrir */
  ways: number;
  /** Cuántas combinaciones existen EN TOTAL para esa cantidad (para el mensaje de reflexión) */
  waysTotal: number;

  prompt: string;
}

export const MAX_LEVEL = 10;

// ============================================
// DATOS
// ============================================

const FOODS = ['🍎', '🍌', '🍓', '🍪', '🥕', '🍊', '🧁'];

const TOYS: Array<{ item: string; name: string }> = [
  { item: '🧸', name: 'el osito' },
  { item: '🚗', name: 'el carrito' },
  { item: '⚽', name: 'la pelota' },
  { item: '📘', name: 'el libro' },
  { item: '🪁', name: 'la cometa' },
  { item: '🎨', name: 'las pinturas' },
];

/** Objetos que se pueden pedir: nivel 1 empieza en 3, nivel 10 llega a 10 */
const COUNT_RANGES: ReadonlyArray<readonly [number, number]> = [
  [3, 3], [3, 4], [3, 4], [4, 5], [4, 6], [5, 7], [6, 8], [7, 9], [8, 10], [9, 10],
];

// ============================================
// ESCALADO DE PAGO
// ============================================

interface PayBand {
  maxLevel: number;
  price: readonly [number, number];
  supply: Record<number, number>;
  ways: number;
  /** Nivel a partir del cual el cajero puede haber cobrado ya una parte */
  missingFrom: number;
}

const PAY_BANDS: ReadonlyArray<PayBand> = [
  { maxLevel: 3, price: [4, 6], supply: { 1: 4, 2: 3, 5: 1 }, ways: 1, missingFrom: 99 },
  { maxLevel: 6, price: [7, 10], supply: { 1: 4, 2: 4, 5: 2 }, ways: 2, missingFrom: 99 },
  { maxLevel: 8, price: [11, 15], supply: { 1: 5, 2: 4, 5: 2, 10: 1 }, ways: 2, missingFrom: 7 },
  { maxLevel: Infinity, price: [16, 22], supply: { 1: 5, 2: 4, 5: 2, 10: 1 }, ways: 3, missingFrom: 7 },
];

/** Memoria corta: no repetir el mismo precio 4 rondas seguidas */
const pricePicker = new ProblemPicker(4);
const toyPicker = new ProblemPicker(3);

// ============================================
// UTILIDADES DE MONEDAS
// ============================================

/**
 * {1:4, 2:3} -> [1,1,1,1, 2,2,2]. Necesario para usar `distinctSolutions`, que es
 * subset-sum: "cada elemento 0 o 1 veces" pasa a ser "hay 4 chances de un $1".
 */
export function expandSupply(supply: Record<number, number>): number[] {
  const out: number[] = [];
  for (const [value, count] of Object.entries(supply)) {
    for (let i = 0; i < count; i++) out.push(Number(value));
  }
  return out;
}

/** Todas las formas de formar `target` con el suministro dado. */
export function waysFor(supply: Record<number, number>, target: number): string[] {
  if (target <= 0) return [];
  return distinctSolutions(expandSupply(supply), target);
}

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

// ---------- modos 'count' y 'give' ----------

function buildCountProblem(level: number, rng: Rng): CoinProblem {
  const lvl = clampLevel(level);
  const cfg = getProfileGameConfig(4);
  const range = COUNT_RANGES[lvl - 1]!;

  // "Dame N" entra en el nivel 5: antes hay que dominar el conteo uno a uno
  const give = lvl >= 5 && rng() < 0.5;
  const items = rand(range[0], range[1], rng);
  const shelfCount = give ? items + 3 : items;
  const item = FOODS[Math.floor(rng() * FOODS.length)]!;

  // En fila hasta el nivel 4: disperso de verdad es más difícil de contar
  const inLine = !give && lvl <= 4;

  return {
    mode: give ? 'give' : 'count',
    items,
    shelfCount,
    positions: scatter(shelfCount, inLine, rng),
    item,
    options: give ? [] : buildCountOptions(items, cfg.minOptions + 1, rng),
    inLine,
    price: 0,
    denominations: [],
    supply: {},
    prePaid: 0,
    ways: 0,
    waysTotal: 0,
    prompt: give
      ? `La clienta pide ${items} ${items === 1 ? 'pieza' : 'piezas'} ${item}`
      : '¿Cuántas hay en la mesa?',
  };
}

/**
 * Coloca `n` objetos sin que ninguno se solape.
 *
 * En fila: reparto evenly. Si no, rejilla de 5×3 con un poco de desorden (±3.5), porque
 * una fila perfecta a los 9 años se cuenta de memoria; desordenada hay que contar de verdad.
 * El jitter es menor que la mitad del hueco entre celdas, así que nunca se solapan.
 */
export function scatter(n: number, inLine: boolean, rng: Rng): Array<{ x: number; y: number }> {
  if (inLine) {
    return Array.from({ length: n }, (_, i) => ({ x: ((i + 0.5) / n) * 100, y: 50 }));
  }
  const cols = 5;
  const rows = 3;
  const cells = shuffle(Array.from({ length: cols * rows }, (_, i) => i), rng).slice(0, n);
  const jitter = 3.5;
  return cells.map(c => ({
    x: ((c % cols) + 0.5) / cols * 100 + (rng() - 0.5) * jitter * 2,
    y: (Math.floor(c / cols) + 0.5) / rows * 100 + (rng() - 0.5) * jitter * 2,
  }));
}

/** A los 4 años solo vecinos: un número lejano no es distractor, es ruido. */
function buildCountOptions(answer: number, howMany: number, rng: Rng): number[] {
  const pool = new Set<number>([answer]);
  for (const d of [answer - 1, answer + 1, answer + 2, answer - 2]) {
    if (d >= 1 && pool.size < howMany) pool.add(d);
  }
  for (let k = 1; pool.size < howMany; k++) {
    const extra = answer + k;
    if (extra !== answer) pool.add(extra);
  }
  return shuffle([...pool], rng);
}

// ---------- modo 'pay' ----------

function buildPayProblem(level: number, rng: Rng): CoinProblem {
  const lvl = clampLevel(level);
  const band = PAY_BANDS.find(b => lvl <= b.maxLevel)!;

  // El precio y el juguete no se repiten hasta agotar la bolsa del ProblemPicker
  const prices: number[] = [];
  for (let p = band.price[0]; p <= band.price[1]; p++) prices.push(p);
  const price = pricePicker.next(`pay-${band.maxLevel}`, prices, p => String(p), rng);
  const toy = toyPicker.next(`toy-${band.maxLevel}`, TOYS, t => t.item, rng)!;

  // Modo "faltante": el cajero ya cobró una parte. Acotado a un tercio del precio para que
  // siempre queden al menos 2 monedas por poner.
  const missing = lvl >= band.missingFrom && rng() < 0.4;
  const prePaid = missing ? rand(1, Math.max(1, Math.floor(price / 3)), rng) : 0;
  const cap = price - prePaid;

  // Nunca pedir más formas de las que existen de verdad: se recortan a lo alcanzable
  const waysTotal = waysFor(band.supply, cap).length;
  const ways = Math.max(1, Math.min(band.ways, waysTotal));

  return {
    mode: 'pay',
    items: 0,
    shelfCount: 0,
    positions: [],
    item: toy.item,
    options: [],
    inLine: false,
    price,
    denominations: Object.keys(band.supply)
      .map(Number)
      .sort((a, b) => a - b),
    supply: { ...band.supply },
    prePaid,
    ways,
    waysTotal,
    prompt: prePaid > 0
      ? `El cajero ya cobró $${prePaid}. Paga ${toy.name} de $${price}`
      : `Paga ${toy.name} de $${price}`,
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

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Clave canónica de una combinación de monedas */
export function comboKey(coins: readonly number[]): string {
  return [...coins].sort((a, b) => a - b).join('+');
}