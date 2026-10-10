/**
 * "Escalera de ayuda": a más tiempo sin acertar o más errores seguidos, más ayuda se ofrece.
 *
 * Lógica pura, sin Angular, para poder probarla con `vitest` (ver `hint-ladder.spec.ts`).
 *
 * POR QUÉ EXISTE
 * Una niña de 4 años que no ha entendido la consigna no está "equivocada": está Atascada.
 * Si cada intento errado sube la ayuda, el error deja de ser un castigo y pasa a ser el
 * mecanismo que activa el siguiente peldaño. Es el mismo gesto que en el método Zvonkin:
 * el juego pregunta, no juzga.
 *
 * El nivel se decide con `max(inactividad, errores)`, no con la suma: si lleva 30 s sin hacer
 * nada pero solo falló una vez, necesita la ayuda de 24 s (nivel 3), no una mezcla de las dos.
 */

export interface LadderConfig {
  /** Umbrales de inactividad, en ms, para los niveles 1, 2 y 3. */
  readonly idleMs: readonly number[];
  /** Tope duro. Para 6 años es 2: no hay mano fantasma. */
  readonly maxLevel: 0 | 1 | 2 | 3;
  /** Máximo de demostraciones por ronda (evita que sea pasiva). */
  readonly maxDemos: number;
}

/**
 * 4 años: apoyo temprano y completo. A los 4 el umbral de espera corto es lo que
 * convierte "se atascó" en "recibe una pista" antes de que se frustre.
 *
 * 6 años: espera mucho más larga (no le gusta que le repitan) y sin demostración,
 * porque a esa edad separar bien los atributos es justo lo que se está practicando:
 * resolverlo por ella quita el aprendizaje.
 */
export const LADDER_BY_AGE: Record<4 | 6, LadderConfig> = {
  4: { idleMs: [8_000, 16_000, 24_000], maxLevel: 3, maxDemos: 2 },
  6: { idleMs: [20_000, 40_000, Infinity], maxLevel: 2, maxDemos: 0 }
};

export type LadderLevel = 0 | 1 | 2 | 3;

export function configForAge(age: number): LadderConfig {
  return LADDER_BY_AGE[(age <= 4 ? 4 : 6) as 4 | 6];
}

/**
 * Nivel de ayuda que corresponde a esta situación.
 *
 * @param idleMs      cuánto lleva sin interactuar
 * @param wrongStreak errores seguidos en esta ronda
 */
export function levelFor(idleMs: number, wrongStreak: number, cfg: LadderConfig): LadderLevel {
  const byIdle = cfg.idleMs.filter(t => idleMs >= t).length;
  // El tope tiene que venir de `maxLevel`, no solo de la longitud de `idleMs`: con 3 errores,
  // `max(byIdle, wrongStreak)` llegaría a 3 aunque `idleMs` solo tenga 2 peldaños, y 6 años
  // dispararía la mano fantasma justo cuando más le cuesta.
  return Math.min(cfg.maxLevel, Math.max(byIdle, wrongStreak)) as LadderLevel;
}

/**
 * Estado mutable de la escalera para una ronda.
 *
 * Va en una clase (y no en signals del componente) porque toda su lógica es síncrona: se
 * prueba con reloj inyectado, sin componente y sin esperas reales. El componente solo lee
 * `level()`.
 */
export class HintLadder {
  private _level: LadderLevel = 0;
  private _idleMs = 0;
  private _wrongStreak = 0;
  private _demos = 0;
  private _startedAt = 0;

  constructor(
    readonly cfg: LadderConfig,
    /** Reloj inyectado para poder probar los umbrales sin esperar 24 s de verdad. */
    private readonly now: () => number = () => Date.now()
  ) {}

  get level(): LadderLevel { return this._level; }
  get demosShown(): number { return this._demos; }
  get idleMs(): number { return this._idleMs; }
  get wrongStreak(): number { return this._wrongStreak; }

  /** Nueva ronda: todo a cero, incluidos los demos. */
  reset(startedAt = this.now()): void {
    this._level = 0;
    this._idleMs = 0;
    this._wrongStreak = 0;
    this._demos = 0;
    this._startedAt = startedAt;
  }

  /**
   * Cualquier interacción reinicia el reloj de inactividad, pero **no** los errores:
   * volver a tocar la pantalla no borra que se falló tres veces seguidas.
   */
  touch(now = this.now()): void {
    this._startedAt = now;
    this._idleMs = 0;
    this._level = levelFor(0, this._wrongStreak, this.cfg);
  }

  /** Se recounté el tiempo sin hacer nada. Devuelve el nivel si *acabó de subir*, si no null. */
  tick(now = this.now()): LadderLevel | null {
    this._idleMs = now - this._startedAt;
    const next = levelFor(this._idleMs, this._wrongStreak, this.cfg);
    const rose = next > this._level;
    this._level = next;
    return rose ? next : null;
  }

  /** Registra un error. Devuelve el nivel si *acabó de subir*, si no null. */
  registerWrong(): LadderLevel | null {
    this._wrongStreak++;
    const next = levelFor(this._idleMs, this._wrongStreak, this.cfg);
    const rose = next > this._level;
    this._level = next;
    return rose ? next : null;
  }

  /** Un acierto deja la escalera a cero: ya entendió, no hay nada que escalar. */
  registerCorrect(): void {
    this._wrongStreak = 0;
    this._level = 0;
  }

  /** ¿Toca hacer la demostración? Además del nivel, hay que respetar el tope por ronda. */
  shouldDemo(): boolean {
    if (this._level < 3) return false;
    if (this._demos >= this.cfg.maxDemos) return false;
    this._demos++;
    return true;
  }
}