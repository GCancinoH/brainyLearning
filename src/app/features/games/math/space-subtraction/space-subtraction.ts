import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import confetti from 'canvas-confetti';

@Component({
  selector: 'space-subtraction',
  standalone: true,
  imports: [CommonModule, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './space-subtraction.html',
  styleUrl: './space-subtraction.scss'
})
export class SpaceSubtraction implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // Estado específico del juego (lógica matemática)
  numA = signal<number>(1);
  numB = signal<number>(1);
  options = signal<number[]>([]);
  disabledOptions = signal<number[]>([]);

  // Configuración del juego
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 20;
  readonly GAME_ID = 'space-subtraction';

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;
  readonly isCompleted = this.session.isCompleted;
  readonly sessionRemainingMs = this.session.sessionRemainingMs;
  readonly progressPercent = this.session.progressPercent;

  // Feedback - estado local para success/try-answer, session para level-up/game-over
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

  readonly feedbackState = computed(() => {
    const sessionState = this.session.state();
    if (!sessionState) return 'idle' as const;
    if (sessionState.isCompleted) return 'game-over' as const;
    if (sessionState.isTimeUp) return 'game-over' as const;
    // Durante juego activo, usar feedback local
    return this._localFeedback();
  });

  correctResult = computed(() => this.numA() - this.numB());
  itemsA = computed(() => Array(this.numA()).fill(0));
  itemsB = computed(() => Array(this.numB()).fill(0));

  // Mensajes personalizados para este juego
  readonly customFeedbackMessages = {
    success: [
      '¡Despegue perfecto! 🚀',
      '¡Aterrizaje en las estrellas! ⭐',
      '¡Cálculo espacial increíble! 🛸',
      '¡Eres una gran Comandante! 🌟'
    ],
    'try-again': [
      '¡Casi! Cuenta bien los cohetes ✨',
      'Otra vez, cuenta con calma 🌈',
      '¡Vamos, un intento más! 🚀'
    ],
    'level-up': [
      '¡NIVEL SUPERADO! 🎉',
      '¡SUBISTE DE NIVEL! 🚀✨'
    ],
    'game-over': [
      '¡Completaste todas las restas! 🏆',
      '¡Felicidades, eres una experta! 🌈'
    ]
  };

  // Para el mensaje de "idle" (instrucción inicial)
  readonly idleMessage = '¿Cuántos cohetes quedan?';

  ngOnInit(): void {
    // Registrar assets de audio específicos de este juego
    this.audio.registerAssets([
      { type: 'praise', paths: ['assets/audio/praise-1.wav', 'assets/audio/praise-2.wav', 'assets/audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['assets/audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['assets/audio/level-up.wav'], volume: 0.9 }
    ]);

    // Cargar nivel guardado (usa GameProgressService que hace fallback a profileState)
    const savedLevel = this.progress.getLevel(this.GAME_ID);

    // Iniciar sesión
    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.REQUIRED_CORRECT,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    // Generar primer problema
    this.generateProblem();

    // Suscribirse a eventos de sesión para reaccionar a level-up, time-up, etc.
    this.session.onEvent(event => this.handleSessionEvent(event));
  }

  ngOnDestroy(): void {
    this.audio.dispose();
    // GameSessionService se limpia solo en su ngOnDestroy (providedIn: root)
    // Pero terminamos la sesión si el componente se destruye
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: { type: string; payload?: Record<string, unknown> }): void {
    switch (event.type) {
      case 'level-up':
        this.playLevelUpAudio();
        this.triggerConfetti();
        // El session service ya actualizó el nivel, generamos nuevo problema
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateProblem();
          }
        }, 2500);
        break;
      case 'game-complete':
        this.playLevelUpAudio();
        this.triggerConfetti();
        break;
      case 'time-up':
        // El overlay se muestra automáticamente via isTimeUp signal
        break;
    }
  }

  generateProblem(): void {
    const lvl = this.currentLevel();
    let a = 1;
    let b = 1;

    // Para restas: a >= b siempre (resultado no negativo)
    if (lvl <= 3) {
      // Niveles 1-3: Restas simples hasta 5
      a = Math.floor(Math.random() * 4) + 2; // 2 a 5
      b = Math.floor(Math.random() * (a - 1)) + 1; // 1 a a-1
    } else if (lvl <= 6) {
      // Niveles 4-6: Restas hasta 8
      a = Math.floor(Math.random() * 4) + 5; // 5 a 8
      b = Math.floor(Math.random() * (a - 1)) + 1;
    } else if (lvl <= 10) {
      // Niveles 7-10: Restas hasta 12
      a = Math.floor(Math.random() * 5) + 8; // 8 a 12
      b = Math.floor(Math.random() * (a - 1)) + 1;
    } else if (lvl <= 15) {
      // Niveles 11-15: Restas hasta 18
      a = Math.floor(Math.random() * 6) + 12; // 12 a 17
      b = Math.floor(Math.random() * (a - 1)) + 1;
    } else {
      // Niveles 16-20: Restas hasta 25
      a = Math.floor(Math.random() * 10) + 15; // 15 a 24
      b = Math.floor(Math.random() * (a - 1)) + 1;
    }

    this.numA.set(a);
    this.numB.set(b);
    this.disabledOptions.set([]);
    this._localFeedback.set('idle'); // Reset feedback al generar nuevo problema

    const correct = a - b;
    const optionsSet = new Set<number>([correct]);

    while (optionsSet.size < 3) {
      const offset = (Math.floor(Math.random() * 3) + 1) * (Math.random() > 0.5 ? 1 : -1);
      const wrong = correct + offset;
      if (wrong > 0 && wrong !== correct) {
        optionsSet.add(wrong);
      }
    }

    this.options.set(Array.from(optionsSet).sort(() => Math.random() - 0.5));
  }

  selectOption(selected: number): void {
    // Verificar si ya hay feedback activo o la opción está deshabilitada
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this.disabledOptions().includes(selected)) return;

    // Reintentar audio pendiente tras interacción del usuario
    this.audio.retryPendingAudio();

    if (selected === this.correctResult()) {
      // ACERTÓ
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();

      if (result.leveledUp) {
        // El evento 'level-up' se maneja en handleSessionEvent
        // Guardar progreso extendido
        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        // Acierto normal - feedback visual vía session state
        this.audio.playPraise();
        // Generar siguiente problema tras delay
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this._localFeedback.set('idle');
            this.generateProblem();
          }
        }, 2000);
      }
    } else {
      // FALLÓ
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.disabledOptions.update(list => [...list, selected]);
      this.audio.playFailure();
    }
  }

  private triggerConfetti(): void {
    try {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } catch (e) {
      console.log('Confetti lanzado');
    }
  }

  goBack(): void {
    this.router.navigate(['/games/math']);
  }

  onRestOverlayBack(): void {
    this.goBack();
  }

  private playLevelUpAudio(): void {
    this.audio.playLevelUp();
  }
}