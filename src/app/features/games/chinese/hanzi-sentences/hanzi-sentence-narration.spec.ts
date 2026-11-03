import { describe, expect, it } from 'vitest';
import {
  ALL_CLIPS,
  CLIP_MANIFEST,
  contieneVeredicto,
  promptClip,
  sayClip,
  wordClip,
} from './hanzi-sentence-narration';
import { sentenceDeck, sentenceText } from '@core/learning/sentence-builder';

const deck = sentenceDeck('zh');

describe('narración de frases Hanzi', () => {
  it('tiene un clip por ficha, por frase y por prompt', () => {
    for (const token of deck.tokens) {
      expect(CLIP_MANIFEST[wordClip(token.id)], token.id).toBeTruthy();
    }
    for (const frame of deck.frames) {
      expect(CLIP_MANIFEST[promptClip(frame.id)], frame.id).toBeTruthy();
      expect(CLIP_MANIFEST[sayClip(frame.id)], frame.id).toBeTruthy();
    }
  });

  it('las fichas y las frases resueltas se dicen en chino con el hanzi exacto', () => {
    for (const token of deck.tokens) {
      const spec = CLIP_MANIFEST[wordClip(token.id)]!;
      expect(spec.lang).toBe('zh-CN');
      expect(spec.tts).toBe(token.text);
    }
    for (const frame of deck.frames) {
      const spec = CLIP_MANIFEST[sayClip(frame.id)]!;
      expect(spec.lang).toBe('zh-CN');
      expect(spec.tts).toBe(sentenceText(deck, frame));
    }
  });

  it('los prompts se dicen en español y no revelan el orden chino', () => {
    for (const frame of deck.frames) {
      const spec = CLIP_MANIFEST[promptClip(frame.id)]!;
      expect(spec.lang).toBe('es-MX');
      expect(spec.tts).toBe(frame.es);
      expect(spec.tts).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('ningún clip contiene un veredicto', () => {
    for (const key of ALL_CLIPS) {
      expect(contieneVeredicto(CLIP_MANIFEST[key]!.tts), key).toBeNull();
    }
  });

  it('las claves son únicas y no hay clips huérfanos', () => {
    expect(new Set(ALL_CLIPS).size).toBe(ALL_CLIPS.length);
    expect(ALL_CLIPS.length).toBe(2 + deck.tokens.length + deck.frames.length * 2);
  });
});
