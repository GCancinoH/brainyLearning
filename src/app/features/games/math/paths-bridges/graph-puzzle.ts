/**
 * "Caminos y puentes" (topología y grafos). Lógica pura, sin Angular.
 *
 * 4 años ('trail'): la rana va del punto de inicio a su casa sin pisar caminos rojos.
 * 6 años ('euler'): recorrer TODOS los puentes exactamente una vez (camino de Euler).
 *                   Desde el nivel 8 a veces el mapa no tiene solución y hay que descubrirlo.
 *
 * Todos los mapas viven en una cuadrícula y solo se conectan puntos vecinos
 * (horizontal / vertical), así que las líneas nunca se cruzan.
 */

export type Rng = () => number;
export type PuzzleMode = 'trail' | 'euler';

export interface GNode {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
}

export interface GEdge {
  id: number;
  a: number;
  b: number;
  /** 'safe' = camino/puente normal · 'danger' = línea roja (solo en 'trail') */
  kind: 'safe' | 'danger';
}

export interface Puzzle {
  mode: PuzzleMode;
  cols: number;
  rows: number;
  /** Tamaño del lienzo SVG */
  width: number;
  height: number;
  nodes: GNode[];
  edges: GEdge[];
  /** 'trail': punto de inicio. 'euler': -1 (se puede empezar en cualquier punto) */
  start: number;
  /** 'trail': la casa. 'euler': -1 */
  goal: number;
  /** 'euler': ¿existe un recorrido que use cada puente una sola vez? */
  possible: boolean;
}

export const SPACING = 24;
export const PAD = 14;

const clampLevel = (level: number) => Math.max(1, Math.min(level, 10));

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

// ---------- Cuadrícula ----------

const nodeId = (col: number, row: number, cols: number) => row * cols + col;

function layout(cols: number, rows: number): GNode[] {
  const out: GNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      out.push({ id: nodeId(col, row, cols), col, row, x: PAD + col * SPACING, y: PAD + row * SPACING });
    }
  }
  return out;
}

/** Todas las parejas de puntos vecinos de la cuadrícula */
function gridPairs(cols: number, rows: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (col + 1 < cols) out.push([nodeId(col, row, cols), nodeId(col + 1, row, cols)]);
      if (row + 1 < rows) out.push([nodeId(col, row, cols), nodeId(col, row + 1, cols)]);
    }
  }
  return out;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

function canvas(cols: number, rows: number) {
  return { width: 2 * PAD + (cols - 1) * SPACING, height: 2 * PAD + (rows - 1) * SPACING };
}

/** Deja solo los puntos que tienen algún camino (más los que se pidan conservar) */
function pruneNodes(all: GNode[], edges: GEdge[], keep: number[] = []): GNode[] {
  const used = new Set<number>(keep);
  edges.forEach(e => { used.add(e.a); used.add(e.b); });
  return all.filter(n => used.has(n.id));
}

// ---------- Utilidades de grafos (públicas: las usan el componente y las pruebas) ----------

export function edgeBetween(edges: readonly GEdge[], a: number, b: number): GEdge | undefined {
  return edges.find(e => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

export function degrees(edges: readonly GEdge[]): Map<number, number> {
  const d = new Map<number, number>();
  for (const e of edges) {
    d.set(e.a, (d.get(e.a) ?? 0) + 1);
    d.set(e.b, (d.get(e.b) ?? 0) + 1);
  }
  return d;
}

/** Puntos donde llega un número impar de líneas */
export function oddNodes(edges: readonly GEdge[]): number[] {
  return [...degrees(edges)].filter(([, deg]) => deg % 2 === 1).map(([id]) => id).sort((x, y) => x - y);
}

export function isConnected(edges: readonly GEdge[]): boolean {
  if (edges.length === 0) return true;
  const adj = new Map<number, number[]>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const seen = new Set<number>([edges[0].a]);
  const stack = [edges[0].a];
  while (stack.length) {
    for (const n of adj.get(stack.pop()!) ?? []) {
      if (!seen.has(n)) { seen.add(n); stack.push(n); }
    }
  }
  return seen.size === adj.size;
}

/** Hay recorrido de Euler si está conectado y tiene 0 o 2 puntos impares */
export function hasEulerPath(edges: readonly GEdge[]): boolean {
  const odd = oddNodes(edges).length;
  return isConnected(edges) && (odd === 0 || odd === 2);
}

/** Un recorrido de Euler (Hierholzer) como lista de puntos, o null si no existe */
export function eulerTrail(edges: readonly GEdge[]): number[] | null {
  if (edges.length === 0 || !hasEulerPath(edges)) return null;
  const odd = oddNodes(edges);
  const start = odd.length ? odd[0] : edges[0].a;
  const adj = new Map<number, Array<{ to: number; id: number }>>();
  for (const e of edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push({ to: e.b, id: e.id });
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push({ to: e.a, id: e.id });
  }
  const used = new Set<number>();
  const stack = [start];
  const out: number[] = [];
  while (stack.length) {
    const v = stack[stack.length - 1];
    const next = adj.get(v)!.find(x => !used.has(x.id));
    if (next) {
      used.add(next.id);
      stack.push(next.to);
    } else {
      out.push(stack.pop()!);
    }
  }
  return out.reverse();
}

/** ¿Se puede llegar de `from` a `to` usando solo caminos seguros? */
export function safeReachable(edges: readonly GEdge[], from: number, to: number): boolean {
  const seen = new Set<number>([from]);
  const stack = [from];
  while (stack.length) {
    const v = stack.pop()!;
    if (v === to) return true;
    for (const e of edges) {
      if (e.kind !== 'safe') continue;
      const other = e.a === v ? e.b : e.b === v ? e.a : -1;
      if (other >= 0 && !seen.has(other)) { seen.add(other); stack.push(other); }
    }
  }
  return false;
}

// ---------- 4 años: la rana y su casa ----------

export function buildTrailPuzzle(level: number, rng: Rng = Math.random): Puzzle {
  const lvl = clampLevel(level);
  const [cols, rows] = lvl <= 2 ? [3, 2] : lvl <= 4 ? [3, 3] : lvl <= 7 ? [4, 3] : [4, 4];
  const start = nodeId(0, randInt(0, rows - 1, rng), cols);
  const goalRow = randInt(0, rows - 1, rng);
  const goal = nodeId(cols - 1, goalRow, cols);
  const startRow = Math.floor(start / cols);
  const manhattan = cols - 1 + Math.abs(startRow - goalRow);
  const extra = lvl <= 2 ? 0 : lvl <= 4 ? 2 : lvl <= 7 ? 4 : 6;

  const pairs = gridPairs(cols, rows);
  const adj = new Map<number, number[]>();
  for (const [a, b] of pairs) {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
    (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
  }

  const path = randomPath(adj, start, goal, cols, manhattan, manhattan + extra, rng);
  const onPath = new Set<string>();
  for (let i = 0; i + 1 < path.length; i++) onPath.add(pairKey(path[i], path[i + 1]));

  const pDanger = Math.min(0.75, 0.3 + lvl * 0.05);
  const pDecoy = lvl <= 2 ? 0.1 : 0.25;
  const edges: GEdge[] = [];
  const others: GEdge[] = [];
  for (const [a, b] of pairs) {
    if (onPath.has(pairKey(a, b))) {
      edges.push({ id: edges.length + others.length, a, b, kind: 'safe' });
      continue;
    }
    const roll = rng();
    const kind = roll < pDanger ? 'danger' : roll < pDanger + pDecoy ? 'safe' : null;
    if (kind) others.push({ id: -1, a, b, kind });
  }
  let all = [...edges, ...others];

  // Siempre al menos una línea roja (desde el nivel 2) para que haya algo que evitar
  if (lvl >= 2 && !all.some(e => e.kind === 'danger')) {
    const touching = gridPairs(cols, rows).filter(([a, b]) =>
      !onPath.has(pairKey(a, b)) && (path.includes(a) || path.includes(b)));
    const [a, b] = shuffle(touching, rng)[0] ?? [-1, -1];
    if (a >= 0) {
      all = all.filter(e => pairKey(e.a, e.b) !== pairKey(a, b));
      all.push({ id: -1, a, b, kind: 'danger' });
    }
  }
  all = all.map((e, id) => ({ ...e, id }));

  return {
    mode: 'trail', cols, rows, ...canvas(cols, rows),
    nodes: pruneNodes(layout(cols, rows), all, [start, goal]),
    edges: all, start, goal, possible: true
  };
}

/** Camino aleatorio sin repetir puntos de `start` a `goal` con longitud (en pasos) entre lo y hi */
function randomPath(
  adj: Map<number, number[]>, start: number, goal: number, cols: number, lo: number, hi: number, rng: Rng
): number[] {
  const goalCol = goal % cols;
  const goalRow = Math.floor(goal / cols);
  const dist = (n: number) => Math.abs((n % cols) - goalCol) + Math.abs(Math.floor(n / cols) - goalRow);
  let budget = 4000;

  const dfs = (path: number[]): number[] | null => {
    if (budget-- <= 0) return null;
    const here = path[path.length - 1];
    const steps = path.length - 1;
    if (here === goal) return steps >= lo ? path : null;
    for (const next of shuffle(adj.get(here) ?? [], rng)) {
      if (path.includes(next)) continue;
      if (steps + 1 + dist(next) > hi) continue;
      const found = dfs([...path, next]);
      if (found) return found;
    }
    return null;
  };

  return dfs([start]) ?? shortestPath(adj, start, goal);
}

function shortestPath(adj: Map<number, number[]>, start: number, goal: number): number[] {
  const prev = new Map<number, number>([[start, -1]]);
  const queue = [start];
  while (queue.length) {
    const v = queue.shift()!;
    if (v === goal) break;
    for (const n of adj.get(v) ?? []) {
      if (!prev.has(n)) { prev.set(n, v); queue.push(n); }
    }
  }
  const out: number[] = [];
  for (let v = goal; v !== -1; v = prev.get(v) ?? -1) out.push(v);
  return out.reverse();
}

// ---------- 6 años: los puentes ----------

const EULER_EDGES = [5, 5, 6, 7, 8, 8, 9, 10, 11, 12];

export function buildEulerPuzzle(level: number, rng: Rng = Math.random): Puzzle {
  const lvl = clampLevel(level);
  const [cols, rows] = lvl <= 3 ? [3, 2] : lvl <= 6 ? [3, 3] : [4, 3];
  const target = EULER_EDGES[lvl - 1];
  const pairs = gridPairs(cols, rows);

  // Recorrido aleatorio sin repetir puentes: el mapa resultante siempre tiene solución
  let best: Array<[number, number]> = [];
  for (let attempt = 0; attempt < 300 && best.length < target; attempt++) {
    const used = new Set<string>();
    const trail: Array<[number, number]> = [];
    let here = randInt(0, cols * rows - 1, rng);
    while (trail.length < target) {
      const options = pairs.filter(([a, b]) => !used.has(pairKey(a, b)) && (a === here || b === here));
      if (!options.length) break;
      const [a, b] = options[Math.floor(rng() * options.length)];
      used.add(pairKey(a, b));
      trail.push([a, b]);
      here = a === here ? b : a;
    }
    if (trail.length > best.length) best = trail;
  }

  let edges: GEdge[] = best.map(([a, b], id) => ({ id, a, b, kind: 'safe' }));
  let possible = true;

  // Desde el nivel 8, a veces el mapa no tiene solución (4 o más puntos impares)
  if (lvl >= 8 && rng() < 0.3) {
    const present = new Set<number>();
    edges.forEach(e => { present.add(e.a); present.add(e.b); });
    const have = new Set(edges.map(e => pairKey(e.a, e.b)));
    for (const [a, b] of shuffle(pairs, rng)) {
      if (have.has(pairKey(a, b)) || !(present.has(a) || present.has(b))) continue;
      edges = [...edges, { id: edges.length, a, b, kind: 'safe' }];
      present.add(a); present.add(b);
      if (oddNodes(edges).length >= 4) break;
    }
    possible = hasEulerPath(edges);
  }

  return {
    mode: 'euler', cols, rows, ...canvas(cols, rows),
    nodes: pruneNodes(layout(cols, rows), edges),
    edges, start: -1, goal: -1, possible
  };
}

export function buildPuzzle(level: number, age: number, rng: Rng = Math.random): Puzzle {
  return age <= 4 ? buildTrailPuzzle(level, rng) : buildEulerPuzzle(level, rng);
}
