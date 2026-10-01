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
import { KanjiFindEngine, KanjiQuestion, KanjiModality } from '@core/learning/kanji-find-engine';
import { JapaneseWord, RepresentationType } from '@core/learning/learning-content';

@Component({
  selector: 'kanji-find-game',
  standalone: true,
  imports: [CommonModule, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './kanji-find-game.html',
  styleUrl: './kanji-find-game.scss'
})
export class KanjiFindGameComponent implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly engine = inject(KanjiFindEngine);

  readonly activeProfile = this.profileState.activeProfile;
  readonly GAME_ID = 'japanese-kanji-find';
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 10;
  readonly TARGET_SKILLS = [
    'japanese.kanji.recognition',
    'japanese.kanji.reading',
    'japanese.kanji.meaning',
    'japanese.kanji.nature'
  ];

  // Estado del engine
  private _currentQuestion = signal<KanjiQuestion | null>(null);
  private _answerStartTime = 0;
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private _disabledOptions = signal<string[]>([]);

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

  // Opciones para mostrar
  readonly options = computed(() => this._currentQuestion()?.options ?? []);
  readonly correctIndex = computed(() => this._currentQuestion()?.correctIndex ?? -1);

  // Modalidad actual
  readonly modality = computed(() => this._currentQuestion()?.modality);
  readonly questionRepresentation = computed(() => this._currentQuestion()?.questionRepresentation ?? 'image');
  readonly answerRepresentation = computed(() => this._currentQuestion()?.answerRepresentation ?? 'kanji');

  // Palabra objetivo
  readonly targetWord = computed(() => this._currentQuestion()?.word);

  // Mensajes personalizados por modalidad
  readonly modalityMessages: Record<KanjiModality, { question: string; success: string[]; tryAgain: string[] }> = {
    'image-to-kanji': {
      question: '¿Cuál es el kanji?',
      success: ['¡Correcto! 🌳', '¡Bien hecho! ✨', '¡Ese es el kanji! 🎉'],
      tryAgain: ['¡Casi! Mira bien la forma 👀', 'Intenta de nuevo 💪', 'Compara los trazos 🌈']
    },
    'audio-to-kanji': {
      question: 'Escucha y elige el kanji',
      success: ['¡Bien escuchado! 👂', '¡Correcto! 🌟', '¡Oído perfecto! 🎉'],
      tryAgain: ['¡Escucha otra vez! 👂', 'Presta atención al sonido 🌈', 'Tú puedes 💪']
    },
    'hiragana-to-kanji': {
      question: 'Lee el hiragana y elige el kanji',
      success: ['¡Bien leído! 📖', '¡Correcto! ✨', '¡Dominas la lectura! 🎉'],
      tryAgain: ['¡Lee con calma! 📖', 'Compara los sonidos 🌈', 'Intenta otra vez 💪']
    },
    'kanji-to-meaning': {
      question: '¿Qué significa este kanji?',
      success: ['¡Entendido! 🌳', '¡Correcto! ✨', '¡Conoces el significado! 🎉'],
      tryAgain: ['¡Casi! Piensa en la imagen 🌈', 'Mira la forma del kanji 👀', 'Otra vez 💪']
    },
    'kanji-to-reading': {
      question: '¿Cómo se lee este kanji?',
      success: ['¡Bien leído! 📖', '¡Correcto! ✨', '¡Dominas la lectura! 🎉'],
      tryAgain: ['¡Lee despacio! 📖', 'Recuerda el sonido 🌈', 'Intenta de nuevo 💪']
    }
  };

  getModalityFeedbackMessages() {
    const modality = this.modality();
    if (!modality) return {
      success: ['¡Muy bien! 🌟', '¡Correcto! ✨', '¡Lo lograste! 🎉', '¡Increíble! ✨'],
      'try-again': ['¡Casi! Intenta de nuevo 💪', 'No te rindas, tú puedes 🌈', 'Otra vez, con calma ✨', '¡Vamos, un intento más! 🚀'],
      'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨', '¡GENIAL! Nuevo nivel desbloqueado 🌟'],
      'game-over': ['¡Completaste el juego! 🏆', '¡Felicidades, lo lograste todo! 🌈', '¡Eres una campeona! ⭐']
    };
    return {
      success: this.modalityMessages[modality].success,
      'try-again': this.modalityMessages[modality].tryAgain,
      'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🌸✨'],
      'game-over': ['¡Completaste el juego! 🏆', '¡Felicidades, dominas el vocabulario! 🌸']
    };
  }

  readonly idleMessage = 'Observa y elige la opción correcta';

  ngOnInit(): void {
    // Registrar assets de audio
    this.audio.registerAssets([
      { type: 'praise', paths: ['assets/audio/praise-1.wav', 'assets/audio/praise-2.wav', 'assets/audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['assets/audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['assets/audio/level-up.wav'], volume: 0.9 },
      { type: 'question', paths: [], volume: 0.9 }
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
    this.generateQuestion();

    // Suscribirse a eventos de sesión
    this.session.onEvent(event => this.handleSessionEvent(event));

    // Reproducir audio si la modalidad lo requiere
    effect(() => {
      const q = this._currentQuestion();
      if (q && (q.questionRepresentation === 'audio' || q.modality === 'audio-to-kanji')) {
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
      category: 'nature',
      allowedModalities: this._getAllowedModalitiesForLevel()
    });

    if (question) {
      this._currentQuestion.set(question);
      this._localFeedback.set('idle');
      this._disabledOptions.set([]);
      this._answerStartTime = Date.now();
    }
  }

  private _getAllowedModalitiesForLevel(): KanjiModality[] {
    const level = this.currentLevel();
    const age = this.activeProfile()?.age ?? 4;

    // Progresión por nivel
    if (level <= 2) return ['image-to-kanji', 'audio-to-kanji'];
    if (level <= 4) return ['image-to-kanji', 'audio-to-kanji', 'hiragana-to-kanji'];
    if (level <= 6) return ['image-to-kanji', 'audio-to-kanji', 'hiragana-to-kanji', 'kanji-to-meaning'];
    return ['image-to-kanji', 'audio-to-kanji', 'hiragana-to-kanji', 'kanji-to-meaning', 'kanji-to-reading'];
  }

  selectOption(selectedWordId: string): void {
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
        targetSkills: this.TARGET_SKILLS,
        category: 'nature'
      });

      // Reproducir audio de la palabra correcta
      this.playWordAudio(question.word);

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
      this._disabledOptions.update(list => [...list, selectedWordId]);
      this.audio.playFailure();

      // Reproducir audio de la palabra correcta para reforzar
      setTimeout(() => this.playWordAudio(question.word), 1000);
    }
  }

  playQuestionAudio(): void {
    const question = this._currentQuestion();
    if (!question) return;

    if (question.questionRepresentation === 'audio') {
      this.playWordAudio(question.word);
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

  getQuestionDisplay(): { main: string; label: string } {
    const question = this._currentQuestion();
    if (!question) return { main: '', label: '' };

    const modalityConfig = this.modalityMessages[question.modality];

    switch (question.questionRepresentation) {
      case 'image':
        return { main: question.questionValue, label: modalityConfig.question };
      case 'hiragana':
        return { main: question.questionValue, label: modalityConfig.question };
      case 'kanji':
        return { main: question.questionValue, label: modalityConfig.question };
      case 'audio':
        return { main: '🔊', label: modalityConfig.question };
      default:
        return { main: question.questionValue, label: modalityConfig.question };
    }
  }

  getOptionDisplay(word: JapaneseWord): string {
    const config = this.profileConfig();
    const answerRep = this.answerRepresentation();

    switch (answerRep) {
      case 'kanji':
        return word.kanji ?? '?';
      case 'hiragana':
        return word.hiragana;
      case 'image':
        const imageRep = word.representations?.find(r => r.type === 'image');
        return imageRep?.value ?? '❓';
      default:
        return word.kanji ?? word.hiragana;
    }
  }

  getOptionSubLabel(word: JapaneseWord): string {
    const answerRep = this.answerRepresentation();
    if (answerRep === 'kanji' && word.hiragana) {
      return word.hiragana;
    }
    if (answerRep === 'hiragana' && word.kanji) {
      return word.kanji;
    }
    return '';
  }

  getModalityIcon(): string {
    const modality = this.modality();
    switch (modality) {
      case 'image-to-kanji': return '🌳→🀄';
      case 'audio-to-kanji': return '🔊→🀄';
      case 'hiragana-to-kanji': return '📖→🀄';
      case 'kanji-to-meaning': return '🀄→🌳';
      case 'kanji-to-reading': return '🀄→📖';
      default: return '🀄';
    }
  }

  onRestOverlayBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }
}