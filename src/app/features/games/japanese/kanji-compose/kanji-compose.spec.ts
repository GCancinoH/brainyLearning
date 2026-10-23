import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { KanjiCompose } from './kanji-compose';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { installMemoryStorage } from '@core/testing/memory-storage';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { KANJI_COMPOSITION_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import { pieceData, KANJI_COMPOSITIONS } from '@core/learning/kanji-composition';
import { kanjiStory, kanjiWord, pieceMeaning, pieceWord } from '@core/learning/kanji-narration';

/**
 * El confeti no se prueba aquí, y en jsdom su animación revienta: llama a `clearRect`
 * sobre un `getContext('2d')` que devuelve `null`. El error salta fuera del
 * `try/catch` de `triggerConfetti()` porque llega por un temporizador de la propia
 * librería, no en la llamada. Se desmonta entero.
 */
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

/**
 * TEST DE INTEGRACIÓN DEL COMPONENTE.
 *
 * Existe por la misma razón que `coin-shop.spec.ts`: los tests de datos
 * (`kanji-composition.spec`, `kanji-narration.spec`) pasan en verde **aunque el juego sea
 * imposible de terminar**, porque no montan el componente. El bug que atrapa este fichero
 * (doble toque en ✅ anotando dos aciertos) vivía solo en estado del componente.
 *
 * El sonido se apaga: no es lo que se prueba, y desactivado `playFileAndWait` sale por la
 * línea 216 antes de tocar `new Audio`, que en jsdom no reprodujo nada nunca.
 */

// ---------- Stubs: edad y nivel controlados ----------

class ProfileStub {
  age: 4 | 6 = 4;
  activeProfile = () => ({
    id: 'test-profile',
    name: 'Test',
    age: this.age,
    avatar: '🧪',
    preferredTheme: 'sakura' as const,
    createdAt: '',
    stickers: [],
    progress: {} as never,
  });
}

class ProgressStub {
  level = 1;
  getLevel = () => this.level;
  saveProgress = (_id: string, p: { level: number }) => {
    this.level = p.level;
  };
}


describe('KanjiCompose (integración)', () => {
  let fixture: ComponentFixture<KanjiCompose>;
  let component: KanjiCompose;

  /** Monta el componente con una edad concreta, sin sonido. */
  function mount(age: 4 | 6, level = 1): void {
    const profile = new ProfileStub();
    profile.age = age;
    const progress = new ProgressStub();
    progress.level = level;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [KanjiCompose],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
      ],
    });

    TestBed.inject(GameAudioService).setEnabled(false);

    fixture = TestBed.createComponent(KanjiCompose);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /**
   * Avanza los temporizadores que usa el juego (`setTimeout` encadenados).
   *
   * El orden de dentro importa: **primero** `advanceTimersByTime`, después
   * `whenStable`. Si se invierte —o si se llama a `whenStable()` a secas tras cerrar una
   * ronda— no se cuelga el juego, se cuelga la prueba: `finishProblem` deja un
   * `later(…, 2800)` pendiente en el reloj falso, la zona nunca queda estable porque ese
   * temporizador no se va a ejecutar solo, y el `whenStable` se queda esperando. Se
   * comprobó moviendo el reloj: con los temporizadores avanzados resuelve en milisegundos;
   * sin avanzarlos, 6 s y el test se va de tiempo.
   */
  async function advance(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Toca la pieza indicada en la bandeja: **se queda en la mano**, no se coloca sola. */
  function tapPiece(kanji: string): void {
    const pieces = Array.from(
      fixture.nativeElement.querySelectorAll('.tray-piece'),
    ) as HTMLElement[];
    const el = pieces.find(
      node => node.querySelector('.tray-kanji')?.textContent?.trim() === kanji,
    );
    expect(el, `la pieza ${kanji} debe estar en la bandeja`).toBeTruthy();
    el!.click();
    fixture.detectChanges();
  }

  /** Toca un hueco con la pieza que tiene en la mano. */
  function tapSlot(index: number): void {
    const slots = Array.from(
      fixture.nativeElement.querySelectorAll('.slot'),
    ) as HTMLElement[];
    slots[index]!.click();
    fixture.detectChanges();
  }

  /** Los dos toques que hace la niña: coger la pieza y elegir adónde va. */
  function tapInto(kanji: string, slotIndex: number): void {
    tapPiece(kanji);
    tapSlot(slotIndex);
  }

  /**
   * Recorre el paso de composición colocando cada pieza **en el hueco que le toca**: se
   * coge y se elige adónde va, que es lo que hace la niña.
   *
   * Antes bastaba con tocar las piezas en orden de hueco porque `onTap` rellenaba el
   * primero libre (Q11). Ahora el hueco lo decide ella, así que el helper tiene que
   * decirlo.
   *
   * Los kanji con hermanos abren el overlay y **no** pasan solos al dibujo: hay que
   * cerrarlo. Ese es el comportamiento que se quiere probar, así que el helper lo
   * recorre como lo recorrería la niña.
   */
  async function composeCorrectly(): Promise<void> {
    component.startComposing();
    fixture.detectChanges();
    component.problem()!.slots.forEach((slot, i) => tapInto(slot.kanji, i));
    await advance(2500); // hermanos a los 1500 ms, o dibujo directo a los 2200 ms
    if (component.showSiblings()) component.dismissSiblings();
    fixture.detectChanges();
    expect(component.step()).toBe('draw');
    expect(component.busy()).toBe(false);
  }

  /** Un trazo cualquiera: `finishDrawing()` se niega a avanzar sin dibujar nada. */
  function drawSomething(): void {
    component.strokes.set([
      [
        { x: 1, y: 1 },
        { x: 4, y: 6 },
      ],
    ]);
    fixture.detectChanges();
  }

  beforeEach(() => {
    installMemoryStorage();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('una ronda completa anota un solo acierto', async () => {
    mount(4);
    expect(component.consecutiveCorrect()).toBe(0);

    await composeCorrectly();
    drawSomething();
    component.finishDrawing();
    await advance(500);

    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('§5.4 una ronda terminada alimenta el SRS y anota la skill', async () => {
    mount(4);
    await composeCorrectly();
    const id = component.problem()!.target.id;

    const skills = TestBed.inject(SkillProgressService);
    const anotar = vi.spyOn(skills, 'recordAttempt');
    const srs = TestBed.inject(SpacedRepetition);

    drawSomething();
    component.finishDrawing();
    await advance(500);

    // Este juego era el único japonés que no anotaba nada: el panel no lo veía venir.
    expect(anotar, 'se anota una sola vez por ronda').toHaveBeenCalledTimes(1);
    expect(anotar.mock.calls[0]![0]).toMatchObject({
      skillId: 'japanese.kanji.composition',
      contentId: id,
      correct: true,
      representation: 'kanji',
    });

    // Y el SRS deja constancia: es lo que hace que `due()` sepa devolverlo mañana.
    expect(srs.isIntroduced(KANJI_COMPOSITION_DECK, id), 'queda registro').toBe(true);
    expect(srs.dueAt(KANJI_COMPOSITION_DECK, id), 'vence pronto').toBeTruthy();
  });

  it('§5.4.5 a partir del nivel 7 la historia deja de contarse sola', () => {
    mount(6, 5);
    expect(component.storyMode(), 'seguía contando').toBe('short');
    expect(component.historiaAPeticion()).toBe(false);

    mount(6, 7);
    expect(component.storyMode(), 'es repaso: no se la vuelven a decir').toBe('skip');
    // Y el 🔊 pasa a ser la única forma de oírla, no un adorno.
    expect(component.historiaAPeticion()).toBe(true);
  });

  it('la prelectora puede pedir la historia que ya no recibe sola', () => {
    mount(4, 1);
    expect(component.storyMode(), 'la primera vez, entera').toBe('full');
    mount(4, 3);
    expect(component.storyMode()).toBe('short');

    // Antes se quedaba sin historia **y** sin ningún botón con el que pedirla.
    mount(4, 7);
    expect(component.historiaAPeticion()).toBe(true);
  });

  // ============================================
  // Q11 · EL HUECO LO ELIGE ELLA
  // ============================================

  it('Q11 tocar la pieza no la coloca: se queda en la mano', () => {
    mount(4, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();
    const huecos = component.problem()!.slots;

    tapPiece(huecos[0]!.kanji);
    expect(component.filledCount(), 'tocar no es colocar').toBe(0);
    expect(component.seleccionada(), 'se queda en la mano').toBeTruthy();

    // Y ahora sí, donde ella quiera. Aquí, en el segundo hueco, no en el primero.
    tapSlot(1);
    expect(component.placed()[1]?.kanji).toBe(huecos[0]!.kanji);
    expect(component.placed()[0], 'y el primero sigue vacío').toBeNull();
    expect(component.seleccionada(), 'la mano queda vacía').toBeNull();
  });

  it('Q11 el orden de colocación lo decide ella, y puede empezar por el final', () => {
    mount(4, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();
    const huecos = component.problem()!.slots;

    // Antes el primer toque iba siempre al primer hueco libre: empezar por el final era
    // imposible y el resultado dependía del orden de toques, no de lo que ella sabía.
    huecos.forEach((_, i) => tapInto(huecos[huecos.length - 1 - i]!.kanji, i));

    expect(component.filledCount(), 'el marco debe quedar lleno').toBe(huecos.length);
    expect(
      huecos.every((s, i) => component.placed()[i]?.kanji === s.kanji),
      'y al revés, que es el error que ahora sí se puede cometer',
    ).toBe(false);
  });

  it('Q11 un toque a ciegas en un hueco vacío no puede decidir nada por ella', () => {
    mount(4, 1);
    component.startComposing();
    fixture.detectChanges();

    tapSlot(0);
    expect(component.filledCount()).toBe(0);
    expect(component.seleccionada()).toBeNull();
  });

  it('Q11 tocar dos veces la misma pieza la suelta', () => {
    mount(4, 1);
    const kanji = component.problem()!.slots[0]!.kanji;
    component.startComposing();
    fixture.detectChanges();

    tapPiece(kanji);
    expect(component.seleccionada(), 'cogida').toBeTruthy();
    tapPiece(kanji);
    expect(component.seleccionada(), 'suelta otra vez').toBeNull();
  });

  it('Q11 la pieza cogida y los huecos libres se ven: si no, es invisible', () => {
    mount(4, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();
    const huecos = component.problem()!.slots;

    tapPiece(huecos[0]!.kanji);
    const marcada = Array.from(
      fixture.nativeElement.querySelectorAll('.tray-piece--seleccionada'),
    );
    expect(marcada.length, 'la que está en la mano se levanta').toBe(1);

    const libres = () =>
      Array.from(fixture.nativeElement.querySelectorAll('.slot--libre')).length;
    expect(libres(), 'los huecos vacíos se ofrecen').toBe(huecos.length);

    tapInto(huecos[0]!.kanji, 0);
    // Con la mano vacía no se ofrece nada: no hay a dónde ir.
    expect(libres(), 'nada que ofrecer sin pieza en la mano').toBe(0);
  });

  // ============================================
  // Q4 · LA REFLEXIÓN YA NO ES DECORACIÓN
  // ============================================

  /**
   * Lleva una ronda hasta la reflexión de 6 años.
   *
   * La narración se mockea en cada prueba, no se espera: `Narrator._sleep` compara
   * `Date.now()` real contra temporizadores de falsos reloj, así que con el reloj
   * adelantado de golpe su bucle no termina. Lo que aquí se prueba es qué hace cada
   * botón, no cómo espera el narrador.
   */
  async function hastaReflexion(): Promise<void> {
    mount(6, 1);
    asegurarPiezasDistintas();
    await composeCorrectly();
    drawSomething();
    component.finishDrawing();
    await advance(2200); // la reflexión se abre a los 1600 ms
    expect(component.reflecting(), 'debe estar la reflexión').toBe(true);
  }

  it('Q4 "conté los huecos" suena el recuento, hueco por hueco', async () => {
    await hastaReflexion();
    const p = component.problem()!;
    const play = vi.spyOn(component.narrator, 'play').mockResolvedValue(true);

    await component.chooseReflection('huecos');

    const cues = play.mock.calls[0]![0] as Array<{ clip: string }>;
    expect(cues[0]!.clip, 'empieza por la palabra').toBe(kanjiWord(p.target.id));
    expect(cues.length, 'la palabra, y pieza + significado por hueco').toBe(
      1 + p.slots.length * 2,
    );
    // El recuento lleva significado siempre: a estas alturas ya ha jugado, y oír "ひ"
    // sin "sol" no le cuenta nada nuevo.
    expect(cues[1]!.clip, 'la primera pieza').toBe(
      pieceWord(pieceData(p.slots[0]!.kanji).id),
    );
    expect(cues[2]!.clip, 'y su significado').toBe(
      pieceMeaning(pieceData(p.slots[0]!.kanji).id),
    );
  });

  it('Q4 "probé otra posición" abre los hermanos, y cerrarlos va al siguiente kanji', async () => {
    await hastaReflexion();
    expect(component.step(), 'el dibujo ya pasó').toBe('draw');

    await component.chooseReflection('posicion');
    fixture.detectChanges();
    expect(component.showSiblings(), 'se abre el panel').toBe(true);
    expect(component.reflecting(), 'y el de reflexión se cierra: ocupan lo mismo').toBe(false);

    component.dismissSiblings();
    fixture.detectChanges();

    // Aquí está el arreglo: `dismissSiblings` mandaba siempre a `enterDraw()`, que ya
    // había pasado, y ella se habría quedado dibujando otra vez el kanji hecho.
    expect(component.showSiblings()).toBe(false);
    expect(component.step(), 'no vuelve al dibujo').not.toBe('draw');
    expect(component.problem(), 'y hay un problema nuevo').toBeTruthy();
  });

  it('Q4 "pensé en la historia" se oye y después sigue la siguiente ronda', async () => {
    await hastaReflexion();
    const p = component.problem()!;
    const play = vi.spyOn(component.narrator, 'play').mockResolvedValue(true);

    await component.chooseReflection('historia');

    const cues = play.mock.calls[0]![0] as Array<{ clip: string }>;
    expect(cues.map(c => c.clip), 'es la historia y nada más').toEqual([
      kanjiStory(p.target.id),
    ]);
    expect(component.showSiblings(), 'esta no abre hermanos').toBe(false);
    expect(component.reflecting(), 'y la reflexión ya no está').toBe(false);
  });

  it('Q4 las respuestas ya no son el mismo botón, y solo se ofrece la que se puede dar', () => {
    // Sin hermanos no hay "otra posición" que probar: la tercera respuesta se va.
    expect(component.reflections().map(r => r.que)).toEqual(['huecos', 'historia']);

    // Se sustituye el objetivo por uno con hermanos (本 → 末/未) para no depender de que
    // el azar del nivel acierte en él.
    component.problem.set({
      ...component.problem()!,
      target: KANJI_COMPOSITIONS.find(k => k.id === 'hon')!,
    });
    expect(component.reflections().map(r => r.que)).toEqual([
      'huecos',
      'historia',
      'posicion',
    ]);
  });

  it('REGRESIÓN B1: doble toque en ✅ solo suma UN acierto', async () => {
    mount(4);
    await composeCorrectly();
    drawSomething();

    // Dos toques seguidos —el escenario real de un dedo que se queda un momento
    // pegado. `busy` está en `false` durante todo el paso de dibujo, así que la única
    // guarda que impide anotar dos veces es `drawn`.
    component.finishDrawing();
    component.finishDrawing();
    await advance(500);

    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('REGRESIÓN B1: ni tres toques cuentan dos', async () => {
    mount(4);
    await composeCorrectly();
    drawSomething();

    component.finishDrawing();
    component.finishDrawing();
    component.finishDrawing();
    await advance(500);

    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('sin trazos no se registra nada, y sí se puede dibujar después', async () => {
    mount(4);
    await composeCorrectly();

    // ✅ con el lienzo vacío: no avanza ni anota
    component.finishDrawing();
    await advance(500);
    expect(component.consecutiveCorrect()).toBe(0);
    expect(component.step()).toBe('draw');

    drawSomething();
    component.finishDrawing();
    await advance(500);
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('B9: con el lienzo vacío la instrucción se OYE a los 4 años y se escribe a los 6', async () => {
    // A los 4 no se escribe nada: "Dibuja con el dedo…" es texto que no lee, y el
    // aviso existe para que se oiga (`draw-empty`). A los 6 sí lee y le queda el texto.
    mount(4);
    await composeCorrectly();
    component.finishDrawing();
    await advance(500);
    expect(component.hint()).toBe('');

    mount(6);
    await composeCorrectly();
    component.finishDrawing();
    await advance(500);
    expect(component.hint()).not.toBe('');
  });

  it('REGRESIÓN B2: el elogio no aparece hasta terminar la ronda, no al componer', async () => {
    mount(4);
    await composeCorrectly();

    // Componer bien es un descubrimiento, no un acierto puntado: durante el paso de
    // dibujo el estado debe seguir en 'idle'. Antes se ponía 'success' al componer, con
    // lo que el banner ignoraba el texto del paso y mostraba un "¡Muy bien!" aleatorio
    // durante todo el dibujo.
    expect(component.step()).toBe('draw');
    expect(component.feedbackState()).toBe('idle');

    drawSomething();
    component.finishDrawing();
    await advance(500);
    expect(component.feedbackState()).toBe('success');
  });

  it('REGRESIÓN B2: el banner nunca está vacío y siempre habla del paso en el que está', async () => {
    mount(6);
    expect(component.stepPrompt()).not.toBe('');
    expect(component.stepPrompt()).toContain('se forma');

    await composeCorrectly();
    // En dibujo no debe seguir la instrucción de componer, que era el texto que se
    // quedaba pegado.
    expect(component.stepPrompt()).toContain('dibújalo');
  });

  it('REGRESIÓN B2: la frase de los hermanos no se queda en el banner de dibujo', async () => {
    // Nivel 9, con `Math.random` clavado a 0.25: por debajo de 0.6 se queda con lo
    // nuevo del nivel (森, 語) y el índice cae en 森, el único con hermanos (林). Es el
    // único caso donde el paso anterior deja texto tras de sí.
    vi.spyOn(Math, 'random').mockReturnValue(0.25);
    mount(6, 9);
    expect(component.target()!.siblings?.length).toBeGreaterThan(0);

    await composeCorrectly();

    expect(component.step()).toBe('draw');
    // Debe hablar del dibujo, no de las piezas del overlay.
    expect(component.stepPrompt()).toContain('dibújalo');
  });

  it('REGRESIÓN B6: tocar una pieza la dice UNA sola vez', async () => {
    mount(4);
    component.startComposing();
    fixture.detectChanges();

    // Solo se coloca una pieza para que `evaluate()` no entre y añada más sonidos.
    const slot0 = component.problem()!.slots[0]!;
    const pieza = component.tray().find(t => t.kanji === slot0.kanji)!;
    const decir = vi.spyOn(component.narrator, 'say');

    component.onTap(pieza);
    fixture.detectChanges();

    // Antes sonaba dos: una al tocar y otra al meterla, a ~100 ms, con el clip reiniciado
    // a media palabra.
    expect(decir).toHaveBeenCalledTimes(1);
  });

  it('la guarda se reinicia en el siguiente problema, sin atascar el juego', async () => {
    mount(4);

    // Ronda 1, con toque doble a propósito
    await composeCorrectly();
    drawSomething();
    component.finishDrawing();
    component.finishDrawing();
    await advance(500);
    expect(component.consecutiveCorrect()).toBe(1);

    // Ronda 2: si `drawn` no se reiniciara en `generateProblem()`, esta ronda jamás
    // podría registrarse y el juego se quedaría mudo de progreso.
    await advance(3000); // `generateProblem()` a los 2800 ms
    expect(component.step()).toBe('story');

    await composeCorrectly();
    drawSomething();
    component.finishDrawing();
    await advance(500);

    expect(component.consecutiveCorrect()).toBe(2);
  });

  // ============================================================
  // §5.5 · ESCALERA DE AYUDA, DEMOSTRACIÓN Y TUTORIAL
  //
  // Nada de infraestructura nueva: son las mismas piezas que en `logic-blocks`. Lo que
  // se fija aquí es la **traducción** al paso de componer, que es lo que podría salir
  // mal —que la demostración mueva piezas de verdad, que a los 6 años aparezca una mano
  // fantasma que le quita el turno, o que el tutorial vuelva a interponerse cada ronda.
  // ============================================================

  /**
   * Un objetivo cuyas piezas son distintas. Si son iguales (林 = 木 + 木), darles la
   * vuelta no es un error: es la misma composición exacta.
   */
  function asegurarPiezasDistintas(): void {
    let p = component.problem()!;
    let vueltas = 0;
    while (new Set(p.slots.map(s => s.kanji)).size < p.slots.length && vueltas++ < 40) {
      component.generateProblem();
      fixture.detectChanges();
      p = component.problem()!;
    }
    expect(
      new Set(p.slots.map(s => s.kanji)).size,
      'hace falta un objetivo con piezas distintas para poder equivocarse',
    ).toBe(p.slots.length);
  }

  /**
   * Falla a propósito: entrega las piezas en el orden **inverso** al de los huecos.
   *
   * Es la forma más limpia de equivocarse sin distractores: el mismo montón de piezas
   * correctas, colocadas al revés, llena el marco y no es exacto, así que `evaluate()`
   * registra el error —sin tocar la racha— y devuelve la pregunta socrática.
   *
   * **No** llama a `startComposing()`: eso reiniciaría la escalera y no se acumularía
   * ningún error.
   */
  function componerAlReves(): void {
    const huecos = component.problem()!.slots;
    // La del último hueco va al primero, y así sucesivamente: mismas piezas, otro orden.
    huecos.forEach((_, i) => tapInto(huecos[huecos.length - 1 - i]!.kanji, i));
    fixture.detectChanges();
    expect(component.filledCount(), 'el marco debe quedar lleno').toBe(huecos.length);

    for (let i = huecos.length - 1; i >= 0; i--) component.pickBack(i);
    fixture.detectChanges();
    expect(component.filledCount(), 'y volver a vaciarse para poder fallar otra vez').toBe(0);
  }

  it('§5.5 el error sube la ayuda: al segundo resalta pieza Y hueco', () => {
    mount(6, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();
    expect(component.ladderLevel()).toBe(0);
    expect(component.hintedPieceId()).toBe('');

    componerAlReves();
    // Peldaño 1: suena otra vez el kanji, pero todavía no se señala nada.
    expect(component.ladderLevel()).toBe(1);
    expect(component.hintedPieceId(), 'el peldaño 1 no resalta todavía').toBe('');

    componerAlReves();
    // Peldaño 2: la pieza **y** el hueco. Señalar solo la pieza dejaba sin decir dónde,
    // que es la mitad que no sabe.
    expect(component.ladderLevel()).toBe(2);
    const need = component.nextNeed()!;
    expect(component.hintedSlot()).toBe(need.slotIndex);
    expect(component.hintedPieceId()).toBe(need.piece.trayId);
    expect(fixture.nativeElement.querySelector('.tray-piece--hint'), 'pintado en la bandeja').toBeTruthy();
  });

  it('§5.5 a los 6 años la escalera se detiene antes de la demostración', () => {
    mount(6, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();

    for (let i = 0; i < 5; i++) componerAlReves();

    // `LADDER_BY_AGE[6].maxLevel` es 2, y no por un capricho: a esa edad resolverlo por
    // ella le quita el aprendizaje. Da igual cuántos errores lleve.
    expect(component.ladderLevel()).toBe(2);
    expect(component.demo(), 'la mano fantasma no debe aparecer jamás').toBeNull();
    expect(component.hintedPieceId(), 'pero la ayuda sí llega').not.toBe('');
  });

  it('§5.5 a los 4 años la demostración llega y no toca el estado', () => {
    mount(4, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();

    const bandejaAntes = component.tray().length;
    for (let i = 0; i < 3; i++) componerAlReves();

    expect(component.ladderLevel()).toBe(3);
    expect(component.demo(), 'la mano fantasma debe aparecer').not.toBeNull();

    // Puramente visual: lo que viaja es un clon. Ni la bandeja ni el marco se tocan, y
    // por eso no cuenta como acierto ni como error.
    expect(component.tray().length).toBe(bandejaAntes);
    expect(component.filledCount()).toBe(0);
  });

  it('§5.5 un acierto deja la escalera a cero', () => {
    mount(4, 1);
    asegurarPiezasDistintas();
    component.startComposing();
    fixture.detectChanges();
    for (let i = 0; i < 3; i++) componerAlReves();
    expect(component.ladderLevel()).toBe(3);

    component.problem()!.slots.forEach((s, i) => tapInto(s.kanji, i));
    fixture.detectChanges();

    expect(component.ladderLevel()).toBe(0);
    expect(component.hintedPieceId()).toBe('');
  });

  it('§5.5 tutorial: la primera vez se enseña, la segunda ya no', async () => {
    mount(4);

    component.startComposing();
    fixture.detectChanges();
    // "Esto es": nada se explica todavía, se presenta.
    expect(component.tutorial()).toBe('look');

    await advance(1600);
    // "Mira cómo": la mano fantasma arrastra la pieza que encaja.
    expect(component.tutorial()).toBe('demo');
    expect(component.demo(), 'la demostración acompaña al texto').not.toBeNull();

    await advance(5000); // 6600 ms desde el inicio
    expect(component.tutorial()).toBe('your-turn');

    await advance(1600); // 8200 ms
    expect(component.tutorial()).toBe('off');

    // Segunda vez: ya lo vio, y no se le vuelve a interponer un velo.
    component.generateProblem();
    fixture.detectChanges();
    component.startComposing();
    fixture.detectChanges();
    expect(component.tutorial()).toBe('off');
  });

  it('§5.5 primera vez en el lienzo: se enseña una vez y se corta sola', async () => {
    mount(4);

    await composeCorrectly();
    expect(component.step()).toBe('draw');
    // "Mira cómo": dos trazos que se dibujan solos, uno tras otro.
    expect(component.drawHint(), 'la primera vez se enseña').toBe('demo');

    await advance(3000);
    expect(component.drawHint()).toBe('your-turn');

    await advance(1400);
    expect(component.drawHint()).toBe('off');

    // Segunda ronda: ya lo vio, y no se vuelve a interponer nada sobre el lienzo.
    drawSomething();
    component.finishDrawing();
    await advance(3500); // `generateProblem()` a los 2800 ms

    await composeCorrectly();
    expect(component.step()).toBe('draw');
    expect(component.drawHint(), 'la segunda vez no vuelve').toBe('off');
  });

  it('§5.5 tocar el lienzo corta la demostración y no vuelve a verse', async () => {
    mount(4);

    await composeCorrectly();
    expect(component.drawHint()).toBe('demo');

    // Un toque es suficiente: ya quiere dibujar.
    component.skipDrawOnboarding();
    expect(component.drawHint()).toBe('off');

    drawSomething();
    component.finishDrawing();
    await advance(3500);
    await composeCorrectly();
    expect(component.step()).toBe('draw');
    expect(component.drawHint()).toBe('off');
  });

  // ================================================================
  // §5.3 · TRAZO GUIADO
  //
  // jsdom no mide geometría (`getTotalLength` no existe), así que se sustituye el
  // prototipo del `<path>` por una línea horizontal. Eso hace que **todos** los trazos
  // esperados vayan de izquierda a derecha, que es todo lo que necesitan saber estas
  // pruebas: la validación compara dirección, no forma.
  // ================================================================

  let pathProto: any = null;
  let totalOriginal: unknown;
  let puntoOriginal: unknown;

  function conGeometriaDeTrazo(): void {
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pathProto = Object.getPrototypeOf(p) as any;
    totalOriginal = pathProto.getTotalLength;
    puntoOriginal = pathProto.getPointAtLength;
    pathProto.getTotalLength = (): number => 60;
    pathProto.getPointAtLength = (l: number): { x: number; y: number } => ({ x: l, y: 0 });
  }

  function sinGeometriaDeTrazo(): void {
    if (!pathProto) return;
    if (totalOriginal === undefined) delete pathProto.getTotalLength;
    else pathProto.getTotalLength = totalOriginal;
    if (puntoOriginal === undefined) delete pathProto.getPointAtLength;
    else pathProto.getPointAtLength = puntoOriginal;
    pathProto = null;
  }

  /**
   * Pone el lienzo en condiciones para `onPointer*`: jsdom mide 0×0, y con `width` 0 la
   * coordenada normalizada saldría `Infinity`. La captura de puntero se anula porque un
   * puntero sintético no está activo y `setPointerCapture` lanzaría `NotFoundError`.
   */
  function prepararLienzo(): HTMLCanvasElement {
    const canvas = fixture.nativeElement.querySelector('.draw-canvas') as HTMLCanvasElement;
    expect(canvas, 'el lienzo debe estar pintado en el paso de dibujar').toBeTruthy();
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
        right: 100,
        bottom: 100,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    canvas.setPointerCapture = () => {
      /* sin puntero real que capturar */
    };
    return canvas;
  }

  /**
   * Dispara un evento de puntero con los campos que `PointerEvent` lleva y `MouseEvent`
   * no: `isPrimary`, `pointerId` y el área de contacto. jsdom no implementa
   * `PointerEvent`, así que se monta sobre `MouseEvent` con `defineProperty`.
   */
  function puntero(
    canvas: HTMLCanvasElement,
    type: string,
    pt: { x: number; y: number },
    extra: { pointerId?: number; isPrimary?: boolean; width?: number; height?: number } = {},
  ): void {
    const ev = new MouseEvent(type, { clientX: pt.x * 100, clientY: pt.y * 100, bubbles: true });
    Object.defineProperty(ev, 'pointerId', { value: extra.pointerId ?? 1 });
    Object.defineProperty(ev, 'isPrimary', { value: extra.isPrimary ?? true });
    Object.defineProperty(ev, 'width', { value: extra.width ?? 30 });
    Object.defineProperty(ev, 'height', { value: extra.height ?? 30 });
    canvas.dispatchEvent(ev);
  }

  /** Traza un segmento como lo haría el dedo: abajo, mover, arriba. */
  function trazar(
    canvas: HTMLCanvasElement,
    de: { x: number; y: number },
    a: { x: number; y: number },
  ): void {
    puntero(canvas, 'pointerdown', de);
    puntero(canvas, 'pointermove', a);
    puntero(canvas, 'pointerup', a);
    fixture.detectChanges();
  }

  /** El trazo esperado, que con la geometría stubeada va de (0,0) a (60/109, 0). */
  const IZQUIERDA = { x: 0.05, y: 0.5 };
  const DERECHA = { x: 0.5, y: 0.5 };

  afterEach(() => sinGeometriaDeTrazo());

  it('§5.3 el trazo al revés no avanza: se queda en el mismo y se pregunta otra vez', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();
    expect(component.trazoTotal(), 'el kanji debe tener trazos').toBeGreaterThan(0);

    trazar(canvas, DERECHA, IZQUIERDA); // al revés

    expect(component.trazoActual()).toBe(0);
    expect(component.strokes(), 'el trazo no se queda en el lienzo').toHaveLength(0);
    // La duda se formula, no se dictamina. Ni siquiera en el texto de la pista.
    expect(component.hint()).not.toBe('');
    expect(component.hint().toLowerCase()).not.toContain('incorrecto');
    expect(component.hint().toLowerCase()).not.toContain('está mal');
  });

  it('§5.3 el trazo en la buena dirección avanza al siguiente', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();

    // Una duda queda viva tras el trazo al revés…
    trazar(canvas, DERECHA, IZQUIERDA);
    expect(component.hint()).not.toBe('');

    trazar(canvas, IZQUIERDA, DERECHA);

    expect(component.trazoActual()).toBe(1);
    expect(component.strokes(), 'el trazo aceptado se queda dibujado').toHaveLength(1);
    expect(component.hint(), 'una duda vieja no se queda colgada').toBe('');
  });

  it('§5.3 deshacer y borrar devuelven la guía al trazo anterior', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();

    trazar(canvas, IZQUIERDA, DERECHA);
    expect(component.trazoActual()).toBe(1);

    component.undoStroke();
    fixture.detectChanges();
    expect(component.trazoActual(), 'desdibuja el trazo, no solo la tinta').toBe(0);
    expect(component.strokes()).toHaveLength(0);

    trazar(canvas, IZQUIERDA, DERECHA);
    component.clearCanvas();
    fixture.detectChanges();
    expect(component.trazoActual()).toBe(0);
    expect(component.strokes()).toHaveLength(0);
  });

  it('§5.3 trazar todos los trazos termina la ronda sin pulsar ✅', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();

    const total = component.trazoTotal();
    for (let i = 0; i < total; i++) {
      expect(component.trazoActual(), `trazo ${i + 1} de ${total}`).toBe(i);
      trazar(canvas, IZQUIERDA, DERECHA);
    }

    expect(component.kanjiTrazado()).toBe(true);
    // El acierto se apunta al cerrar el último trazo, de forma síncrona. No se espera a
    // ningún temporizador: además, `fixture.whenStable()` se queda esperando una tarea
    // que la app deja abierta al cerrar la ronda, y el test se iría de tiempo.
    expect(component.consecutiveCorrect(), 'se anota UN acierto, como en el botón').toBe(1);

    // La ronda ya está cerrada: pulsar ✅ a posteriori no puede apuntar otro acierto
    // (la guarda B1, que es `drawn`, no se toca desde aquí).
    component.finishDrawing();
    fixture.detectChanges();
    expect(component.consecutiveCorrect()).toBe(1);
  });

  // ================================================================
  // B12 · EL LIENZO SOLO OBEDECE A UN DEDO
  //
  // La niña de 4 juega con la mano apoyada: llegan dos puntos de contacto a la vez, y
  // a veces la palma es la primera. Ambos casos metían tinta donde no debía.
  // ================================================================

  // jsdom no trae `ResizeObserver`; se guarda el aviso para poder dispararlo a mano.
  let avisoResize: (() => void) | null = null;
  const roOriginal = (globalThis as { ResizeObserver?: unknown }).ResizeObserver;

  afterEach(() => {
    if (roOriginal === undefined) delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    else (globalThis as { ResizeObserver?: unknown }).ResizeObserver = roOriginal;
    avisoResize = null;
  });

  it('B12 un segundo punto de contacto no empieza trazo ni se cuela en el suyo', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();

    // Que toque un dedo ajeno no debería dejar nada…
    puntero(canvas, 'pointerdown', { x: 0.2, y: 0.2 }, { isPrimary: false, pointerId: 7 });
    expect(component.strokes()).toHaveLength(0);

    // …ni interrumpir el trazo que ella está haciendo con su dedo.
    puntero(canvas, 'pointerdown', { x: 0.1, y: 0.5 }, { pointerId: 1 });
    expect(component.strokes()).toHaveLength(1);

    puntero(canvas, 'pointermove', { x: 0.3, y: 0.5 }, { isPrimary: false, pointerId: 7 });
    puntero(canvas, 'pointermove', { x: 0.6, y: 0.5 }, { isPrimary: false, pointerId: 7 });
    expect(component.strokes()[0], 'el trazo ajeno no añade puntos').toHaveLength(1);

    // Levantar el dedo ajeno no puede cerrar el trazo de ella.
    puntero(canvas, 'pointerup', { x: 0.6, y: 0.5 }, { isPrimary: false, pointerId: 7 });
    fixture.detectChanges();
    expect(component.trazoActual(), 'el trazo sigue en curso').toBe(0);
    expect(component.strokes()).toHaveLength(1);
  });

  it('B12 una palma apoyada no deja tinta, y la suya sí entra', async () => {
    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();

    // Único punto de contacto —por eso `isPrimary` no lo detecta— pero enorme.
    puntero(canvas, 'pointerdown', { x: 0.3, y: 0.3 }, { width: 180, height: 140 });
    fixture.detectChanges();
    expect(component.strokes(), 'la palma no dibuja').toHaveLength(0);

    // Y el umbral no le impide a ella: un dedo normal cabe de sobra.
    puntero(canvas, 'pointerdown', { x: 0.2, y: 0.5 }, { width: 44, height: 38 });
    fixture.detectChanges();
    expect(component.strokes(), 'el dedo de ella sí dibuja').toHaveLength(1);
  });

  it('B12 al girar la tableta se repinta el lienzo', async () => {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      private readonly cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
        avisoResize = cb;
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    };

    mount(4);
    conGeometriaDeTrazo();
    await composeCorrectly();
    const canvas = prepararLienzo();
    expect(avisoResize, 'el lienzo debe quedar observado').toBeTruthy();
    const antes = canvas.width;

    // El rectángulo crece y `strokes` no cambia: sin el observador no había ninguna
    // señal que disparara `paint()`.
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 320,
        height: 320,
        right: 320,
        bottom: 320,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    avisoResize!();
    expect(canvas.width, 'la tinta se repinta a la escala nueva').toBeGreaterThan(antes);
  });

  // ============================================
  // §5.6 · RECONOCER — el paso 0
  //
  // 日 está en 明 y en 星;山 y 石 solo en 岩. Ese es el material de estas pruebas: lo que
  // comparte pieza y lo que no.
  // ============================================

  /**
   * Abre la sesión con kanji ya conocidos y deja el calentamiento montado.
   *
   * El narrador se mockea: `Narrator._sleep` compara `Date.now()` **real** contra
   * temporizadores de falsos reloj, así que sin el mock la promesa del saludo no termina
   * nunca y `empezarRecall()` no se llega a llamar.
   */
  async function empezarConCalentamiento(
    edad: 4 | 6,
    nivel: number,
    conocidos: string[],
  ): Promise<void> {
    mount(edad, nivel);
    TestBed.inject(SpacedRepetition).markIntroduced(KANJI_COMPOSITION_DECK, conocidos);
    vi.spyOn(component.narrator, 'say').mockResolvedValue(true);
    vi.spyOn(component.narrator, 'play').mockResolvedValue(true);
    component.startGame();
    fixture.detectChanges();
    await advance(700); // el calentamiento se monta a los 400 ms
    expect(component.step(), 'debe estar reconociendo').toBe('reconocer');
  }

  describe('§5.6 reconocer', () => {
    it('sin kanji conocidos no hay calentamiento: no se reconoce lo que no se ha visto', async () => {
      mount(4, 1);
      vi.spyOn(component.narrator, 'say').mockResolvedValue(true);
      vi.spyOn(component.narrator, 'play').mockResolvedValue(true);
      component.startGame();
      fixture.detectChanges();
      await advance(700);

      expect(component.recall()).toBeNull();
      expect(component.step(), 'la sesión sigue siendo la de siempre').toBe('story');
    });

    it('ofrece tres opciones, y ninguna es el kanji que va a componer ahora', async () => {
      await empezarConCalentamiento(4, 3, ['mei', 'kyuu', 'rin', 'iwa']);
      const r = component.recall()!;

      expect(r.opciones).toHaveLength(3);
      expect(r.opciones.map(o => o.id), 'el objetivo está entre ellas').toContain(r.objetivo.id);
      // Reconocer el que acaba de ver hace un rato no prueba nada, y le quitaría a la
      // primera ronda lo que la hace nueva.
      expect(r.objetivo.id, 'no es el del problema actual').not.toBe(
        component.problem()!.target.id,
      );
    });

    it('un error no zumba y le deja seguir: solo la primera tirada cuenta', async () => {
      await empezarConCalentamiento(4, 3, ['mei', 'kyuu', 'rin', 'iwa']);
      const anotar = vi.spyOn(TestBed.inject(SpacedRepetition), 'review');
      const r = component.recall()!;
      const mala = r.opciones.find(o => o.id !== r.objetivo.id)!;

      component.responderRecall(mala.id);
      expect(anotar, 'un error no se anota: sigue intentándolo').not.toHaveBeenCalled();
      expect(component.recallFallados().has(mala.id), 'se atenúa y se queda quieta').toBe(true);
      expect(component.recallAcertado(), 'sigue sin acertar').toBeNull();

      component.responderRecall(r.objetivo.id);
      expect(anotar, 'la primera tirada que acierta es la que cuenta').toHaveBeenCalledTimes(1);
      expect(anotar.mock.calls[0]![1], 'sobre el kanji acertado').toBe(r.objetivo.id);
      expect(anotar.mock.calls[0]![2]).toMatchObject({ correct: true });

      // Un toque más tras el acierto no vuelve a anotar.
      component.responderRecall(r.objetivo.id);
      expect(anotar, 'el acierto no se repite').toHaveBeenCalledTimes(1);
    });

    it('el recuerdo frío pospone el kanji, que es la señal que componer no puede dar', async () => {
      await empezarConCalentamiento(4, 3, ['mei', 'kyuu', 'rin', 'iwa']);
      const srs = TestBed.inject(SpacedRepetition);
      const r = component.recall()!;
      const antes = srs.dueAt(KANJI_COMPOSITION_DECK, r.objetivo.id);

      component.responderRecall(r.objetivo.id);

      expect(srs.isIntroduced(KANJI_COMPOSITION_DECK, r.objetivo.id)).toBe(true);
      expect(srs.dueAt(KANJI_COMPOSITION_DECK, r.objetivo.id), 'se pospuso').not.toBe(antes);
    });

    it('tras dos aciertos se va a jugar: el calentamiento no se alarga', async () => {
      await empezarConCalentamiento(4, 3, ['mei', 'kyuu', 'rin', 'iwa']);

      for (let i = 0; i < 2; i++) {
        component.responderRecall(component.recall()!.objetivo.id);
        await advance(2000); // el pase al siguiente acierto está a los 1800 ms
      }

      expect(component.recall(), 'no queda tanda').toBeNull();
      expect(component.step(), 'y empieza la historia del problema').toBe('story');
      expect(component.problem(), 'con problema y todo').toBeTruthy();
    });

    it('las tarjetas se ven: sin clases, el modo sería invisible', async () => {
      mount(4, 3);
      TestBed.inject(SpacedRepetition).markIntroduced(KANJI_COMPOSITION_DECK, [
        'mei',
        'kyuu',
        'rin',
        'iwa',
      ]);
      vi.spyOn(component.narrator, 'say').mockResolvedValue(true);
      vi.spyOn(component.narrator, 'play').mockResolvedValue(true);
      component.startGame();
      await advance(700);

      const r = component.recall()!;
      const tarjetas = Array.from(fixture.nativeElement.querySelectorAll('.recall-option'));
      expect(tarjetas, 'una por opción').toHaveLength(r.opciones.length);
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.recall-option--ok')),
        'todavía no se enciende nada',
      ).toHaveLength(0);

      component.responderRecall(r.objetivo.id);
      fixture.detectChanges();
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.recall-option--ok')).length,
        'la acertada se enciende sola',
      ).toBe(1);
    });
  });

  // ============================================
  // §5.9 · RITUAL FLASH
  // ============================================

  describe('§5.9 ritual Flash', () => {
    it('con kanji conocidos pero menos de tres, corre el Flash, que no examina', async () => {
      // Dos kanji no dan para reconocer —excluir el del problema deja uno—, pero sí para
      // enseñarlos: es el único calentamiento que funciona desde la primera sesión.
      mount(4, 1);
      TestBed.inject(SpacedRepetition).markIntroduced(KANJI_COMPOSITION_DECK, ['mei', 'kyuu']);
      vi.spyOn(component.narrator, 'say').mockResolvedValue(true);
      const play = vi.spyOn(component.narrator, 'play').mockResolvedValue(true);
      component.startGame();
      await advance(700);

      expect(component.recall(), 'no hay material para examinar').toBeNull();
      expect(component.step(), 'pero sí para enseñar').toBe('flash');
      expect(component.flashKanji(), 'y enseña uno cada vez').toBeTruthy();
      expect(
        Array.from(fixture.nativeElement.querySelectorAll('.flash-kanji')),
        'una sola tarjeta en pantalla',
      ).toHaveLength(1);

      const tanda = play.mock.calls.map(c => (c[0] as Array<{ clip: string }>)[0]!.clip);
      expect(tanda, 'los dos conocidos, ni uno más').toHaveLength(2);
      expect(
        tanda.every(c => c.startsWith('kc.ja.k.')),
        'solo suena la palabra de cada kanji: no hay pregunta que responder',
      ).toBe(true);
    });

    it('sin kanji conocidos no hay Flash: sería una pantalla en blanco con una voz', async () => {
      mount(4, 1);
      vi.spyOn(component.narrator, 'say').mockResolvedValue(true);
      vi.spyOn(component.narrator, 'play').mockResolvedValue(true);
      component.startGame();
      fixture.detectChanges();
      await advance(700);

      expect(component.flashKanji()).toBeNull();
      expect(component.step()).toBe('story');
    });

    it('el Flash va DESPUÉS de examinar, no antes', async () => {
      // El Flash enseña los kanji, y en cuanto se enseñan el recuerdo deja de ser frío: si
      // fuera antes, "¿cuál suena?" se respondería con lo visto hace cinco segundos.
      await empezarConCalentamiento(4, 3, ['mei', 'kyuu', 'rin', 'iwa']);
      const pasos: string[] = [];
      vi.spyOn(component.narrator, 'play').mockImplementation(async () => {
        pasos.push(component.step());
        return true;
      });

      for (let i = 0; i < 2; i++) {
        component.responderRecall(component.recall()!.objetivo.id);
        await advance(2000);
      }

      expect(pasos, 'primero examina').toContain('reconocer');
      expect(pasos, 'y enseña después').toContain('flash');
      expect(pasos.indexOf('flash')).toBeGreaterThan(pasos.indexOf('reconocer'));
      expect(component.step(), 'y acaba jugando').toBe('story');
    });
  });
});
