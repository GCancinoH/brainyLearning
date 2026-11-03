import { describe, expect, it } from 'vitest';
import {
  buildSentenceProblem,
  checkSentenceOrder,
  SENTENCE_DECKS,
  SENTENCE_LANGUAGES,
  SENTENCE_MAX_LEVEL,
  sentenceDeck,
  sentenceKnobFor,
  sentencePool,
  sentenceText,
  sentenceToken,
  shuffle,
  validateSentenceDeck,
  type SentenceDeck,
  type SentenceFrame,
} from './sentence-builder';


function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TODOS = SENTENCE_LANGUAGES.flatMap(lang => sentenceDeck(lang).frames);

describe('modelo de frases · datos', () => {
  it('los tres mazos son válidos', () => {
    for (const lang of SENTENCE_LANGUAGES) {
      expect(validateSentenceDeck(sentenceDeck(lang)), lang).toEqual([]);
    }
  });

  it('los ids de frase son únicos entre idiomas', () => {
    expect(new Set(TODOS.map(f => f.id)).size).toBe(TODOS.length);
  });

  it('cada frase tiene traducción en español e inglés y un emoji', () => {
    for (const frame of TODOS) {
      expect(frame.es.trim(), frame.id).not.toBe('');
      expect(frame.en.trim(), frame.id).not.toBe('');
      expect(frame.emoji.trim(), frame.id).not.toBe('');
    }
  });

  it('el chino es SVO: 我 喝 水', () => {
    const deck = sentenceDeck('zh');
    const frame = deck.frames.find(f => f.id === 'zh-wo-he-shui')!;
    expect(frame.tokens).toEqual(['wo', 'he', 'shui']);
    expect(sentenceText(deck, frame)).toBe('我喝水');
  });

  it('el japonés es SOV y conserva las partículas: 私 は 水 を 飲む', () => {
    const deck = sentenceDeck('ja');
    const frame = deck.frames.find(f => f.id === 'ja-watashi-wa-mizu-wo-nomu')!;
    expect(frame.tokens).toEqual(['watashi', 'wa', 'mizu', 'wo', 'nomu']);
    expect(sentenceText(deck, frame)).toBe('私は水を飲む');
    expect(sentenceToken(deck, 'wa').role).toBe('particle');
    expect(sentenceToken(deck, 'wo').role).toBe('particle');
  });

  it('el inglés usa fichas separadas por espacios: I drink water', () => {
    const deck = sentenceDeck('en');
    const frame = deck.frames.find(f => f.id === 'en-i-drink-water')!;
    expect(sentenceText(deck, frame)).toBe('I drink water');
    expect(frame.tokens).toEqual(['i', 'drink', 'water']);
  });

  it('detecta fichas desconocidas, órdenes duplicados y fichas sin usar', () => {
    const base = sentenceDeck('en');
    const roto: SentenceDeck = {
      language: 'en',
      tokens: [...base.tokens, { id: 'huerfana', text: 'x', glossEs: 'x', role: 'object' }],
      frames: [
        {
          ...base.frames[0]!,
          tokens: ['i', 'drink', 'fantasma'],
        },
        {
          ...base.frames[1]!,
          order: base.frames[0]!.order,
        },
      ],
    };
    const errores = validateSentenceDeck(roto);
    expect(errores.some(e => e.includes('fantasma'))).toBe(true);
    expect(errores.some(e => e.includes('order duplicado'))).toBe(true);
    expect(errores.some(e => e.includes('huerfana'))).toBe(true);
  });
});

describe('modelo de frases · niveles', () => {
  it('una sola perilla cambia por salto', () => {
    for (let level = 1; level < SENTENCE_MAX_LEVEL; level++) {
      const a = sentenceKnobFor(level);
      const b = sentenceKnobFor(level + 1);
      const cambios =
        Number(a.poolSize !== b.poolSize) +
        Number(a.extraTokens !== b.extraTokens) +
        Number(a.reviewFirst !== b.reviewFirst);
      expect(cambios, `N${level} → N${level + 1}`).toBeLessThanOrEqual(1);
    }
  });

  it('el pool crece y se recorta al tamaño real del mazo', () => {
    expect(sentencePool('zh', 1).length).toBe(2);
    expect(sentencePool('zh', 2).length).toBe(3);
    expect(sentencePool('zh', 7).length).toBe(8);
    expect(sentencePool('zh', 10).length).toBe(8);
    expect(sentencePool('ja', 10).length).toBe(5);
    expect(sentencePool('en', 10).length).toBe(5);
  });

  it('el pool respeta el orden de introducción', () => {
    expect(sentencePool('zh', 1).map(f => f.id)).toEqual(['zh-wo-he-shui', 'zh-wo-chi-fan']);
    expect(sentencePool('zh', 7).at(-1)!.id).toBe('zh-wo-zai-he-shui');
  });

  it('normaliza niveles fuera de rango al calcular el knob', () => {
    expect(sentenceKnobFor(0)).toEqual(sentenceKnobFor(1));
    expect(sentenceKnobFor(99)).toEqual(sentenceKnobFor(SENTENCE_MAX_LEVEL));
  });
});

describe('modelo de frases · generador', () => {
  it('en todos los idiomas y niveles construye una bandeja coherente', () => {
    for (const lang of SENTENCE_LANGUAGES) {
      const deck = sentenceDeck(lang);
      const ids = new Set(deck.tokens.map(t => t.id));
      for (let level = 1; level <= SENTENCE_MAX_LEVEL; level++) {
        for (let seed = 0; seed < 12; seed++) {
          const p = buildSentenceProblem(lang, level, 4, mulberry32(seed));
          expect(p.frame.language, `${lang} N${level}`).toBe(lang);
          expect(p.target.map(t => t.id)).toEqual(p.frame.tokens);
          expect(p.prompt).toBe(p.frame.es);
          expect(p.promptLang).toBe('es');
          expect(p.autoAudio).toBe(true);

          for (const token of p.target) {
            expect(p.tray.filter(t => t.id === token.id).length).toBe(1);
          }
          for (const token of p.tray) {
            expect(ids.has(token.id), `${lang} N${level}: ${token.id}`).toBe(true);
          }

          const knob = sentenceKnobFor(level);
          const disponibles = deck.tokens.filter(t => !p.frame.tokens.includes(t.id));
          const extraEsperada = Math.min(knob.extraTokens, disponibles.length);
          expect(p.tray.length).toBe(p.target.length + extraEsperada);
        }
      }
    }
  });

  it('a los 6 años el prompt se lee y a los 4 se oye', () => {
    expect(buildSentenceProblem('zh', 3, 4, mulberry32(1)).autoAudio).toBe(true);
    expect(buildSentenceProblem('zh', 3, 6, mulberry32(1)).autoAudio).toBe(false);
  });

  it('puede pedir el prompt en inglés', () => {
    const p = buildSentenceProblem('zh', 2, 6, mulberry32(2), { promptLang: 'en' });
    expect(p.prompt).toBe(p.frame.en);
    expect(p.promptLang).toBe('en');
  });

  it('es determinista con la misma semilla', () => {
    const a = buildSentenceProblem('zh', 8, 6, mulberry32(42));
    const b = buildSentenceProblem('zh', 8, 6, mulberry32(42));
    expect(a.frame.id).toBe(b.frame.id);
    expect(a.tray.map(t => t.id)).toEqual(b.tray.map(t => t.id));
  });

  it('respeta la frase forzada si está en el pool', () => {
    const p = buildSentenceProblem('zh', 7, 6, mulberry32(3), {
      forced: 'zh-wo-zai-he-shui',
    });
    expect(p.frame.id).toBe('zh-wo-zai-he-shui');
  });

  it('ignora una frase forzada que todavía no está en el pool', () => {
    const p = buildSentenceProblem('zh', 1, 6, mulberry32(4), {
      forced: 'zh-wo-zai-he-shui',
    });
    expect(['zh-wo-he-shui', 'zh-wo-chi-fan']).toContain(p.frame.id);
  });

  it('evita repetir la frase anterior cuando hay alternativa', () => {
    for (let seed = 0; seed < 30; seed++) {
      const p = buildSentenceProblem('zh', 2, 6, mulberry32(seed), {
        avoidId: 'zh-wo-he-shui',
      });
      expect(p.frame.id).not.toBe('zh-wo-he-shui');
    }
  });

  it('el pool nunca baja de dos frases, en ningún idioma ni nivel', () => {
    for (const lang of SENTENCE_LANGUAGES) {
      for (let level = 1; level <= SENTENCE_MAX_LEVEL; level++) {
        expect(sentencePool(lang, level).length, `${lang} N${level}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('baraja sin mutar la entrada', () => {
    const original = [1, 2, 3, 4, 5];
    const copia = [...original];
    const barajado = shuffle(original, mulberry32(7));
    expect(original).toEqual(copia);
    expect(barajado.sort()).toEqual(copia.sort());
  });
});

describe('modelo de frases · validación de orden', () => {
  const frame: SentenceFrame = sentenceDeck('zh').frames.find(f => f.id === 'zh-wo-he-shui')!;

  it('acepta el orden exacto', () => {
    expect(checkSentenceOrder(frame, ['wo', 'he', 'shui'])).toEqual({
      correct: true,
      firstWrongIndex: null,
    });
  });

  it('rechaza fichas correctas en orden incorrecto', () => {
    expect(checkSentenceOrder(frame, ['shui', 'he', 'wo'])).toEqual({
      correct: false,
      firstWrongIndex: 0,
    });
    expect(checkSentenceOrder(frame, ['wo', 'shui', 'he'])).toEqual({
      correct: false,
      firstWrongIndex: 1,
    });
  });

  it('rechaza frases incompletas y señala la primera casilla vacía', () => {
    expect(checkSentenceOrder(frame, ['wo', 'he'])).toEqual({
      correct: false,
      firstWrongIndex: 2,
    });
    expect(checkSentenceOrder(frame, [])).toEqual({
      correct: false,
      firstWrongIndex: 0,
    });
  });

  it('rechaza fichas de más', () => {
    expect(checkSentenceOrder(frame, ['wo', 'he', 'shui', 'wo'])).toEqual({
      correct: false,
      firstWrongIndex: 3,
    });
  });
});

describe('modelo de frases · cobertura', () => {
  it('cada idioma tiene al menos una frase por nivel de introducción', () => {
    for (const lang of SENTENCE_LANGUAGES) {
      const levels = new Set(sentenceDeck(lang).frames.map(f => f.level));
      for (let level = 1; level <= 4; level++) {
        expect(levels.has(level), `${lang} sin nivel ${level}`).toBe(true);
      }
    }
  });

  it('el chino introduce el progresivo 在 en una frase de 4 fichas', () => {
    const frame = SENTENCE_DECKS.zh.frames.find(f => f.id === 'zh-wo-zai-he-shui')!;
    expect(frame.tokens).toHaveLength(4);
    expect(frame.tokens).toContain('zai');
    expect(frame.es).toContain('bebiendo');
  });
});
