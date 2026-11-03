import { describe, expect, it } from 'vitest';
import { ALL_GAMES, availableGames, gameMaxLevel, gamesByCategory } from './game-catalog';
import { MATH_GAMES } from './math-game';
import { JAPANESE_GAMES } from './japanese-game';
import { CHINESE_GAMES } from './chinese-game';

describe('catálogo de juegos', () => {
  it('cada juego declara categoría y nivel máximo', () => {
    for (const game of ALL_GAMES) {
      expect(game.category, `${game.id} sin categoría`).toMatch(/^(math|japanese|chinese|spanish|english)$/);
      expect(game.maxLevel, `${game.id} sin maxLevel`).toBeGreaterThan(0);
      expect(Number.isInteger(game.maxLevel), `${game.id} maxLevel no entero`).toBe(true);
    }
  });

  it('los ids son únicos', () => {
    const ids = ALL_GAMES.map(g => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('la categoría coincide con el archivo del catálogo', () => {
    expect(MATH_GAMES.every(g => g.category === 'math')).toBe(true);
    expect(JAPANESE_GAMES.every(g => g.category === 'japanese')).toBe(true);
    expect(CHINESE_GAMES.every(g => g.category === 'chinese')).toBe(true);
  });

  it('gameMaxLevel lee el nivel del catálogo', () => {
    expect(gameMaxLevel('space-addition')).toBe(20);
    expect(gameMaxLevel('hanzi-numbers')).toBe(12);
    expect(gameMaxLevel('japanese-nature')).toBe(15);
    expect(() => gameMaxLevel('no-existe')).toThrow(/Juego desconocido/);
  });

  it('el Planeta Dragón ya tiene sus juegos de vocabulario', () => {
    const ids = CHINESE_GAMES.map(g => g.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'hanzi-colors',
        'hanzi-animals',
        'hanzi-nature',
        'hanzi-family',
        'hanzi-actions',
        'hanzi-listening',
      ]),
    );
    expect(gameMaxLevel('hanzi-colors')).toBe(10);
    expect(gameMaxLevel('hanzi-animals')).toBe(10);
    expect(gameMaxLevel('hanzi-nature')).toBe(10);
    expect(gameMaxLevel('hanzi-family')).toBe(10);
    expect(gameMaxLevel('hanzi-actions')).toBe(10);
    expect(gameMaxLevel('hanzi-listening')).toBe(10);
    // Todos tienen pantalla: no son anuncios.
    const disponibles = availableGames().map(g => g.id);
    for (const id of [
      'hanzi-colors',
      'hanzi-animals',
      'hanzi-nature',
      'hanzi-family',
      'hanzi-actions',
      'hanzi-listening',
    ]) {
      expect(disponibles).toContain(id);
    }

    // Escucha se abre con Colores: preguntar palabras no presentadas sería adivinar.
    const escucha = CHINESE_GAMES.find(g => g.id === 'hanzi-listening')!;
    expect(escucha.unlockRequirement).toEqual({
      requiredGameId: 'hanzi-colors',
      requiredLevel: 3,
      description: 'Llega al Nivel 3 en Colores en Hanzi',
    });
  });

  it('los juegos anunciados sin pantalla no cuentan como disponibles', () => {
    const disponibles = availableGames().map(g => g.id);
    expect(disponibles).not.toContain('japanese-clock');
    expect(disponibles).not.toContain('japanese-word-builder');
    expect(gamesByCategory('japanese').every(g => g.available !== false)).toBe(true);
  });
});
