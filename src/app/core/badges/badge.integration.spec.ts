/**
 * Integración real: `GameSessionService` + `BadgeService`.
 *
 * Los specs de unidad emitían eventos "a mano" y por eso no vieron F1 (la cadena real
 * de `recordIncorrect()` incluye un `streak-update` en medio) ni F2 (`sameStats`
 * olvidaba `perfectRounds`). Aquí se juega con los métodos reales de la sesión.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BadgeService } from './badge.service';
import { ProfileStateService } from '../services/profile-state';
import { GameSessionService } from '../games/game-session.service';
import { GameProgressService } from '../games/game-progress.service';
import { BadgeVoice } from './badge-voice';
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

class GameProgressStub {
  progress: GameProgress | null = null;
  getProgress = () => this.progress;
}

class BadgeVoiceStub {
  say = vi.fn();
  cancel = vi.fn();
}

/**
 * Reproduce exactamente lo que hace un juego en una ronda: errores, ayuda y el
 * acierto con sus opciones. `recordIncorrect()` emite `answer-incorrect` +
 * `streak-update`, igual que en producción.
 */
function playRound(
  session: GameSessionService,
  opts: { wrong?: number; help?: boolean; firstTry?: boolean; perfectRound?: boolean } = {},
): void {
  for (let i = 0; i < (opts.wrong ?? 0); i++) session.recordIncorrect();
  if (opts.help) session.recordHelpUsed();
  session.recordCorrect({ firstTry: opts.firstTry, perfectRound: opts.perfectRound });
}

function startSession(session: GameSessionService, gameId = 'hanzi-numbers'): void {
  session.startSession(
    {
      gameId,
      sessionDurationMs: 10 * 60 * 1000,
      requiredCorrectForLevelUp: 5,
      maxLevel: 12,
      initialLevel: 1,
    },
    4,
  );
}

describe('BadgeService + GameSessionService (integración)', () => {
  let service: BadgeService;
  let session: GameSessionService;
  let profileState: ProfileStateStub;

  beforeEach(() => {
    profileState = new ProfileStateStub();

    TestBed.configureTestingModule({
      providers: [
        BadgeService,
        GameSessionService,
        { provide: ProfileStateService, useValue: profileState },
        { provide: GameProgressService, useClass: GameProgressStub },
        { provide: BadgeVoice, useClass: BadgeVoiceStub },
      ],
    });

    service = TestBed.inject(BadgeService);
    session = TestBed.inject(GameSessionService);
  });

  afterEach(() => {
    session.ngOnDestroy();
    TestBed.resetTestingModule();
  });

  // ============================================
  // F1 · "Otra vez, otra vez"
  // ============================================

  it('error → acierto cuenta un reintento y gana effort.retry.1', () => {
    startSession(session);
    playRound(session, { wrong: 1 });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.retry.1');
    expect(service.queue().map(b => b.id)).toContain('effort.retry.1');
  });

  it('error → help-used → acierto cuenta un reintento', () => {
    startSession(session);
    session.recordIncorrect();
    session.recordHelpUsed();
    session.recordCorrect();

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
  });

  it('error → error → acierto cuenta UN reintento, no dos', () => {
    startSession(session);
    playRound(session, { wrong: 2 });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
  });

  it('acierto → acierto no cuenta reintento', () => {
    startSession(session);
    playRound(session, { firstTry: true });
    playRound(session, { firstTry: true });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(0);
  });

  it('error en un juego y acierto en una sesión nueva no cuenta', () => {
    startSession(session, 'hanzi-numbers');
    session.recordIncorrect();

    startSession(session, 'space-addition');
    playRound(session, { firstTry: true });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(0);
  });

  it('diez reintentos ganan effort.retry.10 una sola vez', () => {
    startSession(session);
    for (let i = 0; i < 10; i++) playRound(session, { wrong: 1 });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(10);
    expect(profileState.profile?.badges.filter(b => b.id === 'effort.retry.10')).toHaveLength(1);
    expect(service.queue().filter(b => b.id === 'effort.retry.10')).toHaveLength(1);
  });

  // ============================================
  // F3 · Reintento sin `recordIncorrect()`
  // ============================================

  it('Números Hanzi gana reintento con firstTry=false sin emitir errores', () => {
    startSession(session, 'hanzi-numbers');
    // Así lo emite el juego: falló el primer toque y aun así terminó la ronda.
    // No hay `recordIncorrect()`; el juego pasa `firstTry: false` en `recordCorrect`.
    playRound(session, { firstTry: false });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.retry.1');
  });

  it('Construye el Kanji gana reintento con firstTry=false sin emitir errores', () => {
    startSession(session, 'japanese-kanji-compose');
    playRound(session, { firstTry: false });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(1);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.retry.1');
  });

  it('un acierto a la primera no cuenta reintento', () => {
    startSession(session, 'hanzi-numbers');
    playRound(session, { firstTry: true, perfectRound: true });

    expect(profileState.profile?.badgeStats.retrySuccess).toBe(0);
  });

  // ============================================
  // F2 · Rondas perfectas
  // ============================================

  it('tres rondas perfectas seguidas dejan perfectRounds = 3', () => {
    startSession(session);
    // Sin `firstTry`: así el único contador que cambia es `perfectRounds`, que es
    // justo el campo que `sameStats` olvidaba comparar (F2).
    for (let i = 0; i < 3; i++) playRound(session, { perfectRound: true });

    expect(profileState.profile?.badgeStats.perfectRounds).toBe(3);
    expect(profileState.profile?.badges.map(b => b.id)).toContain('effort.perfect.3');
  });

  it('una ronda perfecta que no gana insignia igual se guarda', () => {
    startSession(session);
    playRound(session, { perfectRound: true });
    playRound(session, { perfectRound: true });
    service.flushStats();

    expect(profileState.profile?.badgeStats.perfectRounds).toBe(2);
  });

  // ============================================
  // Nivel y juego completo
  // ============================================

  it('subir de nivel al bronce da insignia de juego y de mundo', () => {
    startSession(session);
    // maxLevel 12 → bronce en el nivel 3; hacen falta dos subidas de nivel (10 aciertos).
    for (let i = 0; i < 10; i++) playRound(session, { firstTry: true });

    const ids = profileState.profile?.badges.map(b => b.id) ?? [];
    expect(ids).toContain('hanzi-numbers.bronze');
    expect(ids).toContain('cat.chinese.bronze');
  });

  it('cambio de perfil a mitad de sesión no premia al perfil nuevo', () => {
    startSession(session);
    const oldProfile = profileState.profile!;
    profileState.profile = createInitialProfile('Sol', 6, '🐙', 'ocean');

    playRound(session, { wrong: 1 });

    expect(profileState.profile?.badges).toHaveLength(0);
    expect(oldProfile.badges).toHaveLength(0);
  });
});
