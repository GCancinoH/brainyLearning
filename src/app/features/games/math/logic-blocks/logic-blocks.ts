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
import {
  Block, COLOR_HEX, Region, Round, blocksToPlace, buildRound, describeBlock, hintFor, label,
  regionOf, vennRegionAt
} from './logic-blocks-problem';

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

@Component({
  selector: 'logic-blocks',
  standalone: true,
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './logic-blocks.html',
  styleUrl: './logic-blocks.scss'
})
export class LogicBlocks implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

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
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private lastDragEnd = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  ngOnInit(): void {
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
    this.round.set(buildRound(this.currentLevel(), this.activeProfile()?.age ?? 4));
    this.placed.set({});
    this.selectedId.set(null);
    this.hint.set('');
    this.shakeId.set(null);
    this.wrongCount = 0;
    this.localFeedback.set('idle');
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
    const id = this.selectedId();
    if (id === null) return;
    const region = this.regionAt(event.clientX, event.clientY);
    if (region !== null) this.place(id, region);
  }

  /** Devuelve true si la figura quedó bien colocada */
  private place(id: number, region: Region): boolean {
    if (this.isOver() || this.solved()) return false;
    const block = this.round().blocks.find(b => b.id === id);
    if (!block || this.placed()[id] !== undefined) return false;
    this.audio.retryPendingAudio();

    if (regionOf(this.round(), block) !== region) {
      this.wrongCount++;
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
