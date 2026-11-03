/**
 * Modelo puro de frases multiidioma.
 *
 * Un mismo motor describe una frase como una **secuencia ordenada de fichas**. Eso es lo
 * único que cambia entre idiomas:
 *  - chino:   我 喝 水          (SVO)
 *  - japonés: 私 は 水 を 飲む   (SOV + partículas)
 *  - inglés:  I drink water     (SVO)
 *
 * Aquí no hay Angular ni audio. El componente chino (`hanzi-sentences`) consume este
 * módulo; mañana un componente japonés o inglés puede usar exactamente el mismo
 * generador y la misma validación de orden.
 *
 * REGLAS
 *  - `tokens` es el orden correcto, no un conjunto. Validar solo "están todas" dejaría
 *    pasar 水我喝, que no es una frase.
 *  - Los ids son internos y nunca se muestran. El texto visible es `text`.
 *  - Cada frame declara su traducción en español e inglés: el prototipo chino pregunta
 *    en español y el mismo dato sirve para una versión que pregunte en inglés.
 */

export const SENTENCE_LANGUAGES = ['zh', 'ja', 'en'] as const;
export type SentenceLanguage = (typeof SENTENCE_LANGUAGES)[number];

/** Idioma en el que se le da la frase a la niña. */
export type SentencePromptLanguage = 'es' | 'en';

export type SentenceRole =
  | 'subject'
  | 'verb'
  | 'object'
  | 'particle'
  | 'aux'
  | 'article';

export interface SentenceToken {
  /** Id interno del mazo: 'wo', 'mizu', 'water'. Nunca se muestra. */
  id: string;
  /** Texto visible: '我', '水', 'I', 'water'. */
  text: string;
  /** Glosa española para aria-label y para el panel de padres. */
  glossEs: string;
  role: SentenceRole;
}

export interface SentenceFrame {
  /** Id global única: 'zh-wo-he-shui'. */
  id: string;
  language: SentenceLanguage;
  /** Orden de introducción dentro del mazo (1 = primero). */
  order: number;
  /** Orden correcto de las fichas. */
  tokens: readonly string[];
  /** La frase que se le muestra (o se le dice) a la niña. */
  es: string;
  en: string;
  emoji: string;
  /** Nivel a partir del cual puede salir (1–10). */
  level: number;
}

export interface SentenceDeck {
  language: SentenceLanguage;
  tokens: readonly SentenceToken[];
  frames: readonly SentenceFrame[];
}

export const SENTENCE_MAX_LEVEL = 10;

// ============================================
// DATOS · CHINO
// ============================================

const ZH_TOKENS: readonly SentenceToken[] = [
  { id: 'wo', text: '我', glossEs: 'yo', role: 'subject' },
  { id: 'he', text: '喝', glossEs: 'beber', role: 'verb' },
  { id: 'chi', text: '吃', glossEs: 'comer', role: 'verb' },
  { id: 'kan', text: '看', glossEs: 'mirar / leer', role: 'verb' },
  { id: 'ting', text: '听', glossEs: 'escuchar', role: 'verb' },
  { id: 'pao', text: '跑', glossEs: 'correr', role: 'verb' },
  { id: 'wan', text: '玩', glossEs: 'jugar', role: 'verb' },
  { id: 'zai', text: '在', glossEs: 'estar (gerundio)', role: 'aux' },
  { id: 'shui', text: '水', glossEs: 'agua', role: 'object' },
  { id: 'fan', text: '饭', glossEs: 'arroz / comida', role: 'object' },
  { id: 'cha', text: '茶', glossEs: 'té', role: 'object' },
  { id: 'shu', text: '书', glossEs: 'libro', role: 'object' },
  { id: 'yinyue', text: '音乐', glossEs: 'música', role: 'object' },
];

/**
 * Ocho frases. Las dos primeras son el nivel 1 y las demás entran en orden.
 * La 8.ª introduce el progresivo 在: 我在喝水 = "estoy bebiendo agua".
 */
const ZH_FRAMES: readonly SentenceFrame[] = [
  {
    id: 'zh-wo-he-shui',
    language: 'zh',
    order: 1,
    tokens: ['wo', 'he', 'shui'],
    es: 'Yo bebo agua',
    en: 'I drink water',
    emoji: '💧',
    level: 1,
  },
  {
    id: 'zh-wo-chi-fan',
    language: 'zh',
    order: 2,
    tokens: ['wo', 'chi', 'fan'],
    es: 'Yo como arroz',
    en: 'I eat rice',
    emoji: '🍚',
    level: 1,
  },
  {
    id: 'zh-wo-he-cha',
    language: 'zh',
    order: 3,
    tokens: ['wo', 'he', 'cha'],
    es: 'Yo bebo té',
    en: 'I drink tea',
    emoji: '🍵',
    level: 2,
  },
  {
    id: 'zh-wo-kan-shu',
    language: 'zh',
    order: 4,
    tokens: ['wo', 'kan', 'shu'],
    es: 'Yo leo un libro',
    en: 'I read a book',
    emoji: '📖',
    level: 3,
  },
  {
    id: 'zh-wo-ting-yinyue',
    language: 'zh',
    order: 5,
    tokens: ['wo', 'ting', 'yinyue'],
    es: 'Yo escucho música',
    en: 'I listen to music',
    emoji: '🎵',
    level: 4,
  },
  {
    id: 'zh-wo-pao',
    language: 'zh',
    order: 6,
    tokens: ['wo', 'pao'],
    es: 'Yo corro',
    en: 'I run',
    emoji: '🏃',
    level: 5,
  },
  {
    id: 'zh-wo-wan',
    language: 'zh',
    order: 7,
    tokens: ['wo', 'wan'],
    es: 'Yo juego',
    en: 'I play',
    emoji: '🧸',
    level: 6,
  },
  {
    id: 'zh-wo-zai-he-shui',
    language: 'zh',
    order: 8,
    tokens: ['wo', 'zai', 'he', 'shui'],
    es: 'Yo estoy bebiendo agua',
    en: 'I am drinking water',
    emoji: '💧',
    level: 7,
  },
];

// ============================================
// DATOS · JAPONÉS (prueba del orden SOV)
// ============================================

const JA_TOKENS: readonly SentenceToken[] = [
  { id: 'watashi', text: '私', glossEs: 'yo', role: 'subject' },
  { id: 'wa', text: 'は', glossEs: 'partícula de tema', role: 'particle' },
  { id: 'mizu', text: '水', glossEs: 'agua', role: 'object' },
  { id: 'wo', text: 'を', glossEs: 'partícula de objeto', role: 'particle' },
  { id: 'nomu', text: '飲む', glossEs: 'beber', role: 'verb' },
  { id: 'gohan', text: 'ご飯', glossEs: 'arroz / comida', role: 'object' },
  { id: 'taberu', text: '食べる', glossEs: 'comer', role: 'verb' },
  { id: 'ocha', text: 'お茶', glossEs: 'té', role: 'object' },
  { id: 'hon', text: '本', glossEs: 'libro', role: 'object' },
  { id: 'yomu', text: '読む', glossEs: 'leer', role: 'verb' },
  { id: 'ongaku', text: '音楽', glossEs: 'música', role: 'object' },
  { id: 'kiku', text: '聞く', glossEs: 'escuchar', role: 'verb' },
];

const JA_FRAMES: readonly SentenceFrame[] = [
  {
    id: 'ja-watashi-wa-mizu-wo-nomu',
    language: 'ja',
    order: 1,
    tokens: ['watashi', 'wa', 'mizu', 'wo', 'nomu'],
    es: 'Yo bebo agua',
    en: 'I drink water',
    emoji: '💧',
    level: 1,
  },
  {
    id: 'ja-watashi-wa-gohan-wo-taberu',
    language: 'ja',
    order: 2,
    tokens: ['watashi', 'wa', 'gohan', 'wo', 'taberu'],
    es: 'Yo como arroz',
    en: 'I eat rice',
    emoji: '🍚',
    level: 1,
  },
  {
    id: 'ja-watashi-wa-ocha-wo-nomu',
    language: 'ja',
    order: 3,
    tokens: ['watashi', 'wa', 'ocha', 'wo', 'nomu'],
    es: 'Yo bebo té',
    en: 'I drink tea',
    emoji: '🍵',
    level: 2,
  },
  {
    id: 'ja-watashi-wa-hon-wo-yomu',
    language: 'ja',
    order: 4,
    tokens: ['watashi', 'wa', 'hon', 'wo', 'yomu'],
    es: 'Yo leo un libro',
    en: 'I read a book',
    emoji: '📖',
    level: 3,
  },
  {
    id: 'ja-watashi-wa-ongaku-wo-kiku',
    language: 'ja',
    order: 5,
    tokens: ['watashi', 'wa', 'ongaku', 'wo', 'kiku'],
    es: 'Yo escucho música',
    en: 'I listen to music',
    emoji: '🎵',
    level: 4,
  },
];

// ============================================
// DATOS · INGLÉS (prueba de fichas con espacios)
// ============================================

const EN_TOKENS: readonly SentenceToken[] = [
  { id: 'i', text: 'I', glossEs: 'yo', role: 'subject' },
  { id: 'drink', text: 'drink', glossEs: 'beber', role: 'verb' },
  { id: 'eat', text: 'eat', glossEs: 'comer', role: 'verb' },
  { id: 'read', text: 'read', glossEs: 'leer', role: 'verb' },
  { id: 'listen', text: 'listen', glossEs: 'escuchar', role: 'verb' },
  { id: 'play', text: 'play', glossEs: 'jugar', role: 'verb' },
  { id: 'water', text: 'water', glossEs: 'agua', role: 'object' },
  { id: 'rice', text: 'rice', glossEs: 'arroz', role: 'object' },
  { id: 'book', text: 'book', glossEs: 'libro', role: 'object' },
  { id: 'music', text: 'music', glossEs: 'música', role: 'object' },
  { id: 'a', text: 'a', glossEs: 'un / una', role: 'article' },
  { id: 'to', text: 'to', glossEs: 'a (preposición)', role: 'particle' },
];

const EN_FRAMES: readonly SentenceFrame[] = [
  {
    id: 'en-i-drink-water',
    language: 'en',
    order: 1,
    tokens: ['i', 'drink', 'water'],
    es: 'Yo bebo agua',
    en: 'I drink water',
    emoji: '💧',
    level: 1,
  },
  {
    id: 'en-i-eat-rice',
    language: 'en',
    order: 2,
    tokens: ['i', 'eat', 'rice'],
    es: 'Yo como arroz',
    en: 'I eat rice',
    emoji: '🍚',
    level: 1,
  },
  {
    id: 'en-i-read-a-book',
    language: 'en',
    order: 3,
    tokens: ['i', 'read', 'a', 'book'],
    es: 'Yo leo un libro',
    en: 'I read a book',
    emoji: '📖',
    level: 2,
  },
  {
    id: 'en-i-listen-to-music',
    language: 'en',
    order: 4,
    tokens: ['i', 'listen', 'to', 'music'],
    es: 'Yo escucho música',
    en: 'I listen to music',
    emoji: '🎵',
    level: 3,
  },
  {
    id: 'en-i-play',
    language: 'en',
    order: 5,
    tokens: ['i', 'play'],
    es: 'Yo juego',
    en: 'I play',
    emoji: '🧸',
    level: 4,
  },
];

// ============================================
// ÍNDICES
// ============================================

export const SENTENCE_DECKS: Readonly<Record<SentenceLanguage, SentenceDeck>> = {
  zh: { language: 'zh', tokens: ZH_TOKENS, frames: ZH_FRAMES },
  ja: { language: 'ja', tokens: JA_TOKENS, frames: JA_FRAMES },
  en: { language: 'en', tokens: EN_TOKENS, frames: EN_FRAMES },
};

export function sentenceDeck(language: SentenceLanguage): SentenceDeck {
  return SENTENCE_DECKS[language];
}

export function sentenceToken(deck: SentenceDeck, id: string): SentenceToken {
  const token = deck.tokens.find(t => t.id === id);
  if (!token) {
    throw new Error(`[sentence-builder] ${deck.language}: no existe la ficha "${id}"`);
  }
  return token;
}

/** Texto completo de la frase, con espacios solo en inglés. */
export function sentenceText(deck: SentenceDeck, frame: SentenceFrame): string {
  const sep = deck.language === 'en' ? ' ' : '';
  return frame.tokens.map(id => sentenceToken(deck, id).text).join(sep);
}

// ============================================
// NIVELES
// ============================================

export interface SentenceKnob {
  /** Cuántos frames del mazo entran en juego (por `order`). */
  poolSize: number;
  /** Fichas de más en la bandeja, para que no baste con descartar. */
  extraTokens: number;
  /** N10: los vencidos del SRS mandan (lo aplica el componente). */
  reviewFirst: boolean;
}

/**
 * Una sola perilla por salto:
 *  - N1–N7: entra una frase nueva cada nivel.
 *  - N8: +1 ficha de más.
 *  - N9: +1 ficha de más.
 *  - N10: repaso.
 */
const SENTENCE_LEVELS: readonly SentenceKnob[] = [
  { poolSize: 2, extraTokens: 0, reviewFirst: false },
  { poolSize: 3, extraTokens: 0, reviewFirst: false },
  { poolSize: 4, extraTokens: 0, reviewFirst: false },
  { poolSize: 5, extraTokens: 0, reviewFirst: false },
  { poolSize: 6, extraTokens: 0, reviewFirst: false },
  { poolSize: 7, extraTokens: 0, reviewFirst: false },
  { poolSize: 8, extraTokens: 0, reviewFirst: false },
  { poolSize: 8, extraTokens: 1, reviewFirst: false },
  { poolSize: 8, extraTokens: 2, reviewFirst: false },
  { poolSize: 8, extraTokens: 2, reviewFirst: true },
];

export function sentenceKnobFor(level: number): SentenceKnob {
  const i = Math.min(SENTENCE_LEVELS.length, Math.max(1, Math.round(level))) - 1;
  return SENTENCE_LEVELS[i]!;
}

/** Frames disponibles en un nivel, recortados al tamaño real del mazo. */
export function sentencePool(language: SentenceLanguage, level: number): readonly SentenceFrame[] {
  const deck = sentenceDeck(language);
  const knob = sentenceKnobFor(level);
  const ordered = [...deck.frames].sort((a, b) => a.order - b.order);
  return ordered.slice(0, Math.min(knob.poolSize, ordered.length));
}

// ============================================
// GENERADOR
// ============================================

export type Rng = () => number;

export interface SentenceProblem {
  language: SentenceLanguage;
  frame: SentenceFrame;
  /** Fichas correctas, en el orden que hay que construir. */
  target: readonly SentenceToken[];
  /** Bandeja inicial, barajada: target + fichas de más. */
  tray: readonly SentenceToken[];
  /** Frase en el idioma del prompt. */
  prompt: string;
  promptLang: SentencePromptLanguage;
  /** A los 4 años la frase se dice; a los 6 se lee. */
  autoAudio: boolean;
}

export interface SentenceProblemOptions {
  /** Repaso: si está en el pool, es la frase obligatoria. */
  forced?: string;
  /** Frase que acaba de salir: no se repite si hay alternativa. */
  avoidId?: string;
  promptLang?: SentencePromptLanguage;
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

function tokensFor(deck: SentenceDeck, ids: readonly string[]): SentenceToken[] {
  return ids.map(id => sentenceToken(deck, id));
}

/**
 * Construye un problema de frase.
 *
 * `age` solo decide si el prompt se oye (4) o se lee (6). El orden y las fichas son
 * independientes de la edad.
 */
export function buildSentenceProblem(
  language: SentenceLanguage,
  level: number,
  age: 4 | 6,
  rng: Rng = Math.random,
  opts: SentenceProblemOptions = {},
): SentenceProblem {
  const lvl = Math.min(SENTENCE_MAX_LEVEL, Math.max(1, Math.round(level)));
  const deck = sentenceDeck(language);
  const knob = sentenceKnobFor(lvl);
  const pool = sentencePool(language, lvl);

  if (pool.length < 2) {
    throw new Error(
      `[sentence-builder] ${language} N${lvl}: el pool tiene ${pool.length} frase(s); hacen falta al menos 2`,
    );
  }

  let frame: SentenceFrame | undefined;
  if (opts.forced) frame = pool.find(f => f.id === opts.forced);
  if (!frame) {
    const sinRepetir = pool.filter(f => f.id !== opts.avoidId);
    const candidatas = sinRepetir.length > 0 ? sinRepetir : pool;
    frame = candidatas[Math.floor(rng() * candidatas.length)]!;
  }

  const target = tokensFor(deck, frame.tokens);
  const enFrases = new Set(frame.tokens);
  const disponibles = deck.tokens.filter(t => !enFrases.has(t.id));
  const extra = Math.min(knob.extraTokens, disponibles.length);
  const distractores = shuffle(disponibles, rng).slice(0, extra);
  const tray = shuffle([...target, ...distractores], rng);

  const promptLang = opts.promptLang ?? 'es';
  return {
    language,
    frame,
    target,
    tray,
    prompt: frame[promptLang],
    promptLang,
    autoAudio: age < 6,
  };
}

// ============================================
// VALIDACIÓN
// ============================================

export interface SentenceOrderCheck {
  correct: boolean;
  /** Índice de la primera ficha que no coincide; `null` si todo está bien. */
  firstWrongIndex: number | null;
}

/**
 * Valida el **orden exacto**, no solo que estén todas las fichas.
 *
 * Si falta una ficha, el primer error es la primera posición vacía; si sobra, la
 * primera ficha que no debería estar.
 */
export function checkSentenceOrder(
  frame: SentenceFrame,
  placedIds: readonly string[],
): SentenceOrderCheck {
  const comunes = Math.min(frame.tokens.length, placedIds.length);
  for (let i = 0; i < comunes; i++) {
    if (frame.tokens[i] !== placedIds[i]) {
      return { correct: false, firstWrongIndex: i };
    }
  }
  if (placedIds.length !== frame.tokens.length) {
    return { correct: false, firstWrongIndex: comunes };
  }
  return { correct: true, firstWrongIndex: null };
}

/**
 * Errores de configuración de un mazo. Se usa en tests y queda disponible para el
 * laboratorio de desarrollo.
 */
export function validateSentenceDeck(deck: SentenceDeck): string[] {
  const errores: string[] = [];
  const tokenIds = new Set<string>();

  for (const token of deck.tokens) {
    if (!token.id.trim()) errores.push('ficha sin id');
    if (tokenIds.has(token.id)) errores.push(`ficha duplicada: ${token.id}`);
    tokenIds.add(token.id);
    if (!token.text.trim()) errores.push(`ficha ${token.id} sin texto`);
    if (!token.glossEs.trim()) errores.push(`ficha ${token.id} sin glosa`);
  }

  if (deck.frames.length < 2) errores.push('el mazo necesita al menos 2 frases');

  const frameIds = new Set<string>();
  const orders = new Set<number>();
  const usadas = new Set<string>();

  for (const frame of deck.frames) {
    if (!frame.id.trim()) errores.push('frase sin id');
    if (frameIds.has(frame.id)) errores.push(`frase duplicada: ${frame.id}`);
    frameIds.add(frame.id);
    if (frame.language !== deck.language) {
      errores.push(`frase ${frame.id}: idioma ${frame.language} en mazo ${deck.language}`);
    }
    if (frame.order <= 0) errores.push(`frase ${frame.id}: order inválido`);
    if (orders.has(frame.order)) errores.push(`frase ${frame.id}: order duplicado ${frame.order}`);
    orders.add(frame.order);
    if (frame.level < 1 || frame.level > SENTENCE_MAX_LEVEL) {
      errores.push(`frase ${frame.id}: level fuera de rango`);
    }
    if (!frame.es.trim()) errores.push(`frase ${frame.id}: falta traducción es`);
    if (!frame.en.trim()) errores.push(`frase ${frame.id}: falta traducción en`);
    if (!frame.emoji.trim()) errores.push(`frase ${frame.id}: falta emoji`);
    if (frame.tokens.length < 2) errores.push(`frase ${frame.id}: menos de 2 fichas`);
    if (new Set(frame.tokens).size !== frame.tokens.length) {
      errores.push(`frase ${frame.id}: ficha repetida en la secuencia`);
    }
    for (const id of frame.tokens) {
      if (!tokenIds.has(id)) errores.push(`frase ${frame.id}: ficha desconocida "${id}"`);
      usadas.add(id);
    }
  }

  for (const token of deck.tokens) {
    if (!usadas.has(token.id)) errores.push(`ficha sin uso: ${token.id}`);
  }

  return errores;
}
