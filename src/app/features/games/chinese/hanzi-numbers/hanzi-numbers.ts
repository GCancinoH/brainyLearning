import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { Narrator } from '@core/games/narrator.service';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { CLIP_BASE, CLIP_MANIFEST, CLIP_TEXT, numeroClip } from './hanzi-narration';
import {
  buildCombinacionProblem,
  buildReconocerProblem,
  etapaDeNivel,
  leer,
} from './hanzi-numbers-problem';

/**
 * "Números Hanzi" — Planeta Dragón 🐉, con el Sabio Long.
 *
 * Un juego, dos etapas, y el cambio lo da el nivel:
 *
 *  1. **Reconocer (niveles 1–6):** el 1–20 en dígitos y en hanzi. Se alterna la dirección:
 *     "¿cuál es el hanzi de 7?" y "¿qué número es 七?". Reconocer el glifo y leerlo son
 *     dos habilidades distintas, y con una sola dirección el juego se convertiría en
 *     adivinar cuál de los cuatro es el bonito.
 *  2. **Combinar (niveles 7–12):** se ve un número (35) y hay que AGARRAR de la bandeja
 *     los hanzis que lo recrean **en orden**: 三 → 十 → 五.
 *
 * LA REGLA QUE TODO SOSTIENE: **la lectura es la validación.**
 *
 * El chino es posicional: la 三 de 三十五 vale 30 porque va antes del 十. En vez de
 * juzgar el montaje con un "correcto/incorrecto", el juego lo **lee** y enseña el número
 * que ha salido. Si sale 53 y el objetivo es 35, la niña lo ve y lo cambia: no recibe un
 * veredicto, recibe una cuenta. Eso es exactamente lo que pide el método.
 *
 * El orden importa y se aprende tocando: 五十三 sí se lee (y es 53), 三五 no se lee, y
 * para quince el chino es 十五 sin el uno.
 */

/** Pieza agarrada: `i` es su índice en la bandeja (para poder devolverla). */
interface PiezaAgarrada {
  i: number;
  p: string;
}

@Component({
  selector: 'hanzi-numbers',
  imports: [GameFeedbackComponent, GameRestOverlayComponent],
  templateUrl: './hanzi-numbers.html',
  styleUrl: './hanzi-numbers.scss',
})
export class HanziNumbers implements OnInit, OnDestroy {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly narrator = inject(Narrator);

  readonly activeProfile = this.profileState.activeProfile;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  readonly GAME_ID = 'hanzi-numbers';
  /** 1–6 reconocer, 7–12 combinar: seis niveles por etapa. */
  readonly MAX_LEVEL = 12;
  /** A los 4 años, 5 aciertos seguidos son demasiado exigentes */
  readonly requiredCorrect = (this.activeProfile()?.age ?? 4) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  /** Qué etapa toca según el nivel: el juego "cambia" solo. */
  readonly etapa = computed(() => etapaDeNivel(this.currentLevel()));

  // ============================================
  // ESTADO · etapa 1 (reconocer)
  // ============================================

  readonly enunciado = signal('');
  readonly direccion = signal<'numero-a-hanzi' | 'hanzi-a-numero'>('numero-a-hanzi');
  readonly opciones = signal<string[]>([]);
  readonly respuesta = signal('');

  // ============================================
  // ESTADO · etapa 2 (combinar)
  // ============================================

  readonly objetivo = signal(0);
  readonly bandeja = signal<string[]>([]);
  readonly agarradas = signal<PiezaAgarrada[]>([]);
  /** El número que dice lo que lleva armado, o `null` si todavía no se lee. */
  readonly leido = computed(() => leer(this.agarradas().map(a => a.p)));
  /** ¿La pieza `i` de la bandeja está ya en la mano? */
  usada(i: number): boolean {
    return this.agarradas().some(a => a.i === i);
  }

  // ============================================
  // ESTADO · común
  // ============================================

  /** La consigna, escrita. */
  readonly linea = signal('');
  /** La duda socrática. Nunca dice que está mal: propone el siguiente movimiento. */
  readonly hint = signal('');
  readonly busy = signal(false);
  /**
   * Cambia en cada problema y va en el `track` de las piezas y las opciones.
   *
   * Sin él, Angular reutiliza los nodos que siguen presentes (la opción "3" de un
   * problema es la "3" del siguiente) y esas no vuelven a entrar: la mitad de las
   * opciones aparecerían de golpe y la otra mitad ya estaría quieta.
   */
  readonly problemaId = signal(0);

  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  private destroyed = false;
  private readonly timers = new Set<number>();
  /** Para no repetir la duda hablada en cada toque de la misma ronda. */
  private dudaDicha = false;

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

  readonly customFeedbackMessages: Record<string, string[]> = {
    success: ['¡Muy bien! 🐉', '¡Lo formaste!'],
    'level-up': ['¡Subiste de nivel! 🎉'],
    'game-over': ['¡Buen trabajo! Descansa un poco.'],
  };

  ngOnInit(): void {
    // Dónde viven los clips de este juego y qué dice cada uno. El manifiesto es también el
    // plan B del TTS: sin él, un clip ausente se intentaría leer con la voz equivocada.
    this.narrator.configure({
      base: CLIP_BASE,
      ext: 'm4a',
      manifest: CLIP_MANIFEST,
    });

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
    // ⚠️ `narrator.cancel()` ANTES de `audio.dispose()`: al revés, `dispose()` deja los
    // audios de celebración colgados y el próximo juego se oye encima.
    this.narrator.cancel();
    try {
      if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    } catch {
      /* sin voz */
    }
    this.audio.dispose();
    this.session.endSession('user-exit');
  }

  private unsubscribeEvents?: () => void;

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
    this.hint.set('');
    this.localFeedback.set('idle');
    this.busy.set(false);
    this.dudaDicha = false;
    this.agarradas.set([]);
    this.problemaId.update(n => n + 1);

    const nivel = this.currentLevel();
    const age = this.activeProfile()?.age ?? 4;

    if (etapaDeNivel(nivel) === 'reconocer') {
      const p = buildReconocerProblem(nivel);
      this.direccion.set(p.direccion);
      this.enunciado.set(p.enunciado);
      this.respuesta.set(p.respuesta);
      this.opciones.set(p.opciones);
      this.linea.set(
        p.direccion === 'numero-a-hanzi'
          ? 'Toca el hanzi de este número'
          : 'Toca el número que dice este hanzi',
      );
      // La consigna **y el número en chino**. Este segundo clip es el ancla: sin oír
      // "qī" mientras se mira el 7, no hay puente entre el número y el glifo.
      void this.narrar([
        p.direccion === 'numero-a-hanzi' ? 'hn.ask.a-hanzi' : 'hn.ask.a-numero',
        numeroClip(p.numero),
      ]);
      return;
    }

    const p = buildCombinacionProblem(nivel, age);
    this.objetivo.set(p.objetivo);
    this.bandeja.set(p.bandeja);
    this.linea.set(`Forma el ${p.objetivo} con los hanzis`);
    void this.narrar(['hn.ask.combinar', numeroClip(p.objetivo)]);
  }

  // ============================================
  // ETAPA 1 · RECONOCER
  // ============================================

  elegir(opcion: string): void {
    if (this.busy() || this.isOver() || this.solved()) return;

    // La opción tocada suena en chino **sea la que sea**: es la exploración que enseña.
    // Si la consigna dijo "qī" al entrar, tocar hasta oír "qī" resuelve el problema sin
    // saber todavía qué glifo es cuál.
    void this.narrar(claveDeValor(opcion));

    if (opcion === this.respuesta()) {
      this.finishProblem();
      return;
    }

    this.dudar('hn.duda.oye');
  }

  // ============================================
  // ETAPA 2 · COMBINAR
  // ============================================

  /** Agarra la pieza `i` de la bandeja y la añade al final de la lectura. */
  agarrar(i: number): void {
    if (this.busy() || this.isOver() || this.solved() || this.usada(i)) return;
    const pieza = this.bandeja()[i];
    if (pieza === undefined) return;

    this.agarradas.update(list => [...list, { i, p: pieza }]);
    // Cada pieza que se agarra suena: 三, 十, 五… El montaje se oye mientras se hace.
    void this.narrar(claveDeValor(pieza));
    this.revisar();
  }

  /** Devuelve la pieza `i` de la bandeja (toca el chip de arriba). */
  soltar(i: number): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    this.agarradas.update(list => list.filter(a => a.i !== i));
    this.hint.set('');
  }

  limpiar(): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    this.agarradas.set([]);
    this.hint.set('');
  }

  /**
   * Lee lo armado y decide qué significa.
   *
   * No hay "mal": hay un número que **no es el objetivo** o una lectura que **todavía no
   * se sostiene**. En ambos casos la niña ve la cuenta y la cambia.
   */
  private revisar(): void {
    const n = this.leido();
    if (n === null) {
      // Todavía no se lee (三五, o el orden está al revés). La duda apunta al 十, que es
      // lo que casi siempre falta.
      this.dudar('hn.duda.dieces');
      return;
    }
    if (n === this.objetivo()) {
      this.finishProblem();
      return;
    }
    // Se lee, pero es otro número: la línea de arriba ya muestra ambos, comparar es el
    // ejercicio. No hace falta decirle que está mal.
    this.hint.set('');
  }

  // ============================================
  // CIERRE DE RONDA
  // ============================================

  private finishProblem(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.localFeedback.set('success');
    this.hint.set('');

    // Primero el número, entero, en chino: es la recompensa y la pronunciación de la
    // palabra que acaba de construir. Después el elogio del juego.
    const n = this.etapa() === 'reconocer' ? valorDe(this.respuesta()) : this.objetivo();
    void this.narrar(n ? numeroClip(n) : null).then(() => this.audio.playPraise());

    const result = this.session.recordCorrect();

    if (result.leveledUp) {
      // El nuevo problema lo genera handleSessionEvent
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL,
      });
      return;
    }

    this.later(() => {
      if (!this.isOver()) this.generateProblem();
    }, 2600);
  }

  /** La duda se dice una vez por ronda: repetirla en cada toque sería un sermón. */
  private dudar(clip: 'hn.duda.oye' | 'hn.duda.dieces'): void {
    this.hint.set(CLIP_TEXT[clip]);
    if (this.dudaDicha) return;
    this.dudaDicha = true;
    void this.narrar(clip);
  }

  // ============================================
  // VISTA
  // ============================================

  goBack(): void {
    this.narrator.cancel();
    this.session.endSession('user-exit');
    void this.router.navigate(['/games/chinese']);
  }

  // ============================================
  // INFRAESTRUCTURA
  // ============================================

  /** Habla una clave (o una secuencia de ellas) con la voz que pide el manifiesto. */
  private narrar(keys: string | string[] | null): Promise<boolean> {
    if (!keys) return Promise.resolve(false);
    const lista = Array.isArray(keys) ? keys : [keys];
    // `undefined`, no '': un texto vacío ahogaría al manifiesto, que es el que tiene el
    // TTS y el idioma de los clips en chino.
    const textos = lista.map(k => CLIP_TEXT[k]).filter(Boolean).join(' ');
    return this.narrator.say(lista, textos || undefined);
  }

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
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

// ============================================
// CLAVES DE AUDIO
// ============================================

/**
 * Clave del clip que pronuncia en chino lo que dice `texto`.
 *
 * Un dígito ("7") y un hanzi ("七") dicen lo mismo; las dos formas son opciones según la
 * dirección del ejercicio, y las dos tienen que sonar.
 */
function claveDeValor(texto: string): string | null {
  const n = valorDe(texto);
  return n === null ? null : numeroClip(n);
}

function valorDe(texto: string): number | null {
  const n = /^\d+$/.test(texto) ? Number(texto) : leer([texto]);
  return n !== null && n >= 1 && n <= 99 ? n : null;
}
