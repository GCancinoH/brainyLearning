/**
 * Guion hablado de los juegos de vocabulario Hanzi (Planeta Dragón 🐉).
 *
 * Lógica pura: aquí no hay audio, solo *qué se diría* y con qué clave se busca el clip.
 * Quien reproduce es `Narrator`.
 *
 * DOS VOCES
 *  - **Consignas y dudas:** en español (`es-MX`), porque quien acompaña es Long y habla el
 *    idioma de las niñas.
 *  - **Palabras:** en chino (`zh-CN`) y con el **propio hanzi** como texto. Nunca pinyin:
 *    mezclar caracteres con letras latinas en la misma pantalla rompe la Plantilla 6 del
 *    método y convierte la pronunciación en una fila de letras que se puede leer sin mirar.
 *
 * Ninguna frase es un veredicto. Hay un test que lo verifica.
 */

import { HANZI_VOCAB } from '@core/learning/hanzi-vocab';
import type { VocabMode } from './hanzi-vocab-problem';

export type ClipKey = string;

/** Carpeta donde viven los `.m4a`. Cambiar aquí y nowhere más. */
export const CLIP_BASE = 'audio/hanzi-vocab';

/** AAC 48 kbps, igual que `hanzi-numbers` y `kanji-compose`. */
export const CLIP_EXT = 'm4a';

export interface ClipSpec {
  tts: string;
  lang: 'es-MX' | 'zh-CN';
}

// ============================================
// CLAVES
// ============================================

/** Palabra del mazo: `hong` → `hv.w.hong`. */
export const wordClip = (id: string): ClipKey => `hv.w.${id}`;

/** Consigna según el modo de pregunta. */
export const MODE_CLIP: Record<VocabMode, ClipKey> = {
  hear: 'hv.ask.hear',
  'glyph-to-see': 'hv.ask.glyph',
  'see-to-glyph': 'hv.ask.see',
};

/** Dudas socráticas: ayudan sin decir que está mal. */
export const DUDA_OYE: ClipKey = 'hv.duda.oye';
export const DUDA_COMPARA: ClipKey = 'hv.duda.compara';

/** Puente al modo nuevo (se dice antes del primer problema de N7). */
export const PUENTE: ClipKey = 'hv.puente';

/** Palabras que un juego con método socrático no puede pronunciar nunca. */
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
  /** `hear`: solo suena la palabra; hay que tocar la imagen. */
  'hv.ask.hear': '¿Qué escuchaste?',
  /** `glyph-to-see`: se ve el hanzi y se elige la imagen. */
  'hv.ask.glyph': '¿Cuál es?',
  /** `see-to-glyph`: se ve la imagen y se elige el hanzi. */
  'hv.ask.see': '¿Cuál es su hanzi?',

  // --- Dudas ---
  /** La estrategia real de `hear` y `see-to-glyph`: tocar cada opción la pronuncia. */
  'hv.duda.oye': 'Tócalos uno por uno y escucha.',
  /** `glyph-to-see`: comparar el glifo elegido con el de arriba. */
  'hv.duda.compara': 'Mira bien y compara.',
  /** Al entrar en `see-to-glyph` por primera vez: el modo nuevo se explica antes. */
  'hv.puente': 'Ahora mira la imagen y busca su hanzi.',
};

// ============================================
// MANIFIESTO
// ============================================

export const CLIP_MANIFEST: Record<ClipKey, ClipSpec> = {
  ...Object.fromEntries(
    Object.entries(CLIP_TEXT).map(([k, tts]) => [k, { tts, lang: 'es-MX' as const }]),
  ),
  ...Object.fromEntries(
    HANZI_VOCAB.map(item => [
      wordClip(item.id),
      { tts: item.hanzi, lang: 'zh-CN' as const },
    ]),
  ),
};

export const ALL_CLIPS: readonly ClipKey[] = Object.keys(CLIP_MANIFEST);

/**
 * Palabras veredicto en cualquier clip.
 *
 * Mismo criterio que `logic-blocks`, `kanji-narration` y `hanzi-narration`: una frase que
 * juzga el resultado le dice a la niña *que* falló, nunca *por qué*.
 */
export function contieneVeredicto(texto: string): string | null {
  const t = texto.toLowerCase();
  return FORBIDDEN_IN_NARRATION.find(f => t.includes(f)) ?? null;
}
