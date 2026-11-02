/**
 * Generador de "vocabulario Hanzi" (Planeta Dragón 🐉 — Sabio Long).
 *
 * Un solo motor para tres juegos: Colores, Animales y ¿Qué escuchaste?. Lógica pura,
 * sin Angular, para poder probarla con vitest.
 *
 * LOS TRES MODOS
 *  - `hear`: suena la palabra y se elige la imagen.
 *  - `glyph-to-see`: se ve el hanzi y se elige la imagen. A los 4 años suena solo al entrar
 *    ("muestra–di"), porque el glifo todavía no se lee.
 *  - `see-to-glyph`: se ve la imagen y se elige el hanzi. Tocar una opción la pronuncia,
 *    así que se puede resolver oyendo (estrategia socrática de `hanzi-numbers`).
 *
 * UNA SOLA PERILLA POR SALTO
 * Cada nivel cambia exactamente una cosa (palabras, modo, distractores, opciones, ancla o
 * repaso). Es el mismo principio de `difficultyFor` en `kanji-composition.ts`: si en un
 * salto cambian dos cosas a la vez, no se sabe cuál causó la dificultad.
 *
 * Los distractores "confusables" son palabras que comparten componente (红/绿 → 纟;
 * 猫/狗/猪 → 犭; 牛/羊 → cuernos). En los niveles altos van primero para que la niña
 * tenga que mirar el glifo y no descartar por eliminación.
 */

import { getProfileDifficultyConfig } from '@core/learning/learning-content';
import {
  HANZI_VOCAB,
  vocabForDeck,
  type HanziDeck,
  type HanziVocabItem,
} from '@core/learning/hanzi-vocab';

export type Rng = () => number;

/** Los 10 niveles de los tres juegos de vocabulario. */
export const MAX_LEVEL = 10;

export type VocabMode = 'hear' | 'glyph-to-see' | 'see-to-glyph';

export interface VocabProblem {
  /** La respuesta. */
  item: HanziVocabItem;
  mode: VocabMode;
  /** Incluye `item`, barajadas. */
  options: HanziVocabItem[];
  /** ¿Suena solo al entrar? */
  autoAudio: boolean;
}

/**
 * De dónde salen los distractores en "¿Qué escuchaste?".
 *
 * Se añade a las perillas del plan porque ese juego mezcla dos mazos: al principio el
 * contraste color/animal es obvio y útil; hacia el N6 la pregunta solo tiene sentido si
 * los distractores son de la misma categoría.
 */
export type DistractorScope = 'other' | 'mixed' | 'same';

export interface LevelKnob {
  /** Cuántas palabras del mazo entran en juego (por `order`). */
  poolSize: number;
  modes: readonly VocabMode[];
  /** ¿Distractores del mismo grupo `confusable` primero? */
  confusable: boolean;
  /** +1 opción sobre la configuración de edad. */
  extraOption: boolean;
  /** ¿`glyph-to-see` reproduce el audio solo al entrar? */
  autoAudioGlyph: boolean;
  /** N10: los vencidos del SRS mandan (lo aplica el componente con `forced`). */
  reviewFirst: boolean;
  /** Solo para `listening`; en los mazos de una categoría siempre es `same`. */
  distractorScope?: DistractorScope;
}

/**
 * Colores (6 palabras). Tabla §3.2 del plan.
 *
 * N8 sube las opciones cuando el mazo ya está completo; N9 quita el audio automático del
 * glifo; N10 manda el repaso del SRS.
 */
const COLOR_LEVELS: readonly LevelKnob[] = [
  { poolSize: 3, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 4, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 4, modes: ['hear', 'glyph-to-see'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 5, modes: ['hear', 'glyph-to-see'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 5, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: true, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: true, autoAudioGlyph: false, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: true, autoAudioGlyph: false, reviewFirst: true },
];

/**
 * Animales (8 palabras): misma estructura que colores, pero el mazo es más largo.
 *
 * El plan pide "una palabra nueva cada nivel par (鸟 → 马 → 牛 → 羊 → 猪)". Para que N10
 * quede libre para el repaso (la última perilla), las dos últimas (羊, 猪) entran juntas en
 * N8: el salto de N8 es el de **palabras**, y añadir dos sigue siendo una sola perilla.
 * Por la misma razón Animales no activa `extraOption` en N8: con 8 palabras y tres modos
 * ya hay suficiente variedad, y así el salto no mueve dos cosas.
 */
const ANIMAL_LEVELS: readonly LevelKnob[] = [
  { poolSize: 3, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 4, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 4, modes: ['hear', 'glyph-to-see'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 5, modes: ['hear', 'glyph-to-see'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 5, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 6, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 8, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false },
  { poolSize: 8, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: false, autoAudioGlyph: false, reviewFirst: false },
  { poolSize: 8, modes: ['hear', 'glyph-to-see', 'see-to-glyph'], confusable: true, extraOption: false, autoAudioGlyph: false, reviewFirst: true },
];

/**
 * ¿Qué escuchaste? El pool real lo pone el componente (`poolIds` = palabras ya
 * presentadas). Aquí solo se decide el modo, el tipo de distractor y el repaso.
 */
const LISTENING_LEVELS: readonly LevelKnob[] = [
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'other' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'other' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'mixed' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: false, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'mixed' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'mixed' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'same' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: false, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'same' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: true, autoAudioGlyph: true, reviewFirst: false, distractorScope: 'same' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: true, autoAudioGlyph: false, reviewFirst: false, distractorScope: 'same' },
  { poolSize: HANZI_VOCAB.length, modes: ['hear', 'glyph-to-see'], confusable: true, extraOption: true, autoAudioGlyph: false, reviewFirst: true, distractorScope: 'same' },
];

function tableFor(deck: HanziDeck | 'listening'): readonly LevelKnob[] {
  if (deck === 'colors') return COLOR_LEVELS;
  if (deck === 'animals') return ANIMAL_LEVELS;
  return LISTENING_LEVELS;
}

/** Perillas del nivel, recortando fuera de rango en vez de devolver `undefined`. */
export function knobFor(deck: HanziDeck | 'listening', level: number): LevelKnob {
  const table = tableFor(deck);
  const i = Math.min(table.length, Math.max(1, Math.round(level))) - 1;
  return table[i]!;
}

/** Pool del nivel: las primeras `poolSize` palabras del mazo, o lo ya presentado. */
export function poolFor(
  deck: HanziDeck | 'listening',
  level: number,
  poolIds?: readonly string[],
): readonly HanziVocabItem[] {
  if (deck === 'listening') {
    if (!poolIds || poolIds.length === 0) {
      throw new Error(
        '[hanzi-vocab] "listening" necesita poolIds: nunca se pregunta una palabra que no se presentó antes',
      );
    }
    const presentadas = new Set(poolIds);
    return HANZI_VOCAB.filter(item => presentadas.has(item.id));
  }
  return vocabForDeck(deck).slice(0, knobFor(deck, level).poolSize);
}

/** Entero en `[min, max]` con el `rng` inyectado. */
export function randInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Barajado Fisher–Yates sin mutar la entrada. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function scopeAllows(
  candidate: HanziVocabItem,
  target: HanziVocabItem,
  scope: DistractorScope,
): boolean {
  if (scope === 'mixed') return true;
  return scope === 'other' ? candidate.deck !== target.deck : candidate.deck === target.deck;
}

/**
 * Construye un problema.
 *
 * @param opts.forced  vencido del SRS: si está en el pool, es la respuesta obligatoria.
 *                     Si no está (p. ej. subió el nivel y esa palabra ya no toca), se ignora.
 * @param opts.avoidId palabra que acaba de salir: no se repite si hay alternativa.
 * @param opts.poolIds solo `listening`: ids ya presentados en Colores y Animales.
 */
export function buildVocabProblem(
  deck: HanziDeck | 'listening',
  level: number,
  age: number,
  rng: Rng = Math.random,
  opts: { forced?: string; avoidId?: string; poolIds?: readonly string[] } = {},
): VocabProblem {
  const lvl = Math.min(MAX_LEVEL, Math.max(1, Math.round(level)));
  const knob = knobFor(deck, lvl);
  const pool = poolFor(deck, lvl, opts.poolIds);

  if (pool.length < 2) {
    throw new Error(
      `[hanzi-vocab] ${deck} N${lvl}: el pool tiene ${pool.length} palabra(s); hacen falta al menos 2`,
    );
  }

  // La respuesta: primero el repaso forzado (solo si de verdad está en el pool), luego
  // la palabra que no acaba de salir.
  let item: HanziVocabItem | undefined;
  if (opts.forced) item = pool.find(i => i.id === opts.forced);
  if (!item) {
    const sinRepetir = pool.filter(i => i.id !== opts.avoidId);
    const candidatas = sinRepetir.length > 0 ? sinRepetir : pool;
    item = candidatas[Math.floor(rng() * candidatas.length)]!;
  }

  const mode = knob.modes[Math.floor(rng() * knob.modes.length)]!;

  const cfg = getProfileDifficultyConfig(age);
  const pedidas = randInt(cfg.minOptions, cfg.maxOptions, rng) + (knob.extraOption ? 1 : 0);
  const cantidad = Math.max(2, Math.min(pedidas, pool.length)) - 1; // distractores

  const scope = knob.distractorScope ?? 'same';
  const disponibles = pool.filter(
    i => i.id !== item!.id && scopeAllows(i, item!, scope),
  );

  // Con `confusable`, los del mismo grupo van primero (barajados dentro de cada grupo).
  const preferidos = knob.confusable
    ? disponibles.filter(i => i.confusable && i.confusable === item!.confusable)
    : [];
  const resto = disponibles.filter(i => !preferidos.includes(i));
  const elegidos = [
    ...shuffle(preferidos, rng),
    ...shuffle(resto, rng),
  ].slice(0, cantidad);

  // Si el scope dejó pocos (p. ej. listening N1 con un pool de una sola categoría),
  // se completa con el resto del pool antes que dejar menos opciones de las pedidas.
  if (elegidos.length < cantidad) {
    const usados = new Set([item.id, ...elegidos.map(i => i.id)]);
    elegidos.push(
      ...shuffle(pool.filter(i => !usados.has(i.id)), rng).slice(0, cantidad - elegidos.length),
    );
  }

  const autoAudio =
    mode === 'hear' ? true : mode === 'glyph-to-see' ? knob.autoAudioGlyph : false;

  return {
    item,
    mode,
    options: shuffle([item, ...elegidos], rng),
    autoAudio,
  };
}
