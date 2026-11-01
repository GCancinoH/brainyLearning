import { describe, expect, it } from 'vitest';
import { RoundTracker } from './round-tracker';

describe('RoundTracker', () => {
  it('una ronda limpia es primer intento y ronda perfecta', () => {
    const tracker = new RoundTracker();
    expect(tracker.snapshot()).toEqual({ firstTry: true, perfectRound: true });
  });

  it('un error quita el primer intento y la ronda perfecta', () => {
    const tracker = new RoundTracker();
    tracker.markWrong();
    expect(tracker.snapshot()).toEqual({ firstTry: false, perfectRound: false });
    expect(tracker.wrongCount).toBe(1);
  });

  it('la ayuda quita la ronda perfecta pero no el primer intento', () => {
    const tracker = new RoundTracker();
    tracker.markHelp();
    expect(tracker.snapshot()).toEqual({ firstTry: true, perfectRound: false });
    expect(tracker.helpUsed).toBe(true);
  });

  it('reset vuelve al estado limpio', () => {
    const tracker = new RoundTracker();
    tracker.markWrong();
    tracker.markWrong();
    tracker.markHelp();

    tracker.reset();

    expect(tracker.snapshot()).toEqual({ firstTry: true, perfectRound: true });
    expect(tracker.wrongCount).toBe(0);
    expect(tracker.helpUsed).toBe(false);
  });
});
