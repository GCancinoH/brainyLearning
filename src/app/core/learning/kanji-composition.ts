/**
 * Composición de kanji: cómo se forman los caracteres compuestos.
 *
 * Tradición: adaptación lúdica del enfoque de reconocimiento de componentes
 * (doc. Zvonkin §B.6 "Robot Aki: Radicompuestos" y §C.4 "Construye el Carácter").
 *
 * Decisión de contenido importante: los kanji son **hanZi compartidos** entre japonés y
 * chino, así que el mismo carácter sirve a las dos lenguas. Para evitar la colisión que
 * advierte el documento entre los dos mundos, lo que cambia es laenvoltura:
 *   - Sakura 🌸 (japonés): lecturas en hiragana + audio ja-JP
 *   - Dragón 🐉 (chino): pinyin + audio zh-CN
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

/**
 * Los kanji son hanZi compartidos entre japonés y chino, así que el mismo carácter sirve a
 * las dos lenguas. Lo que cambia es la envoltura, para que no se mezclen los dos mundos:
 *   - Sakura 🌸 (japonés): lecturas en hiragana + audio ja-JP, lo guía el Robot Aki
 *   - Dragón 🐉 (chino): pinyin + audio zh-CN, lo guía el Sabio Long
 */
export type Script = 'japanese' | 'chinese';

/** Cómo se colocan las piezas: sirve para dar pistas sin deletrear la respuesta */
export type PieceLayout =
  | 'left-right'   // una a la izquierda, otra a la derecha
  | 'top-bottom'    // una encima, otra debajo
  | 'tree'          // una encima, dos abajo (bosque)
  | 'left-surround';// una a la izquierda, dos apiladas a la derecha

export interface KanjiPiece {
  kanji: string;
  reading: string;      // hiragana (japonés)
  pinyin: string;       // mandarín
  meaning: string;      // español
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
  reading: string;
  pinyin: string;
  meaning: string;
  emoji: string;
  /** La historia de por qué se forma así. Es la enseñanza, no la instrucción. */
  story: string;
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

const P = {
  hi: { kanji: '日', reading: 'ひ', pinyin: 'rì', meaning: 'sol, día', emoji: '☀️' },
  tsuki: { kanji: '月', reading: 'つき', pinyin: 'yuè', meaning: 'luna, mes', emoji: '🌙' },
  hito: { kanji: '亻', reading: 'にんべん', pinyin: 'rén', meaning: 'persona', emoji: '🧍' },
  ki: { kanji: '木', reading: 'き', pinyin: 'mù', meaning: 'árbol', emoji: '🌳' },
  yama: { kanji: '山', reading: 'やま', pinyin: 'shān', meaning: 'montaña', emoji: '⛰️' },
  ishi: { kanji: '石', reading: 'いし', pinyin: 'shí', meaning: 'piedra', emoji: '🪨' },
  ta: { kanji: '田', reading: 'た', pinyin: 'tián', meaning: 'campo de arroz', emoji: '🌾' },
  chikara: { kanji: '力', reading: 'ちから', pinyin: 'lì', meaning: 'fuerza', emoji: '💪' },
  onna: { kanji: '女', reading: 'おんな', pinyin: 'nǚ', meaning: 'mujer', emoji: '👧' },
  ko: { kanji: '子', reading: 'こ', pinyin: 'zǐ', meaning: 'niño', emoji: '👶' },
  ichi: { kanji: '一', reading: 'いち', pinyin: 'yī', meaning: 'uno', emoji: '1️⃣' },
  ko_: { kanji: '小', reading: 'ちい', pinyin: 'xiǎo', meaning: 'pequeño', emoji: '🔹' },
  oo: { kanji: '大', reading: 'おおきい', pinyin: 'dà', meaning: 'grande', emoji: '🔶' },
  hi_: { kanji: '火', reading: 'ひ', pinyin: 'huǒ', meaning: 'fuego', emoji: '🔥' },
  sei: { kanji: '生', reading: 'うまれる', pinyin: 'shēng', meaning: 'nacer, vida', emoji: '🌱' },
  iu: { kanji: '言', reading: 'い-う', pinyin: 'yán', meaning: 'hablar', emoji: '💬' },
  itsutsu: { kanji: '五', reading: 'いつつ', pinyin: 'wǔ', meaning: 'cinco', emoji: '5️⃣' },
  kuchi: { kanji: '口', reading: 'くち', pinyin: 'kǒu', meaning: 'boca', emoji: '👄' },
  te: { kanji: '手', reading: 'て', pinyin: 'shǒu', meaning: 'mano', emoji: '✋' },
  me: { kanji: '目', reading: 'め', pinyin: 'mù', meaning: 'ojo', emoji: '👀' },
} satisfies Record<string, KanjiPiece>;

export const KANJI_COMPOSITIONS: readonly KanjiComposition[] = [
  // ---------- 4 años: dos piezas, causa evidente ----------
  {
    id: 'mei',
    kanji: '明',
    reading: 'メイ',
    pinyin: 'míng',
    meaning: 'luminoso, claro',
    emoji: '💡',
    story: 'Cuando sale el sol ☀️ y está la luna 🌙 a la vez, se ve clarísimo. Los japoneses escribieron 明 para decir "claro".',
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
    reading: 'キュウ',
    pinyin: 'xiū',
    meaning: 'descansar',
    emoji: '😌',
    story: 'Una persona 🧍 apoyada en un árbol 🌳… ¡así se descansa! El árbol sostiene a la persona, por eso este kanji significa "descansar".',
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
    reading: 'リン',
    pinyin: 'lín',
    meaning: 'arboleda (dos árboles)',
    emoji: '🌲',
    story: 'Un árbol solo 🌳 es un árbol. Dos 木 ya son una arboleda 🌲. Pero si le sumas un tercero, sale 森, que sí es un bosque de verdad.',
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
    reading: 'ガン',
    pinyin: 'yán',
    meaning: 'roca',
    emoji: '🪨',
    story: 'Una montaña ⛰️ y una piedra 🪨: la piedra que vive en la montaña es una roca.',
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
    reading: 'ダン',
    pinyin: 'nán',
    meaning: 'hombre',
    emoji: '👨',
    story: 'En el campo de arroz 🌾 hace falta fuerza 💪. El campo arriba y la fuerza abajo: eso es el hombre que trabaja la tierra.',
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
    reading: 'コウ',
    pinyin: 'hǎo',
    meaning: 'bueno, querer',
    emoji: '💞',
    story: 'Una mujer 👧 y su niño 👶. En chino y japonés esta pareja significa "querer" o "estar bien".',
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
    reading: 'ホン',
    pinyin: 'běn',
    meaning: 'libro, raíz, origen',
    emoji: '📕',
    story: 'Un árbol 🌳 con un uno 1️⃣ marcado en la BASE, donde nacen las raíces. El uno señala la raíz, y de ahí viene "origen".',
    strokeCount: 5,
    layout: 'top-bottom',
    slots: [
      { kanji: P.ki.kanji, x: 0.5, y: 0.43 },
      { kanji: P.ichi.kanji, x: 0.5, y: 0.79 },
    ],
    minAge: 6,
    siblings: [
      { kanji: '末', reading: 'マツ', meaning: 'punta de la rama' },
      { kanji: '未', reading: 'ミ', meaning: 'aún no, retoño' },
    ],
  },
  {
    id: 'sen',
    kanji: '尖',
    reading: 'セン',
    pinyin: 'jiān',
    meaning: 'puntiagudo',
    emoji: '📐',
    story: 'Lo pequeño 🔹 encima de lo grande 🔶 hace una punta afilada. Por eso 尖 es "puntiagudo".',
    strokeCount: 6,
    layout: 'top-bottom',
    slots: [
      { kanji: P.ko_.kanji, x: 0.5, y: 0.31 },
      { kanji: P.oo.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 6,
  },
  {
    id: 'en',
    kanji: '炎',
    reading: 'エン',
    pinyin: 'yán',
    meaning: 'llama',
    emoji: '🔥',
    story: 'Fuego 🔥 encima de fuego 🔥. El fuego de arriba salta al de abajo y los dos juntos arden más: una llama.',
    strokeCount: 8,
    layout: 'top-bottom',
    slots: [
      { kanji: P.hi_.kanji, x: 0.5, y: 0.29 },
      { kanji: P.hi_.kanji, x: 0.5, y: 0.71 },
    ],
    minAge: 6,
  },
  {
    id: 'hoshi',
    kanji: '星',
    reading: 'セイ',
    pinyin: 'xīng',
    meaning: 'estrella',
    emoji: '⭐',
    story: 'El sol ☀️ que ilumina, y debajo algo que "nace" 🌱 como una planta. El sol viendo crecer la vida: una estrella brillando en el cielo.',
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
    reading: 'カン',
    pinyin: 'kàn',
    meaning: 'mirar',
    emoji: '👀',
    story: 'Una mano ✋ tapando los ojos 👀. Cuando tapas y destapas rápido, lo que hay delante lo estás "mirando".',
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
    reading: 'シン',
    pinyin: 'sēn',
    meaning: 'bosque profundo',
    emoji: '🌳',
    story: 'Un árbol 🌳 y debajo dos árboles más 🌳🌳. Tres 木 juntos: un bosque tan grande que parece un laberinto.',
    strokeCount: 12,
    layout: 'tree',
    slots: [
      { kanji: P.ki.kanji, x: 0.5, y: 0.26 },
      { kanji: P.ki.kanji, x: 0.3, y: 0.72 },
      { kanji: P.ki.kanji, x: 0.7, y: 0.72 },
    ],
    minAge: 6,
    siblings: [{ kanji: '林', reading: 'リン', meaning: 'arboleda de dos árboles' }],
  },
  {
    id: 'go',
    kanji: '語',
    reading: 'ゴ',
    pinyin: 'yǔ',
    meaning: 'palabra, idioma',
    emoji: '💬',
    story: 'Hablar 💬 es una boca 👄 que dice un cinco 5️⃣. La boca que dice "cinco" es una palabra.',
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
 * Tablas explícitas en vez de "filtrar por complejidad": hace el test trivial
 * (cada nivel devuelve siempre un id válido y con la edad correcta) y deja el
 * criterio pedagógico a la vista.
 */
const AGE4_LEVELS: ReadonlyArray<{ fromLevel: number; ids: readonly string[] }> = [
  { fromLevel: 1, ids: ['mei', 'kyuu', 'rin', 'iwa', 'otoko', 'koi'] },
];

const AGE6_LEVELS: ReadonlyArray<{ fromLevel: number; ids: readonly string[] }> = [
  { fromLevel: 1, ids: ['mei', 'kyuu', 'rin', 'iwa'] },
  { fromLevel: 5, ids: ['otoko', 'hoshi', 'hon', 'sen', 'en', 'miran'] },
  { fromLevel: 9, ids: ['mori', 'go'] },
];

export const MAX_LEVEL = 10;

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(level, MAX_LEVEL));
}

/**
 * Kanji disponibles para una edad. `minAge` significa "edad mínima", así que un kanji
 * marcado como 4 lo juega también la niña de 6 (que es quien empieza en los niveles 1-4
 * con los mismos caracteres, pero sin distractores y con más cosas que deducir).
 */
export function compositionsForAge(age: number): readonly KanjiComposition[] {
  const effectiveAge = age <= 4 ? 4 : 6;
  return KANJI_COMPOSITIONS.filter(c => c.minAge <= effectiveAge);
}

function poolFor(age: number, level: number): readonly string[] {
  const table = age <= 4 ? AGE4_LEVELS : AGE6_LEVELS;
  let pool = table[0]!.ids;
  for (const row of table) {
    if (level >= row.fromLevel) pool = row.ids;
  }
  return pool;
}

/**
 * Elige el kanji del nivel. A partir del nivel 9 solo entran los de 3 piezas, así que
 * la composición en 3 dimensiones es una escalada explícita y no una casualidad.
 */
export function pickComposition(level: number, age: number, rng: Rng = Math.random): KanjiComposition {
  const lvl = clampLevel(level);
  const pool = poolFor(age, lvl);
  const id = pool[Math.floor(rng() * pool.length)]!;
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
  /** Número de distractores en la bandeja */
  distractors: number;
}

/**
 * Monta el problema de un nivel.
 *
 * - 4 años (y niveles 1-4 de 6 años): SIN distractores y con guía fantasma. La niña ve
 *   exactamente cuántas piezas y dónde; el reto es la manipulación y el descubrimiento
 *   de la historia, no la deducción.
 * - 6 años desde el nivel 5: con distractores y sin guía. Aquí sí hay que deducir qué
 *   pieza va en cada hueco.
 */
export function buildCompositionProblem(
  level: number,
  age: number,
  rng: Rng = Math.random,
): CompositionProblem {
  const lvl = clampLevel(level);
  const young = age <= 4;
  const guided = young || lvl < 5;

  const target = pickComposition(lvl, age, rng);

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
  const nDistractors = guided ? 0 : Math.min(3, Math.max(2, target.slots.length));

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
    showGhost: guided,
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
  | 'sibling-discovery';

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