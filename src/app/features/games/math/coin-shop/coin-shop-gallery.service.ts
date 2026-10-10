import { Injectable, computed, inject, signal } from '@angular/core';
import { ProfileStateService } from '@core/services/profile-state';
import { comboKey } from './coin-shop-problem';

const STORAGE_KEY = 'brainyLearning_coinShopGallery';

/**
 * Colección persistente de combinaciones de pago descubiertas.
 *
 * Sin esto, `found` muere con cada ronda y descubrir una forma nueva no deja rastro: la niña
 * puede volver a tropezar con la misma combinación mil veces sin saber que ya la vio. Con la
 * galería, el juego tiene memoria: "de $7 ya has encontrado 6 formas" es una razón real para
 * volver a jugar, y le da un objetivo distinto al de "acertar más rápido".
 *
 * Se guarda por perfil, igual que el resto del progreso, para no mezclar las colecciones de
 * las dos niñas.
 */
@Injectable({ providedIn: 'root' })
export class CoinShopGallery {
  private readonly profileState = inject(ProfileStateService);

  private readonly _entries = signal<Record<string, string>>(this.load());

  /** Total de combinaciones distintas descubiertas, en toda la partida */
  readonly total = computed(() => Object.keys(this._entries()).length);

  /** Combinaciones descubiertas para un precio concreto */
  countForPrice(price: number): number {
    return Object.values(this._entries()).filter(k => k.endsWith(`|${price}`)).length;
  }

  /** Devuelve true si la combinación es nueva (y la guarda) */
  discover(price: number, coins: readonly number[]): boolean {
    const key = `${comboKey(coins)}|${price}`;
    if (this._entries()[key]) return false;
    this._entries.update(map => ({ ...map, [key]: String(Date.now()) }));
    this.persist();
    return true;
  }

  // ============================================
  // PERSISTENCIA
  // ============================================

  private storageKey(): string {
    return `${STORAGE_KEY}:${this.profileState.activeProfile()?.id ?? 'anon'}`;
  }

  private load(): Record<string, string> {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(this._entries()));
    } catch {
      /* sin espacio o sin permisos: la galería es opcional */
    }
  }

  reset(): void {
    this._entries.set({});
    try {
      localStorage.removeItem(this.storageKey());
    } catch {
      /* noop */
    }
  }
}