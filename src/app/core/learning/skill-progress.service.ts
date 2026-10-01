/**
 * Servicio de progreso de skills - Versión mínima Fase 2
 * Registra AttemptRecord y actualiza SkillProgress por perfil
 * Fase 2: Primer juego japonés
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  AttemptRecord,
  SkillProgress,
  LearningMistake,
  SkillDefinition,
  RepresentationType
} from './learning-content';
import { ProfileStateService } from '../services/profile-state';
import { GameProgressService } from '../games/game-progress.service';

const SKILL_PROGRESS_STORAGE_KEY = 'brainyLearning_skillProgress';
const ATTEMPTS_STORAGE_KEY = 'brainyLearning_attempts';
const MISTAKES_STORAGE_KEY = 'brainyLearning_mistakes';

function emptyByRepresentation(): Record<RepresentationType, { attempts: number; correct: number; accuracy: number }> {
  return {
    image: { attempts: 0, correct: 0, accuracy: 0 },
    hiragana: { attempts: 0, correct: 0, accuracy: 0 },
    kanji: { attempts: 0, correct: 0, accuracy: 0 },
    audio: { attempts: 0, correct: 0, accuracy: 0 },
    romaji: { attempts: 0, correct: 0, accuracy: 0 }
  };
}

@Injectable({ providedIn: 'root' })
export class SkillProgressService {
  private readonly profileState = inject(ProfileStateService);
  private readonly gameProgress = inject(GameProgressService);

  // Cache reactivo
  private _skillProgress = signal<Record<string, SkillProgress>>({});
  private _attempts = signal<AttemptRecord[]>([]);
  private _mistakes = signal<LearningMistake[]>([]);

  readonly skillProgress = this._skillProgress.asReadonly();
  readonly attempts = this._attempts.asReadonly();
  readonly mistakes = this._mistakes.asReadonly();

  constructor() {
    this._loadFromStorage();
  }

  // ============================================
  // CARGA / GUARDADO
  // ============================================

  private _loadFromStorage(): void {
    try {
      const progressRaw = localStorage.getItem(SKILL_PROGRESS_STORAGE_KEY);
      if (progressRaw) this._skillProgress.set(JSON.parse(progressRaw));

      const attemptsRaw = localStorage.getItem(ATTEMPTS_STORAGE_KEY);
      if (attemptsRaw) this._attempts.set(JSON.parse(attemptsRaw));

      const mistakesRaw = localStorage.getItem(MISTAKES_STORAGE_KEY);
      if (mistakesRaw) this._mistakes.set(JSON.parse(mistakesRaw));
    } catch (e) {
      console.warn('[SkillProgress] Error cargando de localStorage:', e);
    }
  }

  private _saveToStorage(): void {
    try {
      localStorage.setItem(SKILL_PROGRESS_KEY, JSON.stringify(this._skillProgress()));
      localStorage.setItem(ATTEMPTS_STORAGE_KEY, JSON.stringify(this._attempts()));
      localStorage.setItem(MISTAKES_STORAGE_KEY, JSON.stringify(this._mistakes()));
    } catch (e) {
      console.warn('[SkillProgress] Error guardando en localStorage:', e);
    }
  }

  // ============================================
  // API PÚBLICA - REGISTRO
  // ============================================

  /**
   * Registra un intento y actualiza progreso de skill
   */
  recordAttempt(attempt: AttemptRecord): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    const skillKey = this._skillKey(profile.id, attempt.skillId);

    // Añadir al historial de intentos
    this._attempts.update(list => [...list, attempt].slice(-1000)); // Máx 1000

    // Actualizar progreso de la skill
    this._skillProgress.update(current => {
      const existing = current[skillKey] || this._emptySkillProgress(attempt.skillId);
      const newAttempts = existing.attempts + 1;
      const newCorrect = existing.correct + (attempt.correct ? 1 : 0);

      // Actualizar por representación
      const byRep = { ...existing.byRepresentation } as Record<RepresentationType, { attempts: number; correct: number; accuracy: number }>;
      const repKey = attempt.representation;
      if (!byRep[repKey]) {
        byRep[repKey] = { attempts: 0, correct: 0, accuracy: 0 };
      }
      byRep[repKey].attempts++;
      if (attempt.correct) byRep[repKey].correct++;
      byRep[repKey].accuracy = byRep[repKey].correct / byRep[repKey].attempts;

      return {
        ...current,
        [skillKey]: {
          ...existing,
          attempts: newAttempts,
          correct: newCorrect,
          accuracy: newAttempts > 0 ? newCorrect / newAttempts : 0,
          mastery: this._calculateMastery(newCorrect, newAttempts, existing.lastPracticedAt),
          lastPracticedAt: attempt.timestamp,
          byRepresentation: byRep
        }
      };
    });

    this._saveToStorage();
  }

  /**
   * Registra un error para análisis pedagógico futuro
   */
  recordMistake(mistake: LearningMistake): void {
    this._mistakes.update(list => [...list, mistake].slice(-500)); // Máx 500
    this._saveToStorage();
  }

  /**
   * Obtiene progreso de una skill para el perfil activo
   */
  getSkillProgress(skillId: string): SkillProgress | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const skillKey = this._skillKey(profile.id, skillId);
    return this._skillProgress()[skillKey] || null;
  }

  /**
   * Obtiene todo el progreso de skills para el perfil activo
   */
  getAllSkillProgress(): SkillProgress[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];

    const prefix = `${profile.id}:`;
    return Object.entries(this._skillProgress())
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);
  }

  /**
   * Obtiene intentos recientes para una skill
   */
  getRecentAttempts(skillId: string, limit: number = 20): AttemptRecord[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];

    return this._attempts()
      .filter(a => a.skillId === skillId && a.profileId === profile.id)
      .slice(-limit)
      .reverse();
  }

  /**
   * Obtiene errores para una skill
   */
  getMistakes(skillId: string): LearningMistake[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];

    return this._mistakes()
      .filter(m => m.skillId === skillId && m.profileId === profile.id);
  }

  /**
   * Verifica si una skill está "dominada" (umbral simple para Fase 2)
   */
  isSkillMastered(skillId: string, threshold: number = 0.85, minAttempts: number = 10): boolean {
    const progress = this.getSkillProgress(skillId);
    if (!progress) return false;
    return progress.attempts >= minAttempts && progress.accuracy >= threshold;
  }

  /**
   * Obtiene skills que necesitan práctica (baja accuracy, mucho tiempo sin practicar)
   */
  getSkillsNeedingPractice(maxAge: number = 4, minAttempts: number = 5): SkillProgress[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];

    const now = Date.now();
    const dayMs = 24 * 60 * 60 * 1000;

    return this.getAllSkillProgress().filter(sp => {
      if (sp.attempts < minAttempts) return true; // Poco practicada
      if (sp.accuracy < 0.7) return true; // Baja precisión
      if (now - sp.lastPracticedAt > 7 * dayMs) return true; // Una semana sin practicar
      return false;
    });
  }

  // ============================================
  // PRIVADOS
  // ============================================

  private _skillKey(profileId: string, skillId: string): string {
    return `${profileId}:${skillId}`;
  }

  private _emptySkillProgress(skillId: string): SkillProgress {
    return {
      skillId,
      attempts: 0,
      correct: 0,
      accuracy: 0,
      mastery: 0,
      lastPracticedAt: 0,
      byRepresentation: emptyByRepresentation()
    };
  }

  private _calculateMastery(correct: number, attempts: number, lastPracticedAt: number): number {
    if (attempts === 0) return 0;
    const accuracy = correct / attempts;
    const recencyFactor = Math.max(0.5, 1 - (Date.now() - lastPracticedAt) / (30 * 24 * 60 * 60 * 1000)); // Decae en 30 días
    const volumeFactor = Math.min(1, attempts / 20); // Satura en 20 intentos
    return accuracy * 0.7 + recencyFactor * 0.2 + volumeFactor * 0.1;
  }
}

// Constantes para storage keys (fix typo above)
const SKILL_PROGRESS_KEY = 'brainyLearning_skillProgress';