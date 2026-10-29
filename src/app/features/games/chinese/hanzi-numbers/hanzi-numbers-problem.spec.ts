import { describe, it, expect } from 'vitest';
import { getProfileDifficultyConfig } from '@core/learning/learning-content';
import {
  PIEZAS,
  NIVEL_ULTIMO_RECONOCER,
  buildCombinacionProblem,
  buildReconocerProblem,
  etapaDeNivel,
  hanziPara,
  leer,
  perillaCombinar,
  piezasDe,
  topeReconocer,
  type ReconocerProblem,
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

  it('el tramo crece hasta el 20 en el nivel 4: dentro de la etapa, no después', () => {
    // Antes el tope 20 llegaba con el nivel ≥ 7 —y la etapa terminaba en el 6—, así que
    // 16–20 jamás se practicaba. Ahora cada nivel tiene su tramo y el 20 se juega en N4.
    expect(topeReconocer(1), 'N1').toBe(5);
    expect(topeReconocer(2), 'N2').toBe(10);
    expect(topeReconocer(3), 'N3').toBe(15);
    expect(topeReconocer(4), 'N4 llega al 20').toBe(20);
    expect(topeReconocer(5), 'N5: el tope ya no sube, suben los distractores').toBe(20);
    expect(topeReconocer(6), 'N6: ídem').toBe(20);
    expect(topeReconocer(NIVEL_ULTIMO_RECONOCER), 'el techo sigue siendo el 20').toBe(20);
    expect(topeReconocer(7), 'fuera de la etapa no rompe').toBe(20);
    expect(topeReconocer(99), 'el techo es el 20').toBe(20);
  });
});

describe('buildReconocerProblem', () => {
  it('las opciones son distintas, están en el tramo y una es la correcta', () => {
    const rng = mulberry32(11);
    for (const age of [4, 6] as const) {
      const cfg = getProfileDifficultyConfig(age);
      for (let level = 1; level <= 10; level++) {
        const tope = topeReconocer(level);
        for (let i = 0; i < 150; i++) {
          const p = buildReconocerProblem(level, age, rng);
          expect(p.numero).toBeGreaterThanOrEqual(1);
          expect(p.numero).toBeLessThanOrEqual(tope);
          expect(p.opciones.length, `${age}a·N${level}`).toBeGreaterThanOrEqual(cfg.minOptions);
          expect(p.opciones.length, `${age}a·N${level}`).toBeLessThanOrEqual(cfg.maxOptions);
          expect(new Set(p.opciones).size, 'nunca repetidas').toBe(p.opciones.length);
          expect(p.opciones, 'la respuesta está entre las opciones').toContain(p.respuesta);
        }
      }
    }
  });

  it('2.1 · las opciones siguen la perilla de la edad: 4 años ve 2–3, los 6, 3–4', () => {
    const rng = mulberry32(29);
    const vistas: Record<4 | 6, Set<number>> = { 4: new Set(), 6: new Set() };
    for (let i = 0; i < 400; i++) {
      vistas[4].add(buildReconocerProblem(3, 4, rng).opciones.length);
      vistas[6].add(buildReconocerProblem(3, 6, rng).opciones.length);
    }
    for (const n of vistas[4]) expect([2, 3], 'los 4 años').toContain(n);
    for (const n of vistas[6]) expect([3, 4], 'los 6 años').toContain(n);
  });

  it('la dirección decide qué se muestra y qué se elige', () => {
    const rng = mulberry32(3);
    let vioNumero = 0;
    let vioHanzi = 0;
    for (let i = 0; i < 400; i++) {
      const p = buildReconocerProblem(5, 6, rng);
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

  it('2.6 · N1–N2 fija la dirección (dígito → hanzi); desde N3 se alterna', () => {
    const rng = mulberry32(13);
    for (let i = 0; i < 100; i++) {
      expect(buildReconocerProblem(1, 4, rng).direccion, 'N1').toBe('numero-a-hanzi');
      expect(buildReconocerProblem(2, 6, rng).direccion, 'N2').toBe('numero-a-hanzi');
    }
    let vioHanzi = 0;
    for (let i = 0; i < 200; i++) {
      if (buildReconocerProblem(3, 6, rng).direccion === 'hanzi-a-numero') vioHanzi++;
    }
    expect(vioHanzi, 'desde N3 aparece hanzi → número').toBeGreaterThan(50);
  });

  it('con la misma semilla sale el mismo problema', () => {
    const a = buildReconocerProblem(4, 6, mulberry32(77));
    const b = buildReconocerProblem(4, 6, mulberry32(77));
    expect(a).toEqual(b);
  });

  it('3.2 · el número que manda el SRS se respeta si cabe en el tramo del nivel', () => {
    const rng = mulberry32(31);
    for (let i = 0; i < 40; i++) {
      const p = buildReconocerProblem(4, 6, rng, 15);
      expect(p.numero, 'siempre el que se pidió').toBe(15);
      expect(p.opciones, 'y el problema sigue completo').toContain(p.respuesta);
      expect(p.opciones.length, 'nunca repetidas').toBe(new Set(p.opciones).size);
    }
  });

  it('3.2 · un número fuera del tramo se ignora: el repaso no sube de nivel', () => {
    const rng = mulberry32(32);
    for (let i = 0; i < 30; i++) {
      const p = buildReconocerProblem(1, 4, rng, 17); // N1 solo llega a 5
      expect(p.numero).toBeGreaterThanOrEqual(1);
      expect(p.numero).toBeLessThanOrEqual(5);
    }
  });
});

/** El valor numérico de una opción: dígito o hanzi. */
function valorDeOpcion(o: string): number {
  return /^\d+$/.test(o) ? Number(o) : (leer([o]) ?? NaN);
}

/** Los distractores de un problema: las opciones que no son la respuesta. */
function distractores(p: ReconocerProblem): number[] {
  return p.opciones.filter(o => o !== p.respuesta).map(valorDeOpcion);
}

/**
 * Los distractores SON la perilla de N5–N6 (el tope ya es 20 y no se mueve): la
 * dificultad pasa de "hasta qué número" a "qué tan parecidos son los equivocados".
 */
describe('los distractores de reconocer: una perilla por nivel', () => {
  it('3.3 · N1–N4: los distractores que comparten glifo van primero; el tramo manda', () => {
    // Mismo criterio que `distractoresFor` de kanji-compose: un distractor que no se
    // parece a nada se descarta de un vistazo y no prueba nada. Para 15 salen 5, 10,
    // 13…, que todos llevan 十; el resto del tramo completa si el tramo se agota.
    const rng = mulberry32(41);
    for (const level of [1, 2, 3, 4] as const) {
      const tope = topeReconocer(level);
      for (let i = 0; i < 150; i++) {
        const p = buildReconocerProblem(level, 6, rng);
        const glifos = new Set([...hanziPara(p.numero)]);
        const comparten: number[] = [];
        for (let n = 1; n <= tope; n++) {
          if (n !== p.numero && [...hanziPara(n)].some(g => glifos.has(g))) comparten.push(n);
        }
        const ds = distractores(p);
        for (const d of ds) {
          expect(d, `${d} vive en el tramo 1–${tope}`).toBeGreaterThanOrEqual(1);
          expect(d).toBeLessThanOrEqual(tope);
        }
        if (comparten.length > 0) {
          expect(
            ds.some(d => comparten.includes(d)),
            `N${level}: para ${p.numero} (${hanziPara(p.numero)}) falta un glifo familiar; salió ${ds.map(hanziPara).join(' ')}`,
          ).toBe(true);
        }
      }
    }
  });

  it('N5: todos los distractores son vecinos (±1..±3), sea cual sea su número', () => {
    const rng = mulberry32(5);
    for (const age of [4, 6] as const) {
      for (let i = 0; i < 300; i++) {
        const p = buildReconocerProblem(5, age, rng);
        expect(p.numero).toBeLessThanOrEqual(20);
        const ds = distractores(p);
        expect(ds.length, `${age}a: siempre hay opción que tocar`).toBeGreaterThanOrEqual(1);
        for (const d of ds) {
          const dist = Math.abs(d - p.numero);
          expect(dist, `${d} no es vecino de ${p.numero}`).toBeGreaterThanOrEqual(1);
          expect(dist, `${d} se queda demasiado lejos de ${p.numero}`).toBeLessThanOrEqual(3);
        }
      }
    }
  });

  it('N6: mixto — SIEMPRE la trampa de la decena, y el resto vecinos', () => {
    const rng = mulberry32(6);
    for (const age of [4, 6] as const) {
      for (let i = 0; i < 300; i++) {
        const p = buildReconocerProblem(6, age, rng);
        const ds = distractores(p);

        // Para 15 → 5, para 7 → 17: la confusión real de esta etapa es el 十 de más o
        // de menos. Con 2–3 opciones (la perilla de la edad) la trampa sigue ESTANDO:
        // es el primer distractor que se pone, no uno entre tres.
        const trampas = ds.filter(d => Math.abs(d - p.numero) === 10);
        expect(trampas, `para ${p.numero} falta la trampa de la decena`).toHaveLength(1);
        expect(
          ds.filter(d => Math.abs(d - p.numero) <= 3),
          'y el resto son vecinos',
        ).toHaveLength(ds.length - 1);
      }
    }
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

  it('el objetivo respeta el rango de su nivel y la bandeja trae exactamente sus distractores', () => {
    const rng = mulberry32(9);
    for (const age of [4, 6] as const) {
      for (let lvl = 7; lvl <= 12; lvl++) {
        const perilla = perillaCombinar(lvl, age);
        const [min, max] = perilla.rango;
        for (let i = 0; i < 150; i++) {
          const p = buildCombinacionProblem(lvl, age, rng);
          expect(p.objetivo, `${age}a·N${lvl}`).toBeGreaterThanOrEqual(min);
          expect(p.objetivo, `${age}a·N${lvl}`).toBeLessThanOrEqual(max);
          // La bandeja es la solución + sus distractores: ni una pieza de más.
          expect(
            p.bandeja.length,
            `${age}a·N${lvl}: ${p.objetivo} se arma con ${p.solucion.length} + ${perilla.distractores}`,
          ).toBe(p.solucion.length + perilla.distractores);
        }
      }
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

  it('3.2 · el objetivo forzado por el SRS se respeta si cabe en el rango del nivel', () => {
    const rng = mulberry32(33);
    const p = buildCombinacionProblem(7, 4, rng, 14);
    expect(p.objetivo, 'el repaso trae el número que costó').toBe(14);
    expect(leer(p.solucion), 'y el problema sigue completo').toBe(14);
    // Rango de N7 a los 4: 11–20. El 5 no cabe, así que manda el azar del nivel.
    const fuera = buildCombinacionProblem(7, 4, rng, 5);
    expect(fuera.objetivo).toBeGreaterThanOrEqual(11);
    expect(fuera.objetivo).toBeLessThanOrEqual(20);
  });
});

describe('perillaCombinar', () => {
  // La tabla. Indexada con `level − NIVEL_ULTIMO_RECONOCER` (1..6): antes ramificaba con
  // `lvl <= 4`, que nadie alcanzaba, y los niveles 7–12 salían todos iguales.
  const RANGOS = {
    4: [[11, 20], [11, 20], [11, 30], [11, 30], [15, 30], [11, 30]],
    6: [[21, 60], [21, 60], [41, 99], [41, 99], [11, 99], [11, 99]],
  } as const;
  const DISTRACTORES = { 4: [0, 1, 1, 2, 2, 3], 6: [1, 2, 2, 3, 3, 4] } as const;

  it('cada nivel de combinar tiene SU rango y SU número de distractores', () => {
    for (const age of [4, 6] as const) {
      for (let lvl = 7; lvl <= 12; lvl++) {
        const perilla = perillaCombinar(lvl, age);
        expect(perilla.rango, `${age}a·N${lvl}`).toEqual(RANGOS[age][lvl - 7]);
        expect(perilla.distractores, `${age}a·N${lvl}`).toBe(DISTRACTORES[age][lvl - 7]);
      }
    }
  });

  it('un salto, una perilla: cada nivel cambia respecto al anterior', () => {
    for (const age of [4, 6] as const) {
      for (let lvl = 8; lvl <= 12; lvl++) {
        expect(
          perillaCombinar(lvl, age),
          `${age}a·N${lvl} debe distinguirse de N${lvl - 1}`,
        ).not.toEqual(perillaCombinar(lvl - 1, age));
      }
    }
  });

  it('fuera de 7–12 se recorta a la tabla, no rompe', () => {
    expect(perillaCombinar(1, 6), 'antes de la etapa = su primer nivel').toEqual(
      perillaCombinar(7, 6),
    );
    expect(perillaCombinar(99, 4), 'después de la etapa = su último nivel').toEqual(
      perillaCombinar(12, 4),
    );
  });
});
