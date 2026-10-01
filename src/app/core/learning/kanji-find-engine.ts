/**
 * Engine del juego "Encuentra el Kanji" - Múltiples modalidades de pregunta
 * Fase 3: Kanji - Encuentra el Kanji
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
// TIPOS DE MODALIDAD
// ============================================

export type KanjiModality =
  | 'image-to-kanji'      // 🌳 → 木 山 川
  | 'audio-to-kanji'      // 🔊 き → 木 山 川
  | 'hiragana-to-kanji'   // き → 木 山 川
  | 'kanji-to-meaning'    // 木 → 🌳 ⛰️ 🌊
  | 'kanji-to-reading';   // 木 → き やま かわ

export interface KanjiModalityConfig {
  modality: KanjiModality;
  questionRepresentation: RepresentationType;
  answerRepresentation: RepresentationType;
  targetSkills: string[];
  minAge: number;
}

// Configuración de modalidades en orden pedagógico
export const KANJI_MODALITIES: KanjiModalityConfig[] = [
  {
    modality: 'image-to-kanji',
    questionRepresentation: 'image',
    answerRepresentation: 'kanji',
    targetSkills: ['japanese.kanji.recognition', 'japanese.kanji.nature'],
    minAge: 4
  },
  {
    modality: 'audio-to-kanji',
    questionRepresentation: 'audio',
    answerRepresentation: 'kanji',
    targetSkills: ['japanese.kanji.recognition', 'japanese.kanji.nature'],
    minAge: 4
  },
  {
    modality: 'hiragana-to-kanji',
    questionRepresentation: 'hiragana',
    answerRepresentation: 'kanji',
    targetSkills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.nature'],
    minAge: 6
  },
  {
    modality: 'kanji-to-meaning',
    questionRepresentation: 'kanji',
    answerRepresentation: 'image',
    targetSkills: ['japanese.kanji.meaning', 'japanese.kanji.nature'],
    minAge: 6
  },
  {
    modality: 'kanji-to-reading',
    questionRepresentation: 'kanji',
    answerRepresentation: 'hiragana',
    targetSkills: ['japanese.kanji.reading', 'japanese.kanji.nature'],
    minAge: 6
  }
];

// ============================================
// TIPOS DEL ENGINE
// ============================================

export interface KanjiQuestion {
  word: JapaneseWord;
  modality: KanjiModality;
  questionRepresentation: RepresentationType;
  answerRepresentation: RepresentationType;
  questionValue: string;        // Qué se muestra (imagen, audio, hiragana, kanji)
  options: JapaneseWord[];      // Palabras como opciones
  correctIndex: number;         // Índice de la correcta
  targetSkills: string[];
}

export interface KanjiAnswer {
  selectedWordId: string;
  correct: boolean;
  responseTimeMs: number;
}

export interface KanjiEngineConfig {
  gameId: string;
  targetSkills: string[];
  category?: string;
  allowedModalities?: KanjiModality[];
}

// ============================================
// ENGINE
// ============================================

@Injectable({ providedIn: 'root' })
export class KanjiFindEngine {
  constructor(
    private readonly contentService: LearningContentService,
    private readonly skillProgress: SkillProgressService,
    private readonly profileState: ProfileStateService
  ) {}

  /**
   * Genera una nueva pregunta de kanji
   */
  generateQuestion(config: KanjiEngineConfig): KanjiQuestion | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const age = profile.age;
    const profileConfig = this.contentService.activeProfileConfig();

    // Obtener palabras con kanji para las skills objetivo
    let candidateWords = this.contentService.getWordsForSkill(config.targetSkills[0]);
    if (config.category) {
      candidateWords = candidateWords.filter(w => w.category === config.category && w.kanji);
    } else {
      candidateWords = candidateWords.filter(w => w.kanji);
    }

    if (candidateWords.length === 0) return null;

    // Determinar modalidades permitidas para esta edad y config
    const allowedModalities = this._getAllowedModalities(age, profileConfig, config.allowedModalities);
    if (allowedModalities.length === 0) return null;

    // Seleccionar modalidad (aleatoria por ahora, Fase 8 hará adaptativo)
    const modalityConfig = allowedModalities[Math.floor(Math.random() * allowedModalities.length)];

    // Seleccionar palabra objetivo
    const targetWord = candidateWords[Math.floor(Math.random() * candidateWords.length)];

    // Obtener valor de la pregunta según modalidad
    const questionValue = this._getQuestionValue(targetWord, modalityConfig.questionRepresentation);

    // Generar opciones (distractores con kanji)
    const numOptions = Math.min(
      profileConfig.maxOptions,
      Math.max(profileConfig.minOptions, candidateWords.length)
    );
    const distractors = this.contentService.getDistractors(
      targetWord,
      numOptions - 1,
      profileConfig.distractorStrategy
    ).filter(w => w.kanji); // Solo distractores con kanji

    // Mezclar opciones
    const allOptions = [targetWord, ...distractors].sort(() => Math.random() - 0.5);
    const correctIndex = allOptions.findIndex(w => w.id === targetWord.id);

    return {
      word: targetWord,
      modality: modalityConfig.modality,
      questionRepresentation: modalityConfig.questionRepresentation,
      answerRepresentation: modalityConfig.answerRepresentation,
      questionValue,
      options: allOptions,
      correctIndex,
      targetSkills: modalityConfig.targetSkills
    };
  }

  /**
   * Valida la respuesta
   */
  validateAnswer(question: KanjiQuestion, answer: KanjiAnswer): boolean {
    return answer.selectedWordId === question.word.id;
  }

  /**
   * Registra el intento y actualiza skills
   */
  recordAttempt(
    question: KanjiQuestion,
    answer: KanjiAnswer,
    config: KanjiEngineConfig
  ): { attempt: AttemptRecord; mistake?: LearningMistake } {
    const profile = this.profileState.activeProfile();
    if (!profile) throw new Error('No active profile');

    // Registrar para cada skill objetivo
    const primarySkill = question.targetSkills[0];
    const attempt: AttemptRecord = {
      skillId: primarySkill,
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

    // También registrar en skills secundarias
    for (const skillId of question.targetSkills.slice(1)) {
      this.skillProgress.recordAttempt({
        ...attempt,
        skillId
      });
    }

    // Registrar error si falló
    let mistake: LearningMistake | undefined;
    if (!answer.correct) {
      const selectedWord = question.options.find(w => w.id === answer.selectedWordId);
      mistake = {
        skillId: primarySkill,
        contentId: question.word.id,
        expected: question.word.kanji,
        answered: selectedWord?.kanji ?? answer.selectedWordId,
        mistakeType: undefined, // Fase 8
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

  // ============================================
  // PRIVADOS
  // ============================================

  private _getAllowedModalities(
    age: number,
    profileConfig: ProfileDifficultyConfig,
    allowedModalities?: KanjiModality[]
  ): KanjiModalityConfig[] {
    return KANJI_MODALITIES.filter(m => {
      // Edad mínima
      if (m.minAge > age) return false;
      // Representaciones permitidas por config de perfil
      const questionAllowed = profileConfig.allowedQuestionRepresentations.includes(m.questionRepresentation);
      const answerAllowed = profileConfig.allowedAnswerRepresentations.includes(m.answerRepresentation);
      if (!questionAllowed || !answerAllowed) return false;
      // Filtro explícito si se proporciona
      if (allowedModalities && !allowedModalities.includes(m.modality)) return false;
      return true;
    });
  }

  private _getQuestionValue(word: JapaneseWord, rep: RepresentationType): string {
    switch (rep) {
      case 'image':
        const imageRep = word.representations?.find(r => r.type === 'image');
        return imageRep?.value ?? word.image;
      case 'hiragana':
        return word.hiragana;
      case 'kanji':
        return word.kanji ?? '';
      case 'audio':
        return word.audio; // Se maneja por el componente
      default:
        return word.hiragana;
    }
  }
}