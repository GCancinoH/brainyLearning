import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PaintableRocket } from './paintable-rocket';

/**
 * El cohete no se pinta solo: el color entra por `--c`. Si alguien vuelve a poner un
 * `fill` inline (por ejemplo, el blanco del SVG original), el color de la palabra deja
 * de verse y el fallo es silencioso. Este test lo impide.
 */
describe('PaintableRocket', () => {
  function mount(color: string | null) {
    const fixture = TestBed.createComponent(PaintableRocket);
    fixture.componentRef.setInput('color', color);
    fixture.detectChanges();
    return fixture;
  }

  it('pinta las formas con el color recibido por --c', () => {
    const fixture = mount('#ef4444');
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;

    expect(svg.style.getPropertyValue('--c').trim()).toBe('#ef4444');
    expect(fixture.nativeElement.querySelectorAll('.rocket-body')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.rocket-nose')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.rocket-fin')).toHaveLength(2);
  });

  it('ninguna forma trae fill inline: el color lo decide el CSS', () => {
    const fixture = mount('#22c55e');
    const formas = Array.from(
      fixture.nativeElement.querySelectorAll('path'),
    ) as SVGPathElement[];

    expect(formas).toHaveLength(9);
    for (const forma of formas) {
      expect(forma.getAttribute('fill'), forma.getAttribute('class') ?? 'sin clase').toBeNull();
    }
    // Las llamas y el cristal tienen su propio color fijo, pero también por CSS.
    expect(fixture.nativeElement.querySelectorAll('.flame-outer')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.flame-inner')).toHaveLength(1);
    expect(fixture.nativeElement.querySelectorAll('.window-glass')).toHaveLength(1);
  });

  it('sin color, el CSS usa el naranja de reserva en vez de romperse', () => {
    const fixture = mount(null);
    const svg = fixture.nativeElement.querySelector('svg') as SVGSVGElement;

    expect(svg.style.getPropertyValue('--c')).toBe('');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
  });
});
