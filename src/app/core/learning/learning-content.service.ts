/**
 * Servicio de contenido educativo - Consulta declarativa por categoría, dificultad, edad, skill
 * Fase 2: Primer juego japonés
 */

import { Injectable, inject, signal, computed } from '@angular/core';
import {
  JapaneseWord,
  LearningContent,
  ProfileDifficultyConfig,
  SkillDefinition,
  RepresentationType,
  getProfileDifficultyConfig,
  getWordsForProfile,
  getWordsBySkill,
  INITIAL_JAPANESE_WORDS,
  JAPANESE_SKILLS
} from './learning-content';
import { ProfileStateService } from '../services/profile-state';

@Injectable({ providedIn: 'root' })
export class LearningContentService {
  private readonly profileState = inject(ProfileStateService);

  // ============================================
  // ESTADO - Dataset declarativo
  // ============================================
  private _words = signal<JapaneseWord[]>(INITIAL_JAPANESE_WORDS);
  private _skills = signal<SkillDefinition[]>(JAPANESE_SKILLS);

  readonly words = this._words.asReadonly();
  readonly skills = this._skills.asReadonly();

  // ============================================
  // CONSULTAS POR PERFIL ACTIVO
  // ============================================

  /** Configuración de dificultad para el perfil activo */
  readonly activeProfileConfig = computed((): ProfileDifficultyConfig => {
    const profile = this.profileState.activeProfile();
    const age = profile?.age ?? 4;
    return getProfileDifficultyConfig(age);
  });

  /** Palabras disponibles para el perfil activo (filtradas por edad) */
  readonly availableWords = computed((): JapaneseWord[] => {
    const profile = this.profileState.activeProfile();
    const age = profile?.age ?? 4;
    return getWordsForProfile(age);
  });

  /** Palabras por categoría para el perfil activo */
  getWordsByCategory(category: string): JapaneseWord[] {
    const profile = this.profileState.activeProfile();
    const age = profile?.age ?? 4;
    return getWordsForProfile(age).filter(w => w.category === category);
  }

  /** Palabras para una skill específica */
  getWordsForSkill(skillId: string): JapaneseWord[] {
    const profile = this.profileState.activeProfile();
    const age = profile?.age ?? 4;
    return getWordsBySkill(skillId, age);
  }

  // ============================================
  // CONSULTAS GENERALES (para engines de juegos)
  // ============================================

  /** Obtiene una palabra por ID */
  getWordById(id: string): JapaneseWord | undefined {
    return this._words().find(w => w.id === id);
  }

  /** Obtiene palabras aleatorias para opciones (distractores coherentes) */
  getDistractors(
    correctWord: JapaneseWord,
    count: number,
    strategy: 'same-category' | 'visual-similar' | 'random' = 'same-category',
    age: number = 4,
    maxDiff: number = 10
  ): JapaneseWord[] {
    const pool = this._words().filter(w => 
      w.id !== correctWord.id && 
      w.recommendedAgeMin <= age && 
      w.difficulty <= maxDiff
    );

    let candidates: JapaneseWord[];

    switch (strategy) {
      case 'same-category':
        candidates = pool.filter(w => w.category === correctWord.category);
        break;
      case 'visual-similar':
        // Para futuro: kanji visualmente similares
        candidates = pool.filter(w => w.category === correctWord.category);
        break;
      case 'random':
      default:
        candidates = pool;
        break;
    }

    // Fisher-Yates shuffle (uniforme)
    const shuffled = [...candidates];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled.slice(0, count);
  }

  /** Obtiene palabras para un nivel de dificultad */
  getWordsByDifficulty(minDiff: number, maxDiff: number, age: number): JapaneseWord[] {
    return this._words().filter(w =>
      w.difficulty >= minDiff &&
      w.difficulty <= maxDiff &&
      w.recommendedAgeMin <= age
    );
  }

  /** Obtiene todas las categorías disponibles para una edad */
  getCategories(age: number): string[] {
    const words = getWordsForProfile(age);
    return [...new Set(words.map(w => w.category))];
  }

  /** Obtiene una skill por ID */
  getSkillById(id: string): SkillDefinition | undefined {
    return this._skills().find(s => s.id === id);
  }

  /** Obtiene skills para una categoría */
  getSkillsByCategory(category: string): SkillDefinition[] {
    return this._skills().filter(s => s.category === category);
  }

  // ============================================
  // REPRESENTACIONES (para variación de ejercicios)
  // ============================================

  /** Obtiene representaciones disponibles para una palabra y edad */
  getAvailableRepresentations(word: JapaneseWord, age: number): WordRepresentation[] {
    if (!word.representations) return [];
    return word.representations.filter(r => r.availableForAges.includes(age));
  }

  /** Filtra representaciones permitidas por config de perfil */
  filterRepresentationsByConfig(
    representations: WordRepresentation[],
    config: ProfileDifficultyConfig,
    asQuestion: boolean = true
  ): WordRepresentation[] {
    const allowedTypes = asQuestion
      ? config.allowedQuestionRepresentations
      : config.allowedAnswerRepresentations;
    return representations.filter(r => allowedTypes.includes(r.type));
  }

  // ============================================
  // EXTENSIBILIDAD (para añadir contenido dinámicamente)
  // ============================================

  /** Añade palabras al dataset (para fases futuras) */
  addWords(words: JapaneseWord[]): void {
    this._words.update(current => [...current, ...words]);
  }

  /** Añade skills */
  addSkills(skills: SkillDefinition[]): void {
    this._skills.update(current => [...current, ...skills]);
  }
}

// Tipo auxiliar para representaciones con metadatos
interface WordRepresentation {
  type: RepresentationType;
  value: string;
  availableForAges: number[];
}