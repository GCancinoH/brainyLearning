import {
  KANJI_COMPOSITIONS, KanjiComposition, KanjiPiece, SOCRATIC_LINES, SocraticMoment, pieceData
} from './kanji-composition';

/**
 * El guion hablado de "Construye el Kanji".
 *
 * Lógica pura: aquí no hay audio, solo **qué se diría**, en qué idioma y con qué clave se
 * busca el fichero. Quien reproduce es `Narrator`.
 *
 * LAS TRES REGLAS DEL CONTENIDO (no son sugerencias, son correcciones de bugs reales)
 *
 *  1. **Al TTS japonés solo hiragana.** Mandarle el kanji (`明`) deja que el motor elija
 *     entre on'yomi y kun'yomi, y en Android puede no haber voz `ja-JP`: no suena nada.
 *     Con hiragana (`あかるい`) el motor solo puede decir la palabra que queremos enseñar.
 *
 *  2. **Al TTS español, texto pelado.** Sin emojis ni kanji: un motor español intentaría
 *     leer "☀️" en voz alta. Por eso cada historia tiene dos versiones, `story` (con
 *     emojis, para la pantalla) y `storyTts` (sin ellos, para el audio).
 *
 *  3. **Una sola voz por idioma.** El cerebro infantil asocia la voz con el idioma; si el
 *     kanji suena con una voz y la pieza con otra, la asociación se rompe.
 */

export type ClipKey = string;
export type ClipLang = 'es-MX' | 'ja-JP' | 'zh-CN';

/** Dónde viven los `.wav`. */
export const CLIP_BASE = 'audio/kanji-compose';
export const clipPath = (key: ClipKey): string => `${CLIP_BASE}/${key}.wav`;

export interface ClipSpec {
  /** Texto exacto que se dice. Es también el fallback del TTS. */
  tts: string;
  lang: ClipLang;
}

// ============================================
// CONSTRUCTORES DE CLAVES
// ============================================

export const kanjiWord = (id: string): ClipKey => `kc.ja.k.${id}.word`;
export const kanjiOnyomi = (id: string): ClipKey => `kc.ja.k.${id}.on`;
export const kanjiMeaning = (id: string): ClipKey => `kc.es.k.${id}.meaning`;
export const kanjiStory = (id: string): ClipKey => `kc.es.k.${id}.story`;
export const pieceWord = (pieceId: string): ClipKey => `kc.ja.p.${pieceId}`;
export const pieceMeaning = (pieceId: string): ClipKey => `kc.es.p.${pieceId}`;
export const siblingWord = (kanji: string): ClipKey => `kc.ja.sib.${kanji}`;
export const socraticLine = (m: SocraticMoment, n: number): ClipKey => `kc.es.line.${m}.${n}`;
export const sys = (key: string): ClipKey => `kc.es.sys.${key}`;

// ============================================
// FRASES DE SISTEMA
// ============================================

/**
 * Lo que el juego dice cuando no hay nada que identificar: saludos, instrucciones de
 * paso y el cierre.
 *
 * Sustituyen a los textos que había en pantalla ("Soy Aki, de Planeta Sakura", "Ahora hazlo
 * tú", "Trazo", "Borrar", "¡Listo!"), que para una pre-lectora eran píxeles mudos.
 */
export const SYSTEM_TEXT: Record<string, string> = {
  'greeting.aki': '¡Hola! Soy Aki, del Planeta Sakura. ¡Vamos a construir un kanji!',
  'greeting.long': '¡Hola! Soy Long, del Planeta Dragón. ¡Vamos a construir un carácter!',
  'look-ghost': 'Mira el dibujo borroso. ¿Qué piezas necesitas?',
  'which-piece': '¿Qué pieza va en cada hueco? Puedes probar.',
  'now-you': 'Ahora tú.',
  'recall-hear': 'Escucha. ¿Cuál es?',
  'recall-see': 'Mira. ¿Cómo suena?',
  'recall-again': 'Escucha otra vez.',
  'draw-now': 'Ahora dibújalo tú.',
  'draw-empty': 'Dibuja con el dedo, aunque sea una línea.',
  'done': '¡Lo conseguiste!',
  'siblings': '¡Mira! Con las mismas piezas salen otros kanji.',
  'again': '¡Otra vez!',
  'next': 'Vamos con otro.',
  'guide-composer': 'Pon cada pieza en su hueco.'
};

// ============================================
// LÍNEAS SOCRÁTICAS PARA AUDIO
// ============================================

/**
 * Emoji y símbolos que el motor de voz no debe leer.
 *
 * Se cubre `Extended_Pictographic` (emojis) más los selectores de variación y los
 * modificadores de tono de piel, que van fuera de ese bloque y se colarían sueltos.
 */
const RUIDO_PARA_EL_TTS =
  /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0E}\u{FE0F}\u{20E3}\u{200D}]/gu;

/** Sin emojis ni comas sueltas de `meaning: 'sol, día'`. */
export function textoParaVoz(texto: string): string {
  return texto.replace(RUIDO_PARA_EL_TTS, '').replace(/\s+/g, ' ').trim();
}

/**
 * Las líneas socráticas **derivadas** del texto de pantalla, no escritas aparte.
 *
 * Es a propósito: si fueran dos listas, la de audio se quedaría vieja en cuanto se
 * reescribiera un texto y nadie se enteraría. Al derivarlas, no pueden desincronizarse,
 * y `kanji-narration.spec` comprueba que no quede ni un emoji.
 */
export function socraticLinesFor(moment: SocraticMoment): string[] {
  return SOCRATIC_LINES[moment].map(textoParaVoz);
}

// ============================================
// MANIFIESTO
// ============================================

function construirManifiesto(): Record<ClipKey, ClipSpec> {
  const m: Record<ClipKey, ClipSpec> = {};

  for (const [clave, texto] of Object.entries(SYSTEM_TEXT)) {
    m[sys(clave)] = { tts: texto, lang: 'es-MX' };
  }

  for (const c of KANJI_COMPOSITIONS) {
    m[kanjiWord(c.id)] = { tts: c.reading, lang: 'ja-JP' };
    m[kanjiMeaning(c.id)] = { tts: c.meaningTts, lang: 'es-MX' };
    m[kanjiStory(c.id)] = { tts: c.storyTts, lang: 'es-MX' };
    // El on'yomi solo se usa desde el nivel 5 y solo a 6 años, pero el manifiesto se
    // construye entero: saber que falta un clip al generar es un aviso, no un silencio.
    if (c.onyomi) m[kanjiOnyomi(c.id)] = { tts: c.onyomi.hira, lang: 'ja-JP' };
    for (const sib of c.siblings ?? []) {
      m[siblingWord(sib.kanji)] = { tts: sib.reading, lang: 'ja-JP' };
    }
  }

  for (const pieza of piezasUnicas()) {
    m[pieceWord(pieza.id)] = { tts: pieza.reading, lang: 'ja-JP' };
    m[pieceMeaning(pieza.id)] = { tts: pieza.meaningTts, lang: 'es-MX' };
  }

  for (const momento of Object.keys(SOCRATIC_LINES) as SocraticMoment[]) {
    socraticLinesFor(momento).forEach((tts, i) => {
      m[socraticLine(momento, i)] = { tts, lang: 'es-MX' };
    });
  }

  return m;
}

/** Piezas que usa algún compuesto, sin repetir (`ki` aparece tres veces en 森). */
/**
 * Cuántas líneas tiene cada momento socrático.
 *
 * Lo consume el juego para elegir una sin pasarse: si pidiera la línea 7 de un momento que
 * solo tiene 3, buscaría un clip que no existe y caería al TTS con un `undefined`.
 */
export const SOCRATIC_LINE_COUNT: Record<string, number> = Object.fromEntries(
  Object.keys(SOCRATIC_LINES).map(m => [m, SOCRATIC_LINES[m as SocraticMoment].length])
);

/** Piezas que usa algún compuesto, sin repetir (`ki` aparece tres veces en 森). */
function piezasUnicas(): KanjiPiece[] {
  const vistos = new Map<string, KanjiPiece>();
  for (const c of KANJI_COMPOSITIONS) {
    for (const slot of c.slots) {
      const p = pieceData(slot.kanji);
      if (p.id && !vistos.has(p.id)) vistos.set(p.id, p);
    }
  }
  return [...vistos.values()];
}

/** Fuente de verdad de todo lo que se puede oír. */
export const CLIP_MANIFEST: Record<ClipKey, ClipSpec> = construirManifiesto();

export const ALL_CLIPS: readonly ClipKey[] = Object.keys(CLIP_MANIFEST);

// ============================================
// EL "CINE": SECUENCIA DE LA HISTORIA
// ============================================

/** Qué elemento se ilumina mientras suena este cue. Es lo que hace el karaoke. */
export type Highlight = { kind: 'kanji' } | { kind: 'piece'; index: number };

export interface Cue<T = unknown> {
  clip: ClipKey;
  /** Etiqueta para saber qué iluminar en este momento. */
  tag?: T;
  /** Pausa después de este clip, en ms. */
  pauseAfterMs?: number;
}

export type StoryMode = 'full' | 'short' | 'skip';

/**
 * La secuencia de la Historia.
 *
 * Es lo que arregla el problema de fondo: antes el paso Historia era **mudo**, y la
 * asociación forma ↔ sonido solo se podía formar en el paso de componer, donde ya había
 * que saber operar. Aquí el sonido llega antes de que se toque nada.
 *
 * @param mode `full` = primera vez con 4 años (palabra → historia → piezas → palabra);
 *             `short` = ya la conoce; `skip` = solo suena el kanji.
 */
export function storyCues(
  c: KanjiComposition,
  o: { age: 4 | 6; mode: StoryMode }
): Cue<Highlight>[] {
  const word: Cue<Highlight> = { clip: kanjiWord(c.id), tag: { kind: 'kanji' }, pauseAfterMs: 300 };

  // `skip` es el modo de quien ya lo sabe: suena y pasa. Ni historia, ni piezas.
  if (o.mode === 'skip') return [word];

  const piezas = c.slots.flatMap((slot, index): Cue<Highlight>[] => {
    const id = pieceData(slot.kanji).id;
    const tag: Highlight = { kind: 'piece', index };
    // A los 4 años cada pieza va con su significado en español: sin leer, "ひ" no dice
    // nada, y ella necesita oír 日 = sol para poder asociar después.
    if (o.age === 4 && o.mode === 'full') {
      return [
        { clip: pieceWord(id), tag, pauseAfterMs: 150 },
        { clip: pieceMeaning(id), tag, pauseAfterMs: 250 }
      ];
    }
    return [{ clip: pieceWord(id), tag, pauseAfterMs: 250 }];
  });

  // La historia solo a los 4 años en modo `full`: a los 6 la lee ella, y de 6 años ya
  // en adelante repetirla en cada ronda sería slowing singmás.
  const historia: Cue<Highlight>[] =
    o.age === 4 && o.mode === 'full' ? [{ clip: kanjiStory(c.id), pauseAfterMs: 350 }] : [];

  const cierre: Cue<Highlight>[] =
    o.age === 4 && o.mode === 'full' ? [{ clip: sys('now-you') }] : [];

  // El cierre de la historia devuelve el sonido del kanji: se oye la palabra DESPUÉS de
  // ver las piezas, que es cuando la asociación tiene sentido.
  return [word, ...historia, ...piezas, word, ...cierre];
}

/** Claves que hacen falta para un compuesto: sirve para la precarga (§5.5 del spec). */
export function clipsForProblem(c: KanjiComposition): ClipKey[] {
  const piezas = c.slots.map(s => {
    const p = pieceData(s.kanji);
    return [pieceWord(p.id), pieceMeaning(p.id)] as ClipKey[];
  }).flat();
  return [kanjiWord(c.id), kanjiMeaning(c.id), kanjiStory(c.id), ...piezas];
}