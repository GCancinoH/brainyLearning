/**
 * Selector de operaciones SIN repeticiones molestas.
 *
 * Por qué existía el problema: cada operación se sacaba con Math.random()
 * independiente, sobre un rango muy pequeño (p. ej. 4×4 = 16 sumas en los
 * niveles 1-3). Con tan pocas opciones el azar repite seguido, y 3+1 y 1+3
 * contaban como operaciones distintas aunque para una niña son "la misma".
 *
 * Qué hace ahora (estilo "bolsa" de dominó + memoria corta):
 *  1. Agrupa las operaciones en FAMILIAS con `keyOf` (3+1 y 1+3 comparten familia).
 *  2. No repite ninguna familia de las últimas `historySize`.
 *  3. Recorre todas las familias del rango antes de repetir cualquiera.
 *  4. Todas las familias pesan igual (no importa cuántas variantes tenga cada una).
 *
 * Lógica pura, sin Angular.
 */
export type Rng = () => number;

export class ProblemPicker {
  private recent: string[] = [];
  private used = new Set<string>();
  private poolSig = '';

  constructor(private readonly historySize = 5) {}

  /**
   * @param poolSig identifica el rango actual; si cambia, se reinicia la "bolsa"
   *                (la memoria corta se conserva para no repetir al cambiar de nivel)
   * @param pool    todas las operaciones posibles del rango
   * @param keyOf   familia de una operación (p. ej. orden-independiente para sumas)
   */
  next<T>(poolSig: string, pool: readonly T[], keyOf: (p: T) => string, rng: Rng = Math.random): T {
    if (pool.length === 0) throw new Error('ProblemPicker: pool vacío');
    if (poolSig !== this.poolSig) {
      this.poolSig = poolSig;
      this.used.clear();
    }

    const families = new Map<string, T[]>();
    for (const item of pool) {
      const k = keyOf(item);
      const list = families.get(k);
      if (list) list.push(item); else families.set(k, [item]);
    }

    const window = Math.min(this.historySize, families.size - 1);
    const blocked = new Set(window > 0 ? this.recent.slice(-window) : []);

    let candidates = [...families.keys()].filter(k => !blocked.has(k) && !this.used.has(k));
    if (candidates.length === 0) {
      // Ya se vieron todas las familias: empieza otra ronda
      this.used.clear();
      candidates = [...families.keys()].filter(k => !blocked.has(k));
    }
    if (candidates.length === 0) candidates = [...families.keys()];

    const key = candidates[Math.floor(rng() * candidates.length)];
    const variants = families.get(key)!;
    const chosen = variants[Math.floor(rng() * variants.length)];

    this.used.add(key);
    this.recent.push(key);
    if (this.recent.length > 20) this.recent.shift();
    return chosen;
  }

  reset(): void {
    this.recent = [];
    this.used.clear();
    this.poolSig = '';
  }
}

// ---------- Utilidades de rangos (compartidas por sumas, restas y multiplicación) ----------

export type Range = readonly [number, number];

/** Todas las parejas (a, b) con a y b dentro de sus rangos */
export function pairsOf(a: Range, b: Range): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let x = a[0]; x <= a[1]; x++) {
    for (let y = b[0]; y <= b[1]; y++) out.push([x, y]);
  }
  return out;
}

/** Familia que ignora el orden: 3+1 ≡ 1+3, 2×3 ≡ 3×2 */
export const unordered = (p: readonly [number, number]): string =>
  p[0] <= p[1] ? `${p[0]},${p[1]}` : `${p[1]},${p[0]}`;

/** Familia que respeta el orden (restas: 5−2 ≠ 5−3) */
export const ordered = (p: readonly [number, number]): string => `${p[0]},${p[1]}`;
