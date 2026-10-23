/**
 * Composición de kanji: cómo se forman los caracteres compuestos.
 *
 * Tradición: adaptación lúdica del enfoque de reconocimiento de componentes
 * (doc. Zvonkin §B.6 "Robot Aki: Radicompuestos" y §C.4 "Construye el Carácter").
 *
 * Decisión de contenido: solo japonés (Sakura 🌸, lecturas en hiragana + audio ja-JP).
 * El mundo chino (Dragón) se retiró; los datos `pinyin` se conservan por si vuelve.
 *
 * Las descomposiciones son canónicas (radical + radical), no invenciones:
 *   明 = 日 + 月   休 = 亻 + 木   林 = 木 + 木   岩 = 山 + 石   男 = 田 + 力
 *   本 = 木 + 一   尖 = 小 + 大   炎 = 火 + 火   星 = 日 + 生   看 = 手 + 目
 *   森 = 木 + 木 + 木   語 = 言 + 五 + 口
 *
 * Lógica pura, sin Angular.
 */

import { Rng } from '../games/problem-picker';

// ============================================
// TIPOS
// ============================================

/** Cómo se colocan las piezas: sirve para dar pistas sin deletrear la respuesta */
export type PieceLayout =
  | 'left-right'   // una a la izquierda, otra a la derecha
  | 'top-bottom'    // una encima, otra debajo
  | 'tree'          // una encima, dos abajo (bosque)
  | 'left-surround';// una a la izquierda, dos apiladas a la derecha

export interface KanjiPiece {
  /**
   * Nombre estable de la pieza. Es también el **nombre de fichero** del clip de audio
   * (`kc.ja.p.<id>.wav`), así que cambiarlo cambia la voz.
   *
   * Antes no existía y se usaba la clave del catálogo, lo que obligaba a inventar
   * sufijos: había `ko` (子, niño) y `ko_` (小, pequeño), y `hi_` (火) / `oo` (大). Con dos
   * piezas que empiezan igual, un `ko` mal escrito rompe el audio en silencio.
   */
  id: string;
  kanji: string;
  reading: string;      // hiragana (japonés). Es lo que se enseña y lo que va al TTS.
  pinyin: string;       // mandarín
  meaning: string;      // español, para la pantalla (puede llevar comas: "sol, día")
  /**
   * El significado **solo para el TTS**. Sin comas sueltas ni emojis: un motor de voz
   * intentaría leerlos en voz alta ("sol, día" → "sol coma día").
   */
  meaningTts: string;
  emoji: string;
}

/** Una pieza colocada: `x`/`y` son coordenadas normalizadas 0..1 dentro del marco */
export interface PieceSlot {
  kanji: string;
  x: number;
  y: number;
}

export interface KanjiComposition {
  id: string;
  kanji: string;
  /**
   * La palabra que la niña **ya conoce**, en hiragana: `あかるい`, `やすむ`, `はやし`.
   *
   * Antes era el on'yomi en katakana (`メイ`, `キュウ`), que es justo lo que la de 6 años
   * olvida y lo que la de 4 no puede leer. Cambiarlo no es cosmético: el juego pasa a
   * enseñar una palabra del idioma en vez de una lectura erudita.
   */
  reading: string;
  pinyin: string;
  meaning: string;
  /** Significado solo para TTS (sin comas sueltas). */
  meaningTts: string;
  emoji: string;
  /** La historia de por qué se forma así. Es la enseñanza, no la instrucción. */
  story: string;
  /**
   * La misma historia **para el TTS**: sin emojis ni kanji. Si se mandara `story`, el
   * motor español intentaría leer "☀️" y "明" en voz alta, que es ruido puro.
   */
  storyTts: string;
  /** Número aproximado de trazos, para la fase de dibujo */
  strokeCount: number;
  layout: PieceLayout;
  /** Posiciones de las piezas, en orden de lectura visual */
  slots: PieceSlot[];
  minAge: 4 | 6;
  /**
   * Kanji que se obtienen con las MISMAS piezas en otra posición.
   * Es el mejor recurso socrático del juego: no hay un error, hay otros personajes.
   */
  siblings?: { kanji: string; reading: string; meaning: string }[];
}

// ============================================
// CATÁLOGO
// ============================================

/**
 * Catálogo de piezas.
 *
 * Cada clave es el `id` de la pieza. Los ids se eligen por lo que significan, no por lo que
 * empiezan a parecerse: `ko` (niño) y `chiisai` (pequeño) conviven sin ambigüedad, mientras
 * que `ko`/`ko_` obligaban a recordar cuál tenía el guion.
 *
 * ⚠️ 日 (hi, sol) y 火 (hi-fire, fuego) se leen **igual**: `ひ`. Es correcto, no es un
 * error. Se distinguen por el significado y el emoji, y el juego nunca las pone como
 * opciones una de otra (ver `kanji-recall.ts`). El audio las hace idénticas a propósito.
 */
const P = {
  hi:       { id: 'hi',       kanji: '日', reading: 'ひ',      pinyin: 'rì',  meaning: 'sol, día',       meaningTts: 'sol',              emoji: '☀️' },
  tsuki:    { id: 'tsuki',    kanji: '月', reading: 'つき',    pinyin: 'yuè', meaning: 'luna, mes',      meaningTts: 'luna',             emoji: '🌙' },
  hito:     { id: 'hito',     kanji: '亻', reading: 'にんべん', pinyin: 'rén', meaning: 'persona',       meaningTts: 'persona',          emoji: '🧍' },
  ki:       { id: 'ki',       kanji: '木', reading: 'き',      pinyin: 'mù',   meaning: 'árbol',          meaningTts: 'árbol',            emoji: '🌳' },
  yama:     { id: 'yama',     kanji: '山', reading: 'やま',    pinyin: 'shān',meaning: 'montaña',        meaningTts: 'montaña',          emoji: '⛰️' },
  ishi:     { id: 'ishi',     kanji: '石', reading: 'いし',    pinyin: 'shí',  meaning: 'piedra',         meaningTts: 'piedra',           emoji: '🪨' },
  ta:       { id: 'ta',       kanji: '田', reading: 'た',      pinyin: 'tián', meaning: 'campo de arroz', meaningTts: 'campo de arroz',   emoji: '🌾' },
  chikara:  { id: 'chikara',  kanji: '力', reading: 'ちから',  pinyin: 'lì',   meaning: 'fuerza',         meaningTts: 'fuerza',           emoji: '💪' },
  onna:     { id: 'onna',     kanji: '女', reading: 'おんな',  pinyin: 'nǚ',   meaning: 'mujer',          meaningTts: 'mujer',            emoji: '👧' },
  ko:       { id: 'ko',       kanji: '子', reading: 'こ',      pinyin: 'zǐ',   meaning: 'niño',           meaningTts: 'niño',             emoji: '👶' },
  ichi:     { id: 'ichi',     kanji: '一', reading: 'いち',    pinyin: 'yī',   meaning: 'uno',            meaningTts: 'uno',              emoji: '1️⃣' },
  // `ちい` estaba truncado: 小 es "pequeño" y su adverbio es ちいさい.
  chiisai:  { id: 'chiisai',  kanji: '小', reading: 'ちいさい', pinyin: 'xiǎo', meaning: 'pequeño',        meaningTts: 'pequeño',          emoji: '🔹' },
  ookii:    { id: 'ookii',    kanji: '大', reading: 'おおきい', pinyin: 'dà',   meaning: 'grande',          meaningTts: 'grande',           emoji: '🔶' },
  // Homófono de 日: los dos se leen ひ.
  hi_fire:  { id: 'hi-fire',  kanji: '火', reading: 'ひ',      pinyin: 'huǒ',  meaning: 'fuego',          meaningTts: 'fuego',            emoji: '🔥' },
  sei:      { id: 'sei',      kanji: '生', reading: 'うまれる', pinyin: 'shēng',meaning: 'nacer, vida',    meaningTts: 'nacer',            emoji: '🌱' },
  // El guion de `い-う` rompía el TTS (lo leía como "i-guion-u") y se veía en pantalla.
  iu:       { id: 'iu',       kanji: '言', reading: 'いう',    pinyin: 'yán',  meaning: 'hablar',         meaningTts: 'hablar',           emoji: '💬' },
  itsutsu:  { id: 'itsutsu',  kanji: '五', reading: 'いつつ',  pinyin: 'wǔ',   meaning: 'cinco',          meaningTts: 'cinco',            emoji: '5️⃣' },
  kuchi:    { id: 'kuchi',    kanji: '口', reading: 'くち',    pinyin: 'kǒu',  meaning: 'boca',           meaningTts: 'boca',             emoji: '👄' },
  te:       { id: 'te',       kanji: '手', reading: 'て',      pinyin: 'shǒu', meaning: 'mano',           meaningTts: 'mano',             emoji: '✋' },
  me:       { id: 'me',       kanji: '目', reading: 'め',      pinyin: 'mù',   meaning: 'ojo',            meaningTts: 'ojo',              emoji: '👀' },
} satisfies Record<string, KanjiPiece>;

export const KANJI_COMPOSITIONS: readonly KanjiComposition[] = [
  // ---------- 4 años: dos piezas, causa evidente ----------
  {
    id: 'mei',
    kanji: '明',
    reading: 'あかるい',
    pinyin: 'míng',
    meaning: 'luminoso, claro',
    meaningTts: 'claro, luminoso',
    emoji: '💡',
    story: 'Cuando sale el sol ☀️ y está la luna 🌙 a la vez, se ve clarísimo. Así dibujamos 明 para decir "claro".',
    storyTts: 'Cuando sale el sol y también está la luna, todo se ve clarísimo. Sol y luna juntos quieren decir: claro, luminoso.',
    strokeCount: 8,
    layout: 'left-right',
    slots: [
      { kanji: P.hi.kanji, x: 0.29, y: 0.5 },
      { kanji: P.tsuki.kanji, x: 0.71, y: 0.5 },
    ],
    minAge: 4,
  },
  {
    id: 'kyuu',
    kanji: '休',
    reading: 'やすむ',
    pinyin: 'xiū',
    meaning: 'descansar',
    meaningTts: 'descansar',
    emoji: '😌',
    story: 'Una persona 🧍 apoyada en un árbol 🌳… ¡así se descansa! El árbol sostiene a la persona, por eso este kanji significa "descansar".',
    storyTts: 'Una persona apoyada en un árbol: así se descansa. El árbol sostiene a la persona. Por eso significa descansar.',
    strokeCount: 6,
    layout: 'left-right',
    slots: [
      { kanji: P.hito.kanji, x: 0.27, y: 0.5 },
      { kanji: P.ki.kanji, x: 0.69, y: 0.5 },
    ],
    minAge: 4,
  },
  {
    id: 'rin',
    kanji: '林',
    reading: 'はやし',
    pinyin: 'lín',
    meaning: 'arboleda (dos árboles)',
    meaningTts: 'arboleda',
    emoji: '🌲',
    story: 'Un árbol solo 🌳 es un árbol. Dos 木 ya son una arboleda 🌲. Pero si le sumas un tercero, sale 森, que sí es un bosque de verdad.',
    storyTts: 'Un árbol solo es un árbol. Dos árboles juntos ya son un bosque pequeño.',
    strokeCount: 8,
    layout: 'left-right',
    slots: [
      { kanji: P.ki.kanji, x: 0.3, y: 0.5 },
      { kanji: P.ki.kanji, x: 0.7, y: 0.5 },
    ],
    minAge: 4,
  },
  {
    id: 'iwa',
    kanji: '岩',
    reading: 'いわ',
    pinyin: 'yán',
    meaning: 'roca',
    meaningTts: 'roca',
    emoji: '🪨',
    story: 'Una montaña ⛰️ y una piedra 🪨: la piedra que vive en la montaña es una roca.',
    storyTts: 'Una montaña y una piedra. La piedra que vive en la montaña es una roca.',
    strokeCount: 8,
    layout: 'top-bottom',
    slots: [
      { kanji: P.yama.kanji, x: 0.5, y: 0.29 },
      { kanji: P.ishi.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 4,
  },
  {
    id: 'otoko',
    kanji: '男',
    reading: 'おとこ',
    pinyin: 'nán',
    meaning: 'hombre',
    meaningTts: 'hombre',
    emoji: '👨',
    story: 'En el campo de arroz 🌾 hace falta fuerza 💪. El campo arriba y la fuerza abajo: eso es el hombre que trabaja la tierra.',
    storyTts: 'En el campo de arroz hace falta fuerza. El campo arriba y la fuerza abajo: el hombre que trabaja la tierra.',
    strokeCount: 7,
    layout: 'top-bottom',
    slots: [
      { kanji: P.ta.kanji, x: 0.5, y: 0.31 },
      { kanji: P.chikara.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 4,
  },
  {
    id: 'koi',
    kanji: '好',
    reading: 'すき',
    pinyin: 'hǎo',
    meaning: 'bueno, querer',
    meaningTts: 'querer',
    emoji: '💞',
    story: 'Una mujer 👧 y su niño 👶. En chino y japonés esta pareja significa "querer" o "estar bien".',
    storyTts: 'Una mujer y su niño juntos. Esta pareja significa querer, o estar bien.',
    strokeCount: 6,
    layout: 'left-right',
    slots: [
      { kanji: P.onna.kanji, x: 0.29, y: 0.5 },
      { kanji: P.ko.kanji, x: 0.71, y: 0.5 },
    ],
    minAge: 4,
  },

  // ---------- 6 años: el giro de "la posición importa" ----------
  {
    id: 'hon',
    kanji: '本',
    // Sin on'yomi: en 本 la lectura erudita (ホン) y la palabra (ほん) son distintas,
    // pero la palabra es la que se enseña, así que añadirla solo sería ruido.
    reading: 'ほん',
    pinyin: 'běn',
    meaning: 'libro, raíz, origen',
    meaningTts: 'libro, raíz, origen',
    emoji: '📕',
    story: 'Un árbol 🌳 con un uno 1️⃣ marcado en la BASE, donde nacen las raíces. El uno señala la raíz, y de ahí viene "origen".',
    storyTts: 'Un árbol con una rayita en la base, justo donde nacen las raíces. La rayita señala la raíz: el origen.',
    strokeCount: 5,
    layout: 'top-bottom',
    slots: [
      { kanji: P.ki.kanji, x: 0.5, y: 0.43 },
      { kanji: P.ichi.kanji, x: 0.5, y: 0.79 },
    ],
    minAge: 6,
    // Lecturas en hiragana, no en katakana: マツ/ミ eran justo lo que se olvidaba.
    siblings: [
      { kanji: '末', reading: 'すえ', meaning: 'punta de la rama' },
      { kanji: '未', reading: 'まだ', meaning: 'aún no, retoño' },
    ],
  },
  {
    id: 'sen',
    kanji: '尖',
    reading: 'とがる',
    pinyin: 'jiān',
    meaning: 'puntiagudo',
    meaningTts: 'puntiagudo',
    emoji: '📐',
    story: 'Lo pequeño 🔹 encima de lo grande 🔶 hace una punta afilada. Por eso 尖 es "puntiagudo".',
    storyTts: 'Lo pequeño encima de lo grande hace una punta afilada. Por eso significa puntiagudo.',
    strokeCount: 6,
    layout: 'top-bottom',
    slots: [
      { kanji: P.chiisai.kanji, x: 0.5, y: 0.31 },
      { kanji: P.ookii.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 6,
  },
  {
    id: 'en',
    kanji: '炎',
    reading: 'ほのお',
    pinyin: 'yán',
    meaning: 'llama',
    meaningTts: 'llama',
    emoji: '🔥',
    story: 'Fuego 🔥 encima de fuego 🔥. El fuego de arriba salta al de abajo y los dos juntos arden más: una llama.',
    storyTts: 'Fuego encima de fuego. Los dos juntos arden más: una llama.',
    strokeCount: 8,
    layout: 'top-bottom',
    slots: [
      { kanji: P.hi_fire.kanji, x: 0.5, y: 0.29 },
      { kanji: P.hi_fire.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 6,
  },
  {
    id: 'hoshi',
    kanji: '星',
    reading: 'ほし',
    pinyin: 'xīng',
    meaning: 'estrella',
    meaningTts: 'estrella',
    emoji: '⭐',
    story: 'El sol ☀️ que ilumina, y debajo algo que "nace" 🌱 como una planta. El sol viendo crecer la vida: una estrella brillando en el cielo.',
    storyTts: 'El sol que ilumina y, debajo, algo que nace como una planta. El sol viendo crecer la vida: una estrella brillando en el cielo.',
    strokeCount: 9,
    layout: 'top-bottom',
    slots: [
      { kanji: P.hi.kanji, x: 0.5, y: 0.3 },
      { kanji: P.sei.kanji, x: 0.5, y: 0.72 },
    ],
    minAge: 6,
  },
  {
    id: 'miran',
    kanji: '看',
    reading: 'みる',
    pinyin: 'kàn',
    meaning: 'mirar',
    meaningTts: 'mirar',
    emoji: '👀',
    // 看 se compone de 手 (mano) ARRIBA y 目 (ojo) ABAJO: la mano tapa el ojo para
    // alejar el sol y poder ver lejos. No es "una mano sobre los ojos" como se leía antes.
    story: 'Una mano ✋ arriba tapa el ojo 👀 de abajo. Así tapas el sol para ver más lejos. Eso es mirar.',
    storyTts: 'Una mano tapa los ojos, como cuando te tapas el sol para mirar de lejos. Eso es mirar.',
    strokeCount: 9,
    layout: 'top-bottom',
    slots: [
      { kanji: P.te.kanji, x: 0.5, y: 0.3 },
      { kanji: P.me.kanji, x: 0.5, y: 0.72 },
    ],
    minAge: 6,
  },
  {
    id: 'mori',
    kanji: '森',
    reading: 'もり',
    pinyin: 'sēn',
    meaning: 'bosque profundo',
    meaningTts: 'bosque',
    emoji: '🌳',
    story: 'Un árbol 🌳 y debajo dos árboles más 🌳🌳. Tres 木 juntos: un bosque tan grande que parece un laberinto.',
    storyTts: 'Tres árboles juntos: un bosque tan grande y profundo que parece un laberinto.',
    strokeCount: 12,
    layout: 'tree',
    slots: [
      { kanji: P.ki.kanji, x: 0.5, y: 0.26 },
      { kanji: P.ki.kanji, x: 0.3, y: 0.72 },
      { kanji: P.ki.kanji, x: 0.7, y: 0.72 },
    ],
    minAge: 6,
    siblings: [{ kanji: '林', reading: 'はやし', meaning: 'arboleda de dos árboles' }],
  },
  {
    id: 'go',
    kanji: '語',
    reading: 'ご',
    pinyin: 'yǔ',
    meaning: 'palabra, idioma',
    meaningTts: 'palabra, idioma',
    emoji: '💬',
    story: 'Hablar 💬 es una boca 👄 que dice un cinco 5️⃣. La boca que dice "cinco" es una palabra.',
    storyTts: 'Hablar es una boca que dice un cinco. La boca que dice cinco forma una palabra.',
    strokeCount: 14,
    layout: 'left-surround',
    slots: [
      { kanji: P.iu.kanji, x: 0.23, y: 0.5 },
      { kanji: P.itsutsu.kanji, x: 0.71, y: 0.3 },
      { kanji: P.kuchi.kanji, x: 0.71, y: 0.72 },
    ],
    minAge: 6,
  },
] as const;

/** Índice por id, para no andar buscando con `find` */
const BY_ID = new Map(KANJI_COMPOSITIONS.map(c => [c.id, c]));

export function getComposition(id: string): KanjiComposition | undefined {
  return BY_ID.get(id);
}

// ============================================
// ESCALADO POR NIVEL
// ============================================

/**
 * Qué kanji se **introduce** en cada bloque de niveles. Se acumulan (`poolFor`), así que
 * cada fila son *los nuevos de aquí en adelante* y nada se olvida al subir.
 *
 * Antes había una sola fila a los 4 años —mismos 6 kanji siempre— y filas que
 * **reemplazaban** a 6 años: en el nivel 9 solo quedaban 森 y 語. Subir de nivel así no
 * es progresar, es cambiar de bolsa de cartón y tirar la anterior.
 */
const AGE4_LEVELS: ReadonlyArray<{ fromLevel: number; ids: readonly string[] }> = [
  { fromLevel: 1, ids: ['mei', 'kyuu'] },
  { fromLevel: 3, ids: ['rin', 'iwa'] },
  { fromLevel: 5, ids: ['otoko', 'koi'] },
];

const AGE6_LEVELS: ReadonlyArray<{ fromLevel: number; ids: readonly string[] }> = [
  { fromLevel: 1, ids: ['mei', 'kyuu', 'rin', 'iwa'] },
  { fromLevel: 3, ids: ['otoko', 'koi'] },
  { fromLevel: 5, ids: ['hoshi', 'hon', 'miran'] },
  { fromLevel: 7, ids: ['sen', 'en'] },
  { fromLevel: 9, ids: ['mori', 'go'] },
];

/**
 * Perillas de dificultad, **una por salto**.
 *
 * Antes se decidían a la vez desde una sola expresión (`guided = age <= 4 || lvl < 5`),
 * con el resultado de que a los 6 años el nivel 5 cambiaba a la vez el kanji, metía
 * distractores y quitaba la guía. Eso no es dificultad creciente: es un acantilado.
 *
 * Reglas que comprueba el test:
 *   · el fantasma nunca se enciende de nuevo ni los distractores bajan;
 *   · **cada cambio de nivel altera exactamente una de las dos perillas**.
 *
 * `ghost` es 1 → fantasma opaco, 0 → no se pinta. Se lleva al color y no a la opacidad
 * porque `.ghost` ya es un blanco al 9 %: multiplicarlo por 0.3 habría dejado el
 * fantasma en el 2.7 %, invisible. Se atenúa el alfa en su lugar.
 */
const AGE4_DIFFICULTY: ReadonlyArray<{ fromLevel: number; ghost: number; distractors: number }> = [
  // Orden de los cambios: — (solo entran kanji nuevos), fantasma, distractores, fantasma.
  // El nivel 3 no toca ninguna perilla: el dificultad nueva ES 林 y 岩, que ya es bastante.
  // Como son 4 saltos y hay 4 cambios que hacer, la distribución queda fijada por la resta.
  { fromLevel: 1, ghost: 1.0, distractors: 0 },
  { fromLevel: 3, ghost: 1.0, distractors: 0 },
  { fromLevel: 5, ghost: 0.5, distractors: 0 },
  { fromLevel: 7, ghost: 0.5, distractors: 1 },
  { fromLevel: 9, ghost: 0.0, distractors: 1 },
];

const AGE6_DIFFICULTY: ReadonlyArray<{ fromLevel: number; ghost: number; distractors: number }> = [
  // Orden de los cambios: fantasma, distractores, fantasma, distractores.
  // Quien ya lee se enfrenta pronto a una pieza que no es, y la ayuda visual —que es la
  // que a los 4 años es imprescindible— se retira antes y se agota un nivel antes.
  { fromLevel: 1, ghost: 1.0, distractors: 0 },
  { fromLevel: 3, ghost: 0.5, distractors: 0 },
  { fromLevel: 5, ghost: 0.5, distractors: 1 },
  { fromLevel: 7, ghost: 0.0, distractors: 1 },
  { fromLevel: 9, ghost: 0.0, distractors: 2 },
];

export const MAX_LEVEL = 10;

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(level, MAX_LEVEL));
}

/**
 * Kanji disponibles para una edad. `minAge` significa "edad mínima", así que un kanji
 * marcado como 4 lo juega también la niña de 6: los dos tableros arrancan con los
 * mismos caracteres, pero ella avanza antes —llega a 13— mientras la de 4 se queda en
 * 6 y pasa los últimos niveles en repaso de lo ya visto.
 */
export function compositionsForAge(age: number): readonly KanjiComposition[] {
  const effectiveAge = age <= 4 ? 4 : 6;
  return KANJI_COMPOSITIONS.filter(c => c.minAge <= effectiveAge);
}

/**
 * Kanji que puede tocar el problema de `level`, **acumulativo**: `⋃ filas ≤ level`.
 *
 * Devuelve `string[]` porque el orden es parte del contrato: `pickComposition` se apoya
 * en él y un test fija qué id está en cada posición.
 */
export function poolFor(age: number, level: number): readonly string[] {
  const table = age <= 4 ? AGE4_LEVELS : AGE6_LEVELS;
  const pool: string[] = [];
  for (const row of table) {
    if (level < row.fromLevel) break;
    for (const id of row.ids) if (!pool.includes(id)) pool.push(id);
  }
  return pool;
}

/** Los que **acaban de llegar** en este nivel, y los que ya se habían visto. */
export function poolSplit(
  age: number,
  level: number,
): { nuevos: readonly string[]; repaso: readonly string[] } {
  const table = age <= 4 ? AGE4_LEVELS : AGE6_LEVELS;
  let ultima = table[0]!;
  for (const row of table) if (level >= row.fromLevel) ultima = row;

  const todos = poolFor(age, level);
  const nuevos = ultima.ids.filter(id => todos.includes(id));
  return { nuevos, repaso: todos.filter(id => !nuevos.includes(id)) };
}

/** Opacidad del fantasma (1 opaco … 0 ausente) y distractores de la bandeja. */
export function difficultyFor(
  age: number,
  level: number,
): { ghost: number; distractors: number } {
  const table = age <= 4 ? AGE4_DIFFICULTY : AGE6_DIFFICULTY;
  let ultima = table[0]!;
  for (const row of table) if (level >= row.fromLevel) ultima = row;
  return { ghost: ultima.ghost, distractors: ultima.distractors };
}

/**
 * Elige el kanji del problema.
 *
 * **60 % de lo nuevo / 40 % de repaso** (§3.2). El reparto es necesario aunque el pool
 * ya sea acumulado: con 13 kanji repartidos parejos a nivel 9, 森 y 語 —los de 3
 * piezas, los que abren el nivel— saldrían 1 de cada 13 y nunca se llegaría a
 * sentirse. A la inversa, solo elegir nuevo sería olvidar todo lo anterior.
 *
 * `vencidos` (§5.4) es lo que convierte ese 40 % en repaso de verdad. Sin él, "repasar"
 * significa "algo que ya se vio", elegido al azar entre todos; con él, cuando el hueco
 * es de repaso **y** hay kanjis con el repaso vencido, gana el más atrasado de ellos, y
 * los demás esperan su turno. El orden de `vencidos` importa y lo pone `due()`.
 *
 * Algo se puede quedar sin repasar en una ronda: si hay dos vencidos solo sale uno. Eso
 * está bien. El SRS no decide nada de una vez, solo empuja; el resto es que hay más
 * rondas.
 */
export function pickComposition(
  level: number,
  age: number,
  rng: Rng = Math.random,
  vencidos: readonly string[] = [],
): KanjiComposition {
  const lvl = clampLevel(level);
  const { nuevos, repaso } = poolSplit(age, lvl);

  // Si no hay nada nuevo toca repasar; si no hay repaso toca lo nuevo; si hay los dos,
  // 60/40. Se deja en un booleano y no en una lista porque el SRS necesita saber si el
  // hueco era de repaso para poder mandar en él.
  const tocaRepaso = repaso.length === 0
    ? false
    : nuevos.length === 0
      ? true
      : rng() >= 0.6;

  if (tocaRepaso) {
    const vencido = vencidos.find(id => repaso.includes(id));
    if (vencido) return BY_ID.get(vencido)!;
  }

  const lista = tocaRepaso ? repaso : nuevos;
  const id = lista[Math.floor(rng() * lista.length)]!;
  return BY_ID.get(id)!;
}

// ============================================
// PROBLEMA
// ============================================

export interface TrayPiece extends KanjiPiece {
  /** Id único: la bandeja puede llevar varios 木 iguales */
  trayId: string;
  /** Si es una pieza que pertenece al objetivo */
  correct: boolean;
}

export interface CompositionProblem {
  target: KanjiComposition;
  /** Huecos a rellenar, en orden de lectura visual */
  slots: readonly PieceSlot[];
  /** Piezas de la bandeja, barajadas */
  tray: readonly TrayPiece[];
  /** ¿Se muestra el kanji fantasma como guía? */
  showGhost: boolean;
  /**
   * Intensidad del fantasma, 1 opaco … 0 ausente. Va aparte de `showGhost` porque el
   * andamiaje **se retira por capas** con el nivel en vez de saltar a cero: un problema
   * puede tener `showGhost: true` y ya estar muy desvanecido.
   */
  ghost: number;
  /** Número de distractores en la bandeja */
  distractors: number;
}

/**
 * Monta el problema de un nivel.
 *
 * La dificultad no se decide aquí: viene de `difficultyFor`, que separa las dos
 * perillas y garantiza que solo una se mueve por salto. Lo que sí toca esta función es
 * que **ningún distractor sea una pieza que pide el objetivo**, que sería ambiguo.
 */
export function buildCompositionProblem(
  level: number,
  age: number,
  rng: Rng = Math.random,
  /** Kanjis con el repaso vencido, el más atrasado primero. Ver `pickComposition`. */
  vencidos: readonly string[] = [],
): CompositionProblem {
  const lvl = clampLevel(level);
  const { ghost, distractors: nDistractors } = difficultyFor(age, lvl);

  const target = pickComposition(lvl, age, rng, vencidos);

  // Piezas correctas: puede haber repetidas (林 = 木+木, 炎 = 火+火)
  const correct = target.slots.map((s, i) => ({
    ...pieceData(s.kanji),
    trayId: `ok-${i}`,
    correct: true,
  }));

  // Distractores: piezas de OTROS kanji del catálogo, que nunca forman parte del objetivo
  const pool = KANJI_COMPOSITIONS.filter(
    c => c.id !== target.id && !target.slots.some(s => s.kanji === c.slots[0]?.kanji),
  );

  const distractors: TrayPiece[] = [];
  const used = new Set<string>();
  let guard = 0;
  while (distractors.length < nDistractors && guard++ < 60) {
    const c = pool[Math.floor(rng() * pool.length)];
    if (!c) break;
    const kanji = c.slots[Math.floor(rng() * c.slots.length)]!.kanji;
    if (used.has(kanji) || target.slots.some(s => s.kanji === kanji)) continue;
    used.add(kanji);
    distractors.push({ ...pieceData(kanji), trayId: `no-${distractors.length}`, correct: false });
  }

  return {
    target,
    slots: target.slots,
    tray: shuffle([...correct, ...distractors], rng),
    showGhost: ghost > 0,
    ghost,
    distractors: distractors.length,
  };
}

const PIECE_TABLE: Record<string, KanjiPiece> = Object.values(P).reduce<Record<string, KanjiPiece>>(
  (acc, piece) => {
    acc[piece.kanji] = piece;
    return acc;
  },
  {},
);

/** Datos de una pieza a partir de su kanji. Si el kanji no está en la tabla, se degrada. */
export function pieceData(kanji: string): KanjiPiece {
  return PIECE_TABLE[kanji] ?? { kanji, reading: '', pinyin: '', meaning: '', emoji: '❓' };
}

// ============================================
// VALIDACIÓN Y DIÁLOGOS SOCRÁTICOS
// ============================================

/** Situaciones que puede vivir la niña. No hay "correcto/incorrecto", hay preguntas. */
export type SocraticMoment =
  | 'wrong-piece'
  | 'right-pieces-wrong-place'
  | 'complete'
  | 'draw-done'
  | 'sibling-discovery'
  | 'stroke-retry';

/**
 * Nunca se dice "está mal". Se propone pensar: contraejemplos, dudas y "probemos".
 * Textos cortos porque van en pantalla, no leídos por la madre.
 */
export const SOCRATIC_LINES: Record<SocraticMoment, readonly string[]> = {
  'wrong-piece': [
    '🤔 ¿Y esta pieza aquí? ¿Qué le pasa si la probamos en otro hueco?',
    '🤔 Interesante… ¿cuál de las dos se parece más al dibujo de la pista?',
    '🤔 ¿Tal vez esta no va aquí? ¿Qué pasaría si la giramos o la cambiamos?',
  ],
  'right-pieces-wrong-place': [
    '🤔 ¡Son las piezas correctas! Pero mira las dos posiciones… ¿y si las cambiamos?',
    '🤔 Las tenemos todas. ¿Dónde va cada una? Probemos las dos maneras.',
    '🤔 Casi… ¿qué cambia si esta sube y esta baja?',
  ],
  complete: [
    '🎉 ¡Se formó! ¿Y qué significará?',
    '🌟 ¡Lo hiciste! Mira cómo las piezas cuentan una historia.',
    '👏 ¡Claro! ¿Quieres ver otro?',
  ],
  'draw-done': [
    '✏️ ¡Lo dibujaste! ¿Qué le pasa si le quitamos una línea?',
    '🎨 Mira tu dibujo. ¿Se parece al de las piezas? ¿En qué se diferencia?',
    '🌱 Cada vez lo dibujas con más seguridad.',
  ],
  'sibling-discovery': [
    '🤯 ¡Mira! Con las MISMAS piezas salen otros kanji. Solo cambia dónde las pones.',
    '🤔 Con estas piezas también se puede… ¿qué cambia? Solo la posición.',
    '😮 ¡Dos personajes distintos con las mismas piezas! ¿Cuál te gusta más?',
  ],
  'stroke-retry': [
    '✏️ ¿Probamos ese trazo otra vez? ¿Por dónde empieza?',
    '🤔 ¿Hacia dónde va? Mira la línea amarilla.',
    '✨ ¡Casi! ¿Lo trazamos siguiendo la línea?',
  ],
};

// ============================================
// UTILIDADES
// ============================================

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickLine(moment: SocraticMoment, rng: Rng = Math.random): string {
  const pool = SOCRATIC_LINES[moment];
  return pool[Math.floor(rng() * pool.length)]!;
}