import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SessionEvent } from '@core/games/game-types';
import { GameSessionService } from '@core/games/game-session.service';
import { ProfileStateService } from '@core/services/profile-state';
import { BadgeService } from '@core/badges/badge.service';
import { BadgeVoice } from '@core/badges/badge-voice';
import { BadgeDialog } from '../badge-dialog/badge-dialog';

/**
 * Anfitrión global del diálogo de insignias.
 *
 * Se monta una vez en `app.html`. Decide CUÁNDO se puede interrumpir:
 *   - al subir de nivel, una sola vez por sesión y tras una ventana corta;
 *   - al terminar la sesión (tiempo, completado o salida), hasta 3 seguidas.
 *
 * Si llega una respuesta mientras espera, cancela: no se tapa un problema.
 */
@Component({
  selector: 'badge-host',
  standalone: true,
  imports: [BadgeDialog],
  template: `
    <badge-dialog
      [badge]="badges.current()"
      [isVisible]="displayOpen()"
      [queueSize]="badges.pendingCount()"
      [age]="age()"
      (dismiss)="dismiss()"
    />
  `,
})
export class BadgeHost {
  readonly badges = inject(BadgeService);
  private readonly session = inject(GameSessionService);
  private readonly profileState = inject(ProfileStateService);
  private readonly voice = inject(BadgeVoice);

  readonly displayOpen = signal(false);
  readonly age = computed(() => this.profileState.activeProfile()?.age ?? 4);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private shownMidSession = false;
  private endSummary = false;
  private endShown = 0;
  private profileId: string | null = null;

  constructor() {
    this.session.events
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(event => this.onEvent(event));

    // La voz acompaña a la insignia visible; si el juego ya está hablando, BadgeVoice
    // decide no pisarla.
    effect(() => {
      const badge = this.badges.current();
      if (this.displayOpen() && badge) this.voice.say(badge);
    });

    // Compartir tableta: si cambia el perfil, lo pendiente era de la otra niña.
    effect(() => {
      const id = this.profileState.activeProfile()?.id ?? null;
      if (this.profileId !== null && id !== this.profileId) {
        this.badges.clearQueue();
        this.close();
      }
      this.profileId = id;
    });
  }

  dismiss(): void {
    this.voice.cancel();
    this.badges.dismissCurrent();

    if (this.endSummary && this.endShown < 3 && this.badges.pendingCount() > 0) {
      this.endShown++;
      // Se cierra un instante para que el cambio de insignia se note: sin la pausa,
      // el diálogo cambiaría de contenido de golpe.
      this.displayOpen.set(false);
      this.timer = setTimeout(() => {
        if (this.badges.pendingCount() > 0) this.displayOpen.set(true);
      }, 250);
      return;
    }

    this.close();
    this.endSummary = false;
  }

  private onEvent(event: SessionEvent): void {
    if (event.type === 'session-start') {
      this.cancelTimer();
      this.close();
      this.shownMidSession = false;
      this.endSummary = false;
      this.endShown = 0;
      return;
    }

    if (event.type === 'answer-correct' || event.type === 'answer-incorrect') {
      // Llegó una respuesta: no es momento de tapar el problema.
      if (!this.displayOpen()) this.cancelTimer();
      return;
    }

    if (event.type === 'level-up') {
      // Si es el último nivel, el resumen va al final, no encima de la celebración.
      if (event.payload?.['isMaxLevel'] === true) return;
      this.scheduleMidSession();
      return;
    }

    if (event.type === 'game-complete') {
      this.cancelTimer();
      this.endSummary = true;
      return;
    }

    if (event.type === 'time-up' || event.type === 'session-end') {
      const reason = event.payload?.['reason'];
      if (event.type === 'session-end' && (reason === 'new-session' || reason === 'resume')) {
        return;
      }
      this.scheduleEndSummary();
    }
  }

  private scheduleMidSession(): void {
    if (this.shownMidSession || this.endSummary || this.badges.pendingCount() === 0) return;
    this.cancelTimer();

    const tryShow = (): void => {
      if (this.shownMidSession || this.endSummary || this.badges.pendingCount() === 0) return;
      // Algunos juegos (p. ej. escucha) abren su propio diálogo de nivel y pausan la
      // sesión. La insignia espera a que ese diálogo se cierre: nunca dos encima.
      if (this.session.isPaused()) {
        this.timer = setTimeout(tryShow, 500);
        return;
      }
      this.shownMidSession = true;
      // "La de más valor": el paso del nivel (o el mundo) antes que una semilla vieja.
      this.badges.promoteMostValuable();
      this.displayOpen.set(true);
    };

    this.timer = setTimeout(tryShow, 1000);
  }

  private scheduleEndSummary(): void {
    this.cancelTimer();
    this.endSummary = true;
    this.timer = setTimeout(() => {
      if (this.badges.pendingCount() === 0) return;
      this.endShown = 1;
      this.displayOpen.set(true);
    }, 600);
  }

  private close(): void {
    this.displayOpen.set(false);
  }

  private cancelTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}
