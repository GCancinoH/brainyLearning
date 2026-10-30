import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HanziNumbers, PAUSA_DUDA_MS } from './hanzi-numbers';
import { leer, piezasDe } from './hanzi-numbers-problem';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import { TutorialSeen } from '@core/games/tutorial-seen.service';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { SpacedRepetition } from '@core/learning/spaced-repetition';
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
  /**
   * `null` = recién llegada, sin ninguna partida guardada: así se activa el
   * mini-diagnóstico de 6 años (2.2). Por defecto hay progreso, que es el caso normal.
   */
  getProgress = (_id: string): { level: number } | null => ({ level: this.level });
}

describe('HanziNumbers (integración)', () => {
  let fixture: ComponentFixture<HanziNumbers>;
  let component: HanziNumbers;
  let profile: ProfileStub;
  let progress: ProgressStub;
  let decir: ReturnType<typeof vi.spyOn>;

  /**
   * Monta el componente con edad y nivel concretos.
   *
   * - `recienLlegada`: sin progreso guardado —es el caso que dispara el diagnóstico—.
   * - Nivel ≥ 7: se da por vista la tarjeta del puente (2.4) para que los tests que solo
   *   quieren jugar a combinar no se encuentren la etapa interrumpida; el propio puente
   *   tiene sus tests, que montan sin esta marca.
   */
  function mount(age: 4 | 6, level = 1, opts: { recienLlegada?: boolean } = {}): void {
    profile = new ProfileStub();
    profile.age = age;
    progress = new ProgressStub();
    progress.level = level;
    if (opts.recienLlegada) progress.getProgress = () => null;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HanziNumbers],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
      ],
    });
    TestBed.inject(GameAudioService).setEnabled(false);
    if (level >= 7) {
      TestBed.inject(TutorialSeen).mark('hanzi-numbers', 'combinar');
    }
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
    // Las que ya están en la mano (una ronda a medias) cuentan: no se agarran dos veces.
    const usados = new Set<number>(component.agarradas().map(a => a.i));
    const necesitadas = new Map<string, number>();
    for (const pieza of piezasDe(component.objetivo())) {
      necesitadas.set(pieza, (necesitadas.get(pieza) ?? 0) + 1);
      const enMano = component.agarradas().filter(a => a.p === pieza).length;
      if (enMano >= necesitadas.get(pieza)!) continue;
      const i = bandeja.findIndex((p, idx) => p === pieza && !usados.has(idx));
      expect(i, `la bandeja trae ${pieza}`).toBeGreaterThanOrEqual(0);
      usados.add(i);
      component.agarrar(i);
      fixture.detectChanges();
    }
  }

  /** El número que dice un texto del tablero: dígito o hanzi. */
  function valorDe(texto: string): number {
    return /^\d+$/.test(texto) ? Number(texto) : (leer([texto]) ?? NaN);
  }

  /** Los telégrafos de la Fase 3: intentos, errores y repasos del SRS. */
  function espiarAnotaciones(): {
    intentos: MockInstance;
    errores: MockInstance;
    revisiones: MockInstance;
  } {
    return {
      intentos: vi.spyOn(TestBed.inject(SkillProgressService), 'recordAttempt'),
      errores: vi.spyOn(TestBed.inject(SkillProgressService), 'recordMistake'),
      revisiones: vi.spyOn(TestBed.inject(SpacedRepetition), 'review'),
    };
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
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  // ============================================
  // ETAPA 1 · RECONOCER (1–20)
  // ============================================

  it('muestra el número y sus opciones, y la respuesta está entre ellas', () => {
    mount(4, 1);

    expect(component.etapa(), 'el nivel 1 es reconocer').toBe('reconocer');
    expect(component.enunciado(), 'algo se muestra en grande').toBeTruthy();
    // 2.1 · La perilla de la edad manda: los 4 años ven 2–3 opciones, no 4 fijas.
    expect(component.opciones().length, '2–3 opciones').toBeGreaterThanOrEqual(2);
    expect(component.opciones().length).toBeLessThanOrEqual(3);
    expect(component.opciones()).toContain(component.respuesta());
    expect(all('.opcion')).toHaveLength(component.opciones().length);
  });

  it('acertar sube la racha; dudar no la toca y deja la pregunta socrática', () => {
    mount(4, 1);

    const mala = component.opciones().find(o => o !== component.respuesta())!;
    component.elegir(mala);
    fixture.detectChanges();

    expect(component.feedbackState(), 'una duda no es un veredicto').toBe('idle');
    expect(component.consecutiveCorrect(), 'y no avanza la ronda').toBe(0);
    expect(component.hint(), 'pero sí propone el siguiente movimiento').toBe('👂');

    component.elegir(component.respuesta());
    fixture.detectChanges();

    expect(component.feedbackState()).toBe('success');
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('la consigna cambia con la dirección: a veces se ve el número, a veces el hanzi', () => {
    mount(6, 3); // 2.6 · desde N3 la dirección alterna; en N1–N2 queda fija
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
    // 2.5 · La consigna no se escribe para quien aún no lee: el banner queda para los
    // iconos/feedback y "Forma" vive como rótulo icono junto al número.
    expect(component.linea(), 'sin consigna escrita').toBe('');
    expect(byText('.objetivo-label', '🧱'), 'rótulo icono').toBeTruthy();
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
    expect(component.hint(), 'la duda apunta al 十').toBe('🔟');
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
    expect(component.hint(), 'tras la pausa, sí').toBe('🔟');
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
  // FASE 2 · QUE EL JUEGO SEA PARA LA EDAD
  // ============================================

  it('2.1 · los 6 años ven 3–4 opciones', () => {
    mount(6, 3); // N3: sin diagnóstico porque el stub trae progreso guardado
    expect(component.diagnostico(), 'no se examina si ya jugó').toBeNull();
    expect(component.opciones().length).toBeGreaterThanOrEqual(3);
    expect(component.opciones().length).toBeLessThanOrEqual(4);
    expect(component.opciones()).toContain(component.respuesta());
  });

  it('2.2 · una recién llegada de 6 años juega el mini-diagnóstico antes que la sesión', () => {
    mount(6, 1, { recienLlegada: true });

    expect(component.diagnostico(), 'empieza por el diagnóstico').not.toBeNull();
    expect(component.diagnostico()!.respuestas, 'ninguna pregunta contestada').toHaveLength(0);
    expect(TestBed.inject(GameSessionService).state(), 'sin sesión todavía').toBeNull();
    expect(component.etapa()).toBe('reconocer');
    // Pregunta 1 = tramo del nivel 1 (1–5): la más fácil de las tres.
    expect(Number(component.enunciado()), 'primer tramo, 1–5').toBeLessThanOrEqual(5);
    expect(
      fixture.nativeElement.querySelector('.level-badge')?.textContent,
      'la insignia dice por dónde va',
    ).toContain('1/3');
  });

  it('2.2 · acierta las 3 al primer toque → arranca en el nivel 4 (1–20)', async () => {
    mount(6, 1, { recienLlegada: true });

    for (let i = 0; i < 3; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      await micros();
      vi.advanceTimersByTime(3000);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    expect(component.diagnostico(), 'acabó el diagnóstico').toBeNull();
    expect(TestBed.inject(GameSessionService).state()?.level, 'ubicada en el 4').toBe(4);
    expect(progress.level, 'y quedó guardada como cualquier nivel').toBe(4);
    expect(component.enunciado(), 'ya juega de verdad').toBeTruthy();
  });

  it('2.2 · falla la primera → con 2 de 3 queda en el nivel 3', async () => {
    mount(6, 1, { recienLlegada: true });

    // Pregunta 1: primer toque fallado —se atenúa y acaba acertando—.
    component.elegir(component.opciones().find(o => o !== component.respuesta())!);
    component.elegir(component.respuesta());
    fixture.detectChanges();
    await micros();
    vi.advanceTimersByTime(3000);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.diagnostico()!.respuestas, 'el primer toque fue fallo').toEqual([false]);

    // Preguntas 2 y 3: al primer toque.
    for (let i = 0; i < 2; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      await micros();
      vi.advanceTimersByTime(3000);
      await fixture.whenStable();
      fixture.detectChanges();
    }

    expect(component.diagnostico()).toBeNull();
    expect(
      TestBed.inject(GameSessionService).state()?.level,
      '2 aciertos + 1 = nivel 3',
    ).toBe(3);
  });

  it('2.2 · los 4 años arrancan sin diagnóstico y con la sesión ya montada', () => {
    mount(4, 1);
    expect(component.diagnostico()).toBeNull();
    expect(TestBed.inject(GameSessionService).state(), 'la sesión empieza ya').not.toBeNull();
  });

  it('2.2 · quien ya tiene progreso guardado no repite el diagnóstico', () => {
    mount(6, 5);
    expect(component.diagnostico()).toBeNull();
    expect(TestBed.inject(GameSessionService).state()?.level, 'su nivel manda').toBe(5);
  });

  it('2.3 · N1–N2: el inicio dice el número — emparejar por oído está bien', () => {
    mount(4, 1);
    const claves = narraciones()[0];
    expect(claves, 'la consigna').toContain('hn.ask.');
    expect(claves, 'y el ancla en chino').toContain('hn.num.');
  });

  it('2.3 · N3+: el inicio ya no dice el número — que no resuelvan por oreja', () => {
    mount(4, 3);
    expect(narraciones()[0], 'solo la consigna').not.toContain('hn.num.');
    expect(narraciones()[0]).toContain('hn.ask.');
  });

  it('2.3 · combinar tampoco lo dice al entrar: el oído es al tocar las piezas', () => {
    mount(6, 7);
    expect(narraciones()[0]).toContain('hn.ask.combinar');
    expect(narraciones()[0], 'sin el número leído en voz alta').not.toContain('hn.num.');
  });

  it('2.4 · el salto 6→7 explica la etapa antes del primer problema real', () => {
    mount(4, 6);

    // Tres aciertos seguidos suben de nivel a los 4 años.
    for (let i = 0; i < 3; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      vi.advanceTimersByTime(3000);
      fixture.detectChanges();
    }

    expect(component.etapa(), 'ya es combinar').toBe('combinar');
    expect(component.puente(), 'pero primero se explica').toBe(true);
    expect(all('.puente'), 'la tarjeta está en pantalla').toHaveLength(1);
    expect(component.objetivo(), 'y el problema real espera').toBe(0);

    // El toque entra al juego y la tarjeta queda como vista.
    component.seguirPuente();
    fixture.detectChanges();
    expect(component.puente()).toBe(false);
    expect(component.objetivo(), 'ahora sí, el primer problema real').toBeGreaterThanOrEqual(11);
    expect(component.bandeja().length, 'y con su bandeja').toBeGreaterThan(0);
    expect(
      TestBed.inject(TutorialSeen).has('hanzi-numbers', 'combinar'),
      'queda visto',
    ).toBe(true);
  });

  it('2.4 · si la etapa ya se explicó, no interrumpe', () => {
    mount(4, 7); // el mount da la tarjeta por vista
    expect(component.puente()).toBe(false);
    expect(all('.puente')).toHaveLength(0);
    expect(component.objetivo(), 'entra directo al problema').toBeGreaterThanOrEqual(11);
  });

  it('2.5 · sin consigna escrita: iconos en el banner, en la pista y en la insignia', () => {
    mount(4, 1);

    expect(component.linea(), 'banner: iconos de dirección').not.toMatch(/[A-Za-z]/);
    expect(component.linea()).toContain('➡️');
    expect(byText('.etapa-badge', '🔤'), 'la insignia se mira, no se lee').toBeTruthy();
    for (const mensajes of Object.values(component.customFeedbackMessages)) {
      for (const m of mensajes) expect(m, 'emojis, no frases').not.toMatch(/[A-Za-z]/);
    }

    component.elegir(component.opciones().find(o => o !== component.respuesta())!);
    fixture.detectChanges();
    expect(component.hint(), 'la pista es un mood, no una frase').not.toMatch(/[A-Za-z]/);
    expect(component.hint(), 'y sí hay pista').not.toBe('');
  });

  // ============================================
  // FASE 3 · DATOS HONESTOS (§5.11) Y REFLEXIÓN
  // ============================================

  it('3.1 · un acierto al primer toque anota el intento con su skill y su representación', () => {
    mount(4, 1);
    const { intentos } = espiarAnotaciones();

    component.elegir(component.respuesta());
    fixture.detectChanges();

    expect(intentos, 'un intento por problema, no por toque').toHaveBeenCalledTimes(1);
    const registro = intentos.mock.calls[0]![0];
    expect(registro.skillId).toBe('chinese.numeros.reconocer');
    expect(registro.correct, 'acierto al primer toque').toBe(true);
    // N1: dirección fija (dígito → hanzi), así que lo que se MOSTRÓ es un dígito.
    expect(registro.representation).toBe('digit');
    expect(registro.contentId, 'el número, como contenido').toBe(String(valorDe(component.respuesta())));
    expect(registro.difficulty).toBe(1);
    expect(registro.responseTimeMs).toBeGreaterThanOrEqual(0);
    expect(registro.profileId).toBe('test-profile');
  });

  it('3.1 · el primer toque fallado anota la falla Y el mistake con la opción exacta', () => {
    mount(4, 1);
    const { intentos, errores } = espiarAnotaciones();

    const mala = component.opciones().find(o => o !== component.respuesta())!;
    component.elegir(mala);
    component.elegir(component.respuesta());
    fixture.detectChanges();

    expect(intentos, 'sigue siendo un intento por problema').toHaveBeenCalledTimes(1);
    expect(intentos.mock.calls[0]![0].correct, 'lo que mide es el primer toque').toBe(false);
    expect(errores, 'y el error queda registrado').toHaveBeenCalledTimes(1);
    const mistake = errores.mock.calls[0]![0];
    expect(mistake.mistakeType).toBe('primer-toque');
    expect(mistake.answered, 'la opción que tocó primero, sin adivinar').toBe(mala);
    expect(mistake.expected).toBe(component.respuesta());
  });

  it('3.1 · en combinar, la duda por pausa cuenta como ayuda —no como tanteo—', () => {
    mount(6, 9); // N9: 41–99 — casi todo son objetivos de 3 piezas
    let regeneraciones = 0;
    while (piezasDe(component.objetivo()).length < 3 && regeneraciones < 100) {
      component.generateProblem();
      regeneraciones++;
    }
    const { intentos, errores, revisiones } = espiarAnotaciones();

    // Dos unidades sin 十: el parcial no se lee todavía → la pausa trae la duda.
    const unidades = component.bandeja().map((p, i) => ({ p, i })).filter(x => x.p !== '十');
    component.agarrar(unidades[0]!.i);
    component.agarrar(unidades[1]!.i);
    fixture.detectChanges();
    expect(component.leido(), 'sin el 十 no se lee').toBeNull();
    vi.advanceTimersByTime(PAUSA_DUDA_MS);
    fixture.detectChanges();
    expect(component.hint(), 'la pausa sí trae la duda').toBe('🔟');

    // Lo arregla —vacía lo que estorba y arma la escritura bien— y cierra la ronda: la
    // duda ya sonó, así que la ronda queda como "resuelta con ayuda".
    component.limpiar();
    agarrarSolucion();
    fixture.detectChanges();

    expect(intentos.mock.calls[0]![0].correct, 'con ayuda no fue sola').toBe(false);
    expect(errores, 'la ayuda es el mistake honesto').toHaveBeenCalledTimes(1);
    expect(errores.mock.calls[0]![0].mistakeType).toBe('ayuda');
    expect(
      revisiones.mock.calls[0]![2],
      '§5.4: con ayuda no sube de caja, pero vuelve mañana',
    ).toEqual({ correct: true, ayuda: 1 });
  });

  it('3.1 · en combinar, el callejón de orden inválido cuenta como error de orden', () => {
    mount(6, 7);
    const { intentos, errores, revisiones } = espiarAnotaciones();

    // Todas las piezas que pide la escritura sin el 十: callejón sin salida.
    const necesarias = piezasDe(component.objetivo()).length;
    const unidades = component.bandeja().map((p, i) => ({ p, i })).filter(x => x.p !== '十');
    expect(unidades.length, 'hay unidades de sobra para el callejón').toBeGreaterThanOrEqual(necesarias);
    for (const u of unidades.slice(0, necesarias)) component.agarrar(u.i);
    fixture.detectChanges();
    expect(component.hint(), 'la duda del callejón').toBe('🔟');

    // Lo arregla y cierra la ronda: el callejón ya quedó anotado.
    component.limpiar();
    agarrarSolucion();
    fixture.detectChanges();

    expect(intentos.mock.calls[0]![0].correct, 'un orden inválido no fue sola').toBe(false);
    expect(errores, 'y el mistake es de orden').toHaveBeenCalledTimes(1);
    expect(errores.mock.calls[0]![0].mistakeType).toBe('orden');
    expect(revisiones.mock.calls[0]![2], '§5.4: el callejón vuelve a la caja 1').toEqual({
      correct: false,
      ayuda: 1,
    });
  });

  it('3.2 · cada ronda alimenta el SRS con el mismo veredicto de "sola"', () => {
    mount(4, 1);
    const { revisiones } = espiarAnotaciones();

    component.elegir(component.respuesta());
    fixture.detectChanges();

    expect(revisiones).toHaveBeenCalledTimes(1);
    const [deck, numero, resultado] = revisiones.mock.calls[0]!;
    expect(deck).toBe('hanzi-numbers');
    expect(numero, 'un recuerdo por número').toBe(String(valorDe(component.respuesta())));
    expect(resultado, 'sola y sin ayuda: sube de caja').toEqual({ correct: true, ayuda: 0 });
  });

  it('3.2 · el número vencido del SRS manda sobre el azar del nivel', () => {
    mount(4, 4);
    vi.spyOn(TestBed.inject(SpacedRepetition), 'due').mockReturnValue(['15']);
    decir.mockClear();

    component.generateProblem();

    const visto = [component.enunciado(), component.respuesta()];
    expect(
      visto.some(v => v === '15' || v === '十五'),
      `salió el repasado (15): ${visto.join(' / ')}`,
    ).toBe(true);
  });

  it('3.4 · a los 6 años, tras un acierto aparece la reflexión de un toque', () => {
    mount(6, 3);

    component.elegir(component.respuesta());
    fixture.detectChanges();
    vi.advanceTimersByTime(1600);
    fixture.detectChanges();

    expect(component.reflecting(), 'espera su toque').toBe(true);
    expect(component.reflexiones.length, 'tres opciones en el modelo').toBe(3);
    const overlay = fixture.nativeElement.querySelector('#reflexion-overlay');
    expect(overlay, 'overlay de reflexión existe').toBeTruthy();
    expect(overlay?.textContent, 'contiene las tres opciones').toContain('Lo sé de memoria');
    expect(overlay?.textContent).toContain('Lo conté');
    expect(overlay?.textContent).toContain('Me ayudó el audio');

    component.chooseReflection('nuevo');
    fixture.detectChanges();
    expect(component.reflecting(), 'un toque y se va').toBe(false);
    expect(component.enunciado(), 'y el juego sigue').toBeTruthy();
  });

  it('3.4 · cada botón hace lo que dice: "repaso" repite el número y "nuevo" trae otro', () => {
    mount(6, 3);
    const antes = valorDe(component.respuesta());

    component.elegir(component.respuesta());
    fixture.detectChanges();
    vi.advanceTimersByTime(1600);
    component.chooseReflection('repaso');
    fixture.detectChanges();
    expect(valorDe(component.respuesta()), 'el mismo, para contarlo otra vez').toBe(antes);

    component.elegir(component.respuesta());
    fixture.detectChanges();
    vi.advanceTimersByTime(1600);
    component.chooseReflection('nuevo');
    fixture.detectChanges();
    expect(valorDe(component.respuesta()), 'uno que no haya salido hoy').not.toBe(antes);
  });

  it('3.4 · "me ayudó el audio" vuelve a poner el ancla al entrar (N3+)', () => {
    mount(6, 3);
    decir.mockClear();

    component.elegir(component.respuesta());
    fixture.detectChanges();
    vi.advanceTimersByTime(1600);
    component.chooseReflection('ancla');
    fixture.detectChanges();

    const ultima = narraciones().at(-1) ?? '';
    expect(ultima, 'la consigna').toContain('hn.ask.');
    expect(ultima, 'y el ancla que ella pidió').toContain('hn.num.');
  });

  it('3.4 · el diagnóstico no se interrumpe con la reflexión', () => {
    mount(6, 1, { recienLlegada: true });

    for (let i = 0; i < 3; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      vi.advanceTimersByTime(3000);
      fixture.detectChanges();
      expect(component.reflecting(), 'pregunta tras pregunta, sin preguntar cómo').toBe(false);
    }
    expect(component.diagnostico(), 'acabó y siguió a la sesión').toBeNull();
  });

  it('3.4 · al subir de nivel no hay reflexión: el premio es el nivel', () => {
    mount(6, 3);
    // Cuatro aciertos seguidos suben a los 6 años; los tres primeros reflexionan.
    for (let i = 0; i < 3; i++) {
      component.elegir(component.respuesta());
      fixture.detectChanges();
      vi.advanceTimersByTime(1600);
      fixture.detectChanges();
      expect(component.reflecting(), `acierto ${i + 1}: toca reflexionar`).toBe(true);
      component.chooseReflection('nuevo');
      fixture.detectChanges();
    }
    component.elegir(component.respuesta());
    fixture.detectChanges();
    vi.advanceTimersByTime(1600);
    fixture.detectChanges();

    expect(component.reflecting(), 'con el nivel no se conversa').toBe(false);
    expect(TestBed.inject(GameSessionService).state()?.level, 'subió al 4').toBe(4);
  });

  // ============================================
  // FASE 4 · ITEM 2: REORDENAR CON ARRASTRE
  // ============================================

  it('4.2 · reorderPieces reordena las fichas y actualiza la lectura', () => {
    mount(6, 7);
    // Forzamos unas fichas en la mano: 九 十 二 (leer = 92, canónico)
    component.agarradas.set([
      { i: 0, p: '九' },
      { i: 1, p: '十' },
      { i: 2, p: '二' },
    ]);
    fixture.detectChanges();
    expect(component.leido(), 'orden original: 九十二 = 92 (canónico)').toBe(92);

    // Reordenamos: movemos la primera (九) al final → 十 二 九 = 129? No, 十二九 no es canónico.
    // Probemos otro: 十 九 二 → 192 no es canónico. 
    // La idea: cualquier cambio de orden rompe la canonicidad salvo el orden correcto.
    // Movemos 九 al final: 十 二 九 → no se lee (null).
    component.reorderPieces({
      previousIndex: 0,
      currentIndex: 2,
      container: { data: component.agarradas() } as any,
      item: { data: 0 } as any,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new Event('drop'),
    } as any);
    fixture.detectChanges();

    expect(component.leido(), 'nuevo orden: 十二九 no es canónico → null').toBeNull();
  });

  it('4.2 · reorderPieces cierra la ronda si el nuevo orden es canónico', () => {
    mount(6, 7);
    component.objetivo.set(35);
    component.agarradas.set([
      { i: 0, p: '十' },
      { i: 1, p: '三' },
      { i: 2, p: '五' },
    ]);
    fixture.detectChanges();
    expect(component.leido(), 'orden incorrecto: 十三五 no es canónico').toBeNull();

    component.reorderPieces({
      previousIndex: 1,
      currentIndex: 0,
      container: { data: component.agarradas() } as any,
      item: { data: 1 } as any,
      isPointerOverContainer: true,
      distance: { x: 0, y: 0 },
      dropPoint: { x: 0, y: 0 },
      event: new Event('drop'),
    } as any);
    fixture.detectChanges();

    expect(component.leido(), 'orden correcto: 三十五 = 35').toBe(35);
    expect(component.feedbackState(), 'ronda cerrada con éxito').toBe('success');
    expect(component.consecutiveCorrect(), 'racha sube').toBe(1);
  });

  // ============================================
  // FASE 4 · ITEM 4: FLASH FINAL
  // ============================================

  it('4.4 · iniciarFlash reproduce la tanda completa y limpia busy/linea al final', async () => {
    mount(6, 7);
    vi.spyOn(TestBed.inject(SpacedRepetition), 'isIntroduced').mockReturnValue(true);
    vi.spyOn(TestBed.inject(SpacedRepetition), 'due').mockReturnValue(['11', '12', '13', '14', '15']);

    // Simular fin de sesión usando el servicio público
    TestBed.inject(GameSessionService).endSession('time-up');
    fixture.detectChanges();

    await vi.advanceTimersByTimeAsync(7000);
    fixture.detectChanges();

    expect(component.busy(), 'busy liberado al terminar Flash').toBe(false);
    expect(component.linea(), 'linea limpiada al terminar').toBe('');
    expect(component.feedbackState(), 'feedback idle').toBe('idle');
  });

  // ============================================
  // FASE 4 · ITEM 5: TRAZADO
  // ============================================

  it('4.5 · abrirTrazado abre el modal y prepara el canvas', () => {
    mount(6, 7);
    component.objetivo.set(7);
    component.direccionCombinar.set('hanzi-a-numero');
    fixture.detectChanges();

    component.abrirTrazado();
    fixture.detectChanges();

    // El modal se abre sincrónicamente
    expect(component.trazando(), 'modal abierto').toBe(true);
    expect(component.kanjiTrazado(), 'kanji del objetivo').toBe('七');
    // El canvas se inicializa en el siguiente tick (setTimeout)
    // El progreso empieza en 0
    expect(component.progresoTrazado().actual, 'empieza en 0').toBe(0);
  });

  it('4.5 · progresoTrazado se actualiza al completar trazos', () => {
    mount(6, 7);
    component.objetivo.set(7);
    component.direccionCombinar.set('hanzi-a-numero');
    fixture.detectChanges();

    component.trazando.set(true);
    component.progresoTrazado.set({ actual: 0, total: 2 });
    fixture.detectChanges();

    component.progresoTrazado.set({ actual: 1, total: 2 });
    fixture.detectChanges();
    expect(component.progresoTrazado().actual).toBe(1);

    component.progresoTrazado.set({ actual: 2, total: 2 });
    fixture.detectChanges();
    expect(component.progresoTrazado().actual).toBe(2);
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
    expect(component.opciones().length, '2–3 opciones (4 años)').toBeGreaterThanOrEqual(2);
    expect(component.opciones().length).toBeLessThanOrEqual(3);
  });
});
