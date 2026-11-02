import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { Narrator } from '@core/games/narrator.service';
import { FirstAttemptGuard } from '@core/learning/first-attempt-guard';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { HANZI_VOCAB_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import { HANZI_COLORS, HANZI_VOCAB, type HanziDeck, type HanziVocabItem } from '@core/learning/hanzi-vocab';
import type { RepresentationType } from '@core/learning/learning-content';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { PaintableRocket } from '@shared/game-ui/paintable-rocket/paintable-rocket';
import { RoundTracker } from '@core/games/round-tracker';
import { gameMaxLevel } from '@core/models/game-catalog';
import { CLIP_BASE, CLIP_EXT, CLIP_MANIFEST, DUDA_OYE, MODE_CLIP, wordClip } from './hanzi-vocab-narration';
import {
  MAX_LEVEL as VOCAB_MAX_LEVEL,
  buildVocabProblem,
  knobFor,
  type VocabMode,
} from './hanzi-vocab-problem';

/** El juego que toca según la ruta. */
const GAME_BY_DECK: Record<HanziDeck | 'listening', string> = {
  colors: 'hanzi-colors',
  animals: 'hanzi-animals',
  listening: 'hanzi-listening',
};

/** Skill del catálogo que se anota en cada juego. */
const SKILL_BY_DECK: Record<HanziDeck | 'listening', string> = {
  colors: 'chinese.vocab.colors',
  animals: 'chinese.vocab.animals',
  listening: 'chinese.listening',
};

const DECK_ICON: Record<HanziDeck | 'listening', string> = {
  colors: '🎨',
  animals: '🐲',
  listening: '👂',
};

/**
 * Vocabulario Hanzi — un solo componente para Colores, Animales y ¿Qué escuchaste?.
 *
 * El juego se configura desde `route.data.deck`; no hay tres copias. Lo que cambia es el
 * mazo (`HanziVocabItem`), el pool y la skill que se anota.
 *
 * LO QUE LA NIÑA HACE
 *  - `hear`: oye una palabra y toca su imagen.
 *  - `glyph-to-see`: ve un hanzi y toca su imagen.
 *  - `see-to-glyph`: ve una imagen y toca su hanzi.
 *
 * Tocar una opción SIEMPRE la pronuncia, acierte o no. Es la estrategia socrática de
 * `hanzi-numbers`: el error no es silencioso, pero tampoco recibe un veredicto. La opción
 * descartada se atenúa y la ronda sigue; la racha no se rompe.
 *
 * El SRS guarda un recuerdo por palabra. El juego de escucha solo pregunta palabras ya
 * presentadas: nunca se pide ni se usa de distractor algo desconocido.
 */
@Component({
  selector: 'hanzi-vocab-game',
  imports: [GameFeedbackComponent, GameRestOverlayComponent, PaintableRocket],
  templateUrl: './hanzi-vocab-game.html',
  styleUrl: './hanzi-vocab-game.scss',
})
export class HanziVocabGame implements OnInit, OnDestroy {
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
  // CONFIGURACIÓN (por ruta)
  // ============================================

  readonly deck = (this.route.snapshot.data['deck'] ?? 'colors') as HanziDeck | 'listening';
  readonly GAME_ID = GAME_BY_DECK[this.deck];
  readonly MAX_LEVEL = gameMaxLevel(this.GAME_ID);
  readonly deckIcon = DECK_ICON[this.deck];
  readonly isSix = computed(() => (this.activeProfile()?.age ?? 4) >= 6);
  readonly requiredCorrect = this.isSix() ? 4 : 3;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  readonly currentLevel = this.session.currentLevel;
  /** Nivel que se ve: al completar, la sesión sube a MAX+1 para poder cerrar. */
  readonly displayLevel = computed(() => Math.min(this.currentLevel(), this.MAX_LEVEL));
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // ============================================
  // PROBLEMA
  // ============================================

  readonly palabra = signal<HanziVocabItem | null>(null);
  readonly modo = signal<VocabMode>('hear');
  readonly opciones = signal<HanziVocabItem[]>([]);
  readonly autoAudio = signal(false);
  /** Opciones ya tocadas: se atenúan sin veredicto. */
  readonly descartadas = signal<ReadonlySet<string>>(new Set());
  /** Primer toque del problema: `null` mientras no haya tocado nada. */
  readonly primerIntento = signal<boolean | null>(null);
  /** Cambia en cada problema y va en el `track` de las opciones. */
  readonly problemaId = signal(0);
  /** Pista visual: un icono, nunca una frase que juzgue. */
  readonly hint = signal('');

  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  // ============================================
  // REFLEXIÓN (6 años)
  // ============================================

  readonly reflecting = signal(false);
  readonly reflexiones = [
    { que: 'nuevo' as const, emoji: '🧠', text: 'Otra palabra', aria: 'Sacar una palabra que no haya salido' },
    { que: 'repaso' as const, emoji: '🖐️', text: 'La misma', aria: 'La misma palabra otra vez' },
    { que: 'ancla' as const, emoji: '👂', text: 'Con audio', aria: 'Que el audio te acompañe al entrar' },
  ];

  // ============================================
  // FIN DE JUEGO
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

  readonly solved = computed(() => this.feedbackState() === 'success');

  /** Cara de ánimo para los 4 años, que no leen el banner. */
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

  /** El hanzi va teñido con su color solo como andamio (Colores N1–N4, glyph-to-see). */
  readonly tinteHanzi = computed(() => {
    const p = this.palabra();
    if (!p || this.deck !== 'colors' || this.modo() !== 'glyph-to-see') return null;
    return this.displayLevel() <= 4 ? p.cssColor ?? null : null;
  });

  /**
   * Desde el N7 de Colores, la imagen es el cohete pintado con el color de la palabra.
   * Antes de N7 se usa el emoji: el cohete es un premio visual, no un requisito para jugar.
   */
  readonly usaCohete = computed(
    () => this.deck === 'colors' && this.displayLevel() >= 7,
  );

  // ============================================
  // ESTADO INTERNO
  // ============================================

  private readonly timers = new Set<number>();
  private destroyed = false;
  private unsubscribeEvents?: () => void;
  private readonly firstAttempt = new FirstAttemptGuard();
  /** Objeto nuevo por problema: así el guard distingue un problema de otro. */
  private problemaActual: object = {};
  private readonly round = new RoundTracker();
  private dudaDicha = false;
  private primerToqueErrado: string | null = null;
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

    // Sin diagnóstico en v1: se arranca en el nivel guardado.
    this.iniciarPartida();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.unsubscribeEvents?.();
    // ⚠️ `narrator.cancel()` ANTES de `audio.dispose()`.
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
        // +1 para que el nivel 10 se pueda COMPLETAR: con `maxLevel: 10` la sesión no
        // sube del 10 y el juego se queda sin final (mismo arreglo que logic-blocks).
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
    this.hint.set('');
    this.localFeedback.set('idle');
    this.busyFreed();
    this.reflecting.set(false);
    this.round.reset();
    this.dudaDicha = false;
    this.primerToqueErrado = null;
    this.problemaActual = {};
    this.primerIntento.set(null);
    this.descartadas.set(new Set());
    this.problemaId.update(n => n + 1);

    const level = Math.min(this.currentLevel(), VOCAB_MAX_LEVEL);
    const age = this.activeProfile()?.age ?? 4;
    const modo = this.modoReflexion;
    this.modoReflexion = null;
    this.anclaPedida = modo === 'ancla';

    const poolIds = this.deck === 'listening' ? this.listeningPoolIds() : undefined;

    // Repaso: primero lo que pidió la reflexión; luego, en N10, los vencidos del SRS.
    let forced: string | undefined;
    if (modo === 'repaso' && this.palabra()) {
      forced = this.palabra()!.id;
    } else if (knobFor(this.deck, level).reviewFirst) {
      forced = this.srs
        .due(HANZI_VOCAB_DECK)
        .find(id => !poolIds || poolIds.includes(id));
    }

    const anterior = this.palabra()?.id;
    let problema = this.construir(level, age, poolIds, forced, anterior);

    // "Otra palabra": si salió una que ya se vio hoy, se reintenta sin salir del pool.
    if (modo === 'nuevo') {
      for (let i = 0; i < 30 && this.vistosHoy.has(problema.item.id); i++) {
        problema = this.construir(level, age, poolIds, undefined, problema.item.id);
      }
    }

    const p = problema;
    this.palabra.set(p.item);
    this.modo.set(p.mode);
    this.opciones.set(p.options);
    this.autoAudio.set(p.autoAudio || this.anclaPedida);
    this.rondaEmpezadaEn = Date.now();
    this.vistosHoy.add(p.item.id);

    // Presentar una palabra por primera vez la deja disponible para ¿Qué escuchaste?.
    if (!this.srs.isIntroduced(HANZI_VOCAB_DECK, p.item.id)) {
      this.srs.markIntroduced(HANZI_VOCAB_DECK, [p.item.id]);
    }

    const ask = MODE_CLIP[p.mode];
    void this.narrar(this.autoAudio() ? [ask, wordClip(p.item.id)] : [ask]);
  }

  /** Un intento de problema con el generador puro. */
  private construir(
    level: number,
    age: number,
    poolIds: readonly string[] | undefined,
    forced: string | undefined,
    avoidId: string | undefined,
  ) {
    return buildVocabProblem(this.deck, level, age, Math.random, { forced, poolIds, avoidId });
  }

  /**
   * Palabras que ya se presentaron (Colores/Animales). Si el perfil viene de una versión
   * anterior y no tiene memoria, se siembran los tres primeros colores: es mejor un pool
   * mínimo que un juego que no puede generar problemas.
   */
  private listeningPoolIds(): readonly string[] {
    const presentadas = HANZI_VOCAB
      .filter(item => this.srs.isIntroduced(HANZI_VOCAB_DECK, item.id))
      .map(item => item.id);
    if (presentadas.length >= 2) return presentadas;

    const semilla = HANZI_COLORS.slice(0, 3).map(item => item.id);
    this.srs.markIntroduced(HANZI_VOCAB_DECK, semilla);
    return semilla;
  }

  // ============================================
  // TOQUES
  // ============================================

  elegir(opcion: HanziVocabItem): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    const item = this.palabra();
    if (!item) return;

    if (this.firstAttempt.isFirst(this.problemaActual)) {
      const acierto = opcion.id === item.id;
      this.primerIntento.set(acierto);
      if (!acierto) this.primerToqueErrado = opcion.id;
    }

    if (opcion.id === item.id) {
      // Una sola voz por acierto: la palabra la narra `finishProblem`.
      this.finishProblem();
      return;
    }

    // Un toque equivocado NO rompe la racha ni llama a recordIncorrect(): se atenúa la
    // opción y se sigue. El error es exploración, no veredicto.
    this.round.markWrong();
    this.descartadas.update(s => new Set(s).add(opcion.id));
    this.hint.set('👂');

    const primeraDuda = !this.dudaDicha;
    if (primeraDuda) {
      this.dudaDicha = true;
      this.round.markHelp();
      this.session.recordHelpUsed();
    }
    // La opción tocada suena en chino, acierte o no. La duda va en la MISMA narración:
    // dos `say()` seguidos se cortarían.
    void this.narrar(primeraDuda ? [wordClip(opcion.id), DUDA_OYE] : wordClip(opcion.id));
  }

  /** Repite la palabra del problema (botón 🔊). */
  repeatWord(): void {
    const item = this.palabra();
    if (item) void this.narrar(wordClip(item.id));
  }

  /** Repite la última narración completa. */
  repeatLast(): void {
    if (this._ultimaNarracion.length > 0) void this.narrator.say(this._ultimaNarracion);
  }

  // ============================================
  // CIERRE DE RONDA
  // ============================================

  private finishProblem(): void {
    if (this.busy()) return;
    const item = this.palabra();
    if (!item) return;

    this.busyFreed(true);
    this.localFeedback.set('success');
    this.hint.set('');

    const primera = this.primerIntento() === true;
    const snapshot = this.round.snapshot();
    this.anotarRonda(item, primera);

    const narra = this.narrar(wordClip(item.id));
    const result = this.session.recordCorrect({
      firstTry: snapshot.firstTry,
      perfectRound: snapshot.perfectRound,
    });

    // El elogio solo si la palabra se oyó y NO subió de nivel: si sube, el premio es
    // playLevelUp y sonar los dos sería premio doble.
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

  /**
   * Datos honestos: un intento por problema. "Sola" = acertó al primer toque.
   * El SRS recibe el mismo veredicto; con ayuda no sube de caja, pero vuelve mañana.
   */
  private anotarRonda(item: HanziVocabItem, primera: boolean): void {
    const profile = this.activeProfile();
    if (!profile) return;

    const representation: RepresentationType = this.modo() === 'hear' ? 'audio' : 'kanji';
    this.skills.recordAttempt({
      skillId: SKILL_BY_DECK[this.deck],
      contentId: item.id,
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
        skillId: SKILL_BY_DECK[this.deck],
        contentId: item.id,
        expected: item.hanzi,
        answered: this.primerToqueErrado ?? '',
        mistakeType: 'primer-toque',
        representation,
        timestamp: Date.now(),
        profileId: profile.id,
      });
    }

    this.srs.review(HANZI_VOCAB_DECK, item.id, {
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

  /** Reiniciar una ronda más desde el último nivel (mismo patrón que logic-blocks). */
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

  /** `busy` se libera en `generateProblem()`; este alias documenta la intención. */
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
}
