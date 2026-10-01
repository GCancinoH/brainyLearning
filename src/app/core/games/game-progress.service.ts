/**
 * Servicio de persistencia de progreso de juegos por perfil
 * Compatible con datos existentes (SpaceAddition)
 * Fase 1: Motor común mínimo
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import { ProfileStateService } from '../services/profile-state';
import { GameProgress, LegacyGameProgress } from './game-types';

const STORAGE_KEY = 'brainyLearning_gameProgress';

@Injectable({ providedIn: 'root' })
export class GameProgressService {
  private readonly profileState = inject(ProfileStateService);

  // Cache local reactivo
  private _progressCache = signal<Record<string, GameProgress>>({});

  readonly progress = this._progressCache.asReadonly();

  constructor() {
    // Cargar desde localStorage al iniciar
    this._loadFromStorage();
  }

  // ============================================
  // CARGA / GUARDADO
  // ============================================

  private _loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          this._progressCache.set(parsed);
        }
      }
    } catch (e) {
      console.warn('[GameProgress] Error cargando de localStorage:', e);
    }
  }

  private _saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._progressCache()));
    } catch (e) {
      console.warn('[GameProgress] Error guardando en localStorage:', e);
    }
  }

  // ============================================
  // API PÚBLICA
  // ============================================

  /**
   * Obtiene el progreso de un juego para el perfil activo
   * Compatible con formato legacy (solo level + completed)
   */
  getProgress(gameId: string): GameProgress | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const cacheKey = this._cacheKey(profile.id, gameId);
    const cached = this._progressCache()[cacheKey];

    if (cached) {
      return cached;
    }

    // Fallback: leer del perfil (formato legacy SpaceAddition)
    const legacy = this._readLegacyFromProfile(profile, gameId);
    if (legacy) {
      const migrated = this._migrateLegacy(gameId, legacy);
      this._progressCache.update(c => ({ ...c, [cacheKey]: migrated }));
      return migrated;
    }

    return null;
  }

  /**
   * Obtiene solo el nivel actual (para compatibilidad rápida)
   */
  getLevel(gameId: string): number {
    const progress = this.getProgress(gameId);
    if (progress) return progress.level;

    // Fallback directo al profileState (lo que usa SpaceAddition hoy)
    return this.profileState.getGameLevel(gameId);
  }

  /**
   * Verifica si un juego está completado
   */
  isCompleted(gameId: string): boolean {
    const progress = this.getProgress(gameId);
    if (progress) return progress.completed;
    return this.profileState.isGameCompleted(gameId);
  }

  /**
   * Guarda progreso completo (nuevo formato)
   */
  saveProgress(gameId: string, progress: Partial<GameProgress> & { level: number }): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    const cacheKey = this._cacheKey(profile.id, gameId);
    const existing = this._progressCache()[cacheKey];

    const updated: GameProgress = {
      gameId,
      level: progress.level,
      completed: progress.completed ?? existing?.completed ?? false,
      totalAttempts: (existing?.totalAttempts ?? 0) + (progress.totalAttempts ?? 0),
      totalCorrect: (existing?.totalCorrect ?? 0) + (progress.totalCorrect ?? 0),
      totalIncorrect: (existing?.totalIncorrect ?? 0) + (progress.totalIncorrect ?? 0),
      accuracy: 0, // Se recalcula abajo
      bestStreak: Math.max(existing?.bestStreak ?? 0, progress.bestStreak ?? 0),
      lastPlayedAt: Date.now(),
      totalPlayTimeMs: (existing?.totalPlayTimeMs ?? 0) + (progress.totalPlayTimeMs ?? 0)
    };

    // Recalcular accuracy
    const total = updated.totalAttempts;
    updated.accuracy = total > 0 ? updated.totalCorrect / total : 0;

    this._progressCache.update(c => ({ ...c, [cacheKey]: updated }));
    this._saveToStorage();

    // Sincronizar con profileState (formato legacy) para compatibilidad
    this.profileState.saveGameProgress(gameId, updated.level, updated.completed);
  }

  /**
   * Registra una sesión completada (para métricas acumuladas)
   */
  recordSession(gameId: string, sessionData: {
    level: number;
    attempts: number;
    correct: number;
    incorrect: number;
    playTimeMs: number;
    bestStreak: number;
    completed?: boolean;
  }): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    const cacheKey = this._cacheKey(profile.id, gameId);
    const existing = this._progressCache()[cacheKey];

    const newTotalAttempts = (existing?.totalAttempts ?? 0) + sessionData.attempts;
    const newTotalCorrect = (existing?.totalCorrect ?? 0) + sessionData.correct;
    const newTotalIncorrect = (existing?.totalIncorrect ?? 0) + sessionData.incorrect;

    const updated: GameProgress = {
      gameId,
      level: Math.max(existing?.level ?? 1, sessionData.level),
      completed: sessionData.completed ?? existing?.completed ?? false,
      totalAttempts: newTotalAttempts,
      totalCorrect: newTotalCorrect,
      totalIncorrect: newTotalIncorrect,
      accuracy: newTotalAttempts > 0 ? newTotalCorrect / newTotalAttempts : 0,
      bestStreak: Math.max(existing?.bestStreak ?? 0, sessionData.bestStreak),
      lastPlayedAt: Date.now(),
      totalPlayTimeMs: (existing?.totalPlayTimeMs ?? 0) + sessionData.playTimeMs
    };

    this._progressCache.update(c => ({ ...c, [cacheKey]: updated }));
    this._saveToStorage();

    // Sync legacy
    this.profileState.saveGameProgress(gameId, updated.level, updated.completed);
  }

  /**
   * Reinicia progreso de un juego (para testing o nuevo perfil)
   */
  resetProgress(gameId: string): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    const cacheKey = this._cacheKey(profile.id, gameId);
    this._progressCache.update(c => {
      const next = { ...c };
      delete next[cacheKey];
      return next;
    });
    this._saveToStorage();

    // También limpiar del profileState
    this.profileState.saveGameProgress(gameId, 1, false);
  }

  /**
   * Obtiene todo el progreso del perfil activo (para dashboard/stats)
   */
  getAllProgress(): GameProgress[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];

    const prefix = `${profile.id}:`;
    return Object.entries(this._progressCache())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  }

  // ============================================
  // MIGRACIÓN LEGACY (SpaceAddition)
  // ============================================

  private _readLegacyFromProfile(profile: { mathProgress?: Record<string, unknown> }, gameId: string): { level: number; completed: boolean } | null {
    const legacy = profile.mathProgress?.[gameId] as { level?: unknown; completed?: unknown } | undefined;
    if (legacy && typeof legacy.level === 'number') {
      return { level: legacy.level, completed: !!legacy.completed };
    }
    return null;
  }

  private _migrateLegacy(gameId: string, legacy: LegacyGameProgress): GameProgress {
    return {
      gameId,
      level: legacy.level,
      completed: legacy.completed,
      totalAttempts: 0,      // Desconocido en legacy
      totalCorrect: 0,
      totalIncorrect: 0,
      accuracy: 0,
      bestStreak: 0,
      lastPlayedAt: Date.now(),
      totalPlayTimeMs: 0
    };
  }

  private _cacheKey(profileId: string, gameId: string): string {
    return `${profileId}:${gameId}`;
  }
}