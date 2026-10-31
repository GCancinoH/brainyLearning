import { describe, expect, it } from 'vitest';
import { SessionEvent } from '../games/game-types';
import { gamesByCategory } from '../models/game-catalog';
import { createInitialBadgeStats } from './badge-types';
import {
  ALL_BADGES,
  GAME_BADGES,
  badgeById,
  categoryBadgeId,
  gameBadgeId,
  tierThresholds,
} from './badge-catalog';
import {
  evaluateBadgeEvent,
  localDateKey,
  updateBadgeStats,
} from './badge-rules';

function event(
  type: SessionEvent['type'],
  gameId = 'hanzi-numbers',
  payload?: Record<string, unknown>,
  timestamp = Date.UTC(2026, 9, 30, 12, 0, 0),
): SessionEvent {
  return { type, gameId, timestamp, payload };
}

const ctx = { age: 4 };

describe('catálogo de insignias', () => {
  it('cada juego produce sus 4 pasos con ids únicos', () => {
    const ids = GAME_BADGES.map(b => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const game of gamesByCategory('math').concat(gamesByCategory('japanese'), gamesByCategory('chinese'))) {
      for (const tier of ['seed', 'bronze', 'silver', 'gold'] as const) {
        expect(badgeById(gameBadgeId(game.id, tier)), `${game.id}.${tier}`).toBeTruthy();
      }
    }
  });

  it('los umbrales son 25 % / 60 % / 100 % del nivel máximo', () => {
    expect(tierThresholds(12)).toEqual({ bronze: 3, silver: 8, gold: 12 });
    expect(tierThresholds(10)).toEqual({ bronze: 3, silver: 6, gold: 10 });
    expect(tierThresholds(20)).toEqual({ bronze: 5, silver: 12, gold: 20 });
  });

  it('todas las insignias tienen voz y nombre', () => {
    for (const badge of ALL_BADGES) {
      expect(badge.name.length).toBeGreaterThan(0);
      expect(badge.voice.length).toBeGreaterThan(0);
      expect(badge.nameKey).toBe(`badge.${badge.id}`);
    }
  });
});

describe('reglas de insignias', () => {
  it('la primera respuesta correcta da 🌱', () => {
    const stats = createInitialBadgeStats();
    const ids = evaluateBadgeEvent(event('answer-correct'), stats, new Set(), ctx);
    expect(ids).toContain('hanzi-numbers.seed');
  });

  it('una insignia ya ganada no se repite', () => {
    const stats = createInitialBadgeStats();
    const ids = evaluateBadgeEvent(
      event('answer-correct'),
      stats,
      new Set(['hanzi-numbers.seed']),
      ctx,
    );
    expect(ids).not.toContain('hanzi-numbers.seed');
  });

  it('subir al nivel 3 da bronce; al 8, plata; al 12, oro', () => {
    const stats = createInitialBadgeStats();
    expect(evaluateBadgeEvent(event('level-up', 'hanzi-numbers', { newLevel: 3 }), stats, new Set(), ctx))
      .toContain('hanzi-numbers.bronze');
    expect(evaluateBadgeEvent(event('level-up', 'hanzi-numbers', { newLevel: 8 }), stats, new Set(), ctx))
      .toContain('hanzi-numbers.silver');
    expect(evaluateBadgeEvent(event('level-up', 'hanzi-numbers', { newLevel: 12, isMaxLevel: true }), stats, new Set(), ctx))
      .toContain('hanzi-numbers.gold');
  });

  it('completar el juego da oro', () => {
    const stats = createInitialBadgeStats();
    expect(evaluateBadgeEvent(event('game-complete'), stats, new Set(), ctx))
      .toContain('hanzi-numbers.gold');
  });

  it('al empezar una sesión recupera insignias de progreso ya guardado', () => {
    const stats = createInitialBadgeStats();
    const ids = evaluateBadgeEvent(
      event('session-start'),
      stats,
      new Set(),
      { age: 6, savedProgress: { level: 8, completed: false, totalCorrect: 30 } },
    );
    expect(ids).toEqual(expect.arrayContaining(['hanzi-numbers.seed', 'hanzi-numbers.bronze', 'hanzi-numbers.silver']));
    expect(ids).not.toContain('hanzi-numbers.gold');
  });

  it('un juego completado antes de las insignias recupera el oro', () => {
    const ids = evaluateBadgeEvent(
      event('session-start'),
      createInitialBadgeStats(),
      new Set(),
      { age: 6, savedProgress: { level: 12, completed: true, totalCorrect: 50 } },
    );
    expect(ids).toContain('hanzi-numbers.gold');
  });

  it('el reintento acumulado da 1, 10 y 25', () => {
    const base = { ...createInitialBadgeStats(), retrySuccess: 10 };
    const ids = evaluateBadgeEvent(event('answer-correct'), base, new Set(), ctx);
    expect(ids).toEqual(expect.arrayContaining(['effort.retry.1', 'effort.retry.10']));
    expect(ids).not.toContain('effort.retry.25');

    const ids25 = evaluateBadgeEvent(
      event('answer-correct'),
      { ...base, retrySuccess: 25 },
      new Set(),
      ctx,
    );
    expect(ids25).toContain('effort.retry.25');
  });

  it('los días son distintos, no seguidos', () => {
    const stats = { ...createInitialBadgeStats(), daysPlayed: ['2026-10-01', '2026-10-03', '2026-10-09'] };
    const ids = evaluateBadgeEvent(event('session-start'), stats, new Set(), ctx);
    expect(ids).toContain('effort.days.3');
    expect(ids).not.toContain('effort.days.7');
  });

  it('los juegos distintos dan exploradora', () => {
    const stats = {
      ...createInitialBadgeStats(),
      gamesPlayed: ['space-addition', 'space-subtraction', 'space-multiplication'],
    };
    const ids = evaluateBadgeEvent(event('session-start', 'space-addition'), stats, new Set(), ctx);
    expect(ids).toContain('effort.explorer.3');
  });

  it('el mundo en bronce aparece cuando todos sus juegos tienen bronce', () => {
    const chineseGames = gamesByCategory('chinese');
    const earned = new Set(chineseGames.map(g => gameBadgeId(g.id, 'bronze')));
    const ids = evaluateBadgeEvent(event('level-up', 'hanzi-numbers', { newLevel: 3 }), createInitialBadgeStats(), earned, ctx);
    expect(ids).toContain(categoryBadgeId('chinese', 'bronze'));
    expect(ids).not.toContain(categoryBadgeId('chinese', 'gold'));
  });

  it('un mundo con un solo juego no enseña "exploradora" inalcanzable', () => {
    expect(badgeById(categoryBadgeId('chinese', 'explorer'))).toBeUndefined();
  });

  it('una sesión completa da ratito de calma; salir no', () => {
    expect(evaluateBadgeEvent(event('time-up'), { ...createInitialBadgeStats(), sessionsCompleted: 1 }, new Set(), ctx))
      .toContain('effort.calm');
    expect(evaluateBadgeEvent(
      event('session-end', 'hanzi-numbers', { reason: 'user-exit' }),
      { ...createInitialBadgeStats(), sessionsCompleted: 1 },
      new Set(),
      ctx,
    )).not.toContain('effort.calm');
  });
});

describe('contadores acumulados', () => {
  it('cuenta días locales distintos y no repite el mismo día', () => {
    const t1 = new Date(2026, 9, 30, 9, 0, 0).getTime();
    const t2 = new Date(2026, 9, 30, 20, 0, 0).getTime();
    const t3 = new Date(2026, 9, 31, 8, 0, 0).getTime();

    let stats = createInitialBadgeStats();
    stats = updateBadgeStats(event('session-start', 'hanzi-numbers', undefined, t1), stats, ctx);
    stats = updateBadgeStats(event('session-start', 'hanzi-numbers', undefined, t2), stats, ctx);
    stats = updateBadgeStats(event('session-start', 'space-addition', undefined, t3), stats, ctx);

    expect(stats.daysPlayed).toEqual(['2026-10-30', '2026-10-31']);
    expect(stats.gamesPlayed).toEqual(['hanzi-numbers', 'space-addition']);
  });

  it('localDateKey usa el día local, no UTC', () => {
    const local = new Date(2026, 0, 1, 23, 30, 0);
    expect(localDateKey(local.getTime())).toBe('2026-01-01');
  });

  it('cuenta reintento solo si el error fue el evento anterior del mismo juego', () => {
    const stats = createInitialBadgeStats();
    expect(updateBadgeStats(event('answer-correct'), stats, { ...ctx, lastEventType: 'answer-incorrect' }).retrySuccess).toBe(1);
    expect(updateBadgeStats(event('answer-correct'), stats, { ...ctx, lastEventType: 'answer-correct' }).retrySuccess).toBe(0);
  });

  it('cuenta la sesión completa y también el time-up', () => {
    const stats = createInitialBadgeStats();
    expect(updateBadgeStats(event('session-end', 'hanzi-numbers', { reason: 'complete' }), stats, ctx).sessionsCompleted).toBe(1);
    expect(updateBadgeStats(event('time-up'), stats, ctx).sessionsCompleted).toBe(1);
    expect(updateBadgeStats(event('session-end', 'hanzi-numbers', { reason: 'user-exit' }), stats, ctx).sessionsCompleted).toBe(0);
  });
});
