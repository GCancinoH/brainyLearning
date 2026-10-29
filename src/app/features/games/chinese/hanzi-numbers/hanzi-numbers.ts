import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { FeedbackState, SessionEvent } from '@core/games/game-types';
import { CdkDrag, CdkDropList, CdkDragDrop } from '@angular/cdk/drag-drop';
import { Narrator } from '@core/games/narrator.service';
import { TutorialSeen } from '@core/games/tutorial-seen.service';
import { FirstAttemptGuard } from '@core/learning/first-attempt-guard';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { HANZI_NUMBERS_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import type { RepresentationType } from '@core/learning/learning-content';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { CLIP_BASE, CLIP_MANIFEST, PISTA_ICONO, numeroClip } from './hanzi-narration';
import {
  buildCombinacionProblem,
  buildReconocerProblem,
  etapaDeNivel,
  leer,
  leerNumero,
  perillaCombinar,
  piezasDe,
  topeReconocer,
  descomponerCPA,
  type DireccionCombinar,
  DIGITOS,
  hanziPara,
} from './hanzi-numbers-problem';

/**
 * ms sin tocar un montaje que no se lee antes de proponer el 十. Mientras le queden
 * piezas por poner, la duda espera —si aún puede cerrarse, se calla—; si se queda
 * quieta, llega.
 */
export const PAUSA_DUDA_MS = 4000;

/**
 * 2.2 · Las 3 preguntas del mini-diagnóstico: una de cada tramo (5, 15, 20).
 *
 * No es un examen aparte: son problemas de reconocer generados **con su nivel**, así que
 * dirección, ancla del audio (solo la trae la pregunta del nivel1) y opciones son
 * exactamente las que vería al jugar. Lo que decide es el primer toque.
 */
const DIAG_NIVELES = [1, 3, 4] as const;

/**
 * 2.4 · Clave de "modo" para `TutorialSeen`: la etapa de combinar es una mecánica nueva
 * que se explica una vez por perfil, como los tutoriales de kanji-compose.
 */
const PUENTE_MODO = 'combinar';

/**
 * 3.1 · Los skills que este juego anota (catálogo `CHINESE_SKILLS`). Reconocer y
 * combinar son dos habilidades distintas —como reconocer y componer un kanji— y el
 * panel de padres necesita poder nombrar cada una.
 */
const SKILL_RECONOCER = 'chinese.numeros.reconocer';
const SKILL_COMBINAR = 'chinese.numeros.combinar';

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
  imports: [CdkDrag, CdkDropList, GameFeedbackComponent, GameRestOverlayComponent],
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
  private readonly tutorials = inject(TutorialSeen);
  private readonly skills = inject(SkillProgressService);
  private readonly srs = inject(SpacedRepetition);

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

  /**
   * Opciones ya tocadas y descartadas: se atenúan y se quedan quietas, sin veredicto.
   * La niña ve qué ya probó y qué le queda (mismo patrón que `recall-option--no` de
   * kanji-compose: se le quita lo que ha descartado, no se le dice que estuvo mal).
   */
  readonly opcionesDescartadas = signal<ReadonlySet<string>>(new Set());

  /**
   * El primer toque de `reconocer`, tal cual: `null` mientras no haya tocado nada.
   *
   * Es lo que cuenta para medir —acertar **al primer toque**—. Aquí se mide, no se
   * castiga: un error no rompe la racha (Zvonkin: el error es exploración), pero el
   * primer intento queda registrado para que el progreso diga la verdad.
   */
  readonly primerIntento = signal<boolean | null>(null);

  /**
   * 2.2 · Mini-diagnóstico: `null` fuera de él; dentro, el primer toque de cada una de
   * las 3 preguntas. La sesión **no existe todavía** — el diagnóstico es quien decide
   * en qué nivel arranca una recién llegada de 6 años.
   */
  readonly diagnostico = signal<{ respuestas: boolean[] } | null>(null);

  /**
   * 3.4 · Reflexión de un toque (6 años): tras cada acierto que NO sube de nivel se
   * pregunta "¿Cómo lo hiciste?" y el juego espera su toque. La elección no se guarda
   * —eso es §5.11— pero **cambia el problema que viene**: cada botón hace lo que dice.
   */
  readonly reflecting = signal(false);

  readonly reflexiones = [
    { que: 'nuevo' as const, emoji: '🧠', text: 'Lo sé de memoria', aria: 'Sacar uno que no haya salido' },
    { que: 'repaso' as const, emoji: '🖐️', text: 'Lo conté', aria: 'El mismo número otra vez' },
    { que: 'ancla' as const, emoji: '👂', text: 'Me ayudó el audio', aria: 'Que el audio te acompañe al entrar' },
  ];

  // ============================================
  // ESTADO · etapa 2 (combinar)
  // ============================================

  readonly objetivo = signal(0);
  /** 4.3 · Dirección de combinar: 'hanzi-a-numero' (normal) o 'numero-a-hanzi' (inversa). */
  readonly direccionCombinar = signal<DireccionCombinar>('hanzi-a-numero');
  readonly bandeja = signal<string[]>([]);
  readonly agarradas = signal<PiezaAgarrada[]>([]);
  /** El número que dice lo que lleva armado, o `null` si todavía no se lee.
   *  Usa `leer` (hanzi) o `leerNumero` (dígitos) según la dirección. */
  readonly leido = computed(() => {
    const piezas = this.agarradas().map(a => a.p);
    return this.direccionCombinar() === 'hanzi-a-numero'
      ? leer(piezas)
      : leerNumero(piezas);
  });

  /** 4.1 · CPA / bloques Dienes: descomposición del objetivo en decenas y unidades.
   *  Solo en etapa combinar (≥11) y dirección normal. */
  readonly cpa = computed(() =>
    this.etapa() === 'combinar' && this.direccionCombinar() === 'hanzi-a-numero'
      ? descomponerCPA(this.objetivo())
      : { decenas: 0, unidades: 0 },
  );

  /** 4.3 · Hanzi del objetivo para la dirección inversa (se muestra en objetivo-hanzi). */
  readonly objetivoHanzi = computed(() => hanziPara(this.objetivo()));

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
   * 2.4 · El puente del salto 6→7: la tarjeta que explica la etapa nueva con narración
   * y una demostración **antes** del primer problema real. Se ve una vez por perfil.
   */
  readonly puente = signal(false);
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
  /** Qué toque fue el primero del problema: la llave es `problemaActual`. */
  private readonly firstAttempt = new FirstAttemptGuard();
  /** Objeto nuevo en cada problema: así el guard distingue un problema de otro. */
  private problemaActual: object = {};
  /** El temporizador de la duda por pausa, si hay uno armado. */
  private dudaPausaId: number | null = null;
  /** 3.1 · Cuántos callejones de orden inválido hubo en esta ronda de combinar. */
  private callejones = 0;
  /** 3.1 · La opción con la que FALLÓ el primer toque: va en el mistake, sin adivinar. */
  private primerToqueErrado: string | null = null;
  /** 3.1 · Cuándo se mostró el problema, para el `responseTimeMs` del intento. */
  private rondaEmpezadaEn = Date.now();
  /** 3.2 · Números que ya han salido hoy en la sesión (los pide la reflexión "nuevo"). */
  private readonly vistosHoy = new Set<number>();
  /** 3.2 · El número de este problema, por si la reflexión pide repetirlo ("repaso"). */
  private ultimoNumero = 0;
  /** 3.4 · La elección de la reflexión, que consume `generateProblem`. */
  private modoReflexion: 'nuevo' | 'repaso' | 'ancla' | null = null;
  /** 3.4 · Si el siguiente problema entra con el ancla pedida en la reflexión. */
  private anclaPedida = false;

  // ============================================
  // DERIVADOS
  // ============================================

  readonly feedbackState = computed<FeedbackState>(() => {
    const s = this.session.state();
    // Sin sesión solo pasa mientras dura el diagnóstico (2.2), que se juega ANTES de
    // montarla: allí el avance de la ronda sí es feedback local que hay que enseñar.
    if (!s) return this.localFeedback();
    if (s.isCompleted || s.isTimeUp) return 'game-over';
    return this.localFeedback();
  });

  readonly solved = computed(() => this.feedbackState() === 'success');

  readonly customFeedbackMessages: Record<string, string[]> = {
    // Iconos, no frases (2.5): el banner es un mood para quien aún no lee. Lo que hay
    // que OÍR —el número acertado y el elogio— ya lo dice la voz, una sola vez.
    success: ['🌟', '🥳'],
    'level-up': ['🏆', '🎉'],
    'game-over': ['🌙', '👋'],
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

    // 2.2 · Un perfil de 6 años que JUGÓ ya tiene progreso guardado y no vuelve a
    // examinarse; solo una recién llegada pasa por las 3 preguntas que deciden su nivel.
    // Los 4 años arrancan en el 1 sin diagnóstico.
    if (this.debeDiagnosticar()) {
      this.iniciarDiagnostico();
      return;
    }
    this.iniciarPartida();
  }

  /** Monta la sesión en `level` (o en el guardado) y genera el primer problema. */
  private iniciarPartida(level?: number): void {
    const nivel = level ?? this.progress.getLevel(this.GAME_ID);
    this.session.startSession(
      {
        gameId: this.GAME_ID,
        sessionDurationMs: 5 * 60 * 1000,
        requiredCorrectForLevelUp: this.requiredCorrect,
        maxLevel: this.MAX_LEVEL,
        initialLevel: nivel,
      },
      this.activeProfile()?.age,
    );

    this.unsubscribeEvents = this.session.onEvent(e => this.handleSessionEvent(e));
    this.generateProblem();
  }

  /**
   * Solo una recién llegada de 6 años: `getProgress` es `null` únicamente **sin**
   * partida guardada — el nivel guardado (sea el que sea) manda siempre.
   */
  private debeDiagnosticar(): boolean {
    if ((this.activeProfile()?.age ?? 4) !== 6) return false;
    return this.progress.getProgress(this.GAME_ID) === null;
  }

  private iniciarDiagnostico(): void {
    this.diagnostico.set({ respuestas: [] });
    this.generateProblem(); // → la rama del diagnóstico genera la pregunta 1
  }

  /**
   * El diagnóstico acaba: la ubicación es aciertos + 1 (3 → N4, 2 → N3, 1 → N2, 0 → N1)
   * y queda guardada como cualquier otro nivel — a partir de ahí el juego no distingue
   * a una diagnosticada de una que llegó al 4 jugando.
   */
  private terminarDiagnostico(): void {
    const respuestas = this.diagnostico()?.respuestas ?? [];
    const ubicacion = respuestas.filter(Boolean).length + 1;
    this.diagnostico.set(null);
    this.progress.saveProgress(this.GAME_ID, { level: ubicacion, completed: false });
    this.iniciarPartida(ubicacion);
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
    this.quitarDudaPorPausa();
    this.hint.set('');
    this.localFeedback.set('idle');
    this.busy.set(false);
    this.reflecting.set(false);
    this.dudaDicha = false;
    this.callejones = 0;
    this.primerToqueErrado = null;
    // Nuevo problema, nueva medición: el primer intento y lo descartado empiezan de cero.
    this.problemaActual = {};
    this.primerIntento.set(null);
    this.opcionesDescartadas.set(new Set());
    this.agarradas.set([]);
    this.problemaId.update(n => n + 1);

    // 2.2 · Diagnóstico: la pregunta que toca, o el cierre si ya van las 3.
    const diag = this.diagnostico();
    if (diag) {
      if (diag.respuestas.length >= DIAG_NIVELES.length) this.terminarDiagnostico();
      else this.generarReconocer(DIAG_NIVELES[diag.respuestas.length]);
      return;
    }

    const nivel = this.currentLevel();

    // 2.4 · Puente del salto 6→7: la primera vez la etapa nueva se EXPLICA —narración y
    // una pieza que entra— y solo después entra el primer problema real. `TutorialSeen`
    // lo hace una vez por perfil: la quinta ronda ya no aporta nada y sí le quita juego.
    if (etapaDeNivel(nivel) === 'combinar' && !this.tutorials.has(this.GAME_ID, PUENTE_MODO)) {
      this.puente.set(true);
      void this.narrar('hn.puente');
      return;
    }

    // 3.4 · Lo que pidió la reflexión manda aquí y se consume: un toque, un cambio.
    const modo = this.modoReflexion;
    this.modoReflexion = null;
    this.anclaPedida = modo === 'ancla';

    // 3.2 · Repetición espaciada (mismo motor que kanji-compose): los números vencidos
    // del mazo mandan sobre el azar —el más atrasado primero— pero solo si caben en el
    // tramo del nivel: el repaso no sube de nivel por la puerta trasera.
    const vencidos = this.srs.due(HANZI_NUMBERS_DECK).map(Number).filter(Number.isInteger);

    if (etapaDeNivel(nivel) === 'reconocer') {
      const tope = topeReconocer(nivel);
      this.generarReconocer(nivel, this.numeroPara(modo, [1, tope], vencidos), modo === 'ancla');
      return;
    }

    const age = this.activeProfile()?.age ?? 4;
    const rango = perillaCombinar(nivel, age).rango;
    // 4.3 · Dirección de combinar: alterna a partir del N7 (como reconocer en N3).
    // La dirección normal 'hanzi-a-numero' (ver número → formar hanzi) y la inversa
    // 'numero-a-hanzi' (ver hanzi → formar número con dígitos) se alternan.
    const dirCombinar: DireccionCombinar =
      nivel >= 7 && (nivel - 7) % 2 === 1 ? 'numero-a-hanzi' : 'hanzi-a-numero';
    this.direccionCombinar.set(dirCombinar);

    const p = buildCombinacionProblem(
      nivel,
      age,
      Math.random,
      this.numeroPara(modo, rango, vencidos),
      dirCombinar,
    );
    this.objetivo.set(p.objetivo);
    this.bandeja.set(p.bandeja);
    this.rondaEmpezadaEn = Date.now();
    this.ultimoNumero = p.objetivo;
    this.vistosHoy.add(p.objetivo);
    // 2.5 · Sin consigna escrita: el rótulo "Forma" es un icono (en el html) y la frase
    // la dice la voz. Y 2.3 · el objetivo NO se lee en voz alta al entrar: el oído
    // acompaña el montaje (las piezas suenan al tocarlas), no lo entrega hecho. Salvo
    // que ella pida el audio en la reflexión (3.4): entonces el ancla vuelve una vez.
    this.linea.set('');
    // En dirección inversa, el objetivoMostrado ya es el hanzi; narramos la consigna.
    void this.narrar(
      this.anclaPedida
        ? ['hn.ask.combinar', numeroClip(p.objetivo)]
        : 'hn.ask.combinar',
    );
  }

  /**
   * 3.2 + 3.4 · Qué número toca: primero lo que pidió la reflexión, después el SRS (el
   * más atrasado del tramo), y si no hay memoria —o ya salió todo el tramo— que decida
   * el azar del nivel (el builder).
   */
  private numeroPara(
    modo: 'nuevo' | 'repaso' | 'ancla' | null,
    tramo: readonly [number, number],
    vencidos: readonly number[],
  ): number | undefined {
    const [min, max] = tramo;
    const enTramo = (n: number): boolean => Number.isInteger(n) && n >= min && n <= max;
    if (modo === 'repaso' && enTramo(this.ultimoNumero)) return this.ultimoNumero;
    if (modo === 'nuevo') {
      const frescos: number[] = [];
      for (let n = min; n <= max; n++) if (!this.vistosHoy.has(n)) frescos.push(n);
      if (frescos.length > 0) return frescos[Math.floor(Math.random() * frescos.length)];
    }
    return vencidos.find(enTramo);
  }

  /**
   * Una pregunta de reconocer en el nivel que toca —el real, o una de las del
   * diagnóstico, que se generan con SU nivel para que sean el juego tal cual.
   *
   * `numeroElegido` viene del SRS o de la reflexión (3.2/3.4); `ancla` es el audio que
   * ella pidió en la reflexión y que vuelve una vez.
   */
  private generarReconocer(nivel: number, numeroElegido?: number, ancla = false): void {
    const age = this.activeProfile()?.age ?? 4;
    const p = buildReconocerProblem(nivel, age, Math.random, numeroElegido);
    this.direccion.set(p.direccion);
    this.enunciado.set(p.enunciado);
    this.respuesta.set(p.respuesta);
    this.opciones.set(p.opciones);
    this.rondaEmpezadaEn = Date.now();
    this.ultimoNumero = p.numero;
    if (!this.diagnostico()) this.vistosHoy.add(p.numero);
    // 2.5 · La consigna no se escribe para quien aún no lee: son iconos de dirección —
    // ¿qué se muestra y qué se elige— y la frase la dice la voz al entrar.
    this.linea.set(p.direccion === 'numero-a-hanzi' ? '🔢➡️🔤' : '🔤➡️🔢');
    const ask = p.direccion === 'numero-a-hanzi' ? 'hn.ask.a-hanzi' : 'hn.ask.a-numero';
    // 2.3 · El ancla —oír "qī" mientras se mira el 7— puentea número y glifo, pero SOLO
    // en N1–N2, donde emparejar por oído está bien. Desde el N3 el inicio ya no dice el
    // número: si lo dijera, tocar hasta oír lo igual resolvería el problema sin mirar
    // el glifo, que es justamente lo que el juego enseña. Salvo que ella lo pida en la
    // reflexión (3.4): pedir ayuda y recibirla es aprender, no hacer trampa.
    void this.narrar(nivel <= 2 || ancla ? [ask, numeroClip(p.numero)] : ask);
  }

  // ============================================
  // ETAPA 1 · RECONOCER
  // ============================================

  elegir(opcion: string): void {
    if (this.busy() || this.isOver() || this.solved()) return;

    // El primer toque queda registrado tal cual: es lo que cuenta para medir (1.2).
    // 3.1 · Y la opción con la que falló el primero viaja en el mistake, sin adivinar.
    if (this.firstAttempt.isFirst(this.problemaActual)) {
      this.primerIntento.set(opcion === this.respuesta());
      if (opcion !== this.respuesta()) this.primerToqueErrado = opcion;
    }

    if (opcion === this.respuesta()) {
      // Una sola voz por acierto: el número lo narra `finishProblem`, no aquí. Dos
      // `say()` seguidos, el segundo corta al primero —el 1.º se quedaría sin sonar—.
      this.finishProblem();
      return;
    }

    // Lo descartado se atenúa y se queda quieto: sin veredicto, la niña ve qué ya probó
    // y qué le queda.
    this.opcionesDescartadas.update(tocadas => new Set(tocadas).add(opcion));
    // La opción tocada suena en chino **sea la que sea**: es la exploración que enseña.
    // Si la consigna dijo "qī" al entrar, tocar hasta oír "qī" resuelve el problema sin
    // saber todavía qué glifo es cuál. Va en la MISMA narración que la duda, delante.
    this.dudar('hn.duda.oye', claveDeValor(opcion));
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
    // Quien la narra es `revisar`, porque allí se decide si va sola, con la duda… o si
    // la sustituye el número entero al acabar: una sola narración por toque.
    this.revisar(claveDeValor(pieza));
  }

  /** Devuelve la pieza `i` de la bandeja (toca el chip de arriba). */
  soltar(i: number): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    this.agarradas.update(list => list.filter(a => a.i !== i));
    this.hint.set('');
    // Sigue construyendo (o ya no): su toque reinicia el reloj de la duda por pausa.
    this.armarDudaPorPausa();
  }

  limpiar(): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    this.agarradas.set([]);
    this.hint.set('');
    // Vacío: no hay nada que dudar, y el reloj que hubiera armado se cancela.
    this.armarDudaPorPausa();
  }

  /**
   * 4.2 · Reordenar por arrastre: la niña puede mover las fichas ya puestas
   * sin tener que limpiar y volver a empezar. El orden sigue validándose
   * por `leer()` (la escritura canónica), así que si el nuevo orden no
   * coincide con el objetivo, `leido()` dará otro número y ella lo verá.
   */
  reorderPieces(event: CdkDragDrop<PiezaAgarrada[]>): void {
    if (this.busy() || this.isOver() || this.solved()) return;
    const arr = this.agarradas();
    const item = arr.splice(event.previousIndex, 1)[0];
    arr.splice(event.currentIndex, 0, item);
    this.agarradas.set([...arr]);
    this.hint.set('');
    this.armarDudaPorPausa();
  }

  /**
   * Lee lo armado y decide qué significa.
   *
   * No hay "mal": hay un número que **no es el objetivo** o una lectura que **todavía no
   * se sostiene**. En ambos casos la niña ve la cuenta y la cambia.
   *
   * Y la duda no interrumpe a mitad de obra: solo habla cuando el montaje ya **no puede
   * cerrarse** —ha puesto todas las piezas y sigue sin leerse: callejón sin salida— o si
   * se queda quieta (tras una pausa). Mientras aún le queden piezas por poner, el parcial
   * puede llegar a una lectura y la duda prematura se calla.
   *
   * `pieza` es el sonido de lo que acaba de agarrar: la narración sale de aquí para que
   * sea UNA sola —la pieza sola, la pieza con la duda en la misma cadena, o al acertar el
   * número entero—. Dos `say()` seguidos, el segundo corta al primero.
   */
  private revisar(pieza: string | null = null): void {
    const n = this.leido();
    if (n === null) {
      if (this.agarradas().length < piezasDe(this.objetivo()).length) {
        // Todavía puede cerrarse: se calla y solo, si se queda quieta, se le propone el 十.
        this.armarDudaPorPausa();
        void this.narrar(pieza);
        return;
      }
      // Puso todas las piezas y no se lee (三五, o el orden está al revés): es un
      // callejón sin salida. La duda apunta al 十, que es lo que casi siempre falta.
      // 3.1 · Cada callejón cuenta: es el "reinicio por orden inválido" del criterio de
      // error —no cada toque, que eso es exploración—.
      this.callejones++;
      this.quitarDudaPorPausa();
      this.dudar('hn.duda.dieces', pieza);
      return;
    }
    if (n === this.objetivo()) {
      // El número entero, que narra `finishProblem`, dice más que la pieza suelta.
      this.finishProblem();
      return;
    }
    // Se lee, pero es otro número: la línea de arriba ya muestra ambos, comparar es el
    // ejercicio. No hace falta decirle que está mal.
    this.hint.set('');
    void this.narrar(pieza);
  }

  // ============================================
  // CIERRE DE RONDA
  // ============================================

  private finishProblem(): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.localFeedback.set('success');
    this.hint.set('');

    // 2.2 · Diagnóstico: lo que decide es el PRIMER toque de la pregunta. Se anota al
    // cerrar, que es cuando ya se sabe cómo terminó (el2.º toque no lo reescribe).
    const diag = this.diagnostico();
    if (diag) {
      this.diagnostico.set({ respuestas: [...diag.respuestas, this.primerIntento() ?? false] });
    } else {
      // 3.1 · Datos honestos + 3.2 · el SRS se alimenta al cerrar, que es cuando se
      // sabe si fue sola, con duda o con callejón. El diagnóstico no anota: es una
      // prueba de ubicación, no una partida.
      this.anotarRonda();
    }

    // Primero el número, entero, en chino: es la recompensa y la pronunciación de la
    // palabra que acaba de construir. El elogio va DETRÁS, pero solo si **no** sube de
    // nivel —entonces el premio sonoro ya es `playLevelUp()` y sonar los dos juntos es
    // premio doble— y solo si la narración fue aceptada: si la cancelaron, premiar el
    // silencio sería premiar un fallo de audio.
    const n = this.etapa() === 'reconocer' ? valorDe(this.respuesta()) : this.objetivo();
    const narra = this.narrar(n ? numeroClip(n) : null);

    const result = this.session.recordCorrect();
    void narra.then(oido => {
      if (oido && !result.leveledUp) void this.audio.playPraise();
    });

    if (result.leveledUp) {
      // El nuevo problema lo genera handleSessionEvent
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL,
      });
      return;
    }

    // 3.4 · A los 6 años, una reflexión de un toque en lugar del avance automático:
    // el juego espera su respuesta y ella decide qué viene. Los4 años y el
    // diagnóstico siguen con el avance de siempre —el diagnóstico mide el primer
    // toque de 3 preguntas, no es el momento de preguntarle cómo lo hizo—.
    if ((this.activeProfile()?.age ?? 4) >= 6 && !diag) {
      this.later(() => {
        if (!this.isOver()) this.reflecting.set(true);
      }, 1600);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2600);
    }
  }

  /**
   * 3.1 · Los datos honestos: UN intento por problema —no por toque, que tocar es
   * explorar— y el mistake es la ayuda o el orden, nunca el error de una niña.
   *
   * Qué cuenta como "sola" (intento correcto):
   *
   *  - **reconocer:** acertó al PRIMER toque (si dudó, es que ya había fallado);
   *  - **combinar:** sin callejón de orden inválido y sin duda sonada.
   *
   * Ese mismo "sola" es lo que premia el SRS (§5.4): sola sube de caja; con andamio
   * no sube pero vuelve mañana; el callejón (orden inválido) vuelve a la 1.
   */
  private anotarRonda(): void {
    const profile = this.activeProfile();
    if (!profile) return;
    const etapa = this.etapa();
    const numero = etapa === 'reconocer' ? valorDe(this.respuesta()) : this.objetivo();
    if (numero === null || numero === 0) return;

    const sola =
      etapa === 'reconocer' ? this.primerIntento() === true : this.callejones === 0 && !this.dudaDicha;
    // El enunciado de reconocer puede ser dígito o glifo; el de combinar es siempre
    // un dígito. Se anota lo que se MOSTRÓ, que es lo que hay que mirar.
    const representation: RepresentationType =
      etapa === 'combinar' || this.direccion() === 'numero-a-hanzi' ? 'digit' : 'kanji';
    const skillId = etapa === 'reconocer' ? SKILL_RECONOCER : SKILL_COMBINAR;

    this.skills.recordAttempt({
      skillId,
      contentId: String(numero),
      correct: sola,
      responseTimeMs: Date.now() - this.rondaEmpezadaEn,
      difficulty: this.currentLevel(),
      representation,
      timestamp: Date.now(),
      profileAge: profile.age,
      profileId: profile.id,
    });

    if (etapa === 'reconocer' && this.primerIntento() === false) {
      this.skills.recordMistake({
        skillId,
        contentId: String(numero),
        expected: this.respuesta(),
        answered: this.primerToqueErrado ?? '',
        mistakeType: 'primer-toque',
        representation,
        timestamp: Date.now(),
        profileId: profile.id,
      });
    } else if (!sola) {
      // combinar: orden inválido (el callejón) o la duda por pausa. Nunca el toque.
      this.skills.recordMistake({
        skillId,
        contentId: String(numero),
        expected: piezasDe(numero).join(''),
        answered: this.callejones > 0 ? 'orden' : 'ayuda',
        mistakeType: this.callejones > 0 ? 'orden' : 'ayuda',
        representation,
        timestamp: Date.now(),
        profileId: profile.id,
      });
    }

    this.srs.review(HANZI_NUMBERS_DECK, String(numero), {
      correct: etapa === 'reconocer' ? this.primerIntento() === true : this.callejones === 0,
      ayuda: this.dudaDicha ? 1 : 0,
    });
  }

  /**
   * La duda se dice una vez por ronda: repetirla en cada toque sería un sermón.
   *
   * `previa` es lo que ha tocado —la opción o la pieza, en chino—: va **en la misma
   * narración**, delante de la duda. Dos `say()` seguidos se cortan el uno al otro —el
   * segundo detiene al primero— y la niña se quedaría sin oír lo que acaba de tocar.
   */
  private dudar(clip: 'hn.duda.oye' | 'hn.duda.dieces', previa: string | null = null): void {
    // 2.5 · En pantalla, icono —el texto de la duda es del TTS, no una consigna escrita—.
    this.hint.set(PISTA_ICONO[clip] ?? '');
    if (this.dudaDicha) {
      if (previa) void this.narrar(previa);
      return;
    }
    this.dudaDicha = true;
    void this.narrar(previa ? [previa, clip] : clip);
  }

  // ============================================
  // DUDA POR PAUSA
  // ============================================

  /**
   * El reloj de la duda por pausa: si deja el montaje sin leerse y no lo toca, se le
   * propone el 十. Cada toque lo reinicia, así que solo dispara si de verdad se queda
   * quieta —mientras pueda cerrarse, la duda espera—.
   */
  private armarDudaPorPausa(): void {
    this.quitarDudaPorPausa();
    if (this.agarradas().length === 0 || this.leido() !== null) return;

    const id = setTimeout(() => {
      this.timers.delete(id);
      if (this.dudaPausaId === id) this.dudaPausaId = null;
      if (this.destroyed || this.isOver() || this.solved() || this.busy()) return;
      if (this.agarradas().length > 0 && this.leido() === null) {
        this.dudar('hn.duda.dieces');
      }
    }, PAUSA_DUDA_MS);
    this.dudaPausaId = id;
    this.timers.add(id);
  }

  /** Cancela el reloj de la duda por pausa, si hay alguno armado. */
  private quitarDudaPorPausa(): void {
    if (this.dudaPausaId === null) return;
    clearTimeout(this.dudaPausaId);
    this.timers.delete(this.dudaPausaId);
    this.dudaPausaId = null;
  }

  // ============================================
  // VISTA
  // ============================================

  /**
   * 3.4 · Cada botón hace lo que dice (patrón Q4 de kanji-compose):
   *
   *  - 🧠 "Lo sé de memoria" → el siguiente es uno que hoy no ha salido;
   *  - 🖐️ "Lo conté" → el mismo número, para contarlo otra vez;
   *  - 👂 "Me ayudó el audio" → el siguiente ENTRA diciendo el número (el ancla de
   *    N1–N2, que aquí la pide ella).
   *
   * No se guarda la elección (eso es §5.11): lo que importa es que la respuesta
   * **cambia algo** —una pregunta cuyos botones hacen todos lo mismo no es pregunta.
   */
  chooseReflection(que: 'nuevo' | 'repaso' | 'ancla'): void {
    // Sin guard de `busy`: el problema acaba de terminar y `busy` sigue true hasta el
    // siguiente `generateProblem` —que es justo lo que este toque pide.
    if (this.isOver()) return;
    this.modoReflexion = que;
    this.generateProblem();
  }

  /**
   * 2.4 · La tarjeta del puente se toca para seguir: la demostración queda vista y —solo
   * entonces— entra el primer problema real de combinar.
   */
  seguirPuente(): void {
    if (this.isOver()) return;
    this.tutorials.mark(this.GAME_ID, PUENTE_MODO);
    this.puente.set(false);
    this.generateProblem();
  }

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
    // El texto de reserva no va aquí (2.5): lo trae el manifiesto, y en su idioma.
    // Pasarlo a mano era redundante —solo para el primer clip, además—.
    return this.narrator.say(Array.isArray(keys) ? keys : [keys]);
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
