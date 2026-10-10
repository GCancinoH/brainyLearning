import { describe, it, expect } from 'vitest';
import {
  buildRound, regionOf, blocksToPlace, matches, vennRegionAt, label, predicate, hintFor, Round, mulberry32
} from './logic-blocks-problem';


const each = (age: number, fn: (r: Round, level: number) => void, n = 300) => {
  const rng = mulberry32(age * 31 + 5);
  for (let level = 1; level <= 10; level++) for (let i = 0; i < n; i++) fn(buildRound(level, age, rng), level);
};

describe('4 años: una propiedad', () => {
  it('modo correcto por nivel y ids únicos', () => {
    each(4, (r, lvl) => {
      expect(r.mode).toBe(lvl <= 7 ? 'one' : 'two');
      expect(new Set(r.blocks.map(b => b.id)).size).toBe(r.blocks.length);
      expect(r.blocks.length).toBeGreaterThanOrEqual(6);
      expect(r.blocks.length).toBeLessThanOrEqual(8);
    });
  });

  it('una canasta: hay 2-4 figuras que cumplen y al menos 2 que no', () => {
    each(4, (r, lvl) => {
      if (r.mode !== 'one') return;
      const yes = blocksToPlace(r).length;
      expect(yes).toBeGreaterThanOrEqual(2);
      expect(yes).toBeLessThanOrEqual(4);
      expect(r.blocks.length - yes).toBeGreaterThanOrEqual(2);
      if (lvl <= 2) {
        expect(r.a.kind).toBe('color');
        expect(r.blocks.every(b => b.shape === 'circle')).toBe(true);   // solo cambia el color
      }
      if (lvl >= 3 && lvl <= 4) {
        expect(r.a.kind).toBe('shape');
        expect(new Set(r.blocks.map(b => b.color)).size).toBe(1);        // solo cambia la forma
      }
      expect(r.blocks.every(b => b.size === 'big')).toBe(true);
    });
  });

  it('dos canastas: toda figura va en A o en B, y ambas canastas tienen figuras', () => {
    each(4, r => {
      if (r.mode !== 'two') return;
      expect(r.b).not.toBeNull();
      expect(r.b!.kind).toBe(r.a.kind);
      expect(r.b!.value).not.toBe(r.a.value);
      const inA = r.blocks.filter(b => matches(b, r.a)).length;
      const inB = r.blocks.filter(b => matches(b, r.b!)).length;
      expect(inA + inB).toBe(r.blocks.length);
      expect(inA).toBeGreaterThanOrEqual(2);
      expect(inB).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('6 años: diagrama de Venn', () => {
  it('A y B son de propiedades distintas y las tres regiones tienen figuras', () => {
    each(6, (r, lvl) => {
      expect(r.mode).toBe('venn');
      expect(r.a.kind).not.toBe(r.b!.kind);
      const regions = r.blocks.map(b => regionOf(r, b));
      expect(regions).toContain('A');
      expect(regions).toContain('both');
      expect(regions).toContain('B');
      if (lvl >= 4) expect(regions).toContain('none');
      else expect(regions).not.toContain('none');
      expect(new Set(r.blocks.map(b => b.id)).size).toBe(r.blocks.length);
    });
  });

  it('el tamaño solo aparece desde el nivel 7', () => {
    each(6, (r, lvl) => {
      if (lvl <= 6) {
        expect(r.a.kind !== 'size' && r.b!.kind !== 'size').toBe(true);
        expect(r.blocks.every(b => b.size === 'big')).toBe(true);
      }
    });
  });

  it('la cantidad de figuras crece con el nivel', () => {
    const avg = (lvl: number) => {
      const rng = mulberry32(lvl);
      return Array.from({ length: 300 }, () => buildRound(lvl, 6, rng).blocks.length).reduce((x, y) => x + y, 0) / 300;
    };
    expect(avg(1)).toBeLessThan(avg(5));
    expect(avg(5)).toBeLessThan(avg(10));
  });

  it('regionOf coincide con la pertenencia a A y B', () => {
    each(6, r => {
      for (const b of r.blocks) {
        const inA = matches(b, r.a), inB = matches(b, r.b!);
        expect(regionOf(r, b)).toBe(inA && inB ? 'both' : inA ? 'A' : inB ? 'B' : 'none');
      }
    }, 60);
  });
});

describe('geometría de Venn', () => {
  const W = 500, H = 300;
  it('distingue A, intersección, B y fuera', () => {
    expect(vennRegionAt(0.2 * W, 0.5 * H, W, H)).toBe('A');
    expect(vennRegionAt(0.5 * W, 0.5 * H, W, H)).toBe('both');
    expect(vennRegionAt(0.8 * W, 0.5 * H, W, H)).toBe('B');
    expect(vennRegionAt(0.02 * W, 0.02 * H, W, H)).toBeNull();
    expect(vennRegionAt(0.5 * W, 0.99 * H, W, H)).toBeNull();
  });
  it('la intersección es lo bastante ancha para un dedo (> 15% del ancho)', () => {
    let width = 0;
    for (let x = 0; x <= W; x++) if (vennRegionAt(x, 0.5 * H, W, H) === 'both') width++;
    expect(width / W).toBeGreaterThan(0.15);
  });
});

describe('textos', () => {
  it('concuerdan en género y número', () => {
    expect(label({ kind: 'color', value: 'red' })).toBe('Figuras rojas');
    expect(label({ kind: 'shape', value: 'triangle' })).toBe('Triángulos');
    expect(predicate({ kind: 'color', value: 'yellow' })).toBe('amarilla');
    const r = buildRound(1, 4, mulberry32(1));
    expect(hintFor(r)).toMatch(/^Mira la figura: ¿es /);
  });
});
