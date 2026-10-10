import { describe, it, expect } from 'vitest';
import { buildRound, COLORS, SHAPES, SIZES, mulberry32 } from './logic-blocks-problem';
import {
  CLIP_TEXT, FORBIDDEN_IN_NARRATION, clipForLabel, clipForQuestion, clipForRule,
  clipForZone, textForRule
} from './logic-blocks-narration';


describe('Guion de logic-blocks', () => {
  describe('cobertura de claves', () => {
    it('toda regla de color tiene clip de consigna, pregunta y etiqueta', () => {
      for (const value of COLORS) {
        const attr = { kind: 'color', value } as const;
        expect(clipForRule({ mode: 'one', a: attr, b: null, blocks: [] }), `one/${value}`).toBeTruthy();
        expect(clipForQuestion(attr), `q/${value}`).toBeTruthy();
        expect(clipForLabel(attr), `label/${value}`).toBeTruthy();
      }
    });

    it('toda regla de forma tiene clip de consigna, pregunta y etiqueta', () => {
      for (const value of SHAPES) {
        const attr = { kind: 'shape', value } as const;
        expect(clipForRule({ mode: 'one', a: attr, b: null, blocks: [] }), `one/${value}`).toBeTruthy();
        expect(clipForQuestion(attr), `q/${value}`).toBeTruthy();
        expect(clipForLabel(attr), `label/${value}`).toBeTruthy();
      }
    });

    it('clipForRule existe para TODA ronda que buildRound puede generar a los 10 niveles', () => {
      const rng = mulberry32(12345);
      for (let level = 1; level <= 10; level++) {
        for (let i = 0; i < 30; i++) {
          const round = buildRound(level, 4, rng);
          expect(clipForRule(round), `nivel ${level} ronda ${i}`).toBeTruthy();
          expect(textForRule(round)).toBeTruthy();
        }
      }
    });

    it('clipForRule existe para las rondas de 6 años (Venn)', () => {
      const rng = mulberry32(999);
      for (let level = 1; level <= 10; level++) {
        const round = buildRound(level, 6, rng);
        expect(round.mode).toBe('venn');
        expect(clipForRule(round), `nivel ${level}`).toBeTruthy();
      }
    });

    it('cada basket del modo "two" tiene su etiqueta hablada', () => {
      const rng = mulberry32(7);
      for (let level = 8; level <= 10; level++) {
        const round = buildRound(level, 4, rng);
        expect(clipForZone(round, 'A'), `A@${level}`).toBeTruthy();
        expect(clipForZone(round, 'B'), `B@${level}`).toBeTruthy();
      }
    });
  });

  describe('alcance de los clips de tamaño', () => {
    it('NO inventa claves para un Attr de tamaño en los modos one/two', () => {
      // El tamaño solo es regla en el Venn de 6 años (nivel >= 7). Para 4 años todas
      // las figuras son 'big' y la regla nunca es de tamaño. Devolver una clave
      // inexistente haría que Narrator buscara un .wav inexistente en silencio.
      for (const value of SIZES) {
        const attr = { kind: 'size', value } as const;
        expect(clipForLabel(attr), `label/${value}`).toBeNull();
        expect(clipForQuestion(attr), `q/${value}`).toBeNull();
        expect(clipForRule({ mode: 'one', a: attr, b: null, blocks: [] })).toBeNull();
      }
    });

    it('clipForZone devuelve null fuera del modo two', () => {
      const round = buildRound(1, 4, mulberry32(3));
      expect(clipForZone(round, 'A')).toBeNull();
    });
  });

  describe('método Zvonkin: ninguna frase emite un veredicto', () => {
    it('ninguna frase contiene palabras prohibidas', () => {
      for (const [key, text] of Object.entries(CLIP_TEXT)) {
        const lower = text.toLowerCase();
        for (const palabra of FORBIDDEN_IN_NARRATION) {
          expect(lower, `${key}: "${text}" contiene "${palabra}"`).not.toContain(palabra);
        }
      }
    });

    it('las preguntas socráticas son preguntas (empiezan por interrogación)', () => {
      const preguntas = Object.entries(CLIP_TEXT).filter(([k]) => k.startsWith('lb.q.'));
      expect(preguntas.length).toBeGreaterThan(0);
      for (const [key, text] of preguntas) {
        expect(text.trim().startsWith('¿'), `${key}: "${text}" no es una pregunta`).toBe(true);
      }
    });
  });

  describe('concordancia del español', () => {
    it('usa "todas las figuras" con adjetivos en femenino y "todos los" con sustantivos', () => {
      // "las figuras rojas" / "las figuras azules" / "las figuras amarillas"
      for (const v of ['red', 'blue', 'yellow']) {
        expect(CLIP_TEXT[`lb.one.color.${v}`]).toContain('todas las figuras');
      }
      // "los círculos" / "los cuadrados" / "los triángulos"
      for (const v of ['circle', 'square', 'triangle']) {
        expect(CLIP_TEXT[`lb.one.shape.${v}`]).toContain('todos los');
      }
    });

    it('las preguntas usan el singular ("¿Esta figura es un círculo?")', () => {
      expect(CLIP_TEXT['lb.q.shape.circle']).toContain('un círculo');
      expect(CLIP_TEXT['lb.q.color.red']).toContain('es roja');
      expect(CLIP_TEXT['lb.q.color.blue']).toContain('es azul');
      expect(CLIP_TEXT['lb.q.color.yellow']).toContain('es amarilla');
    });
  });

});
