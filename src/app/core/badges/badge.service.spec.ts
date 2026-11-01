import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BadgeService, sameStats } from './badge.service';
import { ProfileStateService } from '../services/profile-state';
import { GameSessionService } from '../games/game-session.service';
import { GameProgressService } from '../games/game-progress.service';
import { BadgeVoice } from './badge-voice';
import { SessionEvent } from '../games/game-types';
import { GameProgress } from '../games/game-types';
import { createInitialProfile, PlayerProfile } from '../models/player-profile';
import { BadgeStats } from './badge-types';

class ProfileStateStub {
  profile: PlayerProfile | null = createInitialProfile('Luna', 4, '🦊', 'space');

  activeProfile = () => this.profile;

  updateActiveProfile(updater: (p: PlayerProfile) => PlayerProfile): PlayerProfile | null {
    if (!this.profile) return null;
    this.profile = updater(this.profile);
    return this.profile;
  }
}

class GameSessionStub {
  readonly events = new Subject<SessionEvent>();
}

class GameProgressStub {
  progress: GameProgress | null = null;
  getProgress = () => this.progress;
}

class BadgeVoiceStub {
  say = vi.fn();
  cancel = vi.fn();
}

function emit(
  session: GameSessionStub,
  type: SessionEvent['type'],
  gameId = 'hanzi-numbers',
  payload?: Record<string, unknown>,
  timestamp = Date.now(),
): void {
  session.events.next({ type, gameId, timestamp, payload });
}

describe('BadgeService', () => {
  let service: BadgeService;
  let profileState: ProfileStateStub;
  let session: GameSessionStub;
  let progress: GameProgressStub;

  beforeEach(() => {
    profileState = new ProfileStateStub();
    session = new GameSessionStub();
    progress = new GameProgressStub();

    TestBed.configureTestingModule({
      providers: [
        BadgeService,
        { provide: ProfileStateService, useValue: profileState },
        { provide: GameSessionService, useValue: session },
        { provide: GameProgressService, useValue: progress },
        { provide: BadgeVoice, useClass: BadgeVoiceStub },
      ],
    });

    service = TestBed.inject(BadgeService);
  });

  it('da 🌱 con la primera respuesta correcta y no la repite', () => {
    emit(session, 'session-start');
    emit(session, 'answer-correct');

    expect(profileState.profile?.badges.map(b => b.id)).toContain('hanzi-numbers.seed');
    expect(service.queue().map(b => b.id)).toContain('hanzi-numbers.seed');

    emit(session, 'answer-correct');
    expect(profileState.profile?.badges.filter(b => b.id === 'hanzi-numbers.seed')).toHaveLength(1);
    expect(service.queue().filter(b => b.id === 'hanzi-numbers.seed')).toHaveLength(1);
  });

  it('da bronce y el mundo en bronce al subir al nivel 3', () => {
    emit(session, 'session-start');
    emit(session, 'level-up', 'hanzi-numbers', { newLevel: 3 });

    const ids = profileState.profile?.badges.map(b => b.id) ?? [];
    expect(ids).toContain('hanzi-numbers.bronze');
    expect(ids).toContain('cat.chinese.bronze');
  });

  it('recupera insignias del progreso guardado al empezar', () => {
    progress.progress = {
      gameId: 'hanzi-numbers',
      level: 8,
      completed: false,
      totalAttempts: 20,
      totalCorrect: 15,
      totalIncorrect: 5,
      accuracy: 0.75,
      bestStreak: 5,
      lastPlayedAt: Date.now(),
      totalPlayTimeMs: 1000,
    };

    emit(session, 'session-start');

    const ids = profileState.profile?.badges.map(b => b.id) ?? [];
    expect(ids).toEqual(expect.arrayContaining(['hanzi-numbers.seed', 'hanzi-numbers.bronze', 'hanzi-numbers.silver']));
  });

  it('cuenta el reintento después de un error', () => {
    emit(session, 'session-start');
    emit(session, 'answer-incorrect');
    emit(session, 'answer-correct');

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.retry.1');
  });

  it('da ratito de calma al terminar la sesión completa', () => {
    emit(session, 'session-start');
    emit(session, 'session-end', 'hanzi-numbers', { reason: 'complete' });

    expect(profileState.profile?.badgeStats.sessionsCompleted).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.calm');
  });

  it('ignora eventos de un perfil anterior', () => {
    emit(session, 'session-start');
    const oldProfile = profileState.profile!;
    profileState.profile = createInitialProfile('Sol', 6, '🐙', 'ocean');

    emit(session, 'answer-correct');

    expect(profileState.profile?.badges).toHaveLength(0);
    expect(oldProfile.badges).toHaveLength(0);
  });

  it('al subir de nivel pone delante la insignia de más valor', () => {
    emit(session, 'session-start');
    emit(session, 'answer-correct'); // 🌱
    emit(session, 'level-up', 'hanzi-numbers', { newLevel: 3 }); // bronce + mundo en bronce

    service.promoteMostValuable();
    expect(service.current()?.id).toBe('cat.chinese.bronze');

    service.dismissCurrent();
    expect(service.current()?.id).toBe('hanzi-numbers.bronze');

    service.dismissCurrent();
    expect(service.current()?.id).toBe('hanzi-numbers.seed');
  });

  it('awardBadge es idempotente', () => {
    expect(service.awardBadge('hanzi-numbers.seed')).toBe(true);
    expect(service.awardBadge('hanzi-numbers.seed')).toBe(false);
    expect(profileState.profile?.badges.filter(b => b.id === 'hanzi-numbers.seed')).toHaveLength(1);
  });

  it('descarta ids que no existen', () => {
    expect(service.awardBadge('no-existe')).toBe(false);
  });

  // Fase 3: Esfuerzo avanzado
  it('cuenta ayuda usada y da insignia Escuché la pista', () => {
    emit(session, 'session-start');
    emit(session, 'help-used', 'hanzi-numbers');

    expect(profileState.profile?.badgeStats.helpUsed).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.help.1');
  });

  it('cuenta firstTry y da insignia Ojo de águila', () => {
    emit(session, 'session-start');
    emit(session, 'answer-correct', 'hanzi-numbers', { firstTry: true });

    expect(profileState.profile?.badgeStats.firstTryCorrect).toBe(1);
  });

  it('acumula firstTryCorrect y da Ojo de águila en umbral 5', () => {
    emit(session, 'session-start');
    for (let i = 0; i < 5; i++) {
      emit(session, 'answer-correct', 'hanzi-numbers', { firstTry: true });
    }

    expect(profileState.profile?.badgeStats.firstTryCorrect).toBe(5);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.firstTry.5');
  });

  it('cuenta ronda perfecta y da Memoria de dragón', () => {
    emit(session, 'session-start');
    emit(session, 'answer-correct', 'hanzi-numbers', { perfectRound: true });

    expect(profileState.profile?.badgeStats.perfectRounds).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.perfect.1');
  });
});

describe('sameStats (contrato de BadgeStats)', () => {
  /**
   * `Required<BadgeStats>` obliga a que este fixture tenga TODOS los campos: si se
   * añade un contador nuevo y se olvida aquí, TypeScript falla.
   */
  const base: Required<BadgeStats> = {
    gamesPlayed: [],
    daysPlayed: [],
    retrySuccess: 0,
    sessionsCompleted: 0,
    firstTryCorrect: 0,
    helpUsed: 0,
    perfectRounds: 0,
  };

  it('detecta el cambio de cada campo por separado', () => {
    for (const key of Object.keys(base) as (keyof BadgeStats)[]) {
      const changed = { ...base } as Record<string, unknown>;
      const value = base[key];
      if (Array.isArray(value)) {
        changed[key] = [...value, 'x'];
      } else {
        changed[key] = (value ?? 0) + 1;
      }

      expect(sameStats(base, changed as unknown as BadgeStats), `campo ${key}`).toBe(false);
      expect(sameStats(changed as unknown as BadgeStats, base), `campo ${key}`).toBe(false);
    }
  });

  it('dos copias iguales son iguales', () => {
    expect(sameStats(base, { ...base, gamesPlayed: [], daysPlayed: [] })).toBe(true);
  });

  it('compara las listas por contenido, no por referencia', () => {
    const a: BadgeStats = { ...base, gamesPlayed: ['a', 'b'] };
    const b: BadgeStats = { ...base, gamesPlayed: ['a', 'b'] };
    const c: BadgeStats = { ...base, gamesPlayed: ['b', 'a'] };

    expect(sameStats(a, b)).toBe(true);
    expect(sameStats(a, c)).toBe(false);
  });
});
