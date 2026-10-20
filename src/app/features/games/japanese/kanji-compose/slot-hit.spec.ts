import { describe, expect, it } from 'vitest';
import { nearestSlot } from './slot-hit';

// Dos huecos de 84 px con centros a 134 px (caso 明): los márgenes se solapan.
const boxes = [
  { left: 0, top: 0, right: 84, bottom: 84 },
  { left: 134, top: 0, right: 218, bottom: 84 },
];

describe('nearestSlot', () => {
  it('elige el hueco que contiene el punto', () => {
    expect(nearestSlot(boxes, 40, 40)).toBe(0);
    expect(nearestSlot(boxes, 176, 40)).toBe(1);
  });
  it('en la zona solapada gana el centro más cercano, no el primero', () => {
    expect(nearestSlot(boxes, 110, 42)).toBe(1); // x=110 → más cerca del centro 176 (66) que del 42 (68)
    expect(nearestSlot(boxes, 100, 42)).toBe(0);
  });
  it('devuelve -1 fuera de todos los márgenes', () => {
    expect(nearestSlot(boxes, 40, 300)).toBe(-1);
    expect(nearestSlot([], 1, 1)).toBe(-1);
  });
  it('en empate exacto gana el índice menor', () => {
    expect(nearestSlot(boxes, 109, 42)).toBe(0);
  });
});
