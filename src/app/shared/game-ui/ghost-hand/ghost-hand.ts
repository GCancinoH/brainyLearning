import { Component, computed, input } from '@angular/core';

/**
 * Mano fantasma: una demostración de **una** figura yendo a su lugar.
 *
 * POR QUÉ ESTO Y NO UN TUTORIAL ESCRITO
 * A los 4 años "arrastra el círculo a la canasta" no es una instrucción que se pueda leer
 * o traducir: hay que verlo. Es el mismo gesto que Montessori propone — primero se presenta,
 * después se imita, después se hace sin ayuda — y es la única forma de que la mecánica se
 * aprenda sin tener que un adulto explicándoselo cada vez.
 *
 * Es puramente visual: **no toca el estado del juego**. La figura que viaja es una copia,
 * `placed()` no cambia y no cuenta como acierto ni como error. Al terminar, se dice "ahora
 * tú" y se devuelve el control.
 */
@Component({
  selector: 'ghost-hand',
  templateUrl: './ghost-hand.html',
  styleUrl: './ghost-hand.scss'
})
export class GhostHand {
  readonly from = input.required<{ x: number; y: number }>();
  readonly to = input.required<{ x: number; y: number }>();
  /** Figura que viaja con la mano (clase de forma + color CSS var). */
  readonly shape = input<string>('circle');
  readonly color = input<string>('#94a3b8');
  /** Cuántas veces repite el gesto. 1 por ronda evita que parezca que la está mirando. */
  readonly repeats = input(2);

  protected readonly styleVars = computed(() => {
    const f = this.from(), t = this.to();
    return [
      `--x0:${f.x}px`, `--y0:${f.y}px`,
      `--x1:${t.x}px`, `--y1:${t.y}px`,
      `--c:${this.color()}`,
      `--repeats:${this.repeats()}`
    ].join(';');
  });
}