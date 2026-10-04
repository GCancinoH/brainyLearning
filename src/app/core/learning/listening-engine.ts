/**
 * Engine del juego "¿Qué escuchaste?" - Lógica pedagógica separada de UI
 * Fase 2: Primer juego japonés
**/
import { inject, Service, signal } from '@angular/core';
import {
  JapaneseWord, RepresentationType, ProfileDifficultyConfig, AttemptRecord,
  LearningMistake
} from './learning-content';
import { LearningContentService } from './learning-content.service';
import { SkillProgressService } from './skill-progress.service';
import { ProfileStateService } from '../services/profile-state';
import { FirstAttemptGuard } from './first-attempt-guard';
import { SpacedRepetition, JAPANESE_VOCAB_DECK } from './spaced-repetition';

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
  focusWordIds?: string[];
}

@Service()
export class ListeningGameEngine {
  // Inyección moderna de dependencias mediante inject()
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly profileState = inject(ProfileStateService);
  private readonly srs = inject(SpacedRepetition);
  private readonly firstAttempt = new FirstAttemptGuard();

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
    const level = config.maxDifficulty ?? 1;

    // solo palabras ya presentadas: nunca se pregunta ni se usa de distractor algo desconocido
    const pool = this.getUnlockedWords(config)
      .filter(w => this.srs.isIntroduced(JAPANESE_VOCAB_DECK, w.id));
    const targets = config.focusWordIds?.length
      ? pool.filter(w => config.focusWordIds!.includes(w.id))
      : pool;
    if (targets.length === 0) return null;

    const buffer = this._recentWordIds();
    let choices = targets.filter(w => !buffer.includes(w.id));
    if (choices.length === 0) {
      const last = buffer[buffer.length - 1];
      choices = targets.filter(w => w.id !== last);
      if (choices.length === 0) choices = targets;
    }
    const targetWord = choices[Math.floor(Math.random() * choices.length)];
    this._trackRecentWord(targetWord.id);

    const questionRep = this._selectQuestionRepresentation(profileConfig, targetWord, age);
    const answerRep = this._selectAnswerRepresentation(profileConfig, targetWord, age);

    const numOptions = Math.min(profileConfig.maxOptions, Math.max(profileConfig.minOptions, pool.length));
    const distractors = this._pickDistractors(targetWord, pool, numOptions - 1, level);
    const options = this._shuffle([targetWord, ...distractors]);

    return {
      word: targetWord,
      questionRepresentation: questionRep,
      answerRepresentation: answerRep,
      options,
      correctIndex: options.findIndex(w => w.id === targetWord.id)
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
  ): { attempt: AttemptRecord; mistake?: LearningMistake } | null {
    const profile = this.profileState.activeProfile();
    if (!profile) throw new Error('No active profile');
    if (!this.firstAttempt.isFirst(question)) return null;

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

  getUnlockedWords(config: ListeningEngineConfig): JapaneseWord[] {
    const profile = this.profileState.activeProfile();
    if (!profile) return [];
    const maxDiff = Math.min(config.maxDifficulty ?? 1, 10);

    let words: JapaneseWord[] = [];
    for (const skillId of config.targetSkills) {
      words = [...words, ...this.contentService.getWordsForSkill(skillId)];
    }
    words = Array.from(new Map(words.map(w => [w.id, w])).values());
    if (config.category) words = words.filter(w => w.category === config.category);
    return words.filter(w => w.difficulty <= maxDiff && w.recommendedAgeMin <= profile.age);
  }

  getUnintroducedWords(config: ListeningEngineConfig): JapaneseWord[] {
    return this.getUnlockedWords(config)
      .filter(w => !this.srs.isIntroduced(JAPANESE_VOCAB_DECK, w.id));
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

  private _pickDistractors(target: JapaneseWord, pool: JapaneseWord[], count: number, level: number): JapaneseWord[] {
    // sin la misma palabra y sin homófonos (ひ 日 / ひ 火)
    const valid = pool.filter(w => w.id !== target.id && w.hiragana !== target.hiragana);
    const sameCategory = this._shuffle(valid.filter(w => w.category === target.category));
    const otherCategory = this._shuffle(valid.filter(w => w.category !== target.category));

    const nearRatio = level <= 2 ? 0 : level <= 5 ? 0.5 : 1;
    const nearCount = Math.min(sameCategory.length, Math.round(count * nearRatio));

    const picked = [
      ...sameCategory.slice(0, nearCount),
      ...otherCategory.slice(0, count - nearCount),
    ];

    // si faltaron, rellenar con lo que sobre
    if (picked.length < count) {
      const rest = this._shuffle([...sameCategory, ...otherCategory].filter(w => !picked.includes(w)));
      picked.push(...rest.slice(0, count - picked.length));
    }
    return picked;
  }

  private _shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
