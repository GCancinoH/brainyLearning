import { Component, ElementRef, OnDestroy, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { GNode, Puzzle, buildPuzzle, degrees, edgeBetween, oddNodes } from './graph-puzzle';

/**
 * "Caminos y puentes" (topología y grafos)
 *
 *  - 4 años: la rana llega a su casa sin pisar los caminos rojos.
 *  - 6 años: cruzar TODOS los puentes exactamente una vez. Desde el nivel 8 hay mapas
 *    que no se pueden resolver y hay que descubrirlo (la idea de Euler en Königsberg).
 *
 * Se juega arrastrando el dedo de punto en punto, o tocando el siguiente punto.
 * Método Zvonkin: las pistas son preguntas ("¿cuántas líneas llegan a este punto?"),
 * no respuestas. Equivocarse no rompe la racha salvo que el mapa se haya atorado (3+ tropiezos).
 */
@Component({
  selector: 'paths-bridges',
  standalone: true,
  imports: [GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './paths-bridges.html',
  styleUrl: './paths-bridges.scss'
})
export class PathsBridges implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // Configuración
  readonly GAME_ID = 'paths-bridges';
  readonly MAX_LEVEL = 10;
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Estado del mapa
  readonly puzzle = signal<Puzzle>(buildPuzzle(1, 4));
  /** Puntos recorridos, en orden (en 'trail' empieza en la rana; en 'euler' vacío hasta que elige dónde empezar) */
  readonly path = signal<number[]>([]);
  /** 'euler': puentes ya cruzados */
  readonly usedEdges = signal<number[]>([]);
  readonly hint = signal('');
  readonly flashEdge = signal<number | null>(null);
  readonly resets = signal(0);
  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private bumps = 0;
  private dragging = false;

  // Derivados
  readonly isEuler = computed(() => this.puzzle().mode === 'euler');
  readonly nodeMap = computed(() => new Map(this.puzzle().nodes.map(n => [n.id, n])));
  readonly current = computed(() => this.path().at(-1) ?? -1);
  readonly viewBox = computed(() => `0 0 ${this.puzzle().width} ${this.puzzle().height}`);

  readonly edgeLines = computed(() => {
    const p = this.puzzle();
    const nodes = this.nodeMap();
    const walked = this.isEuler() ? new Set(this.usedEdges()) : this.walkedTrailEdges();
    return p.edges.map(e => {
      const a = nodes.get(e.a)!;
      const b = nodes.get(e.b)!;
      return { id: e.id, kind: e.kind, x1: a.x, y1: a.y, x2: b.x, y2: b.y, walked: walked.has(e.id) };
    });
  });

  private readonly walkedTrailEdges = computed(() => {
    const ids = new Set<number>();
    const path = this.path();
    for (let i = 0; i + 1 < path.length; i++) {
      const e = edgeBetween(this.puzzle().edges, path[i], path[i + 1]);
      if (e) ids.add(e.id);
    }
    return ids;
  });

  readonly nodeViews = computed(() => {
    const p = this.puzzle();
    const deg = degrees(p.edges);
    const odd = new Set(oddNodes(p.edges));
    const startHint = this.isEuler() && this.currentLevel() <= 4 && this.path().length === 0 && odd.size === 2;
    return p.nodes.map(n => ({
      ...n,
      degree: deg.get(n.id) ?? 0,
      isStart: !this.isEuler() && n.id === p.start,
      isGoal: !this.isEuler() && n.id === p.goal,
      isCurrent: n.id === this.current(),
      glow: startHint && odd.has(n.id)
    }));
  });

  /** Con qué ayuda se ven los números: niveles 1-3, o tras 2 intentos fallidos */
  readonly showDegrees = computed(() => this.isEuler() && (this.currentLevel() <= 3 || this.resets() >= 2));
  readonly canSayImpossible = computed(() => this.isEuler() && this.currentLevel() >= 8);

  readonly solvedCount = computed(() => this.usedEdges().length);
  readonly stuck = computed(() => {
    if (!this.isEuler() || this.solved() || this.path().length === 0) return false;
    const here = this.current();
    const used = new Set(this.usedEdges());
    return !this.puzzle().edges.some(e => !used.has(e.id) && (e.a === here || e.b === here));
  });

  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle' as const;
    if (s.isCompleted || s.isTimeUp) return 'game-over' as const;
    return this.localFeedback();
  });
  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly idleMessage = computed(() => {
    if (!this.isEuler()) return 'Lleva a la rana a su casa 🏠 sin pisar las líneas rojas 🔥';
    if (this.canSayImpossible()) return 'Cruza cada puente una sola vez 🌉… ¡o descubre que no se puede! 🤔';
    return 'Cruza cada puente exactamente una vez 🌉';
  });

  readonly customFeedbackMessages = {
    success: [
      '¡Lo lograste! 🌟',
      '¡Qué buena exploradora! 🧭',
      '¡Camino perfecto! ✨',
      '¡Ojo de ingeniera! 🌉'
    ],
    'try-again': [
      'Piensa otro camino 🤔',
      'Mira bien el mapa 🔍',
      '¡Un intento más! 🚀'
    ],
    'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨'],
    'game-over': ['¡Recorriste todos los mapas! 🏆', '¡Felicidades, eres una experta! 🌈']
  };

  // Internos
  private readonly board = viewChild<ElementRef<SVGSVGElement>>('board');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;

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
    this.generatePuzzle();
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
      if (!this.isOver()) this.generatePuzzle();
    }, 2500);
  }

  // ============================================
  // MAPA
  // ============================================

  generatePuzzle(): void {
    this.clearTimers();
    const p = buildPuzzle(this.currentLevel(), this.activeProfile()?.age ?? 4);
    this.puzzle.set(p);
    this.resets.set(0);
    this.bumps = 0;
    this.localFeedback.set('idle');
    this.resetPath();
  }

  /** Vuelve al inicio del mismo mapa */
  restart(): void {
    if (this.solved() || this.isOver()) return;
    if (this.isEuler() && this.path().length > 0) this.resets.update(n => n + 1);
    this.resetPath();
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');
  }

  private resetPath(): void {
    const p = this.puzzle();
    this.path.set(p.mode === 'trail' ? [p.start] : []);
    this.usedEdges.set([]);
    this.hint.set('');
    this.flashEdge.set(null);
  }

  /** Quita el último paso */
  undo(): void {
    if (this.solved() || this.isOver()) return;
    const path = this.path();
    if (path.length === 0) return;
    if (this.isEuler()) {
      this.usedEdges.update(list => list.slice(0, -1));
      this.path.set(path.slice(0, -1));
    } else if (path.length > 1) {
      this.path.set(path.slice(0, -1));
    }
    this.hint.set('');
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');
  }

  // ============================================
  // INTERACCIÓN (dedo / mouse sobre el SVG)
  // ============================================

  onPointerDown(event: PointerEvent): void {
    if (this.isOver() || this.solved()) return;
    this.audio.retryPendingAudio();
    this.dragging = true;
    try { this.board()?.nativeElement.setPointerCapture(event.pointerId); } catch { /* sin captura */ }
    this.touch(event);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.dragging) this.touch(event);
  }

  onPointerUp(): void {
    this.dragging = false;
  }

  private touch(event: PointerEvent): void {
    const svg = this.board()?.nativeElement;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const { x, y } = pt.matrixTransform(ctm.inverse());

    let near: GNode | null = null;
    let best = 11;   // radio de captura (en unidades del lienzo; el espacio entre puntos es 24)
    for (const n of this.puzzle().nodes) {
      const d = Math.hypot(n.x - x, n.y - y);
      if (d < best) { best = d; near = n; }
    }
    if (near) this.goTo(near.id);
  }

  private goTo(to: number): void {
    const path = this.path();
    const here = this.current();
    if (to === here) return;

    if (this.isEuler()) {
      if (path.length === 0) {                       // elige dónde empezar
        this.path.set([to]);
        this.hint.set('');
        return;
      }
      const edge = edgeBetween(this.puzzle().edges, here, to);
      if (!edge) return;                             // no hay puente directo: se ignora
      if (this.usedEdges().includes(edge.id)) {
        // Volver por el puente anterior = deshacer; cruzar uno viejo = tropiezo
        if (path.length >= 2 && path[path.length - 2] === to && this.usedEdges().at(-1) === edge.id) {
          this.undo();
        } else {
          this.bump(edge.id, 'Ya cruzaste ese puente 🌉 ¿Cuántos puentes te faltan?');
        }
        return;
      }
      this.usedEdges.update(list => [...list, edge.id]);
      this.path.update(list => [...list, to]);
      this.hint.set('');
      if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');

      if (this.usedEdges().length === this.puzzle().edges.length) {
        this.later(() => this.onSolved(), 500);
      } else if (this.stuck()) {
        this.hint.set('¡Te quedaste sin puentes en este punto! ¿Probamos empezar en otro lugar? 🤔');
        this.localFeedback.set('try-again');
        this.audio.playFailure();
      }
      return;
    }

    // 'trail': la rana avanza por caminos seguros
    const edge = edgeBetween(this.puzzle().edges, here, to);
    if (!edge) return;
    if (edge.kind === 'danger') {
      this.bump(edge.id, '¡Esa línea roja quema! 🔥 ¿Por dónde más puede ir la rana?');
      return;
    }
    if (path.length >= 2 && path[path.length - 2] === to) {   // volver un paso
      this.path.set(path.slice(0, -1));
      return;
    }
    this.path.update(list => [...list, to]);
    this.hint.set('');
    if (this.localFeedback() === 'try-again') this.localFeedback.set('idle');
    if (to === this.puzzle().goal) this.later(() => this.onSolved(), 400);
  }

  /** Tropiezo: pista en forma de pregunta, sin castigo inmediato */
  private bump(edgeId: number, message: string): void {
    if (this.flashEdge() === edgeId) return;   // arrastrar sobre la misma línea no cuenta muchas veces
    this.bumps++;
    this.hint.set(message);
    this.localFeedback.set('try-again');
    this.audio.playFailure();
    this.flashEdge.set(edgeId);
    this.later(() => this.flashEdge.set(null), 500);
  }

  /** 6 años, nivel 8+: "No se puede" */
  sayImpossible(): void {
    if (!this.canSayImpossible() || this.solved() || this.isOver()) return;
    this.audio.retryPendingAudio();
    if (!this.puzzle().possible) {
      this.onSolved();
    } else {
      this.bumps++;
      this.localFeedback.set('try-again');
      this.audio.playFailure();
      this.hint.set('¡Mira bien! Creo que sí hay un camino 🔎 ¿Cuántas líneas llegan a cada punto?');
      this.resets.update(n => Math.max(n, 2));   // enseña los números
    }
  }

  private onSolved(): void {
    if (this.isOver() || this.solved()) return;
    this.localFeedback.set('success');
    if (!this.puzzle().possible) {
      this.hint.set(`¡Exacto! Hay ${oddNodes(this.puzzle().edges).length} puntos con líneas impares: no se puede 🧠`);
    } else {
      this.hint.set('');
    }
    // Mapa atorado (3 o más tropiezos): no cuenta para la racha
    if (this.bumps >= 3) this.session.recordIncorrect();
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
        if (!this.isOver()) this.generatePuzzle();
      }, 2800);
    }
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

  /** setTimeout que se cancela solo al destruir el componente o al generar otro mapa */
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
