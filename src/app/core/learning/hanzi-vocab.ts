/**
 * Mazos de vocabulario Hanzi (Planeta Dragón 🐉 — Sabio Long).
 *
 * Datos puros, sin Angular. Los consumen `hanzi-colors`, `hanzi-animals`,
 * `hanzi-nature`, `hanzi-family` y `hanzi-listening`, que comparten motor (§3 del plan).
 *
 * REGLAS DE LOS IDS
 *  - Son pinyin **sin tono y solo ASCII** (`hong`, `lv`): son nombre de fichero de audio y
 *    clave del SRS. **Nunca se muestran**: mezclar pinyin con hanzi en pantalla rompería
 *    la Plantilla 6 del método (dos sistemas de escritura a la vez).
 *  - `confusable` agrupa palabras que comparten componente (红/绿 → 纟; 猫/狗/猪 → 犭;
 *    牛/羊 → cuernos; 海/河/沙 → 氵; 妈/姐/妹 → 女). En los niveles altos los distractores
 *    salen primero de aquí, para que la niña tenga que mirar el glifo y no descartar por
 *    descarte.
 *
 * Hanzi **simplificado**, igual que el resto del Planeta Dragón.
 *
 * D6 · INTERFERENCIA CON JAPONÉS
 * Naturaleza evita a propósito 日 月 木 火 水 山 (y el resto de caracteres que ya viven en
 * `kanji-compose`). No se avisa de un choque: se evita. El mismo dibujo con otro sonido
 * es una interferencia real a los 4–6 años, así que este mazo usa vocabulario que no
 * aparece en el Planeta Sakura.
 */

/** Mazo jugable. `listening` se deriva de todos ellos en el juego de escucha. */
export type HanziDeck = 'colors' | 'animals' | 'nature' | 'family';

export interface HanziVocabItem {
  /** 'hong'. Pinyin sin tono, ASCII, nombre de clip. Nunca se muestra. */
  id: string;
  deck: HanziDeck;
  /** Orden de aparición dentro del mazo (1 = primero que se enseña). */
  order: number;
  /** Carácter simplificado: '红'. */
  hanzi: string;
  /** Pictograma que se usa como imagen: '🔴'. */
  emoji: string;
  /** Nombre en español, solo para aria-label y lectores de 6 años. */
  es: string;
  /** Grupo de distractores parecidos (comparten componente). */
  confusable?: string;
  /** Solo colores: valor CSS para la muestra / cohete. */
  cssColor?: string;
}

/**
 * Colores (6). El color se reconoce sin leer, así que es el mazo de entrada a los 4 años.
 * `cssColor` es el tono de la muestra; el hanzi puede ir teñido con él hasta el N4.
 */
export const HANZI_COLORS: readonly HanziVocabItem[] = [
  { id: 'hong', deck: 'colors', order: 1, hanzi: '红', emoji: '🔴', es: 'rojo', confusable: 'silk', cssColor: '#ef4444' },
  { id: 'huang', deck: 'colors', order: 2, hanzi: '黄', emoji: '🟡', es: 'amarillo', cssColor: '#facc15' },
  { id: 'lan', deck: 'colors', order: 3, hanzi: '蓝', emoji: '🔵', es: 'azul', confusable: 'grass', cssColor: '#3b82f6' },
  { id: 'lv', deck: 'colors', order: 4, hanzi: '绿', emoji: '🟢', es: 'verde', confusable: 'silk', cssColor: '#22c55e' },
  { id: 'bai', deck: 'colors', order: 5, hanzi: '白', emoji: '⚪', es: 'blanco', cssColor: '#f8fafc' },
  { id: 'hei', deck: 'colors', order: 6, hanzi: '黑', emoji: '⚫', es: 'negro', cssColor: '#1e293b' },
];

/**
 * Animales (8). En simplificado 鸟, 鱼 y 马 ya no parecen el animal: el pictograma es el
 * emoji y el hanzi es "su nombre en el Planeta Dragón". No se promete adivinar por forma.
 */
export const HANZI_ANIMALS: readonly HanziVocabItem[] = [
  { id: 'mao', deck: 'animals', order: 1, hanzi: '猫', emoji: '🐱', es: 'gato', confusable: 'dog' },
  { id: 'gou', deck: 'animals', order: 2, hanzi: '狗', emoji: '🐶', es: 'perro', confusable: 'dog' },
  { id: 'yu', deck: 'animals', order: 3, hanzi: '鱼', emoji: '🐟', es: 'pez' },
  { id: 'niao', deck: 'animals', order: 4, hanzi: '鸟', emoji: '🐦', es: 'pájaro' },
  { id: 'ma', deck: 'animals', order: 5, hanzi: '马', emoji: '🐴', es: 'caballo' },
  { id: 'niu', deck: 'animals', order: 6, hanzi: '牛', emoji: '🐮', es: 'vaca', confusable: 'horn' },
  { id: 'yang', deck: 'animals', order: 7, hanzi: '羊', emoji: '🐑', es: 'oveja', confusable: 'horn' },
  { id: 'zhu', deck: 'animals', order: 8, hanzi: '猪', emoji: '🐷', es: 'cerdo', confusable: 'dog' },
];

/**
 * Naturaleza (8). Elegidos a propósito SIN solapar caracteres con el catálogo japonés
 * (`kanji-compose`): 日 月 木 火 水 山 石 田 火 生 言 五 口 手 目 女 子 小 大 星 雨 雪 空 虹 etc.
 * 云 风 海 河 岛 草 沙 天 — ninguno está en japonés. D6 resuelto por diseño.
 *
 * Orden de presentación pensado para 4 años: lo más "tangible" primero (mar, río, isla),
 * luego lo atmosférico (cielo, nube, viento) y tierra (hierba, arena). Confusibles:
 * - water: 海/河/沙 (氵)
 * - sky: 云/天
 */
export const HANZI_NATURE: readonly HanziVocabItem[] = [
  { id: 'yun', deck: 'nature', order: 1, hanzi: '云', emoji: '☁️', es: 'nube', confusable: 'sky' },
  { id: 'feng', deck: 'nature', order: 2, hanzi: '风', emoji: '🌬️', es: 'viento' },
  { id: 'hai', deck: 'nature', order: 3, hanzi: '海', emoji: '🌊', es: 'mar', confusable: 'water' },
  { id: 'he', deck: 'nature', order: 4, hanzi: '河', emoji: '🏞️', es: 'río', confusable: 'water' },
  { id: 'dao', deck: 'nature', order: 5, hanzi: '岛', emoji: '🏝️', es: 'isla' },
  { id: 'cao', deck: 'nature', order: 6, hanzi: '草', emoji: '🌿', es: 'hierba' },
  { id: 'sha', deck: 'nature', order: 7, hanzi: '沙', emoji: '🏖️', es: 'arena', confusable: 'water' },
  { id: 'tian', deck: 'nature', order: 8, hanzi: '天', emoji: '🌌', es: 'cielo', confusable: 'sky' },
];

/**
 * Familia (6). Palabras de dos caracteres (reduplicados), como pide el plan: 爸爸/妈妈,
 * 哥哥/姐姐/弟弟/妹妹. No se incluye 我 (abstracto) ni el árbol genealógico (caro);
 * esos quedan para un pulido posterior. El componente 女 aparece en 妈/姐/妹 → grupo
 * 'female'. Los masculinos no comparten componente, así que no hay grupo 'male'.
 */
export const HANZI_FAMILY: readonly HanziVocabItem[] = [
  { id: 'baba', deck: 'family', order: 1, hanzi: '爸爸', emoji: '👨', es: 'papá' },
  { id: 'mama', deck: 'family', order: 2, hanzi: '妈妈', emoji: '👩', es: 'mamá', confusable: 'female' },
  { id: 'gege', deck: 'family', order: 3, hanzi: '哥哥', emoji: '👦', es: 'hermano mayor' },
  { id: 'jiejie', deck: 'family', order: 4, hanzi: '姐姐', emoji: '👧', es: 'hermana mayor', confusable: 'female' },
  { id: 'didi', deck: 'family', order: 5, hanzi: '弟弟', emoji: '🧒', es: 'hermano menor' },
  { id: 'meimei', deck: 'family', order: 6, hanzi: '妹妹', emoji: '👶', es: 'hermana menor', confusable: 'female' },
];

/** Todos los items de los mazos jugables, en orden de mazo. */
export const HANZI_VOCAB: readonly HanziVocabItem[] = [
  ...HANZI_COLORS,
  ...HANZI_ANIMALS,
  ...HANZI_NATURE,
  ...HANZI_FAMILY,
];

/** Índice por id para resolver el `forced` del SRS sin recorrer el array. */
export const HANZI_VOCAB_BY_ID: ReadonlyMap<string, HanziVocabItem> =
  new Map(HANZI_VOCAB.map(item => [item.id, item]));

/** Items de un mazo, ordenados por `order`. */
export function vocabForDeck(deck: HanziDeck): readonly HanziVocabItem[] {
  let source: readonly HanziVocabItem[];
  if (deck === 'colors') source = HANZI_COLORS;
  else if (deck === 'animals') source = HANZI_ANIMALS;
  else if (deck === 'nature') source = HANZI_NATURE;
  else source = HANZI_FAMILY;
  return [...source].sort((a, b) => a.order - b.order);
}
