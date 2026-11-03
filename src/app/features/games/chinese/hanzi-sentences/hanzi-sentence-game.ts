import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { Narrator } from '@core/games/narrator.service';
import { FirstAttemptGuard } from '@core/learning/first-attempt-guard';
import { RoundTracker } from '@core/games/round-tracker';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { HANZI_SENTENCE_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import {
  buildSentenceProblem,
  checkSentenceOrder,
  sentenceDeck,
  sentenceKnobFor,
  sentencePool,
  sentenceText,
  SENTENCE_MAX_LEVEL,
  type SentenceFrame,
  type SentenceLanguage,
  type SentenceProblem,
  type SentenceToken,
} from '@core/learning/sentence-builder';
import type { RepresentationType } from '@core/learning/learning-content';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { gameMaxLevel } from '@core/models/game-catalog';
import {
  ASK,
  CLIP_BASE,
  CLIP_EXT,
  CLIP_MANIFEST,
  DUDA,
  promptClip,
  sayClip,
  wordClip,
} from './hanzi-sentence-narration';

const SENTENCE_GAME_ID = 'hanzi-sentences';
const SENTENCE_SKILL_ID = 'chinese.sentences.build';

/**
 * Frases Hanzi — prototipo chino del modelo multiidioma.
 *
 * La niña ve un dibujo (y, a los 6, la frase en español), y ordena fichas Hanzi para
 * construirla. El orden es exacto: 我喝水 sí, 水我喝 no.
 *
 * DECISIONES
 *  - No se muestra pinyin ni la traducción china. A los 4 años la frase se **oye**; a
 *    los 6 se lee en español.
 *  - Tocar una ficha la pronuncia. Un orden equivocado no da veredicto: se puede quitar
 *    una ficha y volver a probar. La racha no se rompe.
 *  - La unidad del SRS es la frase, no la ficha.
 *  - El motor (`sentence-builder`) es el mismo para chino, japonés e inglés.
 */
@Component({
  selector: 'hanzi-sentence-game',
  imports: [GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './hanzi-sentence-game.html',
  styleUrl: './hanzi-sentence-game.scss',
})
export class HanziSentenceGame implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly profileState = inject(ProfileStateService);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly narrator = inject(Narrator);
  private readonly skills = inject(SkillProgressService);
  private readonly srs = inject(SpacedRepetition);

  readonly activeProfile = this.profileState.activeProfile;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  readonly language = (this.route.snapshot.data['language'] ?? 'zh') as SentenceLanguage;
  readonly deck = sentenceDeck(this.language);
  readonly GAME_ID = SENTENCE_GAME_ID;
  readonly MAX_LEVEL = gameMaxLevel(SENTENCE_GAME_ID);
  readonly deckIcon = '🧩';
  readonly isSix = computed(() => (this.activeProfile()?.age ?? 4) >= 6);
  readonly requiredCorrect = this.isSix() ? 4 : 3;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  readonly currentLevel = this.session.currentLevel;
  readonly displayLevel = computed(() => Math.min(this.currentLevel(), this.MAX_LEVEL));
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // ============================================
  // PROBLEMA
  // ============================================

  readonly frame = signal<SentenceFrame | null>(null);
  readonly problem = signal<SentenceProblem | null>(null);
  /** Una casilla por ficha; `null` = casilla vacía. */
  readonly placed = signal<readonly (SentenceToken | null)[]>([]);
  readonly tray = signal<readonly SentenceToken[]>([]);
  readonly prompt = signal('');
  readonly autoAudio = signal(false);
  /** `null` hasta la primera comprobación; luego acierto/error de esa frase. */
  readonly primerIntento = signal<boolean | null>(null);
  readonly problemaId = signal(0);
  /** Pista visual: un icono, nunca una frase que juzgue. */
  readonly hint = signal('');
  readonly solved = computed(() => this.feedbackState() === 'success');

  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  // ============================================
  // REFLEXIÓN (6 años)
  // ============================================

  readonly reflecting = signal(false);
  readonly reflexiones = [
    { que: 'nuevo' as const, emoji: '🧠', text: 'Otra frase', aria: 'Sacar una frase que no haya salido hoy' },
    { que: 'repaso' as const, emoji: '🖐️', text: 'La misma', aria: 'La misma frase otra vez' },
    { que: 'ancla' as const, emoji: '👂', text: 'Con audio', aria: 'Que la frase se oiga al entrar' },
  ];

  // ============================================
  // FIN DEL JUEGO
  // ============================================

  readonly finished = signal(false);

  // ============================================
  // DERIVADOS
  // ============================================

  readonly feedbackState = computed<FeedbackState>(() => {
    const s = this.session.state();
    if (s?.isCompleted || s?.isTimeUp) return 'game-over';
    return this.localFeedback();
  });

  readonly mood = computed(() => {
    if (this.solved()) return '🤩';
    if (this.feedbackState() === 'game-over') return '🌙';
    return '🙂';
  });

  readonly customFeedbackMessages: Record<string, string[]> = {
    success: ['🌟', '🥳'],
    'level-up': ['🏆', '🎉'],
    'game-over': ['🌙', '👋'],
  };

  readonly hayHueco = computed(() => this.placed().some(t => t === null));

  // ============================================
  // ESTADO INTERNO
  // ============================================

  private readonly timers = new Set<number>();
  private checkTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private unsubscribeEvents?: () => void;
  private readonly firstAttempt = new FirstAttemptGuard();
  private problemaActual: object = {};
  private readonly round = new RoundTracker();
  private dudaDicha = false;
  private ordenErrado: string | null = null;
  private rondaEmpezadaEn = Date.now();
  private readonly vistosHoy = new Set<string>();
  private modoReflexion: 'nuevo' | 'repaso' | 'ancla' | null = null;
  private anclaPedida = false;
  private _ultimaNarracion: string[] = [];

  ngOnInit(): void {
    this.narrator.configure({ base: CLIP_BASE, ext: CLIP_EXT, manifest: CLIP_MANIFEST });
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
    ]);
    this.iniciarPartida();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.clearCheckTimer();
    this.unsubscribeEvents?.();
    this.narrator.cancel();
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* sin voz */
    }
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private iniciarPartida(level?: number): void {
    const guardado = level ?? this.progress.getLevel(this.GAME_ID);
    this.session.startSession(
      {
        gameId: this.GAME_ID,
        sessionDurationMs: 5 * 60 * 1000,
        requiredCorrectForLevelUp: this.requiredCorrect,
        maxLevel: this.MAX_LEVEL + 1,
        initialLevel: Math.min(guardado, this.MAX_LEVEL),
      },
      this.activeProfile()?.age,
    );

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateProblem();
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type !== 'level-up') return;
    this.audio.playLevelUp();
    this.triggerConfetti();
    if (event.payload?.['isMaxLevel']) {
      this.finished.set(true);
      return;
    }
    this.later(() => {
      if (!this.isOver()) this.generateProblem();
    }, 2500);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    this.clearCheckTimer();

    this.hint.set('');
    this.localFeedback.set('idle');
    this.busyFreed(false);
    this.reflecting.set(false);
    this.round.reset();
    this.dudaDicha = false;
    this.ordenErrado = null;
    this.problemaActual = {};
    this.primerIntento.set(null);
    this.problemaId.update(n => n + 1);

    const level = Math.min(this.currentLevel(), SENTENCE_MAX_LEVEL);
    const age = this.activeProfile()?.age === 6 ? 6 : 4;
    const modo = this.modoReflexion;
    this.modoReflexion = null;
    this.anclaPedida = modo === 'ancla';

    const pool = sentencePool(this.language, level);
    const poolIds = pool.map(f => f.id);

    let forced: string | undefined;
    if (modo === 'repaso' && this.frame()) {
      forced = this.frame()!.id;
    } else if (sentenceKnobFor(level).reviewFirst) {
      forced = this.srs.due(HANZI_SENTENCE_DECK).find(id => poolIds.includes(id));
    }

    const anterior = this.frame()?.id;
    let p = buildSentenceProblem(this.language, level, age, Math.random, {
      forced,
      avoidId: anterior,
      promptLang: 'es',
    });

    // "Otra frase": reintenta hasta que no haya salido hoy.
    if (modo === 'nuevo') {
      for (let i = 0; i < 30 && this.vistosHoy.has(p.frame.id); i++) {
        p = buildSentenceProblem(this.language, level, age, Math.random, {
          avoidId: p.frame.id,
          promptLang: 'es',
        });
      }
    }

    this.problem.set(p);
    this.frame.set(p.frame);
    this.prompt.set(p.prompt);
    this.tray.set(p.tray);
    this.placed.set(Array.from({ length: p.target.length }, () => null));
    this.autoAudio.set(p.autoAudio || this.anclaPedida);
    this.rondaEmpezadaEn = Date.now();
    this.vistosHoy.add(p.frame.id);

    void this.narrar(this.autoAudio() ? [ASK, promptClip(p.frame.id)] : [ASK]);
  }

  // ============================================
  // TOQUES
  // ============================================

  place(token: SentenceToken): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    const p = this.problem();
    if (!p) return;

    const hueco = this.placed().findIndex(t => t === null);
    if (hueco < 0) return;
    if (!this.tray().some(t => t.id === token.id)) return;

    this.tray.update(t => {
      const i = t.findIndex(x => x.id === token.id);
      return i < 0 ? t : [...t.slice(0, i), ...t.slice(i + 1)];
    });
    this.placed.update(slots => {
      const next = [...slots];
      next[hueco] = token;
      return next;
    });

    // Al colocar la última ficha, se deja terminar su audio antes de comprobar.
    if (!this.hayHueco()) {
      this.clearCheckTimer();
      this.checkTimer = setTimeout(() => {
        this.checkTimer = null;
        if (!this.destroyed) this.comprobar();
      }, 360);
    }

    void this.narrar(wordClip(token.id));
  }

  removeAt(index: number): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    const token = this.placed()[index];
    if (!token) return;

    this.clearCheckTimer();
    this.placed.update(slots => {
      const next = [...slots];
      next[index] = null;
      return next;
    });
    this.tray.update(t => [...t, token]);
  }

  /** Comprueba el orden exacto. Se llama sola al llenar la última casilla. */
  comprobar(): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    const p = this.problem();
    const f = this.frame();
    if (!p || !f) return;
    if (this.hayHueco()) return;

    const placedIds = this.placed()
      .filter((t): t is SentenceToken => !!t)
      .map(t => t.id);
    const check = checkSentenceOrder(f, placedIds);
    const primera = this.firstAttempt.isFirst(this.problemaActual);
    if (primera) this.primerIntento.set(check.correct);

    if (check.correct) {
      this.finishProblem();
      return;
    }

    if (primera) this.round.markWrong();
    this.ordenErrado = placedIds.join(' ');
    this.hint.set(check.firstWrongIndex === 0 ? '🔊' : '🧩');

    // Una sola duda por frase: ayuda a mirar, no señala la ficha mala.
    if (!this.dudaDicha) {
      this.dudaDicha = true;
      void this.narrar(DUDA);
    }
  }

  /** Repite la frase que se pide (español). */
  repeatPrompt(): void {
    const f = this.frame();
    if (!f) return;
    this.marcarAyuda();
    void this.narrar(promptClip(f.id));
  }

  /** Repite la última narración completa. */
  repeatLast(): void {
    if (this._ultimaNarracion.length > 0) void this.narrator.say(this._ultimaNarracion);
  }

  private marcarAyuda(): void {
    if (this.dudaDicha) return;
    this.dudaDicha = true;
    this.round.markHelp();
    this.session.recordHelpUsed();
  }

  // ============================================
  // CIERRE DE RONDA
  // ============================================

  private finishProblem(): void {
    if (this.busy()) return;
    const p = this.problem();
    const f = this.frame();
    if (!p || !f) return;

    this.busyFreed(true);
    this.localFeedback.set('success');
    this.hint.set('');

    const primera = this.primerIntento() === true;
    const snapshot = this.round.snapshot();
    this.anotarRonda(f, primera);

    const narra = this.narrar(sayClip(f.id));
    const result = this.session.recordCorrect({
      firstTry: snapshot.firstTry,
      perfectRound: snapshot.perfectRound,
    });

    void narra.then(oido => {
      if (oido && !result.leveledUp) void this.audio.playPraise();
    });

    if (result.leveledUp) {
      this.progress.saveProgress(this.GAME_ID, {
        level: Math.min(result.newLevel, this.MAX_LEVEL),
        completed: result.newLevel > this.MAX_LEVEL,
      });
      return;
    }

    if (this.isSix()) {
      this.later(() => {
        if (!this.isOver()) this.reflecting.set(true);
      }, 1600);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2600);
    }
  }

  private anotarRonda(frame: SentenceFrame, primera: boolean): void {
    const profile = this.activeProfile();
    if (!profile) return;

    const representation: RepresentationType = this.isSix() ? 'kanji' : 'audio';
    this.skills.recordAttempt({
      skillId: SENTENCE_SKILL_ID,
      contentId: frame.id,
      correct: primera,
      responseTimeMs: Date.now() - this.rondaEmpezadaEn,
      difficulty: this.currentLevel(),
      representation,
      timestamp: Date.now(),
      profileAge: profile.age,
      profileId: profile.id,
    });

    if (!primera) {
      this.skills.recordMistake({
        skillId: SENTENCE_SKILL_ID,
        contentId: frame.id,
        expected: sentenceText(this.deck, frame),
        answered: this.ordenErrado ?? '',
        mistakeType: 'orden',
        representation,
        timestamp: Date.now(),
        profileId: profile.id,
      });
    }

    this.srs.review(HANZI_SENTENCE_DECK, frame.id, {
      correct: primera,
      ayuda: this.dudaDicha ? 1 : 0,
    });
  }

  // ============================================
  // VISTA
  // ============================================

  chooseReflection(que: 'nuevo' | 'repaso' | 'ancla'): void {
    if (this.isOver()) return;
    this.modoReflexion = que;
    this.generateProblem();
  }

  playAgain(): void {
    this.finished.set(false);
    this.session.startSession(
      {
        gameId: this.GAME_ID,
        sessionDurationMs: 5 * 60 * 1000,
        requiredCorrectForLevelUp: this.requiredCorrect,
        maxLevel: this.MAX_LEVEL + 1,
        initialLevel: this.MAX_LEVEL,
      },
      this.activeProfile()?.age,
    );
    this.generateProblem();
  }

  goBack(): void {
    this.narrator.cancel();
    this.session.endSession('user-exit');
    void this.router.navigate(['/games/chinese']);
  }

  // ============================================
  // INFRAESTRUCTURA
  // ============================================

  private readonly busySignal = signal(false);
  readonly busy = this.busySignal.asReadonly();

  private busyFreed(valor = false): void {
    this.busySignal.set(valor);
  }

  private narrar(keys: string | string[] | null): Promise<boolean> {
    if (!keys) return Promise.resolve(false);
    const lista = Array.isArray(keys) ? keys : [keys];
    this._ultimaNarracion = lista;
    return this.narrator.say(lista);
  }

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
  }

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch {
      /* noop */
    }
  }

  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this.timers.delete(id);
      if (!this.destroyed) fn();
    }, ms);
    this.timers.add(id);
  }

  private clearTimers(): void {
    this.timers.forEach(id => clearTimeout(id));
    this.timers.clear();
  }

  private clearCheckTimer(): void {
    if (this.checkTimer !== null) {
      clearTimeout(this.checkTimer);
      this.checkTimer = null;
    }
  }
}
