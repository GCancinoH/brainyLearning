import { LearningCategory } from './learning-category';

export interface ChineseGameInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  /** Materia/mundo al que pertenece. */
  category: LearningCategory;
  /** Nivel máximo real del juego. La lógica del juego lo lee de aquí. */
  maxLevel: number;
  /** false = anunciado en el catálogo pero aún sin pantalla jugable. */
  available?: boolean;
  cssClass: string;
  unlockRequirement: {
    requiredGameId: string;
    requiredLevel: number;
    description: string;
  } | null;
  minAge?: 4 | 6;
  startLevel?: { 4: number; 6: number };
}

/**
 * Juegos del Planeta Dragón 🐉 (chino mandarín), con el Sabio Long.
 *
 * Mismo formato que `MATH_GAMES` y `JAPANESE_GAMES`: `ProfileStateService` los busca en
 * `ALL_GAMES` para saber si un juego está desbloquéado y en qué nivel va, así que un
 * juego que no esté en el catálogo existe pero se comporta como "sin nivel" y no aparece
 * en las sugerencias.
 *
 * Hanzi **simplificado** (语, no 語), como pide §5.12: es el chino que se escribe hoy.
 */
export const CHINESE_GAMES: ChineseGameInfo[] = [
  {
    id: 'hanzi-numbers',
    category: 'chinese',
    maxLevel: 12,
    title: 'Números Hanzi',
    description: 'Aprende el 1 al 20 y forma números más grandes agarrando sus hanzis',
    icon: '🐉',
    route: '/games/chinese/hanzi-numbers',
    cssClass: 'hanzi-numbers',
    // Sin candado: es el primer juego de chino que existe y no tiene con qué encadenarse.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-colors',
    category: 'chinese',
    maxLevel: 10,
    title: 'Colores en Hanzi',
    description: 'Escucha el color en chino y encuentra su hanzi',
    icon: '🎨',
    route: '/games/chinese/hanzi-colors',
    cssClass: 'hanzi-colors',
    // Sin candado, igual que `hanzi-numbers`: el mazo de colores es la puerta de entrada.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-animals',
    category: 'chinese',
    maxLevel: 10,
    title: 'Animales Hanzi',
    description: 'Descubre cómo se escribe cada animal en el Planeta Dragón',
    icon: '🐲',
    route: '/games/chinese/hanzi-animals',
    cssClass: 'hanzi-animals',
    // Sin candado: se puede aprender vocabulario de animales sin pasar por colores.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-nature',
    category: 'chinese',
    maxLevel: 10,
    title: 'Naturaleza en Hanzi',
    description: 'Aprende el nombre del mar, el cielo y la arena en el Planeta Dragón',
    icon: '🌿',
    route: '/games/chinese/hanzi-nature',
    cssClass: 'hanzi-nature',
    // Sin candado: se desbloquea junto a Animales, misma puerta de entrada.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-family',
    category: 'chinese',
    maxLevel: 10,
    title: 'Familia en Hanzi',
    description: 'Aprende a nombrar a tu familia en chino',
    icon: '👨‍👩‍👧‍👦',
    route: '/games/chinese/hanzi-family',
    cssClass: 'hanzi-family',
    // Sin candado: se desbloquea junto a Colores, misma puerta de entrada.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-actions',
    category: 'chinese',
    maxLevel: 10,
    title: 'Acciones en Hanzi',
    description: 'Aprende a decir comer, beber, correr y más en el Planeta Dragón',
    icon: '🏃',
    route: '/games/chinese/hanzi-actions',
    cssClass: 'hanzi-actions',
    // Sin candado: los verbos son la puerta al futuro juego de frases.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-sentences',
    category: 'chinese',
    maxLevel: 10,
    title: 'Frases en Hanzi',
    description: 'Ordena las fichas para decir yo bebo agua, yo como arroz y más',
    icon: '🧩',
    route: '/games/chinese/hanzi-sentences',
    cssClass: 'hanzi-sentences',
    // Sin candado: es un prototipo para probar el modelo de frases con las niñas.
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'hanzi-listening',
    category: 'chinese',
    maxLevel: 10,
    title: '¿Qué escuchaste? (chino)',
    description: 'Escucha una palabra en chino y toca la imagen',
    icon: '👂',
    route: '/games/chinese/hanzi-listening',
    cssClass: 'hanzi-listening',
    // Se abre con Colores para no preguntar palabras que aún no se han presentado.
    unlockRequirement: {
      requiredGameId: 'hanzi-colors',
      requiredLevel: 3,
      description: 'Llega al Nivel 3 en Colores en Hanzi',
    },
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
];
