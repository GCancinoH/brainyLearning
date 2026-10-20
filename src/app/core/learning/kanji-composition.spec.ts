import { describe, it, expect } from 'vitest';
import {
  buildCompositionProblem,
  clampLevel,
  compositionsForAge,
  difficultyFor,
  getComposition,
  KANJI_COMPOSITIONS,
  MAX_LEVEL,
  pieceData,
  pickComposition,
  pickLine,
  poolFor,
  poolSplit,
  SocraticMoment,
  SOCRATIC_LINES,
  TrayPiece,
} from './kanji-composition';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ITER = 150;

describe('catálogo de kanji', () => {
  it('todos los ids son únicos', () => {
    expect(new Set(KANJI_COMPOSITIONS.map(c => c.id)).size).toBe(KANJI_COMPOSITIONS.length);
  });

  it('toda pieza usada tiene sus datos (lectura, pinyin, significado, emoji)', () => {
    for (const c of KANJI_COMPOSITIONS) {
      for (const slot of c.slots) {
        const data = pieceData(slot.kanji);
        expect(data.kanji).toBe(slot.kanji);
        expect(data.meaning, `${c.kanji}/${slot.kanji} sin significado`).not.toBe('');
        expect(data.reading, `${c.kanji}/${slot.kanji} sin lectura`).not.toBe('');
        expect(data.pinyin, `${c.kanji}/${slot.kanji} sin pinyin`).not.toBe('');
        expect(data.emoji, `${c.kanji}/${slot.kanji} sin emoji`).not.toBe('❓');
      }
    }
  });

  it('las coordenadas de las piezas están normalizadas y dentro del marco', () => {
    for (const c of KANJI_COMPOSITIONS) {
      expect(c.slots.length).toBeGreaterThanOrEqual(2);
      for (const s of c.slots) {
        expect(s.x).toBeGreaterThan(0);
        expect(s.x).toBeLessThan(1);
        expect(s.y).toBeGreaterThan(0);
        expect(s.y).toBeLessThan(1);
      }
    }
  });

  it('ningún kanji repetido usa la misma ranura dos veces', () => {
    // 森 = 木+木 y 炎 = 火+火 sí repiten pieza, pero en huecos distintos
    for (const c of KANJI_COMPOSITIONS) {
      const keys = c.slots.map(s => `${s.x},${s.y}`);
      expect(new Set(keys).size, `${c.kanji} repite ranura`).toBe(keys.length);
    }
  });

  it('los hermanos declarados son kanji distintos del propio', () => {
    for (const c of KANJI_COMPOSITIONS) {
      for (const sib of c.siblings ?? []) {
        expect(sib.kanji).not.toBe(c.kanji);
        expect(sib.meaning).not.toBe('');
      }
    }
  });

  it('el catálogo respeta la edad mínima y solo 6 años ve los de 3 piezas', () => {
    const c4 = compositionsForAge(4);
    const c6 = compositionsForAge(6);

    // A los 4 años solo entran los kanji de 2 piezas
    expect(c4.every(c => c.minAge === 4)).toBe(true);
    expect(c4.some(c => c.slots.length >= 3)).toBe(false);

    // A los 6 años entra todo: también los de 4 años y los de 3 piezas
    expect(c6.length).toBeGreaterThan(c4.length);
    expect(c6.some(c => c.minAge === 6)).toBe(true);
    expect(c6.some(c => c.slots.length === 3)).toBe(true);
  });
});

describe('pickComposition', () => {
  it('cada nivel devuelve siempre un kanji válido de la edad correcta', () => {
    const rng = mulberry32(1234);
    for (const age of [4, 6]) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        for (let i = 0; i < ITER; i++) {
          const c = pickComposition(level, age, rng);
          expect(c, `nivel ${level} edad ${age} sin kanji`).toBeDefined();
          // minAge es "edad mínima": el kanji debe poder jugar a esa edad
          expect(c.minAge).toBeLessThanOrEqual(age <= 4 ? 4 : 6);
        }
      }
    }
  });

  it('las piezas en 3 no aparecen hasta el nivel 9', () => {
    const rng = mulberry32(555);
    for (let level = 1; level <= 8; level++) {
      for (let i = 0; i < ITER; i++) {
        expect(pickComposition(level, 6, rng).slots.length, `nivel ${level}`).toBe(2);
      }
    }
    let sawThree = false;
    for (let level = 9; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        if (pickComposition(level, 6, rng).slots.length === 3) sawThree = true;
      }
    }
    expect(sawThree).toBe(true);
  });

  it('un nivel fuera de rango se recorta en vez de romper', () => {
    const rng = mulberry32(77);
    for (const level of [-3, 0, 1, MAX_LEVEL, 99]) {
      expect(pickComposition(level, 6, rng)).toBeDefined();
      expect(pickComposition(level, 4, rng)).toBeDefined();
    }
    expect(clampLevel(-3)).toBe(1);
    expect(clampLevel(999)).toBe(MAX_LEVEL);
  });
});

describe('buildCompositionProblem', () => {
  it('la bandeja contiene exactamente las piezas que pide el objetivo', () => {
    const rng = mulberry32(2468);
    for (const age of [4, 6]) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        for (let i = 0; i < ITER; i++) {
          const p = buildCompositionProblem(level, age, rng);

          // Las piezas correctas, multiconjunto, coinciden con los huecos
          const trayOk = p.tray.filter(t => t.correct).map(t => t.kanji).sort();
          const needed = p.slots.map(s => s.kanji).sort();
          expect(trayOk, `nivel ${level} edad ${age}`).toEqual(needed);

          // Cada hueco tiene su pieza
          expect(p.slots.length).toBe(p.target.slots.length);
        }
      }
    }
  });

  it('nunca ofrece dos veces la misma pieza en la bandeja', () => {
    const rng = mulberry32(1357);
    for (const age of [4, 6]) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        for (let i = 0; i < ITER; i++) {
          const p = buildCompositionProblem(level, age, rng);
          expect(new Set(p.tray.map(t => t.trayId)).size).toBe(p.tray.length);
        }
      }
    }
  });

  it('4 años: progresión escrita a mano y bandeja que siempre cuadra', () => {
    // nivel → [ ¿fantasma?, distractores ]. Es la progresión que se escogió, no lo que
    // el código decida hoy: si alguien mueve una perilla, este test se queja.
    const esperado: Record<number, [boolean, number]> = {
      1: [true, 0], 2: [true, 0], 3: [true, 0], 4: [true, 0],
      5: [true, 0], 6: [true, 0], 7: [true, 1], 8: [true, 1],
      9: [false, 1], 10: [false, 1],
    };

    const rng = mulberry32(4321);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p4 = buildCompositionProblem(level, 4, rng);
        expect(p4.showGhost, `nivel ${level} fantasma`).toBe(esperado[level]![0]);
        expect(p4.distractors, `nivel ${level} distractores`).toBe(esperado[level]![1]);
        expect(p4.tray.length).toBe(p4.slots.length + p4.distractors);

        const needed = p4.slots.map(s => s.kanji);
        for (const d of p4.tray.filter((t: TrayPiece) => !t.correct)) {
          expect(needed, `nivel ${level}`).not.toContain(d.kanji);
        }
      }
    }
  });

  it('4 años nunca es más exigente que 6 en el mismo nivel', () => {
    const rng = mulberry32(9911);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      const p4 = buildCompositionProblem(level, 4, rng);
      const p6 = buildCompositionProblem(level, 6, rng);
      // Menos piezas raras, y la ayuda visual igual de fuerte o más —que es la que a
      // los 4 años es la única que tiene para saber qué construir.
      expect(p4.distractors, `nivel ${level} distractores`).toBeLessThanOrEqual(p6.distractors);
      expect(p4.ghost, `nivel ${level} fantasma`).toBeGreaterThanOrEqual(p6.ghost);
    }
  });

  it('6 años: progresión escrita a mano y distractores nunca ambiguos', () => {
    // nivel → [ ¿fantasma?, distractores ]. El fantasma se retira en el 3 y se acaba en
    // el 7; los distractores llegan en el 5 y llegan a 2 en el 9. Antes todo esto se
    // decidía con `lvl < 5` y caía entero en el nivel 5 de golpe.
    const esperado: Record<number, [boolean, number]> = {
      1: [true, 0], 2: [true, 0], 3: [true, 0], 4: [true, 0],
      5: [true, 1], 6: [true, 1], 7: [false, 1], 8: [false, 1],
      9: [false, 2], 10: [false, 2],
    };

    const rng = mulberry32(8765);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p = buildCompositionProblem(level, 6, rng);
        expect(p.showGhost, `nivel ${level} fantasma`).toBe(esperado[level]![0]);
        expect(p.distractors, `nivel ${level} distractores`).toBe(esperado[level]![1]);

        // Ningún distractor puede ser una pieza del objetivo: sería ambiguo
        const needed = p.slots.map(s => s.kanji);
        for (const d of p.tray.filter((t: TrayPiece) => !t.correct)) {
          expect(needed, `nivel ${level}`).not.toContain(d.kanji);
        }
      }
    }
  });

  it('el objetivo nunca usa una pieza que también esté como distractor', () => {
    const rng = mulberry32(1122);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p = buildCompositionProblem(level, 6, rng);
        const okKanji = new Set(p.tray.filter(t => t.correct).map(t => t.kanji));
        for (const t of p.tray) {
          if (!t.correct) expect(okKanji.has(t.kanji)).toBe(false);
        }
      }
    }
  });
});

describe('§3.2 progresión y niveles', () => {
  it('los pools son acumulativos: nada de lo aprendido desaparece al subir', () => {
    for (const edad of [4, 6]) {
      for (let nivel = 2; nivel <= MAX_LEVEL; nivel++) {
        const anterior = poolFor(edad, nivel - 1);
        const actual = poolFor(edad, nivel);
        for (const id of anterior) {
          expect(actual, `edad ${edad} nivel ${nivel} perdió ${id}`).toContain(id);
        }
      }
    }
  });

  it('a los 4 años los 10 niveles ya no son todos el mismo', () => {
    const nivel1 = poolFor(4, 1);
    const nivel5 = poolFor(4, 5);
    expect(nivel1.length).toBe(2);
    expect(nivel5.length).toBe(6);
    expect(nivel5).toContain('koi');
    // Agotado el catálogo, del 7 al 10 es repaso puro — y ahí lo que cambia es la ayuda
    expect(poolFor(4, 10)).toEqual(nivel5);
    expect(difficultyFor(4, 10)).not.toEqual(difficultyFor(4, 5));
  });

  it('好 (koi) sale también a los 6 años, y pronto', () => {
    expect(poolFor(6, 10)).toContain('koi');
    expect(poolFor(6, 3)).toContain('koi');
  });

  it('60 % de lo nuevo y 40 % de repaso: la escalada manda, nada se olvida', () => {
    const TOTAL = 3000;
    const cuenta = new Map<string, number>();
    const rng = mulberry32(4242);
    for (let i = 0; i < TOTAL; i++) {
      const id = pickComposition(9, 6, rng).id;
      cuenta.set(id, (cuenta.get(id) ?? 0) + 1);
    }

    // Lo nuevo del nivel 9 son los dos de 3 piezas: tienen que dominar. Repartidos en
    // pieles iguales entre 13 kanji habrían salido 1 de cada 13 y nunca se habría
    // llegado a sentir la dificultad que abre el nivel.
    const nuevos = (cuenta.get('mori') ?? 0) + (cuenta.get('go') ?? 0);
    expect(nuevos).toBeGreaterThan(TOTAL * 0.5);

    // ...pero el kanji del nivel 1 sigue saliendo, que era justamente lo que faltaba
    const viejos = (cuenta.get('mei') ?? 0) + (cuenta.get('kyuu') ?? 0);
    expect(viejos).toBeGreaterThan(0);
  });

  it('cada salto de nivel cambia UNA sola perilla de dificultad', () => {
    for (const edad of [4, 6]) {
      let anterior = difficultyFor(edad, 1);
      expect(anterior.ghost).toBeGreaterThan(0);
      expect(anterior.distractors).toBe(0);

      for (let nivel = 2; nivel <= MAX_LEVEL; nivel++) {
        const actual = difficultyFor(edad, nivel);
        const etiqueta = `edad ${edad} nivel ${nivel}`;

        // Ni el fantasma se enciende de nuevo ni los distractores retroceden
        expect(actual.ghost, `${etiqueta}: el fantasma vuelve`).toBeLessThanOrEqual(anterior.ghost);
        expect(actual.distractors, `${etiqueta}: menos distractores`).toBeGreaterThanOrEqual(
          anterior.distractors,
        );

        if (actual.ghost === anterior.ghost && actual.distractors === anterior.distractors) {
          anterior = actual;
          continue;
        }

        // El acantilado del nivel 5 era exactamente esto: dos perillas a la vez
        const cambios =
          Number(actual.ghost !== anterior.ghost) +
          Number(actual.distractors !== anterior.distractors);
        expect(cambios, `${etiqueta}: dos cambios de golpe`).toBe(1);
        anterior = actual;
      }
    }
  });

  it('poolSplit reparte el nivel en lo que acaba de llegar y lo que ya se ha visto', () => {
    for (const edad of [4, 6]) {
      for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
        const { nuevos, repaso } = poolSplit(edad, nivel);
        const todos = poolFor(edad, nivel);
        expect(nuevos.length + repaso.length, `edad ${edad} nivel ${nivel}`).toBe(todos.length);
        for (const id of nuevos) expect(repaso, `edad ${edad} nivel ${nivel}`).not.toContain(id);
      }
    }
  });
});

describe('diálogos socráticos', () => {
  // No se escribe a mano: se deriva del propio mapa. Con la lista fija, `stroke-retry`
  // habría entrado sin pasar por el test de "nunca dice que está mal", que es justo el
  // que no se puede saltar.
  const moments = Object.keys(SOCRATIC_LINES) as SocraticMoment[];

  it('cada momento tiene al menos 2 frases distintas', () => {
    for (const m of moments) {
      expect(SOCRATIC_LINES[m].length, m).toBeGreaterThanOrEqual(2);
      expect(new Set(SOCRATIC_LINES[m]).size, `${m} tiene frases repetidas`).toBe(
        SOCRATIC_LINES[m].length,
      );
    }
  });

  it('nunca afirman que algo está mal (prohibido el veredicto directo)', () => {
    const prohibido = ['incorrecto', 'está mal', 'mal hecho', 'no es', 'equivocado', 'fallaste'];
    for (const m of moments) {
      for (const line of SOCRATIC_LINES[m]) {
        for (const palabra of prohibido) {
          expect(line.toLowerCase(), `${m}: "${line}" dice "${palabra}"`).not.toContain(palabra);
        }
      }
    }
  });

  it('pickLine siempre devuelve una frase del momento pedido', () => {
    const rng = mulberry32(31);
    for (const m of moments) {
      for (let i = 0; i < 50; i++) {
        expect(SOCRATIC_LINES[m]).toContain(pickLine(m, rng));
      }
    }
  });
});

describe('etimología de los árboles', () => {
  it('林 usa 2 木 y 森 usa 3: arboleda frente a bosque', () => {
    // Es la diferencia que se le olvidó al preparar el catálogo, y la niña la detectó:
    // 林 = dos árboles = arboleda, no bosque. El bosque de verdad es 森 (tres 木).
    const rin = getComposition('rin')!;
    const mori = getComposition('mori')!;

    expect(rin.slots.map(s => s.kanji)).toEqual(['木', '木']);
    expect(mori.slots.map(s => s.kanji)).toEqual(['木', '木', '木']);

    expect(rin.meaning).toContain('arboleda');
    expect(rin.meaning).not.toMatch(/^bosque/);
    expect(rin.story).toContain('森');

    expect(mori.meaning).toMatch(/bosque/);
    // 森 se presenta a la niña como el "hermano mayor" de 林
    expect(mori.siblings?.some(s => s.kanji === '林')).toBe(true);
  });

  it('cada kanji con "bosque" en el significado tiene al menos 2 木', () => {
    for (const c of KANJI_COMPOSITIONS) {
      if (/bosque/.test(c.meaning)) {
        const arboles = c.slots.filter(s => s.kanji === '木').length;
        expect(arboles, `${c.kanji} dice "bosque" con solo ${arboles} 木`).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('getComposition', () => {
  it('devuelve el kanji pedido y undefined si no existe', () => {
    expect(getComposition('mei')?.kanji).toBe('明');
    expect(getComposition('mori')?.kanji).toBe('森');
    expect(getComposition('no-existe')).toBeUndefined();
  });
});