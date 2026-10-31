/**
 * Modelo de insignias.
 *
 * Una insignia es un logro con criterio (no un coleccionable decorativo): se gana una
 * sola vez, se guarda en el perfil y se puede volver a mirar en el álbum.
 *
 * Los ids son estables y legibles porque también son claves de voz y de persistencia:
 *   - juego:    `hanzi-numbers.silver`
 *   - mundo:    `cat.chinese.explorer`
 *   - esfuerzo: `effort.retry.10`
 */

import { LearningCategory } from '../models/learning-category';

export type BadgeTier = 'seed' | 'bronze' | 'silver' | 'gold';
export type BadgeScope = 'game' | 'category' | 'effort';

export interface Badge {
  id: string;
  scope: BadgeScope;
  /** Solo si `scope === 'game'` */
  gameId?: string;
  /** Mundo al que pertenece. Las de esfuerzo son transversales y no tienen. */
  category?: LearningCategory;
  tier?: BadgeTier;
  /** Emoji o id de arte. Hoy se compone con el icono del juego. */
  icon: string;
  /** Clave del manifiesto de voz: `badge.<id>` */
  nameKey: string;
  /** Texto visible solo para perfiles de 6 años */
  name: string;
  /** Frase corta para la voz (es-MX). */
  voice: string;
}

export interface EarnedBadge {
  id: string;
  /** ISO */
  earnedAt: string;
  /** false → punto rojo en el álbum */
  seen: boolean;
}

/**
 * Contadores ACUMULADOS. Nunca rachas: nada se pierde por faltar un día.
 *
 * Los campos de Fase 3 quedan opcionales para que un perfil viejo migre sin inventar
 * datos: si no existen, valen 0.
 */
export interface BadgeStats {
  /** gameIds distintos jugados */
  gamesPlayed: string[];
  /** 'YYYY-MM-DD' locales distintos */
  daysPlayed: string[];
  /** aciertos justo después de un error en el mismo juego */
  retrySuccess: number;
  /** sesiones que terminan en `time-up` o `complete` */
  sessionsCompleted: number;
  /** Fase 3: aciertos al primer toque */
  firstTryCorrect?: number;
  /** Fase 3: ayudas usadas y luego acertadas */
  helpUsed?: number;
}

const TIER_VALUE: Record<BadgeTier, number> = {
  seed: 1,
  bronze: 2,
  silver: 3,
  gold: 4,
};

/**
 * Valor relativo de una insignia para decidir cuál se muestra primero cuando se
 * ganan varias a la vez (política §5.3: "la de más valor").
 *
 * No es una puntuación para la niña ni se guarda: solo ordena la cola del diálogo.
 * Un mundo vale un poco más que el juego que lo desbloquea; el esfuerzo espera su turno.
 */
export function badgeValue(badge: Badge): number {
  const tier = badge.tier ? TIER_VALUE[badge.tier] : 1.5;
  return tier * 10 + (badge.scope === 'category' ? 5 : 0);
}

export const EMPTY_BADGE_STATS: BadgeStats = {
  gamesPlayed: [],
  daysPlayed: [],
  retrySuccess: 0,
  sessionsCompleted: 0,
};

export function createInitialBadgeStats(): BadgeStats {
  return {
    ...EMPTY_BADGE_STATS,
    gamesPlayed: [],
    daysPlayed: [],
  };
}
