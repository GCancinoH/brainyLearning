/**
 * Reglas puras de insignias: eventos + contadores → ids ganados.
 *
 * No hay Angular ni persistencia aquí. Eso permite probar la tabla completa de
 * eventos con vitest y mantener el servicio pequeño.
 *
 * ============================================
 * M8 — Tabla de instrumentación por juego (Fase C / F5)
 * ============================================
 * Todos los 15 juegos usan `RoundTracker` y llaman a:
 *   - `recordCorrect({ firstTry, perfectRound })`
 *   - `recordIncorrect()` cuando hay error real
 *   - `recordHelpUsed()` cuando se usa ayuda (botón 🔊 o pista)
 *
 * | Juego                    | firstTry | perfectRound | help-used | Notas                                    |
 * |--------------------------|----------|--------------|-----------|------------------------------------------|
 * | space-addition           | ✅       | ✅           | ❌        |                                          |
 * | space-subtraction        | ✅       | ✅           | ❌        |                                          |
 * | space-multiply           | ✅       | ✅           | ❌        | pista automática tras error (no cuenta)  |
 * | space-load-ship          | ✅       | ✅           | ❌        | 2 vías de error                          |
 * | space-fuel-tank          | ✅       | ✅           | ❌        | error = "no cabe" / combinación repetida |
 * | space-rescue-mission     | ✅       | ✅           | ❌        | error = plan equivocado                  |
 * | paths-bridges            | ✅       | ✅           | ❌        | bumps ≥ 3 = recordIncorrect              |
 * | coin-shop                | ✅       | ✅           | ❌        | error en 3 modos                         |
 * | logic-blocks             | ✅       | ✅           | ✅        | ladder de ayuda                          |
 * | hanzi-numbers            | ✅       | ✅           | ✅        | duda hablada = help-used                 |
 * | japanese-listening       | ✅       | ✅           | ❌        | fase guiada muestra pista automática     |
 * | japanese-nature          | ✅       | ✅           | ❌        |                                          |
 * | japanese-kanji-find      | ✅       | ✅           | ❌        |                                          |
 * | japanese-kanji-compose   | ✅       | ✅           | ✅        | ladder de ayuda                          |
 * | japanese-calendar        | ✅       | ✅           | ❌        |                                          |
 * | hanzi-colors             | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 * | hanzi-animals            | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 * | hanzi-nature             | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 * | hanzi-family             | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 * | hanzi-actions            | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 * | hanzi-listening          | ✅       | ✅           | ✅        | duda hablada / repetir = help-used       |
 *
 * Leyenda: ✅ = reporta correctamente, ❌ = no aplica / no implementado.
 * Mantener al día al añadir juegos o cambiar lógica de ayuda.
 */

import { SessionEvent } from '../games/game-types';
import { ALL_GAMES, gamesByCategory } from '../models/game-catalog';
import { LearningCategory } from '../models/learning-category';
import { BadgeStats } from './badge-types';
import {
  BADGE_BY_ID,
  categoryBadgeId,
  effortBadgeId,
  gameBadgeId,
  tierThresholds,
} from './badge-catalog';

export interface SavedGameProgress {
  level: number;
  completed: boolean;
  totalCorrect: number;
}

export interface BadgeRuleContext {
  age: number;
  /**
   * Hubo un error y todavía no llegó el acierto en esta sesión.
   *
   * No se mira "el evento anterior": `recordIncorrect()` emite `answer-incorrect` y
   * `streak-update` seguidos, así que el último evento ya no sería el error.
   */
  retryArmed?: boolean;
  /** Progreso ya guardado al empezar la sesión (para no perder insignias viejas). */
  savedProgress?: SavedGameProgress | null;
}

/** Fecha local en formato YYYY-MM-DD. No usa UTC: "hoy" es el día de la niña. */
export function localDateKey(timestamp: number): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

/**
 * Actualiza los contadores acumulados. Nunca resta ni rompe rachas.
 *
 * `retrySuccess` se incrementa aquí (no en `evaluate`) porque es un contador, no una
 * insignia: la insignia de 1/10/25 se decide después con el valor ya actualizado.
 */
export function updateBadgeStats(
  event: SessionEvent,
  stats: BadgeStats,
  ctx: BadgeRuleContext,
): BadgeStats {
  const next: BadgeStats = {
    ...stats,
    gamesPlayed: [...stats.gamesPlayed],
    daysPlayed: [...stats.daysPlayed],
    retrySuccess: stats.retrySuccess ?? 0,
    sessionsCompleted: stats.sessionsCompleted ?? 0,
    firstTryCorrect: stats.firstTryCorrect ?? 0,
    helpUsed: stats.helpUsed ?? 0,
    perfectRounds: stats.perfectRounds ?? 0,
  };

  if (event.type === 'session-start') {
    if (ALL_GAMES.some(g => g.id === event.gameId)) {
      next.gamesPlayed = addUnique(next.gamesPlayed, event.gameId);
    }
    next.daysPlayed = addUnique(next.daysPlayed, localDateKey(event.timestamp));
  }

  if (event.type === 'answer-correct') {
    // Reintento por dos vías, sin doble conteo:
    //  - `retryArmed`: el juego emitió `answer-incorrect` antes del acierto.
    //  - `firstTry === false`: el juego no emite errores (Hanzi/Kanji) pero sabe que
    //    esta ronda no salió al primer toque.
    const retried = ctx.retryArmed === true || event.payload?.['firstTry'] === false;
    if (retried) {
      next.retrySuccess = (next.retrySuccess ?? 0) + 1;
    }
    if (event.payload?.['firstTry'] === true) {
      next.firstTryCorrect = (next.firstTryCorrect ?? 0) + 1;
    }
    // Ronda perfecta: acertó sin haber usado ayuda y sin errores previos en esta ronda
    if (event.payload?.['perfectRound'] === true) {
      next.perfectRounds = (next.perfectRounds ?? 0) + 1;
    }
  }

  if (event.type === 'help-used') {
    next.helpUsed = (next.helpUsed ?? 0) + 1;
  }

  const reason = event.payload?.['reason'];
  if (
    event.type === 'time-up' ||
    (event.type === 'session-end' && (reason === 'complete' || reason === 'time-up'))
  ) {
    next.sessionsCompleted = (next.sessionsCompleted ?? 0) + 1;
  }

  return next;
}

/**
 * Devuelve los ids de insignias nuevas que desbloquea este evento.
 *
 * `earned` debe incluir lo ya ganado ANTES del evento. El resultado no repite ids y
 * solo contiene ids que existen en el catálogo.
 */
export function evaluateBadgeEvent(
  event: SessionEvent,
  stats: BadgeStats,
  earned: ReadonlySet<string>,
  ctx: BadgeRuleContext,
): string[] {
  const game = ALL_GAMES.find(g => g.id === event.gameId);
  if (!game) return [];

  const out = new Set<string>();
  const add = (id: string): void => {
    if (!earned.has(id) && BADGE_BY_ID.has(id)) out.add(id);
  };

  const thresholds = tierThresholds(game.maxLevel);

  if (event.type === 'session-start') {
    const saved = ctx.savedProgress;
    if (saved) {
      if (saved.totalCorrect > 0) add(gameBadgeId(game.id, 'seed'));
      if (saved.level >= thresholds.bronze) add(gameBadgeId(game.id, 'bronze'));
      if (saved.level >= thresholds.silver) add(gameBadgeId(game.id, 'silver'));
      if (saved.completed) add(gameBadgeId(game.id, 'gold'));
    }
  }

  if (event.type === 'answer-correct') {
    // La primera respuesta correcta en el juego. No importa el nivel ni la racha.
    add(gameBadgeId(game.id, 'seed'));

    const retry = stats.retrySuccess ?? 0;
    for (const threshold of [1, 10, 25]) {
      if (retry >= threshold) add(effortBadgeId('retry', threshold));
    }
  }

  if (event.type === 'level-up') {
    const newLevel = Number(event.payload?.['newLevel'] ?? 0);
    if (newLevel >= thresholds.bronze) add(gameBadgeId(game.id, 'bronze'));
    if (newLevel >= thresholds.silver) add(gameBadgeId(game.id, 'silver'));
    if (newLevel >= thresholds.gold || event.payload?.['isMaxLevel'] === true) {
      add(gameBadgeId(game.id, 'gold'));
    }
  }

  if (event.type === 'game-complete') {
    add(gameBadgeId(game.id, 'gold'));
  }

  if (
    event.type === 'time-up' ||
    (event.type === 'session-end' &&
      (event.payload?.['reason'] === 'complete' || event.payload?.['reason'] === 'time-up'))
  ) {
    add(effortBadgeId('calm'));
  }

  // Esfuerzo transversal: se revisa en cada evento porque los contadores pueden
  // cruzar el umbral en cualquiera (días al empezar, reintentos al acertar...).
  const games = stats.gamesPlayed?.length ?? 0;
  for (const threshold of [3, 6, 10]) {
    if (games >= threshold) add(effortBadgeId('explorer', threshold));
  }
  const days = stats.daysPlayed?.length ?? 0;
  for (const threshold of [3, 7, 14]) {
    if (days >= threshold) add(effortBadgeId('days', threshold));
  }

  // Fase 3: Esfuerzo avanzado
  const firstTry = stats.firstTryCorrect ?? 0;
  for (const threshold of [5, 15, 30]) {
    if (firstTry >= threshold) add(effortBadgeId('firstTry', threshold));
  }
  const help = stats.helpUsed ?? 0;
  for (const threshold of [1, 5, 15]) {
    if (help >= threshold) add(effortBadgeId('help', threshold));
  }
  const perfect = stats.perfectRounds ?? 0;
  for (const threshold of [1, 3, 10]) {
    if (perfect >= threshold) add(effortBadgeId('perfect', threshold));
  }

  // Mundos: solo después de mirar las de juego, porque "mundo en bronce" se apoya en
  // que TODOS los juegos del mundo tengan su bronce.
  const earnedPlusNew = new Set([...earned, ...out]);
  for (const id of categoryBadgeIds(game.category, stats, earnedPlusNew)) add(id);

  return [...out];
}

function categoryBadgeIds(
  category: LearningCategory,
  stats: BadgeStats,
  earned: ReadonlySet<string>,
): string[] {
  const games = gamesByCategory(category);
  if (games.length === 0) return [];

  const out: string[] = [];
  const played = new Set(stats.gamesPlayed ?? []);
  const playedHere = games.filter(g => played.has(g.id)).length;
  if (games.length >= 3 && playedHere >= 3) {
    out.push(categoryBadgeId(category, 'explorer'));
  }

  for (const tier of ['bronze', 'silver', 'gold'] as const) {
    const all = games.every(g => earned.has(gameBadgeId(g.id, tier)));
    if (all) out.push(categoryBadgeId(category, tier));
  }

  return out;
}
