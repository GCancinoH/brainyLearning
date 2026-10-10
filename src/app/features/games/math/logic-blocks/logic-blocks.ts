import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild, viewChildren } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { RuleBadge } from '@shared/game-ui/rule-badge/rule-badge';
import { GhostHand } from '@shared/game-ui/ghost-hand/ghost-hand';
import { Narrator } from '@core/games/narrator.service';
import { TutorialSeen } from '@core/games/tutorial-seen.service';
import { HintLadder, configForAge, type LadderLevel } from '@core/games/hint-ladder';
import {
  Block, COLOR_HEX, Region, Round, blocksToPlace, buildRound, describeBlock, hintFor, label,
  matches, regionOf, vennRegionAt, type Attr
} from './logic-blocks-problem';
import {
  CLIP_BASE, CLIP_MANIFEST, CLIP_TEXT, clipForLabel, clipForQuestion, clipForRule, textForRule
} from './logic-blocks-narration';

/**
 * "Clasificador de bloques lógicos" (teoría de conjuntos)
 *
 *  - 4 años: clasificar por UNA propiedad. Primero una canasta ("lleva todas las rojas"),
 *    después dos canastas (rojas / azules).
 *  - 6 años: diagrama de Venn con dos conjuntos. Hay que encontrar la intersección
 *    (las que cumplen las DOS reglas) y también las que quedan fuera.
 *
 * Método Zvonkin: el juego nunca dice dónde va una figura; pregunta por sus propiedades.
 * Equivocarse no rompe la racha, salvo que la ronda se haya atorado (3 o más errores).
 */
interface Zone {
  region: Region;
  title: string;
}

interface Point { x: number; y: number; }

@Component({
  selector: 'logic-blocks',
  standalone: true,
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent, RuleBadge, GhostHand],
  templateUrl: './logic-blocks.html',
  styleUrl: './logic-blocks.scss'
})
export class LogicBlocks implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  /** Público: la plantilla lo usa para animar el botón 🔊 mientras suena. */
  readonly narrator = inject(Narrator);
  private readonly tutorials = inject(TutorialSeen);

  readonly activeProfile = this.profileState.activeProfile;

  // ⚠️ Va después de `activeProfile`: los campos se inicializan en orden de declaración, y
  // aquí hace falta la edad para elegir los umbrales de la escalera. Si se moviera arriba,
  // leería `undefined` y le tocaría siempre la escalera de 4 años.
  private readonly ladder = new HintLadder(configForAge(this.activeProfile()?.age ?? 4));

  // Configuración
  readonly GAME_ID = 'logic-blocks';
  readonly MAX_LEVEL = 10;
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Estado de la ronda
  readonly round = signal<Round>(buildRound(1, 4));
  readonly placed = signal<Record<number, Region>>({});
  readonly selectedId = signal<number | null>(null);
  readonly hint = signal('');
  readonly shakeId = signal<number | null>(null);
  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private wrongCount = 0;

  // Derivados
  readonly mode = computed(() => this.round().mode);
  readonly poolBlocks = computed(() => this.round().blocks.filter(b => this.placed()[b.id] === undefined));
  readonly labelA = computed(() => label(this.round().a));
  readonly labelB = computed(() => (this.round().b ? label(this.round().b!) : ''));

  // ============================================
  // PRE-LECTORA (ver §2.1 del spec)
  // ============================================

  /**
   * 4 años: el texto no es un canal. Cambia la insignia por muestra visual, sustituye el
   * banner por una cara de ánimo, agranda los toques y añade apoyos que se retiran solos.
   *
   * Lo que NO depende de esta bandera (y no debe): la barra de regla y el botón 🔊. Las
   * dos edades necesitan la consigna a la vista; lo que cambia es si además se lee.
   */
  readonly isPreReader = computed(() => (this.activeProfile()?.age ?? 4) <= 4);

  /** Reglas a mostrar en la barra. En 'two' hay dos: una por canasta. */
  readonly ruleAttrs = computed<Attr[]>(() => {
    const r = this.round();
    return r.mode === 'two' && r.b ? [r.a, r.b] : [r.a];
  });

  /** El emoji de ánimo sustituye al banner de texto a los 4 años (§5.10). */
  readonly mood = computed(() => {
    const e = this.feedbackState();
    return e === 'success' ? '🌟' : e === 'try-again' ? '🤔' : e === 'game-over' ? '🏆' : '🧺';
  });
  readonly moodText = computed(() => {
    const e = this.feedbackState();
    return e === 'success' ? '¡Muy bien!'
      : e === 'try-again' ? 'Pensemos otra vez'
      : e === 'game-over' ? '¡Fin del juego! Well done!' : 'Coloca las figuras';
  });

  /** Subir aquí la escalera de ayuda (P4). Lo leen la insignia y los resaltados. */
  readonly ladderLevel = signal<LadderLevel>(0);
  readonly pulseBadge = computed(() => this.ladderLevel() >= 1);

  /**
   * Figuras que cumplen la regla y aún están en el pool. A partir del nivel 2 se
   * resaltan: no se le dice la respuesta, se le señala dónde mirar.
   */
  readonly hintBlocks = computed<number[]>(() => {
    if (this.ladderLevel() < 2) return [];
    const r = this.round();
    const placed = this.placed();
    return blocksToPlace(r)
      .filter(b => placed[b.id] === undefined && matches(b, r.a))
      .map(b => b.id);
  });

  /** Nivel 3: se atenúan las que no cumplen. Hay algo que ya está resuelto. */
  readonly dimDistractors = computed(() => this.ladderLevel() >= 3 && this.mode() === 'one');

  // ============================================
  // CONSIGNA OÍDA (§5.9)
  // ============================================

  /**
   * ¿Ha oído la consigna esta ronda? Mientras sea `false`, equivocarse **no** cuenta.
   *
   * La consigna disappearing del banner tras el primer error (§1, problema 2) hacía que
   * una niña que no la había entendido fuera penalizada por no entender: se mide
   * comprensión, noclassification.
   */
  private readonly instructionHeard = signal(false);

  /** Red de seguridad: si la voz falla, la consigna se da por oída a los 6 s. */
  private readonly INSTRUCTION_GRACE_MS = 6000;

  // ============================================
  // DEMOSTRACIÓN (P3)
  // ============================================
  readonly demo = signal<{ from: Point; to: Point; blockId: number; shape: string; color: string } | null>(null);
  private readonly DEMO_MS = 4600;   // 2 pasadas de 1.9 s + márgenes

  // ============================================
  // TUTORIAL (P7)
  // ============================================
  readonly tutorial = signal<'off' | 'look' | 'demo' | 'your-turn'>('off');
  readonly tutorialDim = computed(() => this.tutorial() === 'look');

  // ============================================
  // CIERRE VISUAL (P5)
  // ============================================

  /** Ranuras fantasma: cuántas figuras van a la canasta. Responde "¿cuántas faltan?". */
  readonly slotTotal = computed(() => (this.mode() === 'one' ? blocksToPlace(this.round()).length : 0));
  readonly slotFilled = computed(() => this.placedIn('basket').length);
  readonly showSlots = computed(() => this.isPreReader() && this.mode() === 'one' && this.currentLevel() <= 5);

  /**
   * Lista de índices para el `@for`. Va en el componente y no en la plantilla porque
   * `[].constructor(n)` devuelve un array con los slots **vacíos**: con `track i` eso
   * produce claves duplicadas y Angular avisa por consola (NG0955).
   */
  readonly slotRange = computed(() => Array.from({ length: this.slotTotal() }, (_, i) => i));

  /** Canastas (modos 'one' y 'two') */
  readonly zones = computed<Zone[]>(() => {
    const r = this.round();
    if (r.mode === 'one') return [{ region: 'basket', title: label(r.a) }];
    if (r.mode === 'two') return [{ region: 'A', title: label(r.a) }, { region: 'B', title: label(r.b!) }];
    return [];
  });

  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle' as const;
    if (s.isCompleted || s.isTimeUp) return 'game-over' as const;
    return this.localFeedback();
  });
  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly idleMessage = computed(() => {
    const r = this.round();
    if (r.mode === 'one') return `Lleva todas las ${label(r.a).toLowerCase()} a la canasta 🧺`;
    if (r.mode === 'two') return 'Pon cada figura en su canasta 🧺';
    return 'Coloca cada figura donde vive. ¡En el medio van las que cumplen las dos! 🔍';
  });

  readonly customFeedbackMessages = {
    success: [
      '¡Todo en su lugar! 🧺',
      '¡Qué buena clasificadora! 🌟',
      '¡Lo organizaste perfecto! ✨',
      '¡Ojo de científica! 🔍'
    ],
    'try-again': [
      'Mira bien sus propiedades 🤔',
      'Pensemos otra vez 🌈',
      '¡Un intento más! 🚀'
    ],
    'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨'],
    'game-over': ['¡Clasificaste todos los bloques! 🏆', '¡Felicidades, eres una experta! 🌈']
  };

  // Internos
  private readonly venn = viewChild<ElementRef<HTMLElement>>('venn');
  private readonly outside = viewChild<ElementRef<HTMLElement>>('outside');
  private readonly zoneEls = viewChildren<ElementRef<HTMLElement>>('zone');
  /** Figuras del pool, para medir de dónde sale la demostración. */
  private readonly poolEls = viewChildren<ElementRef<HTMLElement>>('poolBlk');
  /** Contenedor del juego: origen de coordenadas de la demostración. */
  private readonly host = viewChild<ElementRef<HTMLElement>>('container');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private lastDragEnd = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  ngOnInit(): void {
    // Dónde viven los clips de este juego y qué dice cada uno. El manifiesto es también el
    // plan B del TTS: sin él, un clip ausente se intentaría leer con la voz equivocada.
    this.narrator.configure({
      base: CLIP_BASE,
      manifest: CLIP_MANIFEST
    });

    // El servicio de audio es compartido: fija aquí los sonidos de este juego
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 }
    ]);
    const savedLevel = this.progress.getLevel(this.GAME_ID);

    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.requiredCorrect,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateRound();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.unsubscribeEvents?.();
    // ⚠️ `narrator.cancel()` ANTES de `audio.dispose()`: al revés, `dispose()` deja los
    // elementos de audio inservibles y `cancel()` intentaría pararlos después. Además
    // cancela la secuencia en vuelo, que si no seguiría sonando fuera de la pantalla.
    this.narrator.cancel();
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type !== 'level-up') return;
    this.audio.playLevelUp();
    this.triggerConfetti();
    if (event.payload?.['isMaxLevel']) return;   // fin del juego: lo muestra el feedback
    this.later(() => {
      if (!this.isOver()) this.generateRound();
    }, 2500);
  }

  // ============================================
  // RONDA
  // ============================================

  generateRound(): void {
    this.clearTimers();
    this.narrator.cancel();
    this.ladder.reset();
    this.ladderLevel.set(0);
    this.demo.set(null);
    this.tutorial.set('off');

    const round = buildRound(this.currentLevel(), this.activeProfile()?.age ?? 4);
    this.round.set(round);

    this.placed.set({});
    this.selectedId.set(null);
    this.hint.set('');
    this.shakeId.set(null);
    this.wrongCount = 0;
    this.localFeedback.set('idle');
    this.instructionHeard.set(false);

    // Ejemplo ya colocado (§5.8): en los dos primeros niveles la primera figura que ya
    // cumple la regla aparece dentro de la canasta. Ver qué *tipo de cosa* va allí enseña
    // más que cualquier explicación. A partir del nivel 3 se retira.
    if (this.isPreReader() && round.mode === 'one' && this.currentLevel() <= 2) {
      const ejemplo = blocksToPlace(round).find(b => b.id === round.blocks[0].id) ?? blocksToPlace(round)[0];
      if (ejemplo) this.placed.set({ [ejemplo.id]: 'basket' });
    }

    // Tutorial de tres tiempos, la primera vez por perfil y por modo. El modo importa:
    // el paso de una canasta a dos en el nivel 8 es otra mecánica y hay que presentarla.
    if (this.isPreReader() && !this.tutorials.has(this.GAME_ID, round.mode)) {
      this.startTutorial();
    } else {
      this.later(() => void this.narrateRule(), 400);
      this.startIdleWatch();
    }
  }

  // ============================================
  // CONSIGNA Y VOZ
  // ============================================

  /** Dice la consigna de la ronda. Devuelve si realmente se oyó. */
  private async narrateRule(): Promise<boolean> {
    const round = this.round();
    const clip = clipForRule(round);
    const texto = textForRule(round);
    const oido = await this.narrator.say(clip, texto ?? undefined);
    if (oido) this.instructionHeard.set(true);
    return oido;
  }

  /** Botón 🔊: repetir la consigna. También la marca como oída (repetición voluntaria). */
  repeatRule(): void {
    this.audio.retryPendingAudio();
    this.ladder.touch();
    this.instructionHeard.set(true);   // ella ha pedido oírla: cuenta como entendida
    void this.narrateRule();
  }

  /** Toca una insignia o una canasta: dice su nombre. */
  speakLabel(attr: Attr): void {
    this.audio.retryPendingAudio();
    const clip = clipForLabel(attr);
    if (clip) void this.narrator.say(clip, CLIP_TEXT[clip]);
  }

  /** Toca una canasta en modo 'two': dice a qué conjunto pertenece. */
  speakZone(region: Region): void {
    const r = this.round();
    if (r.mode !== 'two' || !r.b) return;
    const attr = region === 'A' ? r.a : r.b;
    const clip = clipForLabel(attr);
    if (clip) void this.narrator.say(clip, CLIP_TEXT[clip]);
  }

  // ============================================
  // ESCALERA DE AYUDA (§5.5)
  // ============================================

  /** Mira periódicamente si lleva demasiado tiempo sin hacer nada. */
  private startIdleWatch(): void {
    this.later(() => this.tickLadder(), 1000);
  }

  private tickLadder(): void {
    if (this.destroyed || this.isOver()) return;
    const subio = this.ladder.tick();
    if (subio) this.onLadderRise(subio);
    this.later(() => this.tickLadder(), 1000);
  }

  /** Cualquier interacción reinicia el reloj de inactividad. No borra los errores. */
  onActivity(): void {
    this.ladder.touch();
    this.ladderLevel.set(this.ladder.level);
  }

  private onLadderRise(level: LadderLevel): void {
    this.ladderLevel.set(level);

    // Nivel 1: repetir la voz y hacerlatir la insignia.
    if (level === 1) {
      if (this.selectedId() !== null) void this.narrator.say('lb.go.tap', CLIP_TEXT['lb.go.tap']);
      else void this.narrateRule();
      return;
    }

    // Nivel 3: demostración, salvo que ya se hagan demasiadas por ronda.
    if (level === 3 && this.ladder.shouldDemo()) this.showDemo();
  }

  /** Resaltar, atenuar y preguntar: lo que se activa al equivocarse (no solo al esperar). */
  private onWrong(round: Round): void {
    const subio = this.ladder.registerWrong();
    if (subio !== null) {
      this.ladderLevel.set(subio);
      if (subio === 1) this.askSocratically(round);
      else if (subio === 3 && this.ladder.shouldDemo()) this.showDemo();
    } else if (this.ladder.level === 0) {
      // Ya estaba en 0 y es el primer fallo de la racha: pregunta igualmente, una sola vez.
      this.askSocratically(round);
      this.ladderLevel.set(1);
    }
  }

  /**
   * La pregunta socrática, en voz alta. A los 4 años sustituye al texto: no dice dónde
   * va la figura, pregunta por sus propiedades y deja que ella compare con la muestra.
   */
  private askSocratically(round: Round): void {
    const clip = round.mode === 'two' ? 'lb.q.which-looks' : clipForQuestion(round.a);
    if (clip) void this.narrator.say(clip, CLIP_TEXT[clip]);
    else if (round.mode === 'two') void this.narrator.say('lb.q.which-looks', CLIP_TEXT['lb.q.which-looks']);
  }

  // ============================================
  // DEMOSTRACIÓN (§5.6)
  // ============================================

  /**
   * Enseña **una** figura yendo a su lugar, sobre un clon. No toca `placed()`: no cuenta
   * como acierto ni como error, porque no lo fue.
   */
  private showDemo(): void {
    const round = this.round();
    if (round.mode === 'venn') return;              // no se demuestra Venn

    const placed = this.placed();
    const candidata = blocksToPlace(round)
      .find(b => placed[b.id] === undefined && matches(b, round.a));
    if (!candidata) return;

    const destino: Region = round.mode === 'one' ? 'basket' : (matches(candidata, round.a) ? 'A' : 'B');
    this.measureDemo(candidata.id, destino);
  }

  /**
   * Mide en coordenadas **relativas al contenedor**, no a la ventana. Así el gesto es
   * correcto aunque la página se desplace mientras se reproduce.
   */
  private measureDemo(blockId: number, region: Region): void {
    const root = this.host()?.nativeElement.getBoundingClientRect();
    if (!root) return;

    const src = this.poolEls().find(e => Number(e.nativeElement.dataset['id']) === blockId)
      ?.nativeElement.getBoundingClientRect();
    const dst = this.zoneEls().find(e => e.nativeElement.dataset['region'] === region)
      ?.nativeElement.getBoundingClientRect();
    if (!src || !dst) return;

    const centro = (r: DOMRect) => ({ x: r.left + r.width / 2 - root.left, y: r.top + r.height / 2 - root.top });
    const bloque = this.round().blocks.find(b => b.id === blockId)!;

    this.demo.set({
      from: centro(src), to: centro(dst), blockId,
      shape: bloque.shape, color: COLOR_HEX[bloque.color]
    });

    this.later(() => {
      this.demo.set(null);
      void this.narrator.say('lb.intro.now-you', CLIP_TEXT['lb.intro.now-you']);
    }, this.DEMO_MS);
  }

  // ============================================
  // TUTORIAL (§5.7)
  // ============================================

  /**
   * Tres tiempos: "esto es" → "mira cómo" → "ahora tú". Es la lección Montessori:
   * primero se presenta, después se imita, después se hace sin ayuda.
   */
  private startTutorial(): void {
    this.tutorial.set('look');
    this.instructionHeard.set(true);        // el tutorial ES la instrucción

    const aRule = async () => {
      this.tutorial.set('demo');
      const round = this.round();
      this.measureDemo(round.blocks[0].id, this.mode() === 'one' ? 'basket' : 'A');
      await this.narrator.say('lb.intro.look', CLIP_TEXT['lb.intro.look']);
    };

    this.later(async () => {
      if (this.destroyed) return;
      await this.narrateRule();
      // Tras oír la consigna, la demostración.
      this.later(() => { if (!this.destroyed) void aRule(); }, 600);
    }, 700);
  }

  /** Si toca algo, es que ya quiere jugar: se corta el tutorial. */
  skipTutorial(): void {
    if (this.tutorial() === 'off') return;
    this.tutorials.mark(this.GAME_ID, this.mode());
    this.tutorial.set('your-turn');
    this.later(() => {
      this.tutorial.set('off');
      this.startIdleWatch();
    }, 900);
  }

  // ============================================
  // INTERACCIÓN
  // ============================================

  /** Figuras ya colocadas en una región */
  placedIn(region: Region): Block[] {
    const p = this.placed();
    return this.round().blocks.filter(b => p[b.id] === region);
  }

  color(b: Block): string {
    return COLOR_HEX[b.color];
  }

  name(b: Block): string {
    return describeBlock(b);
  }

  onDragEnded(event: CdkDragEnd, id: number): void {
    this.lastDragEnd = Date.now();
    const region = this.regionAt(event.dropPoint.x, event.dropPoint.y);
    const ok = region !== null && this.place(id, region);
    if (!ok) event.source.reset();
  }

  /** Tocar una figura la selecciona; tocar una zona después la coloca (para quien aún no arrastra bien) */
  onTap(id: number): void {
    if (Date.now() - this.lastDragEnd < 300) return;   // ignora el click que sigue a un arrastre
    this.selectedId.update(cur => (cur === id ? null : id));
  }

  onBoardTap(event: MouseEvent): void {
    // Tocar el tablero durante el tutorial es "quiero jugar": se corta.
    this.skipTutorial();
    this.onActivity();

    const id = this.selectedId();
    if (id === null) return;
    const region = this.regionAt(event.clientX, event.clientY);
    if (region !== null) this.place(id, region);
  }

  /** Resaltar una figura concreta (insignia pulsando, etc.). */
  isHint(id: number): boolean {
    return this.hintBlocks().includes(id);
  }

  /** Atenuar las figuras que no cumplen la regla (nivel 3 de la escalera). */
  isDim(b: Block): boolean {
    if (!this.dimDistractors()) return false;
    return !matches(b, this.round().a);
  }

  /** Devuelve true si la figura quedó bien colocada */
  private place(id: number, region: Region): boolean {
    if (this.isOver() || this.solved()) return false;
    const block = this.round().blocks.find(b => b.id === id);
    if (!block || this.placed()[id] !== undefined) return false;
    this.audio.retryPendingAudio();
    this.skipTutorial();
    this.onActivity();

    if (regionOf(this.round(), block) !== region) {
      // ⚠️ La condición es esta y no un `if` sin más: mientras no haya oído la consigna,
      // el error NO cuenta. Sin ella, una niña que no entendió la instrucción se llevaba
      // una racha rota por no saber leer, y el juego medía lectura en vez de clasificación.
      if (this.instructionHeard()) {
        this.wrongCount++;
        this.onWrong(this.round());
      }
      this.localFeedback.set('try-again');
      this.hint.set(hintFor(this.round()));
      this.audio.playFailure();
      this.shakeId.set(id);
      this.later(() => this.shakeId.set(null), 450);
      return false;
    }

    this.placed.update(p => ({ ...p, [id]: region }));
    this.selectedId.set(null);
    this.hint.set('');
    // Acertar deja la escalera a cero: ya entendió, no hay nada que escalar.
    this.ladder.registerCorrect();
    this.ladderLevel.set(0);
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');

    const p = this.placed();
    if (blocksToPlace(this.round()).every(b => p[b.id] !== undefined)) {
      this.later(() => this.onRoundComplete(), 500);
    }
    return true;
  }

  private onRoundComplete(): void {
    if (this.isOver()) return;
    this.localFeedback.set('success');
    // Ronda atorada (3 o más errores): no cuenta para la racha
    if (this.wrongCount >= 3) this.session.recordIncorrect();
    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      // El evento 'level-up' se maneja en handleSessionEvent
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL
      });
    } else {
      this.audio.playPraise();
      this.later(() => {
        if (!this.isOver()) this.generateRound();
      }, 2400);
    }
  }

  // ============================================
  // GEOMETRÍA: ¿en qué zona cayó el dedo?
  // ============================================

  private regionAt(x: number, y: number): Region | null {
    const m = 10;
    const inside = (r: DOMRect) => x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m;

    if (this.round().mode === 'venn') {
      const outside = this.outside()?.nativeElement.getBoundingClientRect();
      if (outside && inside(outside)) return 'none';
      const v = this.venn()?.nativeElement.getBoundingClientRect();
      if (v && inside(v)) return vennRegionAt(x - v.left, y - v.top, v.width, v.height) ?? 'none';
      return null;
    }

    for (const ref of this.zoneEls()) {
      const el = ref.nativeElement;
      if (inside(el.getBoundingClientRect())) return el.dataset['region'] as Region;
    }
    return null;
  }

  // ============================================
  // NAVEGACIÓN Y UTILIDADES
  // ============================================

  goBack(): void {
    this.router.navigate(['/games/math']);
  }

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
  }

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch { /* noop */ }
  }

  /** setTimeout que se cancela solo al destruir el componente o al generar otra ronda */
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
