import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
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
import {
  buildCompositionProblem,
  CompositionProblem,
  MAX_LEVEL,
  pickLine,
  pieceData,
  Script,
  SocraticMoment,
  TrayPiece,
} from '@core/learning/kanji-composition';

/**
 * "Construye el Kanji" — cómo se forman los caracteres compuestos.
 *
 * Inspirado en §B.6 (Robot Aki: radicompuestos) y §C.4 (Construye el carácter) del
 * método Zvonkin. Tres pasos por kanji, en este orden:
 *
 *   1. HISTORIA   → el kanji completo y por qué se forma así
 *   2. COMPONER   → arrastra las piezas sueltas a sus huecos
 *   3. DIBUJAR    → con el lienzo vacío, dibújalo tú
 *
 * Dos decisiones que no son obvias:
 *
 *  - NUNCA se dice "está mal". Cuando algo no encaja se plantea una duda o se propone
 *    probar otra cosa (ver SOCRATIC_LINES). El acierto tampoco se celebrates como
 *    "correcto", sino como algo que acaba de descubrir.
 *  - Las piezas equivocadas NO rompen la racha. Explorar es el objetivo; el error es
 *    material de investigación (regla 5 del método).
 */

type Step = 'story' | 'compose' | 'draw';

interface PlacedPiece {
  trayId: string;
  kanji: string;
  emoji: string;
}

@Component({
  selector: 'kanji-compose',
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './kanji-compose.html',
  styleUrl: './kanji-compose.scss',
})
export class KanjiCompose implements OnInit, OnDestroy {
  // ============================================
  // ENTRADAS
  // ============================================

  /** Sakura 🌸 (japonés) o Dragón 🐉 (chino). Los kanji son los mismos; cambia la envoltura. */
  readonly script = input<Script>('japanese');

  // ============================================
  // SERVICIOS
  // ============================================

  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  readonly GAME_ID = 'japanese-kanji-compose';
  readonly MAX_LEVEL = MAX_LEVEL;
  readonly requiredCorrect = (this.activeProfile()?.age ?? 6) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  /** Persona que guía: Aki en Sakura, Long en Dragón */
  readonly guide = computed(() =>
    this.script() === 'japanese'
      ? { name: 'Aki', planet: 'Planeta Sakura', emoji: '🤖', color: '#f9a8d4' }
      : { name: 'Long', planet: 'Planeta Dragón', emoji: '🐉', color: '#fbbf24' },
  );

  /** Mostrar el pinyin (chino) en vez de la lectura japonesa */
  readonly showPinyin = computed(() => this.script() === 'chinese');

  // ============================================
  // ESTADO
  // ============================================

  readonly step = signal<Step>('story');
  readonly problem = signal<CompositionProblem | null>(null);
  /** Piezas que quedan en la bandeja */
  readonly tray = signal<TrayPiece[]>([]);
  /** Qué hay en cada hueco (null = vacío) */
  readonly placed = signal<(PlacedPiece | null)[]>([]);

  readonly line = signal('');
  readonly hint = signal('');
  readonly busy = signal(false);
  readonly reflecting = signal(false);
  /** Muestra los kanji hermanos: "con las mismas piezas salen otros" */
  readonly showSiblings = signal(false);
  /** En la fase de dibujo, el kanji se muestra al trasluz */
  readonly showGhostInDraw = signal(true);

  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  // ============================================
  // DERIVADOS
  // ============================================

  readonly target = computed(() => this.problem()?.target ?? null);
  readonly showGhost = computed(
    () => this.step() === 'compose' && (this.problem()?.showGhost ?? false),
  );
  readonly filledCount = computed(() => this.placed().filter(Boolean).length);
  readonly allFilled = computed(
    () => this.placed().length > 0 && this.placed().every(Boolean),
  );
  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle';
    if (s.isCompleted || s.isTimeUp) return 'game-over';
    return this.localFeedback();
  });

  /** Trazos dibujados en la fase de dibujo */
  readonly strokes = signal<{ x: number; y: number }[][]>([]);
  private drawing: { x: number; y: number }[] | null = null;

  // ============================================
  // INTERNOS
  // ============================================

  private readonly slotEls = viewChildren<ElementRef<HTMLElement>>('slot');
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private lastDragEnd = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  constructor() {
    // El lienzo es imperative (canvas), así que los trazos se pintan tras el render.
    // afterRenderEffect corre solo en el navegador, nunca en el servidor.
    afterRenderEffect(() => {
      this.strokes(); // dependencia: se repinta cuando cambian los trazos
      this.paint();
    });
  }

  ngOnInit(): void {
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
    ]);

    const savedLevel = this.progress.getLevel(this.GAME_ID);
    this.session.startSession(
      {
        gameId: this.GAME_ID,
        sessionDurationMs: 5 * 60 * 1000,
        requiredCorrectForLevelUp: this.requiredCorrect,
        maxLevel: this.MAX_LEVEL,
        initialLevel: savedLevel,
      },
      this.activeProfile()?.age,
    );

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateProblem();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.unsubscribeEvents?.();
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* sin voz */
    }
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type !== 'level-up') return;
    this.audio.playLevelUp();
    this.triggerConfetti();
    if (event.payload?.['isMaxLevel']) return;
    this.later(() => {
      if (!this.isOver()) this.generateProblem();
    }, 2500);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    const age = this.activeProfile()?.age ?? 6;
    const p = buildCompositionProblem(this.currentLevel(), age);

    this.problem.set(p);
    this.tray.set([...p.tray]);
    this.placed.set(p.slots.map(() => null));
    this.step.set('story');
    this.line.set('');
    this.hint.set('');
    this.busy.set(false);
    this.reflecting.set(false);
    this.showSiblings.set(false);
    this.showGhostInDraw.set(true);
    this.strokes.set([]);
    this.drawing = null;
    this.localFeedback.set('idle');
  }

  /** Lectura de la pieza según el mundo (kana o pinyin) */
  pieceReading(_kanji: string, reading: string, pinyin: string): string {
    return this.showPinyin() ? pinyin : reading;
  }

  /** Emoji de una pieza, para la fase de historia */
  emojiOf(kanji: string): string {
    return pieceData(kanji).emoji;
  }

  // ============================================
  // PASO 1 → 2: HISTORIA
  // ============================================

  startComposing(): void {
    this.audio.retryPendingAudio();
    this.step.set('compose');
    // Nada de texto que cante un acierto antes de tiempo: aquí empieza la investigación.
    this.line.set(
      this.showGhost()
        ? '👀 Mira el dibujo borroso. ¿Qué piezas crees que necesita?'
        : '🤔 ¿Qué pieza va en cada hueco? Puedes probarlas.',
    );
    // Se dice el kanji en voz alta para anclar el sonido antes de construirlo
    this.speak(this.target()?.kanji ?? '');
  }

  // ============================================
  // PASO 2: COMPOSICIÓN
  // ============================================

  onDragEnded(event: CdkDragEnd, piece: TrayPiece): void {
    this.lastDragEnd = Date.now();
    const slots = this.slotEls().map(s => s.nativeElement.getBoundingClientRect());
    const { x, y } = event.dropPoint;

    // El margen permite soltar "cerca" sin ser demasiado permisivo con los dedos pequeños
    const m = 40;
    const hit = slots.findIndex(
      r => x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m,
    );

    if (hit >= 0) {
      this.place(hit, piece);
    } else {
      // Si no cayó en ningún hueco, la pieza vuelve a su sitio
      event.source.reset();
    }
  }

  /** Tap como alternativa al arrastre: coloca en el primer hueco libre */
  onTap(piece: TrayPiece): void {
    if (Date.now() - this.lastDragEnd < 300) return; // ignora el click que sigue al arrastre
    const free = this.placed().findIndex(p => p === null);
    if (free < 0) return;
    this.place(free, piece);
  }

  /** Devuelve a la bandeja una pieza ya colocada */
  pickBack(index: number): void {
    if (this.busy() || this.isOver()) return;
    const occupant = this.placed()[index];
    if (!occupant) return;
    this.placed.update(list => {
      const copy = [...list];
      copy[index] = null;
      return copy;
    });
    this.tray.update(list => [...list, this.toTrayPiece(occupant)]);
    this.hint.set('');
  }

  private toTrayPiece(placed: PlacedPiece): TrayPiece {
    return {
      trayId: placed.trayId,
      kanji: placed.kanji,
      emoji: placed.emoji,
      reading: '',
      pinyin: '',
      meaning: '',
      correct: true,
    };
  }

  private place(index: number, piece: TrayPiece): void {
    if (this.busy() || this.isOver()) return;
    this.audio.retryPendingAudio();

    // Si el hueco ya tenía algo, esa vuelve a la bandeja
    this.placed.update(list => {
      const copy = [...list];
      const occupant = copy[index];
      if (occupant) this.tray.update(t => [...t, this.toTrayPiece(occupant)]);
      copy[index] = { trayId: piece.trayId, kanji: piece.kanji, emoji: piece.emoji };
      return copy;
    });
    this.tray.update(list => list.filter(t => t.trayId !== piece.trayId));
    this.hint.set('');

    if (this.allFilled()) this.evaluate();
  }

  /**
   * Evalúa la composición SIN decir si está bien o mal: clasifica la situación y
   * lanza la pregunta socrática correspondiente.
   */
  private evaluate(): void {
    const p = this.problem();
    if (!p) return;

    const placed = this.placed() as PlacedPiece[];
    const exact = placed.every((piece, i) => piece.kanji === p.slots[i]!.kanji);

    if (exact) {
      this.onComposed();
      return;
    }

    // ¿Son las piezas correctas pero colocadas en otro orden?
    const placedSorted = placed.map(x => x.kanji).sort().join('|');
    const neededSorted = p.slots.map(s => s.kanji).sort().join('|');
    const moment: SocraticMoment =
      placedSorted === neededSorted ? 'right-pieces-wrong-place' : 'wrong-piece';

    // No se penaliza ni se rompe la racha: se devuelve una pregunta
    this.line.set(pickLine(moment));
    this.hint.set('🤔 Prueba otra vez, o muévelas y observa qué cambia');
    this.audio.playFailure();
    this.later(() => {
      this.line.set('');
      this.hint.set('');
    }, 3200);
  }

  private onComposed(): void {
    this.busy.set(true);
    this.localFeedback.set('success');
    this.hint.set('');
    this.speak(this.target()?.kanji ?? '');

    // Si el kanji tiene "hermanos", es el mejor momento para el descubrimiento
    const siblings = this.target()?.siblings ?? [];
    if (siblings.length > 0) {
      this.later(() => {
        this.showSiblings.set(true);
        this.line.set(pickLine('sibling-discovery'));
      }, 900);
    }
    this.later(() => {
      // busy se suelta aquí: mientras compose está bloqueado, pero al pasar a dibujar
      // debe volver a estar libre o finishDrawing() nunca llegaría a registrar el acierto.
      this.busy.set(false);
      this.step.set('draw');
    }, 2200);
  }

  dismissSiblings(): void {
    this.showSiblings.set(false);
    this.step.set('draw');
  }

  // ============================================
  // PASO 3: DIBUJAR
  // ============================================

  private canvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const el = this.canvasRef()?.nativeElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: (event.clientX - r.left) / r.width,
      y: (event.clientY - r.top) / r.height,
    };
  }

  onPointerDown(event: PointerEvent): void {
    const p = this.canvasPoint(event);
    if (!p) return;
    this.canvasRef()?.nativeElement.setPointerCapture(event.pointerId);
    this.drawing = [p];
    this.strokes.update(s => [...s, this.drawing!]);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drawing) return;
    const p = this.canvasPoint(event);
    if (!p) return;
    this.drawing.push(p);
    // Redibuja solo el trazo en curso para no repintar todo el lienzo
    this.strokes.update(s => [...s]);
  }

  onPointerUp(): void {
    this.drawing = null;
  }

  undoStroke(): void {
    this.strokes.update(s => s.slice(0, -1));
  }

  clearCanvas(): void {
    this.strokes.set([]);
  }

  /** Pinta los trazos sobre el canvas; se llama con afterRenderEffect */
  paint(): void {
    const el = this.canvasRef()?.nativeElement;
    if (!el) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    const size = el.getBoundingClientRect();
    if (size.width === 0) return;
    if (el.width !== size.width * dpr || el.height !== size.height * dpr) {
      el.width = size.width * dpr;
      el.height = size.height * dpr;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.guide().color;
    ctx.lineWidth = Math.max(6, size.width * 0.035);

    for (const stroke of this.strokes()) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x * size.width, stroke[0]!.y * size.height);
      for (const pt of stroke.slice(1)) ctx.lineTo(pt.x * size.width, pt.y * size.height);
      // Un solo punto = toque; se marca igual para que se vea
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x * size.width + 0.5, stroke[0]!.y * size.height);
      ctx.stroke();
    }
  }

  finishDrawing(): void {
    if (this.isOver() || this.busy()) return;
    if (this.strokes().length === 0) {
      this.hint.set('👆 Dibuja con el dedo o el lápiz, aunque sea con una línea');
      return;
    }
    this.line.set(pickLine('draw-done'));
    this.finishProblem();
  }

  // ============================================
  // FIN DE PROBLEMA
  // ============================================

  private finishProblem(): void {
    this.localFeedback.set('success');
    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL,
      });
      return;
    }

    this.audio.playPraise();
    this.triggerConfetti();

    // A los 6 años: reflexión de un toque antes del siguiente kanji
    if ((this.activeProfile()?.age ?? 6) >= 6) {
      this.later(() => this.reflecting.set(true), 1600);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2800);
    }
  }

  readonly reflections = [
    { emoji: '🧩', text: 'Conté los huecos' },
    { emoji: '💡', text: 'Pensé en la historia' },
    { emoji: '🔎', text: 'Probé otra posición' },
  ];

  chooseReflection(): void {
    if (this.isOver()) return;
    this.audio.retryPendingAudio();
    this.generateProblem();
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  // ============================================
  // UTILIDADES
  // ============================================

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
  }

  private speak(kanji: string): void {
    if (!kanji) return;
    try {
      if (typeof speechSynthesis === 'undefined') return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(kanji);
      u.lang = this.script() === 'japanese' ? 'ja-JP' : 'zh-CN';
      u.rate = 0.7;
      speechSynthesis.speak(u);
    } catch {
      /* sin voz: el juego sigue */
    }
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