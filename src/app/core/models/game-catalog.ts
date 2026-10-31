import { MATH_GAMES } from './math-game';
import { JAPANESE_GAMES } from './japanese-game';
import { CHINESE_GAMES } from './chinese-game';
import { LearningCategory } from './learning-category';

/**
 * Todos los juegos, por materia.
 *
 * `ProfileStateService` (desbloqueos, nivel actual) y el dashboard (sugerencias de la
 * pausa) lo recorren: un juego que exista en su carpeta pero no esté aquí no tiene
 * nivel guardado ni aparece en ninguna lista.
 */
export const ALL_GAMES = [...MATH_GAMES, ...JAPANESE_GAMES, ...CHINESE_GAMES];

/** Juegos que ya tienen pantalla jugable. Los anunciados sin ruta no cuentan. */
export function availableGames(): typeof ALL_GAMES {
  return ALL_GAMES.filter(game => game.available !== false);
}

export function gamesByCategory(category: LearningCategory): typeof ALL_GAMES {
  return availableGames().filter(game => game.category === category);
}

/**
 * Nivel máximo de un juego, leído del catálogo.
 *
 * Los componentes ya no duplican `MAX_LEVEL = 20`: piden el dato aquí. Si el id no
 * existe es un error de programación (un typo silencioso haría que las insignias de
 * bronce/plata salieran en el nivel equivocado), así que se lanza en vez de adivinar.
 */
export function gameMaxLevel(gameId: string): number {
  const game = ALL_GAMES.find(g => g.id === gameId);
  if (!game) throw new Error(`[game-catalog] Juego desconocido: ${gameId}`);
  return game.maxLevel;
}
