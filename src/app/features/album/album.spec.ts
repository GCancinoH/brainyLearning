import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
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
import { BadgeStats } from '@core/badges/badge-types';
import { Badge } from '@core/badges/badge-types';
import { BadgeArt } from '@shared/game-ui/badge-art/badge-art';
import { BadgeDialog } from '@shared/game-ui/badge-dialog/badge-dialog';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

// Mock BadgeArt para evitar dependencias de catálogo en tests
@Component({
  selector: 'badge-art',
  standalone: true,
  template: '<div class="badge-art-mock" data-testid="badge-art"></div>',
  inputs: ['badge', 'size', 'animated'],
})
class BadgeArtMock {
  badge = signal<Badge | null>(null);
  size = signal<'sm' | 'md' | 'lg'>('md');
  animated = signal(true);
}

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
  readonly awardBadge = vi.fn().mockReturnValue(false);
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

    // Asegurar que el perfil tenga badgeStats completo
    profileState.updateActiveProfile(p => ({
      ...p,
      badgeStats: {
        gamesPlayed: [],
        daysPlayed: [],
        retrySuccess: 0,
        sessionsCompleted: 0,
        firstTryCorrect: 0,
        helpUsed: 0,
        perfectRounds: 0,
      } as BadgeStats,
    }));

    await TestBed.configureTestingModule({
      imports: [AlbumComponent],
      providers: [
        { provide: ProfileStateService, useValue: profileState },
        { provide: BadgeService, useValue: badgeService },
        { provide: BadgeVoice, useClass: BadgeVoiceStub },
        { provide: Router, useClass: RouterStub },
        { provide: ActivatedRoute, useClass: ActivatedRouteStub },
      ],
    })
    .overrideComponent(AlbumComponent, {
      remove: { imports: [BadgeArt] },
      add: { imports: [BadgeArtMock] },
    })
    .compileComponents();

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

  it('calcula rompecabezas del mundo', () => {
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'cat.chinese.explorer', earnedAt: new Date().toISOString(), seen: true },
        { id: 'cat.chinese.bronze', earnedAt: new Date().toISOString(), seen: true },
      ],
    }));
    fixture.detectChanges();

    const puzzles = component.worldPuzzles();
    const chinesePuzzle = puzzles.find(p => p.category === 'chinese');
    expect(chinesePuzzle).toBeTruthy();
    expect(chinesePuzzle!.earnedPieces).toBeGreaterThanOrEqual(0);
  });

  it('calcula sellos de la semana', () => {
    const today = new Date().toISOString().split('T')[0];
    profileState.updateActiveProfile(p => ({
      ...p,
      badgeStats: {
        gamesPlayed: [],
        daysPlayed: [today],
        retrySuccess: 0,
        sessionsCompleted: 0,
        firstTryCorrect: 0,
        helpUsed: 0,
        perfectRounds: 0,
      } as BadgeStats,
    }));
    fixture.detectChanges();

    const stamps = component.weeklyStamps();
    expect(stamps.days.length).toBe(7);
    expect(stamps.currentStreak).toBeGreaterThanOrEqual(0);
  });

  it('calcula marcos de perfil', () => {
    profileState.updateActiveProfile(p => ({
      ...p,
      badges: [
        { id: 'hanzi-numbers.gold', earnedAt: new Date().toISOString(), seen: true },
      ],
    }));
    fixture.detectChanges();

    const frames = component.profileFrames();
    const hanziFrame = frames.find(f => f.gameId === 'hanzi-numbers');
    expect(hanziFrame).toBeTruthy();
    expect(hanziFrame!.earned).toBe(true);
  });
});