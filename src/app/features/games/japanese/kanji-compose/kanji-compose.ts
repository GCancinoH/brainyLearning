import {
  Component,
  OnInit,
  OnDestroy,
  ElementRef,
  effect,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren,
} from '@angular/core';
import { Router } from '@angular/router';
import { CdkDrag, CdkDragEnd } from '@angular/cdk/drag-drop';
import confetti from 'canvas-confetti';
import { ProfileStateService } from '@core/services/profile-state';
import { GameSessionService } from '@core/games/game-session.service';
import { GameAudioService } from '@core/games/game-audio.service';
import { GameProgressService } from '@core/games/game-progress.service';
import { SpeechService } from '@core/services/speech.service';
import { SessionEvent } from '@core/games/game-types';
import { Narrator } from '@core/games/narrator.service';
import { GameFeedbackComponent } from '@shared/feedback/game-feedback';
import { GameRestOverlayComponent } from '@shared/game-ui/game-rest-overlay';
import { GhostHand } from '@shared/game-ui/ghost-hand/ghost-hand';
import { HintLadder, configForAge, type LadderLevel } from '@core/games/hint-ladder';
import { TutorialSeen } from '@core/games/tutorial-seen.service';
import { KANJI_TRAZOS, type KanjiTrazos } from '@core/learning/kanji-strokes';
import { evaluarTrazo, type Punto } from './stroke-check';
import {
  buildCompositionProblem,
  buildGuessProblem,
  buildRecallProblem,
  CompositionProblem,
  GuessProblem,
  KanjiComposition,
  KANJI_COMPOSITIONS,
  MAX_LEVEL,
  pickLine,
  pieceData,
  poolFor,
  poolSplit,
  RecallProblem,
  shuffle,
  SocraticMoment,
  TrayPiece,
} from '@core/learning/kanji-composition';
import { SkillProgressService } from '@core/learning/skill-progress.service';
import { KANJI_COMPOSITION_DECK, SpacedRepetition } from '@core/learning/spaced-repetition';
import {
  CLIP_BASE,
  CLIP_MANIFEST,
  clipsForProblem,
  kanjiMeaning,
  kanjiStory,
  kanjiWord,
  SOCRATIC_LINE_COUNT,
  pieceMeaning,
  pieceWord,
  recountCues,
  socraticLine,
  storyCues,
  sys,
  type Cue,
  type Highlight,
  type StoryMode,
} from '@core/learning/kanji-narration';
import { PositionLab } from './position-lab';
import { nearestSlot } from './slot-hit';

/**
 * "Construye el Kanji" — cómo se forman los caracteres compuestos.
 *
 * Inspirado en §B.6 (Robot Aki: radicompuestos) y §C.4 (Construye el carácter) del
 * método Zvonkin. Un kanji recién llegado pasa por cuatro pasos, en este orden:
 *
 *   0. ADIVINA  → las piezas sueltas y la pregunta "¿qué crees que quiere decir?" (§5.2)
 *   1. HISTORIA → el kanji completo y por qué se forma así: la respuesta a su pregunta
 *   2. COMPONER → arrastra las piezas sueltas a sus huecos
 *   3. DIBUJAR  → con el lienzo vacío, dibújalo tú
 *
 * El repaso se salta el paso 0. Ya sabe lo que significa, y volver a preguntarlo sería un
 * examen disfrazado de indagación.
 *
 * Y dos pasos más que no son de este kanji sino de los que ya conoce, al empezar la
 * sesión. **RECONOCER** (§5.6) cierra la lección de tres tiempos —"¿qué es esto?" lo dan
 * los pasos 1-3, "muéstrame X" es este— y le pide el recuerdo **frío**, sin la escalera de
 * ayuda a mano, que es la única señal que componer no puede dar. **FLASH** (§5.9) va
 * después: mostrar–decir–retirar sin preguntar, porque enseñar los kanji antes del examen
 * lo dejaría sin frío.
 *
 * Dos decisiones que no son obvias:
 *
 *  - NUNCA se dice "está mal". Cuando algo no encaja se plantea una duda o se propone
 *    probar otra cosa (ver SOCRATIC_LINES). El acierto tampoco se celebrates como
 *    "correcto", sino como algo que acaba de descubrir.
 *  - Las piezas equivocadas NO rompen la racha. Explorar es el objetivo; el error es
 *    material de investigación (regla 5 del método).
 */

type Step = 'story' | 'compose' | 'draw' | 'reconocer' | 'flash' | 'adivina';

/** Instrucción del paso, para quien lee y no tiene nada más que leer. */
const STEP_PROMPT: Record<Step, string> = {
  flash: '👀 Mira y escucha',
  adivina: '🤔 ¿Qué crees que quiere decir?',
  reconocer: '👂 ¿Cuál suena?',
  story: '👀 Mira cómo se forma',
  compose: '🤔 ¿Qué pieza va en cada hueco?',
  draw: '✏️ Ahora dibújalo tú',
};

/** Clave de "modo" para `TutorialSeen`. */
const COMPOSE_MODE = 'compose';

/**
 * Cuántos kanji pasan por el ritual Flash (§5.9).
 *
 * Cinco es el número que pide el ritual y el que cabe en unos cinco segundos: a un
 * segundo por kanji, más la pausa que hace que se note la retirada. Más de cinco deja de
 * ser calentamiento y empieza a ser repaso.
 */
const FLASH_COUNT = 5;

/**
 * La última pieza del paseo de la primera vez: el lienzo.
 *
 * Va aparte de `COMPOSE_MODE` y no dentro del mismo paseo a propósito. Si la niña se va
 * a mitad de ronda, el tutorial de componer ya se vio y no se debe repetir, pero lo de
 * dibujar todavía no le tocó: con una sola clave para el paseo entero se habría perdido.
 */
/** Cuánto dura la demostración de trazo antes de devolverle el pega. */
const DRAW_DEMO_MS = 3000;

const DRAW_MODE = 'draw';

/** Un hueco y la pieza que le corresponde. `from` dice de dónde hay que levantarla. */
interface Need {
  slotIndex: number;
  /** En el marco lleno puede ser la pieza que está ya colocada en otro hueco. */
  piece: TrayPiece | PlacedPiece;
  /** Índice de otro hueco del marco, o `null` si la pieza está en la bandeja. */
  from: number | null;
}

interface PlacedPiece {
  trayId: string;
  kanji: string;
  emoji: string;
}

@Component({
  selector: 'kanji-compose',
  imports: [CdkDrag, GameFeedbackComponent, GameRestOverlayComponent, GhostHand, PositionLab],
  templateUrl: './kanji-compose.html',
  styleUrl: './kanji-compose.scss',
})
export class KanjiCompose implements OnInit, OnDestroy {
  // ============================================
  // ENTRADAS
  // ============================================

  // ============================================
  // SERVICIOS
  // ============================================

  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly session = inject(GameSessionService);
  private readonly audio = inject(GameAudioService);
  private readonly progress = inject(GameProgressService);
  private readonly speech = inject(SpeechService);
  /** §5.4: qué kanji le toca repasar y cuándo vuelve a salir. */
  private readonly srs = inject(SpacedRepetition);
  /** Kanji-compose era el único juego japonés que no anotaba nada en las skills. */
  private readonly skills = inject(SkillProgressService);
  /** Público: la plantilla lo usa para animar mientras suena. */
  readonly narrator = inject(Narrator);
  private readonly tutorials = inject(TutorialSeen);

  readonly activeProfile = this.profileState.activeProfile;

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  readonly GAME_ID = 'japanese-kanji-compose';
  readonly MAX_LEVEL = MAX_LEVEL;
  /**
   * La skill que se anota. Los otros cuatro juegos japoneses ya escriben en
   * `japanese.kanji.*`; este era el único que no, con lo que el panel no veía nunca a
   * kanji-compose.
   */
  readonly SKILL = 'japanese.kanji.composition';
  readonly requiredCorrect = (this.activeProfile()?.age ?? 6) <= 4 ? 3 : 4;
  readonly starSlots = Array.from({ length: this.requiredCorrect }, (_, i) => i);

  readonly currentLevel = this.session.currentLevel;
  readonly consecutiveCorrect = this.session.consecutiveCorrect;
  readonly isTimeUp = this.session.isTimeUp;

  /** Persona que guía: Aki, en el Planeta Sakura */
  readonly guide = computed(() => ({
    name: 'Aki',
    planet: 'Planeta Sakura',
    emoji: '🤖',
    color: '#f9a8d4',
  }));

  // ============================================
  // ESTADO
  // ============================================

  readonly step = signal<Step>('story');
  readonly problem = signal<CompositionProblem | null>(null);
  /** Piezas que quedan en la bandeja */
  readonly tray = signal<TrayPiece[]>([]);
  /** Qué hay en cada hueco (null = vacío) */
  readonly placed = signal<(PlacedPiece | null)[]>([]);
  /**
   * Pieza "en la mano" tras tocarla, aún sin decidir a qué hueco va.
   *
   * Existe porque el tap no podía elegir hueco: rellenaba el primero libre sin mirar la
   * pieza (Q11), así que con dos piezas el orden en que las tocaba decidía el resultado
   * y ella no podía hacer nada. No era azar exacto, era adivinar, que es peor.
   *
   * Con esto el tap da el mismo control que el arrastre —que ya elegía hueco con
   * `nearestSlot`—: toca la pieza, se queda en la mano y suena, y luego toca el hueco
   * donde **cree** que va. La hipótesis vuelve a ser suya.
   */
  readonly seleccionada = signal<TrayPiece | null>(null);

  readonly line = signal('');
  readonly hint = signal('');
  readonly busy = signal(false);
  readonly reflecting = signal(false);
  /** Muestra los kanji hermanos: "con las mismas piezas salen otros" */
  readonly showSiblings = signal(false);
  /**
   * El panel de hermanos se abrió desde la reflexión ("probé otra posición", Q4).
   *
   * Va aparte de `reflecting` porque al abrirlo ese se apaga —los dos overlays ocupan lo
   * mismo—, y sin esta marca `dismissSiblings` mandaría a `enterDraw()`, que ya pasó hace
   * un rato.
   */
  private readonly desdeReflexion = signal(false);

  // ============================================
  // RECONOCER (§5.6) — el paso 0
  // ============================================

  /** El problema de reconocimiento que está en pantalla, o `null` si no hay calentamiento. */
  readonly recall = signal<RecallProblem | null>(null);
  /** Kanjis que ya ha descartado en **este** problema, para atenuarlos y dejarlos quietos. */
  readonly recallFallados = signal<ReadonlySet<string>>(new Set());
  /** El kanji acertado, si ya acertó. */
  readonly recallAcertado = signal<string | null>(null);
  /** Aciertos que faltan antes de pasar a jugar. */
  private recallRestantes = 2;
  /** Si ya ha tirado en el problema actual: solo la primera tirada cuenta para el SRS. */
  private recallTirado = false;

  /**
   * El kanji que está en pantalla en el ritual Flash (§5.9), o `null` si no hay.
   *
   * Va uno solo y no una lista porque el ritual es **mostrar–decir–retirar**: no hay nada
   * que mirar a la vez, y una pila de cinco tarjetas en pantalla sería un álbum, que es
   * otra cosa.
   */
  readonly flashKanji = signal<KanjiComposition | null>(null);

  /**
   * El problema de "adivina el significado" (§5.2), o `null` si el kanji no es nuevo.
   *
   * Va antes de la historia y no en su lugar: la historia **es** la respuesta a la
   * pregunta que este paso hace. Sin este paso la niña ve 明 aparecer y oye por qué; con
   * él, primero arriesga una idea y después se le cuenta por qué tiene sentido.
   */
  readonly guess = signal<GuessProblem | null>(null);
  /** La hipótesis que ya ha elegido, por índice, o `null` si todavía no ha dicho nada. */
  readonly adivinada = signal<number | null>(null);

  /** En la fase de dibujo, el kanji se muestra al trasluz */
  readonly showGhostInDraw = signal(true);

  /**
   * La puerta de inicio: un botón enorme y sin texto antes de empezar.
   *
   * No es un adorno. iOS y Safari **exigen un gesto del usuario** para dejar sonar audio
   * programado: sin él, el primer sonido se rechaza en silencio y no hay error visible.
   * Además es el único momento en que la niña ve al guía saludarla, lo que sustituye al
   * texto "Soy Aki, del Planeta Sakura" que no le dice nada a una pre-lectora.
   */
  readonly started = signal(false);

  /**
   * Cuánto se cuenta la historia: `full` la primera vez a los 4 años, `short` si ya la
   * conoce, `skip` si se la sabe de sobra.
   *
   * Va por edad y por nivel: a los 4 años la historia es lo que la engancha, así que
   * empieza entera y se va acortando. A partir del nivel 7 **deja de contarse sola en
   * cualquier edad** (§5.4.5): a esas alturas es repaso, y lo que se recuerda es lo que
   * se recuerda sin que se lo vuelvan a decir.
   */
  readonly storyMode = computed<StoryMode>(() => {
    if (this.currentLevel() >= 7) return 'skip';
    if (!this.isPreReader()) return 'short';
    return this.currentLevel() <= 2 ? 'full' : 'short';
  });

  /**
   * ¿La historia ya no se cuenta sola? Entonces aparece el 🔊.
   *
   * No se muestra mientras la historia se cuenta sola porque ahí es ruido: ya está
   * sonando. Pero cuando se la salta, es la **única** forma de oírla, y eso también vale
   * para la prelectora de nivel 6, que antes se quedaba sin historia y sin ningún botón
   * con el que pedirla.
   */
  readonly historiaAPeticion = computed(() => this.storyMode() === 'skip');

  /** Qué cue está sonando ahora. La plantilla lo usa para el karaoke. */
  readonly cue = signal<Cue<Highlight> | null>(null);

  /** 4 años: sin texto. El emoji y la voz son el mensaje. */
  readonly isPreReader = computed(() => (this.activeProfile()?.age ?? 6) <= 4);

  private readonly localFeedback = signal<'idle' | 'success'>('idle');

  /**
   * Estamos en el momento de descubrimiento tras componer: el kanji acaba de sonar y se
   * están viendo los hermanos. Ese instante **no lleva banner**: enseñar un "¡Muy bien!"
   * aleatorio mientras ella mira el kanji que ha montado le pone un texto donde no hay
   * nada que leer todavía. Es público porque la plantilla lo usa para esconder el banner.
   */
  readonly celebrating = signal(false);

  /**
   * Ya se registró el resultado de **este** problema.
   *
   * Es la guarda que faltaba para un doble toque en ✅. `finishDrawing()` solo miraba
   * `busy()`, y `busy` sigue en `false` durante todo el paso Dibujar — se puso en
   * `onComposed()` y se descargó al entrar aquí—, así que dos toques seguidos llegaban a
   * `finishProblem()` dos veces y se anotaban **dos aciertos**: racha doble y nivel
   * saltado, que además se guardaba en `progress`.
   *
   * No se usa `busy` como guard por diseño: frenaría el dibujo entero, y aquí lo que se
   * quiere es que este problema puntual sólo cuente una vez.
   */
  private readonly drawn = signal(false);

  /**
   * Escalera de ayuda (§5.5). Es la misma clase que en `logic-blocks`, y se traduce así
   * al paso de componer: 1 → vuelve a sonar el kanji, 2 → se resalta la pieza que encaja,
   * 3 → la mano fantasma la arrastra (solo a los 4 años; `LADDER_BY_AGE` pone el tope de
   * 6 años en 2, porque a esa edad resolverlo por ella le quita el aprendizaje).
   */
  private readonly ladder = new HintLadder(configForAge(this.activeProfile()?.age ?? 6));

  readonly ladderLevel = signal<LadderLevel>(0);

  /**
   * Tutorial de tres tiempos, la primera vez por perfil y modo: **esto es → mira cómo →
   * ahora tú**. Solo para quien no lee: a los 6 años la instrucción hablada basta, y un
   * adulto digital que se pone a arrastrar delante de quien ya sabe leer le quita turno.
   */
  readonly tutorial = signal<'off' | 'look' | 'demo' | 'your-turn'>('off');

  /**
   * Primera vez en el paso de dibujar: no se explica que se traza con el dedo, se muestra.
   * Mismo gesto que el resto del paseo —presentar, imitar, hacer— y misma razón: a los 4
   * años la instrucción escrita no le llega, el movimiento sí.
   */
  readonly drawHint = signal<'off' | 'demo' | 'your-turn'>('off');

  /**
   * Área de contacto (px CSS) por encima de la cual un toque no puede ser una niña
   * trazando: es la palma apoyada.
   *
   * **El umbral va alto a propósito.** Un dedo en tableta ronda los 40-60 px y una
   * palma pasa de 100, pero el dato del navegador varía; si se quedara justo en el
   * medio, el riesgo es rechazar el trazo de ella — que es el fallo que no se puede
   * permitir. Mejor dejar pasar alguna mancha que no trazar por ella.
   */
  private static readonly AREA_PALMA = 90;

  /** El puntero que está trazando ahora: los demás no pintan ni levantan el trazo. */
  private punteroActivo: number | null = null;

  /** Repinta al girar o redimensionar la tableta (B12). */
  private resizeObserver: ResizeObserver | null = null;
  private canvasObservado: HTMLCanvasElement | null = null;

  /**
   * Los trazos del kanji que se está dibujando, tal y como los da KanjiVG: uno por
   * `<path>`, en orden. `null` si el kanji no está en el conjunto empaquetado — no
   * debería ocurrir, y la plantilla cae entonces a la fantasma de fuente de siempre.
   */
  readonly trazoGuide = computed<KanjiTrazos | null>(
    () => KANJI_TRAZOS[this.target()?.kanji ?? ''] ?? null,
  );

  /**
   * Qué trazo le toca. Es el que se resalta y se anima: el orden de los trazos no se
   * escribe, se ve — empieza donde empieza la línea amarilla y va hacia donde va.
   *
   * En E1 no avanza porque todavía no se valida nada; E2 lo moverá.
   */
  readonly trazoActual = signal(0);

  /** Cuántos trazos lleva el kanji. `0` si no hay datos y no se valida nada. */
  readonly trazoTotal = computed(() => this.trazoGuide()?.trazos.length ?? 0);

  /** ¿Trazó ya el kanji entero? Es el momento en que se acaba la ronda. */
  readonly kanjiTrazado = computed(() => this.trazoTotal() > 0 && this.trazoActual() >= this.trazoTotal());

  /**
   * La pieza que la mano fantasma está arrastrando, en coordenadas relativas a `.work-area`.
   * Puramente visual: no toca `tray()` ni `placed()`, no cuenta como acierto ni error.
   */
  readonly demo = signal<{ from: { x: number; y: number }; to: { x: number; y: number }; kanji: string } | null>(
    null,
  );

  // ============================================
  // DERIVADOS
  // ============================================

  readonly target = computed(() => this.problem()?.target ?? null);
  readonly showGhost = computed(
    () => this.step() === 'compose' && (this.problem()?.showGhost ?? false),
  );

  /**
   * Alfa del fantasma. Se atenúa por nivel en vez de apagarse de golpe (§3.2).
   *
   * Se lleva al **color** y no a `opacity`: `.ghost` ya es blanco al 9 % y multiplicarlo
   * por 0.3 lo habría dejado en el 2.7 %, que es invisible. El valor baja con el nivel
   * y en 0 el propio `showGhost` ya no pinta el elemento.
   */
  readonly ghostAlpha = computed(() => {
    if (!this.showGhost()) return 0;
    return 0.03 + 0.13 * (this.problem()?.ghost ?? 1);
  });
  /**
   * Qué enseñar en el peldaño 3: un hueco y la pieza que le corresponde.
   *
   * Hay dos situaciones y **las dos importan**:
   *
   *  - **Marco incompleto**: el hueco vacío, y la pieza que encaja, que está en la
   *    bandeja. Es el caso de la inactividad.
   *  - **Marco lleno pero mal**: es el caso del error, y el único que se puede dar
   *    cuando se registra —`evaluate()` solo cuenta el fallo con el marco lleno—. Aquí
   *    no hay hueco vacío que señalar, así que se señala el primer hueco mal puesto y se
   *    levanta la pieza de donde ella la puso. Es la demostración de *"la pieza está
   *    bien, pero en otro hueco"*, que es literalmente la pregunta socrática de ese
   *    instante. Sin esto, el peldaño 3 se quedaba en silencio justo cuando más hacía
   *    falta.
   *
   * Se busca por `kanji` y no por identidad de pieza: 林 y 明 traen dos piezas iguales
   * y cualquier 木 encaja en cualquier hueco de 木. Da igual cuál se arrastre; lo que
   * importa es enseñar el gesto.
   */
  readonly nextNeed = computed<Need | null>(() => {
    const p = this.problem();
    if (!p) return null;
    const pl = this.placed();

    const hueco = pl.findIndex(x => x === null);
    if (hueco >= 0) {
      const kanji = p.slots[hueco]?.kanji;
      const piece = kanji ? this.tray().find(t => t.kanji === kanji) : undefined;
      return piece ? { slotIndex: hueco, piece, from: null } : null;
    }

    const mal = pl.findIndex((x, i) => x !== null && x.kanji !== p.slots[i]?.kanji);
    if (mal < 0) return null;
    const querido = p.slots[mal]?.kanji;
    if (!querido) return null;

    const enBandeja = this.tray().find(t => t.kanji === querido);
    if (enBandeja) return { slotIndex: mal, piece: enBandeja, from: null };

    const desde = pl.findIndex((x, i) => x !== null && i !== mal && x.kanji === querido);
    const pieza = desde >= 0 ? pl[desde] : null;
    return pieza ? { slotIndex: mal, piece: pieza, from: desde } : null;
  });

  /** Peldaño 2: la pieza que encaja en el hueco vacío. */
  readonly hintedPieceId = computed(() =>
    this.ladderLevel() >= 2 ? (this.nextNeed()?.piece.trayId ?? '') : '',
  );

  /** Peldaño 2: el hueco a que pertenece. Resaltar solo la pieza dejaba sin decir dónde. */
  readonly hintedSlot = computed(() =>
    this.ladderLevel() >= 2 ? (this.nextNeed()?.slotIndex ?? -1) : -1,
  );

  readonly filledCount = computed(() => this.placed().filter(Boolean).length);
  readonly allFilled = computed(
    () => this.placed().length > 0 && this.placed().every(Boolean),
  );
  readonly feedbackState = computed(() => {
    const s = this.session.state();
    if (!s) return 'idle';
    if (s.isCompleted || s.isTimeUp) return 'game-over';
    return this.localFeedback();
  });

  /**
   * Instrucción del paso, o la duda socrática que acaba de oírse. **Nunca vacío**: con
   * `line()` a `''` el componente se dibujaba como una caja hueca de 70 px.
   *
   * Los dos fallos que evita `localFeedback`: se quedaba en `'success'` desde
   * `onComposed()`, con lo que la caja ignoraba `customMessage` y escogía texto aleatorio
   * de `BASE_FEEDBACK_MESSAGES` durante **todo** el paso de dibujo. Ahora `success` solo
   * se pone al terminar la ronda.
   *
   * El caso "no hay nada que decir" no vive aquí a propósito: vive en `celebrating`. Si
   * se devolviera `''`, el `@if` de la plantilla no pintaría nada y dejaría de mostrarse
   * el mensaje propio del componente en `success`/`game-over`, que a `customMessage` ni
   * lo mira.
   */
  readonly stepPrompt = computed(() => this.line() || STEP_PROMPT[this.step()]);

  /**
   * Cara de ánimo para quien todavía no lee (Q2): sustituye al banner entero a los 4
   * años, igual que en `logic-blocks`.
   *
   * Vacío cuando no hay nada que comunicar. En este juego no existe estado de error a
   * propósito —los fallos devuelven una pregunta socrática, no un veredicto—, así que
   * un 🤔 aparece justo cuando `line` lleva una duda hablada y ninguna cara está
   * enseñando que lo que hizo estaba mal.
   */
  readonly mood = computed(() => {
    const s = this.feedbackState();
    if (s === 'success') return '🌟';
    if (s === 'game-over') return '🏆';
    if (this.celebrating()) return '✨';
    return this.line() ? '🤔' : '';
  });

  /** Lo que lee un lector de pantalla en lugar del emoji. */
  readonly moodText = computed(() => {
    const s = this.feedbackState();
    if (s === 'success') return '¡Lo conseguiste!';
    if (s === 'game-over') return '¡Fin del juego!';
    if (this.celebrating()) return 'Mira qué has hecho';
    return this.line() ? 'Vamos a pensarlo' : '';
  });

  /** Trazos dibujados en la fase de dibujo */
  readonly strokes = signal<{ x: number; y: number }[][]>([]);
  private drawing: { x: number; y: number }[] | null = null;

  // ============================================
  // INTERNOS
  // ============================================

  /** Los huecos del marco. Nombre propio (`#slotEl`), distinto del `slot` del `@for`. */
  private readonly slotEls = viewChildren<ElementRef<HTMLElement>>('slotEl');
  private readonly trayEls = viewChildren<ElementRef<HTMLElement>>('trayPiece');
  /** Contenedor de la medición: las coordenadas del gesto son relativas a él. */
  private readonly container = viewChild<ElementRef<HTMLElement>>('container');
  /** 2 pasadas de 1.9 s + márgenes: igual que en `logic-blocks`. */
  private readonly DEMO_MS = 4600;
  private readonly canvasRef = viewChild<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private unsubscribeEvents?: () => void;
  private destroyed = false;
  private lastDragEnd = 0;
  /** Última pieza que ya tiene su nombre sonando, y cuándo. Ver `hearPiece`. */
  private lastPieceHeard: string | null = null;
  private lastPieceHeardAt = 0;
  /** Disparo que borra la pregunta socrática. Se cancela si reintenta antes (B8). */
  private clearPromptTimer: ReturnType<typeof setTimeout> | null = null;
  /** Cuándo empezó la ronda en curso, para anotar cuánto tardó (§5.11). */
  private rondaEmpezadaEn = 0;

  // ============================================
  // CICLO DE VIDA
  // ============================================

  constructor() {
    // El lienzo es imperative (canvas), así que los trazos se pintan tras el render.
    // afterRenderEffect corre solo en el navegador, nunca en el servidor.
    afterRenderEffect(() => {
      this.strokes(); // dependencia: se repinta cuando cambian los trazos
      this.paint();
    });

    // El lienzo solo existe en el paso Dibujar, así que esto **no** puede montarse en
    // `ngAfterViewInit`: esa ejecución llega cuando el juego todavía está en Historia y
    // `canvasRef()` es `undefined`. En cambio un `effect` le sigue el paso y se reengancha
    // cada vez que el lienzo aparece.
    //
    // Sin esto, al girar la tableta cambiaba el rectángulo pero `strokes` no: no había
    // ninguna señal que disparara `paint()` y la tinta se quedaba a la escala vieja (B12).
    effect(() => {
      const el = this.canvasRef()?.nativeElement ?? null;
      if (el === this.canvasObservado) return;
      this.canvasObservado = el;
      this.resizeObserver?.disconnect();
      this.resizeObserver = null;
      if (!el || typeof ResizeObserver === 'undefined') return;
      this.resizeObserver = new ResizeObserver(() => this.paint());
      this.resizeObserver.observe(el);
    });
  }

  ngOnInit(): void {
    // El manifiesto no es documentación: es el plan B. Si un `.wav` falta, el TTS dice
    // lo mismo **en el idioma correcto** (japonés para las piezas, español para las
    // historias). Sin manifiesto, un clip japonés ausente se intentaría en voz española.
    this.narrator.configure({
      base: CLIP_BASE,
      // Los clips de este mazo son AAC/m4a: 48 kbps mono bastan de sobra para voz, y los
      // 110 clips pasaron de 12 MB a 1,8 MB (§3.5.2). El service worker prefetcha este
      // grupo entero al instalar, así que esa diferencia es directamente lo que baja la
      // tableta. Los sonidos de abajo (elogio, level-up) son de `public/audio` y siguen
      // siendo `.wav`: son de otro mazo, con otro guion de generación.
      ext: 'm4a',
      manifest: CLIP_MANIFEST,
      defaultLang: 'es-MX'
    });

    this.audio.registerAssets([
      { type: 'praise', paths: ['audio/praise-1.wav', 'audio/praise-2.wav', 'audio/praise-3.wav'], volume: 0.85 },
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

    // Sin puerta de inicio: el juego arranca al entrar. El audio que el navegador llegue
    // a bloquear lo suelta el primer toque, que ella da igualmente al entrar desde el
    // menú (ver `GameAudioService`), así que no hace falta un botón intermedio solo para
    // oír algo.
    this.later(() => this.startGame(), 200);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.clearTimers();
    this.unsubscribeEvents?.();
    // ⚠️ Antes de `audio.dispose()`: al revés, `dispose()` deja los elementos inservibles
    // y `cancel()` intentaría pararlos después. Además corta la secuencia en vuelo, que si
    // no seguiría sonando fuera de la pantalla.
    this.narrator.cancel();
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
  // RECONOCER (§5.6) — EL PASO 0
  // ============================================

  /**
   * El calentamiento de dos aciertos que abre la sesión.
   *
   * Se ofrece solo si conoce al menos dos kanji. Y **no** cuenta el que va a componer
   * ahora: reconocer el que acaba de ver hace un rato no prueba nada, y le quitaría a la
   * primera ronda lo que la hace nueva.
   *
   * Devuelve `true` si empezó, para que quien llama se salte la historia.
   */
  private empezarRecall(): boolean {
    const p = this.siguienteRecall();
    if (!p) return false;
    this.recall.set(p);
    this.step.set('reconocer');
    this.later(() => void this.hablarRecall(), 400);
    return true;
  }

  /**
   * Monta el siguiente problema de reconocimiento, o `null` si ya no hay material.
   *
   * Se queda fuera el kanji del problema actual **y** los ya ofrecidos en esta tanda: sin
   * eso, con dos kanji conocidos las dos tiradas serían el mismo.
   */
  private siguienteRecall(): RecallProblem | null {
    const edad = this.activeProfile()?.age ?? 6;
    const fuera = [
      this.target()?.id,
      this.recall()?.objetivo.id,
    ].filter((id): id is string => !!id);
    const conocidos = poolFor(edad, this.currentLevel()).filter(
      id => this.srs.isIntroduced(KANJI_COMPOSITION_DECK, id) && !fuera.includes(id),
    );
    if (conocidos.length < 2) return null;
    return buildRecallProblem(conocidos, conocidos.length >= 3 ? 3 : 2, Math.random);
  }

  /** Suena la instrucción y la lectura que hay que reconocer. */
  private async hablarRecall(): Promise<void> {
    const r = this.recall();
    if (!r || this.destroyed || this.step() !== 'reconocer') return;
    await this.narrator.play([
      { clip: sys('recall-hear'), pauseAfterMs: 250 },
      { clip: kanjiWord(r.objetivo.id), pauseAfterMs: 300 },
    ]);
  }

  /** Toca una de las opciones. */
  responderRecall(id: string): void {
    const r = this.recall();
    if (!r || this.recallAcertado()) return;
    this.onActivity();
    this.audio.retryPendingAudio();

    if (id !== r.objetivo.id) {
      // Sin zumbido y sin "mal". Se atenúa la que no es y se vuelve a oír la lectura, que
      // es lo que hace falta para poder compararla con las otras. Error de exploración.
      this.recallFallados.update(prev => new Set(prev).add(id));
      void this.narrator.play([
        { clip: sys('recall-again'), pauseAfterMs: 200 },
        { clip: kanjiWord(r.objetivo.id) },
      ]);
      return;
    }

    // Solo la primera tirada cuenta para el SRS. Si contasen todas, con dos opciones
    // acabaría subiendo de caja por descarte y no por acordarse.
    if (!this.recallTirado) this.srs.review(KANJI_COMPOSITION_DECK, id, { correct: true });
    this.recallTirado = true;
    this.recallAcertado.set(id);
    this.audio.playPraise();
    void this.narrator.play([{ clip: kanjiWord(id), pauseAfterMs: 500 }]);
    this.later(() => this.pasarDeRecall(), 1800);
  }

  /**
   * Cuenta el acierto y pasa de tanda o de paso.
   *
   * Si no queda material para otro acierto se va igual: un calentamiento que se alarga
   * hasta el aburrimiento deja de ser calentamiento. El ritual Flash cierra la tanda
   * también cuando venía del Reconocer —es el mismo orden que al empezar—.
   */
  private async pasarDeRecall(): Promise<void> {
    this.recallRestantes -= 1;
    const siguiente = this.recallRestantes > 0 ? this.siguienteRecall() : null;

    if (!siguiente) {
      this.recall.set(null);
      this.recallFallados.set(new Set());
      this.recallAcertado.set(null);
      // El paso 'reconocer' no se queda colgado: se cierra antes de mirar si hay Flash, o
      // `terminarCalentamiento` daría por terminado un calentamiento que ya se acabó.
      this.step.set('story');
      await this.empezarFlash();
      if (!this.terminarCalentamiento()) return;
      this.generateProblem();
      return;
    }

    this.recall.set(siguiente);
    this.recallFallados.set(new Set());
    this.recallAcertado.set(null);
    this.recallTirado = false;
    this.later(() => void this.hablarRecall(), 400);
  }

  // ============================================
  // ADIVINA EL SIGNIFICADO (§5.2)
  // ============================================

  /**
   * Suena lo que hay que adivinar: las piezas, en español, y después la pregunta.
   *
   * El significado y no la lectura, a cualquier edad: para formar una hipótesis sobre lo
   * que "sol y luna" pueden querer decir hace falta oír que son sol y luna. "ひ" y "つき"
   * no dicen nada ni a los 4 ni a los 6 —eso lo aprende la historia, y solo a los 6—.
   */
  private async hablarAdivinanza(): Promise<void> {
    const g = this.guess();
    if (!g || this.destroyed || this.step() !== 'adivina') return;
    await this.narrator.play([
      ...g.piezas.map(p => ({ clip: pieceMeaning(p.id), pauseAfterMs: 250 })),
      { clip: sys('guess-question'), pauseAfterMs: 300 },
    ]);
  }

  /**
   * Ella dice la suya.
   *
   * Se acepta cualquier cosa, porque una hipótesis no es un examen: lo que responde a su
   * pregunta es la historia, y esa viene justo después. No se anota en el SRS tampoco —
   * acertar al azar entre dos no dice nada sobre si sabe el kanji.
   */
  adivinar(indice: number): void {
    const g = this.guess();
    if (!g || this.adivinada() !== null) return;
    this.onActivity();
    this.audio.retryPendingAudio();
    // Se corta la pregunta en curso: ya ha respondido, y si la secuencia siguiera sonando
    // la historia empezaría por la mitad de una frase.
    this.narrator.cancel();
    this.adivinada.set(indice);
    this.later(() => this.revelar(), 1400);
  }

  /** Ya ha dicho la suya: ahora se cuenta. */
  private revelar(): void {
    if (!this.guess()) return;
    this.guess.set(null);
    this.adivinada.set(null);
    this.step.set('story');
    this.later(() => void this.playStory(), 350);
  }

  // ============================================
  // PROBLEMA
  // ============================================

  generateProblem(): void {
    this.clearTimers();
    this.clearPromptTimer = null;
    this.narrator.cancel();
    const age = this.activeProfile()?.age ?? 6;
    // §5.4. `poolSplit` separa "nuevo" de "repaso"; esto es lo que hace que ese 40 % de
    // repaso sea repaso **de verdad** y no "algo que ya se vio, elegido al azar". Gana el
    // más atrasado, que es el que se está olvidando.
    const vencidos = this.srs.due(KANJI_COMPOSITION_DECK);
    const p = buildCompositionProblem(this.currentLevel(), age, Math.random, vencidos);
    this.rondaEmpezadaEn = Date.now();

    this.problem.set(p);
    this.tray.set([...p.tray]);
    this.placed.set(p.slots.map(() => null));
    // La mano empieza vacía: con la pieza de la ronda anterior todavía seleccionada, el
    // primer toque en un hueco la colocaría sin que ella lo decidiera.
    this.seleccionada.set(null);
    // El calentamiento no sobrevive a un problema nuevo: si lo dejara, el primer toque en
    // un hueco iría a un kanji que ya no está en pantalla.
    this.recall.set(null);
    this.recallFallados.set(new Set());
    this.recallAcertado.set(null);
    this.flashKanji.set(null);

    // §5.2. Un kanji que acaba de llegar se pregunta antes de explicarse: la historia deja
    // de ser un espectáculo y pasa a responder a algo que ella misma dijo. El repaso no
    // pasa por aquí —ya sabe lo que significa, y volver a preguntarlo sería un examen
    // disfrazado de indagación—.
    const nuevo = poolSplit(age, this.currentLevel()).nuevos.includes(p.target.id);
    this.step.set(nuevo ? 'adivina' : 'story');
    this.guess.set(nuevo ? buildGuessProblem(p.target, Math.random) : null);
    this.adivinada.set(null);
    this.line.set('');
    this.hint.set('');
    this.busy.set(false);
    this.reflecting.set(false);
    this.showSiblings.set(false);
    this.desdeReflexion.set(false);
    this.showGhostInDraw.set(true);
    this.strokes.set([]);
    this.drawing = null;
    this.drawn.set(false);
    this.celebrating.set(false);
    this.localFeedback.set('idle');
    this.cue.set(null);
    // Se olvida la pieza anterior: si el siguiente problema trae la misma, debe volver a
    // sonar aunque fuera hace un segundo.
    this.lastPieceHeard = null;
    // Nuevo problema, escalera nueva: lo que le costó a la niña en el anterior no debe
    // condenarla a empezar con la ayuda ya puesta.
    this.ladder.reset();
    this.ladderLevel.set(0);
    this.tutorial.set('off');
    this.drawHint.set('off');
    this.demo.set(null);

    // Precarga: los clips del problema ya se descargan en silencio, para que el primer
    // sonido llegue **justo** cuando el kanji aparece. Sin esto se oye medio segundo de
    // nada en el momento exacto en el que la niña está mirando, y se pierde la asociación.
    this.narrator.preload([...clipsForProblem(p.target), sys('now-you')]);

    // La historia solo se cuenta sola si ya hubo un gesto: si no, el navegador la rechazará
    // y el paso quedaría mudo, que es exactamente el fallo que se quería arreglar.
    // En el paso "adivina" lo que suena no es la historia sino la pregunta, y la historia
    // espera a que ella diga la suya —`revelar()` es quien la lanza—.
    if (!this.started()) return;
    const g = this.guess();
    if (g && this.step() === 'adivina') {
      this.narrator.preload([...g.piezas.map(p => pieceMeaning(p.id)), sys('guess-question')]);
      this.later(() => void this.hablarAdivinanza(), 500);
    } else {
      this.later(() => void this.playStory(), 500);
    }
  }

  /** Lectura de la pieza (kana) */
  pieceReading(_kanji: string, reading: string): string {
    return reading;
  }

  /** Emoji de una pieza, para la fase de historia */
  emojiOf(kanji: string): string {
    return pieceData(kanji).emoji;
  }

  // ============================================
  // PUERTA DE INICIO
  // ============================================

  /**
   * El toque que desbloquea el audio.
   *
   * Además del gesto, aprovecha para que suene el saludo: es lo primero que oye de esta
   * app, y lo que sustituye a la frase "Soy Aki, del Planeta Sakura" en pantalla.
   */
  startGame(): void {
    if (this.started()) return;
    this.started.set(true);
    this.audio.retryPendingAudio();
    const saludo = sys('greeting.aki');
    // ⚠️ Encadenado, no concurrente. Antes se disparaba el saludo sin esperar y la historia
    // arrancaba 400 ms después con un temporizador: como el saludo dura ~7 s, ambos
    // ficheros sonaban **a la vez**, y encima la historia empezaba por su cuenta al
    // generarse el problema. Aquí se espera a que el saludo termine.
    void (async () => {
      await this.narrator.say(saludo);
      // La ronda puede estar en la historia o en la pregunta que la precede (§5.2): las
      // dos son "lo que suena al empezar". Si ya está en otra cosa, no se interrumpe.
      if (this.destroyed || !this.enRonda()) return;
      // El orden del calentamiento no es un capricho. El Flash **enseña** los kanji, y en
      // cuanto se enseñan el recuerdo del Reconocer deja de ser frío, que es lo único que
      // ese paso puede medir. Así que primero se examina y después se enseña.
      if (this.empezarRecall()) return;
      await this.empezarFlash();
      if (!this.terminarCalentamiento()) return;
      if (this.step() === 'adivina') {
        await this.hablarAdivinanza();
        return;
      }
      await this.playStory();
    })();
  }

  /** Si la ronda está en un paso del que todavía queda algo por narrar. */
  private enRonda(): boolean {
    return this.step() === 'story' || this.step() === 'adivina';
  }

  /**
   * El ritual Flash (§5.9): mostrar–decir–retirar a un segundo cada uno, **sin pregunta**.
   *
   * Es la forma más barata de repasar que hay —cinco formas y cinco sonidos, nada más— y
   * además el único calentamiento que funciona desde la primera sesión, cuando el
   * Reconocer todavía no tiene con qué funcionar: se puede enseñar un kanji conocido
   * desde que se conoce uno.
   *
   * Sale solo si hay algo que enseñar. Un Flash sin kanji conocidos es una pantalla en
   * blanco con una voz.
   */
  private async empezarFlash(): Promise<void> {
    const edad = this.activeProfile()?.age ?? 6;
    const conocidos = poolFor(edad, this.currentLevel())
      .filter(id => this.srs.isIntroduced(KANJI_COMPOSITION_DECK, id))
      .map(id => KANJI_COMPOSITIONS.find(c => c.id === id))
      .filter((k): k is KanjiComposition => !!k);
    if (!conocidos.length) return;

    this.step.set('flash');
    const tanda = shuffle(conocidos, Math.random).slice(0, FLASH_COUNT);
    for (const k of tanda) {
      if (this.destroyed || this.step() !== 'flash') return;
      this.flashKanji.set(k);
      // Un segundo por kanji, que es el tiempo que pide el ritual: la palabra dura ~0,8 s
      // y la pausa es lo que hace que se note que se ha **retirado** y no que se quedó
      // enseñando.
      await this.narrator.play([{ clip: kanjiWord(k.id), pauseAfterMs: 250 }]);
    }
    this.flashKanji.set(null);
  }

  /**
   * Cierra el calentamiento y devuelve `false` si ya no hay nada que narrar.
   *
   * El Flash deja el paso en `'flash'` y no lo restaura, así que hay que volver al de la
   * ronda: la historia, o la pregunta que la precede (§5.2). El `false` es para cuando ya
   * no se está en el calentamiento —se salió, o la sesión avanzó por otro lado—.
   *
   * Existía este guard y no lo sabía: sin el Flash, el paso seguía siendo `'story'` y la
   * condición `step !== 'flash'` abortaba **antes** de narrar la historia, que quedaba
   * muda. El test no lo pillaba porque en esas pruebas siempre había Flash.
   */
  private terminarCalentamiento(): boolean {
    if (this.destroyed) return false;
    if (this.step() === 'flash') this.step.set('story');
    return this.step() === 'story' || this.step() === 'adivina';
  }

  // ============================================
  // PASO 1: EL "CINE" DE LA HISTORIA
  // ============================================

  /**
   * Cuenta la historia: suena el kanji, se la narrada, suena cada pieza mientras se
   * ilumina, y el kanji vuelve a sonar al final.
   *
   * Este paso era **mudo** antes: la única asociación posible era en el paso de componer,
   * donde ya había que saber arrastrar. Aquí el sonido llega antes de tocar nada.
   */
  async playStory(): Promise<void> {
    const t = this.target();
    if (!t) return;
    const cues = storyCues(t, { age: this.isPreReader() ? 4 : 6, mode: this.storyMode() });
    await this.narrator.play(cues, c => this.cue.set(c));
  }

  /** Corta la narración (botón grande del paso Historia) y pasa a componer. */
  skipStory(): void {
    this.narrator.cancel();
    this.cue.set(null);
    this.startComposing();
  }

  /** Qué elemento está sonando: el karaoke. */
  isSpeakingKanji(): boolean {
    return this.cue()?.tag?.kind === 'kanji';
  }

  isSpeakingPiece(index: number): boolean {
    const tag = this.cue()?.tag;
    return !!tag && tag.kind === 'piece' && tag.index === index;
  }

  // ============================================
  // OÍR (siempre por clip, nunca mandando el kanji al TTS)
  // ============================================

  /**
   * Oye el kanji objetivo.
   *
   * Antes esto era `speech.speak('明', 'ja-JP')`: el motor decidía entre on'yomi y
   * kun'yomi, así que podía decir "メイ" cuando lo que había que enseñar era "あかるい",
   * y en un tablet sin voz japonesa no decía nada en absoluto. Con el clip, el sonido es
   * exactamente el que queremos y además **suena sin conexión**.
   */
  hearKanji(): void {
    const t = this.target();
    if (!t) return;
    void this.narrator.say(kanjiWord(t.id));
  }

  /** Oye el significado en español. Para quien todavía no asocia forma y sonido. */
  hearMeaning(): void {
    const t = this.target();
    if (!t) return;
    void this.narrator.say(kanjiMeaning(t.id));
  }

  /** Oye la historia completa en voz (a los 6 la lee; a los 4 no puede). */
  hearStory(): void {
    const t = this.target();
    if (!t) return;
    void this.narrator.say(kanjiStory(t.id));
  }

  /**
   * Oye una pieza. Se llama al tocarla, al arrastrarla y al colocarla.
   *
   * ⚠️ Un solo sonido por gesto. `onTap` suena al tocar y `place()` vuelve a sonar al
   * meterla; `onDragStarted` suena al agarrar y `onDragEnded` al soltar. Con ~100 ms de
   * diferencia —el caso de un toque— el clip se reinicia cortando el primero a media
   * palabra y la niña oye un sonido roto.
   *
   * Solo se salta si es la **misma** pieza. Si toca otra, la debe oír aunque fuera hace
   * un instante: no oírla significa quedarse con el nombre anterior asociado a la forma
   * que tiene en la mano.
   */
  hearPiece(piece: TrayPiece | PlacedPiece): void {
    const id = pieceData(piece.kanji).id;
    if (!id) return;
    const now = Date.now();
    if (id === this.lastPieceHeard && now - this.lastPieceHeardAt < 1500) return;
    this.lastPieceHeard = id;
    this.lastPieceHeardAt = now;
    void this.narrator.say(pieceWord(id));
  }

  /**
 * Oye una pieza **con su significado**: "ひ… sol".
 *
 * El hueco entre las dos es de 600 ms, no el de 120 ms por defecto. Con 120 ms, "ひ" y "sol"
 * suenan casi pegados y el oído los agrupa en una sola palabra: en vez de oír el nombre y
 * después el significado, la niña oye un sonido raro y no entiende qué son dos cosas.
 */
  hearPieceWithMeaning(kanji: string): void {
    const p = pieceData(kanji);
    if (!p.id) return;
    void this.narrator.play([
      { clip: pieceWord(p.id), pauseAfterMs: 600 },
      { clip: pieceMeaning(p.id) }
    ]);
  }

  // ============================================
  // PASO 1 → 2: HISTORIA
  // ============================================

  /**
   * Empieza el paso de composición.
   *
   * ⚠️ Encadenado. Antes se disparaba la instrucción con `say()` **sin esperar** y a los
   * 700 ms se llamaba a `hearKanji()`, que arrancaba un segundo clip; `say()` cancela lo
   * anterior, así que la instrucción se cortaba a los 700 ms de un texto de ~3 s. Se oía
   * "mira el dibujo borroso" y nada más, justo lo que decía la regla.
   */
  async startComposing(): Promise<void> {
    this.audio.retryPendingAudio();
    this.narrator.cancel();
    this.step.set('compose');
    this.ladder.reset();
    this.ladderLevel.set(0);

    // La primera vez por perfil y modo no se explica nada: se muestra. La instrucción
    // escrita "arrastra la pieza a su hueco" a una pre-lectora no le dice nada, y es
    // justamente el gesto lo que hay que enseñar sin un adulto delante.
    if (this.isPreReader() && !this.tutorials.has(this.GAME_ID, COMPOSE_MODE)) {
      this.startTutorial();
      this.startIdleWatch();
      return;
    }

    // Nada de texto que cante un acierto antes de tiempo: aquí empieza la investigación.
    this.line.set(
      this.showGhost()
        ? '👀 Mira el dibujo borroso. ¿Qué piezas crees que necesita?'
        : '🤔 ¿Qué pieza va en cada hueco? Puedes probarlas.',
    );
    // Y se dice en voz, no se escribe: a los 4 años ese texto no le llega.
    await this.narrator.say(this.showGhost() ? sys('look-ghost') : sys('which-piece'));
    // El sonido del kanji justo al entrar: ancla la palabra antes de construirla.
    if (this.destroyed || this.step() !== 'compose') return;
    this.hearKanji();
    this.startIdleWatch();
  }

  // ============================================
  // PASO 2: COMPOSICIÓN
  // ============================================

  /**
   * Cualquier gesto reinicia el reloj de la escalera. **No** borra los errores: volver a
   * tocar la pantalla no deshace que se fallaron tres veces seguidas.
   */
  onActivity(): void {
    if (this.step() !== 'compose') return;
    this.ladder.touch();
    this.ladderLevel.set(this.ladder.level);
  }

  onDragStarted(piece: TrayPiece): void {
    this.onActivity();
    // Agarrar una pieza **suena**. Es lo que hace posible el emparejamiento pieza ↔ sonido:
    // antes el sonido solo ocurría al soltar, y entonces ya era demasiado tarde para
    // asociar la pieza que tenía en la mano.
    this.hearPiece(piece);
  }

  onDragEnded(event: CdkDragEnd, piece: TrayPiece): void {
    this.onActivity();
    this.lastDragEnd = Date.now();
    const slots = this.slotEls().map(s => s.nativeElement.getBoundingClientRect());
    const { x, y } = event.dropPoint;

    // Margen de 40 px para dedos pequeños; si dos huecos se solapan por el margen
    // gana el de centro más cercano (antes ganaba siempre el primero).
    const hit = nearestSlot(slots, x, y);

    if (hit >= 0) {
      this.place(hit, piece);
    } else {
      // Si no cayó en ningún hueco, la pieza vuelve a su sitio
      event.source.reset();
    }
  }

  /**
   * Toca la pieza: **se queda en la mano**, no va sola a ningún hueco.
   *
   * Tocar otra la sustituye; tocar la misma la devuelve a la bandeja. A dónde va la
   * decide ella después, tocando el hueco (`tapSlot`).
   */
  onTap(piece: TrayPiece): void {
    if (Date.now() - this.lastDragEnd < 300) return; // ignora el click que sigue al arrastre
    // Tocar en la bandeja también suena: es una de las dos formas de agarrar sin arrastrar.
    this.onActivity();
    this.hearPiece(piece);
    this.seleccionada.update(actual => (actual?.trayId === piece.trayId ? null : piece));
  }

  /**
   * Toca un hueco.
   *
   * Lleno → vuelve a la bandeja, que es lo que ya hacía. Vacío con pieza en la mano →
   * ahí va. Vacío sin nada en la mano → no hace nada, y eso también es parte del
   * arreglo: si un toque a ciegas pudiera colocar algo, seguiríamos eligiendo por ella.
   */
  onSlotTap(index: number): void {
    if (this.placed()[index]) {
      this.pickBack(index);
      return;
    }
    const pieza = this.seleccionada();
    if (!pieza) return;
    this.seleccionada.set(null);
    this.place(index, pieza);
  }

  /** Devuelve a la bandeja una pieza ya colocada */
  pickBack(index: number): void {
    if (this.busy() || this.isOver()) return;
    this.onActivity();
    const occupant = this.placed()[index];
    if (!occupant) return;
    this.hearPiece(occupant);
    this.placed.update(list => {
      const copy = [...list];
      copy[index] = null;
      return copy;
    });
    this.tray.update(list => [...list, this.toTrayPiece(occupant)]);
    this.hint.set('');
  }

  /**
 * Devuelve una pieza colocada a la bandeja.
 *
 * Antes se reconstruía a mano dejando `reading/pinyin/meaning` **vacíos**, lo que al
 * devolver una pieza hacía que apareciera sin nombre y, peor, sin los datos que hacen
 * falta para oírla. Ahora se reconstruye desde `pieceData(kanji)`, que es la única
 * fuente: no hay dos listas que puedan desincronizarse.
 *
 * `correct: true` porque todo lo que vuelve a la bandeja viene de un hueco del objetivo.
 */
private toTrayPiece(placed: PlacedPiece): TrayPiece {
    return {
      ...pieceData(placed.kanji),
      trayId: placed.trayId,
      correct: true
    };
  }

  private place(index: number, piece: TrayPiece): void {
    if (this.busy() || this.isOver()) return;
    this.audio.retryPendingAudio();
    this.hearPiece(piece);
    // Siempre se limpia la mano, aunque venga de un arrastre: si la dejara llena, el
    // siguiente toque en un hueco colocaría otra vez la pieza que ya está puesta.
    this.seleccionada.set(null);

    // Si el hueco ya tenía algo, esa vuelve a la bandeja
    this.placed.update(list => {
      const copy = [...list];
      const occupant = copy[index];
      if (occupant) this.tray.update(t => [...t, this.toTrayPiece(occupant)]);
      copy[index] = { trayId: piece.trayId, kanji: piece.kanji, emoji: piece.emoji };
      return copy;
    });
    this.tray.update(list => list.filter(t => t.trayId !== piece.trayId));
    this.hint.set('');
    // Soltar también suena: es el refuerzo del gesto. Agarrar y soltar son los dos
    // momentos en que la niña está mirando la pieza.

    if (this.allFilled()) this.evaluate();
  }

  /**
   * Evalúa la composición SIN decir si está bien o mal: clasifica la situación y
   * lanza la pregunta socrática correspondiente.
   */
  private evaluate(): void {
    const p = this.problem();
    if (!p) return;

    const placed = this.placed() as PlacedPiece[];
    const exact = placed.every((piece, i) => piece.kanji === p.slots[i]!.kanji);

    if (exact) {
      this.onComposed();
      return;
    }

    // ¿Son las piezas correctas pero colocadas en otro orden?
    const placedSorted = placed.map(x => x.kanji).sort().join('|');
    const neededSorted = p.slots.map(s => s.kanji).sort().join('|');
    const moment: SocraticMoment =
      placedSorted === neededSorted ? 'right-pieces-wrong-place' : 'wrong-piece';

    // No se penaliza ni se rompe la racha: se devuelve una pregunta
    this.line.set(pickLine(moment));
    this.hint.set('🤔 Prueba otra vez, o muévelas y observa qué cambia');
    // El error no es un veredicto, es el mecanismo que sube la ayuda. Se registra aquí y
    // no antes: solo cuenta cuando la composición queda llena y no es exacta.
    this.onWrong();

    // ⚠️ Aquí se quitó `audio.playFailure()`. Un zumbido de error es un **veredicto**:
    // le dice a la niña que lo que hizo está mal antes de que sepa *por qué*. El método
    // socrático no necesita ese mensaje; necesita que la pregunta se oiga, porque si la
    // duda solo está escrita no llega a quien no lee. Y en silencio no habría ningún
    // canal para la pregunta, así que el sonido es la pregunta, no el castigo.
    this.speakSocratic(moment);

    // ⏱️ El id se guarda para poder cancelarlo: sin esto, si ella vuelve a intentarlo
    // antes de los 3200 ms, el disparo viejo borra el texto del intento **nuevo** y la
    // pregunta desaparece mientras la está leyendo.
    if (this.clearPromptTimer !== null) clearTimeout(this.clearPromptTimer);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.clearPromptTimer = null;
      this.line.set('');
      this.hint.set('');
    }, 3200);
    this.clearPromptTimer = timer;
    this.timers.add(timer);
  }

  /**
   * Dice la duda socrática en voz alta.
   *
   * El número de línea es estable por momento y se elige de forma determinista según la
   * ronda, para que no suene distinta cada vez que se repite la misma situación.
   */
  private speakSocratic(moment: SocraticMoment): void {
    const opciones = SOCRATIC_LINE_COUNT[moment] ?? 3;
    const n = this.currentLevel() % opciones;
    void this.narrator.say(socraticLine(moment, n));
  }

  private onComposed(): void {
    this.busy.set(true);
    // Ya entendió qué pieza va en cada hueco: no hay nada que escalar.
    this.ladder.registerCorrect();
    this.ladderLevel.set(0);
    // ⚠️ Aquí **no** se pone `localFeedback = 'success'`. Es el instante en que se mira
    // lo que acaba de montarse, y con ese estado el banner dejaba de mirarse a
    // `customMessage` y escogía un "¡Muy bien!" aleatorio que seguía apareciendo durante
    // todo el paso de dibujo. No hay elogio todavía: hay un descubrimiento.
    this.celebrating.set(true);
    this.line.set('');
    this.hint.set('');
    // El kanji ya compuesto suena **antes** de nada: es el momento en que la forma que
    // ella acaba de construir y su sonido se encuentran por primera vez.
    this.hearKanji();

    // Si el kanji tiene "hermanos", es el mejor momento para el descubrimiento.
    if ((this.target()?.siblings ?? []).length > 0) {
      // 1500 ms y no 900: el clip del kanji dura ~1.2 s, y a los 900 ms se le cortaba a
      // medio nombre justo en el momento en que acababa de completarse.
      this.later(() => {
        this.showSiblings.set(true);
        // Sin frase en `line` ni `speakSiblings` aquí: la narración la manda ahora el
        // laboratorio, que es quien dice "¡Mira! con las mismas piezas..." al abrirse y
        // nombra lo que se forme. Dos `narrator.play` seguidos se cortarían entre sí, y
        // el que ganaría sería el segundo.
      }, 1500);
      // El paso de dibujo NO se prepara a escondidas debajo del overlay: se abre al
      // cerrarlo (ver `dismissSiblings`).
    } else {
      this.later(() => this.enterDraw(), 2200);
    }
  }

  /** Pasa al paso de dibujo. La instrucción se oye, no solo se escribe (B9). */
  private enterDraw(): void {
    this.busy.set(false);
    this.celebrating.set(false);
    // ⚠️ Se borra lo del paso anterior. Sin esto, si el kanji tenía hermanos, la frase
    // del overlay ("¿Cuál te gusta más?") seguía en el banner durante todo el dibujo:
    // era la tercera cara de B2, y solo salía a la luz con un kanji con hermanos.
    this.line.set('');
    this.hint.set('');
    this.step.set('draw');
    // La ayuda solo tiene sentido mientras se compone. Con `busy` en `false` el reloj
    // seguiría corriendo durante el dibujo y a los 8 s se oiría el kanji otra vez.
    this.ladder.reset();
    this.trazoActual.set(0);
    this.ladderLevel.set(0);
    this.demo.set(null);

    // Primera vez: la última pieza del paseo de la primera ronda.
    if (this.isPreReader() && !this.tutorials.has(this.GAME_ID, DRAW_MODE)) {
      this.startDrawOnboarding();
    } else {
      void this.narrator.say(sys('draw-now'));
    }
  }

  /**
   * Muestra cómo se traza y devuelve el pega a los ~4,5 s. Igual que el tutorial de
   * componer: se corta sola, y si toca el lienzo antes, mejor todavía.
   */
  private startDrawOnboarding(): void {
    // `draw-empty` es la instrucción **y** el pie del gesto: dice "con el dedo" en el
    // instante exacto en que el dedo deja la línea.
    this.drawHint.set('demo');
    void this.narrator.say(sys('draw-empty'));

    this.later(() => {
      if (this.destroyed || this.step() !== 'draw') return;
      this.drawHint.set('your-turn');
      void this.narrator.say(sys('now-you'));
    }, DRAW_DEMO_MS);

    this.later(() => this.drawHint.set('off'), DRAW_DEMO_MS + 1400);
  }

  /** Si toca el lienzo, es que ya quiere dibujar: se corta y no se vuelve a ver. */
  skipDrawOnboarding(): void {
    if (this.drawHint() === 'off') return;
    this.tutorials.mark(this.GAME_ID, DRAW_MODE);
    this.drawHint.set('off');
  }

  dismissSiblings(): void {
    if (!this.showSiblings()) return;
    this.showSiblings.set(false);
    // Si vino de la reflexión (Q4), el dibujo ya pasó: lo que sigue es el siguiente kanji.
    if (this.desdeReflexion()) {
      this.desdeReflexion.set(false);
      this.generateProblem();
      return;
    }
    this.enterDraw();
  }

  // ============================================
  // ESCALERA DE AYUDA (§5.5)
  // ============================================

  /**
   * Mira periódicamente si lleva demasiado tiempo sin hacer nada. Se detiene sola: al
   * salir del paso de componer `tickLadder` no se vuelve a agendar.
   */
  private startIdleWatch(): void {
    this.later(() => this.tickLadder(), 1000);
  }

  private tickLadder(): void {
    // `busy` cubre la ventana en que ya acertó pero todavía no se ha ido al dibujo: ahí
    // el kanji acaba de sonar y repetirlo a los segundos sería interrumpir el momento.
    if (this.destroyed || this.busy() || this.step() !== 'compose') return;
    const subio = this.ladder.tick();
    if (subio) this.onLadderRise(subio);
    this.later(() => this.tickLadder(), 1000);
  }

  /**
   * Un error sube la ayuda, no dice nada nuevo. La pregunta socrática ya se acaba de
   * hablar en `evaluate()`: añadir aquí el sonido del kanji la cancelaría a mitad.
   */
  private onWrong(): void {
    const subio = this.ladder.registerWrong();
    this.ladderLevel.set(this.ladder.level);
    if (subio === 3 && this.ladder.shouldDemo()) this.showPieceDemo();
  }

  private onLadderRise(level: LadderLevel): void {
    this.ladderLevel.set(level);

    // Peldaño 1: vuelve a sonar el kanji. Es "pulsa la 🔊" sin tener que buscar el
    // botón: si se quedó quieta es porque ya no sabe qué suena con qué.
    if (level === 1) {
      this.hearKanji();
      return;
    }

    // Peldaño 3: demostración. A los 6 años `maxLevel` es 2 y esto no llega a ocurrir.
    if (level === 3 && this.ladder.shouldDemo()) this.showPieceDemo();
  }

  // ============================================
  // DEMOSTRACIÓN (§5.5)
  // ============================================

  /**
   * Enseña **un** movimiento, sobre un clon: la pieza que corresponde yendo a su hueco.
   *
   * No toca `tray()` ni `placed()`: no cuenta como acierto ni como error, porque no lo
   * fue. Es el mismo contrato que en `logic-blocks`.
   */
  private showPieceDemo(): void {
    const need = this.nextNeed();
    const root = this.container()?.nativeElement.getBoundingClientRect();
    if (!need || !root) return;

    // De dónde se levanta: de la bandeja, o del hueco donde acaba de ponerla ella. Es
    // lo único que cambia entre los dos casos de `nextNeed`.
    const src = (
      need.from === null
        ? this.trayEls().find(e => e.nativeElement.dataset['tray'] === need.piece.trayId)
        : this.slotEls()[need.from]
    )?.nativeElement.getBoundingClientRect();
    const dst = this.slotEls()[need.slotIndex]?.nativeElement.getBoundingClientRect();
    if (!src || !dst) return;

    // Relativas al contenedor y no a la ventana: el gesto sigue siendo correcto aunque
    // la página se desplace mientras se reproduce.
    const centro = (r: DOMRect) => ({
      x: r.left + r.width / 2 - root.left,
      y: r.top + r.height / 2 - root.top,
    });
    this.demo.set({ from: centro(src), to: centro(dst), kanji: need.piece.kanji });
    this.later(() => this.demo.set(null), this.DEMO_MS);
  }

  // ============================================
  // TUTORIAL (§5.5)
  // ============================================

  /**
   * Tres tiempos: **esto es → mira cómo → ahora tú**. Es la lección Montessori y es la
   * misma que en `logic-blocks`: primero se presenta, después se imita, después se hace
   * sin ayuda. Una sola vez por perfil y modo.
   */
  private startTutorial(): void {
    this.tutorial.set('look');

    this.later(() => {
      if (this.destroyed || this.step() !== 'compose') return;
      this.tutorial.set('demo');
      const need = this.nextNeed();
      this.showPieceDemo();
      // El nombre de la pieza suena mientras la mano la levanta: es el momento en que
      // la forma y su sonido se encuentran, y sin esa voz el gesto es solo un movimiento.
      if (need) this.hearPiece(need.piece);
    }, 1600);

    this.later(() => {
      if (this.destroyed || this.step() !== 'compose') return;
      this.tutorial.set('your-turn');
      void this.narrator.say(sys('now-you'));
    }, 1600 + this.DEMO_MS + 400);

    // Se marca al terminar, no al empezar: si se va a mitad, la próxima vez vuelve a
    // verlo. Es mejor repetir el tutorial una vez de más que quedarse sin él.
    this.later(
      () => {
        this.tutorial.set('off');
        this.tutorials.mark(this.GAME_ID, COMPOSE_MODE);
      },
      1600 + this.DEMO_MS + 400 + 1600,
    );
  }

  /** Si toca algo, es que ya quiere jugar: se corta el tutorial. */
  skipTutorial(): void {
    if (this.tutorial() === 'off') return;
    this.tutorials.mark(this.GAME_ID, COMPOSE_MODE);
    this.tutorial.set('your-turn');
    this.later(() => this.tutorial.set('off'), 900);
  }

  // ============================================
  // PASO 3: DIBUJAR
  // ============================================

  /**
   * Muestrea el trazo de KanjiVG en puntos, en coordenadas normalizadas del lienzo.
   *
   * Se deja medir al propio navegador (`getPointAtLength`) en vez de parsear el `d` a
   * mano: KanjiVG usa curvas `C` y `c` con control variables, y reimplementar eso sería
   * código que solo puede fallar. El elemento va suelto, sin insertarse en la página.
   *
   * Devuelve `null` donde no hay geometría —jsdom en los tests—, y entonces la validación
   * se apaga: se puede dibujar libre, que es como era antes. Ninguna prueba depende de
   * que el navegador mida.
   */
  private muestreaTrazo(d: string, vb: string, n = 24): Punto[] | null {
    try {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      const total = path.getTotalLength();
      if (!total) return null;
      // viewBox = "minX minY ancho alto"; el lienzo es cuadrado como el viewBox.
      const [, , w, h] = vb.trim().split(/\s+/).map(Number);
      const sx = 1 / (w || 109);
      const sy = 1 / (h || 109);
      const pts: Punto[] = [];
      for (let i = 0; i <= n; i++) {
        const p = path.getPointAtLength((total * i) / n);
        pts.push({ x: p.x * sx, y: p.y * sy });
      }
      return pts;
    } catch {
      return null;
    }
  }

  /** Cache: el mismo trazo se muestrea una vez, no en cada levantamiento de dedo. */
  private trazoEsperado(d: string, vb: string): Punto[] | null {
    const clave = `${vb}|${d}`;
    if (!this._muestra.has(clave)) this._muestra.set(clave, this.muestreaTrazo(d, vb));
    return this._muestra.get(clave) ?? null;
  }

  private readonly _muestra = new Map<string, Punto[] | null>();

  private canvasPoint(event: PointerEvent): { x: number; y: number } | null {
    const el = this.canvasRef()?.nativeElement;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      x: (event.clientX - r.left) / r.width,
      y: (event.clientY - r.top) / r.height,
    };
  }

  /**
   * ¿Es un trazo de verdad, o es la mano apoyada?
   *
   * Dos filtros (B12):
   *  - `isPrimary === false` es el **segundo** punto de contacto — el otro dedo, o la
   *    palma que se apoya después. Sin esto estaba metiendo sus puntos dentro del trazo
   *    que ella traía en marcha.
   *  - El área de contacto es la palma que llega **primero**, caso que `isPrimary` no
   *    cubre porque, al ser el único toque, sí es el primario.
   *
   * Se comprueba `=== false` y no `!isPrimary` a propósito: los eventos sintéticos de
   * las pruebas son `MouseEvent`, que no lleva `isPrimary`, y un trazo de prueba no debe
   * quedar rechazado por ir sin ese campo.
   */
  private esMano(event: PointerEvent): boolean {
    if (event.isPrimary === false) return true;
    const area = Math.max(event.width || 0, event.height || 0);
    return area > KanjiCompose.AREA_PALMA;
  }

  onPointerDown(event: PointerEvent): void {
    if (this.esMano(event)) return;
    const p = this.canvasPoint(event);
    if (!p) return;
    this.canvasRef()?.nativeElement.setPointerCapture(event.pointerId);
    this.punteroActivo = event.pointerId ?? null;
    this.drawing = [p];
    this.strokes.update(s => [...s, this.drawing!]);
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drawing) return;
    // Solo el puntero que empezó: un segundo dedo que se mueve no debe heredar el trazo
    if (this.punteroActivo !== null && event.pointerId != null && event.pointerId !== this.punteroActivo) {
      return;
    }
    const p = this.canvasPoint(event);
    if (!p) return;
    this.drawing.push(p);
    // Redibuja solo el trazo en curso para no repintar todo el lienzo
    this.strokes.update(s => [...s]);
  }

  onPointerUp(event?: PointerEvent): void {
    // Que levante un dedo ajeno no debe cerrar el trazo que está haciendo ella
    if (event && this.punteroActivo !== null && event.pointerId != null && event.pointerId !== this.punteroActivo) {
      return;
    }
    const trazo = this.drawing;
    this.drawing = null;
    this.punteroActivo = null;
    if (trazo) this.evaluarTrazoDibujado(trazo);
  }

  /**
   * ¿Es ese el trazo que tocaba?
   *
   * La respuesta **nunca** es "incorrecto". Si no cuadra, el trazo no se queda, vuelve
   * la demostración y se le pregunta otra vez; si cuadra, se pasa al siguiente. Y si no
   * hay datos o no hay geometría, no se valida nada: se dibuja libre, como antes.
   *
   * El botón ✅ sigue funcionando igual, también cuando quedan trazos: no completar el
   * kanji no es un fallo, y no debe ser una pantalla de la que no se pueda salir.
   */
  private evaluarTrazoDibujado(trazo: Punto[]): void {
    if (this.step() !== 'draw') return;
    const guia = this.trazoGuide();
    const d = guia?.trazos[this.trazoActual()];
    if (!guia || !d) return;

    const esperado = this.trazoEsperado(d, guia.vb);
    if (!esperado) return;

    const v = evaluarTrazo(trazo, esperado);
    if (v.esToque) {
      // Un toque suelto no es un trazo. Tampoco se queda pintado: mientras quede en el
      // lienzo, `strokes.length` deja de igualar `trazoActual` y `↩️ Trazo` —que quita
      // un trazo— descontaría un punto que nunca subió la guía.
      this.strokes.update(s => s.slice(0, -1));
      return;
    }

    if (!v.aceptado) {
      // Suave: se va el trazo, vuelve la demostración (la guía ya la repite sola) y se
      // sigue en el mismo trazo. No se pone ningún aviso rojo ni se cuenta un error.
      this.strokes.update(s => s.slice(0, -1));
      this.dudaDeTrazo();
      return;
    }

    this.trazoActual.update(n => n + 1);
    // La duda se va en cuanto lo consigue: si se quedara hasta los 3200 ms, estaría
    // preguntando "¿hacia dónde va?" mientras ella ya va por el trazo siguiente.
    if (this.clearPromptTimer !== null) {
      clearTimeout(this.clearPromptTimer);
      this.clearPromptTimer = null;
    }
    this.hint.set('');
    if (this.kanjiTrazado()) this.trazarKanjiCompleto();
  }

  /**
   * La duda cuando un trazo no sale.
   *
   * Va en `hint` y no en `line`: `line` solo se pinta dentro del overlay de hermanos,
   * mientras que `hint` es el pie que se ve en **todos** los pasos, dibujar incluido.
   * A los 4 años ni lo lee —la frase se oye—, pero para quien lee está ahí.
   *
   * El temporizador usa el mismo `clearPromptTimer` que la duda de componer a propósito:
   * si una duda queda viva al cambiar de paso, la nueva la cancela en lugar de apagarse
   * a mitad de la frase que acaba de empezar.
   */
  private dudaDeTrazo(): void {
    this.hint.set(pickLine('stroke-retry'));
    this.speakSocratic('stroke-retry');

    if (this.clearPromptTimer !== null) clearTimeout(this.clearPromptTimer);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.clearPromptTimer = null;
      this.hint.set('');
    }, 3200);
    this.clearPromptTimer = timer;
    this.timers.add(timer);
  }

  /** Se acabó el kanji: se mira lo que dibujó y se acaba la ronda. */
  private trazarKanjiCompleto(): void {
    if (this.drawn() || this.busy() || this.isOver()) return;
    this.drawn.set(true);
    this.line.set(pickLine('draw-done'));
    this.finishProblem();
  }

  undoStroke(): void {
    this.strokes.update(s => s.slice(0, -1));
    // La guía vuelve un trazo atrás: en reposo `strokes.length` es igual a `trazoActual`
    // (los rechazos se van del lienzo), así que quitar el último es deshacer el último
    // aceptado. Sin esto la guía diría "siguiente" mientras ella mira un trazo menos y
    // no podría repetir el que acabó de borrar.
    this.trazoActual.update(n => Math.max(0, n - 1));
  }

  clearCanvas(): void {
    this.strokes.set([]);
    this.trazoActual.set(0);
  }

  /** Pinta los trazos sobre el canvas; se llama con afterRenderEffect */
  paint(): void {
    const el = this.canvasRef()?.nativeElement;
    if (!el) return;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 3);
    const size = el.getBoundingClientRect();
    if (size.width === 0) return;
    if (el.width !== size.width * dpr || el.height !== size.height * dpr) {
      el.width = size.width * dpr;
      el.height = size.height * dpr;
    }
    const ctx = el.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.guide().color;
    ctx.lineWidth = Math.max(6, size.width * 0.035);

    for (const stroke of this.strokes()) {
      if (stroke.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(stroke[0]!.x * size.width, stroke[0]!.y * size.height);
      for (const pt of stroke.slice(1)) ctx.lineTo(pt.x * size.width, pt.y * size.height);
      // Un solo punto = toque; se marca igual para que se vea
      if (stroke.length === 1) ctx.lineTo(stroke[0]!.x * size.width + 0.5, stroke[0]!.y * size.height);
      ctx.stroke();
    }
  }

  finishDrawing(): void {
    if (this.isOver() || this.busy() || this.drawn()) return;
    if (this.strokes().length === 0) {
      // Se **dice** (B9). Antes solo se escribía "Dibuja con el dedo…", que a los 4
      // años no le llega: la niña pulsaba ✅ y no pasaba nada, sin que nadie le
      // explicara que primero hay que dibujar.
      void this.narrator.say(sys('draw-empty'));
      if (!this.isPreReader()) {
        this.hint.set('👆 Dibuja con el dedo o el lápiz, aunque sea con una línea');
      }
      return;
    }
    this.drawn.set(true);
    this.line.set(pickLine('draw-done'));
    this.finishProblem();
  }

  // ============================================
  // FIN DE PROBLEMA
  // ============================================

  private finishProblem(): void {
    // El paseo de la primera vez acaba aquí, con la ronda completa. Se marca al llegar
    // y no antes: si se va a mitad, lo que no le tocó se le vuelve a presentar.
    this.tutorials.mark(this.GAME_ID, DRAW_MODE);
    this.celebrating.set(false);
    this.localFeedback.set('success');
    const result = this.session.recordCorrect();

    // §5.4. El SRS se alimenta aquí, y con la ayuda de la escalera en la mano: una ronda
    // terminada con el gesto fantasma tocando por ella no es un recuerdo, es un andamio,
    // y si contara igual acabaría todo en la caja 5 en una sesión.
    // §5.11. Kanji-compose era el único juego japonés que no anotaba nada, así que el
    // panel no lo veía venir.
    const objetivo = this.problem()?.target;
    if (objetivo) {
      const ayuda = this.ladderLevel();
      this.srs.review(KANJI_COMPOSITION_DECK, objetivo.id, { correct: true, ayuda });

      const profile = this.activeProfile();
      if (profile) {
        this.skills.recordAttempt({
          skillId: this.SKILL,
          contentId: objetivo.id,
          correct: true,
          responseTimeMs: Date.now() - this.rondaEmpezadaEn,
          difficulty: this.currentLevel(),
          representation: 'kanji',
          timestamp: Date.now(),
          profileAge: profile.age,
          profileId: profile.id,
        });
      }
    }

    if (result.leveledUp) {
      this.progress.saveProgress(this.GAME_ID, {
        level: result.newLevel,
        completed: result.newLevel >= this.MAX_LEVEL,
      });
      return;
    }

    this.audio.playPraise();
    // ⚠️ Sin confeti en cada kanji (Q5). Se disparaba tras **cada** ronda, con lo que
    // dejó de significar "subiste de nivel" y el confeti del level-up —el que está
    // debajo, en `handleSessionEvent`— pasó a no distinguirse del de siempre. El elogio
    // sonoro se queda aquí; la lluvia de papel es solo para lo que no ocurría antes.

    // A los 6 años: reflexión de un toque antes del siguiente kanji
    if ((this.activeProfile()?.age ?? 6) >= 6) {
      this.later(() => this.reflecting.set(true), 1600);
    } else {
      this.later(() => {
        if (!this.isOver()) this.generateProblem();
      }, 2800);
    }
  }

  /**
   * Las respuestas posibles a "¿cómo supiste qué pieza iba en cada hueco?".
   *
   * Van como `computed` y no como array fijo porque la tercera no siempre puede
   * cumplirse: "probé otra posición" abre el panel de hermanos, que se llena con los
   * kanji hechos con las mismas piezas, y un kanji sin hermanos —que son casi todos—
   * abriría un panel vacío con una frase que no viene a cuento. Ofrecer una respuesta que
   * no se puede dar es peor que no ofrecerla.
   */
  readonly reflections = computed(() => {
    const base = [
      { emoji: '🧩', text: 'Conté los huecos', que: 'huecos' as const },
      { emoji: '💡', text: 'Pensé en la historia', que: 'historia' as const },
    ];
    return (this.target()?.siblings ?? []).length > 0
      ? [...base, { emoji: '🔎', text: 'Probé otra posición', que: 'posicion' as const }]
      : base;
  });

  /**
   * Lo que ella contesta a "¿cómo supiste?".
   *
   * Q4: los tres botones hacían exactamente lo mismo —llamaban a `chooseReflection()` sin
   * argumento— y solo servían para pasar de página, así que la pregunta era decorativa:
   * parecía metacognición y no pedía nada. Ahora cada uno hace lo que dice, que es lo
   * único que convierte una pregunta en pregunta.
   *
   * Las dos primeras se oyen y **después** sigue la siguiente ronda: si no, ella toca y
   * se queda mirando el mismo diálogo, que es la forma más segura de que no vuelva a tocar
   * nada. La tercera abre el panel de hermanos —que es "otra posición" de verdad— y el
   * paso siguiente lo da ella al cerrarlo.
   *
   * No se guarda todavía cuál eligió: eso es §5.11 (panel parental) y tiene sitio propio.
   * Lo que aquí importa es que la respuesta **cambia algo**.
   */
  async chooseReflection(que: 'huecos' | 'historia' | 'posicion'): Promise<void> {
    if (this.isOver()) return;
    this.audio.retryPendingAudio();

    if (que === 'posicion') {
      this.reflecting.set(false);
      this.desdeReflexion.set(true);
      // El laboratorio se narra a sí mismo al abrirse; aquí no hay nada que decir.
      this.showSiblings.set(true);
      return;
    }

    const t = this.target();
    if (t) {
      const cues: Cue<Highlight>[] =
        que === 'historia'
          ? [{ clip: kanjiStory(t.id), pauseAfterMs: 350 }]
          : recountCues(t);
      await this.narrator.play(cues, c => this.cue.set(c));
    }
    if (!this.isOver()) this.generateProblem();
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }

  // ============================================
  // UTILIDADES
  // ============================================

  private isOver(): boolean {
    const s = this.session.state();
    return !!(s?.isTimeUp || s?.isCompleted);
  }

  // ⚠️ Aquí vivía `speak(kanji)`, que mandaba el **carácter kanji** al TTS:
  //
  //     this.speech.speak('明', 'ja-JP')
  //
  // Era la causa raíz de que "el kanji no suena". Tres fallos en una línea:
  //  1. El motor elige entre on'yomi y kun'yomi, así que podía decir 明 como "メイ"
  //     cuando lo que había que enseñar era "あかるい".
  //  2. Sin conexión, un tablet puede no tener voz `ja-JP` → silencio, sin error.
  //  3. Cuando sí había voz, la lectura era correcta por casualidad, no por diseño.
  //
  // Ahora el sonido siempre viene de un clip (`hearKanji`, `hearPiece`), y el TTS queda
  // solo como plan B con el texto del manifiesto.

  private triggerConfetti(): void {
    try {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch {
      /* noop */
    }
  }

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