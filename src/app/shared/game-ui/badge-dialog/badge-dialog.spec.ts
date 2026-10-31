import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { badgeById } from '@core/badges/badge-catalog';
import { BadgeDialog } from './badge-dialog';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

describe('BadgeDialog', () => {
  let fixture: ComponentFixture<BadgeDialog>;

  const badge = badgeById('hanzi-numbers.silver')!;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BadgeDialog] }).compileComponents();
    fixture = TestBed.createComponent(BadgeDialog);
    fixture.componentRef.setInput('badge', badge);
    fixture.componentRef.setInput('isVisible', true);
    fixture.detectChanges();
  });

  it('es un diálogo accesible con un solo botón', () => {
    const dialog = fixture.nativeElement.querySelector('[role="dialog"]') as HTMLElement;
    const buttons = fixture.nativeElement.querySelectorAll('button');

    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute('aria-label')).toContain(badge.name);
  });

  it('a los 4 años no muestra el nombre escrito', () => {
    fixture.componentRef.setInput('age', 4);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')).toBeNull();
    expect(fixture.nativeElement.querySelector('.save-btn')?.textContent.trim()).toBe('⭐');
  });

  it('a los 6 años muestra el nombre y el botón con texto', () => {
    fixture.componentRef.setInput('age', 6);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('h2')?.textContent).toContain(badge.name);
    expect(fixture.nativeElement.querySelector('.save-btn')?.textContent).toContain('Guardar');
  });

  it('muestra cuántas insignias quedan en la cola', () => {
    fixture.componentRef.setInput('queueSize', 3);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.queue')?.textContent).toContain('3');
  });
});
