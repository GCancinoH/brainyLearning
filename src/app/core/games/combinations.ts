/**
 * Combinatorias de pago y de llenado. Lógica pura, sin Angular.
 *
 * Dos modelos distintos, y a propósito:
 *
 *  - `distinctSolutions`: suministro LIMITADO. Hay N piezas y cada una se usa 0 o 1 vez.
 *    Se resuelve por subset-sum sobre máscaras de bits. Lo usa "El Tanque de Combustible",
 *    donde los bloques son finitos y únicos.
 *
 *  - `coinWays`: suministro ILIMITADO. Hay tantas piezas de cada valor como haga falta.
 *    Se recorre contando cuántas hay de cada valor. Lo usa "La Tiendita de Monedas", donde
 *    siempre hay más monedas de $1, $2 y $5 en el cajón.
 *
 * No se comparten por una razón concreta: con monedas de $1, $2 y $5 y objetivo 7, el modelo
 * limitado solo hallaría los subconjuntos de la lista que se le pase, y se le escaparía el
 * 5+2 usando "la misma" moneda de $5 dos veces. Es un fallo silencioso, por eso viven separados.
 */

/** Combinaciones distintas (por valores, ordenadas) que suman exactamente `target`. */
export function distinctSolutions(values: readonly number[], target: number): string[] {
  const seen = new Set<string>();
  const n = values.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let sum = 0;
    const picked: number[] = [];
    for (let i = 0; i < n; i++) {
      if (mask & (1 << i)) {
        sum += values[i];
        picked.push(values[i]);
      }
    }
    if (sum === target) seen.add(picked.sort((a, b) => a - b).join('+'));
  }
  return [...seen];
}

/**
 * Maneras de formar `target` con monedas de `denoms`, sin límite de cantidad.
 *
 * Devuelve strings como '1+1+5'. Cada combinación aparece UNA sola vez: se recorre contando
 * monedas de cada denominación en orden ascendente, lo que produce directamente la forma
 * canónica sin un set de permutaciones.
 *
 * Con `target <= 15` y 4 denominaciones es instantáneo: no hace falta memoizar.
 */
export function coinWays(denoms: readonly number[], target: number): string[] {
  if (target <= 0) return [];
  const ds = [...new Set(denoms)].filter(d => d > 0).sort((a, b) => a - b);
  if (ds.length === 0) return [];

  const out: string[] = [];

  const walk = (i: number, left: number, acc: readonly number[]): void => {
    if (left === 0) {
      out.push(acc.join('+'));
      return;
    }
    if (i >= ds.length) return;
    const d = ds[i]!; // non-null assertion: `i` ya está acotado arriba
    for (let k = 0; k * d <= left; k++) {
      // Se appendizan k copias de d, no una: si solo se añadiera una, el acumulador
      // describiría una combinación distinta de la que realmente suma `left`.
      const next = k === 0 ? acc : [...acc, ...Array<number>(k).fill(d)];
      walk(i + 1, left - k * d, next);
    }
  };

  walk(0, target, []);
  return out;
}