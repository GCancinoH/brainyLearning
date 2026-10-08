import { describe, it, expect } from 'vitest';
import { coinWays, distinctSolutions } from './combinations';

describe('distinctSolutions', () => {
  it('cuenta combinaciones por valores, sin repetir permutaciones ni piezas gemelas', () => {
    expect(distinctSolutions([2, 3, 3, 4, 6], 6).sort()).toEqual(['2+4', '3+3', '6']);
  });

  it('devuelve vacío si no hay forma de llenar', () => {
    expect(distinctSolutions([4, 4, 4], 5)).toEqual([]);
  });

  it('reutiliza una pieza solo una vez: es suministro limitado', () => {
    // La pieza 5 está una sola vez, así que 10 = 5+5 es imposible.
    expect(distinctSolutions([5, 5], 10)).toEqual(['5+5']);
    expect(distinctSolutions([5], 10)).toEqual([]);
  });
});

describe('coinWays — suministro ilimitado', () => {
  it('encuentra las 6 formas de pagar 7 con monedas de 1, 2 y 5', () => {
    expect(coinWays([1, 2, 5], 7).sort()).toEqual([
      '1+1+1+1+1+1+1',
      '1+1+1+1+1+2',
      '1+1+1+2+2',
      '1+1+5',
      '1+2+2+2',
      '2+5',
    ]);
  });

  it('permite reutilizar la misma denominación, a diferencia de distinctSolutions', () => {
    expect(coinWays([5], 15)).toEqual(['5+5+5']);
    // El contraste que justifica que las dos funciones existan:
    expect(distinctSolutions([5], 15)).toEqual([]);
  });

  it('no produce duplicados por permutación en ningún objetivo', () => {
    for (const denoms of [[1, 2, 5], [1, 2, 5, 10]]) {
      for (let target = 1; target <= 20; target++) {
        const ways = coinWays(denoms, target);
        expect(new Set(ways).size).toBe(ways.length);
      }
    }
  });

  it('cada combinación suma exactamente el objetivo', () => {
    for (const denoms of [[1, 2, 5], [1, 2, 5, 10]]) {
      for (let target = 1; target <= 20; target++) {
        for (const way of coinWays(denoms, target)) {
          const sum = way.split('+').reduce((s, v) => s + Number(v), 0);
          expect(sum).toBe(target);
        }
      }
    }
  });

  it('devuelve vacío si ninguna combinación alcanza el objetivo', () => {
    expect(coinWays([5, 10], 7)).toEqual([]);
    expect(coinWays([], 5)).toEqual([]);
    expect(coinWays([5], 4)).toEqual([]);
  });

  it('ignora denominaciones duplicadas o no positivas', () => {
    expect(coinWays([1, 1, 2], 3).sort()).toEqual(coinWays([1, 2], 3).sort());
    expect(coinWays([0, -1, 2], 4)).toEqual(['2+2']);
  });

  it('devuelve vacío para objetivos no positivos', () => {
    expect(coinWays([1, 2, 5], 0)).toEqual([]);
    expect(coinWays([1, 2, 5], -3)).toEqual([]);
  });

  it('la moneda de $10 amplía el número de formas solo a partir de 10', () => {
    // Con 1,2,5 no se puede llegar a 10 usando un 10; con 1,2,5,10 sí.
    expect(coinWays([1, 2, 5], 9).length).toBe(8);
    expect(coinWays([1, 2, 5, 10], 9).length).toBe(8);
    expect(coinWays([1, 2, 5], 10).length).toBe(10);
    expect(coinWays([1, 2, 5, 10], 10).length).toBe(11);
  });
});