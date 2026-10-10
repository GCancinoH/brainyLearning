import { Component, computed, inject } from '@angular/core';
import { ThemeTimeService } from '@core/services/theme-time.service';
import { formatClock, THEME_BUDGET_MS } from '@core/services/theme-time';

/**
 * Barra de tiempo de juego: una línea finita pegada al borde superior.
 *
 * Decisiones de diseño, y por qué:
 *
 *  - **Sin números.** A una niña de 4 años no le sirve saber que quedan "9:47"; le sirve
 *    saber que todavía hay tiempo. El texto exacto sigue en el `aria-label` para lectores
 *    de pantalla, que es donde sí aporta información.
 *
 *  - **Se LLENA, no se vacía.** Es deliberado: una barra que mengua grita "se acaba" y una
 *    que crece solo dice "llevas un rato jugando". La misma información sin la presión.
 *
 *  - **No late ni parpadea.** Antes el reloj se ponía rojo y palpitaba en los últimos 10
 *    segundos. Justo cuando una niña está concentrada, eso la distrae o la asusta. Ahora
 *    solo cambia de color, de forma suave y sin movimiento.
 *
 *  - `pointer-events: none` para que nunca robe un toque, y 5px de alto para no comerse
 *    zona de juego en la tableta.
 */
@Component({
  selector: 'game-clock',
  standalone: true,
  template: `
    <div
      class="track"
      [class.low]="low()"
      [class.critical]="critical()"
      role="timer"
      [attr.aria-label]="label()"
    >
      <div class="fill" [style.width.%]="percent()"></div>
    </div>
  `,
  styles: [`
    :host {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 5px;
      z-index: 60;
      /* Nunca debe robar un toque a la niña */
      pointer-events: none;
    }

    .track {
      width: 100%;
      height: 100%;
      background: rgba(255, 255, 255, 0.12);
      transition: background 0.6s ease;
    }

    .fill {
      height: 100%;
      width: 0;
      border-radius: 0 3px 3px 0;
      /* Azul suave: tranquilo, no llama la atención */
      background: linear-gradient(90deg, #38bdf8, #818cf8);
      transition: width 1s linear, background 0.6s ease;
    }

    /* Últimos 2 minutos: cálido, sin movimiento */
    .track.low .fill {
      background: linear-gradient(90deg, #fbbf24, #fb923c);
    }

    /* Últimos 30 segundos: más cálido todavía, pero sigue quieto */
    .track.critical .fill {
      background: linear-gradient(90deg, #fb923c, #f87171);
    }

    @media (prefers-reduced-motion: reduce) {
      .fill, .track { transition: none; }
    }
  `]
})
export class GameClockComponent {
  private readonly time = inject(ThemeTimeService);

  /** Texto exacto, solo para accesibilidad */
  readonly text = computed(() => formatClock(this.time.remainingMs()));
  readonly label = computed(() => `Tiempo de juego: ${this.text()} restantes`);

  /**
   * Fracción ya jugada, 0..1. Se llena con el tiempo Transcurrido, no se vacía.
   * Si la niña ya jugó antes hoy, la barra arranca parcialmente llena: es la verdad de
   * cuánto ha usado del tiempo de ese tema.
   */
  readonly percent = computed(() => {
    const used = THEME_BUDGET_MS - this.time.remainingMs();
    return Math.max(0, Math.min(100, (used / THEME_BUDGET_MS) * 100));
  });

  readonly low = computed(() => this.time.remainingMs() <= 120_000);
  readonly critical = computed(() => this.time.remainingMs() <= 30_000);
}