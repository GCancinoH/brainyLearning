import { TestBed } from '@angular/core/testing';
import { SpacedRepetition } from './spaced-repetition';

describe('SpacedRepetition', () => {
  let service: SpacedRepetition;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(SpacedRepetition);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
