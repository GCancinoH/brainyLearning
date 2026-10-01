/**
 * Engine del juego "Calendario" - Kanji del día + Calendario japonés
 * Fase 5: Calendario
 */

import { Injectable } from '@angular/core';
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

// ============================================
// TIPOS DE ACTIVIDAD CALENDARIO
// ============================================

export type CalendarActivityType =
  | 'kanji-of-day'      // Kanji del día: descomposición 月 + 曜 + 日
  | 'week-order'        // Ordenar días de la semana
  | 'audio-select-day'  // Audio → seleccionar día
  | 'what-day-today';   // 今日は何曜日？ → seleccionar día

export interface CalendarQuestion {
  type: CalendarActivityType;
  // Para kanji-of-day
  targetDay?: JapaneseWord;
  decomposition?: { kanji: string; label: string; reading: string }[];
  // Para week-order
  weekDays?: JapaneseWord[];
  shuffledDays?: JapaneseWord[];
  // Para audio-select-day / what-day-today
  audioWord?: JapaneseWord;
  options?: JapaneseWord[];
  correctIndex?: number;
  questionText?: string;
}

export interface CalendarAnswer {
  selectedIndex?: number;
  selectedDayId?: string;
  orderedIds?: string[];
  correct: boolean;
  responseTimeMs: number;
}

export interface CalendarEngineConfig {
  gameId: string;
  targetSkills: string[];
  category: 'calendar';
  allowedActivityTypes?: CalendarActivityType[];
}

// ============================================
// ORDEN SEMANAL CANÓNICO
// ============================================

const WEEK_ORDER = [
  'getsuyoubi',   // 月曜日 - Lunes
  'kayoubi',      // 火曜日 - Martes
  'suiyoubi',     // 水曜日 - Miércoles
  'mokuyoubi',    // 木曜日 - Jueves
  'kinyoubi',     // 金曜日 - Viernes
  'doyoubi',      // 土曜日 - Sábado
  'nichiyoubi'    // 日曜日 - Domingo
];

const WEEK_LABELS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ============================================
// ENGINE
// ============================================

@Injectable({ providedIn: 'root' })
export class CalendarGameEngine {
  constructor(
    private readonly contentService: LearningContentService,
    private readonly skillProgress: SkillProgressService,
    private readonly profileState: ProfileStateService
  ) {}

  /**
   * Genera una pregunta de calendario
   */
  generateQuestion(config: CalendarEngineConfig): CalendarQuestion | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const age = profile.age;
    const profileConfig = this.contentService.activeProfileConfig();
    const level = 1; // TODO: obtener del GameSessionService

    // Determinar tipos de actividad permitidos
    const allowedTypes = this._getAllowedActivityTypes(age, profileConfig, level, config.allowedActivityTypes);
    if (allowedTypes.length === 0) return null;

    // Seleccionar tipo de actividad
    const activityType = this._selectActivityType(allowedTypes, level, age);

    switch (activityType) {
      case 'kanji-of-day':
        return this._generateKanjiOfDayQuestion(profileConfig, age);
      case 'week-order':
        return this._generateWeekOrderQuestion(profileConfig, age);
      case 'audio-select-day':
        return this._generateAudioSelectDayQuestion(profileConfig, age);
      case 'what-day-today':
        return this._generateWhatDayTodayQuestion(profileConfig, age);
      default:
        return this._generateKanjiOfDayQuestion(profileConfig, age);
    }
  }

  /**
   * Valida la respuesta según el tipo de actividad
   */
  validateAnswer(question: CalendarQuestion, answer: CalendarAnswer): boolean {
    switch (question.type) {
      case 'kanji-of-day':
        // Para kanji del día, siempre correcto si llega aquí (es educativo)
        return true;
      case 'week-order':
        if (!answer.orderedIds || !question.weekDays) return false;
        return answer.orderedIds.join(',') === question.weekDays.map(d => d.id).join(',');
      case 'audio-select-day':
      case 'what-day-today':
        return answer.selectedIndex === question.correctIndex;
      default:
        return false;
    }
  }

  /**
   * Registra el intento
   */
  recordAttempt(
    question: CalendarQuestion,
    answer: CalendarAnswer,
    config: CalendarEngineConfig
  ): { attempt: AttemptRecord; mistake?: LearningMistake } {
    const profile = this.profileState.activeProfile();
    if (!profile) throw new Error('No active profile');

    let skillId = config.targetSkills[0];
    let contentId = '';
    let expected = '';
    let answered = '';
    let representation: RepresentationType = 'image';

    switch (question.type) {
      case 'kanji-of-day':
        skillId = 'japanese.calendar.kanji';
        contentId = question.targetDay?.id ?? 'kanji-of-day';
        expected = question.targetDay?.kanji ?? '';
        answered = expected; // Educativo, no hay error
        representation = 'kanji';
        break;
      case 'week-order':
        skillId = 'japanese.calendar.days';
        contentId = 'week-order';
        expected = question.weekDays?.map(d => d.id).join(',') ?? '';
        answered = answer.orderedIds?.join(',') ?? '';
        representation = 'kanji';
        break;
      case 'audio-select-day':
      case 'what-day-today':
        skillId = 'japanese.calendar.days';
        contentId = question.audioWord?.id ?? 'calendar-audio';
        expected = question.audioWord?.hiragana ?? '';
        const selected = question.options?.[answer.selectedIndex ?? -1];
        answered = selected?.hiragana ?? '';
        representation = 'audio';
        break;
    }

    const attempt: AttemptRecord = {
      skillId,
      contentId,
      correct: answer.correct,
      responseTimeMs: answer.responseTimeMs,
      difficulty: 2,
      representation,
      timestamp: Date.now(),
      profileAge: profile.age,
      profileId: profile.id
    };

    this.skillProgress.recordAttempt(attempt);

    // Registrar en skills relacionadas
    for (const s of config.targetSkills.slice(1)) {
      this.skillProgress.recordAttempt({ ...attempt, skillId: s });
    }

    let mistake: LearningMistake | undefined;
    if (!answer.correct) {
      mistake = {
        skillId,
        contentId,
        expected,
        answered,
        mistakeType: undefined,
        representation,
        timestamp: Date.now(),
        profileId: profile.id
      };
      this.skillProgress.recordMistake(mistake);
    }

    return { attempt, mistake };
  }

  // ============================================
  // PRIVADOS - GENERADORES POR TIPO
  // ============================================

  private _generateKanjiOfDayQuestion(
    profileConfig: ProfileDifficultyConfig,
    age: number
  ): CalendarQuestion | null {
    // Seleccionar un día al azar
    const dayId = WEEK_ORDER[Math.floor(Math.random() * WEEK_ORDER.length)];
    const targetDay = this.contentService.getWordById(dayId);
    if (!targetDay) return null;

    // Descomposición visual: kanji + 曜 + 日
    const baseKanji = targetDay.readings?.kanji ?? targetDay.kanji?.[0] ?? '';
    const decomposition = [
      { kanji: baseKanji, label: baseKanji, reading: targetDay.readings?.onReading ?? '' },
      { kanji: '曜', label: '曜', reading: 'よう' },
      { kanji: '日', label: '日', reading: 'び' }
    ];

    return {
      type: 'kanji-of-day',
      targetDay,
      decomposition
    };
  }

  private _generateWeekOrderQuestion(
    profileConfig: ProfileDifficultyConfig,
    age: number
  ): CalendarQuestion | null {
    const words = WEEK_ORDER.map(id => this.contentService.getWordById(id)).filter((w): w is JapaneseWord => w !== undefined);
    if (words.length !== 7) return null;

    // Mezclar para el ejercicio
    const shuffled = [...words].sort(() => Math.random() - 0.5);

    return {
      type: 'week-order',
      weekDays: words,
      shuffledDays: shuffled
    };
  }

  private _generateAudioSelectDayQuestion(
      profileConfig: ProfileDifficultyConfig,
      age: number
    ): CalendarQuestion | null {
      const words = WEEK_ORDER.map(id => this.contentService.getWordById(id)).filter((w): w is JapaneseWord => w !== undefined);
      if (words.length < 3) return null;

      const targetWord = words[Math.floor(Math.random() * words.length)];
      const numOptions = Math.min(4, words.length);
      const distractors = words.filter(w => w.id !== targetWord.id).sort(() => Math.random() - 0.5).slice(0, numOptions - 1);
      const options = [targetWord, ...distractors].sort(() => Math.random() - 0.5);
      const correctIndex = options.findIndex(w => w.id === targetWord.id);

    return {
      type: 'audio-select-day',
      audioWord: targetWord,
      options,
      correctIndex,
      questionText: 'Escucha y elige el día'
    };
  }

  private _generateWhatDayTodayQuestion(
      profileConfig: ProfileDifficultyConfig,
      age: number
    ): CalendarQuestion | null {
      // Usar día actual real o simulado
      const todayIndex = new Date().getDay(); // 0=Domingo, 1=Lunes...
      const adjustedIndex = todayIndex === 0 ? 6 : todayIndex - 1; // Convertir a 0=Lunes
      const todayId = WEEK_ORDER[adjustedIndex];
      const targetWord = this.contentService.getWordById(todayId);
      if (!targetWord) return null;

      const words = WEEK_ORDER.map(id => this.contentService.getWordById(id)).filter((w): w is JapaneseWord => w !== undefined);
      const numOptions = Math.min(4, words.length);
      const distractors = words.filter(w => w.id !== targetWord.id).sort(() => Math.random() - 0.5).slice(0, numOptions - 1);
      const options = [targetWord, ...distractors].sort(() => Math.random() - 0.5);
      const correctIndex = options.findIndex(w => w.id === targetWord.id);

    return {
      type: 'what-day-today',
      audioWord: targetWord,
      options,
      correctIndex,
      questionText: '今日は何曜日？'
    };
  }

  private _getAllowedActivityTypes(
    age: number,
    profileConfig: ProfileDifficultyConfig,
    level: number,
    allowed?: CalendarActivityType[]
  ): CalendarActivityType[] {
    const types: CalendarActivityType[] = ['kanji-of-day'];

    // Week order desde nivel 2
    if (level >= 2) {
      types.push('week-order');
    }

    // Audio select day desde nivel 2
    if (level >= 2 && profileConfig.audioRequired) {
      types.push('audio-select-day');
    }

    // What day today desde nivel 3 (requiere lectura)
    if (level >= 3 && age >= 6 && profileConfig.requiresReading) {
      types.push('what-day-today');
    }

    return allowed ? types.filter(t => allowed.includes(t)) : types;
  }

  private _selectActivityType(allowed: CalendarActivityType[], level: number, age: number): CalendarActivityType {
    // Kanji of day más frecuente en niveles bajos
    if (level <= 2) {
      return allowed.includes('kanji-of-day') ? 'kanji-of-day' : allowed[0];
    }
    return allowed[Math.floor(Math.random() * allowed.length)];
  }
}