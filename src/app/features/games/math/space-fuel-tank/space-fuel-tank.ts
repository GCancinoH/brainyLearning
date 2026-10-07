import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
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
import { buildFuelProblem } from './fuel-tank-problem';

/**
 * "El tanque de combustible" - Suma Espacial 3 (método de barras)
 *
 * Llenar el tanque EXACTO arrastrando bloques de distinto tamaño. Hay varias soluciones
 * válidas; cada forma nueva se guarda en la galería de "combinaciones descubiertas".
 *
 *  - Explorar no se castiga: un bloque que no cabe vuelve a su sitio con una pregunta,
 *    nunca rompe la racha. La racha cuenta tanques completados.
 *  - Modo 'missing' (6 años, desde el nivel 4): el tanque ya trae una parte llena (parte-todo).
 *  - 6 años: al terminar, una reflexión de un toque ("¿cómo supiste qué bloques iban?").
 *  - 4 años (y 6 años en niveles 1-3): cuadritos unidad, pips en los bloques y conteo en voz alta.
 */
type Mode = 'fill' | 'missing';

interface FuelBlock {
  id: number;
  value: number;
  loaded: boolean;
  order: number;
}

interface Discovery {
  key: string;
  label: string;
}

@Component({
  selector: 'space-fuel-tank',
  standalone: true,
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './space-fuel-tank.html',
  styleUrl: './space-fuel-tank.scss'
})
export class SpaceFuelTank implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // Configuración
  readonly GAME_ID = 'space-fuel-tank';
  readonly MAX_LEVEL = 10;
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);
  readonly reflections = [
    { emoji: '🔧', text: 'Probé hasta que encajó' },
    { emoji: '🧠', text: 'Pensé cuánto faltaba' },
    { emoji: '🔢', text: 'Conté los cuadritos' }
  ];

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Estado del problema
  readonly goal = signal(5);
  readonly preFilled = signal(0);
  readonly mode = signal<Mode>('fill');
  readonly blocks = signal<FuelBlock[]>([]);
  readonly waysRequired = signal(1);
  readonly discovered = signal<Discovery[]>([]);
  readonly hint = signal('');
  readonly busy = signal(false);
  readonly reflecting = signal(false);
  readonly shaking = signal(false);
  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  // Derivados
  readonly capacity = computed(() => this.goal() - this.preFilled());
  readonly loadedBlocks = computed(() =>
    this.blocks().filter(b => b.loaded).sort((a, b) => a.order - b.order));
  readonly supplyBlocks = computed(() =>
    this.blocks().filter(b => !b.loaded).sort((a, b) => a.value - b.value));
  readonly filled = computed(() => this.loadedBlocks().reduce((sum, b) => sum + b.value, 0));
  readonly remaining = computed(() => this.capacity() - this.filled());

  /** ¿Se muestran cuadritos unidad, pips y conteo en voz alta? */
  readonly showUnits = computed(() => (this.activeProfile()?.age ?? 4) <= 4 || this.currentLevel() <= 3);

  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle' as const;
    if (s.isCompleted || s.isTimeUp) return 'game-over' as const;
    return this.localFeedback();
  });
  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly idleMessage = computed(() =>
    this.mode() === 'missing'
      ? `El tanque ya tiene ${this.preFilled()} de ${this.goal()}. ¿Con qué bloques lo llenas justo? ⛽`
      : `Llena el tanque justo hasta ${this.goal()} ⛽`);

  readonly customFeedbackMessages = {
    success: [
      '¡Tanque lleno! ⛽🚀',
      '¡Combustible perfecto! ⭐',
      '¡Qué gran ingeniera! 🛠️',
      '¡Listos para despegar! 🌟'
    ],
    'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨'],
    'game-over': ['¡Llenaste todos los tanques! 🏆', '¡Felicidades, eres una experta! 🌈']
  };

  // Internos
  private readonly tank = viewChild<ElementRef<HTMLElement>>('tank');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private orderSeq = 0;
  private lastDragEnd = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  ngOnInit(): void {
    const savedLevel = this.progress.getLevel(this.GAME_ID);

    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.requiredCorrect,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateProblem();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.unsubscribeEvents?.();
    try { if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel(); } catch { /* sin voz */ }
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type !== 'level-up') return;
    this.audio.playLevelUp();
    this.triggerConfetti();
    if (event.payload?.['isMaxLevel']) return;   // fin del juego: lo muestra el feedback
    this.later(() => {
      if (!this.isOver()) this.generateProblem();
    }, 2500);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    const age = this.activeProfile()?.age ?? 4;
    const p = buildFuelProblem(this.currentLevel(), age);

    this.orderSeq = 0;
    this.goal.set(p.goal);
    this.preFilled.set(p.preFilled);
    this.mode.set(p.preFilled > 0 ? 'missing' : 'fill');
    this.waysRequired.set(p.ways);
    this.blocks.set(p.values.map((value, id) => ({ id, value, loaded: false, order: -1 })));
    this.discovered.set([]);
    this.hint.set('');
    this.busy.set(false);
    this.reflecting.set(false);
    this.shaking.set(false);
    this.localFeedback.set('idle');
  }

  // ============================================
  // INTERACCIÓN
  // ============================================

  private tryLoad(id: number): void {
    if (this.busy() || this.reflecting() || this.isOver() || this.solved()) return;
    const block = this.blocks().find(b => b.id === id);
    if (!block || block.loaded) return;
    this.audio.retryPendingAudio();

    // No cabe: vuelve a su sitio con una pregunta (no rompe la racha)
    if (block.value > this.remaining()) {
      this.hint.set('¡Ese no cabe! ¿Cuánto espacio queda en el tanque? 🤔');
      this.shaking.set(true);
      this.later(() => this.shaking.set(false), 500);
      return;
    }

    const order = this.orderSeq++;
    this.blocks.update(list => list.map(b => b.id === id ? { ...b, loaded: true, order } : b));
    this.hint.set('');
    if (this.showUnits()) this.speak(this.preFilled() + this.filled());

    if (this.remaining() === 0) {
      this.onTankFull();
      return;
    }
    // Callejón sin salida: ningún bloque restante cabe
    if (!this.supplyBlocks().some(b => b.value <= this.remaining())) {
      this.hint.set('Ya no cabe ningún bloque… ¿cuál podrías quitar? 🤔');
    }
  }

  /** Tocar un bloque del tanque lo devuelve al almacén */
  unload(block: FuelBlock): void {
    if (this.busy() || this.reflecting() || this.isOver() || this.solved()) return;
    this.blocks.update(list => list.map(b => b.id === block.id ? { ...b, loaded: false, order: -1 } : b));
    this.hint.set('');
  }

  emptyTank(): void {
    if (this.busy() || this.reflecting() || this.isOver() || this.solved()) return;
    this.blocks.update(list => list.map(b => ({ ...b, loaded: false, order: -1 })));
    this.hint.set('');
  }

  onDragEnded(event: CdkDragEnd, id: number): void {
    this.lastDragEnd = Date.now();
    const el = this.tank()?.nativeElement;
    const { x, y } = event.dropPoint;
    if (el) {
      const r = el.getBoundingClientRect();
      const m = 14;
      if (x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m) {
        this.tryLoad(id);
      }
    }
    // Si no quedó cargado, vuelve a su sitio
    if (!this.blocks().find(b => b.id === id)?.loaded) event.source.reset();
  }

  /** Tocar un bloque también lo carga (para quien aún no arrastra bien) */
  onTap(id: number): void {
    if (Date.now() - this.lastDragEnd < 300) return;   // ignora el click que sigue a un arrastre
    this.tryLoad(id);
  }

  // ============================================
  // TANQUE LLENO
  // ============================================

  private onTankFull(): void {
    this.busy.set(true);
    const key = this.loadedBlocks().map(b => b.value).sort((a, b) => a - b).join('+');
    const label = (this.preFilled() > 0 ? `${this.preFilled()} + ` : '') + key.split('+').join(' + ');

    if (this.discovered().some(d => d.key === key)) {
      this.hint.set('¡Esa combinación ya la descubriste! ¿Hay otra forma? 🔎');
      this.later(() => this.clearTank(), 1800);
      return;
    }

    this.discovered.update(list => [...list, { key, label }]);

    if (this.discovered().length < this.waysRequired()) {
      this.audio.playPraise();
      this.hint.set(`¡Descubriste ${label}! ¿Puedes llenarlo de otra forma? 🔎`);
      this.later(() => this.clearTank(), 2000);
      return;
    }
    this.finishProblem();
  }

  private clearTank(): void {
    this.blocks.update(list => list.map(b => ({ ...b, loaded: false, order: -1 })));
    this.busy.set(false);
  }

  private finishProblem(): void {
    this.localFeedback.set('success');
    this.hint.set('');
    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      // El evento 'level-up' se maneja en handleSessionEvent
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL
      });
      return;
    }

    this.audio.playPraise();
    if ((this.activeProfile()?.age ?? 4) >= 6) {
      // Reflexión de un toque antes del siguiente tanque
      this.later(() => this.reflecting.set(true), 1500);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2400);
    }
  }

  chooseReflection(): void {
    if (this.isOver()) return;
    this.audio.retryPendingAudio();
    this.generateProblem();
  }

  // ============================================
  // VISTA
  // ============================================

  pct(value: number): number {
    return (value / this.goal()) * 100;
  }

  color(value: number): string {
    return `hsl(${(value * 47) % 360} 75% 48%)`;
  }

  unitsOf(value: number): number[] {
    return Array.from({ length: value }, (_, i) => i);
  }

  goBack(): void {
    this.router.navigate(['/games/math']);
  }

  // ============================================
  // UTILIDADES
  // ============================================

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
  }

  private speak(n: number): void {
    try {
      if (!this.audio.enabled() || typeof speechSynthesis === 'undefined') return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(n));
      u.lang = 'es-MX';
      u.rate = 0.85;
      u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch { /* sin voz disponible: el juego sigue */ }
  }

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch { /* noop */ }
  }

  /** setTimeout que se cancela solo al destruir el componente o al generar otro problema */
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
