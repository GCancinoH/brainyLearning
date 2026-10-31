import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AlbumComponent } from './album';
import { ProfileStateService } from '@core/services/profile-state';
import { BadgeService } from '@core/badges/badge.service';
import { BadgeVoice } from '@core/badges/badge-voice';
import { Router } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { createInitialProfile } from '@core/models/player-profile';
import { EarnedBadge } from '@core/badges/badge-types';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

class ProfileStateStub {
  readonly profile = signal(createInitialProfile('Luna', 6, '🦊', 'space'));
  readonly activeProfile = this.profile.asReadonly();
  updateActiveProfile(updater: (p: any) => any): any {
    this.profile.set(updater(this.profile()));
    return this.profile();
  }
}

class BadgeServiceStub {
  readonly markSeen = vi.fn();
}

class BadgeVoiceStub {
  readonly say = vi.fn();
  readonly cancel = vi.fn();
}

class RouterStub {
  readonly navigate = vi.fn();
  readonly navigateByUrl = vi.fn();
}

class ActivatedRouteStub {
  readonly queryParamMap = of(new Map([['rest', null]]));
}

describe('AlbumComponent', () => {
  let fixture: ComponentFixture<AlbumComponent>;
  let component: AlbumComponent;
  let profileState: ProfileStateStub;
  let badgeService: BadgeServiceStub;

  beforeEach(async () => {
    profileState = new ProfileStateStub();
    badgeService = new BadgeServiceStub();

    await TestBed.configureTestingModule({
      imports: [AlbumComponent],
      providers: [
        { provide: ProfileStateService, useValue: profileState },
        { provide: BadgeService, useValue: badgeService },
        { provide: BadgeVoice, useClass: BadgeVoiceStub },
        { provide: Router, useClass: RouterStub },
        { provide: ActivatedRoute, useClass: ActivatedRouteStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AlbumComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('crea el componente', () => {
    expect(component).toBeTruthy();
  });

  it('muestra siluetas cuando hay juegos pero sin insignias ganadas', () => {
    // Con el perfil por defecto (sin badges), deben aparecer mundos con siluetas
    const worldSection = fixture.nativeElement.querySelector('.world-section');
    expect(worldSection).toBeTruthy();
    
    const silhouettes = fixture.nativeElement.querySelectorAll('.album-badge.silhouette');
    expect(silhouettes.length).toBeGreaterThan(0);
  });

  it('cambia a pestaña Pegatinas', () => {
    component.setTab('stickers');
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelectorAll('[role="tab"]');
    expect(tabs[1].classList.contains('active')).toBe(true);
  });

  it('marca insignia como vista al abrir diálogo', () => {
    // Simular una insignia ganada
    const badgeId = 'hanzi-numbers.seed';
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [{ id: badgeId, earnedAt: new Date().toISOString(), seen: false }],
    }));
    fixture.detectChanges();

    const badgeBtn = fixture.nativeElement.querySelector('.album-badge.earned');
    if (badgeBtn) {
      badgeBtn.click();
      fixture.detectChanges();

      expect(badgeService.markSeen).toHaveBeenCalledWith([badgeId]);
    }
  });

  it('agrupa insignias por mundo', () => {
    // Añadir algunas insignias ganadas
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'hanzi-numbers.seed', earnedAt: new Date().toISOString(), seen: true },
        { id: 'hanzi-numbers.bronze', earnedAt: new Date().toISOString(), seen: true },
      ],
    }));
    fixture.detectChanges();

    const groups = component.badgeGroups();
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.some(g => g.category === 'chinese')).toBe(true);
  });

  it('muestra punto rojo en insignias nuevas', () => {
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'hanzi-numbers.seed', earnedAt: new Date().toISOString(), seen: false }, // nueva
        { id: 'hanzi-numbers.bronze', earnedAt: new Date().toISOString(), seen: true }, // vista
      ],
    }));
    fixture.detectChanges();

    const newDot = fixture.nativeElement.querySelector('.new-dot');
    expect(newDot).toBeTruthy();
  });

  it('no muestra punto rojo en insignias ya vistas', () => {
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'hanzi-numbers.seed', earnedAt: new Date().toISOString(), seen: true },
      ],
    }));
    fixture.detectChanges();

    const newDot = fixture.nativeElement.querySelector('.new-dot');
    expect(newDot).toBeFalsy();
  });

  it('muestra siluetas para insignias no ganadas', () => {
    const silhouette = fixture.nativeElement.querySelector('.album-badge.silhouette');
    expect(silhouette).toBeTruthy();
    expect(silhouette.disabled).toBe(true);
  });

  it('habilita insignias ganadas', () => {
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'hanzi-numbers.seed', earnedAt: new Date().toISOString(), seen: true },
      ],
    }));
    fixture.detectChanges();

    const earned = fixture.nativeElement.querySelector('.album-badge.earned:not(.silhouette)');
    expect(earned).toBeTruthy();
    expect(earned.disabled).toBe(false);
  });
});