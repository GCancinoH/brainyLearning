import {
  BadgeStats,
  EarnedBadge,
  createInitialBadgeStats,
} from '../badges/badge-types';

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
  /** 3.1 · Para que el panel de padres/reflexión pueda leer los juegos de chino. */
  chinese: GameSubjectProgress;
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
  /** Logros ganados (no decorativos: ver `Sticker`). */
  badges: EarnedBadge[];
  /** Contadores acumulados que alimentan las insignias de esfuerzo. */
  badgeStats: BadgeStats;
  progress: PlayerProgress;
}

function emptySubjectProgress(): GameSubjectProgress {
  return { level: 1, points: 0, correctAnswers: 0, attempts: 0, completedActivities: [] };
}

export function createInitialProgress(): PlayerProgress {
  return {
    math: emptySubjectProgress(),
    spanish: emptySubjectProgress(),
    english: emptySubjectProgress(),
    japanese: emptySubjectProgress(),
    chinese: emptySubjectProgress(),
  };
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
    badges: [],
    badgeStats: createInitialBadgeStats(),
    progress: createInitialProgress(),
  };
}

// ============================================
// MIGRACIÓN DE PERFILES VIEJOS
// ============================================

function uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0))];
}

function nonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function migrateSubject(raw: unknown): GameSubjectProgress {
  const base = emptySubjectProgress();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<GameSubjectProgress>;
  return {
    level: nonNegativeInt(value.level) || 1,
    points: nonNegativeInt(value.points),
    correctAnswers: nonNegativeInt(value.correctAnswers),
    attempts: nonNegativeInt(value.attempts),
    completedActivities: uniqueStrings(value.completedActivities),
  };
}

function migrateBadgeStats(raw: unknown): BadgeStats {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<BadgeStats>;
  return {
    gamesPlayed: uniqueStrings(value.gamesPlayed),
    daysPlayed: uniqueStrings(value.daysPlayed),
    retrySuccess: nonNegativeInt(value.retrySuccess),
    sessionsCompleted: nonNegativeInt(value.sessionsCompleted),
    firstTryCorrect: nonNegativeInt(value.firstTryCorrect),
    helpUsed: nonNegativeInt(value.helpUsed),
    perfectRounds: nonNegativeInt(value.perfectRounds),
  };
}

function migrateBadges(raw: unknown): EarnedBadge[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: EarnedBadge[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const badge = item as Partial<EarnedBadge>;
    if (typeof badge.id !== 'string' || !badge.id || seen.has(badge.id)) continue;
    seen.add(badge.id);
    out.push({
      id: badge.id,
      earnedAt: typeof badge.earnedAt === 'string' ? badge.earnedAt : new Date().toISOString(),
      seen: badge.seen === true,
    });
  }
  return out;
}

/**
 * Rellena los campos que no existían cuando se guardó el perfil.
 *
 * `loadProfilesFromStorage()` y la nube devuelven JSON viejo: sin esto, `badges` sería
 * `undefined` y el álbum reventaría al leer `.length`. También cubre `progress.chinese`,
 * que se añadió después de los primeros perfiles.
 */
export function migrateProfile(raw: Partial<PlayerProfile> & { id: string; name: string }): PlayerProfile {
  const progress = (raw.progress && typeof raw.progress === 'object' ? raw.progress : {}) as Partial<PlayerProgress>;
  return {
    id: raw.id,
    name: raw.name,
    age: raw.age === 6 ? 6 : 4,
    avatar: typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : '🦊',
    preferredTheme: raw.preferredTheme ?? 'space',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    stickers: Array.isArray(raw.stickers) ? raw.stickers : [],
    badges: migrateBadges(raw.badges),
    badgeStats: migrateBadgeStats(raw.badgeStats),
    progress: {
      math: migrateSubject(progress.math),
      spanish: migrateSubject(progress.spanish),
      english: migrateSubject(progress.english),
      japanese: migrateSubject(progress.japanese),
      chinese: migrateSubject(progress.chinese),
    },
    ...(raw.mathProgress ? { mathProgress: raw.mathProgress } : {}),
  };
}
