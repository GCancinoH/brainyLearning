/**
 * Tipos comunes del motor de juegos educativos
 * Fase 1: Motor común mínimo
 */

// ============================================
// ESTADOS DE FEEDBACK (reutilizables)
// ============================================
export type FeedbackState = 'idle' | 'success' | 'try-again' | 'level-up' | 'game-over';

export interface FeedbackConfig {
  state: FeedbackState;
  message: string;
  // Opcional: acción sugerida tras el feedback
  nextAction?: 'continue' | 'retry' | 'next-level' | 'end-session';
}

// Mensajes base por estado (pueden ser extendidos por cada juego)
export const BASE_FEEDBACK_MESSAGES: Record<Exclude<FeedbackState, 'idle'>, string[]> = {
  success: [
    '¡Muy bien! ⭐',
    '¡Excelente! 🌟',
    '¡Lo lograste! 🎉',
    '¡Increíble! ✨'
  ],
  'try-again': [
    '¡Casi! Intenta de nuevo 💪',
    'No te rindas, tú puedes 🌈',
    'Otra vez, cuenta con calma ✨',
    '¡Vamos, un intento más! 🚀'
  ],
  'level-up': [
    '¡NIVEL SUPERADO! 🎉',
    '¡SUBISTE DE NIVEL! 🚀✨',
    '¡GENIAL! Nuevo nivel desbloqueado 🌟'
  ],
  'game-over': [
    '¡Completaste el juego! 🏆',
    '¡Felicidades, lo lograste todo! 🌈',
    '¡Eres una campeona! ⭐'
  ]
};

// ============================================
// TIPOS DE AUDIO
// ============================================
export type AudioType =
  | 'praise'       // Elogio por acierto
  | 'success'      // Éxito genérico
  | 'failure'      // Error / intenta de nuevo
  | 'level-up'     // Subida de nivel
  | 'instruction'  // Instrucción de la actividad
  | 'question'     // Pregunta / palabra a escuchar
  | 'complete';    // Juego completado

export interface AudioAsset {
  type: AudioType;
  paths: string[];  // Múltiples variantes para variación
  volume?: number;  // 0-1, default 0.85
}

// Configuración de audio por defecto (sobrescribible por juego)
export const DEFAULT_AUDIO_CONFIG: AudioAsset[] = [
  { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
  { type: 'success', paths: ['audio/success.wav'], volume: 0.85 },
  { type: 'failure', paths: ['audio/failure.wav'], volume: 0.7 },
  { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
  { type: 'instruction', paths: [], volume: 0.85 },
  { type: 'question', paths: [], volume: 0.9 },
  { type: 'complete', paths: ['audio/level-up.wav'], volume: 0.9 }
];

// ============================================
// ESTADO DE SESIÓN DE JUEGO
// ============================================
export interface GameSessionState {
  gameId: string;
  level: number;
  consecutiveCorrect: number;
  attempts: number;
  correctAnswers: number;
  incorrectAnswers: number;
  sessionStartedAt: number;
  sessionDurationMs: number;
  isTimeUp: boolean;
  isCompleted: boolean;
  // Configuración
  requiredCorrectForLevelUp: number;
  maxLevel: number;
}

export interface GameSessionConfig {
  gameId: string;
  sessionDurationMs: number;        // Default: 5 minutos
  requiredCorrectForLevelUp: number; // Default: 5
  maxLevel: number;                  // Default: 20
  initialLevel?: number;             // Se carga de persistencia
  canLevelUp?: () => boolean;
}

// ============================================
// PROGRESO DE JUEGO (persistido por perfil)
// ============================================
export interface GameProgress {
  gameId: string;
  level: number;
  completed: boolean;
  // Métricas extendidas (Fase 1+)
  totalAttempts: number;
  totalCorrect: number;
  totalIncorrect: number;
  accuracy: number;           // 0-1
  bestStreak: number;         // Mejor racha histórica
  lastPlayedAt: number;       // Timestamp
  totalPlayTimeMs: number;    // Tiempo acumulado
}

// Para compatibilidad con datos existentes (SpaceAddition guarda solo level + completed)
export interface LegacyGameProgress {
  level: number;
  completed: boolean;
}

// ============================================
// EVENTOS DE SESIÓN (para comunicación engine ↔ session)
// ============================================
export type SessionEventType =
  | 'session-start'
  | 'session-end'
  | 'time-up'
  | 'level-up'
  | 'game-complete'
  | 'answer-correct'
  | 'answer-incorrect'
  | 'streak-update';

export interface SessionEvent {
  type: SessionEventType;
  gameId: string;
  timestamp: number;
  payload?: Record<string, unknown>;
}

// ============================================
// CONFIGURACIÓN POR PERFIL (edad)
// ============================================
export interface ProfileGameConfig {
  // Número de opciones mostradas
  minOptions: number;
  maxOptions: number;
  // Tamaño de elementos visuales
  elementSize: 'large' | 'medium' | 'small';
  // Si requiere lectura de texto
  requiresReading: boolean;
  // Duración de sesión (ms)
  sessionDurationMs: number;
  // Nivel inicial sugerido
  suggestedInitialLevel: number;
  // Audio obligatorio
  audioRequired: boolean;
}

// Configuración por defecto por edad
export const PROFILE_GAME_CONFIGS: Record<4 | 6, ProfileGameConfig> = {
  4: {
    minOptions: 2,
    maxOptions: 3,
    elementSize: 'large',
    requiresReading: false,
    sessionDurationMs: 5 * 60 * 1000,
    suggestedInitialLevel: 1,
    audioRequired: true
  },
  6: {
    minOptions: 3,
    maxOptions: 4,
    elementSize: 'medium',
    requiresReading: true,
    sessionDurationMs: 5 * 60 * 1000,
    suggestedInitialLevel: 3,
    audioRequired: false
  }
};

// Helper para obtener config por edad
export function getProfileGameConfig(age: number): ProfileGameConfig {
  return age <= 4 ? PROFILE_GAME_CONFIGS[4] : PROFILE_GAME_CONFIGS[6];
}
