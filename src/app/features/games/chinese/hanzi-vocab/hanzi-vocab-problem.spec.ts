import { describe, expect, it } from 'vitest';
import {
  HANZI_ACTIONS,
  HANZI_ANIMALS,
  HANZI_COLORS,
  HANZI_FAMILY,
  HANZI_NATURE,
  HANZI_VOCAB,
  vocabForDeck,
} from '@core/learning/hanzi-vocab';
import { getProfileDifficultyConfig } from '@core/learning/learning-content';
import {
  MAX_LEVEL,
  buildVocabProblem,
  knobFor,
  poolFor,
  type LevelKnob,
  type VocabMode,
} from './hanzi-vocab-problem';

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_IDS = HANZI_VOCAB.map(i => i.id);

/** Todas las claves que describen una perilla, para comparar saltos de nivel. */
function perillas(k: LevelKnob): Record<string, string | number | boolean> {
  return {
    poolSize: k.poolSize,
    modes: k.modes.join(','),
    confusable: k.confusable,
    extraOption: k.extraOption,
    autoAudioGlyph: k.autoAudioGlyph,
    reviewFirst: k.reviewFirst,
    distractorScope: k.distractorScope ?? 'same',
  };
}

describe('datos del vocabulario', () => {
  it('son 36 palabras: 6 colores, 8 animales, 8 naturaleza, 6 familia, 8 acciones', () => {
    expect(HANZI_VOCAB).toHaveLength(36);
    expect(HANZI_COLORS).toHaveLength(6);
    expect(HANZI_ANIMALS).toHaveLength(8);
    expect(HANZI_NATURE).toHaveLength(8);
    expect(HANZI_FAMILY).toHaveLength(6);
    expect(HANZI_ACTIONS).toHaveLength(8);
  });

  it('ids ASCII únicos, sin pinyin con tono', () => {
    expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length);
    for (const id of ALL_IDS) expect(id, id).toMatch(/^[a-z]+$/);
  });

  it('hanzi y emoji no se repiten', () => {
    expect(new Set(HANZI_VOCAB.map(i => i.hanzi)).size).toBe(HANZI_VOCAB.length);
    expect(new Set(HANZI_VOCAB.map(i => i.emoji)).size).toBe(HANZI_VOCAB.length);
  });

  it('cada mazo tiene su `order` 1..n sin huecos', () => {
    for (const deck of ['colors', 'animals', 'nature', 'family', 'actions'] as const) {
      const orders = vocabForDeck(deck).map(i => i.order);
      expect(orders).toEqual(Array.from({ length: orders.length }, (_, i) => i + 1));
    }
  });

  it('solo los colores traen `cssColor`', () => {
    for (const item of HANZI_COLORS) expect(item.cssColor, item.id).toBeTruthy();
    for (const item of HANZI_ANIMALS) expect(item.cssColor, item.id).toBeUndefined();
    for (const item of HANZI_NATURE) expect(item.cssColor, item.id).toBeUndefined();
    for (const item of HANZI_FAMILY) expect(item.cssColor, item.id).toBeUndefined();
    for (const item of HANZI_ACTIONS) expect(item.cssColor, item.id).toBeUndefined();
  });

  it('Acciones marca sus 8 verbos; los demás mazos son sustantivos implícitos', () => {
    expect(HANZI_ACTIONS.every(i => i.pos === 'verb')).toBe(true);
    for (const item of [...HANZI_COLORS, ...HANZI_ANIMALS, ...HANZI_NATURE, ...HANZI_FAMILY]) {
      expect(item.pos, item.id).toBeUndefined();
    }
  });
});

describe('knobFor', () => {
  it('recorta fuera de rango en vez de devolver undefined', () => {
    expect(knobFor('colors', 0)).toEqual(knobFor('colors', 1));
    expect(knobFor('colors', 99)).toEqual(knobFor('colors', MAX_LEVEL));
  });

  it('cada salto de nivel cambia UNA sola perilla', () => {
    for (const deck of ['colors', 'animals', 'nature', 'family', 'actions', 'listening'] as const) {
      for (let nivel = 2; nivel <= MAX_LEVEL; nivel++) {
        const antes = perillas(knobFor(deck, nivel - 1));
        const ahora = perillas(knobFor(deck, nivel));
        const cambios = Object.keys(antes).filter(k => antes[k] !== ahora[k]);
        expect(cambios.length, `${deck} N${nivel}: cambiaron ${cambios.join(', ')}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('las perillas llegan cuando toca', () => {
    expect(knobFor('colors', 1).modes).toEqual(['hear']);
    expect(knobFor('colors', 3).modes).toContain('glyph-to-see');
    expect(knobFor('colors', 7).modes).toContain('see-to-glyph');
    expect(knobFor('colors', 5).confusable).toBe(true);
    expect(knobFor('colors', 8).extraOption).toBe(true);
    expect(knobFor('colors', 9).autoAudioGlyph).toBe(false);
    expect(knobFor('colors', 10).reviewFirst).toBe(true);

    // Animales y Naturaleza usan todo el mazo (8) y no acumulan dos cambios en N10.
    expect(knobFor('animals', 8).poolSize).toBe(8);
    expect(knobFor('animals', 10).reviewFirst).toBe(true);
    expect(knobFor('nature', 8).poolSize).toBe(8);
    expect(knobFor('nature', 10).reviewFirst).toBe(true);

    // Acciones usa la misma tabla de 8 palabras que Animales/Naturaleza.
    expect(knobFor('actions', 8).poolSize).toBe(8);
    expect(knobFor('actions', 10).reviewFirst).toBe(true);

    // Familia igual que Colores (6 palabras).
    expect(knobFor('family', 8).extraOption).toBe(true);
    expect(knobFor('family', 10).reviewFirst).toBe(true);

    // Listening: contraste entre categorías al principio, misma categoría desde N6.
    expect(knobFor('listening', 1).distractorScope).toBe('other');
    expect(knobFor('listening', 6).distractorScope).toBe('same');
    expect(knobFor('listening', 7).modes).toContain('glyph-to-see');
  });
});

describe('poolFor', () => {
  it('crece por orden y nunca pasa del mazo', () => {
    expect(poolFor('colors', 1).map(i => i.id)).toEqual(['hong', 'huang', 'lan']);
    expect(poolFor('colors', 6)).toHaveLength(6);
    expect(poolFor('colors', 10)).toHaveLength(6);
    expect(poolFor('animals', 8)).toHaveLength(8);
    expect(poolFor('nature', 8)).toHaveLength(8);
    expect(poolFor('family', 6)).toHaveLength(6);
    expect(poolFor('actions', 8)).toHaveLength(8);
  });

  it('listening solo acepta palabras ya presentadas', () => {
    expect(poolFor('listening', 1, ['hong', 'mao']).map(i => i.id)).toEqual(['hong', 'mao']);
    expect(() => poolFor('listening', 1)).toThrow(/poolIds/);
    expect(() => poolFor('listening', 1, [])).toThrow(/poolIds/);
  });
});

describe('buildVocabProblem', () => {
  it('la respuesta está siempre entre las opciones y no hay duplicados', () => {
    for (const deck of ['colors', 'animals', 'nature', 'family', 'actions'] as const) {
      for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
        const pool = new Set(poolFor(deck, nivel).map(i => i.id));
        for (const edad of [4, 6]) {
          for (let seed = 1; seed <= 200; seed++) {
            const p = buildVocabProblem(deck, nivel, edad, mulberry32(seed * 97 + nivel));
            expect(p.options.some(o => o.id === p.item.id), `${deck} N${nivel}`).toBe(true);
            expect(new Set(p.options.map(o => o.id)).size).toBe(p.options.length);
            for (const o of p.options) expect(pool.has(o.id), `${deck} N${nivel}: ${o.id} fuera del pool`).toBe(true);
          }
        }
      }
    }
  });

  it('el número de opciones respeta la edad y el tope del pool', () => {
    for (const edad of [4, 6] as const) {
      const cfg = getProfileDifficultyConfig(edad);
      for (const deck of ['colors', 'animals', 'nature', 'family', 'actions'] as const) {
        for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
          const tope = Math.min(
            cfg.maxOptions + (knobFor(deck, nivel).extraOption ? 1 : 0),
            poolFor(deck, nivel).length,
          );
          for (let seed = 1; seed <= 30; seed++) {
            const p = buildVocabProblem(deck, nivel, edad, mulberry32(seed + nivel * 13));
            expect(p.options.length, `${deck} N${nivel} edad ${edad}`).toBeGreaterThanOrEqual(
              Math.min(cfg.minOptions, poolFor(deck, nivel).length),
            );
            expect(p.options.length, `${deck} N${nivel} edad ${edad}`).toBeLessThanOrEqual(tope);
          }
        }
      }
    }
  });

  it('un `forced` fuera del pool se ignora; dentro, manda', () => {
    for (let seed = 1; seed <= 20; seed++) {
      // 黑 entra en el nivel 6: en N1 no puede colarse por la puerta del repaso.
      const fuera = buildVocabProblem('colors', 1, 6, mulberry32(seed), { forced: 'hei' });
      expect(fuera.item.id, 'el repaso no debe saltarse el pool').not.toBe('hei');

      const dentro = buildVocabProblem('colors', 1, 6, mulberry32(seed), { forced: 'hong' });
      expect(dentro.item.id).toBe('hong');
    }
  });

  it('`avoidId` evita repetir la palabra anterior', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = buildVocabProblem('colors', 1, 4, mulberry32(seed), { avoidId: 'hong' });
      expect(p.item.id).not.toBe('hong');
    }
  });

  it('con `confusable`, el parecido entra primero (红 → 绿; 海 → 河; 妈 → 姐; 吃 → 喝)', () => {
    // N5 ya tiene 红 y 绿 (comparten 纟). Con cualquier semilla, 绿 debe estar entre las
    // opciones: si el número de opciones es 2, es el único distractor posible.
    for (let seed = 1; seed <= 60; seed++) {
      const p = buildVocabProblem('colors', 5, 4, mulberry32(seed), { forced: 'hong' });
      expect(p.options.map(o => o.id), `semilla ${seed}`).toContain('lv');
    }
    // Naturaleza N5: 海/河 comparten 氵. 海 entra en 3, 河 en 4.
    for (let seed = 1; seed <= 60; seed++) {
      const p = buildVocabProblem('nature', 5, 4, mulberry32(seed), { forced: 'hai' });
      expect(p.options.map(o => o.id), `semilla ${seed}`).toContain('he');
    }
    // Familia N5: 妈/姐/妹 comparten 女. 妈 entra en 2, 姐 en 4.
    for (let seed = 1; seed <= 60; seed++) {
      const p = buildVocabProblem('family', 5, 4, mulberry32(seed), { forced: 'mama' });
      expect(p.options.map(o => o.id), `semilla ${seed}`).toContain('jiejie');
    }
    // Acciones N5: 吃/喝 comparten 口 y 跑/跳 comparten 足.
    for (let seed = 1; seed <= 60; seed++) {
      const boca = buildVocabProblem('actions', 5, 4, mulberry32(seed), { forced: 'chi' });
      expect(boca.options.map(o => o.id), `semilla ${seed}`).toContain('yin');
      const pie = buildVocabProblem('actions', 5, 4, mulberry32(seed), { forced: 'pao' });
      expect(pie.options.map(o => o.id), `semilla ${seed}`).toContain('tiao');
    }
  });

  it('los modos solo aparecen cuando la perilla los abre', () => {
    const vistos = (deck: 'colors' | 'animals' | 'nature' | 'family' | 'actions', nivel: number): Set<VocabMode> => {
      const out = new Set<VocabMode>();
      for (let seed = 1; seed <= 120; seed++) {
        out.add(buildVocabProblem(deck, nivel, 6, mulberry32(seed)).mode);
      }
      return out;
    };

    expect([...vistos('colors', 2)]).toEqual(['hear']);
    expect(vistos('colors', 4)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see']));
    expect(vistos('colors', 7)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see', 'see-to-glyph']));

    // Animales y Naturaleza: misma tabla de 8 palabras.
    expect([...vistos('animals', 2)]).toEqual(['hear']);
    expect(vistos('animals', 4)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see']));
    expect(vistos('animals', 7)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see', 'see-to-glyph']));

    expect([...vistos('nature', 2)]).toEqual(['hear']);
    expect(vistos('nature', 4)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see']));
    expect(vistos('nature', 7)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see', 'see-to-glyph']));

    // Familia: misma tabla de 6 palabras que colores.
    expect([...vistos('family', 2)]).toEqual(['hear']);
    expect(vistos('family', 4)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see']));
    expect(vistos('family', 7)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see', 'see-to-glyph']));

    // Acciones: misma tabla de 8 palabras que Animales/Naturaleza.
    expect([...vistos('actions', 2)]).toEqual(['hear']);
    expect(vistos('actions', 4)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see']));
    expect(vistos('actions', 7)).toEqual(new Set<VocabMode>(['hear', 'glyph-to-see', 'see-to-glyph']));
  });

  it('el audio automático sigue la perilla del nivel', () => {
    const auto = (nivel: number, modo: VocabMode): boolean[] => {
      const out: boolean[] = [];
      for (let seed = 1; seed <= 120; seed++) {
        const p = buildVocabProblem('colors', nivel, 4, mulberry32(seed));
        if (p.mode === modo) out.push(p.autoAudio);
      }
      return out;
    };

    // `hear` siempre suena solo: es la única forma de oír la palabra.
    expect(auto(1, 'hear').every(Boolean)).toBe(true);
    // A los 4 años el glifo suena solo hasta N8; en N9 deja de hacerlo (ancla).
    expect(auto(3, 'glyph-to-see').every(Boolean)).toBe(true);
    expect(auto(8, 'glyph-to-see').every(Boolean)).toBe(true);
    expect(auto(9, 'glyph-to-see').every(v => v === false)).toBe(true);
    // `see-to-glyph` no suena solo: tocar la opción es lo que pronuncia.
    expect(auto(7, 'see-to-glyph').every(v => v === false)).toBe(true);
  });

  it('listening nunca pregunta ni distrae con palabras no presentadas', () => {
    const presentadas = ['hong', 'lan', 'mao'];
    for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
      for (let seed = 1; seed <= 40; seed++) {
        const p = buildVocabProblem('listening', nivel, 6, mulberry32(seed), { poolIds: presentadas });
        expect(presentadas, `N${nivel}`).toContain(p.item.id);
        for (const o of p.options) expect(presentadas, `N${nivel}`).toContain(o.id);
      }
    }
  });

  it('un pool de una sola palabra es un error de configuración', () => {
    expect(() =>
      buildVocabProblem('listening', 1, 4, mulberry32(1), { poolIds: ['hong'] }),
    ).toThrow(/al menos 2/);
  });

  it('si el pool tiene solo dos palabras, no inventa opciones', () => {
    const p = buildVocabProblem('listening', 6, 6, mulberry32(3), { poolIds: ['hong', 'hei'] });
    expect(p.options).toHaveLength(2);
  });
});
