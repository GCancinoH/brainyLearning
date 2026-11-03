import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
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
import { getProfileDifficultyConfig } from '@core/learning/learning-content';
import type { RepresentationType } from '@core/learning/learning-content';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { PaintableRocket } from '@shared/game-ui/paintable-rocket/paintable-rocket';
import { RoundTracker } from '@core/games/round-tracker';
import { gameMaxLevel } from '@core/models/game-catalog';
import { CLIP_BASE, CLIP_EXT, CLIP_MANIFEST, DUDA_OYE, INTRO, MODE_CLIP, wordClip } from './hanzi-vocab-narration';
import {
  MAX_LEVEL as VOCAB_MAX_LEVEL,
  buildVocabProblem,
  knobFor,
  poolFor,
  randInt,
  type VocabMode,
  type VocabProblem,
} from './hanzi-vocab-problem';
import { shuffle } from './hanzi-vocab-problem';

/** El juego que toca según la ruta. */
const GAME_BY_DECK: Record<HanziDeck | 'listening', string> = {
  colors: 'hanzi-colors',
  animals: 'hanzi-animals',
  nature: 'hanzi-nature',
  family: 'hanzi-family',
  actions: 'hanzi-actions',
  listening: 'hanzi-listening',
};

/** Skill del catálogo que se anota en cada juego. */
const SKILL_BY_DECK: Record<HanziDeck | 'listening', string> = {
  colors: 'chinese.vocab.colors',
  animals: 'chinese.vocab.animals',
  nature: 'chinese.vocab.nature',
  family: 'chinese.vocab.family',
  actions: 'chinese.vocab.actions',
  listening: 'chinese.listening',
};

const DECK_ICON: Record<HanziDeck | 'listening', string> = {
  colors: '🎨',
  animals: '🐲',
  nature: '🌿',
  family: '👨‍👩‍👧‍👦',
  actions: '🏃',
  listening: '👂',
};

/**
 * Vocabulario Hanzi — un solo componente para Colores, Animales, Naturaleza, Familia,
 * Acciones y ¿Qué escuchaste?.
 *
 * El juego se configura desde `route.data.deck`; no hay seis copias. Lo que cambia es el
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
  // MÁQUINA DE FASES (piloto: solo Colores)
  // ============================================
  readonly esPiloto = this.deck === 'colors';
  readonly phase = signal<'intro' | 'guided' | 'play'>('play');
  readonly introWords = signal<readonly HanziVocabItem[]>([]);
  readonly introIndex = signal(0);
  private _guidedQueue: HanziVocabItem[] = [];
  private _gradedSinceIntro = 4; // PLAY_BETWEEN_INTROS = 4: permite presentar al arranque
  readonly showHint = signal(false);

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

  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

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
  // INTRO DE PALABRA NUEVA (4 años)
  // ============================================

  readonly introCurrent = computed(() => this.introWords()[this.introIndex()] ?? null);
  readonly isLastIntro = computed(() => this.introIndex() >= this.introWords().length - 1);

  // Reproduce la palabra al entrar en cada ficha del carrusel de intro.
  private _introPlayTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly introNarrationEffect = effect(() => {
    const word = this.introCurrent();
    if (word && this.showingIntro() && this.phase() === 'intro') {
      if (this._introPlayTimer) clearTimeout(this._introPlayTimer);
      this._introPlayTimer = setTimeout(() => {
        if (!this.destroyed) void this.narrar([INTRO, wordClip(word.id)]);
      }, 300);
    }
  });

  // ============================================
  // INTRO PALABRA NUEVA (4 años) — legado (no-piloto)
  // ============================================

  readonly showingIntro = signal(false);
  readonly introItem = signal<HanziVocabItem | null>(null);

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
    if (this.localFeedback() === 'try-again') return '🤔';
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

  /** Verificación de subida de nivel para el piloto: no subir si quedan palabras sin reconocer. */
  private readonly canLevelUp = computed(() => {
    if (!this.esPiloto) return true;
    const level = Math.min(this.currentLevel(), VOCAB_MAX_LEVEL);
    const pool = poolFor(this.deck, level);
    return pool.every(item => this.srs.isIntroduced(HANZI_VOCAB_DECK, item.id));
  });

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    if (this._introPlayTimer) clearTimeout(this._introPlayTimer);
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
        canLevelUp: this.canLevelUp,
      },
      this.activeProfile()?.age,
    );

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    if (this.esPiloto) {
      this._gradedSinceIntro = 4; // PLAY_BETWEEN_INTROS
      this.nextStep();
    } else {
      this.generateProblem();
    }
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
      if (!this.isOver()) {
        if (this.esPiloto) this.nextStep();
        else this.generateProblem();
      }
    }, 2500);
  }

  /** Motor de fases para el piloto (Colores). */
  private nextStep(): void {
    if (this.isOver()) return;

    if (this._guidedQueue.length > 0) {
      this.phase.set('guided');
      this.generateGuided();
      return;
    }

    const level = Math.min(this.currentLevel(), VOCAB_MAX_LEVEL);
    const pool = poolFor(this.deck, level);
    const unintroduced = pool.filter(item => !this.srs.isIntroduced(HANZI_VOCAB_DECK, item.id));

    if (unintroduced.length > 0 && this._gradedSinceIntro >= 4) {
      const batch = unintroduced.slice(0, 4);
      this.introWords.set(batch);
      this.introIndex.set(0);
      this.phase.set('intro');
      // La narración "Esto es" se reproduce al entrar en el carrusel (efecto en introCurrent)
      return;
    }

    if (unintroduced.length === 0) {
      this.phase.set('play');
      this.generateProblem();
      return;
    }

    // Caso raro: hay sin-introducir pero no toca intro aún (contador). Juega con lo presentado.
    this.phase.set('play');
    this.generateProblem();
  }

  /** Genera un problema de fase guiada (reconocimiento sin calificar). */
  private generateGuided(): void {
    const target = this._guidedQueue[0];
    if (!target) {
      this.phase.set('play');
      this.nextStep();
      return;
    }
    const level = Math.min(this.currentLevel(), VOCAB_MAX_LEVEL);
    const pool = poolFor(this.deck, level);
    // Distractores: del pool (incluye la propia palabra), barajados, 2-3 opciones
    const cfg = getProfileDifficultyConfig(this.activeProfile()?.age ?? 4);
    const pedidas = randInt(cfg.minOptions, cfg.maxOptions, Math.random);
    const cantidad = Math.max(2, Math.min(pedidas, pool.length)) - 1;
    const disponibles = pool.filter(i => i.id !== target.id);
    const elegidos = shuffle(disponibles, Math.random).slice(0, cantidad);

    this.palabra.set(target);
    this.modo.set('hear');
    this.opciones.set(shuffle([target, ...elegidos], Math.random));
    this.autoAudio.set(true);
    this.showHint.set(false);
    this.localFeedback.set('idle');
    this.descartadas.set(new Set());
    this.problemaId.update(n => n + 1);
    this.rondaEmpezadaEn = Date.now();
    this.dudaDicha = false;
    this.primerToqueErrado = null;
    this.problemaActual = {};
    this.primerIntento.set(null);

    void this.narrar([MODE_CLIP.hear, wordClip(target.id)]);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    // Si hay una intro en curso, la cancelamos antes de generar un problema nuevo.
    this.showingIntro.set(false);
    this.introItem.set(null);
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
    // Pool del mazo actual para filtrar los vencidos del SRS (evita coger palabras de otro mazo).
    const currentPoolIds = this.deck === 'listening'
      ? poolIds!
      : poolFor(this.deck, level).map(i => i.id);

    // Repaso: primero lo que pidió la reflexión; luego, en N10, los vencidos del SRS.
    let forced: string | undefined;
    if (modo === 'repaso' && this.palabra()) {
      forced = this.palabra()!.id;
    } else if (knobFor(this.deck, level).reviewFirst) {
      forced = this.srs
        .due(HANZI_VOCAB_DECK)
        .find(id => currentPoolIds.includes(id));
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
    const esNueva = !this.srs.isIntroduced(HANZI_VOCAB_DECK, p.item.id);
    const mostrarIntro = esNueva && this.deck !== 'listening' && !this.isSix() && !this.esPiloto;

    if (mostrarIntro) {
      // Tarjeta "esto es 红 🔴" para 4 años (no-piloto): se muestra antes del problema real.
      this.introItem.set(p.item);
      this.showingIntro.set(true);
      this.palabra.set(p.item); // para que el tinte/cohete coincidan
      void this.narrar([INTRO, wordClip(p.item.id)]);
      this.later(() => {
        if (!this.destroyed) this.cerrarIntroYEmpezar(p);
      }, 2500); // tiempo para ver la tarjeta + oír la palabra
      return;
    }

    this.iniciarProblemaReal(p, esNueva);
  }

  private iniciarProblemaReal(p: VocabProblem, esNueva: boolean): void {
    this.palabra.set(p.item);
    this.modo.set(p.mode);
    this.opciones.set(p.options);
    this.autoAudio.set(p.autoAudio || this.anclaPedida);
    this.rondaEmpezadaEn = Date.now();
    this.vistosHoy.add(p.item.id);

    if (esNueva) {
      this.srs.markIntroduced(HANZI_VOCAB_DECK, [p.item.id]);
    }

    const ask = MODE_CLIP[p.mode];
    void this.narrar(this.autoAudio() ? [ask, wordClip(p.item.id)] : [ask]);
  }

  private cerrarIntroYEmpezar(p: VocabProblem): void {
    this.showingIntro.set(false);
    this.introItem.set(null);
    this.iniciarProblemaReal(p, true);
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
    if (this.busy() || this.isOver() || this.solved() || this.showingIntro()) return;

    // Fase guiada (piloto Colores): reconocimiento sin calificar.
    if (this.phase() === 'guided') {
      this.elegirGuiada(opcion);
      return;
    }

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

  /** Respuesta en fase guiada: sin veredicto, la correcta pulsa y se repite la palabra. */
  private elegirGuiada(opcion: HanziVocabItem): void {
    const target = this.palabra();
    if (!target) return;

    if (opcion.id === target.id) {
      // Acierto en guiada: éxito, elogio, marca como presentada, avanza cola.
      this.localFeedback.set('success');
      this.showHint.set(false);
      this.srs.markIntroduced(HANZI_VOCAB_DECK, [target.id]);
      this._guidedQueue.shift();
      this._gradedSinceIntro = 0;
      void this.narrar(wordClip(target.id)).then(oido => {
        if (oido) void this.audio.playPraise();
      });
      this.later(() => this.nextStep(), 1200);
      return;
    }

    // Error en guiada: sin veredicto, pulsa la correcta y repite la palabra objetivo.
    this.localFeedback.set('try-again');
    this.showHint.set(true);
    // La opción tocada NO se atenúa (la niña puede volver a tocarla), la correcta pulsa.
    this.later(() => {
      if (!this.destroyed) void this.narrar(wordClip(target.id));
    }, 500);
  }

  /** Repite la palabra del problema (botón 🔊 en la tarjeta). */
  repeatWord(): void {
    const item = this.palabra();
    if (item) void this.narrar(wordClip(item.id));
  }

  /** Repite la palabra del carrusel de intro. */
  replayIntroWord(): void {
    const item = this.introCurrent();
    if (item) void this.narrar(wordClip(item.id));
  }

  /** Avanza el carrusel de intro. */
  nextIntro(): void {
    if (this.isLastIntro()) {
      this.onIntroDone();
    } else {
      this.introIndex.update(i => i + 1);
    }
  }

  /** Fin del carrusel: marca presentadas, inicia fase guiada. */
  private onIntroDone(): void {
    const batch = this.introWords();
    this.srs.markIntroduced(HANZI_VOCAB_DECK, batch.map(i => i.id));
    this._guidedQueue = shuffle(batch, Math.random);
    this.introWords.set([]);
    this.phase.set('guided');
    this.nextStep();
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
        if (!this.isOver()) {
          if (this.esPiloto) this.nextStep();
          else this.generateProblem();
        }
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
        canLevelUp: this.canLevelUp,
      },
      this.activeProfile()?.age,
    );
    if (this.esPiloto) {
      this._gradedSinceIntro = 4;
      this.nextStep();
    } else {
      this.generateProblem();
    }
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
