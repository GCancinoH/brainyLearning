import { Service, inject, signal } from '@angular/core';
import { ProfileStateService } from '../services/profile-state';

export const JAPANESE_VOCAB_DECK = 'japanese-vocab';
const STORAGE_KEY = 'brainyLearning_srs';

export interface ItemMemory {
  box: number;            // 1..5 (Leitner, siguiente paso)
  introducedAt: number;
  lastSeenAt: number;
  dueAt: number;
}

@Service()
export class SpacedRepetition {
  private readonly profileState = inject(ProfileStateService);
  private readonly _memory = signal<Record<string, ItemMemory>>(this.load());

  isIntroduced(deck: string, itemId: string): boolean {
    const key = this.key(deck, itemId);
    return !!key && key in this._memory();
  }

  markIntroduced(deck: string, itemIds: string[]): void {
    const now = Date.now();
    this._memory.update(mem => {
      const next = { ...mem };
      for (const id of itemIds) {
        const key = this.key(deck, id);
        if (key && !(key in next)) {
          next[key] = { box: 1, introducedAt: now, lastSeenAt: now, dueAt: now };
        }
      }
      return next;
    });
    this.save();
  }

  /** Reparte el lote alternando categorías (contraste) */
  pickIntroBatch<T extends { id: string; category: string }>(items: T[], size: number): T[] {
    const groups: T[][] = [];
    const index = new Map<string, T[]>();
    for (const item of items) {
      let group = index.get(item.category);
      if (!group) { group = []; index.set(item.category, group); groups.push(group); }
      group.push(item);
    }
    const batch: T[] = [];
    while (batch.length < size && groups.some(g => g.length > 0)) {
      for (const group of groups) {
        const next = group.shift();
        if (next && batch.length < size) batch.push(next);
      }
    }
    return batch;
  }

  /** Perfiles que ya jugaron: sus palabras previas cuentan como presentadas (solo si no hay registro) */
  seedFromAttempts(deck: string, attempts: { profileId: string; contentId: string }[]): void {
    const profileId = this.profileState.activeProfile()?.id;
    if (!profileId) return;
    const prefix = `${profileId}:${deck}:`;
    if (Object.keys(this._memory()).some(k => k.startsWith(prefix))) return;
    const ids = [...new Set(attempts.filter(a => a.profileId === profileId).map(a => a.contentId))];
    if (ids.length) this.markIntroduced(deck, ids);
  }

  private key(deck: string, itemId: string): string | null {
    const profile = this.profileState.activeProfile();
    return profile ? `${profile.id}:${deck}:${itemId}` : null;
  }

  private load(): Record<string, ItemMemory> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._memory())); }
    catch (e) { console.warn('[SRS] Error guardando:', e); }
  }
}
