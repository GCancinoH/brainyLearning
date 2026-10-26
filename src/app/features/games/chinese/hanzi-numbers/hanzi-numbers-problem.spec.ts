import { describe, it, expect } from 'vitest';
import {
  PIEZAS,
  NIVEL_ULTIMO_RECONOCER,
  buildCombinacionProblem,
  buildReconocerProblem,
  etapaDeNivel,
  hanziPara,
  leer,
  piezasDe,
  topeReconocer,
} from './hanzi-numbers-problem';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Todas las secuencias de 1 a `maxLen` piezas, sin repetir pieza.
 *
 * Hasta 3 basta: `leer` compara contra escrituras de a lo sumo 3 caracteres, así que
 * cualquier montaje más largo ni siquiera puede coincidir. Sin ese corte, enumerar todo
 * subconjunto de una bandeja de 10 serían 10! combinaciones y la prueba no terminaría.
 */
function secuencias(piezas: readonly string[], maxLen: number): string[][] {
  const out: string[][] = [];
  const n = piezas.length;
  const recursiva = (actuales: string[], usados: Set<number>): void => {
    if (actuales.length > 0) out.push([...actuales]);
    if (actuales.length === maxLen) return;
    for (let i = 0; i < n; i++) {
      if (usados.has(i)) continue;
      usados.add(i);
      actuales.push(piezas[i]);
      recursiva(actuales, usados);
      actuales.pop();
      usados.delete(i);
    }
  };
  recursiva([], new Set());
  return out;
}

describe('hanziPara / leer / piezasDe', () => {
  it('la tabla del 1 al 20, que es lo que hay que aprender', () => {
    const esperado: Record<number, string> = {
      1: '一',
      2: '二',
      3: '三',
      4: '四',
      5: '五',
      6: '六',
      7: '七',
      8: '八',
      9: '九',
      10: '十',
      11: '十一',
      12: '十二',
      15: '十五',
      19: '十九',
      20: '二十',
    };
    for (const [n, hanzi] of Object.entries(esperado)) {
      expect(hanziPara(Number(n)), `el ${n}`).toBe(hanzi);
    }
  });

  it('los números grandes llevan la decena en medio: 35 → 三十五, 99 → 九十九', () => {
    expect(hanziPara(21)).toBe('二十一');
    expect(hanziPara(35)).toBe('三十五');
    expect(hanziPara(40)).toBe('四十');
    expect(hanziPara(99)).toBe('九十九');
  });

  it('fuera de 1–99 es error, no un número recortado en silencio', () => {
    expect(() => hanziPara(0)).toThrow(RangeError);
    expect(() => hanziPara(100)).toThrow(RangeError);
    expect(() => hanziPara(7.5)).toThrow(RangeError);
  });

  it('ida y vuelta: leer lo que se escribe devuelve el número, del 1 al 99', () => {
    for (let n = 1; n <= 99; n++) {
      const piezas = piezasDe(n);
      expect(leer(piezas), `lee ${piezas.join('')}`).toBe(n);
    }
  });

  it('cada pieza es un solo carácter de los diez admitidos', () => {
    for (let n = 1; n <= 99; n++) {
      const piezas = piezasDe(n);
      for (const p of piezas) expect(PIEZAS).toContain(p);
    }
  });

  it('el orden cambia el número: 五十三 se lee y es 53, no 35', () => {
    expect(leer(['五', '十', '三'])).toBe(53);
    expect(leer(['三', '十', '五'])).toBe(35);
    expect(leer(['十'])).toBe(10);
    expect(leer(['十', '五'])).toBe(15);
  });

  it('solo se lee la forma canónica: sin 十 no hay número, y el uno de más no vale', () => {
    expect(leer(['三', '五']), '三五 no es una lectura').toBeNull();
    expect(leer(['一', '十', '五']), 'en chino quince es 十五, no 一十五').toBeNull();
    expect(leer(['一', '十']), 'diez es 十, no 一十').toBeNull();
    expect(leer([]), 'nada que leer').toBeNull();
    expect(leer(['十', '十']), 'un solo 十 en la bandeja, pero además no se lee').toBeNull();
  });
});

describe('etapaDeNivel', () => {
  it('reconoce hasta el nivel 6 y combina a partir del 7', () => {
    expect(etapaDeNivel(1)).toBe('reconocer');
    expect(etapaDeNivel(NIVEL_ULTIMO_RECONOCER)).toBe('reconocer');
    expect(etapaDeNivel(NIVEL_ULTIMO_RECONOCER + 1)).toBe('combinar');
    expect(etapaDeNivel(12)).toBe('combinar');
  });

  it('el tramo de reconocer crece con el nivel hasta el 20', () => {
    expect(topeReconocer(1)).toBe(5);
    expect(topeReconocer(3)).toBe(10);
    expect(topeReconocer(5)).toBe(15);
    expect(topeReconocer(7)).toBe(20);
    expect(topeReconocer(99), 'el techo es el 20').toBe(20);
  });
});

describe('buildReconocerProblem', () => {
  it('las 4 opciones son distintas, están en el tramo y una es la correcta', () => {
    const rng = mulberry32(11);
    for (let level = 1; level <= 10; level++) {
      const tope = topeReconocer(level);
      for (let i = 0; i < 200; i++) {
        const p = buildReconocerProblem(level, rng);
        expect(p.numero).toBeGreaterThanOrEqual(1);
        expect(p.numero).toBeLessThanOrEqual(tope);
        expect(p.opciones, 'cuatro opciones').toHaveLength(4);
        expect(new Set(p.opciones).size, 'nunca repetidas').toBe(4);
        expect(p.opciones, 'la respuesta está entre las opciones').toContain(p.respuesta);
      }
    }
  });

  it('la dirección decide qué se muestra y qué se elige', () => {
    const rng = mulberry32(3);
    let vioNumero = 0;
    let vioHanzi = 0;
    for (let i = 0; i < 400; i++) {
      const p = buildReconocerProblem(5, rng);
      const esHanzi = p.direccion === 'numero-a-hanzi';
      if (esHanzi) vioNumero++;
      else vioHanzi++;

      // Se muestra el número y se elige el hanzi…
      expect(p.enunciado).toBe(esHanzi ? String(p.numero) : hanziPara(p.numero));
      expect(p.respuesta).toBe(esHanzi ? hanziPara(p.numero) : String(p.numero));
      // …y las opciones van todas en la misma forma que la respuesta.
      for (const o of p.opciones) {
        if (esHanzi) expect(o).toMatch(/^[一二三四五六七八九十]+$/);
        else expect(o).toMatch(/^\d+$/);
      }
    }
    expect(vioNumero, 'las dos direcciones aparecen').toBeGreaterThan(100);
    expect(vioHanzi, 'las dos direcciones aparecen').toBeGreaterThan(100);
  });

  it('con la misma semilla sale el mismo problema', () => {
    const a = buildReconocerProblem(4, mulberry32(77));
    const b = buildReconocerProblem(4, mulberry32(77));
    expect(a).toEqual(b);
  });
});

/**
 * Cuenta cuántas veces aparece cada carácter. Para comparar la bandeja con la solución:
 * 二十二 pide dos veces la 二, y esa repetición es legítima.
 */
function multicontenido(piezas: readonly string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of piezas) m.set(p, (m.get(p) ?? 0) + 1);
  return m;
}

describe('buildCombinacionProblem', () => {
  it('la solución se lee y es el objetivo, y la bandeja la trae entera', () => {
    const rng = mulberry32(5);
    for (const age of [4, 6] as const) {
      for (let level = 7; level <= 12; level++) {
        for (let i = 0; i < 150; i++) {
          const p = buildCombinacionProblem(level, age, rng);
          expect(leer(p.solucion), `${p.objetivo} = ${p.solucion.join('')}`).toBe(p.objetivo);

          const enBandeja = multicontenido(p.bandeja);
          const enSolucion = multicontenido(p.solucion);

          // Lo que pide la escritura está, con sus repeticiones: 二十二 pide dos 二.
          for (const [pieza, cuantas] of enSolucion) {
            expect(
              enBandeja.get(pieza) ?? 0,
              `la bandeja trae ${cuantas}× ${pieza} para ${p.objetivo}`,
            ).toBeGreaterThanOrEqual(cuantas);
          }
          // Y **nada más**: un carácter que no va en la solución es distractor, y solo
          // puede haber un ejemplar. Si hubiera copias de sobra —o un segundo 十—,
          // dos dieces ya servirían para casi cualquier número y "la combinación
          // exacta" dejaría de ser exacta.
          for (const [pieza, cuantas] of enBandeja) {
            const pide = enSolucion.get(pieza);
            expect(
              cuantas,
              `${pieza} aparece ${cuantas} veces en ${p.bandeja.join('')}`,
            ).toBe(pide === undefined ? 1 : pide);
          }
        }
      }
    }
  });

  it('el objetivo respeta el tramo de su edad y su nivel', () => {
    const rng = mulberry32(9);
    for (let i = 0; i < 400; i++) {
      const c4 = buildCombinacionProblem(7, 4, rng);
      expect(c4.objetivo).toBeGreaterThanOrEqual(11);
      expect(c4.objetivo).toBeLessThanOrEqual(30);

      const c6 = buildCombinacionProblem(12, 6, rng);
      expect(c6.objetivo).toBeGreaterThanOrEqual(41);
      expect(c6.objetivo).toBeLessThanOrEqual(99);
    }
  });

  /**
   * LA regla del juego: de toda la bandeja, **una sola** secuencia lee el objetivo.
   *
   * Si hubiera dos, "agarrar la combinación exacta" sería una moneda al aire en vez de
   * una respuesta. Se comprueba por fuerza bruta, no por fe.
   */
  it('la combinación exacta: una sola construcción de la bandeja lee el objetivo', () => {
    const rng = mulberry32(21);
    const casos: Array<[4 | 6, number]> = [
      [4, 7],
      [4, 12],
      [6, 7],
      [6, 9],
      [6, 12],
    ];
    for (const [age, level] of casos) {
      for (let i = 0; i < 25; i++) {
        const p = buildCombinacionProblem(level, age, rng);
        // Se comparan LECTURAS, no índices: en 二十二 las dos piezas 二 son distintas
        // piezas pero escriben lo mismo, y eso es una sola respuesta.
        const construcciones = new Set(
          secuencias(p.bandeja, 3)
            .filter(s => leer(s) === p.objetivo)
            .map(s => s.join('')),
        );
        expect(
          [...construcciones],
          `${age}a·N${level}: ${p.objetivo} debería leerse solo como ${p.solucion.join('')}`,
        ).toEqual([p.solucion.join('')]);
      }
    }
  });

  it('con la misma semilla sale el mismo problema', () => {
    const a = buildCombinacionProblem(9, 6, mulberry32(42));
    const b = buildCombinacionProblem(9, 6, mulberry32(42));
    expect(a).toEqual(b);
  });
});
