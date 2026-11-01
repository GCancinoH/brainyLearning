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

  it('cuenta reintento con la bandera de reintento armada', () => {
    const stats = createInitialBadgeStats();
    expect(updateBadgeStats(event('answer-correct'), stats, { ...ctx, retryArmed: true }).retrySuccess).toBe(1);
    expect(updateBadgeStats(event('answer-correct'), stats, { ...ctx, retryArmed: false }).retrySuccess).toBe(0);
    expect(updateBadgeStats(event('answer-correct'), stats, ctx).retrySuccess).toBe(0);
  });

  it('cuenta la sesión completa y también el time-up', () => {
    const stats = createInitialBadgeStats();
    expect(updateBadgeStats(event('session-end', 'hanzi-numbers', { reason: 'complete' }), stats, ctx).sessionsCompleted).toBe(1);
    expect(updateBadgeStats(event('time-up'), stats, ctx).sessionsCompleted).toBe(1);
    expect(updateBadgeStats(event('session-end', 'hanzi-numbers', { reason: 'user-exit' }), stats, ctx).sessionsCompleted).toBe(0);
  });
});

describe('Fase 3: contadores de esfuerzo avanzado', () => {
  it('cuenta firstTryCorrect en answer-correct con firstTry=true', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(event('answer-correct', 'hanzi-numbers', { firstTry: true }), stats, ctx);
    expect(updated.firstTryCorrect).toBe(1);
  });

  it('no cuenta firstTryCorrect si firstTry=false', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(event('answer-correct', 'hanzi-numbers', { firstTry: false }), stats, ctx);
    expect(updated.firstTryCorrect).toBe(0);
  });

  it('cuenta helpUsed en evento help-used', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(event('help-used', 'hanzi-numbers'), stats, ctx);
    expect(updated.helpUsed).toBe(1);
  });

  it('cuenta perfectRounds en answer-correct con perfectRound=true', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(event('answer-correct', 'hanzi-numbers', { perfectRound: true }), stats, ctx);
    expect(updated.perfectRounds).toBe(1);
  });

  it('insignias Ojo de águila: 5, 15, 30 aciertos a la primera', () => {
    const stats = { ...createInitialBadgeStats(), firstTryCorrect: 5 };
    const ids = evaluateBadgeEvent(event('answer-correct'), stats, new Set(), ctx);
    expect(ids).toContain('effort.firstTry.5');
    expect(ids).not.toContain('effort.firstTry.15');

    const stats15 = { ...createInitialBadgeStats(), firstTryCorrect: 15 };
    const ids15 = evaluateBadgeEvent(event('answer-correct'), stats15, new Set(), ctx);
    expect(ids15).toContain('effort.firstTry.15');
    expect(ids15).not.toContain('effort.firstTry.30');
  });

  it('insignias Escuché la pista: 1, 5, 15 ayudas usadas', () => {
    const stats = { ...createInitialBadgeStats(), helpUsed: 1 };
    const ids = evaluateBadgeEvent(event('help-used'), stats, new Set(), ctx);
    expect(ids).toContain('effort.help.1');
    expect(ids).not.toContain('effort.help.5');

    const stats5 = { ...createInitialBadgeStats(), helpUsed: 5 };
    const ids5 = evaluateBadgeEvent(event('help-used'), stats5, new Set(), ctx);
    expect(ids5).toContain('effort.help.5');
  });

  it('insignias Memoria de dragón: 1, 3, 10 rondas perfectas', () => {
    const stats = { ...createInitialBadgeStats(), perfectRounds: 1 };
    const ids = evaluateBadgeEvent(event('answer-correct', 'hanzi-numbers', { perfectRound: true }), stats, new Set(), ctx);
    expect(ids).toContain('effort.perfect.1');
    expect(ids).not.toContain('effort.perfect.3');

    const stats3 = { ...createInitialBadgeStats(), perfectRounds: 3 };
    const ids3 = evaluateBadgeEvent(event('answer-correct', 'hanzi-numbers', { perfectRound: true }), stats3, new Set(), ctx);
    expect(ids3).toContain('effort.perfect.3');
  });
});

describe('Fase B: reintento por ronda (F3)', () => {
  it('cuenta reintento con firstTry=false aunque no haya answer-incorrect', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(event('answer-correct', 'hanzi-numbers', { firstTry: false }), stats, ctx);
    expect(updated.retrySuccess).toBe(1);
  });

  it('no cuenta reintento con firstTry=true ni sin firstTry', () => {
    const stats = createInitialBadgeStats();
    expect(updateBadgeStats(event('answer-correct', 'hanzi-numbers', { firstTry: true }), stats, ctx).retrySuccess).toBe(0);
    expect(updateBadgeStats(event('answer-correct', 'hanzi-numbers'), stats, ctx).retrySuccess).toBe(0);
  });

  it('retryArmed + firstTry=false suma UNO, no dos', () => {
    const stats = createInitialBadgeStats();
    const updated = updateBadgeStats(
      event('answer-correct', 'hanzi-numbers', { firstTry: false }),
      stats,
      { ...ctx, retryArmed: true },
    );
    expect(updated.retrySuccess).toBe(1);
  });

  it('firstTry=false desbloquea la insignia de reintento', () => {
    const stats = { ...createInitialBadgeStats(), retrySuccess: 1 };
    const ids = evaluateBadgeEvent(event('answer-correct', 'hanzi-numbers', { firstTry: false }), stats, new Set(), ctx);
    expect(ids).toContain('effort.retry.1');
  });
});

describe('catálogo de insignias (Fase 3)', () => {
  it('incluye las nuevas insignias de esfuerzo', () => {
    expect(badgeById('effort.firstTry.5')).toBeTruthy();
    expect(badgeById('effort.firstTry.15')).toBeTruthy();
    expect(badgeById('effort.firstTry.30')).toBeTruthy();
    expect(badgeById('effort.help.1')).toBeTruthy();
    expect(badgeById('effort.help.5')).toBeTruthy();
    expect(badgeById('effort.help.15')).toBeTruthy();
    expect(badgeById('effort.perfect.1')).toBeTruthy();
    expect(badgeById('effort.perfect.3')).toBeTruthy();
    expect(badgeById('effort.perfect.10')).toBeTruthy();
  });

  it('las nuevas insignias tienen icono, nombre y voz', () => {
    for (const id of ['effort.firstTry.5', 'effort.help.1', 'effort.perfect.1']) {
      const b = badgeById(id);
      expect(b).toBeTruthy();
      expect(b!.icon).toBeTruthy();
      expect(b!.name).toBeTruthy();
      expect(b!.voice).toBeTruthy();
    }
  });

  it('la insignia de ayuda dice lo que de verdad mide (F4)', () => {
    expect(badgeById('effort.help.1')?.name).toBe('Escuché la pista');
    expect(badgeById('effort.help.1')?.voice).toContain('pista');
    expect(badgeById('effort.help.5')?.name).toContain('Escuché la pista');
    expect(badgeById('effort.help.15')?.name).toContain('Escuché la pista');
  });
});
