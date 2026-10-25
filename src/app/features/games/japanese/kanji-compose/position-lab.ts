import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChildren,
  type OnInit,
} from '@angular/core';
import { CdkDrag, type CdkDragEnd } from '@angular/cdk/drag-drop';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import {
  Colocada,
  Formable,
  KanjiComposition,
  laboratorioDe,
  pickLine,
  PieceSlot,
  reconocerTablero,
  TrayPiece,
} from '@core/learning/kanji-composition';
import {
  kanjiMeaning,
  kanjiWord,
  socraticLine,
  siblingMeaning,
  siblingWord,
  SOCRATIC_LINE_COUNT,
  sys,
} from '@core/learning/kanji-narration';
import { nearestSlot } from './slot-hit';

/**
 * "Laboratorio de posición" (§5.1) — el modo estrella.
 *
 * Donde antes había un panel estático que *contaba* que con las mismas piezas salen otros
 * kanji, ahora hay un marco donde moverlas y verlo. Lo que la niña descubre aquí —que la
 * posición cambia el significado— es lo más valioso del juego, y no se puede contar: hay
 * que tropezar con ello.
 *
 * TRES COSAS QUE LO HACEN LABORATORIO Y NO EXAMEN
 *
 *  1. **No hay meta.** No se le pide ningún kanji concreto; se le dan piezas y huecos donde
 *     ponerlas. Si no se forma nada, no ha fallado: ha encontrado que en ese sitio no se
 *     forma nada, que también es información.
 *  2. **El marco es de la familia entera, no del kanji.** Los huecos son la unión de las
 *     posiciones de 本, 末 y 08. Si solo tuviera los de 本, la 一 no tendría dónde ir
 *     arriba y el descubrimiento sería inalcanzable.
 *  3. **Reconoce de verdad, y reconoce varias cosas.** Un reconocedor por tabla de
 *     posiciones con tolerancia (`reconocerTablero`). Cuando dos kanji cuadran a la vez
 *     —木 con la 一 arriba es 末 **y** 08— los devuelve **los dos**: lo único que los
 *     separa es la longitud del trazo, que el tablero no puede decidir por ella.
 *
 * Lo que se descubre aquí no se anota: ni SRS, ni progreso, ni nivel. Se descubre, no se
 * estudia. Por eso 末 y 08 no están en el catálogo (ver `DESCUBRIMIENTOS`).
 */
@Component({
  selector: 'kl-position-lab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkDrag],
  templateUrl: './position-lab.html',
  styleUrl: './position-lab.scss',
})
export class PositionLab implements OnInit {
  /** El kanji del que se parte: da las piezas y a qué familia pertenece. */
  readonly target = input.required<KanjiComposition>();

  /** Salir. Quien cierra decide qué sigue: el dibujo, o la siguiente ronda. */
  readonly cerrar = output<void>();

  /**
   * Quien no lee (4 años). El botón de salida es un icono en ese caso: "Ver el dibujo"
   * son palabras que no lee, y un botón sin texto que no entiende la deja clavada aquí.
   */
  readonly preread = input(false);

  private readonly narrator = inject(Narrator);
  private readonly audio = inject(GameAudioService);

  /** Huecos del marco: la unión de posiciones de toda la familia. */
  readonly huecos = signal<readonly PieceSlot[]>([]);
  /** Lo que aún no ha colocado. */
  readonly bandeja = signal<readonly TrayPiece[]>([]);
  /** Pieza en cada hueco, o `null`. El índice es el del hueco, no el del kanji. */
  readonly puestas = signal<readonly (TrayPiece | null)[]>([]);
  /** Lo que tiene en la mano si toca en vez de arrastrar. */
  readonly enMano = signal<TrayPiece | null>(null);
  /** Lo que se está formando ahora mismo. */
  readonly formados = signal<readonly Formable[]>([]);
  /** La duda socrática de "aquí no se forma nada". */
  readonly linea = signal('');

  /** El marco, para medirlo al soltar una pieza arrastrada. */
  private readonly slotEls = viewChildren<ElementRef<HTMLElement>>('labSlot');
  /** Solo la familia: el reconocedor barre todo el catálogo por si acaso. */
  private familiaKanji = new Set<string>();
  /** Para no repetir el nombre de lo mismo si ella lo vuelve a formar. */
  private ultimaClave = '';
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private limpiaTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Lo que es de esta familia. Sin este filtro podrían nombrarse kanji que no tienen nada
   * que ver con las piezas que hay en el marco.
   */
  private readonly familia = computed(
    () => new Set([this.target().kanji, ...(this.target().siblings ?? []).map(s => s.kanji)]),
  );

  ngOnInit(): void {
    const lab = laboratorioDe(this.target());
    this.familiaKanji = this.familia();
    this.huecos.set(lab.huecos);
    this.bandeja.set([...lab.piezas]);
    this.puestas.set(lab.huecos.map(() => null));
    // La entrada **se oye**, no solo se lee: a los 4 años ese "¡Mira! con las mismas piezas
    // salen otros kanji" no le llega escrito, y sin él el paso empieza en silencio.
    void this.narrator.play([
      { clip: sys('siblings'), pauseAfterMs: 450 },
      { clip: sys('lab-howto'), pauseAfterMs: 450 },
    ]);
  }

  ngOnDestroy(): void {
    this.limpiarTimers();
    this.narrator.cancel();
  }

  /**
   * Toca la pieza: **se queda en la mano**, igual que en el paso de componer. Tocar otra
   * la sustituye; tocar la misma la devuelve a la bandeja. El hueco lo elige ella después.
   */
  onTap(pieza: TrayPiece): void {
    this.audio.retryPendingAudio();
    const enMano = this.enMano();
    this.enMano.set(enMano?.trayId === pieza.trayId ? null : pieza);
  }

  /**
   * Toca un hueco.
   *
   * Con una pieza en la mano va allí. Sin nada en la mano y el hueco lleno, se la recoge:
   * así se llega a quitarle un árbol a 森 y ver 林 —el árbol que crece: 1, 2, 3—.
   */
  onTapHueco(indice: number): void {
    this.audio.retryPendingAudio();
    const enMano = this.enMano();
    if (enMano) {
      this.colocarEn(indice, enMano);
      this.enMano.set(null);
      return;
    }
    const puestas = [...this.puestas()];
    const estaba = puestas[indice];
    if (!estaba) return;
    puestas[indice] = null;
    this.puestas.set(puestas);
    this.bandeja.update(b => [...b, estaba]);
    this.reconocer();
  }

  /** Soltar arrastrando: mismo imán que en componer, con sus 40 px de margen. */
  onDragEnded(event: CdkDragEnd, pieza: TrayPiece): void {
    this.audio.retryPendingAudio();
    const cajas = this.slotEls().map(s => s.nativeElement.getBoundingClientRect());
    const { x, y } = event.dropPoint;
    const indice = nearestSlot(cajas, x, y);
    if (indice < 0) {
      // Ningún hueco cerca: la pieza vuelve a donde estaba. No hay reproche ni es un
      // error: es que no la ha soltado todavía en ningún sitio.
      event.source.reset();
      return;
    }
    this.colocarEn(indice, pieza);
  }

  private colocarEn(indice: number, pieza: TrayPiece): void {
    const puestas = [...this.puestas()];

    // ¿Dónde estaba antes? Puede que ya estuviera en el marco —se recoge y se vuelve a
    // poner en otro hueco— y sin vaciar el hueco de antes quedaría **puesta dos veces**,
    // una por cada sitio, y el reconocedor contaría el mismo árbol dos veces.
    const antes = puestas.findIndex(p => p?.trayId === pieza.trayId);
    if (antes >= 0 && antes !== indice) puestas[antes] = null;

    const estaba = puestas[indice];
    // Un hueco es de una: si ya llevaba otra, esa vuelve a la bandeja en lugar de perderse.
    if (estaba && estaba.trayId !== pieza.trayId) this.bandeja.update(b => [...b, estaba]);
    puestas[indice] = pieza;
    this.puestas.set(puestas);
    this.bandeja.update(b => b.filter(x => x.trayId !== pieza.trayId));
    this.reconocer();
  }

  /** ¿Qué se está formando? Es el latido del laboratorio: se mira tras cada cambio. */
  private reconocer(): void {
    const huecos = this.huecos();
    const colocadas: Colocada[] = [];
    this.puestas().forEach((pieza, i) => {
      const hueco = huecos[i];
      if (pieza && hueco) colocadas.push({ kanji: pieza.kanji, x: hueco.x, y: hueco.y });
    });

    const formados = reconocerTablero(colocadas).filter(f => this.familiaKanji.has(f.kanji));
    this.formados.set(formados);

    // La clave es el conjunto, no el orden: quitar un árbol y volver a ponerlo es lo mismo
    // y no debe repetirse el nombre como si fuera un descubrimiento nuevo.
    const clave = [...formados.map(f => f.kanji)].sort().join('') || 'nada';
    if (clave === this.ultimaClave) return;
    this.ultimaClave = clave;
    void this.narrar(formados);
  }

  private async narrar(formados: readonly Formable[]): Promise<void> {
    this.narrator.cancel();
    if (!formados.length) {
      // Nada que nombrar **no** es un fallo: es el resultado. Y se oye la duda, porque si
      // la pregunta solo está escrita no llega a quien no lee.
      this.linea.set(pickLine('right-pieces-wrong-place'));
      const opciones = SOCRATIC_LINE_COUNT['right-pieces-wrong-place'] ?? 3;
      await this.narrator.say(socraticLine('right-pieces-wrong-place', Math.random() * opciones | 0));
      this.programarLimpieza();
      return;
    }

    this.linea.set('');
    // Nombres uno detrás de otro con su significado: si hay dos —末 y 08— se oyen los dos,
    // que es justo la diferencia entre "el tablero eligió por ti" y "estás mirando".
    await this.narrator.play(
      formados.flatMap(f => [
        { clip: this.clipNombre(f), pauseAfterMs: 250 },
        { clip: this.clipSignificado(f), pauseAfterMs: 700 },
      ]),
    );
  }

  /**
   * El nombre de un formado.
   *
   * El kanji del que se parte lleva sus clips de kanji (`kc.ja.k.*`); todo lo demás son
   * hermanos o descubrimientos, que tienen los suyos de hermano (`kc.*.sib.*`). El filtro
   * de `familiaKanji` garantiza que aquí solo lleguen esos dos casos.
   */
  private clipNombre(f: Formable): string {
    return f.kanji === this.target().kanji ? kanjiWord(this.target().id) : siblingWord(f.kanji);
  }

  private clipSignificado(f: Formable): string {
    return f.kanji === this.target().kanji ? kanjiMeaning(this.target().id) : siblingMeaning(f.kanji);
  }

  /** La duda se queda unos segundos y luego se aparta, para no ensuciar el marco. */
  private programarLimpieza(): void {
    if (this.limpiaTimer !== null) clearTimeout(this.limpiaTimer);
    const t = setTimeout(() => {
      this.timers.delete(t);
      this.limpiaTimer = null;
      this.linea.set('');
    }, 4000);
    this.limpiaTimer = t;
    this.timers.add(t);
  }

  private limpiarTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.limpiaTimer = null;
  }

  /** Salir del laboratorio. */
  salir(): void {
    this.narrator.cancel();
    this.cerrar.emit();
  }
}
