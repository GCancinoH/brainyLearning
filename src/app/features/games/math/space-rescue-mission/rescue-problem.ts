/**
 * Generador de peticiones de "Misión de rescate" (Suma Espacial 4, modo pareja).
 * Lógica pura, sin Angular, para poder probarla aparte.
 *
 * Un alien pide `need` estrellas. Las cajas traen `boxSize` estrellas cada una.
 * Puede que ya tenga `have` estrellas. Siempre se cumple:
 *     need = have + boxSize * boxes
 */

export interface RescueProblem {
  /** Estrellas que trae cada caja */
  boxSize: number;
  /** Cajas necesarias (la respuesta que decide la Navegante) */
  boxes: number;
  /** Estrellas que el alien ya tiene (0 = ninguna) */
  have: number;
  /** Total que el alien necesita */
  need: number;
  /** Tres planes posibles (incluye `boxes`) */
  planOptions: number[];
  /** Cajas disponibles en el almacén de la Ingeniera */
  pool: number;
}

export type Rng = () => number;

export const REQUIRED_PER_LEVEL = 4;

export function buildRescueProblem(level: number, rng: Rng = Math.random): RescueProblem {
  const rand = (min: number, max: number) => Math.floor(rng() * (max - min + 1)) + min;
  const lvl = Math.max(1, Math.min(level, 10));

  let boxSize: number;
  let boxes: number;
  let have = 0;

  if (lvl <= 2) {
    boxSize = 2;
    boxes = rand(1, 3);
  } else if (lvl <= 4) {
    boxSize = rand(2, 3);
    boxes = rand(2, 3);
  } else if (lvl <= 6) {
    boxSize = rand(2, 4);
    boxes = rand(2, 4);
  } else if (lvl <= 8) {
    boxSize = rand(2, 5);
    boxes = rand(3, 5);
  } else {
    boxSize = rand(3, 5);
    boxes = rand(3, 6);
    // Desde el nivel 9 el alien a veces ya trae estrellas: hay que restar antes de agrupar
    if (rng() < 0.5) have = rand(1, boxSize + 1);
  }

  const need = have + boxSize * boxes;
  return {
    boxSize,
    boxes,
    have,
    need,
    planOptions: buildPlanOptions(boxes, rng),
    pool: Math.min(8, boxes + 2),
  };
}

function buildPlanOptions(correct: number, rng: Rng): number[] {
  const candidates = [-2, -1, 1, 2].map(d => correct + d).filter(n => n >= 1);
  const wrong = shuffle(candidates, rng).slice(0, 2);
  return shuffle([correct, ...wrong], rng);
}

/** Estrellas totales con un plan dado */
export function starsFor(have: number, boxSize: number, plannedBoxes: number): number {
  return have + boxSize * plannedBoxes;
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
