import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
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
import { ListeningGameEngine, ListeningQuestion, ListeningEngineConfig } from '@core/learning/listening-engine';
import { JapaneseWord } from '@core/learning/learning-content';
import { LevelUpDialog } from '@shared/game-ui/level-up-dialog/level-up-dialog';
import { SpacedRepetition, JAPANESE_VOCAB_DECK } from '@core/learning/spaced-repetition';
import { WordIntroCarousel } from '@shared/game-ui/word-intro-carousel/word-intro-carousel';

type Phase = 'intro' | 'guided' | 'play';

@Component({
  selector: 'listening-game',
  standalone: true,
  imports: [
    CommonModule, GameFeedbackComponent, GameRestOverlayComponent, LevelUpDialog,
    WordIntroCarousel
  ],
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
  private readonly srs = inject(SpacedRepetition);
  private unsubscribeEvents?: () => void;

  readonly activeProfile = this.profileState.activeProfile;
  readonly GAME_ID = 'japanese-listening';
  readonly requiredCorrect = computed(() => (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 5);
  readonly starSlots = computed(() => Array.from({ length: this.requiredCorrect() }, (_, i) => i));
  readonly MAX_LEVEL = 10;
  readonly TARGET_SKILLS = ['japanese.listening', 'japanese.vocabulary'];
  readonly levelUpVisible = signal(false);
  readonly levelUpTarget = signal(1);
  readonly INTRO_BATCH = 4;
  readonly PLAY_BETWEEN_INTROS = 6;
  readonly phase = signal<Phase>('intro');
  readonly introWords = signal<JapaneseWord[]>([]);
  private _guidedQueue: JapaneseWord[] = [];
  private _gradedSinceIntro = this.PLAY_BETWEEN_INTROS;   // permite presentar de inmediato
  private _showHint = signal(false);
  readonly showHint = this._showHint.asReadonly();

  // Estado del engine
  private _currentQuestion = signal<ListeningQuestion | null>(null);
  private _answerStartTime = 0;
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private _disabledOptions = signal<string[]>([]);
  private _showHiragana = signal<boolean>(false);
  private _instructionPlayed = false;
  private _destroyed = false;
  private readonly _timers = new Set<ReturnType<typeof setTimeout>>();

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
    this.srs.seedFromAttempts(JAPANESE_VOCAB_DECK, this.skillProgress.attempts().filter(a => a.skillId === 'japanese.listening'));
    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    // Registrar assets de audio
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/japanese/praise-1.wav', 'audio/japanese/praise-2.wav', 'audio/japanese/praise-3.wav', 'audio/japanese/praise-4.wav'], volume: 0.85 },
      { type: 'failure', paths: ['audio/japanese/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
      { type: 'question', paths: [], volume: 0.9 },
      { type: 'instruction', paths: ['audio/instruction-listening.wav'], volume: 0.9 }
    ]);

    // Cargar nivel guardado
    const savedLevel = this.progress.getLevel(this.GAME_ID);

    // Iniciar sesión
    this.session.startSession({
      gameId: this.GAME_ID,
      sessionDurationMs: 5 * 60 * 1000,
      requiredCorrectForLevelUp: this.requiredCorrect(),
      maxLevel: this.MAX_LEVEL,
      initialLevel: savedLevel,
      canLevelUp: () => this.engine.getUnintroducedWords(this.engineConfig()).length === 0
    }, this.activeProfile()?.age);

    // Arranca con la presentación de palabras (el audio de instrucción suena al terminarla)
    this.nextStep();
  }

  ngOnDestroy(): void {
    this._destroyed = true;
    this._timers.forEach(id => clearTimeout(id));
    this._timers.clear();
    this.unsubscribeEvents?.();
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: { type: string; payload?: Record<string, unknown> }): void {
    if (event.type !== 'level-up') return;

    this.audio.stopAll();
    this.audio.playLevelUp();

    if (event.payload?.['isMaxLevel']) return;   // el juego completo lo maneja el feedback

    this.session.pause();
    this.levelUpTarget.set(event.payload?.['newLevel'] as number);
    this.levelUpVisible.set(true);
  }

  onAdvance(): void {
    this.audio.stopAll();
    this.levelUpVisible.set(false);
    this.session.resume();
    if (!this.session.isTimeUp() && !this.session.isCompleted()) {
      this._gradedSinceIntro = this.PLAY_BETWEEN_INTROS;
      this.nextStep();
    }
  }

  generateQuestion(autoPlay = true): void {
    const focus = this.phase() === 'guided' ? [this._guidedQueue[0].id] : undefined;
    const question = this.engine.generateQuestion(this.engineConfig(focus));
    if (!question) return;

    this._currentQuestion.set(question);
    this._localFeedback.set('idle');
    this._disabledOptions.set([]);
    this._showHint.set(false);
    this._answerStartTime = Date.now();
    this._showHiragana.set(this.profileConfig().requiresReading);
    if (autoPlay) this.later(() => this.playQuestionAudio(), 500);
  }

  selectOption(selectedWordId: string): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this._disabledOptions().includes(selectedWordId)) return;
    // ya acertó: ignorar toques hasta que llegue la siguiente pregunta
    if (this._localFeedback() === 'success') return;
    this.audio.retryPendingAudio();

    const question = this._currentQuestion();
    if (!question) return;

    const answer = {
      selectedWordId,
      correct: selectedWordId === question.word.id,
      responseTimeMs: Date.now() - this._answerStartTime
    };

    if (this.phase() === 'guided') {
      this._answerGuided(question, answer.correct);
      return;
    }

    // el engine solo registra el primer intento de cada pregunta
    this.engine.recordAttempt(question, answer, this.engineConfig());

    if (answer.correct) {
      this._localFeedback.set('success');
      this._gradedSinceIntro++;
      const result = this.session.recordCorrect();
      if (result.leveledUp) {
        this.progress.saveProgress(this.GAME_ID, {
          level: result.newLevel,
          completed: result.newLevel >= this.MAX_LEVEL
        });
      } else {
        this.audio.playPraise();
        this.later(() => this.nextStep(), 1200);
      }
    } else {
      this._localFeedback.set('try-again');
      this.session.recordIncorrect();
      this._disabledOptions.update(list => [...list, selectedWordId]);
      this.audio.playFailure();
      this.later(() => this.playWordAudio(question.word), 800);
    }
  }

  playQuestionAudio(): void {
    if (this.levelUpVisible() || this.phase() === 'intro') return;

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

  onRestOverlayBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  onIntroDone(): void {
    const batch = this.introWords();
    this.srs.markIntroduced(JAPANESE_VOCAB_DECK, batch.map(w => w.id));
    this._guidedQueue = [...batch].sort(() => Math.random() - 0.5);
    this._gradedSinceIntro = 0;
    this.introWords.set([]);
    this.phase.set('guided');
    void this._startGuided();
  }

  /* Private methods */
  private engineConfig(focus?: string[]): ListeningEngineConfig {
    return {
      gameId: this.GAME_ID,
      targetSkills: this.TARGET_SKILLS,
      maxDifficulty: this.currentLevel(),
      focusWordIds: focus
    };
  }

  private nextStep(): void {
    if (this.session.isTimeUp() || this.session.isCompleted()) return;

    if (this._guidedQueue.length === 0) {
      const unseen = this.engine.getUnintroducedWords(this.engineConfig());
      if (unseen.length > 0 && this._gradedSinceIntro >= this.PLAY_BETWEEN_INTROS) {
        this.introWords.set(this.srs.pickIntroBatch(unseen, this.INTRO_BATCH));
        this.phase.set('intro');
        return;
      }
      this.phase.set('play');
    }
    this.generateQuestion();
  }

  private _answerGuided(question: ListeningQuestion, correct: boolean): void {
    if (!correct) {
      this._localFeedback.set('try-again');
      this._showHint.set(true);                  // la correcta pulsa; no se deshabilita nada
      this.later(() => this.playWordAudio(question.word), 500);
      return;
    }
    this._localFeedback.set('success');
    this.audio.playPraise();
    this._guidedQueue.shift();
    this.later(() => this.nextStep(), 1200);
  }

  /** setTimeout que se cancela solo al destruir el componente */
  private later(fn: () => void, ms: number): void {
    const id = setTimeout(() => {
      this._timers.delete(id);
      fn();
    }, ms);
    this._timers.add(id);
  }

  /** Primera pregunta guiada tras la presentación: instrucción (solo la 1.ª vez) y luego la palabra */
  private async _startGuided(): Promise<void> {
    this.generateQuestion(false);
    if (!this._instructionPlayed) {
      this._instructionPlayed = true;
      await this.audio.playAndWait('instruction');
    }
    if (!this._destroyed) this.playQuestionAudio();
  }
}
