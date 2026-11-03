import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { HanziSentenceGame } from './hanzi-sentence-game';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { Narrator } from '@core/games/narrator.service';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { HANZI_SENTENCE_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import { installMemoryStorage } from '@core/testing/memory-storage';
import { sentenceDeck, type SentenceToken } from '@core/learning/sentence-builder';
import { ASK, promptClip, sayClip } from './hanzi-sentence-narration';

/**
 * Integración del prototipo chino de frases.
 *
 * La lógica pura ya garantiza problemas válidos. Aquí se comprueba lo que solo se ve
 * montado: que a los 4 no haya español visible, que un orden equivocado no dé veredicto,
 * que la ficha se pueda devolver y que la ronda se anote una sola vez.
 */

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
  snapshot = { data: { language: 'zh' } };
}

describe('HanziSentenceGame (integración)', () => {
  let fixture: ComponentFixture<HanziSentenceGame>;
  let component: HanziSentenceGame;
  let profile: ProfileStub;
  let progress: ProgressStub;
  let decir: ReturnType<typeof vi.spyOn>;
  let skills: SkillProgressService;
  let srs: SpacedRepetition;
  let attempt: ReturnType<typeof vi.spyOn>;
  let mistake: ReturnType<typeof vi.spyOn>;
  let review: ReturnType<typeof vi.spyOn>;

  function mount(age: 4 | 6, level = 1): void {
    profile = new ProfileStub();
    profile.age = age;
    progress = new ProgressStub();
    progress.level = level;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [HanziSentenceGame],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
        { provide: ActivatedRoute, useValue: new RouteStub() },
        { provide: Router, useValue: { navigate: vi.fn() } },
      ],
    });
    TestBed.inject(GameAudioService).setEnabled(false);
    decir = vi.spyOn(TestBed.inject(Narrator), 'say').mockResolvedValue(true);
    skills = TestBed.inject(SkillProgressService);
    srs = TestBed.inject(SpacedRepetition);
    attempt = vi.spyOn(skills, 'recordAttempt');
    mistake = vi.spyOn(skills, 'recordMistake');
    review = vi.spyOn(srs, 'review');

    fixture = TestBed.createComponent(HanziSentenceGame);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function all(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  }

  function target(): readonly SentenceToken[] {
    return component.problem()!.target;
  }

  async function micros(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  /** Coloca una secuencia y deja que salte la comprobación automática. */
  async function colocar(tokens: readonly SentenceToken[]): Promise<void> {
    for (const token of tokens) component.place(token);
    fixture.detectChanges();
    vi.advanceTimersByTime(400);
    fixture.detectChanges();
    await micros();
  }

  async function acertar(n: number): Promise<void> {
    for (let i = 0; i < n; i++) {
      await colocar(target());
      if (i < n - 1) {
        vi.advanceTimersByTime(2700);
        fixture.detectChanges();
      }
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
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  // ============================================
  // LO QUE SE VE
  // ============================================

  it('a los 4 años no hay una sola palabra en español visible', () => {
    mount(4, 1);

    expect(component.isSix()).toBe(false);
    expect(fixture.nativeElement.querySelector('.prompt-texto')).toBeNull();
    expect(fixture.nativeElement.querySelector('.prompt .speaker')).toBeTruthy();
    // El dibujo y las fichas sí están.
    expect(fixture.nativeElement.querySelector('.prompt-emoji')).toBeTruthy();
    expect(all('.slot')).toHaveLength(target().length);
    expect(all('.token')).toHaveLength(component.tray().length);
    // A los 4 se oye la consigna y la frase que hay que construir.
    expect(decir).toHaveBeenCalledWith([ASK, promptClip(component.frame()!.id)]);
  });

  it('a los 6 años se lee la frase en español y no hay botón de escucha en el prompt', () => {
    mount(6, 1);

    expect(component.isSix()).toBe(true);
    expect(fixture.nativeElement.querySelector('.prompt-texto')?.textContent).toContain(component.prompt());
    expect(fixture.nativeElement.querySelector('.prompt .speaker')).toBeNull();
  });

  it('N1 tiene dos frases posibles y tres casillas', () => {
    mount(4, 1);
    expect(component.problem()!.target.length).toBe(3);
    expect(['zh-wo-he-shui', 'zh-wo-chi-fan']).toContain(component.frame()!.id);
    expect(component.tray().length).toBe(3);
  });

  it('el encabezado repite la frase que se pide', () => {
    mount(4, 1);
    decir.mockClear();
    component.repeatPrompt();
    expect(decir).toHaveBeenLastCalledWith([promptClip(component.frame()!.id)]);
  });

  // ============================================
  // CONSTRUIR
  // ============================================

  it('colocar las fichas en orden acierta y anota una sola vez', async () => {
    mount(4, 1);
    const frame = component.frame()!;

    await colocar(target());

    expect(component.solved()).toBe(true);
    expect(component.feedbackState()).toBe('success');
    expect(attempt).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith(
      expect.objectContaining({
        skillId: 'chinese.sentences.build',
        contentId: frame.id,
        correct: true,
      }),
    );
    expect(review).toHaveBeenCalledWith(HANZI_SENTENCE_DECK, frame.id, { correct: true, ayuda: 0 });
    expect(decir).toHaveBeenCalledWith([sayClip(frame.id)]);

    // Una segunda comprobación no duplica la ronda.
    component.comprobar();
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('un orden equivocado no da veredicto y se puede corregir', async () => {
    mount(4, 1);
    const frame = component.frame()!;
    const alReves = [...target()].reverse();

    await colocar(alReves);

    expect(component.feedbackState()).toBe('idle');
    expect(component.solved()).toBe(false);
    expect(component.primerIntento()).toBe(false);
    expect(component.hint()).not.toBe('');
    expect(attempt).not.toHaveBeenCalled();
    expect(mistake).not.toHaveBeenCalled();

    // Quita las tres fichas y vuelve a ponerlas bien.
    for (let i = 0; i < alReves.length; i++) component.removeAt(i);
    fixture.detectChanges();
    expect(component.tray().length).toBe(component.problem()!.tray.length);

    await colocar(target());

    expect(component.solved()).toBe(true);
    expect(attempt).toHaveBeenCalledWith(
      expect.objectContaining({ contentId: frame.id, correct: false }),
    );
    expect(mistake).toHaveBeenCalledWith(
      expect.objectContaining({ contentId: frame.id, mistakeType: 'orden' }),
    );
    expect(review).toHaveBeenCalledWith(HANZI_SENTENCE_DECK, frame.id, { correct: false, ayuda: 1 });
  });

  it('una ficha colocada se puede devolver a la bandeja', () => {
    mount(4, 1);
    const token = target()[0]!;
    const antes = component.tray().length;

    component.place(token);
    fixture.detectChanges();
    expect(component.tray().length).toBe(antes - 1);
    expect(all('.slot--lleno')).toHaveLength(1);

    component.removeAt(0);
    fixture.detectChanges();
    expect(component.tray().length).toBe(antes);
    expect(all('.slot--lleno')).toHaveLength(0);
  });

  it('repetir el prompt cuenta como ayuda una sola vez', () => {
    mount(6, 1);
    const help = vi.spyOn(TestBed.inject(GameSessionService), 'recordHelpUsed');

    component.repeatPrompt();
    component.repeatPrompt();

    expect(help).toHaveBeenCalledTimes(1);
  });

  // ============================================
  // NIVELES Y FIN
  // ============================================

  it('tres aciertos seguidos suben de nivel y guardan el progreso', async () => {
    mount(4, 1);

    await acertar(3);

    expect(TestBed.inject(GameSessionService).currentLevel()).toBe(2);
    expect(progress.saved.at(-1)).toEqual({ level: 2, completed: false });
  });

  it('en N10, tres aciertos completan el juego', async () => {
    mount(4, 10);

    await acertar(3);

    expect(component.finished()).toBe(true);
    expect(progress.saved.at(-1)).toEqual({ level: 10, completed: true });
  });

  it('a los 6 años, tras acertar aparece la reflexión', async () => {
    mount(6, 1);

    await colocar(target());
    vi.advanceTimersByTime(1700);
    fixture.detectChanges();

    expect(component.reflecting()).toBe(true);
  });

  it('la reflexión "repaso" mantiene la misma frase', async () => {
    mount(6, 3);
    const id = component.frame()!.id;

    await colocar(target());
    vi.advanceTimersByTime(1700);
    component.chooseReflection('repaso');

    expect(component.frame()!.id).toBe(id);
    expect(component.problem()!.target.map(t => t.id)).toEqual(sentenceDeck('zh').frames.find(f => f.id === id)!.tokens);
  });

  it('el id de juego y el nivel máximo vienen del catálogo', () => {
    mount(4, 1);
    expect(component.GAME_ID).toBe('hanzi-sentences');
    expect(component.MAX_LEVEL).toBe(10);
    expect(component.deck.language).toBe('zh');
  });
});
