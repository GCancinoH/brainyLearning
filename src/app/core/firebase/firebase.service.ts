// src/app/core/firebase/firestore.service.ts
import { Service } from '@angular/core';
import { PlayerProfile } from '../models/player-profile';

/**
 * Servicio de Firestore con carga perezosa del SDK de Firebase.
 *
 * Los imports de Firebase son dinámicos para que el SDK no entre en el bundle inicial.
 * Solo se carga cuando se llama por primera vez a `saveProfileToCloud` o `fetchProfileFromCloud`.
 */
@Service()
export class FirestoreService {
  private dbPromise: Promise<import('firebase/firestore').Firestore> | null = null;

  private async getDb(): Promise<import('firebase/firestore').Firestore> {
    if (!this.dbPromise) {
      this.dbPromise = (async () => {
        const { initializeApp } = await import('firebase/app');
        const { getFirestore } = await import('firebase/firestore');
        const { firebaseConfig } = await import('./firebase.config');

        const app = initializeApp(firebaseConfig);
        return getFirestore(app);
      })();
    }
    return this.dbPromise;
  }

  async saveProfileToCloud(profile: PlayerProfile): Promise<void> {
    try {
      const db = await this.getDb();
      const { doc, setDoc } = await import('firebase/firestore');
      const profileRef = doc(db, 'profiles', profile.id);
      await setDoc(profileRef, profile, { merge: true });
    } catch (error) {
      console.warn('Sincronización en la nube diferida (Offline mode):', error);
    }
  }

  async fetchProfileFromCloud(profileId: string): Promise<PlayerProfile | null> {
    try {
      const db = await this.getDb();
      const { doc, getDoc } = await import('firebase/firestore');
      const profileRef = doc(db, 'profiles', profileId);
      const snapshot = await getDoc(profileRef);
      return snapshot.exists() ? (snapshot.data() as PlayerProfile) : null;
    } catch {
      return null;
    }
  }
}
