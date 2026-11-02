import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HanziVocabGame } from './hanzi-vocab-game';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { HANZI_VOCAB_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import { installMemoryStorage } from '@core/testing/memory-storage';
import { HANZI_COLORS, HANZI_VOCAB } from '@core/learning/hanzi-vocab';
import { DUDA_OYE, wordClip } from './hanzi-vocab-narration';
import { poolFor } from './hanzi-vocab-problem';

/**
 * Integración del motor único de vocabulario.
 *
 * La lógica pura ya garantiza problemas válidos. Aquí se comprueba lo que solo se ve
 * montado: que un error no rompa la racha ni reciba veredicto, que cada toque suene una
 * sola vez, que la ronda se anote una vez y que el mismo componente sirva a los tres
 * juegos cambiando solo la ruta.
 */

type Deck = 'colors' | 'animals' | 'listening';

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
  saved: Array<{ level: number; completed: boolean }> = [];
  getLevel = () => this.level;
  saveProgress = (_id: string, p: { level: number; completed: boolean }) => {
    this.level = p.level;
    this.saved.push(p);
  };
  getProgress = (_id: string) => ({ level: this.level });
}

class RouteStub {
  snapshot: { data: { deck: Deck } };
  constructor(public deck: Deck) {
    this.snapshot = { data: { deck } };
  }
}

describe('HanziVocabGame (integración)', () => {
  let fixture: ComponentFixture<HanziVocabGame>;
  let component: HanziVocabGame;
  let profile: ProfileStub;
  let progress: ProgressStub;
  let decir: ReturnType<typeof vi.spyOn>;

  function mount(
    deck: Deck,
    age: 4 | 6,
    level = 1,
    opts: { listeningPool?: readonly string[] } = {},
  ): void {
    profile = new ProfileStub();
    profile.age = age;
    progress = new ProgressStub();
    progress.level = level;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HanziVocabGame],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
        { provide: ActivatedRoute, useValue: new RouteStub(deck) },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(GameAudioService).setEnabled(false);
    const srs = TestBed.inject(SpacedRepetition);
    if (opts.listeningPool) {
      srs.markIntroduced(HANZI_VOCAB_DECK, [...opts.listeningPool]);
    } else if (deck !== 'listening') {
      // Pre-introducir las palabras del pool para evitar la tarjeta de intro en tests.
      const pool = poolFor(deck, level);
      srs.markIntroduced(HANZI_VOCAB_DECK, pool.map(i => i.id));
    }
    // La narración en jsdom no suena y su espera es con reloj real.
    decir = vi.spyOn(TestBed.inject(Narrator), 'say').mockResolvedValue(true);

    fixture = TestBed.createComponent(HanziVocabGame);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  }

  function correcta() {
    return component.palabra()!;
  }

  function incorrecta() {
    return component.opciones().find(o => o.id !== component.palabra()!.id)!;
  }

  /** Deja correr las microtareas de las promesas de narración. */
  async function micros(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  /** Acierta `n` veces seguidas, esperando el avance de ronda de los 4 años. */
  async function acertar(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      component.elegir(correcta());
      fixture.detectChanges();
      await micros();
      if (i < n - 1) {
        vi.advanceTimersByTime(2600);
        fixture.detectChanges();
      }
    }
  }

  /** Genera hasta que salga un modo concreto (para probar perillas de nivel). */
  function hastaModo(modo: 'hear' | 'glyph-to-see' | 'see-to-glyph'): void {
    for (let i = 0; i < 200 && component.modo() !== modo; i++) component.generateProblem();
    expect(component.modo()).toBe(modo);
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
  // JUGAR
  // ============================================

  it('N1 de Colores: se oye la palabra y se eligen 2–3 imágenes', () => {
    mount('colors', 4, 1);

    expect(component.modo(), 'N1 solo escucha').toBe('hear');
    expect(component.palabra()).toBeTruthy();
    expect(component.opciones().length).toBeGreaterThanOrEqual(2);
    expect(component.opciones().length).toBeLessThanOrEqual(3);
    expect(component.opciones().some(o => o.id === component.palabra()!.id)).toBe(true);
    expect(all('.opcion')).toHaveLength(component.opciones().length);
    // A los 4 años no hay una sola palabra escrita.
    expect(fixture.nativeElement.querySelector('.opcion-es')).toBeNull();
  });

  it('a los 6 años las opciones llevan su nombre en español', () => {
    mount('colors', 6, 1);
    expect(all('.opcion-es').length).toBe(component.opciones().length);
  });

  it('acertar cierra la ronda, suma la racha y narra la palabra una sola vez', async () => {
    mount('colors', 4, 1);
    const audio = TestBed.inject(GameAudioService);
    const praise = vi.spyOn(audio, 'playPraise').mockResolvedValue();
    decir.mockClear();

    component.elegir(correcta());
    fixture.detectChanges();
    await micros();

    expect(component.feedbackState()).toBe('success');
    expect(component.consecutiveCorrect()).toBe(1);
    expect(decir, 'una sola llamada por acierto').toHaveBeenCalledTimes(1);
    expect(decir.mock.calls[0]![0]).toContain(wordClip(component.palabra()!.id));
    expect(praise, 'el elogio llega si se oyó y no subió de nivel').toHaveBeenCalledTimes(1);
  });

  it('un error no es veredicto: se atenúa, suena y la racha no se rompe', () => {
    mount('colors', 4, 1);
    const session = TestBed.inject(GameSessionService);
    const incorrecto = vi.spyOn(session, 'recordIncorrect');
    const ayuda = vi.spyOn(session, 'recordHelpUsed');
    decir.mockClear();

    const mala = incorrecta();
    component.elegir(mala);
    fixture.detectChanges();

    expect(component.feedbackState(), 'sin veredicto').toBe('idle');
    expect(component.consecutiveCorrect(), 'la racha sigue').toBe(0);
    expect(component.descartadas().has(mala.id)).toBe(true);
    expect(component.hint()).toBe('👂');
    expect(all('.opcion--no'), 'se atenúa en pantalla').toHaveLength(1);
    expect(incorrecto, 'un toque no es un fallo de sesión').not.toHaveBeenCalled();
    expect(ayuda, 'la duda hablada cuenta como ayuda').toHaveBeenCalledTimes(1);

    // Una sola narración con la palabra tocada y la duda, en ese orden.
    expect(decir).toHaveBeenCalledTimes(1);
    const claves = decir.mock.calls[0]![0] as string[];
    expect(claves).toContain(wordClip(mala.id));
    expect(claves).toContain(DUDA_OYE);
    expect(claves.indexOf(wordClip(mala.id))).toBeLessThan(claves.indexOf(DUDA_OYE));
  });

  it('el primer toque queda registrado: fallar y luego acertar mide "con ayuda"', () => {
    mount('colors', 4, 1);
    const skills = TestBed.inject(SkillProgressService);
    const intentos = vi.spyOn(skills, 'recordAttempt');
    const errores = vi.spyOn(skills, 'recordMistake');
    const srs = TestBed.inject(SpacedRepetition);
    const revisiones = vi.spyOn(srs, 'review');

    const mala = incorrecta();
    component.elegir(mala);
    component.elegir(correcta());
    fixture.detectChanges();

    expect(component.primerIntento(), 'el segundo toque no reescribe el primero').toBe(false);
    expect(intentos, 'un intento por ronda, no por toque').toHaveBeenCalledTimes(1);
    expect(intentos.mock.calls[0]![0].correct).toBe(false);
    expect(errores, 'el mistake es el primer toque').toHaveBeenCalledTimes(1);
    expect(errores.mock.calls[0]![0].answered).toBe(mala.id);
    expect(revisiones, 'el SRS se anota una vez').toHaveBeenCalledTimes(1);
    expect(revisiones.mock.calls[0]![0]).toBe(HANZI_VOCAB_DECK);
    expect(revisiones.mock.calls[0]![1]).toBe(component.palabra()!.id);
    expect(revisiones.mock.calls[0]![2]).toEqual({ correct: false, ayuda: 1 });
  });

  it('un doble toque no suma dos aciertos', async () => {
    mount('colors', 4, 1);
    const session = TestBed.inject(GameSessionService);
    const aciertos = vi.spyOn(session, 'recordCorrect');

    const p = correcta();
    component.elegir(p);
    component.elegir(p);
    fixture.detectChanges();
    await micros();

    expect(aciertos, 'el guard de cierre corta el segundo toque').toHaveBeenCalledTimes(1);
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('tres aciertos suben de nivel a los 4 años y guardan el progreso', async () => {
    mount('colors', 4, 1);
    await acertar(3);

    expect(TestBed.inject(GameSessionService).currentLevel()).toBe(2);
    expect(progress.saved.at(-1)).toEqual({ level: 2, completed: false });
  });

  it('el nivel 10 se puede completar: overlay final y progreso completo', async () => {
    mount('colors', 4, 10);
    await acertar(3);

    expect(component.finished(), 'no se queda clavado en el nivel 10').toBe(true);
    expect(progress.saved.at(-1)).toEqual({ level: 10, completed: true });
    expect(all('.finish'), 'hay salida visible').toHaveLength(1);
  });

  // ============================================
  // PERILLAS DE NIVEL
  // ============================================

  it('el hanzi se tiñe con su color solo como andamio hasta N4', () => {
    mount('colors', 4, 3);
    hastaModo('glyph-to-see');
    expect(component.tinteHanzi()).toBe(component.palabra()!.cssColor);

    mount('colors', 4, 5);
    hastaModo('glyph-to-see');
    expect(component.tinteHanzi(), 'a partir de N5 el color delataría la respuesta').toBeNull();
  });

  it('el audio del glifo suena solo hasta N8; en N9 deja de hacerlo', () => {
    mount('colors', 4, 3);
    hastaModo('glyph-to-see');
    expect(component.autoAudio()).toBe(true);

    mount('colors', 4, 9);
    hastaModo('glyph-to-see');
    expect(component.autoAudio(), 'N9: ancla quitada').toBe(false);
  });

  it('el modo see-to-glyph aparece en N7 y las opciones son hanzis', () => {
    mount('colors', 4, 7);
    hastaModo('see-to-glyph');
    fixture.detectChanges();

    expect(all('.opcion-hanzi')).toHaveLength(component.opciones().length);
    expect(fixture.nativeElement.querySelector('.hanzi-grande')).toBeNull();
    expect(fixture.nativeElement.querySelector('.imagen-grande')).toBeTruthy();
  });

  it('desde N7 la imagen es el cohete pintado con el color de la palabra', () => {
    mount('colors', 4, 7);
    hastaModo('see-to-glyph');
    fixture.detectChanges();

    const cohete = fixture.nativeElement.querySelector(
      '.imagen-grande paintable-rocket',
    ) as HTMLElement | null;
    expect(cohete, 'el emoji se sustituye por el cohete').toBeTruthy();
    const svg = cohete!.querySelector('svg') as SVGSVGElement;
    expect(svg.style.getPropertyValue('--c').trim()).toBe(component.palabra()!.cssColor);
  });

  it('antes de N7 sigue el emoji: el cohete es un premio, no un requisito', () => {
    mount('colors', 4, 6);
    expect(component.usaCohete()).toBe(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('paintable-rocket')).toBeNull();
  });

  // ============================================
  // REFLEXIÓN (6 años)
  // ============================================

  it('a los 6 años, tras un acierto aparece la reflexión y cada botón hace lo que dice', async () => {
    mount('colors', 6, 3);
    const antes = component.palabra()!.id;

    component.elegir(correcta());
    fixture.detectChanges();
    await micros();
    vi.advanceTimersByTime(1600);
    fixture.detectChanges();

    expect(component.reflecting()).toBe(true);
    expect(fixture.nativeElement.querySelector('.reflexion')).toBeTruthy();

    component.chooseReflection('repaso');
    fixture.detectChanges();
    expect(component.reflecting()).toBe(false);
    expect(component.palabra()!.id, '"La misma" repite la palabra').toBe(antes);
  });

  it('"Otra palabra" cambia de palabra y "Con audio" enciende el ancla', async () => {
    mount('colors', 6, 3);
    const antes = component.palabra()!.id;

    component.elegir(correcta());
    fixture.detectChanges();
    await micros();
    vi.advanceTimersByTime(1600);
    component.chooseReflection('nuevo');
    fixture.detectChanges();
    expect(component.palabra()!.id, '"Otra palabra" no repite la de hoy').not.toBe(antes);

    component.elegir(correcta());
    fixture.detectChanges();
    await micros();
    vi.advanceTimersByTime(1600);
    component.chooseReflection('ancla');
    fixture.detectChanges();
    expect(component.autoAudio(), '"Con audio" entra sonando').toBe(true);
  });

  it('a los 4 años no hay reflexión: el juego sigue solo', async () => {
    mount('colors', 4, 1);
    component.elegir(correcta());
    fixture.detectChanges();
    await micros();

    vi.advanceTimersByTime(1600);
    fixture.detectChanges();
    expect(component.reflecting()).toBe(false);

    vi.advanceTimersByTime(1200);
    fixture.detectChanges();
    expect(component.feedbackState()).toBe('idle');
  });

  // ============================================
  // ¿QUÉ ESCUCHASTE? · UN COMPONENTE, OTRO MAZO
  // ============================================

  it('el mismo componente sirve a Animales: la ruta cambia el mazo', () => {
    mount('animals', 4, 1);
    expect(component.GAME_ID).toBe('hanzi-animals');
    expect(HANZI_VOCAB.some(i => i.id === component.palabra()!.id && i.deck === 'animals')).toBe(true);
    expect(['mao', 'gou', 'yu']).toContain(component.palabra()!.id);
  });

  it('¿Qué escuchaste? solo usa palabras ya presentadas', () => {
    const presentadas = ['hong', 'mao', 'lan', 'gou', 'lv'];
    mount('listening', 4, 1, { listeningPool: presentadas });

    for (let i = 0; i < 40; i++) {
      component.generateProblem();
      expect(presentadas, `palabra ${component.palabra()!.id}`).toContain(component.palabra()!.id);
      for (const o of component.opciones()) {
        expect(presentadas, `opción ${o.id}`).toContain(o.id);
      }
    }
  });

  it('sin memoria previa, el juego de escucha siembra un pool mínimo en vez de romperse', () => {
    mount('listening', 4, 1);
    const sembradas = HANZI_COLORS.slice(0, 3).map(i => i.id);
    for (let i = 0; i < 20; i++) {
      component.generateProblem();
      expect(sembradas).toContain(component.palabra()!.id);
    }
  });

  // ============================================
  // CICLO DE VIDA
  // ============================================

  it('las opciones descartadas se limpian al cambiar de problema', () => {
    mount('colors', 4, 1);
    component.elegir(incorrecta());
    fixture.detectChanges();
    expect(component.descartadas().size).toBe(1);

    component.generateProblem();
    fixture.detectChanges();
    expect(component.descartadas().size).toBe(0);
    expect(component.hint()).toBe('');
  });

  it('el botón de repetir vuelve a decir la palabra', () => {
    mount('colors', 4, 1);
    decir.mockClear();
    component.repeatWord();
    expect(decir).toHaveBeenCalledTimes(1);
    expect(decir.mock.calls[0]![0]).toEqual([wordClip(component.palabra()!.id)]);
  });
});
