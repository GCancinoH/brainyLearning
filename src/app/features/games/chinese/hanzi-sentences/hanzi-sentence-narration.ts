/**
 * Guion hablado del juego de frases Hanzi.
 *
 * Tres voces para tres cosas distintas:
 *  - **Consigna y duda:** español (`es-MX`). A los 4 años la frase se *oye*; a los 6 se lee.
 *  - **Fichas:** chino (`zh-CN`), con el hanzi como texto. Sin pinyin.
 *  - **Frase resuelta:** chino (`zh-CN`), la secuencia completa.
 *
 * Ninguna frase es un veredicto. Hay un test que lo verifica.
 */

import {
  sentenceDeck,
  sentenceText,
  type SentenceFrame,
} from '@core/learning/sentence-builder';

export type ClipKey = string;

/** Carpeta donde viven los `.m4a`. */
export const CLIP_BASE = 'audio/hanzi-sentences';

/** AAC 48 kbps, igual que los otros mazos Hanzi. */
export const CLIP_EXT = 'm4a';

export interface ClipSpec {
  tts: string;
  lang: 'es-MX' | 'zh-CN';
}

const ZH_DECK = sentenceDeck('zh');
const ZH_FRAMES: readonly SentenceFrame[] = ZH_DECK.frames;

// ============================================
// CLAVES
// ============================================

/** Ficha del mazo: `wo` → `hs.w.wo`. */
export const wordClip = (id: string): ClipKey => `hs.w.${id}`;

/** Frase que se pide (español): `zh-wo-he-shui` → `hs.prompt.zh-wo-he-shui`. */
export const promptClip = (frameId: string): ClipKey => `hs.prompt.${frameId}`;

/** Frase resuelta (chino): `zh-wo-he-shui` → `hs.say.zh-wo-he-shui`. */
export const sayClip = (frameId: string): ClipKey => `hs.say.${frameId}`;

/** Consigna inicial. */
export const ASK: ClipKey = 'hs.ask';

/** Duda socrática: ayuda sin decir que está mal. */
export const DUDA: ClipKey = 'hs.duda';

/** Frases que un juego socrático no puede pronunciar nunca. */
export const FORBIDDEN_IN_NARRATION = [
  'incorrecto',
  'está mal',
  'mal hecho',
  'equivocado',
  'fallaste',
  'respuesta equivocada',
];

// ============================================
// TEXTO DE CADA CLIP (fuente de verdad)
// ============================================

export const CLIP_TEXT: Record<ClipKey, string> = {
  'hs.ask': 'Ordena los hanzis para decir la frase.',
  'hs.duda': 'Toca cada ficha y escucha.',
};

// ============================================
// MANIFIESTO
// ============================================

export const CLIP_MANIFEST: Record<ClipKey, ClipSpec> = {
  ...Object.fromEntries(
    Object.entries(CLIP_TEXT).map(([k, tts]) => [k, { tts, lang: 'es-MX' as const }]),
  ),
  ...Object.fromEntries(
    ZH_DECK.tokens.map(token => [
      wordClip(token.id),
      { tts: token.text, lang: 'zh-CN' as const },
    ]),
  ),
  ...Object.fromEntries(
    ZH_FRAMES.map(frame => [
      promptClip(frame.id),
      { tts: frame.es, lang: 'es-MX' as const },
    ]),
  ),
  ...Object.fromEntries(
    ZH_FRAMES.map(frame => [
      sayClip(frame.id),
      { tts: sentenceText(ZH_DECK, frame), lang: 'zh-CN' as const },
    ]),
  ),
};

export const ALL_CLIPS: readonly ClipKey[] = Object.keys(CLIP_MANIFEST);

/**
 * Palabras veredicto en cualquier clip.
 *
 * Mismo criterio que los otros juegos: una frase que juzga el resultado le dice a la
 * niña *que* falló, nunca *por qué*.
 */
export function contieneVeredicto(texto: string): string | null {
  const t = texto.toLowerCase();
  return FORBIDDEN_IN_NARRATION.find(f => t.includes(f)) ?? null;
}
