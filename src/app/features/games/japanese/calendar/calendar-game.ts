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
import { CalendarGameEngine, CalendarQuestion, CalendarActivityType } from '@core/learning/calendar-engine';
import { JapaneseWord } from '@core/learning/learning-content';

@Component({
  selector: 'calendar-game',
  standalone: true,
  imports: [CommonModule, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './calendar-game.html',
  styleUrl: './calendar-game.scss'
})
export class CalendarGameComponent implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly engine = inject(CalendarGameEngine);

  readonly activeProfile = this.profileState.activeProfile;
  readonly GAME_ID = 'japanese-calendar';
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 10;
  readonly TARGET_SKILLS = [
    'japanese.calendar.days',
    'japanese.calendar.kanji'
  ];

  // Estado del engine
  private _currentQuestion = signal<CalendarQuestion | null>(null);
  private _answerStartTime = 0;
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private _disabledOptions = signal<number[]>([]);
  private _weekOrderAnswer = signal<string[]>([]);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;
  readonly isCompleted = this.session.isCompleted;
  readonly sessionRemainingMs = this.session.sessionRemainingMs;
  readonly progressPercent = this.session.progressPercent;

  // Configuración por perfil
  readonly profileConfig = this.contentService.activeProfileConfig;

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

  // Tipo de actividad actual
  readonly activityType = computed(() => this._currentQuestion()?.type ?? 'kanji-of-day');

  // Para kanji-of-day
  readonly targetDay = computed(() => this._currentQuestion()?.targetDay);
  readonly decomposition = computed(() => this._currentQuestion()?.decomposition ?? []);

  // Para week-order
  readonly weekDays = computed(() => this._currentQuestion()?.weekDays ?? []);
  readonly shuffledDays = computed(() => this._currentQuestion()?.shuffledDays ?? []);
  readonly weekOrderAnswer = this._weekOrderAnswer.asReadonly();

  // Para audio-select-day / what-day-today
  readonly audioWord = computed(() => this._currentQuestion()?.audioWord);
  readonly audioOptions = computed(() => this._currentQuestion()?.options ?? []);
  readonly audioCorrectIndex = computed(() => this._currentQuestion()?.correctIndex ?? -1);
  readonly questionText = computed(() => this._currentQuestion()?.questionText ?? '');

  // Mensajes por actividad
  readonly activityMessages = {
    'kanji-of-day': {
      success: ['¡Bien! 🌙', '¡Correcto! ✨', '¡Ese es el kanji! 🎉'],
      tryAgain: ['Observa la descomposición 👀', 'Intenta de nuevo 💪']
    },
    'week-order': {
      success: ['¡Semana ordenada! 📅', '¡Perfecto! ✨', '¡Dominas el orden! 🎉'],
      tryAgain: ['Revisa el orden 🌈', 'Lunes a Domingo 💪']
    },
    'audio-select-day': {
      success: ['¡Bien escuchado! 👂', '¡Correcto! 🌟', '¡Oído perfecto! 🎉'],
      tryAgain: ['¡Escucha otra vez! 👂', 'Presta atención 🌈', 'Tú puedes 💪']
    },
    'what-day-today': {
      success: ['¡Sabes qué día es! 📅', '¡Correcto! ✨', '¡Bien! 🎉'],
      tryAgain: ['Piensa en hoy 🌈', 'Mira el calendario 👀']
    }
  };

  getActivityFeedbackMessages() {
    const type = this.activityType();
    const messages = this.activityMessages[type as keyof typeof this.activityMessages];
    if (!messages) return {
      success: ['¡Muy bien! 🌟'],
      'try-again': ['¡Casi! Intenta de nuevo 💪'],
      'level-up': ['¡NIVEL SUPERADO! 🎉'],
      'game-over': ['¡Completaste el juego! 🏆']
    };
    return {
      success: messages.success,
      'try-again': messages.tryAgain,
      'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🌸✨'],
      'game-over': ['¡Completaste el juego! 🏆', '¡Felicidades, dominas el calendario! 📅']
    };
  }

  readonly idleMessage = 'Observa y elige la opción correcta';

  ngOnInit(): void {
    this.audio.registerAssets([
      { type: 'praise', paths: ['assets/audio/praise-1.wav', 'assets/audio/praise-2.wav', 'assets/audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['assets/audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['assets/audio/level-up.wav'], volume: 0.9 },
      { type: 'question', paths: [], volume: 0.9 }
    ]);

    const savedLevel = this.progress.getLevel(this.GAME_ID);

    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.REQUIRED_CORRECT,
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel
    }, this.activeProfile()?.age);

    this.generateQuestion();

    this.session.onEvent(event => this.handleSessionEvent(event));

    effect(() => {
      const q = this._currentQuestion();
      if (q && (q.type === 'audio-select-day' || q.type === 'what-day-today')) {
        setTimeout(() => this.playQuestionAudio(), 500);
      }
    });
  }

  ngOnDestroy(): void {
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: { type: string; payload?: Record<string, unknown> }): void {
    switch (event.type) {
      case 'level-up':
        this.audio.playLevelUp();
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        }, 2500);
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
      category: 'calendar'
    });

    if (question) {
      this._currentQuestion.set(question);
      this._localFeedback.set('idle');
      this._disabledOptions.set([]);
      this._weekOrderAnswer.set([]);
      this._answerStartTime = Date.now();
    }
  }

  // Para kanji-of-day: solo educativo, avanzar automáticamente
  onKanjiOfDayContinue(): void {
    const question = this._currentQuestion();
    if (!question || question.type !== 'kanji-of-day') return;

    // Registrar intento educativo
    this.engine.recordAttempt(question, { correct: true, responseTimeMs: Date.now() - this._answerStartTime }, {
      gameId: this.GAME_ID,
      targetSkills: this.TARGET_SKILLS,
      category: 'calendar'
    });

    this._localFeedback.set('success');
    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL
      });
    } else {
      this.audio.playPraise();
      setTimeout(() => {
        if (!this.session.isTimeUp() && !this.session.isCompleted()) {
          this.generateQuestion();
        }
      }, 2000);
    }
  }

  // Para week-order: arrastrar/soltar o click para ordenar
  onWeekOrderSelect(dayId: string): void {
    if (this._weekOrderAnswer().length >= 7) return;
    this._weekOrderAnswer.update(arr => [...arr, dayId]);
  }

  onWeekOrderSubmit(): void {
    const question = this._currentQuestion();
    if (!question || question.type !== 'week-order') return;

    const responseTimeMs = Date.now() - this._answerStartTime;
    const answer = {
      orderedIds: this._weekOrderAnswer(),
      correct: this._weekOrderAnswer().join(',') === question.weekDays?.map(d => d.id).join(','),
      responseTimeMs
    };

    const isCorrect = this.engine.validateAnswer(question, answer);

    if (isCorrect) {
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();
      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS,
        category: 'calendar'
      });

      if (result.leveledUp) {
        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        this.audio.playPraise();
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        }, 2000);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS,
        category: 'calendar'
      });
      this.audio.playFailure();
      this._weekOrderAnswer.set([]);
    }
  }

  onWeekOrderReset(): void {
    this._weekOrderAnswer.set([]);
  }

  // Para audio-select-day / what-day-today
  selectOption(selectedIndex: number): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this._disabledOptions().includes(selectedIndex)) return;

    // Reintentar audio pendiente tras interacción del usuario
    this.audio.retryPendingAudio();

    const question = this._currentQuestion();
    if (!question || (question.type !== 'audio-select-day' && question.type !== 'what-day-today')) return;

    const responseTimeMs = Date.now() - this._answerStartTime;
    const answer = {
      selectedIndex,
      correct: selectedIndex === question.correctIndex,
      responseTimeMs
    };

    const isCorrect = this.engine.validateAnswer(question, answer);

    if (isCorrect) {
      this._localFeedback.set('success');
      const result = this.session.recordCorrect();
      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS,
        category: 'calendar'
      });

      this.playWordAudio(question.audioWord!);

      if (result.leveledUp) {
        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        this.audio.playPraise();
        setTimeout(() => {
          if (!this.session.isTimeUp() && !this.session.isCompleted()) {
            this.generateQuestion();
          }
        }, 2000);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this._disabledOptions.update(list => [...list, selectedIndex]);
      this.engine.recordAttempt(question, answer, {
        gameId: this.GAME_ID,
        targetSkills: this.TARGET_SKILLS,
        category: 'calendar'
      });
      this.audio.playFailure();

      setTimeout(() => this.playWordAudio(question.audioWord!), 1000);
    }
  }

  playQuestionAudio(): void {
    const question = this._currentQuestion();
    if (!question) return;

    if (question.type === 'audio-select-day' || question.type === 'what-day-today') {
      this.playWordAudio(question.audioWord!);
    }
  }

  playWordAudio(word: JapaneseWord): void {
    this.audio.playFile(word.audio).catch(() => {
      console.warn('No se pudo reproducir audio de la palabra');
    });
  }

  replayAudio(): void {
    this.playQuestionAudio();
  }

  getDayDisplay(word: JapaneseWord | undefined): { main: string; sub?: string } {
    if (!word) return { main: '', sub: '' };
    const config = this.profileConfig();
    if (config.requiresReading && word.hiragana) {
      return { main: word.kanji ?? '', sub: word.hiragana };
    }
    return { main: word.kanji ?? '', sub: word.hiragana };
  }

  getDecompositionDisplay(): { kanji: string; reading: string }[] {
    return this.decomposition().map(d => ({
      kanji: d.kanji,
      reading: d.reading
    }));
  }

  getActivityIcon(): string {
    switch (this.activityType()) {
      case 'kanji-of-day': return '📅→🀄';
      case 'week-order': return '📅➡️📅';
      case 'audio-select-day': return '🔊→📅';
      case 'what-day-today': return '❓📅';
      default: return '📅';
    }
  }

  getActivityLabel(): string {
    switch (this.activityType()) {
      case 'kanji-of-day': return 'Kanji del día';
      case 'week-order': return 'Ordenar semana';
      case 'audio-select-day': return 'Escucha y elige';
      case 'what-day-today': return '¿Qué día es hoy?';
      default: return 'Calendario';
    }
  }

  getDayById(id: string): JapaneseWord | undefined {
    return this.contentService.getWordById(id);
  }

  onRestOverlayBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }
}