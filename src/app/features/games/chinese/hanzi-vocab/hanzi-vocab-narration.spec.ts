import { describe, expect, it } from 'vitest';
import { HANZI_VOCAB } from '@core/learning/hanzi-vocab';
import {
  ALL_CLIPS,
  CLIP_BASE,
  CLIP_EXT,
  CLIP_MANIFEST,
  CLIP_TEXT,
  DUDA_COMPARA,
  DUDA_OYE,
  MODE_CLIP,
  PUENTE,
  contieneVeredicto,
  wordClip,
} from './hanzi-vocab-narration';
import { MAX_LEVEL, knobFor } from './hanzi-vocab-problem';

describe('narración del vocabulario Hanzi', () => {
  it('una carpeta y una extensión, declaradas una sola vez', () => {
    expect(CLIP_BASE).toBe('audio/hanzi-vocab');
    expect(CLIP_EXT).toBe('m4a');
  });

  it('hay un clip por palabra, sin duplicados', () => {
    const palabras = HANZI_VOCAB.map(i => wordClip(i.id));
    expect(new Set(palabras).size).toBe(HANZI_VOCAB.length);
    for (const key of palabras) expect(CLIP_MANIFEST[key], key).toBeTruthy();
  });

  it('las palabras van en zh-CN y dicen el propio hanzi, nunca pinyin', () => {
    for (const item of HANZI_VOCAB) {
      const spec = CLIP_MANIFEST[wordClip(item.id)]!;
      expect(spec.lang, item.id).toBe('zh-CN');
      expect(spec.tts, item.id).toBe(item.hanzi);
      // Sin letras latinas ni dígitos: el TTS de una palabra es el carácter, no su lectura.
      expect(spec.tts, item.id).toMatch(/^[\u4e00-\u9fff]+$/);
    }
  });

  it('las consignas y dudas están en español', () => {
    for (const key of [
      MODE_CLIP.hear,
      MODE_CLIP['glyph-to-see'],
      MODE_CLIP['see-to-glyph'],
      DUDA_OYE,
      DUDA_COMPARA,
      PUENTE,
    ]) {
      expect(CLIP_MANIFEST[key], key).toBeTruthy();
      expect(CLIP_MANIFEST[key]!.lang, key).toBe('es-MX');
      expect(CLIP_MANIFEST[key]!.tts.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('no hay clips huérfanos: todo texto está en el manifiesto', () => {
    for (const key of Object.keys(CLIP_TEXT)) {
      expect(CLIP_MANIFEST[key], key).toBeTruthy();
    }
    expect(ALL_CLIPS).toHaveLength(Object.keys(CLIP_TEXT).length + HANZI_VOCAB.length);
  });

  it('ninguna frase es un veredicto', () => {
    for (const key of ALL_CLIPS) {
      expect(contieneVeredicto(CLIP_MANIFEST[key]!.tts), key).toBeNull();
    }
  });

  it('contieneVeredicto sí detecta un juicio', () => {
    expect(contieneVeredicto('Eso está mal')).toBe('está mal');
    expect(contieneVeredicto('¡Muy bien!')).toBeNull();
  });

  it('las claves que puede pedir el generador existen en el manifiesto', () => {
    // En cualquier nivel/modo, el clip de consigna debe existir. Las palabras ya se
    // comprobaron arriba; esto cubre el enlace entre generador y narración.
    for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
      for (const mode of knobFor('colors', nivel).modes) {
        expect(CLIP_MANIFEST[MODE_CLIP[mode]], `N${nivel} ${mode}`).toBeTruthy();
      }
    }
  });
});
