/**
 * Servicio de sesión de juego - Infraestructura común
 * Maneja: timer, nivel, racha, contadores, finalización, limpieza
 */

import { Service, signal, computed, effect, OnDestroy } from '@angular/core';
import { inject } from '@angular/core';
import { GameSessionState, GameSessionConfig, SessionEvent, SessionEventType, ProfileGameConfig, getProfileGameConfig } from './game-types';
import { ProfileStateService } from '../services/profile-state';

@Service()
export class GameSessionService implements OnDestroy {
  private readonly profileState = inject(ProfileStateService);

  // ============================================
  // ESTADO INTERNO (Signals)
  // ============================================
  private _state = signal<GameSessionState | null>(null);
  private _config: GameSessionConfig | null = null;
  private _sessionTimer: ReturnType<typeof setTimeout> | null = null;
  private _tickInterval: ReturnType<typeof setInterval> | null = null;
  private _eventListeners: Set<(event: SessionEvent) => void> = new Set();
  private _pausedAt = signal<number | null>(null);
  readonly isPaused = computed(() => this._pausedAt() !== null);

  // ============================================
  // SELECTORES PÚBLICOS (readonly signals)
  // ============================================
  readonly state = this._state.asReadonly();
  readonly currentLevel = computed(() => this._state()?.level ?? 1);
  readonly consecutiveCorrect = computed(() => this._state()?.consecutiveCorrect ?? 0);
  readonly attempts = computed(() => this._state()?.attempts ?? 0);
  readonly correctAnswers = computed(() => this._state()?.correctAnswers ?? 0);
  readonly incorrectAnswers = computed(() => this._state()?.incorrectAnswers ?? 0);
  readonly isTimeUp = computed(() => this._state()?.isTimeUp ?? false);
  readonly isCompleted = computed(() => this._state()?.isCompleted ?? false);
  readonly sessionElapsedMs = computed(() => {
    const s = this._state();
    if (!s) return 0;
    if (s.isTimeUp || s.isCompleted) return s.sessionDurationMs;
    const reference = this._pausedAt() ?? Date.now();
    return reference - s.sessionStartedAt;
  });
  readonly sessionRemainingMs = computed(() => {
    const s = this._state();
    if (!s) return 0;
    const elapsed = this.sessionElapsedMs();
    return Math.max(0, s.sessionDurationMs - elapsed);
  });
  readonly progressPercent = computed(() => {
    const s = this._state();
    if (!s) return 0;
    return Math.min(100, (this.sessionElapsedMs() / s.sessionDurationMs) * 100);
  });
  readonly canLevelUp = computed(() => {
    const s = this._state();
    if (!s) return false;
    return s.consecutiveCorrect >= s.requiredCorrectForLevelUp && s.level < s.maxLevel;
  });

  // ============================================
  // CICLO DE VIDA DE SESIÓN
  // ============================================

  /**
   * Inicia una nueva sesión de juego
   */
  startSession(config: GameSessionConfig, profileAge?: number): GameSessionState {
    // Si ya hay sesión activa, la terminamos limpiamente
    if (this._state()) {
      this.endSession('new-session');
    }

    // Aplicar configuración por perfil si se proporciona edad
    let sessionDuration = config.sessionDurationMs;
    let requiredCorrect = config.requiredCorrectForLevelUp;
    let initialLevel = config.initialLevel ?? 1;

    if (profileAge !== undefined) {
      const profileConfig = getProfileGameConfig(profileAge);
      sessionDuration = profileConfig.sessionDurationMs;
      // requiredCorrect y initialLevel se mantienen del config del juego
    }

    const now = Date.now();
    const newState: GameSessionState = {
      gameId: config.gameId,
      level: initialLevel,
      consecutiveCorrect: 0,
      attempts: 0,
      correctAnswers: 0,
      incorrectAnswers: 0,
      sessionStartedAt: now,
      sessionDurationMs: sessionDuration,
      isTimeUp: false,
      isCompleted: false,
      requiredCorrectForLevelUp: requiredCorrect,
      maxLevel: config.maxLevel
    };

    this._config = { ...config, sessionDurationMs: sessionDuration };
    this._state.set(newState);
    this._startTimers(sessionDuration);
    this._emitEvent({ type: 'session-start', gameId: config.gameId, timestamp: now });

    return newState;
  }

  /**
   * Reanuda una sesión existente (ej. al volver de background)
   */
  resumeSession(savedState: GameSessionState): void {
    if (this._state()) {
      this.endSession('resume');
    }

    const remaining = Math.max(0, savedState.sessionDurationMs - (Date.now() - savedState.sessionStartedAt));
    this._config = {
      gameId: savedState.gameId,
      sessionDurationMs: savedState.sessionDurationMs,
      requiredCorrectForLevelUp: savedState.requiredCorrectForLevelUp,
      maxLevel: savedState.maxLevel
    };
    this._state.set({ ...savedState, sessionStartedAt: Date.now() - (savedState.sessionDurationMs - remaining) });
    this._startTimers(remaining);
  }

  /**
   * Finaliza la sesión actual
   */
  endSession(reason: 'complete' | 'time-up' | 'user-exit' | 'new-session' | 'resume' = 'user-exit'): GameSessionState | null {
    const currentState = this._state();
    if (!currentState) return null;

    this._cleanupTimers();
    const endedAt = this._pausedAt() ?? Date.now();
    this._pausedAt.set(null);
    const finalState: GameSessionState = {
      ...currentState,
      isCompleted: reason === 'complete' || reason === 'time-up',
      isTimeUp: reason === 'time-up',
      sessionDurationMs: endedAt - currentState.sessionStartedAt
    };

    this._state.set(finalState);
    this._emitEvent({
      type: reason === 'time-up' ? 'time-up' : 'session-end',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { reason, finalLevel: finalState.level }
    });

    // Limpiar estado tras emitir evento (para que componentes reaccionen)
    setTimeout(() => this._state.set(null), 0);

    return finalState;
  }

  pause(): void {
    const s = this._state();
    if (!s || s.isTimeUp || s.isCompleted || this._pausedAt() !== null) return;
    this._cleanupTimers();
    this._pausedAt.set(Date.now());
  }

  resume(): void {
    const s = this._state();
    const pausedAt = this._pausedAt();
    if (!s || pausedAt === null) return;

    const pausedFor = Date.now() - pausedAt;
    const elapsedAtPause = pausedAt - s.sessionStartedAt;
    const remaining = Math.max(0, s.sessionDurationMs - elapsedAtPause);

    this._pausedAt.set(null);
    // se corre el inicio para que el tiempo en pausa no cuente
    this._state.update(cur => cur ? { ...cur, sessionStartedAt: cur.sessionStartedAt + pausedFor } : null);
    this._startTimers(remaining);
  }

  /**
   * Fuerza fin de sesión por tiempo agotado
   */
  forceTimeUp(): void {
    const currentState = this._state();
    if (currentState && !currentState.isTimeUp) {
      this._state.update(s => s ? { ...s, isTimeUp: true } : null);
      this.endSession('time-up');
    }
  }

  // ============================================
  // REGISTRO DE RESULTADOS
  // ============================================

  /**
   * Registra un acierto
   */
  recordCorrect(): { leveledUp: boolean; newLevel: number } {
    const currentState = this._state();
    if (!currentState || currentState.isTimeUp || currentState.isCompleted || this._pausedAt() !== null) {
      return { leveledUp: false, newLevel: currentState?.level ?? 1 } as const;
    }

    const newConsecutive = currentState.consecutiveCorrect + 1;
    const newCorrect = currentState.correctAnswers + 1;
    const newAttempts = currentState.attempts + 1;

    this._state.update(s => s ? {
      ...s,
      consecutiveCorrect: newConsecutive,
      correctAnswers: newCorrect,
      attempts: newAttempts
    } : null);

    this._emitEvent({
      type: 'answer-correct',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { consecutiveCorrect: newConsecutive, level: currentState.level }
    });

    // Verificar subida de nivel
    if (newConsecutive >= currentState.requiredCorrectForLevelUp && currentState.level < currentState.maxLevel) {
      return this._levelUp();
    }

    this._emitEvent({
      type: 'streak-update',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { streak: newConsecutive }
    });

    return { leveledUp: false, newLevel: currentState.level };
  }

  /**
   * Registra un error
   */
  recordIncorrect(): void {
    const currentState = this._state();
    if (!currentState || currentState.isTimeUp || currentState.isCompleted) return;

    const newIncorrect = currentState.incorrectAnswers + 1;
    const newAttempts = currentState.attempts + 1;
    const newConsecutive = 0; // Rompe la racha

    this._state.update(s => s ? {
      ...s,
      incorrectAnswers: newIncorrect,
      attempts: newAttempts,
      consecutiveCorrect: newConsecutive
    } : null);

    this._emitEvent({
      type: 'answer-incorrect',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { level: currentState.level, streakBroken: true }
    });

    this._emitEvent({
      type: 'streak-update',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { streak: 0 }
    });
  }

  // ============================================
  // PRIVADOS
  // ============================================

  private _levelUp(): { leveledUp: boolean; newLevel: number } {
    const currentState = this._state();
    if (!currentState) return { leveledUp: false, newLevel: 1 };

    const newLevel = currentState.level + 1;
    const isMaxLevel = newLevel >= currentState.maxLevel;

    this._state.update(s => s ? {
      ...s,
      level: newLevel,
      consecutiveCorrect: 0,
      isCompleted: isMaxLevel
    } : null);

    this._emitEvent({
      type: 'level-up',
      gameId: currentState.gameId,
      timestamp: Date.now(),
      payload: { newLevel, isMaxLevel }
    });

    if (isMaxLevel) {
      this._emitEvent({
        type: 'game-complete',
        gameId: currentState.gameId,
        timestamp: Date.now(),
        payload: { finalLevel: newLevel }
      });
      // Auto-finalizar si se completó el juego
      setTimeout(() => this.endSession('complete'), 3000);
    }

    return { leveledUp: true, newLevel };
  }

  private _startTimers(durationMs: number): void {
    // Timer principal de fin de sesión
    this._sessionTimer = setTimeout(() => {
      this.forceTimeUp();
    }, durationMs);

    // Tick cada segundo para actualizar UI de tiempo restante
    this._tickInterval = setInterval(() => {
      const state = this._state();
      if (state && !state.isTimeUp && !state.isCompleted) {
        // Trigger change detection via signal update (noop update)
        this._state.update(s => s ? { ...s } : null);
      }
    }, 1000);
  }

  private _cleanupTimers(): void {
    if (this._sessionTimer) {
      clearTimeout(this._sessionTimer);
      this._sessionTimer = null;
    }
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  private _emitEvent(event: SessionEvent): void {
    this._eventListeners.forEach(listener => {
      try { listener(event); } catch (e) { console.warn('Session event listener error:', e); }
    });
  }

  // ============================================
  // EVENTOS (Observer pattern simple)
  // ============================================

  /**
   * Suscribe a eventos de sesión
   * Retorna función de cleanup
   */
  onEvent(listener: (event: SessionEvent) => void): () => void {
    this._eventListeners.add(listener);
    return () => this._eventListeners.delete(listener);
  }

  // ============================================
  // ONDESTROY
  // ============================================

  ngOnDestroy(): void {
    this._cleanupTimers();
    this._eventListeners.clear();
    this._state.set(null);
    this._config = null;
    this._pausedAt.set(null);
  }
}
