import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SpeechService } from '@core/services/speech.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { CoinShopGallery } from './coin-shop-gallery.service';
import { buildCoinProblem, CoinMode, comboKey, MAX_LEVEL, waysFor } from './coin-shop-problem';

/**
 * "La Tiendita de Monedas" - un solo juego, tres modos según edad y nivel.
 *
 *  - `count` (4 años): cuenta objetos reales uno a uno (la correspondencia 1→1 rompe el conteo
 *    mecánico). Tras fallar, las opciones quedan bloqueadas hasta que haya contado todos.
 *  - `give`  (4 años, nivel 5+): "ponle N en la bolsa". El estante trae N+3: no vale llevárselos
 *    todos. Enseña cardinalidad: el último número dicho es el total.
 *  - `pay`   (6 años): paga el precio exacto con monedas de stock limitado, descubre varias
 *    formas distintas y, desde el nivel 7, completa un pago ya empezado.
 *
 * Tres decisiones que vienen de "El Tanque de Combustible" y conviene no olvidar:
 *
 *  1. Explorar no se castiga. Pasarse del precio hace rebotar la moneda con una pregunta,
 *     nunca rompe la racha. La racha cuenta rondas completadas, no intentos sin error.
 *  2. El acierto se registra UNA vez por ronda, al descubrir todas las formas pedidas.
 *  3. `busy` SIEMPRE se libera en `clearPurse()` y en `generateProblem()`. Sin eso,
 *     `dropCoin()` sigue ignorando los toques y el juego queda imposible de terminar: ya
 *     me pasó dos veces y ninguna lo detectó un test de lógica pura.
 */

interface ShelfItem {
  id: number;
  x: number;
  y: number;
}

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
  private readonly gallery = inject(CoinShopGallery);
  private readonly speech = inject(SpeechService);

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

  /** El modo lo decide la edad; el nivel decide si además es 'give' */
  readonly mode = computed<CoinMode>(() =>
    (this.activeProfile()?.age ?? 4) <= 4
      ? this.giveMode()
        ? 'give'
        : 'count'
      : 'pay',
  );

  // ============================================
  // ESTADO
  // ============================================

  // ---- modos 'count' y 'give' ----
  readonly shelf = signal<ShelfItem[]>([]);
  readonly item = signal('🍎');
  /** Cuántos hay que contar (count) o entregar (give) */
  readonly answer = signal(0);
  /** ¿Esta ronda es "ponle N en la bolsa"? Lo fija el generador según edad y nivel */
  readonly giveMode = signal(false);
  /** Ids ya contados, en orden de toque */
  readonly tapped = signal<number[]>([]);
  /** Ids metidos en la bolsa */
  readonly inBag = signal<number[]>([]);
  readonly options = signal<number[]>([]);
  readonly disabledOptions = signal<number[]>([]);
  /** Tras un error, obliga al conteo uno a uno antes de dejar reintentar */
  readonly showHint = signal(false);

  // ---- modo 'pay' ----
  readonly price = signal(0);
  readonly supply = signal<Record<number, number>>({});
  readonly prePaid = signal(0);
  readonly purse = signal<PurseCoin[]>([]);
  readonly found = signal<Discovery[]>([]);
  readonly waysRequired = signal(1);
  readonly waysTotal = signal(0);

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
  readonly isPay = computed(() => this.mode() === 'pay');

  /** Objetos que quedan en el estante (los de la bolsa se ocultan) */
  readonly shelfVisible = computed(() => {
    const bagged = new Set(this.inBag());
    return this.shelf().filter(o => !bagged.has(o.id));
  });

  readonly cap = computed(() => this.price() - this.prePaid());
  readonly spent = computed(() => this.purse().reduce((s, c) => s + c.value, 0));
  readonly remaining = computed(() => this.cap() - this.spent());

  /** Denominaciones del monedero, de menor a mayor */
  readonly coinValues = computed(() =>
    Object.keys(this.supply())
      .map(Number)
      .sort((a, b) => a - b),
  );

  /** Monedas que quedan de cada valor en la cartera */
  coinLeft(value: number): number {
    const used = this.purse().filter(c => c.value === value).length;
    return (this.supply()[value] ?? 0) - used;
  }

  /** ¿Queda alguna moneda que quepa por valor y que quede en la cartera? */
  readonly canStillFit = computed(() =>
    Object.keys(this.supply()).some(v => Number(v) <= this.remaining() && this.coinLeft(Number(v)) > 0),
  );

  /**
   * Atasco real: sigue faltando dinero pero ya no hay forma de llegar con lo que queda.
   * Es el aviso que de verdad ayuda ("devuelve una moneda"), en vez del genérico.
   */
  readonly isStuck = computed(() => {
    if (this.remaining() <= 0) return false;
    const left: Record<number, number> = {};
    for (const [v, n] of Object.entries(this.supply())) {
      const remainingCoins = this.coinLeft(Number(v));
      if (remainingCoins > 0) left[Number(v)] = remainingCoins;
    }
    return waysFor(left, this.remaining()).length === 0;
  });

  /**
   * En 'count', tras un error solo se responde si ya contó todos los objetos.
   * Ese es el mecanismo que ataca el conteo mecánico.
   */
  readonly canAnswer = computed(() => {
    if (this.solved()) return true;
    if (this.mode() !== 'count' || !this.showHint()) return true;
    return this.tapped().length >= this.shelf().length;
  });

  /** Colección acumulada de la niña. Se referencia el computed del servicio, sin envolver. */
  readonly galleryTotal = this.gallery.total;

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
      'Mira bien los objetos 🌈',
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
    if (event.payload?.['isMaxLevel']) return;

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

    this.prompt.set(p.prompt);
    this.item.set(p.item);
    this.answer.set(p.items);
    this.giveMode.set(p.mode === 'give');
    this.options.set(p.options);

    // Los ids son estables para que el @for no re-anime los objetos que ya están en pantalla
    this.shelf.set(p.positions.map((pos, id) => ({ id, x: pos.x, y: pos.y })));

    this.price.set(p.price);
    this.supply.set(p.supply);
    this.prePaid.set(p.prePaid);
    this.waysRequired.set(p.ways);
    this.waysTotal.set(p.waysTotal);

    // Reset explícito de TODOS los flags de bloqueo
    this.tapped.set([]);
    this.inBag.set([]);
    this.purse.set([]);
    this.found.set([]);
    this.disabledOptions.set([]);
    this.showHint.set(false);
    this.hint.set('');
    this.busy.set(false);
    this.reflecting.set(false);
    this.shaking.set(false);
    this.gobbling.set(false);
    this.localFeedback.set('idle');
    this.nextCoinId = 1;
  }

  // ============================================
  // MODO 'count'
  // ============================================

  onItemTap(id: number): void {
    if (this.isOver() || this.solved() || this.busy() || this.mode() !== 'count') return;
    this.audio.retryPendingAudio();
    if (this.tapped().includes(id)) return; // solo se avanza, no se retrocede

    this.tapped.update(list => [...list, id]);
    this.speak(this.tapped().length);
    this.hint.set('');
  }

  /** Posición en el orden en que se tocó: es lo que ella ve, no el id */
  tappedOrder(id: number): number {
    return this.tapped().indexOf(id) + 1;
  }

  selectOption(selected: number): void {
    if (this.isOver() || this.solved() || this.busy()) return;
    if (this.disabledOptions().includes(selected)) return;
    if (!this.canAnswer()) {
      this.hint.set('Cuenta los objetos uno por uno 👆');
      return;
    }
    this.audio.retryPendingAudio();

    if (selected === this.answer()) {
      this.hint.set('');
      this.finishProblem();
    } else {
      this.localFeedback.set('try-again');
      this.session.recordIncorrect();
      this.disabledOptions.update(list => [...list, selected]);
      this.showHint.set(true);
      this.hint.set('Cuenta cada uno con el dedo 👆');
      this.audio.playFailure();
    }
  }

  // ============================================
  // MODO 'give'
  // ============================================

  putInBag(id: number): void {
    if (this.isOver() || this.solved() || this.busy() || this.mode() !== 'give') return;
    this.audio.retryPendingAudio();
    if (this.inBag().includes(id)) return;

    this.inBag.update(list => [...list, id]);
    this.speak(this.inBag().length);
    this.hint.set('');

    // Pasarse no rompe la racha: solo pregunta
    if (this.inBag().length > this.answer()) {
      this.hint.set('¡Esa es más de lo que pidió! ¿Cuántos pidió? 🤔');
      this.shaking.set(true);
      this.later(() => this.shaking.set(false), 500);
    }
  }

  takeOutOfBag(id: number): void {
    if (this.isOver() || this.solved() || this.busy()) return;
    this.inBag.update(list => list.filter(x => x !== id));
    this.hint.set('');
  }

  deliver(): void {
    if (this.isOver() || this.solved() || this.busy() || this.mode() !== 'give') return;
    this.audio.retryPendingAudio();

    if (this.inBag().length === this.answer()) {
      this.hint.set('');
      this.finishProblem();
    } else {
      this.localFeedback.set('try-again');
      this.audio.playFailure();
      this.hint.set('Cuenta lo que hay en la bolsa. ¿Es lo que pidió la clienta? 🤔');
    }
  }

  // ============================================
  // MODO 'pay'
  // ============================================

  dropCoin(value: number): void {
    if (this.isOver() || this.solved() || this.busy() || this.reflecting()) return;
    this.audio.retryPendingAudio();

    // ¿Quedan monedas de ese valor?
    if (this.coinLeft(value) <= 0) {
      this.hint.set(`Ya no te quedan monedas de $${value} 🤔`);
      this.shaking.set(true);
      this.later(() => this.shaking.set(false), 500);
      return;
    }

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
    }
  }

  returnLast(): void {
    if (this.isOver() || this.solved() || this.busy() || this.purse().length === 0) return;
    this.purse.update(list => list.slice(0, -1));
    this.hint.set('');
  }

  /**
   * Vacía la alcancía. IMPORTANTE: también libera `busy`.
   * Sin esto, `dropCoin()` seguiría ignorando los toques y, en las rondas que piden varias
   * formas, el juego quedaría imposible de terminar.
   */
  clearPurse(): void {
    this.purse.set([]);
    this.hint.set('');
    this.busy.set(false);
  }

  /** Se invoca cuando termina la animación de entrada de una moneda */
  onCoinLanded(): void {
    this.gobbling.set(true);
    this.later(() => this.gobbling.set(false), 260);
  }

  private onCapFull(): void {
    this.busy.set(true);
    const coins = this.purse().map(c => c.value);
    const key = comboKey(coins);
    const label = (this.prePaid() > 0 ? `${this.prePaid()} + ` : '') + key.split('+').join(' + ');

    // ¿Repetida? No rompe la racha, solo pide explorar otra vía
    if (this.found().some(d => d.key === key)) {
      this.hint.set('¡Esa forma ya la descubriste! ¿Hay otra? 🔎');
      this.later(() => this.clearPurse(), 1800);
      return;
    }

    this.found.update(list => [...list, { key, label }]);
    this.gallery.discover(this.price(), coins);

    if (this.found().length < this.waysRequired()) {
      this.audio.playPraise();
      this.hint.set(`¡Descubriste ${label}! ¿Puedes pagar de otra forma? 🔎`);
      this.later(() => this.clearPurse(), 2000);
      return;
    }

    this.finishProblem();
  }

  // ============================================
  // FIN DE RONDA
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

    // 6 años: una reflexión de un toque antes de la siguiente ronda
    if ((this.activeProfile()?.age ?? 4) >= 6) {
      this.later(() => this.reflecting.set(true), 1500);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2400);
    }
  }

  /** "Has encontrado 3 de 8 formas posibles": solo al final, nunca durante el juego */
  readonly waysMessage = computed(() => {
    if (this.waysTotal() <= this.waysRequired()) return '';
    return `De $${this.price()} existen ${this.waysTotal()} formas de pagar. Hoy descubriste ${this.found().length}.`;
  });

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

  /** Objeto pedido en la bolsa, para la lista de la clienta */
  bagLabel(id: number): string {
    return this.item();
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

  private speak(n: number): void {
    if (!this.audio.enabled()) return;
    // El servicio solo habla si hay voz LOCAL para es-MX: sin conexión, una voz de red
    // fallaría en silencio. Aquí avisa una vez en consola y el juego sigue igual.
    this.speech.speak(String(n), 'es-MX', { rate: 0.85, pitch: 1.1 });
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