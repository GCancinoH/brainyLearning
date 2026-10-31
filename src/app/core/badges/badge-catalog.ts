/**
 * Catálogo de insignias.
 *
 * Se genera a partir de `ALL_GAMES`: un juego nuevo hereda sus cuatro insignias sin
 * tocar este archivo. Las de mundo y las de esfuerzo se declaran aquí porque no son
 * "un juego", pero también son datos puros.
 */

import { ALL_GAMES, gamesByCategory } from '../models/game-catalog';
import { CATEGORY_META, LearningCategory } from '../models/learning-category';
import { Badge, BadgeTier } from './badge-types';

export const TIER_ORDER: readonly BadgeTier[] = ['seed', 'bronze', 'silver', 'gold'];

export const TIER_LABEL: Record<BadgeTier, string> = {
  seed: 'Primeros pasos',
  bronze: 'Bronce',
  silver: 'Plata',
  gold: 'Oro',
};

export const TIER_ICON: Record<BadgeTier, string> = {
  seed: '🌱',
  bronze: '🥉',
  silver: '🥈',
  gold: '🥇',
};

/** Umbrales sobre el nivel máximo. Se pueden cambiar aquí sin tocar las reglas. */
export const TIER_PERCENT: Record<Exclude<BadgeTier, 'seed'>, number> = {
  bronze: 0.25,
  silver: 0.6,
  gold: 1,
};

export function tierThresholds(maxLevel: number): Record<Exclude<BadgeTier, 'seed'>, number> {
  return {
    bronze: Math.max(1, Math.ceil(maxLevel * TIER_PERCENT.bronze)),
    silver: Math.max(1, Math.ceil(maxLevel * TIER_PERCENT.silver)),
    gold: Math.max(1, maxLevel),
  };
}

export function gameBadgeId(gameId: string, tier: BadgeTier): string {
  return `${gameId}.${tier}`;
}

export function categoryBadgeId(
  category: LearningCategory,
  kind: 'explorer' | Exclude<BadgeTier, 'seed'>,
): string {
  return `cat.${category}.${kind}`;
}

export function effortBadgeId(kind: 'retry' | 'explorer' | 'days' | 'calm' | 'firstTry' | 'help' | 'perfect' | 'welcome', threshold?: number): string {
  return threshold === undefined ? `effort.${kind}` : `effort.${kind}.${threshold}`;
}

// ============================================
// POR JUEGO
// ============================================

function gameBadges(): Badge[] {
  return ALL_GAMES.flatMap(game => {
    const thresholds = tierThresholds(game.maxLevel);
    const voiceByTier: Record<BadgeTier, string> = {
      seed: `¡Primeros pasos en ${game.title}!`,
      bronze: `¡Bronce en ${game.title}!`,
      silver: `¡Plata en ${game.title}!`,
      gold: `¡Oro en ${game.title}! ¡Completaste el juego!`,
    };

    return TIER_ORDER.map(tier => {
      const id = gameBadgeId(game.id, tier);
      const threshold = tier === 'seed' ? 1 : thresholds[tier];
      return {
        id,
        scope: 'game' as const,
        gameId: game.id,
        category: game.category,
        tier,
        icon: game.icon,
        nameKey: `badge.${id}`,
        name: `${TIER_LABEL[tier]} · ${game.title}`,
        voice: voiceByTier[tier],
        // Se guarda el umbral para que el álbum pueda explicarlo sin recalcular.
        threshold,
      } satisfies Badge & { threshold: number };
    });
  });
}

// ============================================
// POR MUNDO
// ============================================

function categoryBadges(): Badge[] {
  return (Object.keys(CATEGORY_META) as LearningCategory[]).flatMap(category => {
    const meta = CATEGORY_META[category];
    const games = gamesByCategory(category);
    if (!meta.available || games.length === 0) return [];

    const out: Badge[] = [];

    // "Exploradora" necesita 3 juegos distintos: en un mundo con 1 solo juego la
    // insignia sería imposible y es mejor no enseñar una silueta inalcanzable.
    if (games.length >= 3) {
      const id = categoryBadgeId(category, 'explorer');
      out.push({
        id,
        scope: 'category',
        category,
        icon: meta.icon,
        nameKey: `badge.${id}`,
        name: `Exploradora de ${meta.worldName}`,
        voice: `¡Exploradora de ${meta.worldName}! Probaste tres juegos distintos.`,
      });
    }

    for (const tier of ['bronze', 'silver', 'gold'] as const) {
      const id = categoryBadgeId(category, tier);
      out.push({
        id,
        scope: 'category',
        category,
        tier,
        icon: meta.icon,
        nameKey: `badge.${id}`,
        name: `${TIER_LABEL[tier]} en ${meta.worldName}`,
        voice: `¡${TIER_LABEL[tier]} en ${meta.worldName}!`,
      });
    }

    return out;
  });
}

// ============================================
// DE ESFUERZO
// ============================================

const EFFORT_GRADIENT = 'linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #8b5cf6 100%)';

function effortBadge(
  kind: 'retry' | 'explorer' | 'days' | 'calm' | 'firstTry' | 'help' | 'perfect' | 'welcome',
  threshold: number | undefined,
  icon: string,
  name: string,
  voice: string,
): Badge {
  const id = effortBadgeId(kind, threshold);
  return {
    id,
    scope: 'effort',
    icon,
    nameKey: `badge.${id}`,
    name,
    voice,
  };
}

function effortBadges(): Badge[] {
  return [
    effortBadge('retry', 1, '🔁', 'Otra vez, otra vez', '¡Lo volviste a intentar!'),
    effortBadge('retry', 10, '🔁', 'Otra vez, otra vez · 10', '¡Diez veces lo volviste a intentar!'),
    effortBadge('retry', 25, '🔁', 'Otra vez, otra vez · 25', '¡Veinticinco veces lo volviste a intentar!'),
    effortBadge('explorer', 3, '🌈', 'Exploradora', '¡Probaste tres juegos distintos!'),
    effortBadge('explorer', 6, '🌈', 'Exploradora · 6', '¡Seis juegos distintos!'),
    effortBadge('explorer', 10, '🌈', 'Exploradora · 10', '¡Diez juegos distintos!'),
    effortBadge('days', 3, '📅', 'Días de juego · 3', '¡Volviste a jugar tres días!'),
    effortBadge('days', 7, '📅', 'Días de juego · 7', '¡Siete días de juego!'),
    effortBadge('days', 14, '📅', 'Días de juego · 14', '¡Catorce días de juego!'),
    effortBadge('calm', undefined, '🌙', 'Ratito de calma', '¡Terminaste una sesión completa!'),
    // Fase 3: Esfuerzo avanzado
    effortBadge('firstTry', 5, '🎯', 'Ojo de águila', '¡Cinco aciertos a la primera!'),
    effortBadge('firstTry', 15, '🎯', 'Ojo de águila · 15', '¡Quince aciertos a la primera!'),
    effortBadge('firstTry', 30, '🎯', 'Ojo de águila · 30', '¡Treinta aciertos a la primera!'),
    effortBadge('help', 1, '👂', 'Pido ayuda y aprendo', '¡Pediste ayuda y seguiste aprendiendo!'),
    effortBadge('help', 5, '👂', 'Pido ayuda y aprendo · 5', '¡Cinco veces pediste ayuda y aprendiste!'),
    effortBadge('help', 15, '👂', 'Pido ayuda y aprendo · 15', '¡Quince veces pediste ayuda y aprendiste!'),
    effortBadge('perfect', 1, '🧠', 'Memoria de dragón', '¡Una ronda perfecta sin ayuda ni errores!'),
    effortBadge('perfect', 3, '🧠', 'Memoria de dragón · 3', '¡Tres rondas perfectas!'),
    effortBadge('perfect', 10, '🧠', 'Memoria de dragón · 10', '¡Diez rondas perfectas!'),
    // Fase 4: Insignia de bienvenida
    effortBadge('welcome', undefined, '🎁', '¡Bienvenida a Brainy!', '¡Bienvenida a tu aventura de aprendizaje!'),
  ];
}

export { EFFORT_GRADIENT };

// ============================================
// ÍNDICES
// ============================================

export const GAME_BADGES: readonly Badge[] = gameBadges();
export const CATEGORY_BADGES: readonly Badge[] = categoryBadges();
export const EFFORT_BADGES: readonly Badge[] = effortBadges();
export const ALL_BADGES: readonly Badge[] = [...GAME_BADGES, ...CATEGORY_BADGES, ...EFFORT_BADGES];

export const BADGE_BY_ID: ReadonlyMap<string, Badge> = new Map(ALL_BADGES.map(b => [b.id, b]));

export function badgeById(id: string): Badge | undefined {
  return BADGE_BY_ID.get(id);
}

export function badgesForGame(gameId: string): Badge[] {
  return GAME_BADGES.filter(b => b.gameId === gameId);
}

export function badgesForCategory(category: LearningCategory): Badge[] {
  return ALL_BADGES.filter(b => b.category === category);
}

export function tierBadgeIdFor(gameId: string, tier: BadgeTier): string {
  return gameBadgeId(gameId, tier);
}
