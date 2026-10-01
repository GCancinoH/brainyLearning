export type ThemePreference = 'space' | 'mushrooms' | 'ocean' | 'human-body';

export interface Sticker {
  id: string;
  name: string;
  category: ThemePreference;
  imageUrl: string;
  unlockedAt: string; // ISO String
}
export interface GameProgress {
  level: number;
  completed: boolean;
}

export interface GameSubjectProgress {
  level: number;
  points: number;
  correctAnswers: number;
  attempts: number;
  completedActivities: string[];
}

export interface PlayerProgress {
  math: GameSubjectProgress;
  spanish: GameSubjectProgress;
  english: GameSubjectProgress;
  japanese: GameSubjectProgress;
}

export interface PlayerProfile {
  id: string;
  name: string;
  age: 4 | 6;
  avatar: string; // ID o ruta del avatar/mascota elegida
  mathProgress?: {
      [key: string]: GameProgress | undefined; // Permite indexar por cualquier string
      'space-addition'?: GameProgress;
      'space-subtraction'?: GameProgress;
      'space-multiply'?: GameProgress;
  };
  preferredTheme: ThemePreference;
  createdAt: string;
  stickers: Sticker[];
  progress: PlayerProgress;
}

// Perfil inicial por defecto según edad
export function createInitialProfile(name: string, age: 4 | 6, avatar: string, theme: ThemePreference): PlayerProfile {
  return {
    id: `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name,
    age,
    avatar,
    preferredTheme: theme,
    createdAt: new Date().toISOString(),
    stickers: [],
    progress: {
      math: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
      spanish: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
      english: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] },
      japanese: { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] }
    }
  };
}
