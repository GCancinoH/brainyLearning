import { Injectable, computed, inject, signal } from '@angular/core';
import { ProfileStateService } from './profile-state';
import {
  Theme, ThemeTimeEntry, freshEntry, isResting, refreshEntry, restLeftMs, tickEntry
} from './theme-time';

const STORAGE_KEY = 'brainyLearning_themeTime';
/** Máximo que se descuenta por tick: si el dispositivo "se durmió", ese tiempo no cuenta */
const MAX_TICK_MS = 2500;

/**
 * Reloj de juego por tema. Corre solo mientras la niña está DENTRO de un juego
 * del tema y la pestaña está a la vista. Al llegar a cero publica `expired`;
 * quien lo escucha (App) guarda el avance y la lleva al dashboard.
 */
@Injectable({ providedIn: 'root' })
export class ThemeTimeService {
  private readonly profileState = inject(ProfileStateService);

  private readonly entries = signal<Record<string, ThemeTimeEntry>>(this.load());
  private readonly _activeTheme = signal<Theme | null>(null);
  private readonly _remainingMs = signal(0);
  private readonly _expired = signal<{ theme: Theme; seq: number } | null>(null);

  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private ticksSinceSave = 0;
  private seq = 0;

  /** Tema que está corriendo (null en menús, dashboard, etc.) */
  readonly activeTheme = this._activeTheme.asReadonly();
  readonly remainingMs = this._remainingMs.asReadonly();
  readonly expired = this._expired.asReadonly();
  readonly running = computed(() => this._activeTheme() !== null);

  constructor() {
    if (typeof document !== 'undefined') {
      // Al ocultar la pestaña se guarda; al volver no se cuenta el tiempo que estuvo oculta
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.persist();
        this.lastTick = Date.now();
      });
    }
  }

  /** ¿El tema está descansando ahora? */
  isResting(theme: Theme): boolean {
    return isResting(this.entryOf(theme), Date.now());
  }

  /** Milisegundos que le faltan al descanso del tema (0 si no descansa) */
  restLeftMs(theme: Theme): number {
    return restLeftMs(this.entryOf(theme), Date.now());
  }

  /** Empieza a contar el tiempo de un tema. Devuelve false si está descansando. */
  enter(theme: Theme): boolean {
    const profileId = this.profileState.activeProfileId();
    if (!profileId) return false;
    const now = Date.now();
    const key = this.key(profileId, theme);

    if (isResting(this.entries()[key], now)) return false;

    // Ya corriendo en este mismo tema: no reiniciar
    if (this._activeTheme() === theme && this.interval) return true;
    this.stopTicking();

    const entry = refreshEntry(this.entries()[key], now);
    this.entries.update(e => ({ ...e, [key]: entry }));
    this._activeTheme.set(theme);
    this._remainingMs.set(entry.remainingMs);
    this._expired.set(null);
    this.lastTick = now;
    this.ticksSinceSave = 0;
    this.persist();
    this.interval = setInterval(() => this.tick(), 1000);
    return true;
  }

  /** Deja de contar (al salir a menú/dashboard o al terminar) */
  leave(): void {
    this.stopTicking();
    this._activeTheme.set(null);
    this.persist();
  }

  private tick(): void {
    const theme = this._activeTheme();
    const profileId = this.profileState.activeProfileId();
    if (!theme || !profileId) return;

    const now = Date.now();
    const delta = Math.min(now - this.lastTick, MAX_TICK_MS);
    this.lastTick = now;
    if (typeof document !== 'undefined' && document.hidden) return;

    const key = this.key(profileId, theme);
    const current = this.entries()[key] ?? freshEntry(now);
    const next = tickEntry(current, delta, now);
    this.entries.update(e => ({ ...e, [key]: next }));
    this._remainingMs.set(next.remainingMs);

    if (++this.ticksSinceSave >= 5) this.persist();

    if (next.remainingMs <= 0) {
      this.stopTicking();
      this.persist();
      this._expired.set({ theme, seq: ++this.seq });
    }
  }

  private stopTicking(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private entryOf(theme: Theme): ThemeTimeEntry | undefined {
    const profileId = this.profileState.activeProfileId();
    return profileId ? this.entries()[this.key(profileId, theme)] : undefined;
  }

  private key(profileId: string, theme: Theme): string {
    return `${profileId}:${theme}`;
  }

  private load(): Record<string, ThemeTimeEntry> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    this.ticksSinceSave = 0;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries()));
    } catch { /* sin almacenamiento: el reloj sigue funcionando en memoria */ }
  }
}
