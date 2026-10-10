import { Component, computed, input, output } from '@angular/core';
import { COLOR_HEX, SHAPES } from '../../../features/games/math/logic-blocks/logic-blocks-problem';
import type { Attr, Color, Shape } from '../../../features/games/math/logic-blocks/logic-blocks-problem';

/**
 * La insignia de la regla: **la consigna sin una sola palabra**.
 *
 * Es el cambio más importante para una pre-lectora. Antes, la única forma de saber qué
 * hacer era leer un texto; ahora hay un objeto en pantalla que se puede señalar, comparar
 * con las figuras del tablero y devolver.
 *
 * CÓMO SE DISTINGUE CADA TIPO DE REGLA SIN LEER
 *
 *  - **color** → una muestra de pintura: el color, con borde blanco grueso y esquinas muy
 *    redondeadas. Deliberadamente **sin forma reconocible**: si fuera un círculo rojo,
 *    una niña lo leería como "los círculos" y compararía con la forma en vez de con el
 *    color, que es justo lo que se le quiere pedir.
 *  - **forma** → la silueta en gris neutro, para que no se confunda con una regla de color.
 *  - **tamaño** → dos siluetas, una grande y otra pequeña, con un 👆 sobre la correcta.
 *
 * Cuando es una regla de color, además se dibuja la silueta *dentro* del color: hay que
 * poder compararla con una figura real, que es color **y** forma a la vez.
 */
@Component({
  selector: 'rule-badge',
  templateUrl: './rule-badge.html',
  styleUrl: './rule-badge.scss'
})
export class RuleBadge {
  /** La regla que representa. */
  readonly attr = input.required<Attr>();
  readonly size = input<'md' | 'lg'>('lg');
  /** Anima la insignia: es la ayuda de nivel 1 de la escalera. */
  readonly pulse = input(false);
  /** Cuánto emphasise el juego la insignia (1 = normal, 2 = ayuda fuerte). */
  readonly emphasis = input(1);

  /** Al tocarla, se dice su etiqueta en voz alta. */
  readonly speak = output<Attr>();

  protected readonly COLOR_HEX = COLOR_HEX;
  protected readonly isColor = computed(() => this.attr().kind === 'color');
  protected readonly isShape = computed(() => this.attr().kind === 'shape');
  protected readonly isSize = computed(() => this.attr().kind === 'size');

  protected readonly color = computed<Color | null>(() =>
    this.isColor() ? (this.attr() as { kind: 'color'; value: Color }).value : null
  );
  protected readonly shape = computed<Shape | null>(() =>
    this.isShape() ? (this.attr() as { kind: 'shape'; value: Shape }).value : null
  );

  /** En una regla de color, qué silueta se dibuja dentro de la muestra. */
  protected readonly innerShape = computed<Shape>(() => {
    const a = this.attr();
    return a.kind === 'shape' ? a.value : 'circle';
  });

  /** Qué tamaño marca la regla, para saber cuál de las dos siluetas lleva el dedo. */
  protected readonly sizeValue = computed(() => {
    const a = this.attr();
    return a.kind === 'size' ? a.value : null;
  });

  protected readonly ariaLabel = computed(() => {
    const a = this.attr();
    if (a.kind === 'color') return `${a.value}`;
    if (a.kind === 'shape') return `${a.value}`;
    return `figura ${a.value}`;
  });

  protected readonly classes = computed(() => {
    const a = this.attr();
    const s = this.size();
    return [
      'badge',
      `badge-${s}`,
      a.kind,
      this.isColor() ? `swatch-${this.color()}` : '',
      this.shape() ? `shape-${this.shape()}` : '',
      this.pulse() ? 'pulse' : ''
    ].filter(Boolean).join(' ');
  });

  protected onTouch(event: Event): void {
    // El tablero tiene un (click) que coloca la figura seleccionada. Si este clic
    // subiera, tocar la insignia colocaría la figura en un sitio cualquiera.
    event.stopPropagation();
    this.speak.emit(this.attr());
  }

  /** Formas disponibles, para el caso de tamaño. */
  protected readonly SHAPES = SHAPES;
}