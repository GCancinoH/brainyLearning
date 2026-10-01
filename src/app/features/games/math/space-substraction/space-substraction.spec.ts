import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SpaceSubstraction } from './space-substraction';

describe('SpaceSubstraction', () => {
  let component: SpaceSubstraction;
  let fixture: ComponentFixture<SpaceSubstraction>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SpaceSubstraction],
    }).compileComponents();

    fixture = TestBed.createComponent(SpaceSubstraction);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
