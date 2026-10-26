import { describe, it, expect, beforeEach, afterEach, vi, type MockInstance } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { HanziNumbers } from './hanzi-numbers';
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
    expect(component.objetivo()).toBeGreaterThanOrEqual(11);
    expect(component.bandeja().length).toBeGreaterThanOrEqual(4);
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

  it('un orden que no se lee deja la duda de los dieces y no avanza', () => {
    mount(6, 7);
    const bandeja = component.bandeja();

    // Dos piezas sin ningún 十 no pueden formar una lectura: 一二 no es un número.
    // Es la forma más limpia de fabricar un montaje que "todavía no se sostiene".
    const unidades = bandeja.map((p, i) => ({ p, i })).filter(x => x.p !== '十');
    expect(unidades.length, 'la bandeja siempre trae unidades de sobra').toBeGreaterThanOrEqual(2);
    component.agarrar(unidades[0]!.i);
    component.agarrar(unidades[1]!.i);
    fixture.detectChanges();

    expect(component.leido(), 'dos piezas sin 十 no se leen').toBeNull();
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
