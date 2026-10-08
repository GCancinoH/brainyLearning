/**
 * "Clasificador de bloques lógicos" (teoría de conjuntos, estilo bloques de Dienes).
 * Lógica pura, sin Angular, para poder probarla aparte.
 *
 * 4 años: clasificar por UNA propiedad (una canasta, y luego dos canastas).
 * 6 años: diagrama de Venn con dos conjuntos, incluida la intersección.
 */

export type Shape = 'circle' | 'square' | 'triangle';
export type Color = 'red' | 'blue' | 'yellow';
export type Size = 'big' | 'small';

export interface Block {
  id: number;
  shape: Shape;
  color: Color;
  size: Size;
}

export type Attr =
  | { kind: 'color'; value: Color }
  | { kind: 'shape'; value: Shape }
  | { kind: 'size'; value: Size };

export type AttrKind = Attr['kind'];

/** 'one' = una canasta · 'two' = dos canastas · 'venn' = diagrama de Venn */
export type RoundMode = 'one' | 'two' | 'venn';
export type Region = 'basket' | 'A' | 'B' | 'both' | 'none';

export interface Round {
  mode: RoundMode;
  /** 'one': la regla. 'two' y 'venn': el conjunto A */
  a: Attr;
  /** Solo 'two' y 'venn': el conjunto B */
  b: Attr | null;
  blocks: Block[];
}

export type Rng = () => number;

export const SHAPES: readonly Shape[] = ['circle', 'square', 'triangle'];
export const COLORS: readonly Color[] = ['red', 'blue', 'yellow'];
export const SIZES: readonly Size[] = ['big', 'small'];

const VALUES: Record<AttrKind, readonly string[]> = { color: COLORS, shape: SHAPES, size: SIZES };

export function matches(block: Block, attr: Attr): boolean {
  return block[attr.kind] === attr.value;
}

/** A qué región pertenece una figura. `null` = no debe colocarse (modo 'one' y no cumple la regla). */
export function regionOf(round: Round, block: Block): Region | null {
  switch (round.mode) {
    case 'one':
      return matches(block, round.a) ? 'basket' : null;
    case 'two':
      return matches(block, round.a) ? 'A' : 'B';
    case 'venn': {
      const inA = matches(block, round.a);
      const inB = matches(block, round.b!);
      return inA && inB ? 'both' : inA ? 'A' : inB ? 'B' : 'none';
    }
  }
}

/** Figuras que la niña tiene que mover (en 'one' solo las que cumplen la regla) */
export function blocksToPlace(round: Round): Block[] {
  return round.blocks.filter(b => regionOf(round, b) !== null);
}

// ---------- Textos (español) ----------

const COLOR_PLURAL: Record<Color, string> = { red: 'rojas', blue: 'azules', yellow: 'amarillas' };
const COLOR_SINGULAR: Record<Color, string> = { red: 'roja', blue: 'azul', yellow: 'amarilla' };
const SHAPE_PLURAL: Record<Shape, string> = { circle: 'círculos', square: 'cuadrados', triangle: 'triángulos' };
const SHAPE_SINGULAR: Record<Shape, string> = { circle: 'un círculo', square: 'un cuadrado', triangle: 'un triángulo' };
const SIZE_PLURAL: Record<Size, string> = { big: 'grandes', small: 'pequeñas' };
const SIZE_SINGULAR: Record<Size, string> = { big: 'grande', small: 'pequeña' };

/** "Figuras rojas", "Círculos", "Figuras grandes" */
export function label(attr: Attr): string {
  switch (attr.kind) {
    case 'color': return `Figuras ${COLOR_PLURAL[attr.value]}`;
    case 'shape': return capitalize(SHAPE_PLURAL[attr.value]);
    case 'size': return `Figuras ${SIZE_PLURAL[attr.value]}`;
  }
}

/** "roja", "un círculo", "grande" (para preguntar "¿Es …?") */
export function predicate(attr: Attr): string {
  switch (attr.kind) {
    case 'color': return COLOR_SINGULAR[attr.value];
    case 'shape': return SHAPE_SINGULAR[attr.value];
    case 'size': return SIZE_SINGULAR[attr.value];
  }
}

export const COLOR_HEX: Record<Color, string> = { red: '#ef4444', blue: '#3b82f6', yellow: '#facc15' };

/** Descripción accesible de una figura */
export function describeBlock(b: Block): string {
  const shape = { circle: 'círculo', square: 'cuadrado', triangle: 'triángulo' }[b.shape];
  const color = { red: 'rojo', blue: 'azul', yellow: 'amarillo' }[b.color];
  return `${shape} ${color} ${b.size === 'big' ? 'grande' : 'pequeño'}`;
}

/** Pregunta socrática (método Zvonkin): no dice la respuesta, guía a mirar las propiedades */
export function hintFor(round: Round): string {
  switch (round.mode) {
    case 'one':
      return `Mira la figura: ¿es ${predicate(round.a)}? 🤔`;
    case 'two':
      return `Mira la figura: ¿es ${predicate(round.a)}? ¿A qué canasta va? 🤔`;
    case 'venn':
      return `¿Es ${predicate(round.a)}? ¿Es ${predicate(round.b!)}? ¿Dónde vive una figura que es…? 🤔`;
  }
}

// ---------- Diagrama de Venn: geometría ----------

/** Centros y radio como fracción del ancho W; la altura H = 0.6 W */
export const VENN = { ax: 0.38, bx: 0.62, cy: 0.5, r: 0.26 } as const;

/** Región de Venn bajo un punto (px relativos al contenedor). `null` = fuera de los dos círculos. */
export function vennRegionAt(x: number, y: number, W: number, H: number): 'A' | 'both' | 'B' | null {
  const r = VENN.r * W;
  const inA = Math.hypot(x - VENN.ax * W, y - VENN.cy * H) <= r;
  const inB = Math.hypot(x - VENN.bx * W, y - VENN.cy * H) <= r;
  return inA && inB ? 'both' : inA ? 'A' : inB ? 'B' : null;
}

// ---------- Generación ----------

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min: number, max: number, rng: Rng): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function attrOf(kind: AttrKind, value: string): Attr {
  return { kind, value } as Attr;
}

/** Todas las figuras posibles, restringidas por lo que se fije */
function universe(fixed: Partial<Pick<Block, 'shape' | 'color' | 'size'>>, sizes: readonly Size[]): Omit<Block, 'id'>[] {
  const out: Omit<Block, 'id'>[] = [];
  for (const shape of fixed.shape ? [fixed.shape] : SHAPES) {
    for (const color of fixed.color ? [fixed.color] : COLORS) {
      for (const size of fixed.size ? [fixed.size] : sizes) out.push({ shape, color, size });
    }
  }
  return out;
}

function withIds(blocks: Omit<Block, 'id'>[], rng: Rng): Block[] {
  return shuffle(blocks, rng).map((b, id) => ({ ...b, id }));
}

/** Toma `count` figuras de `pool` (con repetición, evitando que una salga más de 2 veces si hay opciones) */
function sample(pool: Omit<Block, 'id'>[], count: number, rng: Rng): Omit<Block, 'id'>[] {
  const out: Omit<Block, 'id'>[] = [];
  const uses = new Map<string, number>();
  const key = (b: Omit<Block, 'id'>) => `${b.shape}|${b.color}|${b.size}`;
  for (let i = 0; i < count; i++) {
    const open = pool.filter(b => (uses.get(key(b)) ?? 0) < 2);
    const b = pick(open.length ? open : pool, rng);
    uses.set(key(b), (uses.get(key(b)) ?? 0) + 1);
    out.push(b);
  }
  return out;
}

export function buildRound(level: number, age: number, rng: Rng = Math.random): Round {
  const lvl = Math.max(1, Math.min(level, 10));
  return age <= 4 ? buildYoungRound(lvl, rng) : buildVennRound(lvl, rng);
}

/** 4 años: una sola propiedad a la vez */
function buildYoungRound(lvl: number, rng: Rng): Round {
  // Niveles 1-2: solo color (todas círculos). 3-4: solo forma (todas del mismo color).
  // 5-7: figuras mezcladas, una regla. 8-10: dos canastas.
  if (lvl <= 7) {
    const kind: AttrKind = lvl <= 2 ? 'color' : lvl <= 4 ? 'shape' : pick<AttrKind>(['color', 'shape'], rng);
    const value = pick(VALUES[kind], rng);
    const a = attrOf(kind, value);

    const fixed: Partial<Pick<Block, 'shape' | 'color' | 'size'>> = {};
    if (lvl <= 2) fixed.shape = 'circle';
    if (lvl >= 3 && lvl <= 4) fixed.color = pick(COLORS, rng);
    const all = universe(fixed, ['big']);
    const yes = all.filter(b => matches({ ...b, id: 0 }, a));
    const no = all.filter(b => !matches({ ...b, id: 0 }, a));

    const total = lvl <= 2 ? 6 : lvl <= 4 ? 6 : 8;
    const targets = lvl <= 2 ? randInt(2, 3, rng) : randInt(3, 4, rng);
    return {
      mode: 'one', a, b: null,
      blocks: withIds([...sample(yes, targets, rng), ...sample(no, total - targets, rng)], rng)
    };
  }

  // Dos canastas: dos valores de la misma propiedad; la otra propiedad varía
  const kind: AttrKind = pick<AttrKind>(['color', 'shape'], rng);
  const [v1, v2] = shuffle(VALUES[kind], rng).slice(0, 2);
  const a = attrOf(kind, v1);
  const b = attrOf(kind, v2);
  const pool = universe({}, ['big']).filter(x => x[kind] === v1 || x[kind] === v2);
  const inA = pool.filter(x => x[kind] === v1);
  const inB = pool.filter(x => x[kind] === v2);
  const total = lvl === 8 ? 6 : lvl === 9 ? 7 : 8;
  const nA = Math.floor(total / 2) + (rng() < 0.5 ? 0 : 1) - (total % 2 === 0 && rng() < 0.5 ? 1 : 0);
  const countA = Math.max(2, Math.min(total - 2, nA));
  return {
    mode: 'two', a, b,
    blocks: withIds([...sample(inA, countA, rng), ...sample(inB, total - countA, rng)], rng)
  };
}

/** 6 años: diagrama de Venn. A y B son de propiedades distintas, así la intersección existe. */
function buildVennRound(lvl: number, rng: Rng): Round {
  const kinds: AttrKind[] = lvl <= 6 ? ['color', 'shape'] : ['color', 'shape', 'size'];
  const [ka, kb] = shuffle(kinds, rng).slice(0, 2);
  const a = attrOf(ka, pick(VALUES[ka], rng));
  const b = attrOf(kb, pick(VALUES[kb], rng));

  const sizes: readonly Size[] = lvl <= 6 ? ['big'] : SIZES;
  const all = universe({}, sizes);
  const test = (x: Omit<Block, 'id'>) => ({ a: matches({ ...x, id: 0 }, a), b: matches({ ...x, id: 0 }, b) });
  const aOnly = all.filter(x => test(x).a && !test(x).b);
  const both = all.filter(x => test(x).a && test(x).b);
  const bOnly = all.filter(x => !test(x).a && test(x).b);
  const none = all.filter(x => !test(x).a && !test(x).b);

  // Cada región con figuras desde el principio; "fuera" desde el nivel 4
  const withNone = lvl >= 4;
  const extra = lvl <= 3 ? 0 : lvl <= 6 ? 1 : lvl <= 8 ? 2 : 3;
  const counts = {
    aOnly: 1 + (extra > 0 && rng() < 0.7 ? 1 : 0),
    both: 1 + (extra > 1 && rng() < 0.5 ? 1 : 0),
    bOnly: 1 + (extra > 0 && rng() < 0.7 ? 1 : 0),
    none: withNone ? 1 + (extra > 1 ? 1 : 0) : 0
  };
  const blocks = [
    ...sample(aOnly, counts.aOnly, rng),
    ...sample(both, counts.both, rng),
    ...sample(bOnly, counts.bOnly, rng),
    ...(withNone ? sample(none, counts.none, rng) : [])
  ];
  return { mode: 'venn', a, b, blocks: withIds(blocks, rng) };
}
