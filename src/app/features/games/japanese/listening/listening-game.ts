import { Component, OnInit, OnDestroy, inject, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { LearningContentService } from '@core/learning/learning-content.service';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { ListeningGameEngine, ListeningQuestion } from '@core/learning/listening-engine';
import { JapaneseWord, RepresentationType } from '@core/learning/learning-content';

@Component({
  selector: 'listening-game',
  standalone: true,
  imports: [CommonModule, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './listening-game.html',
  styleUrl: './listening-game.scss'
})
export class ListeningGameComponent implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly engine = inject(ListeningGameEngine);

  readonly activeProfile = this.profileState.activeProfile;
  readonly GAME_ID = 'japanese-listening';
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 10;
  readonly TARGET_SKILLS = ['japanese.listening', 'japanese.vocabulary'];

  // Estado del engine
  private _currentQuestion = signal<ListeningQuestion | null>(null);
  private _answerStartTime = 0;
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private _disabledOptions = signal<string[]>([]);
  private _showHiragana = signal<boolean>(false);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;
  readonly isCompleted = this.session.isCompleted;
  readonly sessionRemainingMs = this.session.sessionRemainingMs;
  readonly progressPercent = this.session.progressPercent;

  // Configuración por perfil
  readonly profileConfig = this.contentService.activeProfileConfig;

  // Perfil preescolar (4 años - no lectora)
  readonly isPreschoolProfile = computed(() =>
    this.contentService.activeProfileConfig().requiresReading === false
  );

  // Feedback computado
  readonly feedbackState = computed(() => {
    const sessionState = this.session.state();
    if (!sessionState) return 'idle' as const;
    if (sessionState.isCompleted) return 'game-over' as const;
    if (sessionState.isTimeUp) return 'game-over' as const;
    return this._localFeedback();
  });

  // Pregunta actual
  readonly currentQuestion = this._currentQuestion.asReadonly();

  // Opciones para mostrar
  readonly options = computed(() => this._currentQuestion()?.options ?? []);
  readonly correctIndex = computed(() => this._currentQuestion()?.correctIndex ?? -1);

  // Representación de la pregunta (audio)
  readonly questionRepresentation = computed(() => this._currentQuestion()?.questionRepresentation ?? 'audio');
  readonly answerRepresentation = computed(() => this._currentQuestion()?.answerRepresentation ?? 'image');

  // Palabra objetivo
  readonly targetWord = computed(() => this._currentQuestion()?.word);

  // Mensajes personalizados
  readonly customFeedbackMessages = {
    success: [
      '¡Muy bien! 🌟',
      '¡Correcto! ✨',
      '¡Lo oíste bien! 🎉',
      '¡Excelente oído! 👂'
    ],
    'try-again': [
      '¡Casi! Escucha otra vez 👂',
      'Intenta de nuevo, tú puedes 💪',
      'Escucha con atención 🌈'
    ],
    'level-up': [
      '¡NIVEL SUPERADO! 🎉',
      '¡SUBISTE DE NIVEL! 🌸✨'
    ],
    'game-over': [
      '¡Completaste el juego! 🏆',
      '¡Felicidades, dominas el vocabulario! 🌸'
    ]
  };

  readonly idleMessage = 'Escucha la palabra y toca la imagen correcta';

  ngOnInit(): void {
    // Registrar assets de audio
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
      { type: 'question', paths: [], volume: 0.9 } // Se usa audio de la palabra
    ]);

    // Cargar nivel guardado
    const savedLevel = this.progress.getLevel(this.GAME_ID);

    // Iniciar sesión
    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.REQUIRED_CORRECT,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    // Generar primera pregunta
    setTimeout(() => this.generateQuestion(), 2200)


    // Suscribirse a eventos de sesión
    this.session.onEvent(event => this.handleSessionEvent(event));

    // Reproducir audio de la pregunta inicial
    /*effect(() => {
      const q = this._currentQuestion();
      if (q) {
        setTimeout(() => this.playQuestionAudio(), 500);
      }
    });*/
  }

  ngOnDestroy(): void {
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: { type: string; payload?: Record<string, unknown> }): void {
    switch (event.type) {
      case 'level-up':
        this.audio.playLevelUp();
        // Esperar a que termine el audio level-up (Promise) con fallback 3000ms
        const levelUpAudio = new Audio('audio/level-up.wav');
        const waitForEnded = levelUpAudio.play().then(() => new Promise<void>(resolve => {
          levelUpAudio.onended = () => resolve();
        })).catch(() => new Promise<void>(resolve => setTimeout(resolve, 3000))); // fallback

        waitForEnded.then(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        });
        break;
      case 'game-complete':
        this.audio.playLevelUp();
        break;
      case 'time-up':
        break;
    }
  }

  generateQuestion(): void {
    const question = this.engine.generateQuestion({
      gameId: this.GAME_ID,
      targetSkills: this.TARGET_SKILLS,
      maxDifficulty: this.currentLevel()  // ← PASAR NIVEL ACTUAL
    });

    if (question) {
      this._currentQuestion.set(question);
      this._localFeedback.set('idle');
      this._disabledOptions.set([]);
      this._answerStartTime = Date.now();

      this._showHiragana.set(this.profileConfig().requiresReading);

      // Reproducir automáticamente el audio de la nueva pregunta
      setTimeout(() => {
        this.playQuestionAudio();
      }, 500);
    }
  }

  selectOption(selectedWordId: string): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this._disabledOptions().includes(selectedWordId)) return;

    this.audio.retryPendingAudio();

    const question = this._currentQuestion();
    if (!question) return;

    const responseTimeMs = Date.now() - this._answerStartTime;
    const answer = {
      selectedWordId,
      correct: selectedWordId === question.word.id,
      responseTimeMs
    };

    const isCorrect = this.engine.validateAnswer(question, answer);

    if (isCorrect) {
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();

      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS
      });

      if (result.leveledUp) {
        // Si sube de nivel, SOLO la palabra correcta (sin praise para no empalmar con level-up)
        this.playWordAudio(question.word);

        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        // Acierto normal: solo praise (generateQuestion reproducirá el audio de la nueva pregunta)
        this.audio.playPraise();
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        }, 1200);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this._disabledOptions.update(list => [...list, selectedWordId]);
      this.audio.playFailure();

      setTimeout(() => this.playWordAudio(question.word), 800);
    }
  }

  /*selectOption(selectedWordId: string): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this._disabledOptions().includes(selectedWordId)) return;

    // Reintentar audio pendiente tras interacción del usuario
    this.audio.retryPendingAudio();

    const question = this._currentQuestion();
    if (!question) return;

    const responseTimeMs = Date.now() - this._answerStartTime;
    const answer = {
      selectedWordId,
      correct: selectedWordId === question.word.id,
      responseTimeMs
    };

    const isCorrect = this.engine.validateAnswer(question, answer);

    if (isCorrect) {
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();

      // Registrar en skills
      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS
      });

      if (result.leveledUp) {
        // Si sube de nivel, reproducimos la palabra y dejamos que handleSessionEvent maneje el level-up
        this.playWordAudio(question.word);

        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        // 1. Reproducir primero la palabra correcta
        this.playWordAudio(question.word);

        // 2. Esperar 800ms para reproducir el elogio (praise) sin empalmarse
        setTimeout(() => {
          this.audio.playPraise();
        }, 800);

        // 3. Generar la nueva pregunta tras concluir los efectos
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        }, 2400);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this._disabledOptions.update(list => [...list, selectedWordId]);
      this.audio.playFailure();

      // Reproducir audio de la palabra correcta para reforzar
      setTimeout(() => this.playWordAudio(question.word), 1000);
    }
    }*/

  playQuestionAudio(): void {
    const question = this._currentQuestion();
    if (!question) return;

    // Reproducir audio de la palabra objetivo
    this.playWordAudio(question.word);
  }

  playWordAudio(word: JapaneseWord): void {
    this.audio.playFile(word.audio).catch(() => {
      console.warn('No se pudo reproducir audio de la palabra');
    });
  }

  replayAudio(): void {
    this.playQuestionAudio();
  }

  getOptionDisplay(word: JapaneseWord): { main: string; sub?: string } {
    const config = this.profileConfig();
    const age = this.activeProfile()?.age ?? 4;

    if (config.requiresReading && this._showHiragana() && word.hiragana) {
      return { main: word.hiragana, sub: this.getImageEmoji(word) };
    }

    return { main: this.getImageEmoji(word) };
  }

  getOptionAriaLabel(word: JapaneseWord): string {
    return `Opción: ${word.meanings[0]}, ${word.hiragana}`;
  }

  getImageEmoji(word: JapaneseWord): string {
    const reps = this.contentService.getAvailableRepresentations(word, this.activeProfile()?.age ?? 4);
    const imageRep = reps.find(r => r.type === 'image');
    return imageRep?.value ?? '❓';
  }

  getOptionImage(word: JapaneseWord): string {
    return word.image;
  }

  onRestOverlayBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }
}
