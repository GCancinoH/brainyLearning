import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { BadgeService } from './badge.service';
import { ProfileStateService } from '../services/profile-state';
import { GameSessionService } from '../games/game-session.service';
import { GameProgressService } from '../games/game-progress.service';
import { BadgeVoice } from './badge-voice';
import { SessionEvent } from '../games/game-types';
import { GameProgress } from '../games/game-types';
import { createInitialProfile, PlayerProfile } from '../models/player-profile';

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
});
