import { Component, input } from '@angular/core';

/**
 * Cohete del Planeta Dragón, pintable con una variable CSS.
 *
 * El SVG no trae `fill` en las formas: el color lo pone `--c`, que se fija desde fuera.
 * Así el mismo dibujo sirve para rojo, amarillo, azul… sin duplicar el SVG ni tocar el
 * HTML del juego. Es el mismo patrón que `block-shapes`: el consumidor declara `--c` y la
 * forma lo lee.
 *
 * El contorno se queda oscuro (como en el dibujo original) y el SVG lleva un halo claro:
 * en el fondo espacial, un cohete negro con contorno oscuro desaparecería.
 */
@Component({
  selector: 'paintable-rocket',
  templateUrl: './paintable-rocket.html',
  styleUrl: './paintable-rocket.scss',
})
export class PaintableRocket {
  /** Color de la pintura. `null` deja el naranja de reserva del CSS. */
  readonly color = input<string | null>(null);
}
