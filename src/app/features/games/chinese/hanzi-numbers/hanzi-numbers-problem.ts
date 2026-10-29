/**
 * Generador de "Números Hanzi" (Planeta Dragón 🐉 — Sabio Long).
 * Lógica pura, sin Angular, para probarla aparte.
 *
 * Dos etapas:
 *
 *  1. **Reconocer (1–20):** se ve un número y hay que elegir su hanzi —o al revés.
 *  2. **Combinar (≥ 11):** se ve un número (35) y hay que AGARRAR de la bandeja los
 *     hanzis que lo recrean **en orden**: 三 → 十 → 五.
 *
 * El chino es **posicional**. No existe "treinta y cinco": existe "tres dieces cinco".
 * Por eso con diez caracteres (一…十) se escribe cualquier número del 1 al 99, y por eso
 * el valor de una pieza depende de DÓNDE está: la 三 de 三十五 vale 30 porque va antes
 * del 十. Esa posicionalidad es exactamente lo que el juego enseña.
 *
 * De ahí salen dos reglas que el juego no negocia:
 *
 *  - **La bandeja nunca trae un segundo 十** ni una copia de más de ningún carácter
 *    (salvo las que la propia escritura pide: 二十二 lleva dos veces la 二). Sin eso,
 *    diez dieces (10+10+10+5) formarían el 35 y "la combinación exacta" dejaría de ser
 *    exacta.
 *  - **Solo se lee la forma canónica.** `leer` es el inverso exacto de `hanziPara`: un
 *    montaje vale si y solo si es *la* escritura de ese número. 五十三 sí se lee (y es
 *    53, no 35); 三五 no se lee; 一十五 no se lee, porque en chino quince es 十五. La
 *    lectura ES la validación: no hay veredicto, el número que aparece se compara con el
 *    objetivo y la niña decide.
 */

import { getProfileDifficultyConfig } from '@core/learning/learning-content';

export type Rng = () => number;

/** Los diez caracteres con los que se escribe cualquier número del 1 al 99. */
export const PIEZAS: readonly string[] = [
  '一',
  '二',
  '三',
  '四',
  '五',
  '六',
  '七',
  '八',
  '九',
  '十',
];

const UNIDADES = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];
const DIEZ = '十';

export type Etapa = 'reconocer' | 'combinar';

/**
 * Niveles 1–6: reconocer el 1–20. A partir del 7: combinar.
 *
 * Es un cambio de etapa, no un modo: el juego "cambia" cuando ya sabe leer los diez
 * caracteres, que es lo que después va a necesitar para armar los números grandes.
 */
export const NIVEL_ULTIMO_RECONOCER = 6;

export function etapaDeNivel(level: number): Etapa {
  return level <= NIVEL_ULTIMO_RECONOCER ? 'reconocer' : 'combinar';
}

/**
 * Hanzi canónico de un número. 35 → '三十五'.
 *
 * Los teens no llevan el uno (15 → 十五, no 一十五): así lo escribe el chino estándar y
 * así se lee. Lanza `RangeError` fuera de 1–99: un número fuera de rango es un bug del
 * generador, no algo que haya que recortar en silencio.
 */
export function hanziPara(numero: number): string {
  if (!Number.isInteger(numero) || numero < 1 || numero > 99) {
    throw new RangeError(`hanziPara: ${numero} no está en 1–99`);
  }
  if (numero < 10) return UNIDADES[numero - 1];
  if (numero === 10) return DIEZ;
  const decenas = Math.floor(numero / 10);
  const unidades = numero % 10;
  const cabeza = decenas === 1 ? '' : UNIDADES[decenas - 1];
  return cabeza + DIEZ + (unidades === 0 ? '' : UNIDADES[unidades - 1]);
}

/** Todas las lecturas canónicas, 1–99, indexadas por su escritura. */
const POR_HANZI = new Map<string, number>();
for (let n = 1; n <= 99; n++) POR_HANZI.set(hanziPara(n), n);

/**
 * Lee una secuencia de piezas **en el orden en que se agarraron**.
 *
 * `null` si no es una lectura canónica: la unión con `hanziPara` es exacta, así que no
 * puede colarse una forma rara ni escaparse una válida.
 */
export function leer(piezas: readonly string[]): number | null {
  return POR_HANZI.get(piezas.join('')) ?? null;
}

/** Las piezas con las que se escribe `numero`, en orden. 35 → ['三','十','五'] */
export function piezasDe(numero: number): string[] {
  return [...hanziPara(numero)];
}

// ================================================================
// Etapa 1 · Reconocer
// ================================================================

export interface ReconocerProblem {
  /** El número que hay que reconocer */
  numero: number;
  /** ¿Se ve el número y se elige el hanzi, o se ve el hanzi y se elige el número? */
  direccion: 'numero-a-hanzi' | 'hanzi-a-numero';
  /** Lo que se muestra en grande */
  enunciado: string;
  /** Lo que hay que elegir */
  respuesta: string;
  /** Las opciones, mezcladas: 2–3 a los4 años, 3–4 a los6; siempre incluye `respuesta` */
  opciones: string[];
}

/**
 * Una perilla por nivel: cuánto llega el tramo.
 *
 * El tramo crece 1–5, 1–10, 1–15 y **1–20 en el nivel 4**, así que 16–20 se practica
 * dentro de la etapa: antes el tope 20 llegaba con el nivel ≥ 7 —cuando la etapa ya
 * había terminado en el 6— y 16–20 jamás se jugaba pese a la insignia "Aprende 1–20".
 * En N5 y N6 el tope deja de moverse (son 1–20) y lo que sube es la dificultad de los
 * distractores, que es su perilla.
 *
 * El rango no depende de la edad: los dos perfiles recorren la misma etapa, lo que
 * cambia es a qué nivel llega cada una (ese dato lo pone el perfil, no el generador).
 */
const TOPE_POR_NIVEL: readonly number[] = [5, 10, 15, 20, 20, 20];

export function topeReconocer(level: number): number {
  const lvl = Math.max(1, Math.min(level, NIVEL_ULTIMO_RECONOCER));
  return TOPE_POR_NIVEL[lvl - 1];
}

/**
 * Los distractores de `numero`, tantos como pida la perilla de la edad (`cuantos`), con
 * la perilla de su nivel:
 *
 *  - **N1–N4:** aleatorios del tramo. La perilla de estos niveles es el tope: con un
 *    tramo de cinco números las opciones son casi todo el tramo, que es lo que hace
 *    que elegir cueste.
 *  - **N5:** vecinos (±1..±3). Casi idénticos en valor, así que elegir obliga a mirar
 *    el glifo, no el número de al lado.
 *  - **N6:** mixto — la **trampa de la decena** (el mismo número sin el 十: 5 para 15,
 *    7 para 17) y el resto vecinos. Es la confusión real de esta etapa y solo aparece
 *    en su último nivel.
 */
function distractoresReconocer(
  numero: number,
  tope: number,
  level: number,
  cuantos: number,
  rng: Rng,
): number[] {
  const lvl = Math.max(1, Math.min(level, NIVEL_ULTIMO_RECONOCER));
  const enTramo = (n: number): boolean => n >= 1 && n <= tope && n !== numero;

  const vecinos = (): number[] =>
    [1, 2, 3, -1, -2, -3]
      .map(d => numero + d)
      .filter(enTramo);

  /** Hasta `hasta` de `candidatos` (mezclados), completando con aleatorios del tramo. */
  const tomar = (candidatos: readonly number[], hasta: number): number[] => {
    const elegidos = new Set<number>();
    for (const n of shuffle(candidatos, rng)) {
      if (elegidos.size >= hasta) break;
      elegidos.add(n);
    }
    while (elegidos.size < hasta) {
      const n = randInt(1, tope, rng);
      if (enTramo(n)) elegidos.add(n);
    }
    return [...elegidos];
  };

  if (lvl <= 4) {
    // Aleatorios del tramo, como siempre: aquí la perilla es el tope.
    const otrosNumeros = new Set<number>();
    while (otrosNumeros.size < cuantos) {
      const n = randInt(1, tope, rng);
      if (enTramo(n)) otrosNumeros.add(n);
    }
    return [...otrosNumeros];
  }

  if (lvl === 5) return tomar(vecinos(), cuantos);

  // N6 · mixto: la trampa de la decena manda (5 para 15; 15 para 5) y el resto son
  // vecinos. Para cualquier número de 1–20 con tope 20 la trampa existe siempre: si el
  // número es ≤ 10, su +10 cabe en el tramo; si es ≥ 11, su −10 también. Con una sola
  // opción (4 años) queda la trampa sola, que es la elección más dura de la etapa.
  const trampa = [numero - 10, numero + 10].filter(enTramo);
  const elegidos = new Set(tomar(trampa, Math.min(1, trampa.length)));
  for (const n of tomar(vecinos().filter(v => !elegidos.has(v)), cuantos - elegidos.size)) {
    elegidos.add(n);
  }
  return [...elegidos];
}

/**
 * 2.1 · Cuántas opciones: la perilla de la EDAD (4 años → 2–3, 6 → 3–4), que es lo que
 * `getProfileDifficultyConfig` ya dice de los demás juegos. Antes aquí había un4 fijo
 * para todo el mundo.
 *
 * 2.6 · La dirección se alterna desde el nivel3; en N1–N2 queda fija (dígito → hanzi),
 * que para los4 años las dos primeras rondas son emparejar sin sorpresas.
 */
export function buildReconocerProblem(
  level: number,
  age: 4 | 6,
  rng: Rng = Math.random,
): ReconocerProblem {
  const tope = topeReconocer(level);
  const numero = randInt(1, tope, rng);

  const cfg = getProfileDifficultyConfig(age);
  const cuantos = randInt(cfg.minOptions - 1, cfg.maxOptions - 1, rng);

  const lvl = Math.max(1, Math.min(level, NIVEL_ULTIMO_RECONOCER));
  // Reconocer el glifo y leerlo son dos habilidades distintas, y una sola dirección
  // convertiría el juego en adivinar cuál de las opciones es el bonito.
  const direccion: ReconocerProblem['direccion'] =
    lvl <= 2 || rng() < 0.5 ? 'numero-a-hanzi' : 'hanzi-a-numero';
  const esHanzi = direccion === 'numero-a-hanzi';
  const respuesta = esHanzi ? hanziPara(numero) : String(numero);
  const enunciado = esHanzi ? String(numero) : hanziPara(numero);

  const distractores = distractoresReconocer(numero, tope, level, cuantos, rng);
  const opciones = shuffle(
    [respuesta, ...distractores.map(n => (esHanzi ? hanziPara(n) : String(n)))],
    rng,
  );

  return { numero, direccion, enunciado, respuesta, opciones };
}

// ================================================================
// Etapa 2 · Combinar
// ================================================================

export interface CombinacionProblem {
  /** El número que hay que recrear con los hanzis */
  objetivo: number;
  /** Las piezas en el orden en que hay que agarrarlas (la lectura canónica) */
  solucion: string[];
  /**
   * La bandeja: piezas mezcladas. Trae la `solucion` completa —con sus repeticiones:
   * 二十二 pide dos veces la 二— y de más, `perilla.distractores` piezas que no forman
   * parte de la solución, un solo ejemplar de cada carácter. Nunca un segundo 十.
   */
  bandeja: string[];
}

/**
 * La perilla de un nivel de combinar: **una sola** cambia en cada salto, nunca dos.
 *
 * Se indexa con `level − NIVEL_ULTIMO_RECONOCER` (1..6), porque la etapa empieza en el
 * 7: antes las tablas ramificaban con `lvl <= 4`, una rama que nadie alcanzaba, y los
 * niveles 7–12 salían idénticos (11–30 con bandeja de 6 a los 4 años; 9–12 iguales y
 * bandeja de 10 a los 6).
 *
 *  - `rango`: de qué números salen los objetivos. "mixto" es un tramo que mezcla lo
 *    fácil y lo difícil —11–30 justo después de estrecharse a 15–30; 11–99 después de
 *    las bandas 21–60 y 41–99—.
 *  - `distractores`: piezas de más que trae la bandeja, además de las que pide la
 *    escritura. Con 0 solo hay que acertar el orden; con 3–4 hay que buscar también.
 */
export interface PerillaCombinar {
  /** Tramo del que sale el objetivo. */
  rango: readonly [number, number];
  /** Piezas que trae la bandeja por encima de la solución. */
  distractores: number;
}

const COMBINAR_POR_EDAD: Record<4 | 6, readonly PerillaCombinar[]> = {
  // Edad 4 · el 十 y las unidades: primero 11–20 (el primer montaje de verdad,
  // 十五 = 十 + 五), después 11–30.
  4: [
    { rango: [11, 20], distractores: 0 }, // N7 · solo lo que pide la escritura
    { rango: [11, 20], distractores: 1 }, // N8
    { rango: [11, 30], distractores: 1 }, // N9
    { rango: [11, 30], distractores: 2 }, // N10
    { rango: [15, 30], distractores: 2 }, // N11 · el tramo se estrecha: menos fácil
    { rango: [11, 30], distractores: 3 }, // N12 · mixto: vuelve el 11–14
  ],
  // Edad 6 · sube a decenas de verdad y llega al 99.
  6: [
    { rango: [21, 60], distractores: 1 }, // N7
    { rango: [21, 60], distractores: 2 }, // N8
    { rango: [41, 99], distractores: 2 }, // N9
    { rango: [41, 99], distractores: 3 }, // N10
    { rango: [11, 99], distractores: 3 }, // N11 · mixto: vuelve lo fácil
    { rango: [11, 99], distractores: 4 }, // N12
  ],
};

export function perillaCombinar(level: number, age: 4 | 6): PerillaCombinar {
  const lvl = Math.max(1, Math.min(level - NIVEL_ULTIMO_RECONOCER, NIVEL_ULTIMO_RECONOCER));
  return COMBINAR_POR_EDAD[age][lvl - 1];
}

export function buildCombinacionProblem(
  level: number,
  age: 4 | 6,
  rng: Rng = Math.random,
): CombinacionProblem {
  const perilla = perillaCombinar(level, age);
  const [min, max] = perilla.rango;
  const objetivo = randInt(min, max, rng);
  const solucion = piezasDe(objetivo);

  // Distractores: el resto de los diez caracteres. No pueden formar otra lectura del
  // objetivo —`leer` solo admite la canónica— así que el conjunto distractor no rompe
  // la unicidad; solo estorba.
  const resto = shuffle(
    PIEZAS.filter(p => !solucion.includes(p)),
    rng,
  );
  const bandeja = shuffle([...solucion, ...resto.slice(0, perilla.distractores)], rng);

  return { objetivo, solucion, bandeja };
}

// ================================================================

function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
