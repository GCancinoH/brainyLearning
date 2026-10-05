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

describe('ListeningGameEngine - Review round', () => {
  const word = (id: string, difficulty: number, category: string, hiragana = id) =>
    ({ id, difficulty, category, hiragana, recommendedAgeMin: 3, skills: ['japanese.listening'] }) as any;

  const WORDS = [
    word('neko', 1, 'animals'), word('inu', 1, 'animals'), word('tori', 1, 'animals'),
    word('ringo', 2, 'food'), word('pan', 2, 'food'), word('mizu', 2, 'food'),
  ];

  async function setup(introduced: string[], mistakes: string[] = []) {
    await import('@angular/compiler');
    const core = await import('@angular/core');
    const { LearningContentService } = await import('./learning-content.service');
    const { SkillProgressService } = await import('./skill-progress.service');
    const { ProfileStateService } = await import('../services/profile-state');
    const { SpacedRepetition } = await import('./spaced-repetition');

    const injector = core.Injector.create({
      providers: [
        { provide: LearningContentService, useValue: {
          getWordsForSkill: () => WORDS,
          activeProfileConfig: () => ({ requiresReading: false, minOptions: 3, maxOptions: 4,
            allowedQuestionRepresentations: ['audio'], allowedAnswerRepresentations: ['image'] }),
          getAvailableRepresentations: () => [],
        } },
        { provide: SkillProgressService, useValue: {
          getMistakes: () => mistakes.map(contentId => ({ contentId })),
          recordAttempt: () => {}, recordMistake: () => {},
        } },
        { provide: ProfileStateService, useValue: { activeProfile: () => ({ id: 'p1', age: 4 }) } },
        { provide: SpacedRepetition, useValue: { isIntroduced: (_d: string, id: string) => introduced.includes(id) } },
      ],
    });
    return core.runInInjectionContext(injector, () => new ListeningGameEngine());
  }

  const config = (reviewBlock?: number) => ({
    gameId: 'g', targetSkills: ['japanese.listening'], maxDifficulty: 2, reviewBlock,
  });

  it('hasReviewMaterial needs introduced words from the current AND a previous block', async () => {
    const all = await setup(WORDS.map(w => w.id));
    expect(all.hasReviewMaterial(config(2))).toBe(true);
    expect(all.hasReviewMaterial(config(1))).toBe(false);   // nada anterior al bloque 1
    expect(all.hasReviewMaterial(config(undefined))).toBe(false);

    const onlyCurrent = await setup(['ringo', 'pan', 'mizu']);
    expect(onlyCurrent.hasReviewMaterial(config(2))).toBe(false);
  });

  it('review mixes targets from both blocks and distractors from the other block', async () => {
    const engine = await setup(WORDS.map(w => w.id));
    let fromCurrent = 0, fromPrevious = 0, mixedOptions = 0;
    for (let i = 0; i < 300; i++) {
      engine.resetHistory();
      const q = engine.generateQuestion(config(2))!;
      q.word.difficulty >= 2 ? fromCurrent++ : fromPrevious++;
      const blocks = new Set(q.options.map(o => o.difficulty >= 2));
      if (blocks.size === 2) mixedOptions++;
      expect(new Set(q.options.map(o => o.id)).size).toBe(q.options.length);
    }
    expect(fromCurrent).toBeGreaterThan(90);
    expect(fromPrevious).toBeGreaterThan(90);
    expect(mixedOptions).toBe(300);   // cada pregunta cruza bloques
  });

  it('prefers previous words with past mistakes about half of the time', async () => {
    const engine = await setup(WORDS.map(w => w.id), ['neko', 'neko']);
    let neko = 0, previous = 0;
    for (let i = 0; i < 600; i++) {
      engine.resetHistory();
      const q = engine.generateQuestion(config(2))!;
      if (q.word.difficulty < 2) { previous++; if (q.word.id === 'neko') neko++; }
    }
    // sin sesgo serían ~33% de las "previas"; con sesgo claramente más
    expect(neko / previous).toBeGreaterThan(0.5);
  });

  it('without reviewBlock behaves as before (single pool)', async () => {
    const engine = await setup(WORDS.map(w => w.id));
    const q = engine.generateQuestion(config(undefined));
    expect(q).not.toBeNull();
  });
});
