import { describe, it, expect } from 'vitest';
import {
  ALL_CLIPS, CLIP_MANIFEST, clipsForProblem, kanjiMeaning, kanjiStory, kanjiWord,
  pieceMeaning, pieceWord, socraticLine, socraticLinesFor, storyCues, sys, textoParaVoz
} from './kanji-narration';
import { KANJI_COMPOSITIONS, SOCRATIC_LINES, pieceData } from './kanji-composition';

/** Solo hiragana y katakana largo. Ni kanji, ni ASCII, ni dígitos. */
const HIRAGANA = /^[぀-ゟー]+$/;
const CJK_O_EMOJI = /[぀-ヿ一-鿿豈-﫿　-〿＀-￯\p{Extended_Pictographic}]/u;

describe('Guion hablado de kanji-compose', () => {
  // ============================================
  // LAS TRES REGLAS DEL CONTENIDO
  // ============================================

  describe('reglas del contenido', () => {
    it('el TTS japonés recibe SOLO hiragana (nunca un kanji)', () => {
      // Es la regla que arregla el problema original: mandar '明' al TTS deja que el motor
      // elija la lectura, y en un tablet sin voz ja-JP directamente no suena nada.
      const sinHiragana = ALL_CLIPS
        .filter(k => CLIP_MANIFEST[k].lang === 'ja-JP')
        .filter(k => !HIRAGANA.test(CLIP_MANIFEST[k].tts));
      expect(sinHiragana, `clips japoneses que no son hiragana puro: ${sinHiragana.join(', ')}`).toEqual([]);
    });

    it('el TTS español no recibe ni emojis ni CJK (los intentaría leer)', () => {
      const sucios = ALL_CLIPS
        .filter(k => CLIP_MANIFEST[k].lang === 'es-MX')
        .filter(k => CJK_O_EMOJI.test(CLIP_MANIFEST[k].tts));
      expect(sucios, `clips españoles con ruido: ${sucios.join(', ')}`).toEqual([]);
    });

    it('el TTS español no dice "mal", "incorrecto" ni "no es"', () => {
      const prohibido = ['incorrecto', 'está mal', 'mal hecho', 'no es', 'equivocado', 'fallaste'];
      for (const [k, spec] of Object.entries(CLIP_MANIFEST)) {
        for (const palabra of prohibido) {
          expect(spec.tts.toLowerCase(), `${k}: "${spec.tts}" dice "${palabra}"`).not.toContain(palabra);
        }
      }
    });

    it('ningún clip tiene el texto vacío (un vacío suena como un glitch)', () => {
      const vacios = ALL_CLIPS.filter(k => !CLIP_MANIFEST[k].tts.trim());
      expect(vacios).toEqual([]);
    });

    it('todas las lecturas de las piezas y compuestos son hiragana', () => {
      for (const c of KANJI_COMPOSITIONS) {
        expect(HIRAGANA.test(c.reading), `${c.id} ("${c.reading}") no es hiragana`).toBe(true);
      }
      const usadas = new Set(KANJI_COMPOSITIONS.flatMap(c => c.slots.map(s => s.kanji)));
      for (const kanji of usadas) {
        const p = pieceData(kanji);
        expect(HIRAGANA.test(p.reading), `pieza ${p.id} ("${p.reading}") no es hiragana`).toBe(true);
      }
    });
  });

  // ============================================
  // LOS HERMANOS
  // ============================================

  describe('hermanos', () => {
    it('sus lecturas están en hiragana, no en katakana', () => {
      // Antes eran マツ y ミ: exactamente lo que la de 6 años olvida.
      for (const c of KANJI_COMPOSITIONS) {
        for (const sib of c.siblings ?? []) {
          expect(HIRAGANA.test(sib.reading), `${c.id}: hermano ${sib.kanji} ("${sib.reading}")`).toBe(true);
        }
      }
    });

    it('el hermano de 森 (林) tiene la misma palabra que 林', () => {
      // 林 es はやし tanto como composición como hermano: si se oyeran distinto, la niña
      // oiría "hayashi" para 森 y se pensaría que son palabras distintas.
      const mori = KANJI_COMPOSITIONS.find(c => c.id === 'mori')!;
      expect(mori.siblings![0].reading).toBe('はやし');
      expect(CLIP_MANIFEST[kanjiWord('rin')].tts).toBe('はやし');
    });
  });

  // ============================================
  // LAS LÍNEAS SOCRÁTICAS SE DERIVAN
  // ============================================

  describe('líneas socráticas', () => {
    it('cada línea de audio viene del texto de pantalla, sin emojis', () => {
      // Se derivan en vez de escribirse aparte: si fueran dos listas, la de audio se
      // quedaría vieja en cuanto se reescribiera un texto, sin que nadie se entere.
      for (const momento of Object.keys(SOCRATIC_LINES) as (keyof typeof SOCRATIC_LINES)[]) {
        const audio = socraticLinesFor(momento);
        expect(audio.length, momento).toBe(SOCRATIC_LINES[momento].length);
        for (const texto of audio) {
          expect(texto, `${momento}: "${texto}"`).not.toMatch(CJK_O_EMOJI);
        }
      }
    });

    it('el texto de pantalla y el de audio dicen lo mismo, sin el emoji delante', () => {
      const enPantalla = SOCRATIC_LINES['wrong-piece'][0];
      const enAudio = socraticLinesFor('wrong-piece')[0];
      expect(enAudio).toBe(textoParaVoz(enPantalla));
      expect(enAudio.startsWith('¿') || enAudio.startsWith('¡')).toBe(true);
    });

    it('el recuento de líneas por momento es el real', () => {
      // Si el juego pidiera la línea 7 de un momento que tiene 3, buscaría un clip que no
      // existe y caería al TTS con `undefined`.
      for (const momento of Object.keys(SOCRATIC_LINES) as (keyof typeof SOCRATIC_LINES)[]) {
        for (let i = 0; i < SOCRATIC_LINES[momento].length; i++) {
          expect(CLIP_MANIFEST[socraticLine(momento, i)], `${momento}.${i}`).toBeTruthy();
        }
      }
    });
  });

  // ============================================
  // EL CINE: SECUENCIA DE LA HISTORIA
  // ============================================

  describe('storyCues', () => {
    const mei = KANJI_COMPOSITIONS[0]!;

    it('empieza y termina con la palabra del kanji', () => {
      const cues = storyCues(mei, { age: 4, mode: 'full' });
      expect(cues[0].clip).toBe(kanjiWord('mei'));
      expect(cues[cues.length - 2].clip).toBe(kanjiWord('mei'));
    });

    it('a los 4 años en modo full: palabra → historia → piezas → palabra → "ahora tú"', () => {
      const cues = storyCues(mei, { age: 4, mode: 'full' });
      const clips = cues.map(c => c.clip);
      expect(clips).toContain(kanjiStory('mei'));
      // Cada pieza suena dos veces: su nombre en japonés y su significado en español.
      expect(clips).toContain(pieceWord('hi'));
      expect(clips).toContain(pieceMeaning('hi'));
      expect(clips).toContain(pieceWord('tsuki'));
      expect(clips).toContain(pieceMeaning('tsuki'));
      expect(clips[clips.length - 1]).toBe(sys('now-you'));
    });

    it('a los 6 años NO suena la historia ni el significado de las piezas (las lee)', () => {
      const clips = storyCues(mei, { age: 6, mode: 'full' }).map(c => c.clip);
      expect(clips).not.toContain(kanjiStory('mei'));
      expect(clips).not.toContain(pieceMeaning('hi'));
      // Pero sí el nombre de cada pieza.
      expect(clips).toContain(pieceWord('hi'));
    });

    it('modo skip: solo suena el kanji, una vez', () => {
      for (const age of [4, 6] as const) {
        const cues = storyCues(mei, { age, mode: 'skip' });
        expect(cues.length, `edad ${age}`).toBe(1);
        expect(cues[0].clip).toBe(kanjiWord('mei'));
      }
    });

    it('modo short no lleva historia', () => {
      const clips = storyCues(mei, { age: 4, mode: 'short' }).map(c => c.clip);
      expect(clips).not.toContain(kanjiStory('mei'));
      expect(clips.filter(c => c === kanjiWord('mei')).length).toBe(2);
    });

    it('cada cue lleva la etiqueta que ilumina el elemento correcto', () => {
      const cues = storyCues(mei, { age: 4, mode: 'full' });
      const etiquetas = cues.map(c => (c.tag ? JSON.stringify(c.tag) : 'SIN-TAG'));
      // El kanji se ilumina 2 veces (al principio y al final).
      expect(etiquetas.filter(t => t === JSON.stringify({ kind: 'kanji' })).length).toBe(2);
      // Cada pieza se ilumina dos veces: su nombre y su significado.
      expect(etiquetas.filter(t => t === JSON.stringify({ kind: 'piece', index: 0 })).length).toBe(2);
      expect(etiquetas.filter(t => t === JSON.stringify({ kind: 'piece', index: 1 })).length).toBe(2);
      // La historia no ilumina nada: no hay elemento al que señalar.
      expect(etiquetas.filter(t => t === 'SIN-TAG').length).toBeGreaterThan(0);
    });

    it('TODAS las claves que produce existen en el manifiesto, para los 13 compuestos', () => {
      for (const c of KANJI_COMPOSITIONS) {
        for (const age of [4, 6] as const) {
          for (const mode of ['full', 'short', 'skip'] as const) {
            for (const cue of storyCues(c, { age, mode })) {
              expect(CLIP_MANIFEST[cue.clip], `${c.id}/${age}/${mode}: ${cue.clip}`).toBeTruthy();
            }
          }
        }
      }
    });

    it('las piezas que se iluminan están en el mismo orden que los huecos', () => {
      // Si el orden no coincidiera, se iluminaría la pieza equivocada justo cuando suena:
      // el karaoke estaría **mintiendo**, que es peor que no tenerlo.
      for (const c of KANJI_COMPOSITIONS) {
        const indices = storyCues(c, { age: 4, mode: 'full' })
          .map(cue => cue.tag)
          .filter((t): t is { kind: 'piece'; index: number } => !!t && t.kind === 'piece')
          .map(t => t.index);
        expect(indices, c.id).toEqual(c.slots.flatMap((_, i) => [i, i]));
      }
    });
  });

  // ============================================
  // COBERTURA
  // ============================================

  describe('cobertura del manifiesto', () => {
    it('cada compuesto tiene sus cuatro clips', () => {
      for (const c of KANJI_COMPOSITIONS) {
        for (const clave of [kanjiWord(c.id), kanjiMeaning(c.id), kanjiStory(c.id)]) {
          expect(CLIP_MANIFEST[clave], `${c.id}: ${clave}`).toBeTruthy();
        }
      }
    });

    it('cada pieza usada tiene su nombre y su significado', () => {
      const usadas = new Set(KANJI_COMPOSITIONS.flatMap(c => c.slots.map(s => s.kanji)));
      for (const kanji of usadas) {
        const p = pieceData(kanji);
        expect(CLIP_MANIFEST[pieceWord(p.id)], `pieza ${p.id}`).toBeTruthy();
        expect(CLIP_MANIFEST[pieceMeaning(p.id)], `pieza ${p.id}`).toBeTruthy();
      }
    });

    it('clipsForProblem devuelve solo clips que existen', () => {
      for (const c of KANJI_COMPOSITIONS) {
        for (const clip of clipsForProblem(c)) {
          expect(CLIP_MANIFEST[clip], `${c.id}: ${clip}`).toBeTruthy();
        }
      }
    });

    it('ningún composed usa una pieza fuera del catálogo', () => {
      // `pieceData` devuelve `{reading: '', ...}` cuando no encuentra el kanji. Con
      // clips reales eso ya no es "se ve raro": es que el TTS recibe una cadena vacía y
      // no suena nada. El `id` vacío es la única señal que queda.
      for (const c of KANJI_COMPOSITIONS) {
        for (const slot of c.slots) {
          const p = pieceData(slot.kanji);
          expect(p.id, `${c.id}: la pieza "${slot.kanji}" no está en el catálogo`).toBeTruthy();
          expect(p.reading, `${c.id}: "${slot.kanji}" sin lectura`).toBeTruthy();
        }
      }
    });

    it('los homófonos 日 y 火 comparten sonido a propósito, y el manifiesto lo refleja', () => {
      // 日 y 火 se leen los dos ひ. No es un error del catálogo: es el idioma. Se distinguen
      // por significado y emoji. Lo que NO puede pasar es que el audio los diga distinto.
      expect(pieceData('日').reading).toBe(pieceData('火').reading);
      expect(CLIP_MANIFEST[pieceWord(pieceData('日').id)].tts).toBe('ひ');
      expect(CLIP_MANIFEST[pieceWord(pieceData('火').id)].tts).toBe('ひ');
      // Pero sí se distinguen por lo que significan, que es lo que se enseña.
      expect(CLIP_MANIFEST[pieceMeaning(pieceData('日').id)].tts).toBe('sol');
      expect(CLIP_MANIFEST[pieceMeaning(pieceData('火').id)].tts).toBe('fuego');
    });
  });
});