import { MATH_GAMES } from './math-game';
import { JAPANESE_GAMES } from './japanese-game';
import { CHINESE_GAMES } from './chinese-game';

/**
 * Todos los juegos, por materia.
 *
 * `ProfileStateService` (desbloqueos, nivel actual) y el dashboard (sugerencias de la
 * pausa) lo recorren: un juego que exista en su carpeta pero no esté aquí no tiene
 * nivel guardado ni aparece en ninguna lista.
 */
export const ALL_GAMES = [...MATH_GAMES, ...JAPANESE_GAMES, ...CHINESE_GAMES];
