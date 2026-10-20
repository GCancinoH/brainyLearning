import { describe, expect, it } from 'vitest';
import { distancia, evaluarTrazo, type Punto } from './stroke-check';

/** El trazo esperado: una horizontal de 木, de izquierda a derecha. */
const horizontal: Punto[] = [
  { x: 0.2, y: 0.5 },
  { x: 0.5, y: 0.5 },
  { x: 0.8, y: 0.5 },
];

const recorrido = (...pts: Punto[]): Punto[] => pts;

describe('distancia', () => {
  it('mide en fracción del lado del lienzo', () => {
    expect(distancia({ x: 0, y: 0 }, { x: 0.3, y: 0.4 })).toBeCloseTo(0.5);
  });
});

describe('evaluarTrazo', () => {
  it('acepta un trazo paralelo al esperado, aunque no coincida punto a punto', () => {
    const v = evaluarTrazo(
      recorrido({ x: 0.24, y: 0.52 }, { x: 0.76, y: 0.48 }),
      horizontal,
    );
    expect(v.esToque).toBe(false);
    expect(v.direccionOk).toBe(true);
    expect(v.aceptado).toBe(true);
  });

  it('rechaza el mismo trazo al revés: es el fallo que hay que devolver', () => {
    const v = evaluarTrazo(
      recorrido({ x: 0.8, y: 0.5 }, { x: 0.2, y: 0.5 }),
      horizontal,
    );
    expect(v.direccionOk).toBe(false);
    expect(v.aceptado).toBe(false);
  });

  it('rechaza un trazo perpendicular', () => {
    const v = evaluarTrazo(
      recorrido({ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }),
      horizontal,
    );
    expect(v.direccionOk).toBe(false);
    expect(v.aceptado).toBe(false);
  });

  it('una diagonal torcida sigue siendo el mismo trazo', () => {
    // La forma no es la horizontal perfecta, pero va hacia donde tiene que ir. A los 4
    // años la forma sale torre siempre: eso no es un error, es una mano sin control fino.
    const v = evaluarTrazo(
      recorrido({ x: 0.22, y: 0.62 }, { x: 0.78, y: 0.4 }),
      horizontal,
    );
    expect(v.aceptado).toBe(true);
  });

  it('ignora un toque suelto: ni lo acepta ni lo rechaza', () => {
    const v = evaluarTrazo(recorrido({ x: 0.5, y: 0.5 }), horizontal);
    expect(v.esToque).toBe(true);
    expect(v.aceptado).toBe(false);
  });

  it('ignora un trazo más corto que el mínimo', () => {
    const v = evaluarTrazo(
      recorrido({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }),
      horizontal,
    );
    expect(v.esToque).toBe(true);
    expect(v.aceptado).toBe(false);
  });

  it('acepta aunque empiece lejos del punto de entrada: decide la dirección', () => {
    // Empieza 0,3 por debajo de donde empieza el trazo real — fuera de tolerancia— pero
    // traza en la buena dirección. Se acepta y se anota la distancia, que es lo que sirve
    // para elegir qué decirle, no para rechazarla.
    const v = evaluarTrazo(
      recorrido({ x: 0.2, y: 0.8 }, { x: 0.8, y: 0.8 }),
      horizontal,
    );
    expect(v.entradaOk).toBe(false);
    expect(v.distanciaEntrada).toBeGreaterThan(0.2);
    expect(v.aceptado).toBe(true);
  });

  it('marca la entrada correcta cuando empieza donde hay que empezar', () => {
    const v = evaluarTrazo(
      recorrido({ x: 0.21, y: 0.49 }, { x: 0.79, y: 0.51 }),
      horizontal,
    );
    expect(v.entradaOk).toBe(true);
    expect(v.aceptado).toBe(true);
  });

  it('no revienta con trazos vacíos', () => {
    expect(evaluarTrazo([], horizontal).esToque).toBe(true);
    expect(evaluarTrazo(recorrido(), horizontal).esToque).toBe(true);
  });
});
