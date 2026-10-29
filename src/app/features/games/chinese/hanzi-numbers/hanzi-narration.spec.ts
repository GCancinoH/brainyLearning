import { describe, it, expect } from 'vitest';
import {
  CLIP_TEXT,
  CLIP_MANIFEST,
  ALL_CLIPS,
  numeroClip,
  NUMEROS,
  FORBIDDEN_IN_NARRATION,
  contieneVeredicto,
} from './hanzi-narration';

describe('hanzi-narration — manifiesto de audio', () => {
  // 6. Spec de narración: el manifiesto cubre 7 clips es + 99 zh-CN y todo `numeroClip(n)` existe.
  // Evita roturas silenciosas al regenerar audio (si falta una clave, el juego falla en silencio).

  it('cuenta correcta: 7 consignas en español (es-MX) + 99 números en chino (zh-CN)', () => {
    const porLang = ALL_CLIPS.reduce<Record<string, number>>((acc, k) => {
      acc[CLIP_MANIFEST[k].lang] = (acc[CLIP_MANIFEST[k].lang] ?? 0) + 1;
      return acc;
    }, {});
    expect(porLang['es-MX']).toBe(7);
    expect(porLang['zh-CN']).toBe(99);
    expect(ALL_CLIPS.length).toBe(106);
  });

  it('las 7 claves es-MX son exactamente las esperadas', () => {
    const es = ALL_CLIPS.filter(k => CLIP_MANIFEST[k].lang === 'es-MX');
    expect(es.sort()).toEqual([
      'hn.ask.a-hanzi',
      'hn.ask.a-numero',
      'hn.ask.combinar',
      'hn.duda.compara',
      'hn.duda.dieces',
      'hn.duda.oye',
      'hn.puente',
    ]);
  });

  it('las 99 claves zh-CN son hn.num.1 … hn.num.99', () => {
    const zh = ALL_CLIPS.filter(k => CLIP_MANIFEST[k].lang === 'zh-CN');
    const esperados = NUMEROS.map(n => `hn.num.${n}`);
    expect(zh.sort()).toEqual(esperados.sort());
  });

  it('`numeroClip(n)` produce claves que existen en el manifiesto para 1–99', () => {
    for (const n of NUMEROS) {
      const k = numeroClip(n);
      expect(CLIP_MANIFEST).toHaveProperty(k);
      expect(CLIP_MANIFEST[k].lang).toBe('zh-CN');
      // El TTS del número es su hanzi, no pinyin (Plantilla 6).
      expect(CLIP_MANIFEST[k].tts.length).toBeGreaterThan(0);
    }
  });

  it('ningún clip contiene palabras veredicto prohibidas', () => {
    for (const [clave, spec] of Object.entries(CLIP_MANIFEST)) {
      const prohibida = contieneVeredicto(spec.tts);
      expect(prohibida, `${clave} ("${spec.tts}") contiene "${prohibida}"`).toBeNull();
    }
  });

  it('el TTS de los números usa hanzi (no dígitos ni pinyin)', () => {
    for (const n of NUMEROS) {
      const tts = CLIP_MANIFEST[numeroClip(n)].tts;
      // Debe ser solo caracteres CJK (hanzi), sin dígitos ASCII.
      expect(/^[^\x00-\x7F]+$/u.test(tts), `hn.num.${n}="${tts}" parece no ser hanzi`).toBe(true);
    }
  });

  it('CLIP_TEXT cubre exactamente las 7 consignas es-MX (los 99 números se generan aparte)', () => {
    const esKeys = Object.keys(CLIP_TEXT).sort();
    expect(esKeys).toEqual([
      'hn.ask.a-hanzi',
      'hn.ask.a-numero',
      'hn.ask.combinar',
      'hn.duda.compara',
      'hn.duda.dieces',
      'hn.duda.oye',
      'hn.puente',
    ]);
    // Y CLIP_MANIFEST tiene esas 7 + los 99 números.
    expect(Object.keys(CLIP_MANIFEST).length).toBe(106);
  });

  // Nota: la igualdad entre el TS y el JSON exportado (tools/narration/hanzi-numbers.json)
  // se valida en CI corriendo `npx tsx tools/narration/export-hanzi.ts` y comparando el fichero.
  // Aquí no se puede leer el sistema de ficheros (entorno navegador).
});