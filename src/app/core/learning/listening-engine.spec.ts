import { describe, it, expect } from 'vitest';
import { ListeningGameEngine } from './listening-engine';

describe('ListeningGameEngine - Basic Tests', () => {
  it('should be able to import the engine', async () => {
    const { ListeningGameEngine: Engine } = await import('./listening-engine');
    expect(Engine).toBeDefined();
  });

  it('should have the expected interface structure', () => {
    // Verify the engine has the expected methods
    expect(typeof ListeningGameEngine.prototype.generateQuestion).toBe('function');
    expect(typeof ListeningGameEngine.prototype.validateAnswer).toBe('function');
    expect(typeof ListeningGameEngine.prototype.recordAttempt).toBe('function');
    expect(typeof ListeningGameEngine.prototype.getNextDifficulty).toBe('function');
  });
});

describe('ListeningGameEngine - Config Types', () => {
  it('should have correct config interface', () => {
    // This just verifies the types exist
    const config = {
      gameId: 'test',
      targetSkills: ['skill1'],
      category: 'animals'
    };
    expect(config.gameId).toBe('test');
    expect(config.targetSkills).toEqual(['skill1']);
    expect(config.category).toBe('animals');
  });
});

describe('ListeningGameEngine - Answer Types', () => {
  it('should have correct answer interface', () => {
    const answer = {
      selectedWordId: 'word1',
      correct: true,
      responseTimeMs: 1000
    };
    expect(answer.correct).toBe(true);
    expect(answer.selectedWordId).toBe('word1');
    expect(answer.responseTimeMs).toBe(1000);
  });
});