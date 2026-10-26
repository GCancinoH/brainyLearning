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
  /** Las 4 opciones, mezcladas: siempre incluye `respuesta` */
  opciones: string[];
}

/**
 * Hasta qué número llega la etapa de reconocer según el nivel.
 *
 * Los niveles crecen el tramo: 1–5, 1–10, 1–15 y de ahí al 20, que es el techo que pide
 * el documento. El rango no depende de la edad: los dos empiezan igual, lo que cambia es
 * a qué nivel llega cada una (ese dato lo pone el perfil, no el generador).
 */
export function topeReconocer(level: number): number {
  const lvl = Math.max(1, Math.min(level, 10));
  if (lvl <= 2) return 5;
  if (lvl <= 4) return 10;
  if (lvl <= 6) return 15;
  return 20;
}

export function buildReconocerProblem(level: number, rng: Rng = Math.random): ReconocerProblem {
  const tope = topeReconocer(level);
  const numero = randInt(1, tope, rng);
  // Se alterna la dirección: reconocer el glifo y leerlo son dos habilidades distintas,
  // y una sola dirección convertiría el juego en adivinar cuál de los cuatro es el bonito.
  const direccion: ReconocerProblem['direccion'] =
    rng() < 0.5 ? 'numero-a-hanzi' : 'hanzi-a-numero';
  const esHanzi = direccion === 'numero-a-hanzi';
  const respuesta = esHanzi ? hanziPara(numero) : String(numero);
  const enunciado = esHanzi ? String(numero) : hanziPara(numero);

  // Distractores: otros números del mismo tramo. Nunca se parecen poco: con un tramo de
  // cinco números las cuatro opciones son casi todo el tramo, que es lo que hace que
  // elegir cueste.
  const otros = new Set<number>();
  while (otros.size < 3) {
    const n = randInt(1, tope, rng);
    if (n !== numero) otros.add(n);
  }
  const opciones = shuffle(
    [respuesta, ...[...otros].map(n => (esHanzi ? hanziPara(n) : String(n)))],
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
   * 二十二 pide dos veces la 二— y de más, un solo ejemplar de cada carácter que no
   * forma parte de la solución. Nunca un segundo 十.
   */
  bandeja: string[];
}

/**
 * Tramo de objetivos según nivel y edad.
 *
 * Los 4 se quedan en el 11–30: el 十 y las unidades, que es el primer montaje de verdad
 * (十五 = 十 + 五). Los 6 suben hasta el 99, que es donde se ven decenas de verdad.
 */
function rangoObjetivo(level: number, age: 4 | 6): [number, number] {
  const lvl = Math.max(1, Math.min(level, 12));
  if (age === 4) return lvl <= 4 ? [11, 20] : [11, 30];
  if (lvl <= 4) return [11, 30];
  if (lvl <= 8) return [21, 60];
  return [41, 99];
}

/** Cuántas piezas trae la bandeja. Más piezas = más buscar, no más difícil de leer. */
function tamanoBandeja(level: number, age: 4 | 6): number {
  const lvl = Math.max(1, Math.min(level, 12));
  if (age === 4) return lvl <= 4 ? 5 : 6;
  return lvl <= 4 ? 7 : 10;
}

export function buildCombinacionProblem(
  level: number,
  age: 4 | 6,
  rng: Rng = Math.random,
): CombinacionProblem {
  const [min, max] = rangoObjetivo(level, age);
  const objetivo = randInt(min, max, rng);
  const solucion = piezasDe(objetivo);

  // Distractores: el resto de los diez caracteres. No pueden formar otra lectura del
  // objetivo —`leer` solo admite la canónica— así que el conjunto distractor no rompe
  // la unicidad; solo estorba.
  const resto = shuffle(
    PIEZAS.filter(p => !solucion.includes(p)),
    rng,
  );
  const faltan = Math.max(0, tamanoBandeja(level, age) - solucion.length);
  const bandeja = shuffle([...solucion, ...resto.slice(0, faltan)], rng);

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
