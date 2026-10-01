/**
 * Modelos de contenido educativo y skills
 * Juegos japoneses - ¿Qué escuchaste?, Encuentra el Kanji, Naturaleza, Calendario
 */

// ============================================
// CONTENIDO BASE
// ============================================
export interface LearningContent {
  id: string;
  difficulty: number;              // 1-10+, progresión pedagógica
  recommendedAgeMin: number;       // 4 o 6
  recommendedAgeMax?: number;      // opcional
  skills: string[];                // ej: ['japanese.listening', 'japanese.vocabulary']
  category: string;                // ej: 'animals', 'nature', 'daily'
}

// Palabra japonesa completa
export interface JapaneseWord extends LearningContent {
  hiragana: string;                // Lectura en hiragana (obligatorio)
  kanji?: string;                  // Kanji si aplica
  romaji?: string;                 // Romanización opcional
  meanings: string[];              // Significados en español
  image: string;
  audio: string;
  // Metadatos específicos para perfiles
  representations?: WordRepresentation[]; // Qué representaciones están disponibles
  // Para kanji con múltiples lecturas (calendario)
  readings?: KanjiReadings;
}

// Lecturas de kanji (on/kun)
export interface KanjiReadings {
  kanji: string;
  onReading: string;
  kunReading: string;
  meaning: string;
}

// Representaciones disponibles para una palabra (para variación de ejercicios)
export type RepresentationType =
  | 'image'        // 🐱
  | 'hiragana'     // ねこ
  | 'kanji'        // 猫
  | 'audio'        // 🔊 ねこ
  | 'romaji';      // neko

export interface WordRepresentation {
  type: RepresentationType;
  value: string;      // El valor visual/sonoro
  availableForAges: number[]; // [4], [6], [4,6]
}

// ============================================
// CONFIGURACIÓN DE DIFICULTAD POR PERFIL (DECLARATIVA)
// ============================================
export interface ProfileDifficultyConfig {
  // Número de opciones
  minOptions: number;
  maxOptions: number;
  // Tamaño visual
  imageSize: 'large' | 'medium' | 'small';
  optionButtonSize: 'large' | 'medium' | 'small';
  // Requerimientos cognitivos
  requiresReading: boolean;        // Si muestra hiragana/kanji
  requiresKanji: boolean;          // Si exige kanji
  audioRequired: boolean;          // Audio obligatorio (auto-play)
  // Representaciones permitidas como respuesta
  allowedAnswerRepresentations: RepresentationType[];
  // Representaciones permitidas como pregunta
  allowedQuestionRepresentations: RepresentationType[];
  // Distractores
  distractorStrategy: 'same-category' | 'visual-similar' | 'random';
}

// Configuración por defecto por edad
export const DEFAULT_PROFILE_CONFIGS: Record<4 | 6, ProfileDifficultyConfig> = {
  4: {
    minOptions: 2,
    maxOptions: 3,
    imageSize: 'large',
    optionButtonSize: 'large',
    requiresReading: false,
    requiresKanji: false,
    audioRequired: true,
    allowedAnswerRepresentations: ['image'],
    allowedQuestionRepresentations: ['audio'],
    distractorStrategy: 'same-category'
  },
  6: {
    minOptions: 3,
    maxOptions: 4,
    imageSize: 'medium',
    optionButtonSize: 'medium',
    requiresReading: true,
    requiresKanji: true,
    audioRequired: true,
    allowedAnswerRepresentations: ['image', 'hiragana', 'kanji'],
    allowedQuestionRepresentations: ['audio', 'hiragana', 'kanji', 'image'],
    distractorStrategy: 'same-category'
  }
};

export function getProfileDifficultyConfig(age: number): ProfileDifficultyConfig {
  return age <= 4 ? DEFAULT_PROFILE_CONFIGS[4] : DEFAULT_PROFILE_CONFIGS[6];
}

// ============================================
// SKILLS / HABILIDADES
// ============================================
export interface SkillDefinition {
  id: string;                      // ej: 'japanese.listening'
  name: string;                    // ej: 'Comprensión auditiva'
  category: string;                // ej: 'japanese'
  subcategory?: string;            // ej: 'vocabulary'
  description: string;
  // Progresión de representaciones para esta skill
  representationProgression: RepresentationType[][];
  // Edad mínima recomendada
  recommendedAgeMin: number;
}

// Árbol de skills para japonés (Fase 2-5)
export const JAPANESE_SKILLS: SkillDefinition[] = [
  {
    id: 'japanese.listening',
    name: 'Comprensión auditiva',
    category: 'japanese',
    subcategory: 'listening',
    description: 'Reconocer palabras habladas y asociarlas a significado',
    representationProgression: [
      ['audio'],           // Solo audio
      ['audio', 'image'],  // Audio → imagen
      ['audio', 'hiragana'] // Audio → hiragana (para 6 años)
    ],
    recommendedAgeMin: 4
  },
  {
    id: 'japanese.vocabulary',
    name: 'Vocabulario básico',
    category: 'japanese',
    subcategory: 'vocabulary',
    description: 'Asociar significado, sonido y símbolo',
    representationProgression: [
      ['image', 'audio'],
      ['hiragana', 'audio'],
      ['kanji', 'audio'],
      ['kanji', 'hiragana']
    ],
    recommendedAgeMin: 4
  },
  {
    id: 'japanese.semantic-association',
    name: 'Asociación semántica',
    category: 'japanese',
    subcategory: 'semantic',
    description: 'Conectar concepto con múltiples representaciones',
    representationProgression: [
      ['image', 'hiragana'],
      ['audio', 'kanji'],
      ['kanji', 'hiragana']
    ],
    recommendedAgeMin: 6
  },
  // Fase 3: Kanji skills
  {
    id: 'japanese.kanji.recognition',
    name: 'Reconocimiento de kanji',
    category: 'japanese',
    subcategory: 'kanji',
    description: 'Identificar kanji por su forma visual',
    representationProgression: [
      ['image', 'kanji'],
      ['hiragana', 'kanji'],
      ['audio', 'kanji']
    ],
    recommendedAgeMin: 6
  },
  {
    id: 'japanese.kanji.reading',
    name: 'Lectura de kanji',
    category: 'japanese',
    subcategory: 'kanji',
    description: 'Asociar kanji con su lectura (hiragana/romaji)',
    representationProgression: [
      ['kanji', 'hiragana'],
      ['kanji', 'audio']
    ],
    recommendedAgeMin: 6
  },
  {
    id: 'japanese.kanji.meaning',
    name: 'Significado de kanji',
    category: 'japanese',
    subcategory: 'kanji',
    description: 'Asociar kanji con su significado',
    representationProgression: [
      ['kanji', 'image'],
      ['kanji', 'hiragana']
    ],
    recommendedAgeMin: 6
  },
  {
    id: 'japanese.kanji.nature',
    name: 'Kanji de la naturaleza',
    category: 'japanese',
    subcategory: 'kanji',
    description: 'Kanji relacionados con elementos naturales',
    representationProgression: [
      ['image', 'kanji'],
      ['hiragana', 'kanji'],
      ['kanji', 'hiragana'],
      ['kanji', 'image']
    ],
    recommendedAgeMin: 6
  },
  // Fase 5: Calendar skills
  {
    id: 'japanese.calendar.days',
    name: 'Días de la semana',
    category: 'japanese',
    subcategory: 'calendar',
    description: 'Reconocer y ordenar días de la semana en japonés',
    representationProgression: [
      ['audio', 'image'],
      ['audio', 'kanji'],
      ['kanji', 'hiragana'],
      ['kanji', 'image']
    ],
    recommendedAgeMin: 4
  },
  {
    id: 'japanese.calendar.kanji',
    name: 'Kanji del calendario',
    category: 'japanese',
    subcategory: 'calendar',
    description: 'Kanji fundamentales de los días de la semana con lecturas on/kun',
    representationProgression: [
      ['image', 'kanji'],
      ['hiragana', 'kanji'],
      ['kanji', 'hiragana'],
      ['kanji', 'audio']
    ],
    recommendedAgeMin: 6
  }
];

// ============================================
// REGISTRO DE INTENTOS Y ERRORES
// ============================================
export interface AttemptRecord {
  skillId: string;
  contentId: string;
  correct: boolean;
  responseTimeMs: number;
  difficulty: number;
  representation: RepresentationType; // Qué representación se usó en la pregunta
  timestamp: number;
  profileAge: number;
  profileId: string;
}

export interface SkillProgress {
  skillId: string;
  attempts: number;
  correct: number;
  accuracy: number;           // 0-1
  mastery: number;            // 0-1 (cálculo real en Fase 8)
  lastPracticedAt: number;
  // Por representación
  byRepresentation?: Record<RepresentationType, {
    attempts: number;
    correct: number;
    accuracy: number;
  }>;
}

export interface LearningMistake {
  skillId: string;
  contentId: string;
  expected: unknown;
  answered: unknown;
  mistakeType?: string;       // Clasificación en Fase 8
  representation: RepresentationType;
  timestamp: number;
  profileId: string;
}

// ============================================
// DATASET INICIAL - Palabras concretas para 4 años
// ============================================
export const INITIAL_JAPANESE_WORDS: JapaneseWord[] = [
  // Animales - categoría concreta, visual
  {
    id: 'neko',
    hiragana: 'ねこ',
    kanji: '猫',
    meanings: ['gato'],
    category: 'animals',
    image: 'images/japanese/neko.webp',
    audio: 'audio/japanese/neko.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🐱', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'ねこ', availableForAges: [6] },
      { type: 'kanji', value: '猫', availableForAges: [6] },
      { type: 'audio', value: 'neko', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'inu',
    hiragana: 'いぬ',
    kanji: '犬',
    meanings: ['perro'],
    category: 'animals',
    image: 'images/japanese/inu.webp',
    audio: 'audio/japanese/inu.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🐶', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'いぬ', availableForAges: [6] },
      { type: 'kanji', value: '犬', availableForAges: [6] },
      { type: 'audio', value: 'inu', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'usagi',
    hiragana: 'うさぎ',
    kanji: '兎',
    meanings: ['conejo'],
    category: 'animals',
    image: 'images/japanese/usagi.webp',
    audio: 'audio/japanese/usagi.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🐰', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'うさぎ', availableForAges: [6] },
      { type: 'kanji', value: '兎', availableForAges: [6] },
      { type: 'audio', value: 'usagi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'tori',
    hiragana: 'とり',
    kanji: '鳥',
    meanings: ['pájaro'],
    category: 'animals',
    image: 'images/japanese/tori.webp',
    audio: 'audio/japanese/tori.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🐦', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'とり', availableForAges: [6] },
      { type: 'kanji', value: '鳥', availableForAges: [6] },
      { type: 'audio', value: 'tori', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'sakana',
    hiragana: 'さかな',
    kanji: '魚',
    meanings: ['pez'],
    category: 'animals',
    image: 'images/japanese/sakana.webp',
    audio: 'audio/japanese/sakana.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🐟', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'さかな', availableForAges: [6] },
      { type: 'kanji', value: '魚', availableForAges: [6] },
      { type: 'audio', value: 'sakana', availableForAges: [4, 6] }
    ]
  },
  // Frutas/Comida - concreta
  {
    id: 'ringo',
    hiragana: 'りんご',
    kanji: '林檎',
    meanings: ['manzana'],
    category: 'food',
    image: 'images/japanese/ringo.webp',
    audio: 'audio/japanese/ringo.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.semantic-association'],
    representations: [
      { type: 'image', value: '🍎', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'りんご', availableForAges: [6] },
      { type: 'kanji', value: '林檎', availableForAges: [6] },
      { type: 'audio', value: 'ringo', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'banana',
    hiragana: 'バナナ',
    meanings: ['plátano', 'banana'],
    category: 'food',
    image: 'images/japanese/banana.webp',
    audio: 'audio/japanese/banana.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary'],
    representations: [
      { type: 'image', value: '🍌', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'バナナ', availableForAges: [6] },
      { type: 'audio', value: 'banana', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'mizu',
    hiragana: 'みず',
    kanji: '水',
    meanings: ['agua'],
    category: 'nature',
    image: 'images/japanese/mizu.webp',
    audio: 'audio/japanese/mizu.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '💧', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'みず', availableForAges: [6] },
      { type: 'kanji', value: '水', availableForAges: [6] },
      { type: 'audio', value: 'mizu', availableForAges: [4, 6] }
    ]
  },
  // Objetos cotidianos
  {
    id: 'hon',
    hiragana: 'ほん',
    kanji: '本',
    meanings: ['libro'],
    category: 'daily',
    image: 'images/japanese/hon.webp',
    audio: 'audio/japanese/hon.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary'],
    representations: [
      { type: 'image', value: '📚', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'ほん', availableForAges: [6] },
      { type: 'kanji', value: '本', availableForAges: [6] },
      { type: 'audio', value: 'hon', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'kuruma',
    hiragana: 'くるま',
    kanji: '車',
    meanings: ['coche', 'carro'],
    category: 'daily',
    image: 'images/japanese/kuruma.webp',
    audio: 'audio/japanese/kuruma.wav',
    recommendedAgeMin: 4,
    difficulty: 1,
    skills: ['japanese.listening', 'japanese.vocabulary'],
    representations: [
      { type: 'image', value: '🚗', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'くるま', availableForAges: [6] },
      { type: 'kanji', value: '車', availableForAges: [6] },
      { type: 'audio', value: 'kuruma', availableForAges: [4, 6] }
    ]
  },
  // Fase 3: Kanji de la naturaleza (subconjunto inicial)
  {
    id: 'ki',
    hiragana: 'き',
    kanji: '木',
    meanings: ['árbol'],
    category: 'nature',
    image: 'images/japanese/ki.webp',
    audio: 'audio/japanese/ki.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌳', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'き', availableForAges: [6] },
      { type: 'kanji', value: '木', availableForAges: [6] },
      { type: 'audio', value: 'ki', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'yama',
    hiragana: 'やま',
    kanji: '山',
    meanings: ['montaña'],
    category: 'nature',
    image: 'images/japanese/yama.webp',
    audio: 'audio/japanese/yama.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '⛰️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'やま', availableForAges: [6] },
      { type: 'kanji', value: '山', availableForAges: [6] },
      { type: 'audio', value: 'yama', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'kawa',
    hiragana: 'かわ',
    kanji: '川',
    meanings: ['río'],
    category: 'nature',
    image: 'images/japanese/kawa.webp',
    audio: 'audio/japanese/kawa.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌊', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'かわ', availableForAges: [6] },
      { type: 'kanji', value: '川', availableForAges: [6] },
      { type: 'audio', value: 'kawa', availableForAges: [4, 6] }
    ]
  },
  // Resto de kanji de naturaleza (12 totales)
  {
    id: 'hi',
    hiragana: 'ひ',
    kanji: '日',
    meanings: ['sol', 'día'],
    category: 'nature',
    image: 'images/japanese/hi.webp',
    audio: 'audio/japanese/hi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '☀️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'ひ', availableForAges: [6] },
      { type: 'kanji', value: '日', availableForAges: [6] },
      { type: 'audio', value: 'hi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'tsuki',
    hiragana: 'つき',
    kanji: '月',
    meanings: ['luna'],
    category: 'nature',
    image: 'images/japanese/tsuki.webp',
    audio: 'audio/japanese/tsuki.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌙', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'つき', availableForAges: [6] },
      { type: 'kanji', value: '月', availableForAges: [6] },
      { type: 'audio', value: 'tsuki', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'hi-fire',
    hiragana: 'ひ',
    kanji: '火',
    meanings: ['fuego'],
    category: 'nature',
    image: 'images/japanese/hi-fire.webp',
    audio: 'audio/japanese/hi-fire.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🔥', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'ひ', availableForAges: [6] },
      { type: 'kanji', value: '火', availableForAges: [6] },
      { type: 'audio', value: 'hi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'mizu',
    hiragana: 'みず',
    kanji: '水',
    meanings: ['agua'],
    category: 'nature',
    image: 'images/japanese/mizu.webp',
    audio: 'audio/japanese/mizu.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '💧', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'みず', availableForAges: [6] },
      { type: 'kanji', value: '水', availableForAges: [6] },
      { type: 'audio', value: 'mizu', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'tsuchi',
    hiragana: 'つち',
    kanji: '土',
    meanings: ['tierra'],
    category: 'nature',
    image: 'images/japanese/tsuchi.webp',
    audio: 'audio/japanese/tsuchi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌍', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'つち', availableForAges: [6] },
      { type: 'kanji', value: '土', availableForAges: [6] },
      { type: 'audio', value: 'tsuchi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'hana',
    hiragana: 'はな',
    kanji: '花',
    meanings: ['flor'],
    category: 'nature',
    image: 'images/japanese/hana.webp',
    audio: 'audio/japanese/hana.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌸', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'はな', availableForAges: [6] },
      { type: 'kanji', value: '花', availableForAges: [6] },
      { type: 'audio', value: 'hana', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'ame',
    hiragana: 'あめ',
    kanji: '雨',
    meanings: ['lluvia'],
    category: 'nature',
    image: 'images/japanese/ame.webp',
    audio: 'audio/japanese/ame.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '🌧️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'あめ', availableForAges: [6] },
      { type: 'kanji', value: '雨', availableForAges: [6] },
      { type: 'audio', value: 'ame', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'yuki',
    hiragana: 'ゆき',
    kanji: '雪',
    meanings: ['nieve'],
    category: 'nature',
    image: 'images/japanese/yuki.webp',
    audio: 'audio/japanese/yuki.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '❄️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'ゆき', availableForAges: [6] },
      { type: 'kanji', value: '雪', availableForAges: [6] },
      { type: 'audio', value: 'yuki', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'sora',
    hiragana: 'そら',
    kanji: '空',
    meanings: ['cielo'],
    category: 'nature',
    image: 'images/japanese/sora.webp',
    audio: 'audio/japanese/sora.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.kanji.recognition', 'japanese.kanji.reading', 'japanese.kanji.meaning', 'japanese.kanji.nature'],
    representations: [
      { type: 'image', value: '☁️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'そら', availableForAges: [6] },
      { type: 'kanji', value: '空', availableForAges: [6] },
      { type: 'audio', value: 'sora', availableForAges: [4, 6] }
    ]
  },
  // Fase 5: Kanji de calendario - días de la semana con lecturas on/kun explícitas
  {
    id: 'getsuyoubi',
    hiragana: 'げつようび',
    kanji: '月曜日',
    meanings: ['lunes'],
    category: 'calendar',
    image: 'images/japanese/getsuyoubi.webp',
    audio: 'audio/japanese/getsuyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '月',
      onReading: 'げつ',
      kunReading: 'つき',
      meaning: 'luna/mes'
    },
    representations: [
      { type: 'image', value: '🌙', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'げつようび', availableForAges: [6] },
      { type: 'kanji', value: '月曜日', availableForAges: [6] },
      { type: 'audio', value: 'getsuyoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'kayoubi',
    hiragana: 'かようび',
    kanji: '火曜日',
    meanings: ['martes'],
    category: 'calendar',
    image: 'images/japanese/kayoubi.webp',
    audio: 'audio/japanese/kayoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '火',
      onReading: 'か',
      kunReading: 'ひ',
      meaning: 'fuego'
    },
    representations: [
      { type: 'image', value: '🔥', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'かようび', availableForAges: [6] },
      { type: 'kanji', value: '火曜日', availableForAges: [6] },
      { type: 'audio', value: 'kayoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'suiyoubi',
    hiragana: 'すいようび',
    kanji: '水曜日',
    meanings: ['miércoles'],
    category: 'calendar',
    image: 'images/japanese/suiyoubi.webp',
    audio: 'audio/japanese/suiyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '水',
      onReading: 'すい',
      kunReading: 'みず',
      meaning: 'agua'
    },
    representations: [
      { type: 'image', value: '💧', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'すいようび', availableForAges: [6] },
      { type: 'kanji', value: '水曜日', availableForAges: [6] },
      { type: 'audio', value: 'suiyoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'mokuyoubi',
    hiragana: 'もくようび',
    kanji: '木曜日',
    meanings: ['jueves'],
    category: 'calendar',
    image: 'images/japanese/mokuyoubi.webp',
    audio: 'audio/japanese/mokuyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '木',
      onReading: 'もく',
      kunReading: 'き',
      meaning: 'árbol'
    },
    representations: [
      { type: 'image', value: '🌳', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'もくようび', availableForAges: [6] },
      { type: 'kanji', value: '木曜日', availableForAges: [6] },
      { type: 'audio', value: 'mokuyoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'kinyoubi',
    hiragana: 'きんようび',
    kanji: '金曜日',
    meanings: ['viernes'],
    category: 'calendar',
    image: 'images/japanese/kinyoubi.webp',
    audio: 'audio/japanese/kinyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '金',
      onReading: 'きん',
      kunReading: 'かね',
      meaning: 'oro/dinero'
    },
    representations: [
      { type: 'image', value: '💰', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'きんようび', availableForAges: [6] },
      { type: 'kanji', value: '金曜日', availableForAges: [6] },
      { type: 'audio', value: 'kinyoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'doyoubi',
    hiragana: 'どようび',
    kanji: '土曜日',
    meanings: ['sábado'],
    category: 'calendar',
    image: 'images/japanese/doyoubi.webp',
    audio: 'audio/japanese/doyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '土',
      onReading: 'ど',
      kunReading: 'つち',
      meaning: 'tierra'
    },
    representations: [
      { type: 'image', value: '🌍', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'どようび', availableForAges: [6] },
      { type: 'kanji', value: '土曜日', availableForAges: [6] },
      { type: 'audio', value: 'doyoubi', availableForAges: [4, 6] }
    ]
  },
  {
    id: 'nichiyoubi',
    hiragana: 'にちようび',
    kanji: '日曜日',
    meanings: ['domingo'],
    category: 'calendar',
    image: 'images/japanese/nichiyoubi.webp',
    audio: 'audio/japanese/nichiyoubi.wav',
    recommendedAgeMin: 6,
    difficulty: 2,
    skills: ['japanese.calendar.days', 'japanese.calendar.kanji'],
    readings: {
      kanji: '日',
      onReading: 'にち',
      kunReading: 'ひ',
      meaning: 'sol/día'
    },
    representations: [
      { type: 'image', value: '☀️', availableForAges: [4, 6] },
      { type: 'hiragana', value: 'にちようび', availableForAges: [6] },
      { type: 'kanji', value: '日曜日', availableForAges: [6] },
      { type: 'audio', value: 'nichiyoubi', availableForAges: [4, 6] }
    ]
  }
];

// Helper para filtrar por edad y categoría
export function getWordsForProfile(age: number, category?: string): JapaneseWord[] {
  return INITIAL_JAPANESE_WORDS.filter(w => {
    if (w.recommendedAgeMin > age) return false;
    if (category && w.category !== category) return false;
    return true;
  });
}

export function getWordsBySkill(skillId: string, age: number): JapaneseWord[] {
  return INITIAL_JAPANESE_WORDS.filter(w =>
    w.skills.includes(skillId) && w.recommendedAgeMin <= age
  );
}
