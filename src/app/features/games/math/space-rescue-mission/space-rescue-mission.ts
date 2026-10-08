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
import { REQUIRED_PER_LEVEL, RescueProblem, buildRescueProblem, starsFor } from './rescue-problem';

/**
 * "Misión de rescate" - Suma Espacial 4 (modo pareja, una sola pantalla)
 *
 * Un alien pide estrellas. Las cajas traen k estrellas cada una.
 *  1. La NAVEGANTE (la mayor) decide cuántas cajas hacen falta  -> plan
 *  2. La INGENIERA (la menor) arrastra esas cajas a la bahía     -> build
 *  3. Se cuenta de k en k en voz alta y se compara con la petición -> check
 *     Si no coincide el alien dice cuánto falta o sobra y la Navegante replanea.
 *
 * Equivocarse es explorar: no rompe la racha. Si hubo que replanear, el alien
 * "regresa" dos peticiones después con la misma cuenta (repetición espaciada).
 * El mapa muestra el avance de la nave: una parada por rescate de la misión.
 */
type Phase = 'plan' | 'build' | 'check';

interface Crate {
  id: number;
  loaded: boolean;
  order: number;
}

interface ReturningAlien {
  problem: RescueProblem;
  dueIn: number;
}

const ALIENS = ['👽', '👾', '🐙', '🤖', '🦑', '🛸'];
const PLANETS = ['🌍', '🪐', '🌕', '🔴', '🟣', '🟢'];

@Component({
  selector: 'space-rescue-mission',
  standalone: true,
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './space-rescue-mission.html',
  styleUrl: './space-rescue-mission.scss'
})
export class SpaceRescueMission implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // Configuración
  readonly GAME_ID = 'space-rescue-mission';
  readonly MAX_LEVEL = 10;
  readonly requiredCorrect = REQUIRED_PER_LEVEL;
  readonly stops = PLANETS.slice(0, REQUIRED_PER_LEVEL + 1);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Estado de la petición
  readonly problem = signal<RescueProblem>(buildRescueProblem(1));
  readonly alien = signal('👽');
  readonly returning = signal(false);
  readonly phase = signal<Phase>('plan');
  readonly plan = signal<number | null>(null);
  readonly triedPlans = signal<number[]>([]);
  readonly crates = signal<Crate[]>([]);
  readonly hint = signal('');
  readonly running = signal<number | null>(null);   // cuenta en curso durante la comprobación
  readonly highlight = signal(-1);
  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

  // Derivados
  readonly loadedCrates = computed(() =>
    this.crates().filter(c => c.loaded).sort((a, b) => a.order - b.order));
  readonly supplyCrates = computed(() => this.crates().filter(c => !c.loaded));
  readonly emptySlots = computed(() =>
    Array.from({ length: Math.max(0, (this.plan() ?? 0) - this.loadedCrates().length) }));
  readonly starIcons = computed(() => Array.from({ length: this.problem().boxSize }));
  readonly shipPosition = computed(() =>
    Math.min(100, (this.consecutiveCorrect() / this.requiredCorrect) * 100));

  /** Navegante = la mayor, Ingeniera = la menor (si hay dos perfiles de edades distintas) */
  readonly crew = computed(() => {
    const list = [...this.profileState.profiles()].sort((a, b) => b.age - a.age);
    if (list.length >= 2 && list[0].age > list[list.length - 1].age) {
      return { navigator: list[0].name, engineer: list[list.length - 1].name };
    }
    return { navigator: '', engineer: '' };
  });

  readonly request = computed(() => {
    const p = this.problem();
    return p.have > 0
      ? `Ya tengo ${p.have} ⭐ y necesito ${p.need}. Cada caja trae ${p.boxSize} ⭐`
      : `Necesito ${p.need} ⭐ para mi nave. Cada caja trae ${p.boxSize} ⭐`;
  });

  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle' as const;
    if (s.isCompleted || s.isTimeUp) return 'game-over' as const;
    return this.localFeedback();
  });
  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly idleMessage = computed(() => {
    switch (this.phase()) {
      case 'plan': return '🧭 Navegante: ¿cuántas cajas hacen falta?';
      case 'build': return `🔧 Ingeniera: ¡carga ${this.plan()} ${this.plan() === 1 ? 'caja' : 'cajas'}!`;
      default: return '¡Contemos las estrellas juntas! ✨';
    }
  });

  readonly customFeedbackMessages = {
    success: [
      '¡Rescate completado! 🚀',
      '¡El alien está feliz! 👽',
      '¡Gran trabajo en equipo! 🌟',
      '¡Cuenta perfecta! ⭐'
    ],
    'try-again': [
      '¡Casi! Pensemos juntas otra vez ✨',
      'Revisemos el plan con calma 🌈',
      '¡Vamos, otro intento en equipo! 🚀'
    ],
    'level-up': ['¡MISIÓN CUMPLIDA! 🎉', '¡NIVEL SUPERADO! 🚀✨'],
    'game-over': ['¡Rescataron a todos los aliens! 🏆', '¡Felicidades, gran tripulación! 🌈']
  };

  // Internos
  private readonly bay = viewChild<ElementRef<HTMLElement>>('bay');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private readonly returnQueue: ReturningAlien[] = [];
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private orderSeq = 0;
  private lastDragEnd = 0;
  private attempts = 0;           // planes probados en la petición actual
  private currentIsReturn = false;

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
  // GENERACIÓN
  // ============================================

  generateProblem(): void {
    this.clearTimers();

    // ¿Algún alien debe regresar? (repetición espaciada: reaparece tras 2 peticiones)
    this.returnQueue.forEach(r => r.dueIn--);
    const dueIdx = this.returnQueue.findIndex(r => r.dueIn <= 0);
    let problem: RescueProblem;
    if (dueIdx >= 0) {
      const [back] = this.returnQueue.splice(dueIdx, 1);
      problem = back.problem;
      this.currentIsReturn = true;
    } else {
      problem = buildRescueProblem(this.currentLevel());
      this.currentIsReturn = false;
    }

    this.problem.set(problem);
    this.alien.set(ALIENS[Math.floor(Math.random() * ALIENS.length)]);
    this.returning.set(this.currentIsReturn);
    this.resetRound();
    this.attempts = 0;
    this.triedPlans.set([]);
    this.hint.set('');
    this.localFeedback.set('idle');
  }

  private resetRound(): void {
    this.orderSeq = 0;
    this.plan.set(null);
    this.running.set(null);
    this.highlight.set(-1);
    this.crates.set(
      Array.from({ length: this.problem().pool }, (_, id) => ({ id, loaded: false, order: -1 }))
    );
    this.phase.set('plan');
  }

  // ============================================
  // 1. PLAN (Navegante)
  // ============================================

  choosePlan(n: number): void {
    if (this.phase() !== 'plan' || this.isOver() || this.solved()) return;
    if (this.triedPlans().includes(n)) return;
    this.audio.retryPendingAudio();
    this.attempts++;
    this.triedPlans.update(list => [...list, n]);
    this.plan.set(n);
    this.hint.set('');
    this.localFeedback.set('idle');
    this.phase.set('build');
  }

  // ============================================
  // 2. CONSTRUIR (Ingeniera)
  // ============================================

  loadCrate(id: number): void {
    if (this.phase() !== 'build' || this.isOver() || this.solved()) return;
    const crate = this.crates().find(c => c.id === id);
    if (!crate || crate.loaded) return;
    const planned = this.plan() ?? 0;
    if (this.loadedCrates().length >= planned) {
      this.hint.set(`El plan dice ${planned} ${planned === 1 ? 'caja' : 'cajas'} 🧭`);
      return;
    }
    this.audio.retryPendingAudio();
    const order = this.orderSeq++;
    this.crates.update(list => list.map(c => c.id === id ? { ...c, loaded: true, order } : c));
    this.hint.set('');

    if (this.loadedCrates().length === planned) {
      this.later(() => this.check(), 700);
    }
  }

  /** Antes de que se llene el plan, tocar una caja cargada la devuelve al almacén */
  unloadCrate(crate: Crate): void {
    if (this.phase() !== 'build' || this.isOver()) return;
    this.crates.update(list => list.map(c => c.id === crate.id ? { ...c, loaded: false, order: -1 } : c));
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
        this.loadCrate(id);
      }
    }
    if (!this.crates().find(c => c.id === id)?.loaded) event.source.reset();
  }

  /** Tocar una caja también la carga (para quien aún no arrastra bien) */
  onTap(id: number): void {
    if (Date.now() - this.lastDragEnd < 300) return;   // ignora el click que sigue a un arrastre
    this.loadCrate(id);
  }

  // ============================================
  // 3. COMPROBAR (juntas): contar de k en k
  // ============================================

  private check(): void {
    if (this.phase() !== 'build' || this.isOver()) return;
    this.phase.set('check');
    const p = this.problem();
    const n = this.plan() ?? 0;

    // Se parte de lo que el alien ya tiene y se suma una caja a la vez
    let total = p.have;
    this.running.set(total);
    if (p.have > 0) this.speak(p.have);

    const step = 850;
    for (let i = 0; i < n; i++) {
      this.later(() => {
        total += p.boxSize;
        this.highlight.set(i);
        this.running.set(total);
        this.speak(total);
      }, (i + 1) * step);
    }
    this.later(() => this.resolve(), (n + 1) * step + 300);
  }

  private resolve(): void {
    const p = this.problem();
    const total = starsFor(p.have, p.boxSize, this.plan() ?? 0);
    if (total === p.need) {
      this.onCorrect();
      return;
    }

    // Plan equivocado: es una pista, no un castigo (no rompe la racha)
    this.localFeedback.set('try-again');
    this.audio.playFailure();
    this.hint.set(
      total < p.need
        ? `Tengo ${total} ⭐ y necesito ${p.need}. ¡Me faltan ${p.need - total}! 🤔`
        : `Tengo ${total} ⭐ y necesito ${p.need}. ¡Me sobran ${total - p.need}! 🤔`
    );
    this.later(() => {
      this.resetRound();
      this.localFeedback.set('idle');   // la pista se queda hasta el siguiente plan
    }, 3200);
  }

  private onCorrect(): void {
    this.localFeedback.set('success');
    const result = this.session.recordCorrect();

    // Si costó replanear y no era ya un regreso, el alien vuelve dentro de 2 peticiones
    if (this.attempts > 1 && !this.currentIsReturn) {
      this.returnQueue.push({ problem: this.problem(), dueIn: 2 });
    }

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
      }, 2600);
    }
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

  /** setTimeout que se cancela solo al destruir el componente o al generar otra petición */
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
