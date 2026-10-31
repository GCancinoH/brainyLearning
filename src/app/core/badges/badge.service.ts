/**
 * Servicio global de insignias.
 *
 * Escucha UNA vez el flujo de `GameSessionService.events` (no un juego concreto) y
 * traduce eventos reales a insignias. No toca los 15 juegos: para la primera versión
 * todo lo que necesita ya lo emiten ellos.
 */

import { OnDestroy, Service, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { SessionEvent, SessionEventType } from '../games/game-types';
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
  private lastEventType: SessionEventType | null = null;
  private lastEventGameId: string | null = null;

  constructor() {
    this.sub = this.session.events.subscribe(event => this.handleEvent(event));
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
    const set = new Set(ids);
    this.profileState.updateActiveProfile(profile => ({
      ...profile,
      badges: profile.badges.map(b => (set.has(b.id) ? { ...b, seen: true } : b)),
    }));
  }

  /**
   * Otorga una insignia a mano (lab, pruebas o futuras recompensas).
   * Es idempotente: si ya está ganada no hace nada.
   */
  awardBadge(id: string): boolean {
    const badge = badgeById(id);
    const profile = this.profileState.activeProfile();
    if (!badge || !profile || profile.badges.some(b => b.id === id)) return false;

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
  }

  // ============================================
  // EVENTOS
  // ============================================

  private handleEvent(event: SessionEvent): void {
    const profile = this.profileState.activeProfile();
    if (!profile) return;

    if (event.type === 'session-start') {
      this.sessionProfileId = profile.id;
      this.lastEventType = null;
      this.lastEventGameId = null;
    } else if (this.sessionProfileId !== profile.id) {
      // Evento de una sesión/perfil anterior: no se premia a la niña equivocada.
      return;
    }

    const ctx: BadgeRuleContext = {
      age: profile.age,
      lastEventType:
        this.lastEventGameId === event.gameId ? this.lastEventType ?? undefined : undefined,
      savedProgress:
        event.type === 'session-start' ? this.readSavedProgress(event.gameId) : undefined,
    };

    const nextStats = updateBadgeStats(event, profile.badgeStats, ctx);
    const earned = new Set(profile.badges.map(b => b.id));
    const newIds = evaluateBadgeEvent(event, nextStats, earned, ctx);
    const statsChanged = !sameStats(profile.badgeStats, nextStats);

    if (newIds.length > 0 || statsChanged) {
      const earnedAt = new Date(event.timestamp).toISOString();
      const updated = this.profileState.updateActiveProfile(p => ({
        ...p,
        badgeStats: nextStats,
        badges:
          newIds.length > 0
            ? [
                ...p.badges,
                ...newIds.map(id => ({ id, earnedAt, seen: false })),
              ]
            : p.badges,
      }));

      if (updated && newIds.length > 0) this.enqueue(newIds);
    }

    this.lastEventType = event.type;
    this.lastEventGameId = event.gameId;

    if (event.type === 'session-end' || event.type === 'time-up') {
      this.sessionProfileId = null;
      this.lastEventType = null;
      this.lastEventGameId = null;
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

function sameStats(a: BadgeStats, b: BadgeStats): boolean {
  return (
    a.retrySuccess === b.retrySuccess &&
    a.sessionsCompleted === b.sessionsCompleted &&
    (a.firstTryCorrect ?? 0) === (b.firstTryCorrect ?? 0) &&
    (a.helpUsed ?? 0) === (b.helpUsed ?? 0) &&
    sameList(a.gamesPlayed, b.gamesPlayed) &&
    sameList(a.daysPlayed, b.daysPlayed)
  );
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, i) => value === b[i]);
}
