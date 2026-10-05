import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WordIntroCarousel } from './word-intro-carousel';

describe('WordIntroCarousel', () => {
  let component: WordIntroCarousel;
  let fixture: ComponentFixture<WordIntroCarousel>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WordIntroCarousel],
    }).compileComponents();

    fixture = TestBed.createComponent(WordIntroCarousel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
