export interface ChineseGameInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
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
];
