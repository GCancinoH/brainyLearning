import { describe, expect, it } from 'vitest';
import {
  createInitialProfile,
  migrateProfile,
  PlayerProfile,
} from './player-profile';

describe('migración de perfiles', () => {
  it('un perfil viejo carga con insignias, contadores y progress.chinese', () => {
    // Perfil tal como lo dejaban las versiones anteriores a las insignias: sin
    // `badges`, sin `badgeStats` y sin `progress.chinese`.
    const viejo = {
      id: 'player_viejo',
      name: 'Luna',
      age: 6,
      avatar: '🦊',
      preferredTheme: 'space',
      createdAt: '2026-01-01T00:00:00.000Z',
      stickers: [{ id: 's1', name: 'Sol', category: 'space', imageUrl: '', unlockedAt: '' }],
      progress: {
        math: { level: 4, points: 20, correctAnswers: 12, attempts: 15, completedActivities: ['suma'] },
        spanish: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        english: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        japanese: { level: 2, points: 5, correctAnswers: 3, attempts: 4, completedActivities: [] },
      },
      mathProgress: { 'space-addition': { level: 4, completed: false } },
    } as unknown as PlayerProfile;

    const migrado = migrateProfile(viejo);

    expect(migrado.badges).toEqual([]);
    expect(migrado.badgeStats).toEqual({
      gamesPlayed: [],
      daysPlayed: [],
      retrySuccess: 0,
      sessionsCompleted: 0,
      firstTryCorrect: 0,
      helpUsed: 0,
      perfectRounds: 0,
    });
    expect(migrado.progress.chinese).toEqual({
      level: 1,
      points: 0,
      correctAnswers: 0,
      attempts: 0,
      completedActivities: [],
    });
    expect(migrado.progress.math.level).toBe(4);
    expect(migrado.mathProgress?.['space-addition']).toEqual({ level: 4, completed: false });
  });

  it('conserva y sanea las insignias ya guardadas', () => {
    const conInsignias = {
      id: 'p1',
      name: 'Sol',
      age: 4,
      avatar: '🐙',
      preferredTheme: 'ocean',
      createdAt: '2026-01-01T00:00:00.000Z',
      stickers: [],
      badges: [
        { id: 'hanzi-numbers.seed', earnedAt: '2026-10-01T10:00:00.000Z', seen: true },
        { id: 'hanzi-numbers.seed', earnedAt: '2026-10-02T10:00:00.000Z', seen: false },
        { id: '', earnedAt: '2026-10-03T10:00:00.000Z', seen: false },
        { id: 'effort.days.3', seen: false },
        null,
      ],
      badgeStats: {
        gamesPlayed: ['hanzi-numbers', 'hanzi-numbers', 'space-addition'],
        daysPlayed: ['2026-10-01', '2026-10-01', '2026-10-02'],
        retrySuccess: 12,
        sessionsCompleted: 3,
        firstTryCorrect: -5,
        helpUsed: 2.8,
      },
      progress: {
        math: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        spanish: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        english: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        japanese: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
        chinese: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
      },
    } as unknown as PlayerProfile;

    const migrado = migrateProfile(conInsignias);

    expect(migrado.badges.map(b => b.id)).toEqual(['hanzi-numbers.seed', 'effort.days.3']);
    expect(migrado.badges[0].seen).toBe(true);
    expect(migrado.badges[1].earnedAt).toBeTypeOf('string');
    expect(migrado.badgeStats.gamesPlayed).toEqual(['hanzi-numbers', 'space-addition']);
    expect(migrado.badgeStats.daysPlayed).toEqual(['2026-10-01', '2026-10-02']);
    expect(migrado.badgeStats.retrySuccess).toBe(12);
    expect(migrado.badgeStats.sessionsCompleted).toBe(3);
    expect(migrado.badgeStats.firstTryCorrect).toBe(0);
    expect(migrado.badgeStats.helpUsed).toBe(2);
  });

  it('createInitialProfile ya trae los campos nuevos', () => {
    const perfil = createInitialProfile('Nueva', 4, '🦄', 'mushrooms');
    expect(perfil.badges).toEqual([]);
    expect(perfil.badgeStats.gamesPlayed).toEqual([]);
    expect(perfil.progress.chinese.level).toBe(1);
  });
});
