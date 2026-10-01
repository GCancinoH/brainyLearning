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
import { NatureGameEngine, NatureQuestion, NatureActivityType } from '@core/learning/nature-engine';
import { JapaneseWord } from '@core/learning/learning-content';

@Component({
  selector: 'nature-game',
  standalone: true,
  imports: [CommonModule, GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './nature-game.html',
  styleUrl: './nature-game.scss'
})
export class NatureGameComponent implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly contentService = inject(LearningContentService);
  private readonly skillProgress = inject(SkillProgressService);
  private readonly engine = inject(NatureGameEngine);

  readonly activeProfile = this.profileState.activeProfile;
  readonly GAME_ID = 'japanese-nature';
  readonly REQUIRED_CORRECT = 5;
  readonly MAX_LEVEL = 15;
  readonly TARGET_SKILLS = [
    'japanese.kanji.recognition',
    'japanese.kanji.reading',
    'japanese.kanji.meaning',
    'japanese.kanji.nature'
  ];

  // Estado del engine
  private _currentQuestion = signal<NatureQuestion | null>(null);
  private _answerStartTime = 0;
  private _localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');
  private _disabledOptions = signal<number[]>([]);

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
  readonly activityType = computed(() => this._currentQuestion()?.type ?? 'kanji-find');

  // Para kanji-find
  readonly kanjiQuestion = computed(() => this._currentQuestion()?.kanjiQuestion);
  readonly kanjiOptions = computed(() => this._currentQuestion()?.kanjiQuestion?.options ?? []);
  readonly kanjiCorrectIndex = computed(() => this._currentQuestion()?.kanjiQuestion?.correctIndex ?? -1);
  readonly kanjiQuestionRepresentation = computed(() => this._currentQuestion()?.kanjiQuestion?.questionRepresentation ?? 'image');
  readonly kanjiAnswerRepresentation = computed(() => this._currentQuestion()?.kanjiQuestion?.answerRepresentation ?? 'kanji');
  readonly kanjiTargetWord = computed(() => this._currentQuestion()?.kanjiQuestion?.word);

  // Para ki-hayashi-mori
  readonly compositionStage = computed(() => this._currentQuestion()?.compositionStage);
  readonly compositionQuestion = computed(() => this._currentQuestion()?.compositionQuestion);
  readonly compositionOptions = computed(() => this._currentQuestion()?.compositionOptions ?? []);
  readonly compositionCorrectIndex = computed(() => this._currentQuestion()?.compositionCorrectIndex ?? -1);

  // Para kanji-detectives
  readonly sceneElements = computed(() => this._currentQuestion()?.sceneElements ?? []);
  readonly targetKanji = computed(() => this._currentQuestion()?.targetKanji);
  readonly targetWord = computed(() => this._currentQuestion()?.targetWord);

  // Mensajes personalizados por tipo de actividad
  readonly activityMessages = {
    'kanji-find': {
      success: ['¡Correcto! 🌳', '¡Bien hecho! ✨', '¡Ese es el kanji! 🎉'],
      tryAgain: ['¡Casi! Mira bien la forma 👀', 'Intenta de nuevo 💪', 'Compara los trazos 🌈']
    },
    'ki-hayashi-mori': {
      success: ['¡Entendido! 🌳🌳🌳', '¡Correcto! ✨', '¡Dominas la composición! 🎉'],
      tryAgain: ['¡Casi! Cuenta los árboles 🌳', 'Mira cuántos hay 👀', 'Otra vez 💪']
    },
    'kanji-detectives': {
      success: ['¡Encontraste el kanji! 🔍', '¡Bien detectado! ✨', '¡Ojo de lince! 🎉'],
      tryAgain: ['¡Busca con atención! 🔍', 'Mira cada elemento 👀', 'Está ahí escondido 🌈']
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
      'game-over': ['¡Completaste el juego! 🏆', '¡Felicidades, dominas la naturaleza! 🌳']
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
      if (q && q.type === 'kanji-find' && q.kanjiQuestion && q.kanjiQuestion.questionRepresentation === 'audio') {
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
      category: 'nature'
    });

    if (question) {
      this._currentQuestion.set(question);
      this._localFeedback.set('idle');
      this._disabledOptions.set([]);
      this._answerStartTime = Date.now();
    }
  }

  selectOption(selectedIndex: number): void {
    const sessionState = this.session.state();
    if (sessionState?.isTimeUp || sessionState?.isCompleted) return;
    if (this._disabledOptions().includes(selectedIndex)) return;

    // Reintentar audio pendiente tras interacción del usuario
    this.audio.retryPendingAudio();

    const question = this._currentQuestion();
    if (!question) return;

    const responseTimeMs = Date.now() - this._answerStartTime;
    const answer = {
      selectedIndex,
      correct: selectedIndex === this._getCorrectIndex(question),
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
      this.playCorrectAnswerAudio(question);

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
      this.audio.playFailure();

      // Reproducir audio de la respuesta correcta para reforzar
      setTimeout(() => this.playCorrectAnswerAudio(question), 1000);
    }
  }

  private _getCorrectIndex(question: NatureQuestion): number {
    switch (question.type) {
      case 'kanji-find':
        return question.kanjiQuestion?.correctIndex ?? -1;
      case 'ki-hayashi-mori':
        return question.compositionCorrectIndex ?? -1;
      case 'kanji-detectives':
        return question.sceneElements?.findIndex(e => e.word.kanji === question.targetKanji) ?? -1;
      default:
        return -1;
    }
  }

  playQuestionAudio(): void {
    const question = this._currentQuestion();
    if (!question || question.type !== 'kanji-find' || !question.kanjiQuestion) return;

    if (question.kanjiQuestion.questionRepresentation === 'audio') {
      this.playWordAudio(question.kanjiQuestion.word);
    }
  }

  playCorrectAnswerAudio(question: NatureQuestion): void {
    let word: JapaneseWord | undefined;

    switch (question.type) {
      case 'kanji-find':
        word = question.kanjiQuestion?.word;
        break;
      case 'ki-hayashi-mori':
        // Para composición, reproducir el kanji objetivo
        const targetKanji = question.compositionOptions?.[question.compositionCorrectIndex!]?.kanji;
        if (targetKanji) {
          word = this.contentService.getWordById(this._kanjiToWordId(targetKanji));
        }
        break;
      case 'kanji-detectives':
        word = question.targetWord;
        break;
    }

    if (word) {
      this.playWordAudio(word);
    }
  }

  private _kanjiToWordId(kanji: string): string {
    const map: Record<string, string> = {
      '木': 'ki', '林': 'hayashi', '森': 'mori',
      '日': 'hi', '月': 'tsuki', '火': 'hi-fire',
      '水': 'mizu', '山': 'yama', '川': 'kawa',
      '土': 'tsuchi', '花': 'hana', '雨': 'ame',
      '雪': 'yuki', '空': 'sora'
    };
    return map[kanji] ?? '';
  }

  playWordAudio(word: JapaneseWord): void {
    this.audio.playFile(word.audio).catch(() => {
      console.warn('No se pudo reproducir audio de la palabra');
    });
  }

  replayAudio(): void {
    this.playQuestionAudio();
  }

  getKanjiQuestionDisplay(): { main: string; label: string } {
    const kq = this.kanjiQuestion();
    if (!kq) return { main: '', label: '' };

    switch (kq.questionRepresentation) {
      case 'image':
        return { main: kq.questionValue, label: '¿Cuál es el kanji?' };
      case 'hiragana':
        return { main: kq.questionValue, label: 'Lee y elige el kanji' };
      case 'kanji':
        return { main: kq.questionValue, label: kq.answerRepresentation === 'image' ? '¿Qué significa?' : '¿Cómo se lee?' };
      case 'audio':
        return { main: '🔊', label: 'Escucha y elige el kanji' };
      default:
        return { main: kq.questionValue, label: 'Elige el kanji' };
    }
  }

  getKanjiOptionDisplay(word: JapaneseWord): string {
    const answerRep = this.kanjiAnswerRepresentation();
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

  getCompositionOptionDisplay(opt: { kanji: string; label: string; emoji: string }): { main: string; sub: string } {
    const config = this.profileConfig();
    if (config.requiresReading) {
      return { main: opt.kanji, sub: opt.emoji };
    }
    return { main: opt.emoji, sub: opt.kanji };
  }

  getSceneElementDisplay(element: { kanji: string; emoji: string; word: JapaneseWord }): string {
    const config = this.profileConfig();
    if (config.requiresReading) {
      return element.kanji;
    }
    return element.emoji;
  }

  getActivityIcon(): string {
    switch (this.activityType()) {
      case 'kanji-find': return '🀄';
      case 'ki-hayashi-mori': return '🌳→🌳🌳→🌳🌳🌳';
      case 'kanji-detectives': return '🔍';
      default: return '🌳';
    }
  }

  getActivityLabel(): string {
    switch (this.activityType()) {
      case 'kanji-find': return 'Kanji';
      case 'ki-hayashi-mori': return 'Composición';
      case 'kanji-detectives': return 'Detectives';
      default: return 'Naturaleza';
    }
  }

  getSceneBackground(): string {
    const question = this._currentQuestion();
    if (!question || question.type !== 'kanji-detectives') return '';

    const sceneMap: Record<string, string> = {
      'montaña-río-sol': 'linear-gradient(135deg, #1e3a5f 0%, #2d5a87 100%)',
      'bosque-lluvia-nieve': 'linear-gradient(135deg, #14532d 0%, #1e3a5f 100%)',
      'flor-tierra-cielo': 'linear-gradient(135deg, #7c2d12 0%, #1e3a5f 100%)',
      'fuego-agua-luna': 'linear-gradient(135deg, #7c2d12 0%, #1e3a5f 100%)'
    };

    // Intentar determinar la escena por los elementos
    const elements = question.sceneElements?.map(e => e.word.id).join('-') ?? '';
    return sceneMap[elements] || 'linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)';
  }

  onRestOverlayBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }
}