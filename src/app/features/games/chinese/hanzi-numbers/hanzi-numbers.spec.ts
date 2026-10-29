import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HanziNumbers, PAUSA_DUDA_MS } from './hanzi-numbers';
import { piezasDe } from './hanzi-numbers-problem';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import { installMemoryStorage } from '@core/testing/memory-storage';

/**
 * TEST DE INTEGRACIÓN DEL COMPONENTE.
 *
 * La lógica pura (`hanzi-numbers-problem.spec.ts`) ya garantiza que el problema se
 * construye bien. Este recorre el flujo entero, que es donde vive lo que la lógica no
 * ve: que `busy` no se quede clavado, que la racha suba solo cuando toca, que una duda
 * no avance la ronda y que el cambio de etapa con el nivel llegue a la pantalla.
 */

// ---------- Stubs: edad y nivel controlados ----------

class ProfileStub {
  age: 4 | 6 = 4;
  activeProfile = () => ({
    id: 'test-profile',
    name: 'Test',
    age: this.age,
    avatar: '🧪',
    preferredTheme: 'space' as const,
    createdAt: '',
    stickers: [],
    progress: {} as never,
  });
  getGameLevel = () => 1;
  isGameCompleted = () => false;
  saveGameProgress = () => {};
}

class ProgressStub {
  level = 1;
  getLevel = () => this.level;
  saveProgress = (_id: string, p: { level: number }) => {
    this.level = p.level;
  };
}

describe('HanziNumbers (integración)', () => {
  let fixture: ComponentFixture<HanziNumbers>;
  let component: HanziNumbers;
  let profile: ProfileStub;
  let progress: ProgressStub;
  let decir: ReturnType<typeof vi.spyOn>;

  /** Monta el componente con edad y nivel concretos */
  function mount(age: 4 | 6, level = 1): void {
    profile = new ProfileStub();
    profile.age = age;
    progress = new ProgressStub();
    progress.level = level;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HanziNumbers],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
      ],
    });
    TestBed.inject(GameAudioService).setEnabled(false);
    // La narración en jsdom no puede sonar y su espera es con reloj real: sin esto, cada
    // `say` deja una promesa colgada y `whenStable()` se queda esperando.
    decir = vi.spyOn(TestBed.inject(Narrator), 'say').mockResolvedValue(true);

    fixture = TestBed.createComponent(HanziNumbers);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  }

  function byText(selector: string, text: string): HTMLElement | undefined {
    return all(selector).find(el => el.textContent?.trim() === text);
  }

  /** Toca en la bandeja las piezas que forman el objetivo, en orden. */
  function agarrarSolucion(): void {
    const bandeja = component.bandeja();
    const usados = new Set<number>();
    for (const pieza of piezasDe(component.objetivo())) {
      const i = bandeja.findIndex((p, idx) => p === pieza && !usados.has(idx));
      expect(i, `la bandeja trae ${pieza}`).toBeGreaterThanOrEqual(0);
      usados.add(i);
      component.agarrar(i);
      fixture.detectChanges();
    }
  }

  /** Deja correr las microtareas de las promesas de narración (`say` está mockeado). */
  async function micros(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  /** Las claves que ha narrado `say`, en orden, como texto. */
  function narraciones(): string[] {
    return decir.mock.calls.map((c: unknown[]) => String(c[0]));
  }

  beforeEach(() => {
    installMemoryStorage();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ============================================
  // ETAPA 1 · RECONOCER (1–20)
  // ============================================

  it('muestra el número y cuatro opciones, y la respuesta está entre ellas', () => {
    mount(4, 1);

    expect(component.etapa(), 'el nivel 1 es reconocer').toBe('reconocer');
    expect(component.enunciado(), 'algo se muestra en grande').toBeTruthy();
    expect(component.opciones(), 'cuatro opciones').toHaveLength(4);
    expect(component.opciones()).toContain(component.respuesta());
    expect(all('.opcion')).toHaveLength(4);
  });

  it('acertar sube la racha; dudar no la toca y deja la pregunta socrática', () => {
    mount(4, 1);

    const mala = component.opciones().find(o => o !== component.respuesta())!;
    component.elegir(mala);
    fixture.detectChanges();

    expect(component.feedbackState(), 'una duda no es un veredicto').toBe('idle');
    expect(component.consecutiveCorrect(), 'y no avanza la ronda').toBe(0);
    expect(component.hint(), 'pero sí propone el siguiente movimiento').toContain('escucha');

    component.elegir(component.respuesta());
    fixture.detectChanges();

    expect(component.feedbackState()).toBe('success');
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('la consigna cambia con la dirección: a veces se ve el número, a veces el hanzi', () => {
    mount(6, 1);
    let vioNumero = 0;
    let vioHanzi = 0;

    for (let i = 0; i < 60; i++) {
      component.generateProblem();
      if (component.direccion() === 'numero-a-hanzi') vioNumero++;
      else vioHanzi++;
      expect(component.opciones()).toContain(component.respuesta());
    }

    expect(vioNumero, 'ambas direcciones aparecen').toBeGreaterThan(10);
    expect(vioHanzi, 'ambas direcciones aparecen').toBeGreaterThan(10);
  });

  it('la opción que se toca suena en chino, sea el glifo o el dígito', () => {
    mount(4, 1);
    decir.mockClear();

    component.elegir(component.respuesta());
    fixture.detectChanges();

    const claves = decir.mock.calls.flatMap((c: unknown[]) => String(c[0]));
    expect(claves.some((k: string) => k.startsWith('hn.num.')), `claves: ${claves}`).toBe(true);
  });

  // ============================================
  // ETAPA 2 · COMBINAR
  // ============================================

  it('el nivel 7 cambia a combinar: objetivo, bandeja y consigna', () => {
    mount(6, 7);

    expect(component.etapa()).toBe('combinar');
    expect(component.objetivo(), 'edad 6, N7 = 21–60').toBeGreaterThanOrEqual(21);
    // La perilla de N7 a los 6: la solución y UN distractor. (Antes la bandeja traía
    // siempre 10 piezas, idénticas en los niveles 9–12.)
    expect(component.bandeja().length).toBe(piezasDe(component.objetivo()).length + 1);
    expect(component.linea()).toContain(String(component.objetivo()));
    expect(all('.pieza')).toHaveLength(component.bandeja().length);
  });

  it('agarrar las piezas en orden forma el número y termina la ronda', () => {
    mount(6, 7);
    const objetivo = component.objetivo();

    agarrarSolucion();

    expect(component.leido(), `${objetivo} = ${piezasDe(objetivo).join('')}`).toBe(objetivo);
    expect(component.feedbackState()).toBe('success');
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('con todas las piezas puestas y sin leerse, la duda apunta al 十 y no avanza', () => {
    mount(6, 7);
    const bandeja = component.bandeja();
    const necesarias = piezasDe(component.objetivo()).length;

    // Piezas que no son 十: sin el 十 ningún montaje cierra, así que, puestas todas las
    // que pide la escritura, el resultado es un callejón sin salida —que es el único
    // momento en que la duda se atreve a interrumpir.
    const unidades = bandeja.map((p, i) => ({ p, i })).filter(x => x.p !== '十');
    expect(
      unidades.length,
      'la perilla de N7 trae unidades de sobra',
    ).toBeGreaterThanOrEqual(necesarias);
    for (const u of unidades.slice(0, necesarias)) component.agarrar(u.i);
    fixture.detectChanges();

    expect(component.leido(), `${necesarias} piezas sin 十 no se leen`).toBeNull();
    expect(component.feedbackState(), 'y eso no termina la ronda').toBe('idle');
    expect(component.consecutiveCorrect()).toBe(0);
    expect(component.hint(), 'la duda apunta al 十').toContain('dieces');
  });

  it('un orden legible pero distinto no termina: muestra el número que sale', () => {
    mount(6, 7);
    const bandeja = component.bandeja();
    const objetivo = component.objetivo();

    // Busca una lectura válida que NO sea el objetivo: el número que sale se compara
    // con el de arriba, y esa comparación es el ejercicio.
    let encontrado: number | null = null;
    let secuencia: number[] = [];
    const n = bandeja.length;
    for (let mask = 1; mask < 1 << n && encontrado === null; mask++) {
      const idx: number[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) idx.push(i);
      if (idx.length > 3) continue;
      component.agarradas.set(idx.map(i => ({ i, p: bandeja[i]! })));
      const leido = component.leido();
      if (leido !== null && leido !== objetivo) {
        encontrado = leido;
        secuencia = idx;
      }
    }

    if (encontrado === null) {
      // Sin lecturas alternativas, el problema ya era único: no hay nada que probar.
      expect(component.leido()).toBeNull();
      return;
    }

    component.agarradas.set(secuencia.map(i => ({ i, p: bandeja[i]! })));
    fixture.detectChanges();

    expect(component.leido()).toBe(encontrado);
    expect(component.feedbackState(), 'no es el objetivo, no termina').toBe('idle');
    expect(component.consecutiveCorrect()).toBe(0);
    expect(
      (fixture.nativeElement.querySelector('.lectura-valor') as HTMLElement)?.textContent,
      'pero el número SÍ se enseña, para que lo compare',
    ).toContain(String(encontrado));
  });

  it('tocar el chip devuelve la pieza y "Limpiar" vacía la lectura', () => {
    mount(6, 7);
    const bandeja = component.bandeja();

    component.agarrar(0);
    fixture.detectChanges();
    expect(component.agarradas()).toHaveLength(1);
    expect(all('.chip')).toHaveLength(1);
    expect(component.usada(0)).toBe(true);

    component.soltar(0);
    fixture.detectChanges();
    expect(component.agarradas(), 'el chip devuelve la pieza').toHaveLength(0);
    expect(component.usada(0)).toBe(false);

    component.agarrar(0);
    component.agarrar(1);
    fixture.detectChanges();
    component.limpiar();
    fixture.detectChanges();
    expect(component.agarradas()).toHaveLength(0);
    expect(
      all('.pieza').every(p => !(p as HTMLButtonElement).disabled),
      'vuelven a la bandeja',
    ).toBe(true);
  });

  it('la misma pieza no se puede agarrar dos veces', () => {
    mount(6, 7);
    component.agarrar(0);
    component.agarrar(0);
    fixture.detectChanges();
    expect(component.agarradas()).toHaveLength(1);
  });

  // ============================================
  // FASE 1 · QUE EL JUEGO MIDA Y PROGRESE
  // ============================================

  it('el primer toque queda registrado: acertar al primer intento es lo que mide', async () => {
    mount(4, 1);
    expect(component.primerIntento(), 'sin toques todavía').toBeNull();

    component.elegir(component.opciones().find(o => o !== component.respuesta())!);
    fixture.detectChanges();
    expect(component.primerIntento(), 'primer toque = fallo, registrado').toBe(false);

    component.elegir(component.respuesta());
    fixture.detectChanges();
    expect(component.primerIntento(), 'el2.º toque no reescribe el primero').toBe(false);
    // Se mide, no se castiga: el error no rompe la racha (Zvonkin: es exploración).
    expect(component.consecutiveCorrect()).toBe(1);

    // Problema nuevo → nueva medición.
    vi.advanceTimersByTime(3000);
    await fixture.whenStable();
    fixture.detectChanges();
    component.elegir(component.respuesta());
    expect(component.primerIntento(), 'acertar al primer toque del problema nuevo').toBe(true);
  });

  it('lo ya descartado se atenúa sin veredicto y sin romper la racha', () => {
    mount(4, 1);

    const mala = component.opciones().find(o => o !== component.respuesta())!;
    component.elegir(mala);
    fixture.detectChanges();

    expect(component.opcionesDescartadas().has(mala), 'queda registrada').toBe(true);
    const boton = all('.opcion').find(el => el.textContent?.trim() === mala);
    expect(boton?.classList.contains('opcion--no'), 'se atenúa en pantalla').toBe(true);
    expect(
      component.opcionesDescartadas().has(component.respuesta()),
      'la respuesta nunca se descarta',
    ).toBe(false);
    expect(component.feedbackState(), 'y sin veredicto').toBe('idle');
    expect(component.consecutiveCorrect(), 'el error no rompe nada').toBe(0);
  });

  it('la duda no interrumpe mientras pueda cerrarse, y llega tras la pausa', () => {
    mount(6, 9); // edad 6, N9: 41–99 — casi todo son objetivos de 3 piezas
    let intentos = 0;
    while (piezasDe(component.objetivo()).length < 3 && intentos < 100) {
      component.generateProblem();
      intentos++;
    }
    expect(piezasDe(component.objetivo()).length, 'el azar acabó dando3').toBe(3);

    decir.mockClear();
    const unidades = component.bandeja()
      .map((p, i) => ({ p, i }))
      .filter(x => x.p !== '十');
    component.agarrar(unidades[0]!.i);
    component.agarrar(unidades[1]!.i);
    fixture.detectChanges();

    // Queda una pieza por poner: el parcial aún puede cerrarse y la duda se calla.
    expect(component.leido(), 'sin el 十 no se lee').toBeNull();
    expect(component.hint(), 'pero no se interrumpe a mitad de obra').toBe('');
    expect(narraciones(), 'ni siquiera hablada').not.toContain('hn.duda.dieces');

    // Se queda quieta: la pausa trae la duda.
    vi.advanceTimersByTime(PAUSA_DUDA_MS);
    fixture.detectChanges();
    expect(component.hint(), 'tras la pausa, sí').toContain('dieces');
    expect(narraciones()).toContain('hn.duda.dieces');
  });

  it('el elogio suena cuando NO sube de nivel', async () => {
    mount(4, 1);
    const praise = vi.spyOn(TestBed.inject(GameAudioService), 'playPraise').mockResolvedValue();

    component.elegir(component.respuesta());
    fixture.detectChanges();
    await micros();

    expect(praise, 'sin subida de nivel, el premio sonoro va').toHaveBeenCalledTimes(1);
  });

  it('al subir de nivel el premio es playLevelUp: el elogio no se solapa', async () => {
    mount(4, 1);
    const audio = TestBed.inject(GameAudioService);
    const praise = vi.spyOn(audio, 'playPraise').mockResolvedValue();
    const levelUp = vi.spyOn(audio, 'playLevelUp').mockResolvedValue();

    // Tres aciertos seguidos suben de nivel a los 4 años; los dos primeros premian.
    for (let i = 0; i < 2; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      await micros();
      vi.advanceTimersByTime(3000);
      await fixture.whenStable();
      fixture.detectChanges();
    }
    expect(praise, 'los aciertos normales sí premian').toHaveBeenCalledTimes(2);

    praise.mockClear();
    levelUp.mockClear();
    component.elegir(component.respuesta());
    fixture.detectChanges();
    await micros();

    expect(levelUp).toHaveBeenCalledTimes(1);
    expect(praise, 'el elogio no suena junto al level-up').not.toHaveBeenCalled();
  });

  it('si la narración del número no fue aceptada, no hay premio sonoro', async () => {
    mount(4, 1);
    const praise = vi.spyOn(TestBed.inject(GameAudioService), 'playPraise').mockResolvedValue();
    decir.mockResolvedValue(false);

    component.elegir(component.respuesta());
    fixture.detectChanges();
    await micros();

    expect(praise, 'narración cancelada = nada que premiar').not.toHaveBeenCalled();
  });

  it('una sola voz por acierto: el número se narra una vez, no dos', () => {
    mount(4, 1);
    decir.mockClear();

    component.elegir(component.respuesta());
    fixture.detectChanges();

    // Antes elegir() narra y finishProblem() repite 1 ms después —el2.º say() cortaba
    // al primero—. Ahora quien narra el acierto es finishProblem, y solo él.
    const claves = narraciones();
    expect(claves, 'una sola llamada').toHaveLength(1);
    expect(claves[0], 'y es el número completo').toContain('hn.num.');
  });

  it('el primer error narra número y duda en UNA cadena (el2.º no corta al1.º)', () => {
    mount(4, 1);
    decir.mockClear();

    const mala = component.opciones().find(o => o !== component.respuesta())!;
    component.elegir(mala);
    fixture.detectChanges();

    expect(decir, 'una sola llamada').toHaveBeenCalledTimes(1);
    const claves = narraciones()[0];
    expect(claves, 'número primero, duda después').toContain('hn.num.');
    expect(claves).toContain('hn.duda.oye');
    expect(claves.indexOf('hn.num.'), 'el número va delante').toBeLessThan(
      claves.indexOf('hn.duda.oye'),
    );
  });

  // ============================================
  // INFRAESTRUCTURA
  // ============================================

  it('subir de nivel genera un problema nuevo y sigue jugando', async () => {
    mount(4, 1);
    component.elegir(component.respuesta());
    fixture.detectChanges();

    vi.advanceTimersByTime(3000);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.feedbackState(), 'la ronda se cierra y empieza otra').toBe('idle');
    expect(component.opciones()).toHaveLength(4);
  });
});
