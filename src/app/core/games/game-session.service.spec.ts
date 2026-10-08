import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { GameSessionService } from './game-session.service';
import { ProfileStateService } from '../services/profile-state';

/** Estado para no tocar el perfil real ni Firestore */
class ProfileStateStub {
  activeProfile = () => null;
  activePlayerAge = () => 4;
  getGameLevel = () => 1;
  isGameCompleted = () => false;
  saveGameProgress = () => {};
}

describe('GameSessionService', () => {
  let service: GameSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GameSessionService, { provide: ProfileStateService, useClass: ProfileStateStub }],
    });
    service = TestBed.inject(GameSessionService);
  });

  it('registra un acierto y sube la racha', () => {
    service.startSession({
      gameId: 'test',
      sessionDurationMs: 60_000,
      requiredCorrectForLevelUp: 3,
      maxLevel: 10,
      initialLevel: 1,
    });

    expect(service.recordCorrect().leveledUp).toBe(false);
    expect(service.consecutiveCorrect()).toBe(1);

    service.recordCorrect();
    expect(service.recordCorrect().leveledUp).toBe(true);
    expect(service.currentLevel()).toBe(2);
  });

  it('un error rompe la racha', () => {
    service.startSession({
      gameId: 'test',
      sessionDurationMs: 60_000,
      requiredCorrectForLevelUp: 3,
      maxLevel: 10,
      initialLevel: 1,
    });

    service.recordCorrect();
    service.recordIncorrect();
    expect(service.consecutiveCorrect()).toBe(0);
  });

  it('NO borra la sesión que arrancó después de terminar otra', async () => {
    // Regresión: endSession() programa un setTimeout(..., 0) que ponía el estado a null.
    // Si otro componente llamaba a startSession() antes de que corriera ese macrotask,
    // su sesión quedaba muerta y ya no aceptaba ni un acierto.
    service.startSession({
      gameId: 'viejo',
      sessionDurationMs: 60_000,
      requiredCorrectForLevelUp: 3,
      maxLevel: 10,
      initialLevel: 1,
    });
    service.endSession('user-exit'); // como hace ngOnDestroy de un juego

    // El siguiente juego arranca en la MISMA tarea, antes de que corra el macrotask
    service.startSession({
      gameId: 'nuevo',
      sessionDurationMs: 60_000,
      requiredCorrectForLevelUp: 3,
      maxLevel: 10,
      initialLevel: 5,
    });

    await new Promise(resolve => setTimeout(resolve, 5));

    expect(service.state()).not.toBeNull();
    expect(service.state()?.gameId).toBe('nuevo');
    expect(service.currentLevel()).toBe(5);
    expect(service.recordCorrect().leveledUp).toBe(false);
    expect(service.consecutiveCorrect()).toBe(1);
  });
});