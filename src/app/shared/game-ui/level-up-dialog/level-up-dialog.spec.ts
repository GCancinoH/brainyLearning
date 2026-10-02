import { ComponentFixture, TestBed } from '@angular/core/testing';
import { LevelUpDialog } from './level-up-dialog';

describe('LevelUpDialog', () => {
  let component: LevelUpDialog;
  let fixture: ComponentFixture<LevelUpDialog>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LevelUpDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(LevelUpDialog);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
