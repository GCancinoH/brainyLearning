import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { KanjiCompose } from './kanji-compose';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameAudioService } from '@core/games/game-audio.service';

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

/**
 * El entorno de test no trae `localStorage` fiable; se instala uno en memoria para que
 * `ProfileStateService` no reviente en su inicializador. En producción sí existe de verdad.
 */
function installMemoryStorage(): void {
  const g = globalThis as unknown as { localStorage?: Storage };
  if (g.localStorage?.getItem) return;
  const store = new Map<string, string>();
  const fake: Storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
    writable: true,
  });
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

  /** Avanza los temporizadores que usa el juego (`setTimeout` encadenados). */
  async function advance(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  /** Toca la pieza indicada en la bandeja, como lo haría la niña. */
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

  /**
   * Recorre el paso de composición colocando las piezas **en el orden de los huecos**:
   * `onTap` rellena el primer hueco libre, así que si se entregan en ese orden la
   * composición sale exacta y `evaluate()` dispara `onComposed()`.
   *
   * Los kanji con hermanos abren el overlay y **no** pasan solos al dibujo: hay que
   * cerrarlo. Ese es el comportamiento que se quiere probar, así que el helper lo
   * recorre como lo recorrería la niña.
   */
  async function composeCorrectly(): Promise<void> {
    component.startComposing();
    fixture.detectChanges();
    for (const slot of component.problem()!.slots) tapPiece(slot.kanji);
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
    for (const k of [...huecos].reverse().map(s => s.kanji)) tapPiece(k);
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

    for (const s of component.problem()!.slots) tapPiece(s.kanji);
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
});
