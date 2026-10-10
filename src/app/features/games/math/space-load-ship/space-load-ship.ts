import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SpeechService } from '@core/services/speech.service';
import { SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';

/**
 * "Carga la nave" - Suma Espacial 2
 *
 * Modo 'count':   arrastra todos los cohetes a la bahía, cuéntalos y elige el total.
 * Modo 'missing': la nave necesita N cohetes, ya hay A cargados; carga los que faltan y despega.
 *
 * Andamiaje por edad:
 *  - 4 años (y 6 años en niveles 1-3): conteo en voz alta, número sobre cada cohete y huecos visibles.
 *  - 6 años desde el nivel 4: sin voz, sin números y sin huecos; ella lleva la cuenta.
 */
type Phase = 'loading' | 'answer';
type Mode = 'count' | 'missing';

interface CargoItem {
  id: number;
  group: 'A' | 'B';
  emoji: string;
  loaded: boolean;
  order: number;
}

@Component({
  selector: 'space-load-ship',
  standalone: true,
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './space-load-ship.html',
  styleUrl: './space-load-ship.scss'
})
export class SpaceLoadShip implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly speech = inject(SpeechService);

  readonly activeProfile = this.profileState.activeProfile;

  // Configuración
  readonly GAME_ID = 'space-load-ship';
  readonly MAX_LEVEL = 10;
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Estado del problema
  readonly numA = signal(1);
  readonly numB = signal(1);
  readonly mode = signal<Mode>('count');
  readonly phase = signal<Phase>('loading');
  readonly items = signal<CargoItem[]>([]);
  readonly options = signal<number[]>([]);
  readonly disabledOptions = signal<number[]>([]);
  readonly hint = signal('');
  readonly highlightIndex = signal(-1);
  readonly recounting = signal(false);
  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

  // Derivados
  readonly total = computed(() => this.numA() + this.numB());
  readonly loadedItems = computed(() =>
    this.items().filter(i => i.loaded).sort((a, b) => a.order - b.order));
  readonly loadedCount = computed(() => this.loadedItems().length);
  readonly sourceA = computed(() => this.items().filter(i => i.group === 'A' && !i.loaded));
  readonly sourceB = computed(() => this.items().filter(i => i.group === 'B' && !i.loaded));

  /** ¿Se cuenta en voz alta y se muestran números/huecos? */
  readonly countAloud = computed(() => (this.activeProfile()?.age ?? 4) <= 4 || this.currentLevel() <= 3);
  readonly showSlots = computed(() => this.mode() === 'count' && this.countAloud());
  readonly emptySlots = computed(() =>
    Array.from({ length: Math.max(0, this.total() - this.loadedCount()) }));
  readonly canLaunch = computed(() =>
    this.mode() === 'missing' && this.phase() === 'loading' && this.loadedCount() > this.numA());

  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle' as const;
    if (s.isCompleted || s.isTimeUp) return 'game-over' as const;
    return this.localFeedback();
  });
  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly idleMessage = computed(() => {
    if (this.mode() === 'missing') {
      return `La nave necesita ${this.total()} cohetes. ¿Cuántos faltan por cargar?`;
    }
    return this.phase() === 'loading'
      ? '¡Carga todos los cohetes en la nave! 🚀'
      : '¿Cuántos cohetes hay en total?';
  });

  readonly customFeedbackMessages = {
    success: [
      '¡Carga completa! 🚀',
      '¡Despegue perfecto! ⭐',
      '¡Cálculo espacial increíble! 🛸',
      '¡Eres una gran Comandante! 🌟'
    ],
    'try-again': [
      '¡Casi! Contemos juntas otra vez ✨',
      'Otra vez, con calma 🌈',
      '¡Vamos, un intento más! 🚀'
    ],
    'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨'],
    'game-over': ['¡Cargaste todas las naves! 🏆', '¡Felicidades, eres una experta! 🌈']
  };

  // Internos
  private readonly bay = viewChild<ElementRef<HTMLElement>>('bay');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private orderSeq = 0;
  private lastDragEnd = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  ngOnInit(): void {
    // El servicio es compartido: fija aquí los sonidos de este juego
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
  // GENERACIÓN DEL PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    const lvl = this.currentLevel();
    const age = this.activeProfile()?.age ?? 4;
    const cap = age <= 4 ? 4 : 8;

    let a: number;
    let b: number;
    if (lvl <= 3) { a = this.rand(1, 3); b = this.rand(1, 3); }
    else if (lvl <= 6) { a = this.rand(2, 5); b = this.rand(1, 4); }
    else if (lvl <= 8) { a = this.rand(3, 6); b = this.rand(2, 5); }
    else { a = this.rand(4, 8); b = this.rand(3, 6); }
    a = Math.min(a, cap);
    b = Math.min(b, cap);

    const mode: Mode = age >= 6 && lvl >= 6 && Math.random() < 0.5 ? 'missing' : 'count';

    this.orderSeq = 0;
    const items: CargoItem[] = [];
    let id = 0;
    if (mode === 'count') {
      for (let i = 0; i < a; i++) items.push({ id: id++, group: 'A', emoji: '🚀', loaded: false, order: -1 });
      for (let i = 0; i < b; i++) items.push({ id: id++, group: 'B', emoji: '🛸', loaded: false, order: -1 });
    } else {
      // A ya está cargado; el resto del pool trae 2 de más para que haya que decidir cuántos cargar
      for (let i = 0; i < a; i++) items.push({ id: id++, group: 'A', emoji: '🚀', loaded: true, order: this.orderSeq++ });
      for (let i = 0; i < b + 2; i++) items.push({ id: id++, group: 'B', emoji: '🛸', loaded: false, order: -1 });
    }

    this.numA.set(a);
    this.numB.set(b);
    this.mode.set(mode);
    this.items.set(items);
    this.options.set(this.buildOptions(a + b));
    this.disabledOptions.set([]);
    this.hint.set('');
    this.highlightIndex.set(-1);
    this.recounting.set(false);
    this.phase.set('loading');
    this.localFeedback.set('idle');
  }

  private buildOptions(correct: number): number[] {
    const candidates = [-3, -2, -1, 1, 2, 3].map(o => correct + o).filter(n => n > 0);
    const wrong = this.shuffle(candidates).slice(0, 2);
    return this.shuffle([correct, ...wrong]);
  }

  // ============================================
  // INTERACCIÓN: CARGAR / DESCARGAR
  // ============================================

  loadItem(id: number): void {
    if (this.phase() !== 'loading' || this.isOver() || this.solved()) return;
    const item = this.items().find(i => i.id === id);
    if (!item || item.loaded) return;

    this.audio.retryPendingAudio();
    const order = this.orderSeq++;
    this.items.update(list => list.map(i => i.id === id ? { ...i, loaded: true, order } : i));
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');
    this.hint.set('');

    if (this.mode() === 'count') {
      const count = this.loadedCount();
      if (this.countAloud()) this.speak(count);
      if (count === this.total()) {
        this.later(() => this.phase.set('answer'), 700);
      }
    }
  }

  /** Solo en modo 'missing': tocar un cohete cargado por ella lo devuelve al almacén */
  unloadItem(item: CargoItem): void {
    if (this.mode() !== 'missing' || this.phase() !== 'loading' || this.solved() || this.isOver()) return;
    if (item.group !== 'B') return;
    this.items.update(list => list.map(i => i.id === item.id ? { ...i, loaded: false, order: -1 } : i));
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');
    this.hint.set('');
  }

  onDragEnded(event: CdkDragEnd, id: number): void {
    this.lastDragEnd = Date.now();
    const bayEl = this.bay()?.nativeElement;
    const { x, y } = event.dropPoint;
    if (bayEl) {
      const r = bayEl.getBoundingClientRect();
      const m = 12;
      if (x >= r.left - m && x <= r.right + m && y >= r.top - m && y <= r.bottom + m) {
        this.loadItem(id);
      }
    }
    // Si no quedó cargado, vuelve a su sitio
    if (!this.items().find(i => i.id === id)?.loaded) event.source.reset();
  }

  /** Tocar un cohete también lo carga (para quien no arrastra bien aún) */
  onTap(id: number): void {
    if (Date.now() - this.lastDragEnd < 300) return;   // ignora el click que sigue a un arrastre
    this.loadItem(id);
  }

  // ============================================
  // RESPONDER
  // ============================================

  selectOption(opt: number): void {
    if (this.phase() !== 'answer' || this.isOver() || this.solved()) return;
    if (this.disabledOptions().includes(opt)) return;
    this.audio.retryPendingAudio();

    if (opt === this.total()) {
      this.onCorrect();
    } else {
      this.localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.disabledOptions.update(list => [...list, opt]);
      this.audio.playFailure();
      // "¿Estás segura? Vamos a comprobarlo juntas": recuento guiado
      this.later(() => this.recount(), 700);
    }
  }

  /** Modo 'missing': comprobar la carga */
  launch(): void {
    if (!this.canLaunch() || this.isOver() || this.solved()) return;
    this.audio.retryPendingAudio();
    const loaded = this.loadedCount();
    const target = this.total();

    if (loaded === target) {
      this.onCorrect();
      return;
    }
    this.localFeedback.set('try-again');
    this.session.recordIncorrect();
    this.audio.playFailure();
    this.hint.set(loaded < target
      ? `Ahora hay ${loaded}. ¿Cuántos faltan para llegar a ${target}? 🤔`
      : `Ahora hay ${loaded}, ¡y la meta es ${target}! ¿Sobra alguno? 🤔`);
  }

  private onCorrect(): void {
    this.localFeedback.set('success');
    this.hint.set('');
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
        if (!this.isOver()) this.generateProblem();
      }, 2200);
    }
  }

  /** Resalta y cuenta en voz alta los cohetes de la bahía, uno a uno */
  recount(): void {
    if (this.recounting()) return;
    const total = this.loadedCount();
    if (total === 0) return;
    this.recounting.set(true);
    this.highlightIndex.set(-1);
    for (let i = 0; i < total; i++) {
      this.later(() => {
        this.highlightIndex.set(i);
        this.speak(i + 1);
      }, i * 650);
    }
    this.later(() => {
      this.highlightIndex.set(-1);
      this.recounting.set(false);
    }, total * 650 + 300);
  }

  showNum(index: number): boolean {
    return this.mode() === 'count' && (this.countAloud() || this.highlightIndex() >= index);
  }

  // ============================================
  // NAVEGACIÓN
  // ============================================

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
    if (!this.audio.enabled()) return;
    // delegated a SpeechService: without a LOCAL voice for es-MX nothing is attempted
    // (a network voice fails silently when offline). The game continues either way.
    this.speech.speak(String(n), 'es-MX', { rate: 0.85, pitch: 1.1 });
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

  private rand(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
