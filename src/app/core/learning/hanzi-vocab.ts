/**
 * Mazos de vocabulario Hanzi (Planeta Dragón 🐉 — Sabio Long).
 *
 * Datos puros, sin Angular. Los consumen `hanzi-colors`, `hanzi-animals` y
 * `hanzi-listening`, que comparten motor (§3 del plan).
 *
 * REGLAS DE LOS IDS
 *  - Son pinyin **sin tono y solo ASCII** (`hong`, `lv`): son nombre de fichero de audio y
 *    clave del SRS. **Nunca se muestran**: mezclar pinyin con hanzi en pantalla rompería
 *    la Plantilla 6 del método (dos sistemas de escritura a la vez).
 *  - `confusable` agrupa palabras que comparten componente (红/绿 → 纟; 猫/狗/猪 → 犭;
 *    牛/羊 → cuernos). En los niveles altos los distractores salen primero de aquí, para
 *    que la niña tenga que mirar el glifo y no descartar por descarte.
 *
 * Hanzi **simplificado**, igual que el resto del Planeta Dragón.
 */

/** Mazo jugable original. `listening` se deriva de los dos en el juego de escucha. */
export type HanziDeck = 'colors' | 'animals';

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

/** Todos los items de los mazos jugables, en orden de mazo. */
export const HANZI_VOCAB: readonly HanziVocabItem[] = [...HANZI_COLORS, ...HANZI_ANIMALS];

/** Índice por id para resolver el `forced` del SRS sin recorrer el array. */
export const HANZI_VOCAB_BY_ID: ReadonlyMap<string, HanziVocabItem> =
  new Map(HANZI_VOCAB.map(item => [item.id, item]));

/** Items de un mazo, ordenados por `order`. */
export function vocabForDeck(deck: HanziDeck): readonly HanziVocabItem[] {
  const source = deck === 'colors' ? HANZI_COLORS : HANZI_ANIMALS;
  return [...source].sort((a, b) => a.order - b.order);
}
