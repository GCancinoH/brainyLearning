/**
 * Engine del juego "¿Qué escuchaste?" - Lógica pedagógica separada de UI
 * Fase 2: Primer juego japonés
**/
import { inject, Service, signal } from '@angular/core';
import {
  JapaneseWord,
  RepresentationType,
  ProfileDifficultyConfig,
  AttemptRecord,
  LearningMistake
} from './learning-content';
import { LearningContentService } from './learning-content.service';
import { SkillProgressService } from './skill-progress.service';
import { ProfileStateService } from '../services/profile-state';

/* Engine Types */
export interface ListeningQuestion {
  word: JapaneseWord;
  questionRepresentation: RepresentationType;
  answerRepresentation: RepresentationType;
  options: JapaneseWord[];
  correctIndex: number;
}

export interface ListeningAnswer {
  selectedWordId: string;
  correct: boolean;
  responseTimeMs: number;
}

export interface ListeningEngineConfig {
  gameId: string;
  targetSkills: string[];
  category?: string;
  maxDifficulty?: number;  // ← AÑADIR: nivel/dificultad máxima según nivel actual
}

@Service()
export class ListeningGameEngine {
  // Inyección moderna de dependencias mediante inject()
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly profileState = inject(ProfileStateService);

  // Buffer de recencia usando Signal interna para trazabilidad
  private readonly _recentWordIds = signal<string[]>([]);
  private readonly RECENT_BUFFER_SIZE = 3;

  // Selector de solo lectura por si la UI o DevTools quieren ver el buffer
  readonly recentWordIds = this._recentWordIds.asReadonly();

  /**
   * Limpia el historial de palabras recientes
   */
  resetHistory(): void {
    this._recentWordIds.set([]);
  }

  /**
   * Genera una nueva pregunta basada en el perfil y configuración
   */
  generateQuestion(config: ListeningEngineConfig): ListeningQuestion | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const age = profile.age;
    const profileConfig = this.contentService.activeProfileConfig();
    const currentLevel = config.maxDifficulty ?? 1;  // Usar nivel pasado

    // Obtener palabras disponibles — USAR TODAS LAS SKILLS OBJETIVO
    let candidateWords: JapaneseWord[] = [];
    for (const skillId of config.targetSkills) {
      candidateWords = [...candidateWords, ...this.contentService.getWordsForSkill(skillId)];
    }
    // Unir sin duplicados
    candidateWords = Array.from(new Map(candidateWords.map(w => [w.id, w])).values());

    if (config.category) {
      candidateWords = candidateWords.filter(w => w.category === config.category);
    }

    // Filtrar por dificultad según nivel actual
    const maxDiff = Math.min(currentLevel + 1, 10);  // Nivel actual + 1 como techo
    candidateWords = candidateWords.filter(w => w.difficulty <= maxDiff && w.recommendedAgeMin <= age);

    if (candidateWords.length === 0) return null;

    // --- FILTRO DE RECENCIA ANTI-REPETICIÓN ---
    const currentBuffer = this._recentWordIds();
    let filteredCandidates = candidateWords.filter(w => !currentBuffer.includes(w.id));

    // Fallback si el pool es menor que el buffer
    if (filteredCandidates.length === 0) {
      const lastWordId = currentBuffer[currentBuffer.length - 1];
      filteredCandidates = candidateWords.filter(w => w.id !== lastWordId);

      if (filteredCandidates.length === 0) {
        filteredCandidates = candidateWords;
      }
    }

    // Seleccionar palabra objetivo de forma aleatoria sobre los candidatos filtrados
    const targetWord = filteredCandidates[Math.floor(Math.random() * filteredCandidates.length)];

    // Registrar en el historial de recencia
    this._trackRecentWord(targetWord.id);

    // Determinar representaciones
    const questionRep = this._selectQuestionRepresentation(profileConfig, targetWord, age);
    const answerRep = this._selectAnswerRepresentation(profileConfig, targetWord, age);

    // Generar opciones distractoras
    const numOptions = Math.min(
      profileConfig.maxOptions,
      Math.max(profileConfig.minOptions, candidateWords.length)
    );
    const distractors = this.contentService.getDistractors(
      targetWord,
      numOptions - 1,
      profileConfig.distractorStrategy,
      age,
      maxDiff
    );

    // Mezclar opciones con Fisher-Yates shuffle
    const allOptions = [targetWord, ...distractors];
    for (let i = allOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allOptions[i], allOptions[j]] = [allOptions[j], allOptions[i]];
    }
    const correctIndex = allOptions.findIndex(w => w.id === targetWord.id);

    return {
      word: targetWord,
      questionRepresentation: questionRep,
      answerRepresentation: answerRep,
      options: allOptions,
      correctIndex
    };
  }

  /**
   * Valida la respuesta
   */
  validateAnswer(question: ListeningQuestion, answer: ListeningAnswer): boolean {
    return answer.selectedWordId === question.word.id;
  }

  /**
   * Registra el intento y actualiza skills
   */
  recordAttempt(
    question: ListeningQuestion,
    answer: ListeningAnswer,
    config: ListeningEngineConfig
  ): { attempt: AttemptRecord; mistake?: LearningMistake } {
    const profile = this.profileState.activeProfile();
    if (!profile) throw new Error('No active profile');

    const attempt: AttemptRecord = {
      skillId: config.targetSkills[0],
      contentId: question.word.id,
      correct: answer.correct,
      responseTimeMs: answer.responseTimeMs,
      difficulty: question.word.difficulty,
      representation: question.questionRepresentation,
      timestamp: Date.now(),
      profileAge: profile.age,
      profileId: profile.id
    };

    this.skillProgress.recordAttempt(attempt);

    let mistake: LearningMistake | undefined;
    if (!answer.correct) {
      const selectedWord = question.options.find(w => w.id === answer.selectedWordId);
      mistake = {
        skillId: config.targetSkills[0],
        contentId: question.word.id,
        expected: question.word.hiragana,
        answered: selectedWord?.hiragana ?? answer.selectedWordId,
        mistakeType: undefined,
        representation: question.questionRepresentation,
        timestamp: Date.now(),
        profileId: profile.id
      };
      this.skillProgress.recordMistake(mistake);
    }

    return { attempt, mistake };
  }

  /**
   * Determina siguiente dificultad
   */
  getNextDifficulty(currentDifficulty: number, recentAccuracy: number): number {
    if (recentAccuracy > 0.85 && currentDifficulty < 10) return currentDifficulty + 1;
    if (recentAccuracy < 0.6 && currentDifficulty > 1) return currentDifficulty - 1;
    return currentDifficulty;
  }

  /* Privados */
  private _trackRecentWord(wordId: string): void {
    this._recentWordIds.update(history => {
      const updated = [...history, wordId];
      // Buffer dinámico: min(3, pool - 1) para pools pequeños
      // El pool real se conoce en generateQuestion, pero aquí usamos un valor conservador
      const maxSize = Math.min(this.RECENT_BUFFER_SIZE, Math.max(1, 10 - 1));
      if (updated.length > maxSize) updated.shift();
      return updated;
    });
  }

  private _selectQuestionRepresentation(
    config: ProfileDifficultyConfig,
    word: JapaneseWord,
    age: number
  ): RepresentationType {
    // Si perfil preescolar (requiresReading === false), FORZAR audio
    if (!config.requiresReading) return 'audio';
    const allowed = config.allowedQuestionRepresentations;
    const available = this.contentService.getAvailableRepresentations(word, age);
    const allowedAvailable = available.filter(r => allowed.includes(r.type));

    const priority: RepresentationType[] = ['audio', 'hiragana', 'kanji', 'image'];
    for (const p of priority) {
      if (allowedAvailable.some(r => r.type === p)) return p;
    }
    return 'audio';
  }

  private _selectAnswerRepresentation(
    config: ProfileDifficultyConfig,
    word: JapaneseWord,
    age: number
  ): RepresentationType {
    if (!config.requiresReading) return 'image';
    const allowed = config.allowedAnswerRepresentations;
    const available = this.contentService.getAvailableRepresentations(word, age);
    const allowedAvailable = available.filter(r => allowed.includes(r.type));

    const priority: RepresentationType[] = ['image', 'hiragana', 'kanji'];
    for (const p of priority) {
      if (allowedAvailable.some(r => r.type === p)) return p;
    }
    return 'image';
  }
}
