export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Devuelve el índice del hueco al que se suelta una pieza, o -1.
 *
 * Cada hueco se agranda `margin` px (dedos pequeños). Si el punto cae en varios huecos
 * agrandados —pasa en 明, con huecos de 84 px y centros a 134 px— gana el de centro más
 * cercano; en empate, el de índice menor.
 */
export function nearestSlot(boxes: readonly Box[], x: number, y: number, margin = 40): number {
  let best = -1;
  let bestDist = Infinity;
  boxes.forEach((r, i) => {
    const inside =
      x >= r.left - margin && x <= r.right + margin && y >= r.top - margin && y <= r.bottom + margin;
    if (!inside) return;
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    const d = (x - cx) ** 2 + (y - cy) ** 2;
    if (d < bestDist) {
      best = i;
      bestDist = d;
    }
  });
  return best;
}
