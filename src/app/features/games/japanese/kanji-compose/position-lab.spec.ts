import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { PositionLab } from './position-lab';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import { SpacedRepetition, KANJI_COMPOSITION_DECK } from '@core/learning/spaced-repetition';
import { installMemoryStorage } from '@core/testing/memory-storage';
import { getComposition } from '@core/learning/kanji-composition';

/**
 * El laboratorio (§5.1) es un paso sin meta: no se le pide ningún kanji, solo mover piezas
 * a ver qué sale. Por eso estos tests no comprueban que "acierta", sino que **reconoce lo
 * que hay** —incluido que no haya nada—, que los huecos son de la familia entera y que
 * nada de lo que pasa aquí se anota.
 */
describe('PositionLab (§5.1 laboratorio de posición)', () => {
  let fixture: ComponentFixture<PositionLab>;
  let component: PositionLab;
  /** Lo que se oye. Se guarda el espía para poder mirarlo desde cada test. */
  let play: MockInstance;
  let say: MockInstance;

  /**
   * Abre el laboratorio con un kanji.
   *
   * La narración no se ejecuta de verdad: aquí no es lo que se prueba, y con reloj falso
   * `Narrator._sleep` mide `Date.now()` real y `play` nunca resolvería.
   */
  function mount(kanji: 'hon' | 'mori'): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [PositionLab] });
    TestBed.inject(GameAudioService).setEnabled(false);
    play = vi.spyOn(TestBed.inject(Narrator), 'play').mockResolvedValue(true);
    say = vi.spyOn(TestBed.inject(Narrator), 'say').mockResolvedValue(true);

    fixture = TestBed.createComponent(PositionLab);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('target', getComposition(kanji)!);
    fixture.detectChanges();
  }

  /** Pone la pieza de la bandeja `p` en el hueco `h`, por el camino de toque. */
  function colocar(p: number, h: number): void {
    component.onTap(component.bandeja()[p]!);
    component.onTapHueco(h);
    fixture.detectChanges();
  }

  /** Claves de audio que se han mandado a lo largo del test. */
  function clipsEscuchados(): string[] {
    return play.mock.calls.flatMap(c => (c[0] as Array<{ clip: string }>).map(x => x.clip));
  }

  /** En 本 los huecos son: 0 = árbol, 1 = la 1 abajo, 2 = la 1 arriba. */
  const ARBOL = 0;
  const ICHI_ABAJO = 1;
  const ICHI_ARRIBA = 2;

  beforeEach(() => installMemoryStorage());
  afterEach(() => vi.restoreAllMocks());

  // ============================================
  // EL MARCO
  // ============================================

  it('los huecos son de la familia entera, no solo del kanji', () => {
    mount('hon');
    // 本 pone la 一 abajo y 末/未 la arriba. Sin el hueco de arriba la 一 no tendría dónde
    // ir y el descubrimiento entero sería inalcanzable.
    expect(component.huecos().filter(h => h.kanji === '木')).toHaveLength(1);
    expect(component.huecos().filter(h => h.kanji === '一'), 'la 1 arriba y abajo').toHaveLength(2);
    expect(component.bandeja(), 'las piezas de 本: un árbol y una línea').toHaveLength(2);
  });

  it('de 森 salen tres árboles y cinco huecos: los suyos y los de 林', () => {
    mount('mori');
    expect(component.bandeja(), 'sin deduplicar: es de lo que va el paso').toHaveLength(3);
    // Los tres de 森 y los dos de 林, que están a 0.22 de los primeros: por eso la
    // tolerancia no puede ser menor (lo comprueba también el test del núcleo).
    expect(component.huecos()).toHaveLength(5);
  });

  // ============================================
  // QUÉ SALE DE MOVERLAS
  // ============================================

  it('木 con la 一 abajo forma 本, y se muestra con su significado', () => {
    mount('hon');
    colocar(0, ARBOL);
    colocar(0, ICHI_ABAJO);

    expect(component.formados().map(f => f.kanji), 'la 1 al pie del árbol: la raíz').toEqual(['本']);
    expect(fixture.nativeElement.querySelectorAll('.lab-formado')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('.lab-formado-kanji')?.textContent).toContain('本');
    expect(fixture.nativeElement.querySelector('.lab-formado-significado')?.textContent).toContain(
      'libro',
    );
    expect(fixture.nativeElement.querySelector('.lab-duda'), 'ya no hay duda en pantalla').toBeNull();
    expect(clipsEscuchados(), 'y se nombra en voz alta, con su significado').toEqual(
      expect.arrayContaining(['kc.ja.k.hon.word', 'kc.es.k.hon.meaning']),
    );
  });

  it('la misma 木 con la 一 arriba forma DOS: 末 y 08, y se oyen y se ven los dos', () => {
    mount('hon');
    colocar(0, ARBOL);
    colocar(0, ICHI_ARRIBA);

    // No es que el tablero elija uno: son dos, y lo único que los separa es la longitud
    // del trazo, que no es una posición y el marco no puede decidirlo por ella.
    expect(component.formados().map(f => f.kanji).sort()).toEqual(['未', '末'].sort());
    expect(
      component.formados().every(f => f.descubrimiento),
      'ninguno es del catálogo: se descubre, no se estudia',
    ).toBe(true);

    // Y los dos se oyen: si solo nombrara uno, la mitad del descubrimiento se perdería.
    expect(clipsEscuchados()).toEqual(
      expect.arrayContaining(['kc.ja.sib.末', 'kc.ja.sib.未']),
    );
    // ...y los dos se ven.
    expect(fixture.nativeElement.querySelectorAll('.lab-formado')).toHaveLength(2);
    expect(fixture.nativeElement.querySelectorAll('.lab-formado--descubierto')).toHaveLength(2);
  });

  it('las piezas al revés no forman nada, y eso se plantea como duda y no como fallo', () => {
    mount('hon');
    colocar(0, ICHI_ABAJO); // la 1 en el hueco del árbol
    colocar(0, ARBOL); // y el árbol en el de abajo

    expect(component.formados(), 'no se forma nada').toEqual([]);
    expect(component.linea(), 'queda escrita la duda').not.toBe('');
    expect(
      fixture.nativeElement.querySelector('.lab-duda'),
      'y se pinta en pantalla, que es donde la puede ver',
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.lab-formado'), 'sin ningún veredicto').toBeNull();
    // ...y se oye, porque quien no lee no se entera de lo que solo está escrito.
    expect(say, 'la pregunta tiene que llegar por el oído').toHaveBeenCalled();
  });

  it('el árbol que crece: quitarle uno a 森 deja 林', () => {
    mount('mori');
    colocar(0, 0);
    colocar(0, 1);
    colocar(0, 2);
    expect(component.formados().map(f => f.kanji)).toEqual(['森']);

    // Tocar un hueco lleno sin nada en la mano se lo devuelve a la bandeja: así se llega
    // a quitarle un árbol al bosque y ver la arboleda.
    component.onTapHueco(0);
    fixture.detectChanges();

    expect(component.formados().map(f => f.kanji), 'dos árboles, que es 林').toEqual(['林']);
    expect(component.bandeja(), 'y el árbol sobrante está de vuelta').toHaveLength(1);
  });

  it('recoger una pieza y volverla a poner deja un árbol en un hueco, no en dos', () => {
    mount('hon');
    colocar(0, ARBOL);
    component.onTapHueco(ARBOL); // la recoge
    component.onTap(component.bandeja()[0]!);
    component.onTapHueco(ICHI_ARRIBA); // y la vuelve a poner en otro sitio

    const puestas = component.puestas().filter(p => p !== null);
    expect(puestas, 'una sola pieza en el marco').toHaveLength(1);
    expect(
      puestas.filter(p => p?.trayId === 'lab-0'),
      'el mismo árbol, no dos: con dos el reconocedor lo contaría dos veces',
    ).toHaveLength(1);
  });

  // ============================================
  // EL ARRASTRE (el imán de Q11)
  // ============================================

  it('soltar cerca de un hueco engancha, que es el imán de Q11', () => {
    mount('hon');
    const cajas = [
      { left: 0, top: 0, right: 80, bottom: 80 },
      { left: 100, top: 0, right: 180, bottom: 80 },
      { left: 200, top: 0, right: 280, bottom: 80 },
    ];
    const nodos = Array.from(fixture.nativeElement.querySelectorAll('.lab-hueco')) as HTMLElement[];
    nodos.forEach((n, i) => {
      const c = cajas[i]!;
      n.getBoundingClientRect = () =>
        ({ ...c, width: 80, height: 80, x: c.left, y: 0, toJSON: () => ({}) }) as DOMRect;
    });

    const pieza = component.bandeja()[0]!;
    const reset = vi.fn();
    // A 40 px del centro del segundo hueco, justo en el borde del margen de 40.
    component.onDragEnded({ dropPoint: { x: 140, y: 40 }, source: { reset } } as never, pieza);

    expect(reset, 'no vuelve: enganchó').not.toHaveBeenCalled();
    expect(component.puestas()[1], 'al segundo hueco').not.toBeNull();
    expect(component.bandeja(), 'y salió de la bandeja').toHaveLength(1);
  });

  it('soltar lejos de todo la devuelve a la bandeja, sin reproche', () => {
    mount('hon');
    const pieza = component.bandeja()[0]!;
    const reset = vi.fn();
    component.onDragEnded({ dropPoint: { x: 9999, y: 9999 }, source: { reset } } as never, pieza);

    expect(reset, 'vuelve a donde estaba').toHaveBeenCalledTimes(1);
    expect(component.puestas().every(x => x === null), 'y no se coloca nada').toBe(true);
    expect(component.linea(), 'tampoco hay una frase de error').toBe('');
  });

  // ============================================
  // NO SE ANOTA NADA
  // ============================================

  it('nada de lo que pasa aquí entra en el SRS: se descubre, no se estudia', () => {
    mount('hon');
    const anotar = vi.spyOn(TestBed.inject(SpacedRepetition), 'review');

    colocar(0, ARBOL);
    colocar(0, ICHI_ABAJO); // 本
    component.onTapHueco(ICHI_ABAJO); // lo deshace entero…
    component.onTapHueco(ARBOL);
    colocar(0, ARBOL);
    colocar(0, ICHI_ARRIBA); // …y lo vuelve a hacer, ahora como 末 y 08

    expect(anotar, 'sin aciertos, sin fallos, sin subir de caja').not.toHaveBeenCalled();
    expect(
      TestBed.inject(SpacedRepetition).due(KANJI_COMPOSITION_DECK),
      'ni se introducen kanji nuevos',
    ).toEqual([]);
  });

  // ============================================
  // SALIR
  // ============================================

  it('el botón de salida avisa al juego de que ya ha terminado', () => {
    mount('hon');
    const cerrar = vi.fn();
    component.cerrar.subscribe(cerrar);

    const boton = fixture.nativeElement.querySelector('.lab-salir') as HTMLButtonElement;
    expect(boton, 'un paso sin meta necesita una puerta').toBeTruthy();
    boton.click();
    expect(cerrar).toHaveBeenCalledTimes(1);
  });
});
