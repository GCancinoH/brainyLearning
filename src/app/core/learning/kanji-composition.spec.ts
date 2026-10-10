import { describe, it, expect } from 'vitest';
import {
  buildCompositionProblem,
  clampLevel,
  compositionsForAge,
  getComposition,
  KANJI_COMPOSITIONS,
  MAX_LEVEL,
  pieceData,
  pickComposition,
  pickLine,
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

  it('4 años y niveles bajos: sin distractores y con guía fantasma', () => {
    const rng = mulberry32(4321);
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p4 = buildCompositionProblem(level, 4, rng);
        expect(p4.distractors).toBe(0);
        expect(p4.showGhost).toBe(true);
        expect(p4.tray.length).toBe(p4.slots.length);
      }
    }
    for (let level = 1; level <= 4; level++) {
      const p6 = buildCompositionProblem(level, 6, rng);
      expect(p6.distractors).toBe(0);
      expect(p6.showGhost).toBe(true);
    }
  });

  it('6 años desde el nivel 5: con distractores y sin guía', () => {
    const rng = mulberry32(8765);
    for (let level = 5; level <= MAX_LEVEL; level++) {
      for (let i = 0; i < ITER; i++) {
        const p = buildCompositionProblem(level, 6, rng);
        expect(p.distractors, `nivel ${level} sin distractores`).toBeGreaterThanOrEqual(2);
        expect(p.showGhost).toBe(false);
        // Ningún distractor puede ser una pieza del objetivo: sería ambiguo
        const needed = p.slots.map(s => s.kanji);
        for (const d of p.tray.filter((t: TrayPiece) => !t.correct)) {
          expect(needed).not.toContain(d.kanji);
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

describe('diálogos socráticos', () => {
  const moments: SocraticMoment[] = [
    'wrong-piece',
    'right-pieces-wrong-place',
    'complete',
    'draw-done',
    'sibling-discovery',
  ];

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