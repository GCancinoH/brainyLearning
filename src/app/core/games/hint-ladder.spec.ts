import { describe, it, expect } from 'vitest';
import { HintLadder, LADDER_BY_AGE, configForAge, levelFor } from './hint-ladder';

/** Reloj falso: permite probar los umbrales de 24 s sin esperar 24 s. */
function fakeClock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

describe('HintLadder · levelFor', () => {
  it('sube por inactividad en los peldaños de la edad', () => {
    const c4 = LADDER_BY_AGE[4];
    expect(levelFor(0, 0, c4)).toBe(0);
    expect(levelFor(7_999, 0, c4)).toBe(0);
    expect(levelFor(8_000, 0, c4)).toBe(1);
    expect(levelFor(16_000, 0, c4)).toBe(2);
    expect(levelFor(24_000, 0, c4)).toBe(3);
  });

  it('sube por errores, incluso sin haber pasado nada de tiempo', () => {
    const c4 = LADDER_BY_AGE[4];
    expect(levelFor(0, 1, c4)).toBe(1);
    expect(levelFor(0, 2, c4)).toBe(2);
    expect(levelFor(0, 3, c4)).toBe(3);
  });

  it('toma el máximo de inactividad y errores, no la suma', () => {
    const c4 = LADDER_BY_AGE[4];
    // 30 s sin hacer nada (nivel 3) + 1 error: el máximo sigue siendo 3, no 4
    expect(levelFor(30_000, 1, c4)).toBe(3);
    // 1 error pero recién empieza: 1
    expect(levelFor(100, 1, c4)).toBe(1);
  });

  it('6 años espera mucho más y NO llega nunca a la demostración', () => {
    const c6 = LADDER_BY_AGE[6];
    expect(levelFor(19_999, 0, c6)).toBe(0);
    expect(levelFor(20_000, 0, c6)).toBe(1);
    expect(levelFor(40_000, 0, c6)).toBe(2);
    expect(levelFor(10_000_000, 0, c6)).toBe(2);
  });

  it('6 años con 3 errores se queda en 2: el tope es maxLevel, no la longitud de idleMs', () => {
    // Este es el caso que `Math.min(3, ...)` dejaba pasar: con solo 2 peldaños de inactividad,
    // `max(byIdle, wrongStreak)` llegaba a 3 y disparaba la mano fantasma justo cuando más
    // le cuesta. Para 6 años el tope tiene que estar en la config.
    expect(levelFor(0, 3, LADDER_BY_AGE[6])).toBe(2);
    expect(levelFor(0, 99, LADDER_BY_AGE[6])).toBe(2);
  });

  it('elige la config según la edad', () => {
    expect(configForAge(4)).toBe(LADDER_BY_AGE[4]);
    expect(configForAge(3)).toBe(LADDER_BY_AGE[4]);
    expect(configForAge(6)).toBe(LADDER_BY_AGE[6]);
    expect(configForAge(8)).toBe(LADDER_BY_AGE[6]);
  });
});

describe('HintLadder · máquina de estados', () => {
  it('tick devuelve el nivel solo cuando acaba de subir, no en cada llamada', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[4], clock.now);
    l.reset();

    expect(l.tick()).toBeNull();          // aún en 0
    clock.advance(9_000);
    expect(l.tick()).toBe(1);             // sube a 1
    clock.advance(500);
    expect(l.tick()).toBeNull();          // sigue en 1: no repite aviso
  });

  it('un acierto devuelve la escalera a cero', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[4], clock.now);
    l.reset();
    clock.advance(30_000);
    l.tick();
    expect(l.level).toBe(3);

    l.registerCorrect();
    expect(l.level).toBe(0);
    expect(l.wrongStreak).toBe(0);
  });

  it('tocar la pantalla reinicia el reloj de inactividad pero NO borra los errores', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[4], clock.now);
    l.reset();
    l.registerWrong();
    l.registerWrong();
    expect(l.wrongStreak).toBe(2);

    clock.advance(5_000);
    l.touch();                            // toca la pantalla
    expect(l.idleMs).toBe(0);
    // sigue fallando: el nivel no baja a 0
    expect(l.level).toBe(2);
    expect(l.wrongStreak).toBe(2);
  });

  it('respeta el máximo de demostraciones por ronda', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[4], clock.now);
    l.reset();

    expect(l.shouldDemo()).toBe(false);   // nivel 0
    l.registerWrong(); l.registerWrong(); l.registerWrong();
    expect(l.level).toBe(3);
    expect(l.shouldDemo()).toBe(true);    // 1ª de las 2 permitidas
    expect(l.shouldDemo()).toBe(true);    // 2ª (y última)
    expect(l.shouldDemo()).toBe(false);   // ya van 2: se mantiene el nivel 3 sin repetir la mano
    expect(l.demosShown).toBe(2);
  });

  it('6 años nunca hace demostración, por muchos errores que lleve', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[6], clock.now);
    l.reset();
    for (let i = 0; i < 10; i++) l.registerWrong();
    expect(l.level).toBe(2);
    expect(l.shouldDemo()).toBe(false);
    expect(l.demosShown).toBe(0);
  });

  it('reset deja la escalera limpia para la ronda siguiente', () => {
    const clock = fakeClock();
    const l = new HintLadder(LADDER_BY_AGE[4], clock.now);
    l.reset();
    l.registerWrong(); l.registerWrong(); l.registerWrong();
    l.shouldDemo();
    expect(l.level).toBe(3);
    expect(l.demosShown).toBe(1);

    l.reset();
    expect(l.level).toBe(0);
    expect(l.wrongStreak).toBe(0);
    expect(l.demosShown).toBe(0);
  });
});