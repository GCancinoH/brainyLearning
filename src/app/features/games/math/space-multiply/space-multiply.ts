import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import confetti from 'canvas-confetti';
import { generateMultiplyProblem } from './multiply-problem';

@Component({
  selector: 'space-multiply',
  standalone: true,
  imports: [GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './space-multiply.html',
  styleUrl: './space-multiply.scss'
})
export class SpaceMultiply implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  private unsubscribeEvents?: () => void;
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();

  readonly activeProfile = this.profileState.activeProfile;

  // Estado del problema: numA = grupos, numB = estrellas por grupo
  readonly numA = signal<number>(2);
  readonly numB = signal<number>(2);
  readonly options = signal<number[]>([]);
  readonly disabledOptions = signal<number[]>([]);
  /** Tras un error se muestra el conteo de salto (2, 4, 6...) */
  readonly showHint = signal<boolean>(false);

  // Configuración del juego
  // Mismo id que el catálogo (MATH_GAMES) para que el desbloqueo y el nivel guardado coincidan
  readonly GAME_ID = 'space-multiplication';
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 20;
  readonly starSlots = Array.from({ length: this.REQUIRED_CORRECT }, (_, i) => i);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  // Feedback: local para success/try-again, sesión para game-over
  private readonly _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

  readonly feedbackState = computed(() => {
    const sessionState = this.session.state();
    if (!sessionState) return 'idle' as const;
    if (sessionState.isCompleted || sessionState.isTimeUp) return 'game-over' as const;
    return this._localFeedback();
  });

  readonly correctResult = computed(() => this.numA() * this.numB());

  /** Grupos a dibujar, con el total acumulado de cada uno para la pista */
  readonly groups = computed(() => {
    const perGroup = this.numB();
    return Array.from({ length: this.numA() }, (_, i) => ({
      items: Array.from({ length: perGroup }, (_, j) => j),
      runningTotal: (i + 1) * perGroup
    }));
  });

  /** Texto de la pista: "2, 4, 6" */
  readonly hintText = computed(() => this.groups().map(g => g.runningTotal).join(', '));

  /** Tamaño de las estrellas según la cantidad total, para que quepan en pantalla */
  readonly itemSize = computed(() => {
    const total = this.correctResult();
    if (total <= 12) return 'large';
    if (total <= 30) return 'medium';
    return 'small';
  });

  readonly customFeedbackMessages = {
    success: [
      '¡Despegue perfecto! 🚀',
      '¡Constelación completa! ⭐',
      '¡Cálculo espacial increíble! 🛸',
      '¡Eres una gran Comandante! 🌟'
    ],
    'try-again': [
      '¡Casi! Cuenta grupo por grupo ✨',
      'Otra vez, mira cuántos hay en cada grupo 🌈',
      '¡Vamos, un intento más! 🚀'
    ],
    'level-up': [
      '¡NIVEL SUPERADO! 🎉',
      '¡SUBISTE DE NIVEL! 🚀✨'
    ],
    'game-over': [
      '¡Completaste todas las multiplicaciones! 🏆',
      '¡Felicidades, eres una experta! 🌈'
    ]
  };

  readonly idleMessage = '¿Cuántas estrellas hay en total?';

  ngOnInit(): void {
    this.audio.registerAssets([
      { type: 'praise', paths: ['assets/audio/praise-1.wav', 'assets/audio/praise-2.wav', 'assets/audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['assets/audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['assets/audio/level-up.wav'], volume: 0.9 }
    ]);

    const savedLevel = this.progress.getLevel(this.GAME_ID);

    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.REQUIRED_CORRECT,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    this.generateProblem();

    this.unsubscribeEvents = this.session.onEvent(event => this.handleSessionEvent(event));
  }

  ngOnDestroy(): void {
    this._timers.forEach(id => clearTimeout(id));
    this._timers.clear();
    this.unsubscribeEvents?.();
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: SessionEvent): void {
    switch (event.type) {
      case 'level-up':
        this.audio.playLevelUp();
        this.triggerConfetti();
        this.later(() => this.nextProblemIfActive(), 2500);
        break;
      case 'game-complete':
        this.audio.playLevelUp();
        this.triggerConfetti();
        break;
    }
  }

  generateProblem(): void {
    const previous = this.numA() && this.options().length
      ? { groups: this.numA(), perGroup: this.numB() }
      : null;
    const problem = generateMultiplyProblem(this.currentLevel(), previous);

    this.numA.set(problem.groups);
    this.numB.set(problem.perGroup);
    this.options.set(problem.options);
    this.disabledOptions.set([]);
    this.showHint.set(false);
    this._localFeedback.set('idle');
  }

  selectOption(selected: number): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this.disabledOptions().includes(selected)) return;
    // Ya acertó: ignorar toques hasta que llegue el siguiente problema
    if (this._localFeedback() === 'success') return;

    this.audio.retryPendingAudio();

    if (selected === this.correctResult()) {
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();

      if (result.leveledUp) {
        // El evento 'level-up' se maneja en handleSessionEvent
        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        this.audio.playPraise();
        this.later(() => this.nextProblemIfActive(), 2000);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.disabledOptions.update(list => [...list, selected]);
      this.showHint.set(true);
      this.audio.playFailure();
    }
  }

  goBack(): void {
    this.router.navigate(['/games/math']);
  }

  onRestOverlayBack(): void {
    this.goBack();
  }

  private nextProblemIfActive(): void {
    if (!this.session.isTimeUp() && !this.session.isCompleted()) {
      this.generateProblem();
    }
  }

  /** setTimeout que se cancela solo al destruir el componente */
  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
  }

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch {
      console.log('Confetti lanzado');
    }
  }
}
