import { hanziPara } from './hanzi-numbers-problem';

/**
 * Guion hablado de "Números Hanzi" (Planeta Dragón 🐉 — Sabio Long).
 *
 * Lógica pura: aquí no hay audio, solo *qué se diría* y con qué clave se busca el clip.
 * Quien reproduce es `Narrator`.
 *
 * DOS VOCES, DOS IDIOMAS, CADA UNA EN SU LADO
 *
 *  - **Las instrucciones son de la guía, en español** (`es-MX`): quien acompaña es Long
 *    y habla el idioma de las niñas.
 *  - **Los números son chinos** (`zh-CN`): son el contenido, no la consigna.
 *
 * El TTS de los números se alimenta del **propio hanzi** (`三十五`), no del pinyin: la
 * voz `zh-CN` lee caracteres, y meter pinyin (letra latina) en la misma pantalla que el
 * hanzi sería mezclar dos sistemas de símbolos en la misma lección, que es justo lo que
 * la Plantilla 6 del método prohíbe. La pronunciación la da el oído, no una fila de
 * letras debajo.
 *
 * Ninguna frase es un veredicto. Hay un test que lo verifica.
 */

export type ClipKey = string;

/** Carpeta donde viven los `.m4a`. Cambiar aquí y nowhere más. */
export const CLIP_BASE = 'audio/hanzi-numbers';

export interface ClipSpec {
  tts: string;
  lang: 'es-MX' | 'zh-CN';
}

/** Clave del clip que pronuncia un número en chino. 35 → `hn.num.35` */
export const numeroClip = (n: number): ClipKey => `hn.num.${n}`;

/** Los 1–99, que es todo lo que el juego puede nombrar en voz alta. */
export const NUMEROS: readonly number[] = Array.from({ length: 99 }, (_, i) => i + 1);

/** Palabras que un juego con método Zvonkin no puede pronunciar nunca. */
export const FORBIDDEN_IN_NARRATION = [
  'incorrecto',
  'está mal',
  'mal hecho',
  'equivocado',
  'fallaste',
  'no es',
  'respuesta equivocada',
];

// ============================================
// TEXTO DE CADA CLIP  (fuente de verdad)
// ============================================

export const CLIP_TEXT: Record<ClipKey, string> = {
  // --- Consignas ---
  /** Etapa 1, dirección número → hanzi: se ve 7, se elige 七 */
  'hn.ask.a-hanzi': '¿Cuál es el hanzi de este número?',
  /** Etapa 1, dirección hanzi → número: se ve 七, se elige 7 */
  'hn.ask.a-numero': '¿Qué número dice este hanzi?',
  /** Etapa 2: se ve 35, se arman 三 十 五 con las piezas */
  'hn.ask.combinar': 'Forma este número con los hanzis. Tócalos en orden.',

  // --- Dudas socráticas: ayudan sin decir que está mal ---
  /**
   * La estrategia real de la etapa 1: el número se dice en chino al entrar, así que
   * tocar cada opción y escuchar cuál dice *igual* resuelve el problema sin saber
   * todavía qué glifo es cuál. Enseña el método, no la respuesta.
   */
  'hn.duda.oye': 'Tócalos uno por uno y escucha.',
  /** La etapa 2 es posicional: si no se lee, casi siempre falta o sobra un 十. */
  'hn.duda.dieces': '¿Cuántos dieces lleva? Empieza por ahí.',
  /** Mira el que ya se lee y compáralo con el objetivo. */
  'hn.duda.compara': 'Mira el de arriba y compara.',
};

// ============================================
// MANIFIESTO
// ============================================

export const CLIP_MANIFEST: Record<ClipKey, ClipSpec> = {
  ...Object.fromEntries(
    Object.entries(CLIP_TEXT).map(([k, tts]) => [k, { tts, lang: 'es-MX' as const }]),
  ),
  ...Object.fromEntries(
    NUMEROS.map(n => [numeroClip(n), { tts: hanziPara(n), lang: 'zh-CN' as const }]),
  ),
};

export const ALL_CLIPS: readonly ClipKey[] = Object.keys(CLIP_MANIFEST);

/**
 * Palabras veredicto en cualquier clip.
 *
 * Es el mismo criterio que en `logic-blocks` y `kanji-narration`: una frase que juzga el
 * resultado le dice a la niña *que* falló, nunca *por qué*, y el método pide lo contrario.
 */
export function contieneVeredicto(texto: string): string | null {
  const t = texto.toLowerCase();
  return FORBIDDEN_IN_NARRATION.find(f => t.includes(f)) ?? null;
}
