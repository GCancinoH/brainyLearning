// src/app/core/firebase/firestore.service.ts
import { Service } from '@angular/core';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase.config';
import { PlayerProfile } from '../models/player-profile';

@Service()
export class FirestoreService {
  async saveProfileToCloud(profile: PlayerProfile): Promise<void> {
    try {
      const profileRef = doc(db, 'profiles', profile.id);
      await setDoc(profileRef, profile, { merge: true });
    } catch (error) {
      console.warn('Sincronización en la nube diferida (Offline mode):', error);
    }
  }

  async fetchProfileFromCloud(profileId: string): Promise<PlayerProfile | null> {
    try {
      const profileRef = doc(db, 'profiles', profileId);
      const snapshot = await getDoc(profileRef);
      return snapshot.exists() ? (snapshot.data() as PlayerProfile) : null;
    } catch {
      return null;
    }
  }
}
