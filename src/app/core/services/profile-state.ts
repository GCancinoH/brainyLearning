import { Service, inject, signal, computed, effect } from '@angular/core';
import { PlayerProfile, GameProgress } from '../models/player-profile';
import { FirestoreService } from '@core/firebase/firebase.service';
import { ALL_GAMES } from '@core/models/game-catalog';


const LOCAL_STORAGE_PROFILES_KEY = 'brainyLearning_profiles';
const LOCAL_STORAGE_ACTIVE_ID_KEY = 'brainyLearning_active_id';

@Service()
export class ProfileStateService {
  private readonly firestoreService = inject(FirestoreService);

  // Signals de estado
  readonly profiles = signal<PlayerProfile[]>(this.loadProfilesFromStorage());
  readonly activeProfileId = signal<string | null>(this.loadActiveProfileIdFromStorage());

  // Signal computada: Perfil activo actualmente
  readonly activeProfile = computed(() => {
    const id = this.activeProfileId();
    return this.profiles().find(p => p.id === id) || null;
  });

  // Signal computada: Determina la edad de la jugadora activa
  readonly activePlayerAge = computed(() => {
    return this.activeProfile()?.age ?? 4;
  });

  constructor() {
    // 1. Sincroniza automáticamente cambios en perfiles con localStorage mediante Signals
    effect(() => {
      const currentProfiles = this.profiles();
      localStorage.setItem(LOCAL_STORAGE_PROFILES_KEY, JSON.stringify(currentProfiles));
    });

    // 2. Sincroniza el ID activo con localStorage
    effect(() => {
      const activeId = this.activeProfileId();
      if (activeId) {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_ID_KEY, activeId);
      } else {
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
      }
    });

    // 3. Sincronización inicial con la nube si existe un ID activo guardado
    this.syncActiveProfileFromCloud();
  }

  // ACCIONES DE PERFIL
  addProfile(newProfile: PlayerProfile): void {
    this.profiles.update(list => [...list, newProfile]);
    this.setActiveProfile(newProfile.id);

    // Guardar en Firestore en segundo plano
    this.firestoreService.saveProfileToCloud(newProfile).catch(() => {});
  }

  setActiveProfile(id: string): void {
    this.activeProfileId.set(id);
    this.syncActiveProfileFromCloud();
  }

  updateActiveProfileProgress(subject: keyof PlayerProfile['progress'], pointsGained: number, isCorrect: boolean): void {
    const active = this.activeProfile();
    if (!active) return;

    let updatedProfile: PlayerProfile | undefined;

    this.profiles.update(list =>
      list.map(profile => {
        if (profile.id !== active.id) return profile;

        const currentSubject = profile.progress[subject];
        updatedProfile = {
          ...profile,
          progress: {
            ...profile.progress,
            [subject]: {
              ...currentSubject,
              points: currentSubject.points + pointsGained,
              correctAnswers: currentSubject.correctAnswers + (isCorrect ? 1 : 0),
              attempts: currentSubject.attempts + 1
            }
          }
        };
        return updatedProfile;
      })
    );

    // Guardar actualización en la nube
    if (updatedProfile) {
      this.firestoreService.saveProfileToCloud(updatedProfile).catch(() => {});
    }
  }

  // ACCIONES DE JUEGOS Y NIVEL
  getGameLevel(gameId: string): number {
    const profile = this.activeProfile();
    if (!profile) return 1;

    const progressRecord = profile.mathProgress as Record<string, GameProgress | undefined> | undefined;
    const savedLevel = progressRecord?.[gameId]?.level;

    if (savedLevel) return savedLevel;

    const gameInfo = ALL_GAMES.find(g => g.id === gameId);
    return gameInfo?.startLevel?.[profile.age] ?? 1;
  }

  isGameCompleted(gameId: string): boolean {
    const profile = this.activeProfile();
    if (!profile) return false;

    const progressRecord = profile.mathProgress as Record<string, GameProgress | undefined> | undefined;
    return progressRecord?.[gameId]?.completed ?? false;
  }

  saveGameProgress(gameId: string, level: number, completed: boolean = false): void {
    let updatedProfile: PlayerProfile | undefined;

    this.profiles.update(list => list.map(p => {
      if (p.id === this.activeProfileId()) {
        const currentMath = p.mathProgress || {};
        updatedProfile = {
          ...p,
          mathProgress: {
            ...currentMath,
            [gameId]: { level, completed }
          }
        };
        return updatedProfile;
      }
      return p;
    }));

    // Guardar inmediatamente en Firestore
    if (updatedProfile) {
      this.firestoreService.saveProfileToCloud(updatedProfile).catch(() => {});
    }
  }

  // En profile-state.ts
  isGameUnlocked(gameId: string): boolean {
    const profile = this.activeProfile();
    if (!profile) return false;

    const gameInfo = ALL_GAMES.find(g => g.id === gameId);
    if (!gameInfo || !gameInfo.unlockRequirement) {
      return true; // Si no tiene requisitos, está desbloqueado
    }

    const { requiredGameId, requiredLevel } = gameInfo.unlockRequirement;
    const currentLevel = this.getGameLevel(requiredGameId);

    return currentLevel >= requiredLevel;
  }

  // MÉTODOS PRIVADOS DE CARGA Y SINCRONIZACIÓN
  private async syncActiveProfileFromCloud(): Promise<void> {
    const activeId = this.activeProfileId();
    if (!activeId) return;

    const cloudProfile = await this.firestoreService.fetchProfileFromCloud(activeId);
    if (cloudProfile) {
      this.profiles.update(list => {
        const index = list.findIndex(p => p.id === cloudProfile.id);
        if (index !== -1) {
          const updated = [...list];
          updated[index] = cloudProfile;
          return updated;
        }
        return [...list, cloudProfile];
      });
    }
  }

  private loadProfilesFromStorage(): PlayerProfile[] {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_PROFILES_KEY);
      if (!raw) return [];

      const parsed = JSON.parse(raw);

      // Validación estricta para asegurar que sea un arreglo válido
      if (Array.isArray(parsed)) {
        return parsed.filter(p => typeof p.id === 'string' && typeof p.name === 'string');
      }
      return [];
    } catch {
      console.warn('Error al leer perfiles del almacenamiento local.');
      return [];
    }
  }

  private loadActiveProfileIdFromStorage(): string | null {
    return localStorage.getItem(LOCAL_STORAGE_ACTIVE_ID_KEY);
  }
}
