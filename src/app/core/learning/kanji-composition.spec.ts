import { describe, it, expect } from 'vitest';
import {
  buildCompositionProblem,
  buildGuessProblem,
  buildRecallProblem,
  clampLevel,
  Colocada,
  compositionsForAge,
  difficultyFor,
  getComposition,
  KANJI_COMPOSITIONS,
  laboratorioDe,
  MAX_LEVEL,
  pieceData,
  pickComposition,
  pickLine,
  poolFor,
  poolSplit,
  reconocerTablero,
  SocraticMoment,
  SOCRATIC_LINES,
  TOLERANCIA_POSICION,
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

  // ============================================
  // §5.4 · EL HUECO DE REPASO LO GANA EL MÁS ATRASADO
  // ============================================
  //
  // `vencidos` lo entrega `SpacedRepetition.due()` ya ordenado por vencimiento. Aquí lo
  // que se comprueba es que ese orden no se pierde en el camino.
  const A_REPASO = ['mei', 'kyuu', 'rin', 'iwa'];   // repaso a nivel 3 con 6 años
  const A_NUEVOS = ['otoko', 'koi'];                // y este es lo que acaba de entrar

  /** `>= 0.6` cae siempre en el 40 % de repaso. */
  const siempreRepaso = () => 0.99;
  /** `>= 0.6` es falso: cae siempre en el 60 % de nuevos. */
  const siempreNuevo = () => 0.0;

  it('un kanji vencido gana el hueco de repaso', () => {
    expect(pickComposition(3, 6, siempreRepaso, ['rin']).id).toBe('rin');
    // Sin vencidos, ese mismo hueco sigue siendo aleatorio: el SRS empuja, no manda
    // siempre.
    expect(A_REPASO).toContain(pickComposition(3, 6, siempreRepaso).id);
  });

  it('el más atrasado manda, no el orden alfabético', () => {
    // rin va antes que kyuu en la lista de vencidos e iría después en el alfabeto, así
    // que si saliera kyuu sería que el orden se había perdido.
    expect(pickComposition(3, 6, siempreRepaso, ['rin', 'kyuu']).id).toBe('rin');
    expect(pickComposition(3, 6, siempreRepaso, ['iwa', 'mei']).id).toBe('iwa');
  });

  it('un vencido que todavía no está en el pool no secuestra el problema', () => {
    // mori entra en el nivel 9; a nivel 3 no le toca salir.
    expect(A_REPASO).toContain(pickComposition(3, 6, siempreRepaso, ['mori']).id);
  });

  it('los huecos nuevos siguen siendo nuevos aunque todo esté vencido', () => {
    expect(A_NUEVOS).toContain(pickComposition(3, 6, siempreNuevo, [...A_REPASO]).id);
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

// ============================================
// §5.6 · MODO "RECONOCER"
//
// 日 está en 明 y en 星;山 y 石 solo en 岩. Ese es el material de estas pruebas: lo que
// comparte pieza y lo que no.
// ============================================

describe('§5.6 buildRecallProblem', () => {
  it('sin dos kanji no hay problema: un "elige entre uno" es mirar, no reconocer', () => {
    expect(buildRecallProblem([], 3, mulberry32(1))).toBeNull();
    expect(buildRecallProblem(['mei'], 3, mulberry32(1))).toBeNull();
    // Los ids que no están en el catálogo no cuentan como kanji conocidos.
    expect(buildRecallProblem(['mei', 'no-existe'], 3, mulberry32(1))).toBeNull();
  });

  it('el objetivo sale del pool y las opciones lo incluyen siempre', () => {
    const pool = ['mei', 'kyuu', 'rin', 'iwa'];
    for (let i = 0; i < ITER; i++) {
      const p = buildRecallProblem(pool, 3, mulberry32(i));
      expect(p).not.toBeNull();
      expect(pool).toContain(p!.objetivo.id);
      expect(p!.opciones.map(o => o.id)).toContain(p!.objetivo.id);
      expect(new Set(p!.opciones.map(o => o.id)).size, 'sin repetir').toBe(p!.opciones.length);
    }
  });

  it('ofrece lo que pide, y nunca más de lo que hay', () => {
    expect(buildRecallProblem(['mei', 'kyuu'], 3, mulberry32(2))!.opciones).toHaveLength(2);
    expect(buildRecallProblem(['mei', 'kyuu', 'rin'], 3, mulberry32(2))!.opciones).toHaveLength(3);
    expect(buildRecallProblem(['mei', 'kyuu', 'rin'], 2, mulberry32(2))!.opciones).toHaveLength(2);
  });

  it('prefiere distractores que comparten pieza: sin eso no hay que mirar el kanji', () => {
    // 明 y 星 comparten 日; 明 y 岩 no comparten nada. Un distractor que no se parece a
    // nada se descarta de un vistazo, así que 星 nunca se descarta mientras haya hueco.
    for (let i = 0; i < ITER; i++) {
      const p = buildRecallProblem(['mei', 'hoshi', 'iwa', 'kyuu', 'koi'], 3, mulberry32(i))!;
      if (p.objetivo.id === 'mei') {
        expect(p.opciones.map(o => o.id), 'el que comparte 日 no se descarta').toContain('hoshi');
      }
    }
  });

  it('las opciones se barajan: el correcto no puede estar siempre en el mismo sitio', () => {
    const posiciones = new Set<number>();
    for (let i = 0; i < ITER; i++) {
      const p = buildRecallProblem(['mei', 'kyuu', 'rin', 'iwa'], 3, mulberry32(i))!;
      posiciones.add(p.opciones.findIndex(o => o.id === p.objetivo.id));
    }
    expect(posiciones.size, 'siempre en el mismo hueco no habría que mirar').toBeGreaterThan(1);
  });
});

// ============================================
// §5.2 · ADIVINA EL SIGNIFICADO
// ============================================

describe('§5.2 buildGuessProblem', () => {
  it('ofrece el significado real y el de las piezas, todavía sueltas', () => {
    // 明 = 日 ☀️ + 月 🌙 y significa "luminoso, claro" 💡: tres hipótesis y las tres
    // plausibles sobre "¿qué pueden querer decir juntos el sol y la luna?".
    const p = buildGuessProblem(getComposition('mei')!, mulberry32(3));
    expect(p.piezas.map(x => x.emoji), 'las piezas, sin formar el kanji').toEqual(['☀️', '🌙']);
    expect(p.opciones.map(o => o.emoji).sort()).toEqual(['☀️', '💡', '🌙'].sort());
  });

  it('una pieza repetida no se ofrece tres veces: 森 lleva tres veces 木', () => {
    const p = buildGuessProblem(getComposition('mori')!, mulberry32(4));
    expect(p.piezas, '木 aparece una sola vez en pantalla').toHaveLength(1);
    // Deduplicando por emoji quedaría **una** opción, que no es elegir. El extra 🌲 es el
    // de 林 y además es una hipótesis de verdad: "¿es un bosque profundo o una arboleda?".
    expect(p.opciones).toHaveLength(2);
    expect(p.opciones.map(o => o.emoji).sort()).toEqual(['🌳', '🌲'].sort());
  });

  it('deduplica por emoji y no por significado: 岩 es montaña + piedra y significa roca', () => {
    // 🪨 se escribe igual que la piedra. Tres veces 🪨 en fila no sería una elección.
    const p = buildGuessProblem(getComposition('iwa')!, mulberry32(5));
    expect(p.opciones).toHaveLength(2);
    expect(p.opciones.map(o => o.emoji).sort()).toEqual(['⛰️', '🪨'].sort());
  });

  it('炎, lo mismo con fuego: 🔥+🔥 = 🔥 no deja nada que elegir', () => {
    const p = buildGuessProblem(getComposition('en')!, mulberry32(6));
    expect(p.opciones).toHaveLength(2);
    expect(p.opciones.map(o => o.emoji).sort()).toEqual(['💡', '🔥'].sort());
  });

  it('el significado real siempre está entre las opciones, y se baraja', () => {
    const posiciones = new Set<number>();
    for (const id of ['mei', 'kyuu', 'otoko', 'koi', 'hoshi', 'go']) {
      const c = getComposition(id)!;
      for (let i = 0; i < 30; i++) {
        const p = buildGuessProblem(c, mulberry32(i));
        expect(p.opciones.map(o => o.significado), `${id} incluye lo que significa`).toContain(
          c.meaning,
        );
        posiciones.add(p.opciones.findIndex(o => o.significado === c.meaning));
      }
    }
    expect(posiciones.size, 'siempre en el mismo sitio no habría que elegir').toBeGreaterThan(1);
  });

  it('ningún kanji se queda con menos de dos opciones: una no es elegir', () => {
    for (const c of KANJI_COMPOSITIONS) {
      expect(
        buildGuessProblem(c, mulberry32(7)).opciones.length,
        `${c.id} se queda sin elección`,
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

// ============================================
// §5.1 · LABORATORIO DE POSICIÓN
// ============================================

describe('§5.1 laboratorio de posición', () => {
  const p = (kanji: string, x: number, y: number): Colocada => ({ kanji, x, y });

  describe('reconocerTablero', () => {
    it('木 con la 一 abajo es 本; arriba son DOS: 末 y 未', () => {
      const abajo = reconocerTablero([p('木', 0.5, 0.43), p('一', 0.5, 0.79)]);
      expect(abajo.map(f => f.kanji), 'la 一 al pie del árbol: la raíz').toEqual(['本']);

      // El descubrimiento entero: dos kanji con las MISMAS piezas en el MISMO sitio, y
      // lo único que los separa es la longitud de la línea —algo que el tablero no puede
      // expresar, y por eso los devuelve juntos en vez de elegir uno por ella.
      const arriba = reconocerTablero([p('木', 0.5, 0.44), p('一', 0.5, 0.3)]);
      expect(arriba.map(f => f.kanji).sort()).toEqual(['未', '末'].sort());
      expect(arriba.every(f => f.descubrimiento), 'y ninguno es del catálogo').toBe(true);
    });

    it('la 一 en mitad del camino no forma nada: eso también es un resultado', () => {
      // (0.3 + 0.79) / 2, a 0.245 de las dos: fuera de la tolerancia de las dos.
      expect(reconocerTablero([p('木', 0.5, 0.43), p('一', 0.5, 0.545)]), 'y no es un error').toEqual([]);
    });

    it('las piezas al revés no forman nada: 日 y 月 cambian de sitio y 明 se va', () => {
      expect(reconocerTablero([p('日', 0.29, 0.5), p('月', 0.71, 0.5)]).map(f => f.kanji)).toEqual(['明']);
      expect(reconocerTablero([p('月', 0.29, 0.5), p('日', 0.71, 0.5)]), 'no es un error').toEqual([]);
    });

    it('el árbol que crece: quitarle uno a 森 deja 林', () => {
      const tres = reconocerTablero([p('木', 0.5, 0.26), p('木', 0.3, 0.72), p('木', 0.7, 0.72)]);
      expect(tres.map(f => f.kanji)).toEqual(['森']);

      const dos = reconocerTablero([p('木', 0.3, 0.72), p('木', 0.7, 0.72)]);
      expect(dos.map(f => f.kanji), 'dos árboles abajo, que es donde están los de 林').toEqual(['林']);
    });

    it('una pieza repetida no sirve para dos huecos a la vez', () => {
      // Si lo mismo valiera para arriba y para abajo, un solo 木 haría 森.
      expect(reconocerTablero([p('木', 0.5, 0.5), p('木', 0.5, 0.5), p('木', 0.5, 0.5)])).toEqual([]);
    });

    it('la tolerancia es un número con dos dueños, no un redondeo', () => {
      // Por abajo: 林 está a 0.22 de la pareja de abajo de 森. Por debajo de eso la
      // mitad del laboratorio dejaría de funcionar.
      expect(TOLERANCIA_POSICION, 'aguanta el salto de 森 a 林').toBeGreaterThanOrEqual(0.22);
      // Por arriba: la 一 de 本 y la de 末/未 están a 0.49, y con 0.245 o más una sola
      // satisfacería a las tres.
      expect(TOLERANCIA_POSICION, 'no mezcla 本 con 末/未').toBeLessThan(0.245);

      const descentrada = reconocerTablero([p('木', 0.54, 0.47), p('一', 0.47, 0.75)]);
      expect(descentrada.map(f => f.kanji), 'un dedo descentrado sigue siendo 本').toEqual(['本']);
    });
  });

  describe('laboratorioDe', () => {
    it('las piezas no se deduplican: de 森 salen tres 木, que es de lo que va el paso', () => {
      const lab = laboratorioDe(getComposition('mori')!);
      expect(lab.piezas).toHaveLength(3);
      expect(lab.piezas.every(x => x.kanji === '木')).toBe(true);
      expect(new Set(lab.piezas.map(x => x.trayId)).size, 'cada una es suya').toBe(3);
    });

    it('los huecos son la unión de la familia, no solo los del kanji', () => {
      const lab = laboratorioDe(getComposition('hon')!);
      // 本 pone la 一 abajo; 末 y 未 la arriba. Sin el hueco de arriba la 一 no tendría
      // dónde ir y el descubrimiento entero sería imposible.
      const ys = lab.huecos
        .filter(h => h.kanji === '一')
        .map(h => h.y)
        .sort((a, b) => a - b);
      expect(ys, 'la 1 en su sitio y en el contrario').toHaveLength(2);
      expect(ys[0]).toBeCloseTo(0.3, 5);
      expect(ys[1]).toBeCloseTo(0.79, 5);

      // El 木 de 本 y el de 末/未 están a 0.01: es el mismo hueco, no dos.
      expect(lab.huecos.filter(h => h.kanji === '木')).toHaveLength(1);
    });

    it('森 da además el hueco de 林, o el bosque no podría encogerse', () => {
      const lab = laboratorioDe(getComposition('mori')!);
      expect(lab.huecos, 'los tres de 森 y los dos de 林').toHaveLength(5);
    });

    it('los descubrimientos se pueden formar pero no están en el catálogo', () => {
      expect(KANJI_COMPOSITIONS.some(c => c.kanji === '末'), 'no entra en el pool').toBe(false);
      expect(KANJI_COMPOSITIONS.some(c => c.kanji === '未'), 'ni en el SRS').toBe(false);
      expect(
        reconocerTablero([p('木', 0.5, 0.44), p('一', 0.5, 0.3)]).some(f => f.descubrimiento),
        'pero sí se nombran en el laboratorio',
      ).toBe(true);
    });
  });
});