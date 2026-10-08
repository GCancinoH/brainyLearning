import { Component, computed, inject } from '@angular/core';
import { ThemeTimeService } from '@core/services/theme-time.service';
import { formatClock } from '@core/services/theme-time';

/** Reloj arriba a la derecha: cuenta de 10:00 a 0:00 mientras juega un tema */
@Component({
  selector: 'game-clock',
  standalone: true,
  template: `
    <div
      class="clock"
      [class.low]="low()"
      [class.critical]="critical()"
      role="timer"
      [attr.aria-label]="'Tiempo de juego restante ' + text()"
    >
      <span class="icon">⏱️</span>
      <span class="time">{{ text() }}</span>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 6px;
      right: 10px;
      z-index: 60;
      pointer-events: none;
    }

    .clock {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.8rem;
      border-radius: 999px;
      background: rgba(15, 23, 42, 0.8);
      border: 2px solid rgba(56, 189, 248, 0.7);
      color: #e0f2fe;
      font-weight: 800;
      font-size: 1.15rem;
      font-variant-numeric: tabular-nums;
      backdrop-filter: blur(6px);
      transition: border-color 0.3s ease, color 0.3s ease, background 0.3s ease;

      &.low {
        border-color: #f59e0b;
        color: #fde68a;
      }

      &.critical {
        border-color: #ef4444;
        color: #fecaca;
        background: rgba(127, 29, 29, 0.85);
        animation: beat 1s ease-in-out infinite;
      }
    }

    @keyframes beat {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }

    @media (prefers-reduced-motion: reduce) {
      .clock.critical { animation: none; }
    }
  `]
})
export class GameClockComponent {
  private readonly time = inject(ThemeTimeService);

  readonly text = computed(() => formatClock(this.time.remainingMs()));
  /** Último minuto: ámbar. Últimos 10 segundos: rojo que late. */
  readonly low = computed(() => this.time.remainingMs() <= 60_000);
  readonly critical = computed(() => this.time.remainingMs() <= 10_000);
}
