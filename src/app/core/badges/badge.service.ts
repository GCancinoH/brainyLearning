/**
 * Servicio global de insignias.
 *
 * Escucha UNA vez el flujo de `GameSessionService.events` (no un juego concreto) y
 * traduce eventos reales a insignias. La Fase 1 no tocó los juegos; la Fase 3
 * instrumentó `hanzi-numbers` y `kanji-compose` para que envíen
 * `firstTry` / `perfectRound` y `help-used`. La Fase C (F5) añadió `RoundTracker`
 * a los 13 juegos restantes (incl. `logic-blocks`).
 */

import { OnDestroy, Service, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { SessionEvent } from '../games/game-types';
import { GameProgressService } from '../games/game-progress.service';
import { GameSessionService } from '../games/game-session.service';
import { PlayerProfile } from '../models/player-profile';
import { ProfileStateService } from '../services/profile-state';
import { badgeById } from './badge-catalog';
import {
  BadgeRuleContext,
  SavedGameProgress,
  evaluateBadgeEvent,
  updateBadgeStats,
} from './badge-rules';
import { Badge, BadgeStats, badgeValue } from './badge-types';

@Service()
export class BadgeService implements OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly session = inject(GameSessionService);
  private readonly progress = inject(GameProgressService);

  private readonly _queue = signal<Badge[]>([]);
  /** Insignias pendientes de mostrar, en orden de llegada. */
  readonly queue = this._queue.asReadonly();
  readonly current = computed(() => this._queue()[0] ?? null);
  readonly pendingCount = computed(() => this._queue().length);

  private readonly sub: Subscription;
  /** Perfil al que pertenece la sesión en curso. Si cambia, se ignora lo viejo. */
  private sessionProfileId: string | null = null;
  /**
   * Hubo un error y aún no llegó el acierto.
   *
   * `recordIncorrect()` emite `answer-incorrect` + `streak-update`, y entre el error y
   * el acierto puede colarse `help-used`. Inferir por "el evento anterior" fallaba;
   * una bandera no depende del orden.
   */
  private retryArmed = false;

  /**
   * Contadores acumulados que todavía no se han escrito en el perfil.
   *
   * Escribir el perfil entero (localStorage + Firestore) en cada respuesta es tráfico
   * y batería sin beneficio: los contadores no necesitan estar al instante. Las
   * insignias sí se guardan al momento, porque hay un diálogo que mostrar.
   */
  private pendingStats: BadgeStats | null = null;
  /** Perfil al que pertenecen los contadores pendientes. */
  private pendingProfileId: string | null = null;

  /** Red de seguridad: si algo impide el flush normal, no se pierde más de 30 s. */
  private readonly flushTimer: ReturnType<typeof setInterval> | null;
  private readonly onVisibilityChange = (): void => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      this.flushStats();
    }
  };

  constructor() {
    this.sub = this.session.events.subscribe(event => this.handleEvent(event));

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.onVisibilityChange);
    }
    this.flushTimer = setInterval(() => this.flushStats(), 30_000);
    // En Node (tests) un intervalo vivo impide que el proceso termine.
    const timer = this.flushTimer as unknown as { unref?: () => void };
    timer?.unref?.();
  }

  // ============================================
  // API PÚBLICA
  // ============================================

  dismissCurrent(): void {
    this._queue.update(q => q.slice(1));
  }

  /**
   * Pone delante la insignia de más valor de la cola.
   *
   * Al subir de nivel se gana el paso del juego y, a veces, el del mundo. El diálogo
   * de mitad de sesión solo puede mostrar una (§5.3): se enseña la más significativa
   * y el resto queda en cola para el resumen. El orden es estable: a igual valor,
   * respeta el orden en que se ganaron.
   */
  promoteMostValuable(): void {
    this._queue.update(queue => [...queue].sort((a, b) => badgeValue(b) - badgeValue(a)));
  }

  clearQueue(): void {
    this._queue.set([]);
  }

  /** Marca como vistas las insignias del álbum. */
  markSeen(ids: readonly string[]): void {
    if (ids.length === 0) return;
    this.flushStats();
    const set = new Set(ids);
    this.profileState.updateActiveProfile(profile => ({
      ...profile,
      badges: profile.badges.map(b => (set.has(b.id) ? { ...b, seen: true } : b)),
    }));
  }

  /**
   * Vuelca los contadores pendientes al perfil (y con él a localStorage/Firestore).
   *
   * Es idempotente y seguro de llamar en cualquier momento. Se llama al subir de
   * nivel, al terminar la sesión, al ocultarse la pestaña y cada 30 s.
   */
  flushStats(): void {
    const stats = this.pendingStats;
    const profileId = this.pendingProfileId;
    this.pendingStats = null;
    this.pendingProfileId = null;

    if (!stats || !profileId) return;

    const profile = this.profileState.activeProfile();
    // Si se cambió de perfil, no se escriben contadores en la niña equivocada.
    if (!profile || profile.id !== profileId) return;

    this.profileState.updateActiveProfile(p => ({ ...p, badgeStats: stats }));
  }

  /**
   * Otorga una insignia a mano (lab, pruebas o futuras recompensas).
   * Es idempotente: si ya está ganada no hace nada.
   */
  awardBadge(id: string): boolean {
    const badge = badgeById(id);
    const profile = this.profileState.activeProfile();
    if (!badge || !profile || profile.badges.some(b => b.id === id)) return false;

    // Cualquier contador pendiente se guarda junto con la insignia: no se pierde nada.
    this.flushStats();

    const updated = this.profileState.updateActiveProfile(p => ({
      ...p,
      badges: [...p.badges, { id, earnedAt: new Date().toISOString(), seen: false }],
    }));
    if (!updated) return false;
    this.enqueue([id]);
    return true;
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.flushStats();
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
    }
  }

  // ============================================
  // EVENTOS
  // ============================================

  private handleEvent(event: SessionEvent): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    if (event.type === 'session-start') {
      // Si quedaban contadores de una sesión anterior, se guardan antes de empezar.
      this.flushStats();
      this.sessionProfileId = profile.id;
      this.retryArmed = false;
    } else if (this.sessionProfileId !== profile.id) {
      // Evento de una sesión/perfil anterior: no se premia a la niña equivocada.
      return;
    }

    const ctx: BadgeRuleContext = {
      age: profile.age,
      retryArmed: this.retryArmed,
      savedProgress:
        event.type === 'session-start' ? this.readSavedProgress(event.gameId) : undefined,
    };

    // Las reglas evalúan contra los contadores pendientes (si los hay) para que los
    // umbrales se detecten sin esperar al guardado.
    const baseStats = this.pendingStats ?? profile.badgeStats;
    const nextStats = updateBadgeStats(event, baseStats, ctx);
    const earned = new Set(profile.badges.map(b => b.id));
    const newIds = evaluateBadgeEvent(event, nextStats, earned, ctx);
    const statsChanged = !sameStats(baseStats, nextStats);

    if (statsChanged) {
      this.pendingStats = nextStats;
      this.pendingProfileId = profile.id;
    }

    // Insignia ganada → se guarda YA (hay un diálogo que mostrar; no se puede perder).
    // Los contadores se escriben junto con ella para no dejar nada a medias.
    if (newIds.length > 0) {
      const earnedAt = new Date(event.timestamp).toISOString();
      const statsToSave = this.pendingStats ?? profile.badgeStats;
      const updated = this.profileState.updateActiveProfile(p => ({
        ...p,
        badgeStats: statsToSave,
        badges: [...p.badges, ...newIds.map(id => ({ id, earnedAt, seen: false }))],
      }));

      if (updated) {
        this.pendingStats = null;
        this.pendingProfileId = null;
        this.enqueue(newIds);
      }
    }

    this.retryArmed =
      event.type === 'answer-incorrect'
        ? true
        : event.type === 'answer-correct'
          ? false
          : this.retryArmed;

    if (event.type === 'level-up' || event.type === 'game-complete') {
      this.flushStats();
    }

    if (event.type === 'session-end' || event.type === 'time-up') {
      this.flushStats();
      this.sessionProfileId = null;
      this.retryArmed = false;
    }
  }

  private readSavedProgress(gameId: string): SavedGameProgress | null {
    const saved = this.progress.getProgress(gameId);
    if (!saved) return null;
    return {
      level: saved.level,
      completed: saved.completed,
      totalCorrect: saved.totalCorrect,
    };
  }

  private enqueue(ids: readonly string[]): void {
    const badges = ids
      .map(id => badgeById(id))
      .filter((b): b is Badge => !!b);

    this._queue.update(queue => {
      const existing = new Set(queue.map(b => b.id));
      return [...queue, ...badges.filter(b => !existing.has(b.id))];
    });
  }
}

/**
 * Compara dos `BadgeStats` sin enumerar campos a mano.
 *
 * Enumerar campos hacía fácil olvidar uno (pasó con `perfectRounds`, F2). Recorriendo
 * las claves, añadir un contador nuevo no puede dejar de guardarse.
 */
export function sameStats(a: BadgeStats, b: BadgeStats): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof BadgeStats>;
  for (const key of keys) {
    const x = a[key];
    const y = b[key];
    if (Array.isArray(x) && Array.isArray(y)) {
      if (!sameList(x, y)) return false;
    } else if ((x ?? 0) !== (y ?? 0)) {
      return false;
    }
  }
  return true;
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
