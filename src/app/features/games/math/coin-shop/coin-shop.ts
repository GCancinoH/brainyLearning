import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { buildCoinProblem, CoinMode, MAX_LEVEL } from './coin-shop-problem';

/**
 * "La Tiendita de Monedas" - un solo juego para dos edades.
 *
 *  - 4 años (`count`): cuenta manzanas reales. Tras fallar, las opciones quedan bloqueadas
 *    hasta que haya hecho la correspondencia uno a uno, que es lo que rompe el conteo mecánico.
 *  - 6 años (`pay`): paga el precio exacto combinando monedas de $1, $2 y $5, y desde el
 *    nivel 4 descubre más de una forma distinta de hacerlo.
 *
 * Dos decisiones que vienen de "El Tanque de Combustible" y conviene no olvidar:
 *
 *  1. Explorar no se castiga. Pasarse del precio hace rebotar la moneda con una pregunta,
 *     nunca rompe la racha. La racha cuenta pagos completados, no intentos sin error.
 *  2. El acierto se registra UNA vez por nivel, al descubrir todas las formas pedidas.
 */

interface PurseCoin {
  id: number;
  value: number;
  delayMs: number;
}

interface Discovery {
  key: string;
  label: string;
}

@Component({
  selector: 'coin-shop',
  imports: [GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './coin-shop.html',
  styleUrl: './coin-shop.scss',
})
export class CoinShop implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);

  readonly activeProfile = this.profileState.activeProfile;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  readonly GAME_ID = 'coin-shop';
  readonly MAX_LEVEL = MAX_LEVEL;
  /** A los 4 años, 5 aciertos seguidos son demasiado exigentes */
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  // Selectores del session service
  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  /** El modo se deriva de la edad: un solo juego, dos edades */
  readonly mode = computed<CoinMode>(() =>
    (this.activeProfile()?.age ?? 4) <= 4 ? 'count' : 'pay',
  );

  // ============================================
  // ESTADO
  // ============================================

  // ---- modo 'count' ----
  readonly items = signal<number[]>([]);
  readonly tapped = signal<ReadonlySet<number>>(new Set());
  readonly options = signal<number[]>([]);
  readonly disabledOptions = signal<number[]>([]);
  /** Tras un error, obliga al conteo uno a uno antes de dejar reintentar */
  readonly showHint = signal(false);
  /** Ya contó todas las manzanas: puede ver la respuesta */
  readonly revealed = signal(false);

  // ---- modo 'pay' ----
  readonly price = signal(0);
  readonly denominations = signal<number[]>([]);
  readonly prePaid = signal(0);
  readonly purse = signal<PurseCoin[]>([]);
  readonly found = signal<Discovery[]>([]);
  readonly waysRequired = signal(1);

  // ---- común ----
  readonly prompt = signal('');
  readonly hint = signal('');
  readonly busy = signal(false);
  readonly reflecting = signal(false);
  readonly shaking = signal(false);
  readonly gobbling = signal(false);

  private readonly localFeedback = signal<'idle' | 'success' | 'try-again'>('idle');

  // ============================================
  // DERIVADOS
  // ============================================

  readonly feedbackState = computed<FeedbackState>(() => {
    const s = this.session.state();
    if (!s) return 'idle';
    if (s.isCompleted || s.isTimeUp) return 'game-over';
    return this.localFeedback();
  });

  readonly solved = computed(() => this.feedbackState() === 'success');
  readonly cap = computed(() => this.price() - this.prePaid());
  readonly spent = computed(() => this.purse().reduce((s, c) => s + c.value, 0));
  readonly remaining = computed(() => this.cap() - this.spent());

  /**
   * En modo count, tras un error solo se puede responder si ya contó todas las manzanas.
   * Ese es el mecanismo que ataca el conteo mecánico.
   */
  readonly canAnswer = computed(() => {
    if (this.solved()) return true;
    if (this.mode() !== 'count' || !this.showHint()) return true;
    return this.tapped().size >= this.items().length;
  });

  /** Queda alguna moneda que quepa en el espacio restante */
  readonly canStillFit = computed(() =>
    this.remaining() > 0 && this.denominations().some(d => d <= this.remaining()),
  );

  // ============================================
  // MENSAJES
  // ============================================

  readonly customFeedbackMessages = {
    success: [
      '¡Pago exacto! 🪙',
      '¡Perfecto, ahora sí! ⭐',
      '¡Qué bien cuentas! 🌟',
      '¡La tiendita es tuya! 🎉',
    ],
    'try-again': [
      '¡Casi! Cuenta otra vez 🍎',
      'Mira bien las manzanas 🌈',
      '¡Vamos, un intento más! 💪',
    ],
    'level-up': ['¡NIVEL SUPERADO! 🎉', '¡SUBISTE DE NIVEL! 🚀✨'],
    'game-over': ['¡Atendiste a toda la tiendita! 🏆', '¡Felicidades, eres una experta! 🌈'],
  };

  // ============================================
  // CICLO DE VIDA
  // ============================================

  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private nextCoinId = 1;

  ngOnInit(): void {
    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
      { type: 'failure', paths: ['audio/failure.wav'], volume: 0.7 },
      { type: 'level-up', paths: ['audio/level-up.wav'], volume: 0.9 },
    ]);

    const savedLevel = this.progress.getLevel(this.GAME_ID);

    this.session.startSession(
      {
        gameId: this.GAME_ID,
        sessionDurationMs: 5 * 60 * 1000,
        requiredCorrectForLevelUp: this.requiredCorrect,
        maxLevel: this.MAX_LEVEL,
        initialLevel: savedLevel,
      },
      this.activeProfile()?.age,
    );

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateProblem();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.unsubscribeEvents?.();
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* sin voz */
    }
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (event.type !== 'level-up') return;

    this.audio.playLevelUp();
    this.triggerConfetti();
    if (event.payload?.['isMaxLevel']) return; // fin del juego: lo muestra el feedback

    this.later(() => {
      if (!this.isOver()) this.generateProblem();
    }, 2500);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    const age = this.activeProfile()?.age ?? 4;
    const p = buildCoinProblem(this.currentLevel(), age);

    this.nextCoinId = 1;
    this.prompt.set(p.prompt);

    if (p.mode === 'count') {
      this.items.set(Array.from({ length: p.items }, (_, i) => i));
      this.options.set(p.options);
    } else {
      this.price.set(p.price);
      this.denominations.set(p.denominations);
      this.prePaid.set(p.prePaid);
      this.waysRequired.set(p.ways);
    }

    this.tapped.set(new Set());
    this.purse.set([]);
    this.found.set([]);
    this.disabledOptions.set([]);
    this.showHint.set(false);
    this.revealed.set(false);
    this.hint.set('');
    this.busy.set(false);
    this.reflecting.set(false);
    this.shaking.set(false);
    this.gobbling.set(false);
    this.localFeedback.set('idle');
  }

  // ============================================
  // MODO 'COUNT' (4 años)
  // ============================================

  onAppleTap(id: number): void {
    if (this.isOver() || this.solved() || this.busy()) return;
    this.audio.retryPendingAudio();
    if (this.tapped().has(id)) return; // solo se avanza, no se retrocede

    this.tapped.update(s => {
      const next = new Set(s);
      next.add(id);
      return next;
    });
    this.speak(this.tapped().size);

    if (this.tapped().size >= this.items().length) this.revealed.set(true);
  }

  /** Posición en el orden en que se tocó: es lo que ella ve, no el id de la manzana */
  tappedOrder(id: number): number {
    return [...this.tapped()].indexOf(id) + 1;
  }

  selectOption(selected: number): void {
    if (this.isOver() || this.solved() || this.busy()) return;
    if (this.disabledOptions().includes(selected)) return;
    if (!this.canAnswer()) {
      this.hint.set('Cuenta las manzanas una por una 👆🍎');
      return;
    }
    this.audio.retryPendingAudio();

    if (selected === this.items().length) {
      this.localFeedback.set('success');
      this.hint.set('');
      this.finishProblem();
    } else {
      this.localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.disabledOptions.update(list => [...list, selected]);
      this.showHint.set(true);
      this.hint.set('Cuenta cada manzana con el dedo 🍎👆');
      this.audio.playFailure();
    }
  }

  // ============================================
  // MODO 'PAY' (6 años)
  // ============================================

  dropCoin(value: number): void {
    if (this.isOver() || this.solved() || this.busy() || this.reflecting()) return;
    this.audio.retryPendingAudio();

    // Regla blanda: pasarse NO rompe la racha, solo hace una pregunta
    if (value > this.remaining()) {
      this.hint.set('¡Esa moneda no cabe! ¿Cuánto falta? 🤔');
      this.shaking.set(true);
      this.later(() => this.shaking.set(false), 500);
      return;
    }

    const delayMs = this.purse().length * 55;
    this.purse.update(list => [...list, { id: this.nextCoinId++, value, delayMs }]);
    this.hint.set('');

    if (this.remaining() === 0) {
      this.onCapFull();
      return;
    }
    if (!this.canStillFit()) {
      this.hint.set('Ya no cabe ninguna moneda… ¿cuál podrías devolver? 🤔');
    }
  }

  returnLast(): void {
    if (this.isOver() || this.solved() || this.busy() || this.purse().length === 0) return;
    this.purse.update(list => list.slice(0, -1));
    this.hint.set('');
  }

  clearPurse(): void {
    this.purse.set([]);
    this.hint.set('');
    // Sin esto `busy` se queda en true y dropCoin() seguiría ignorando los toques:
    // el juego quedaría imposible de terminar en los niveles que piden varias formas.
    this.busy.set(false);
  }

  /** Se invoca cuando termina la animación de entrada de una moneda */
  onCoinLanded(): void {
    this.gobbling.set(true);
    this.later(() => this.gobbling.set(false), 260);
  }

  private onCapFull(): void {
    this.busy.set(true);
    const key = this.purse()
      .map(c => c.value)
      .sort((a, b) => a - b)
      .join('+');
    const label = (this.prePaid() > 0 ? `${this.prePaid()} + ` : '') + key.split('+').join(' + ');

    // ¿Repetida? No rompe la racha, solo pide explorar otra vía
    if (this.found().some(d => d.key === key)) {
      this.hint.set('¡Esa forma ya la descubriste! ¿Hay otra? 🔎');
      this.later(() => this.clearPurse(), 1800);
      return;
    }

    this.found.update(list => [...list, { key, label }]);

    if (this.found().length < this.waysRequired()) {
      this.audio.playPraise();
      this.hint.set(`¡Descubriste ${label}! ¿Puedes pagar de otra forma? 🔎`);
      this.later(() => this.clearPurse(), 2000);
      return;
    }

    this.finishProblem();
  }

  // ============================================
  // FIN DE PROBLEMA
  // ============================================

  private finishProblem(): void {
    this.localFeedback.set('success');
    this.hint.set('');
    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      // El nuevo problema lo genera handleSessionEvent
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL,
      });
      return;
    }

    this.audio.playPraise();

    // 6 años: una reflexión de un toque antes del siguiente problema
    if ((this.activeProfile()?.age ?? 4) >= 6) {
      this.later(() => this.reflecting.set(true), 1500);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2400);
    }
  }

  readonly reflections = [
    { emoji: '🪙', text: 'Primero la moneda grande' },
    { emoji: '🧠', text: 'Pensé cuánto faltaba' },
    { emoji: '🔎', text: 'Probé otra combinación' },
  ];

  chooseReflection(): void {
    if (this.isOver()) return;
    this.audio.retryPendingAudio();
    this.generateProblem();
  }

  // ============================================
  // VISTA
  // ============================================

  coinEmoji(value: number): string {
    return value >= 10 ? '💵' : value >= 5 ? '🪙' : '🟡';
  }

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

  /** Conteo en voz alta */
  private speak(n: number): void {
    try {
      if (!this.audio.enabled() || typeof speechSynthesis === 'undefined') return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(String(n));
      u.lang = 'es-MX';
      u.rate = 0.85;
      u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch {
      /* sin voz disponible: el juego sigue */
    }
  }

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch {
      /* noop */
    }
  }

  /** setTimeout que se cancela solo al destruir el componente o generar otro problema */
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