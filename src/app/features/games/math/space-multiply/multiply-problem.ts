/**
 * Lógica pura del juego "Multiplicación Espacial".
 * Sin dependencias de Angular para poder probarla de forma aislada.
 *
 * Enfoque Montessori: la multiplicación se presenta como GRUPOS IGUALES
 * (a grupos de b estrellas), con material concreto antes que abstracto.
 */

export interface MultiplyProblem {
  /** Número de grupos */
  groups: number;
  /** Elementos por grupo */
  perGroup: number;
  /** Resultado correcto */
  answer: number;
  /** Opciones (incluye la correcta), ya mezcladas */
  options: number[];
}

interface LevelRange {
  maxLevel: number;
  groups: readonly [number, number];
  perGroup: readonly [number, number];
}

/** Progresión: empieza con grupos pequeños y crece de forma gradual (máx. 8 × 8) */
const LEVEL_RANGES: readonly LevelRange[] = [
  { maxLevel: 3, groups: [2, 3], perGroup: [1, 3] },
  { maxLevel: 6, groups: [2, 4], perGroup: [2, 4] },
  { maxLevel: 10, groups: [2, 5], perGroup: [2, 5] },
  { maxLevel: 15, groups: [3, 6], perGroup: [3, 6] },
  { maxLevel: Infinity, groups: [4, 8], perGroup: [3, 8] }
];

export function getMultiplyRange(level: number): LevelRange {
  return LEVEL_RANGES.find(r => level <= r.maxLevel) ?? LEVEL_RANGES[LEVEL_RANGES.length - 1];
}

function randomInt(min: number, max: number, rng: () => number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function shuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Distractores pedagógicos: los errores típicos al aprender a multiplicar
 * (sumar en vez de multiplicar, contar un grupo de más o de menos).
 */
function buildOptions(answer: number, groups: number, perGroup: number, rng: () => number): number[] {
  const candidates = [
    groups + perGroup,
    answer + groups,
    answer - groups,
    answer + perGroup,
    answer - perGroup,
    answer + 1,
    answer - 1
  ];
  const pool = [...new Set(candidates.filter(c => c > 0 && c !== answer))];
  const picked = shuffle(pool, rng).slice(0, 2);

  // Salvaguarda: siempre 3 opciones distintas
  for (let k = 1; picked.length < 2; k++) {
    const extra = answer + k;
    if (extra !== answer && !picked.includes(extra)) picked.push(extra);
  }

  return shuffle([answer, ...picked], rng);
}

export function generateMultiplyProblem(
  level: number,
  previous: { groups: number; perGroup: number } | null = null,
  rng: () => number = Math.random
): MultiplyProblem {
  const range = getMultiplyRange(level);
  let groups = 2;
  let perGroup = 2;

  // Evita repetir el mismo problema dos veces seguidas
  for (let attempt = 0; attempt < 20; attempt++) {
    groups = randomInt(range.groups[0], range.groups[1], rng);
    perGroup = randomInt(range.perGroup[0], range.perGroup[1], rng);
    if (!previous || previous.groups !== groups || previous.perGroup !== perGroup) break;
  }

  const answer = groups * perGroup;
  return { groups, perGroup, answer, options: buildOptions(answer, groups, perGroup, rng) };
}
