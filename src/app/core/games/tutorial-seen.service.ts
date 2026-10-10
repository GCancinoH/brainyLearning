import { Service, inject, signal } from '@angular/core';
import { ProfileStateService } from '../services/profile-state';

/**
 * Qué tutoriales ya vio cada perfil.
 *
 * El tutorial de tres tiempos (mirar → demostración → "ahora tú") solo debe pasar la
 * primera vez: en la quinta ronda ya no aporta nada y sí le quita tiempo de juego.
 *
 * La clave es `perfil:juego:modo`, no solo `perfil:juego`, a propósito: el juego cambia de
 * una canasta a dos en el nivel 8, y eso es una mecánica distinta que hay que presentar
 * aunque ya haya visto el tutorial de una sola canasta.
 */
@Service()
export class TutorialSeen {
  private readonly profile = inject(ProfileStateService);

  private readonly _seen = signal<Record<string, true>>(this._load());

  /** Claves vistas por el perfil activo. */
  readonly seen = this._seen.asReadonly();

  private _load(): Record<string, true> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      // localStorage puede no existir (modo privado, SSR, entorno de test sin DOM).
      // Perder la memoria de los tutoriales es aceptable; romper la app, no.
      return {};
    }
  }

  private _persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._seen()));
    } catch { /* sin espacio o sin permiso: el tutorial se volverá a mostrar */ }
  }

  /** Id del perfil activo, o `'anon'` si no hay ninguno (laboratorio, test). */
  private _profileId(): string {
    return this.profile.activeProfile()?.id ?? 'anon';
  }

  private _key(gameId: string, mode: string): string {
    return `${this._profileId()}:${gameId}:${mode}`;
  }

  has(gameId: string, mode: string): boolean {
    return this._seen()[this._key(gameId, mode)] === true;
  }

  mark(gameId: string, mode: string): void {
    const k = this._key(gameId, mode);
    if (this._seen()[k]) return;
    this._seen.update(s => ({ ...s, [k]: true }));
    this._persist();
  }

  /**
   * Olvida un tutorial, o todos si no se indica juego. Para el laboratorio: hace falta
   * poder volver a ver la demostración sin tener que borrar el almacenamiento a mano.
   */
  reset(gameId?: string): void {
    if (!gameId) {
      this._seen.set({});
      this._persist();
      return;
    }
    const id = this._profileId();
    const prefijo = `${id}:${gameId}:`;
    const siguiente: Record<string, true> = {};
    for (const [k, v] of Object.entries(this._seen())) {
      if (!k.startsWith(prefijo)) siguiente[k] = v;
    }
    this._seen.set(siguiente);
    this._persist();
  }
}

const STORAGE_KEY = 'brainyLearning_tutorialSeen';