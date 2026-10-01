/**
 * Engine del juego "Naturaleza" - Combina modalidades de kanji + actividades especiales
 * Fase 4: Naturaleza - 12 kanji + 木→林→森 + Kanji Detectives
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
import { KanjiFindEngine, KanjiModality, KanjiQuestion, KanjiModalityConfig } from './kanji-find-engine';

// ============================================
// TIPOS ESPECÍFICOS NATURALEZA
// ============================================

export type NatureActivityType =
  | 'kanji-find'        // Modalidades del KanjiFindEngine
  | 'ki-hayashi-mori'   // 木 → 林 → 森 composición
  | 'kanji-detectives'; // Buscar kanji en escena

export interface NatureQuestion {
  type: NatureActivityType;
  // Para kanji-find
  kanjiQuestion?: KanjiQuestion;
  // Para ki-hayashi-mori
  compositionStage?: 1 | 2 | 3; // 1=木, 2=林, 3=森
  compositionQuestion?: string;
  compositionOptions?: { kanji: string; label: string; emoji: string }[];
  compositionCorrectIndex?: number;
  // Para kanji-detectives
  sceneElements?: { kanji: string; emoji: string; word: JapaneseWord }[];
  targetKanji?: string;
  targetWord?: JapaneseWord;
}

export interface NatureAnswer {
  selectedIndex: number;
  correct: boolean;
  responseTimeMs: number;
}

export interface NatureEngineConfig {
  gameId: string;
  targetSkills: string[];
  category: 'nature';
  allowedActivityTypes?: NatureActivityType[];
}

// ============================================
// CONFIGURACIÓN DE ACTIVIDADES
// ============================================

const KI_HAYASHI_MORI_STAGES = [
  {
    stage: 1 as const,
    kanji: '木',
    label: '木 (árbol)',
    emoji: '🌳',
    question: 'Un árbol es 木',
    options: [
      { kanji: '木', label: '木', emoji: '🌳' },
      { kanji: '林', label: '林', emoji: '🌳🌳' },
      { kanji: '森', label: '森', emoji: '🌳🌳🌳' }
    ],
    correctIndex: 0
  },
  {
    stage: 2 as const,
    kanji: '林',
    label: '林 (bosque pequeño)',
    emoji: '🌳🌳',
    question: 'Dos árboles forman 林',
    options: [
      { kanji: '木', label: '木', emoji: '🌳' },
      { kanji: '林', label: '林', emoji: '🌳🌳' },
      { kanji: '森', label: '森', emoji: '🌳🌳🌳' }
    ],
    correctIndex: 1
  },
  {
    stage: 3 as const,
    kanji: '森',
    label: '森 (bosque)',
    emoji: '🌳🌳🌳',
    question: 'Tres árboles forman 森',
    options: [
      { kanji: '木', label: '木', emoji: '🌳' },
      { kanji: '林', label: '林', emoji: '🌳🌳' },
      { kanji: '森', label: '森', emoji: '🌳🌳🌳' }
    ],
    correctIndex: 2
  }
];

// Escenas para Kanji Detectives
const NATURE_SCENES = [
  {
    name: 'montaña-río-sol',
    elements: ['yama', 'kawa', 'hi'], // montaña, río, sol
    background: '🏔️🌳🌊☀️'
  },
  {
    name: 'bosque-lluvia-nieve',
    elements: ['mori', 'ame', 'yuki'], // bosque, lluvia, nieve
    background: '🌳🌳🌳🌧️❄️'
  },
  {
    name: 'flor-tierra-cielo',
    elements: ['hana', 'tsuchi', 'sora'], // flor, tierra, cielo
    background: '🌸🌍☁️'
  },
  {
    name: 'fuego-agua-luna',
    elements: ['hi-fire', 'mizu', 'tsuki'], // fuego, agua, luna
    background: '🔥💧🌙'
  }
];

// ============================================
// ENGINE
// ============================================

@Injectable({ providedIn: 'root' })
export class NatureGameEngine {
  constructor(
    private readonly contentService: LearningContentService,
    private readonly skillProgress: SkillProgressService,
    private readonly profileState: ProfileStateService,
    private readonly kanjiEngine: KanjiFindEngine
  ) {}

  /**
   * Genera una pregunta de naturaleza (tipo aleatorio según nivel y config)
   */
  generateQuestion(config: NatureEngineConfig): NatureQuestion | null {
    const profile = this.profileState.activeProfile();
    if (!profile) return null;

    const age = profile.age;
    const profileConfig = this.contentService.activeProfileConfig();
    const level = 1; // TODO: obtener del GameSessionService

    // Determinar tipos de actividad permitidos
    const allowedTypes = this._getAllowedActivityTypes(age, profileConfig, level, config.allowedActivityTypes);
    if (allowedTypes.length === 0) return null;

    // Seleccionar tipo de actividad (ponderado: más kanji-find al principio)
    const activityType = this._selectActivityType(allowedTypes, level);

    switch (activityType) {
      case 'kanji-find':
        return this._generateKanjiFindQuestion(config, profileConfig, age);
      case 'ki-hayashi-mori':
        return this._generateKiHayashiMoriQuestion(profileConfig, age);
      case 'kanji-detectives':
        return this._generateKanjiDetectivesQuestion(profileConfig, age);
      default:
        return this._generateKanjiFindQuestion(config, profileConfig, age);
    }
  }

  /**
   * Valida la respuesta según el tipo de actividad
   */
  validateAnswer(question: NatureQuestion, answer: NatureAnswer): boolean {
    switch (question.type) {
      case 'kanji-find':
        return question.kanjiQuestion ? 
          answer.selectedIndex === question.kanjiQuestion.correctIndex : false;
      case 'ki-hayashi-mori':
        return answer.selectedIndex === question.compositionCorrectIndex;
      case 'kanji-detectives':
        const selected = question.sceneElements?.[answer.selectedIndex];
        return selected?.word?.kanji === question.targetKanji;
      default:
        return false;
    }
  }

  /**
   * Registra el intento
   */
  recordAttempt(
    question: NatureQuestion,
    answer: NatureAnswer,
    config: NatureEngineConfig
  ): { attempt: AttemptRecord; mistake?: LearningMistake } {
    const profile = this.profileState.activeProfile();
    if (!profile) throw new Error('No active profile');

    let skillId = config.targetSkills[0];
    let contentId = '';
    let expected = '';
    let answered = '';
    let representation: RepresentationType = 'image';

    switch (question.type) {
      case 'kanji-find':
        if (question.kanjiQuestion) {
          skillId = question.kanjiQuestion.targetSkills[0];
          contentId = question.kanjiQuestion.word.id;
          expected = question.kanjiQuestion.word.kanji ?? '';
          const selectedWord = question.kanjiQuestion.options[answer.selectedIndex];
          answered = selectedWord?.kanji ?? '';
          representation = question.kanjiQuestion.questionRepresentation;
        }
        break;
      case 'ki-hayashi-mori':
        skillId = 'japanese.kanji.nature';
        contentId = 'ki-hayashi-mori';
        expected = question.compositionOptions?.[question.compositionCorrectIndex!]?.kanji ?? '';
        answered = question.compositionOptions?.[answer.selectedIndex]?.kanji ?? '';
        representation = 'kanji';
        break;
      case 'kanji-detectives':
        skillId = 'japanese.kanji.nature';
        contentId = question.targetWord?.id ?? 'kanji-detectives';
        expected = question.targetKanji ?? '';
        const selectedElement = question.sceneElements?.[answer.selectedIndex];
        answered = selectedElement?.word?.kanji ?? '';
        representation = 'image';
        break;
    }

    const attempt: AttemptRecord = {
      skillId,
      contentId,
      correct: answer.correct,
      responseTimeMs: answer.responseTimeMs,
      difficulty: question.type === 'kanji-find' ? question.kanjiQuestion?.word.difficulty ?? 2 : 2,
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

  private _generateKanjiFindQuestion(
    config: NatureEngineConfig,
    profileConfig: ProfileDifficultyConfig,
    age: number
  ): NatureQuestion | null {
    const kanjiQuestion = this.kanjiEngine.generateQuestion({
      gameId: config.gameId,
      targetSkills: config.targetSkills,
      category: config.category,
      allowedModalities: this._getAllowedModalitiesForLevel(age, profileConfig)
    });

    if (!kanjiQuestion) return null;

    return {
      type: 'kanji-find',
      kanjiQuestion
    };
  }

  private _generateKiHayashiMoriQuestion(
    profileConfig: ProfileDifficultyConfig,
    age: number
  ): NatureQuestion | null {
    // Solo para perfiles que pueden leer kanji
    if (!profileConfig.allowedAnswerRepresentations.includes('kanji')) return null;

    // Seleccionar etapa (aleatoria o progresiva)
    const stageConfig = KI_HAYASHI_MORI_STAGES[Math.floor(Math.random() * KI_HAYASHI_MORI_STAGES.length)];

    return {
      type: 'ki-hayashi-mori',
      compositionStage: stageConfig.stage,
      compositionQuestion: stageConfig.question,
      compositionOptions: stageConfig.options,
      compositionCorrectIndex: stageConfig.correctIndex
    };
  }

  private _generateKanjiDetectivesQuestion(
    profileConfig: ProfileDifficultyConfig,
    age: number
  ): NatureQuestion | null {
    // Solo para 6 años (requiere lectura de kanji)
    if (age < 6) return null;

    const words = this.contentService.getWordsByCategory('nature').filter(w => w.kanji && w.recommendedAgeMin <= age);
    if (words.length < 3) return null;

    // Seleccionar escena
    const scene = NATURE_SCENES[Math.floor(Math.random() * NATURE_SCENES.length)];
    const sceneWords = scene.elements
      .map(id => words.find(w => w.id === id))
      .filter((w): w is JapaneseWord => w !== undefined);

    if (sceneWords.length < 2) return null;

    // Seleccionar kanji objetivo
    const targetWord = sceneWords[Math.floor(Math.random() * sceneWords.length)];

    const sceneElements = sceneWords.map(word => ({
      kanji: word.kanji!,
      emoji: word.representations?.find(r => r.type === 'image')?.value ?? '❓',
      word
    }));

    return {
      type: 'kanji-detectives',
      sceneElements,
      targetKanji: targetWord.kanji!,
      targetWord
    };
  }

  private _getAllowedActivityTypes(
    age: number,
    profileConfig: ProfileDifficultyConfig,
    level: number,
    allowed?: NatureActivityType[]
  ): NatureActivityType[] {
    const types: NatureActivityType[] = ['kanji-find'];

    // Ki-hayashi-mori disponible desde nivel 2
    if (level >= 2 && profileConfig.allowedAnswerRepresentations.includes('kanji')) {
      types.push('ki-hayashi-mori');
    }

    // Kanji Detectives solo para 6 años y nivel 3+
    if (age >= 6 && level >= 3 && profileConfig.requiresReading) {
      types.push('kanji-detectives');
    }

    return allowed ? types.filter(t => allowed.includes(t)) : types;
  }

  private _selectActivityType(allowed: NatureActivityType[], level: number): NatureActivityType {
    // Ponderación: más kanji-find en niveles bajos
    if (level <= 2) {
      return allowed[0]; // Principalmente kanji-find
    }
    return allowed[Math.floor(Math.random() * allowed.length)];
  }

  private _getAllowedModalitiesForLevel(age: number, profileConfig: ProfileDifficultyConfig): KanjiModality[] {
    const modalities: KanjiModality[] = ['image-to-kanji', 'audio-to-kanji'];
    if (age >= 6) {
      modalities.push('hiragana-to-kanji');
      if (profileConfig.requiresReading) {
        modalities.push('kanji-to-meaning', 'kanji-to-reading');
      }
    }
    return modalities;
  }
}