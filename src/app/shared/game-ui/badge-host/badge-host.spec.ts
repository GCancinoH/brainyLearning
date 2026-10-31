import { ComponentFixture, TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeService } from '@core/badges/badge.service';
import { BadgeVoice } from '@core/badges/badge-voice';
import { badgeById } from '@core/badges/badge-catalog';
import { Badge, badgeValue } from '@core/badges/badge-types';
import { GameSessionService } from '@core/games/game-session.service';
import { SessionEvent } from '@core/games/game-types';
import { createInitialProfile } from '@core/models/player-profile';
import { ProfileStateService } from '@core/services/profile-state';
import { BadgeHost } from './badge-host';

vi.mock('canvas-confetti', () => ({ default: vi.fn() }));

class BadgeServiceStub {
  private readonly q = signal<Badge[]>([]);
  readonly queue = this.q.asReadonly();
  readonly current = computed(() => this.q()[0] ?? null);
  readonly pendingCount = computed(() => this.q().length);

  readonly promoteMostValuable = vi.fn(() => {
    this.q.update(queue => [...queue].sort((a, b) => badgeValue(b) - badgeValue(a)));
  });

  readonly dismissCurrent = vi.fn(() => {
    this.q.update(queue => queue.slice(1));
  });

  readonly clearQueue = vi.fn(() => this.q.set([]));

  setQueue(badges: Badge[]): void {
    this.q.set(badges);
  }
}

class GameSessionStub {
  readonly events = new Subject<SessionEvent>();
  paused = false;
  readonly isPaused = (): boolean => this.paused;
}

class ProfileStateStub {
  readonly profile = signal(createInitialProfile('Luna', 4, '🦊', 'space'));
  readonly activeProfile = this.profile.asReadonly();
}

class BadgeVoiceStub {
  readonly say = vi.fn();
  readonly cancel = vi.fn();
}

const seed = badgeById('hanzi-numbers.seed')!;
const bronze = badgeById('hanzi-numbers.bronze')!;
const worldBronze = badgeById('cat.chinese.bronze')!;
const silver = badgeById('hanzi-numbers.silver')!;
const gold = badgeById('hanzi-numbers.gold')!;

describe('BadgeHost', () => {
  let fixture: ComponentFixture<BadgeHost>;
  let host: BadgeHost;
  let badges: BadgeServiceStub;
  let session: GameSessionStub;
  let profileState: ProfileStateStub;

  function emit(type: SessionEvent['type'], payload?: Record<string, unknown>): void {
    session.events.next({ type, gameId: 'hanzi-numbers', timestamp: Date.now(), payload });
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    badges = new BadgeServiceStub();
    session = new GameSessionStub();
    profileState = new ProfileStateStub();

    await TestBed.configureTestingModule({
      imports: [BadgeHost],
      providers: [
        { provide: BadgeService, useValue: badges },
        { provide: GameSessionService, useValue: session },
        { provide: ProfileStateService, useValue: profileState },
        { provide: BadgeVoice, useClass: BadgeVoiceStub },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BadgeHost);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('muestra una insignia al subir de nivel, tras la ventana de un segundo', () => {
    badges.setQueue([bronze]);

    emit('level-up', { newLevel: 3 });
    expect(host.displayOpen()).toBe(false);

    vi.advanceTimersByTime(999);
    expect(host.displayOpen()).toBe(false);

    vi.advanceTimersByTime(1);
    expect(host.displayOpen()).toBe(true);
    expect(badges.promoteMostValuable).toHaveBeenCalled();
  });

  it('no tapa un problema: una respuesta cancela el diálogo pendiente', () => {
    badges.setQueue([bronze]);

    emit('level-up', { newLevel: 3 });
    vi.advanceTimersByTime(500);
    emit('answer-correct');
    vi.advanceTimersByTime(2000);

    expect(host.displayOpen()).toBe(false);
  });

  it('espera si el juego tiene su propio diálogo abierto (sesión pausada)', () => {
    badges.setQueue([bronze]);
    session.paused = true;

    emit('level-up', { newLevel: 3 });
    vi.advanceTimersByTime(1000);
    expect(host.displayOpen()).toBe(false);

    session.paused = false;
    vi.advanceTimersByTime(500);
    expect(host.displayOpen()).toBe(true);
  });

  it('solo muestra una insignia a mitad de sesión', () => {
    badges.setQueue([bronze, silver]);

    emit('level-up', { newLevel: 3 });
    vi.advanceTimersByTime(1000);
    expect(host.displayOpen()).toBe(true);

    host.dismiss();
    expect(host.displayOpen()).toBe(false);

    emit('level-up', { newLevel: 8 });
    vi.advanceTimersByTime(2000);
    expect(host.displayOpen()).toBe(false);
  });

  it('al terminar muestra como máximo tres insignias y deja el resto en cola', () => {
    badges.setQueue([seed, bronze, worldBronze, silver, gold]);

    emit('time-up');
    vi.advanceTimersByTime(600);
    expect(host.displayOpen()).toBe(true);

    host.dismiss();
    expect(host.displayOpen()).toBe(false);
    vi.advanceTimersByTime(250);
    expect(host.displayOpen()).toBe(true);

    host.dismiss();
    expect(host.displayOpen()).toBe(false);
    vi.advanceTimersByTime(250);
    expect(host.displayOpen()).toBe(true);

    host.dismiss();
    expect(host.displayOpen()).toBe(false);
    vi.advanceTimersByTime(250);
    expect(host.displayOpen()).toBe(false);
    expect(badges.pendingCount()).toBe(2);
  });

  it('si cambia el perfil, lo pendiente era de la otra niña', () => {
    badges.setQueue([bronze]);
    emit('level-up', { newLevel: 3 });
    vi.advanceTimersByTime(1000);
    expect(host.displayOpen()).toBe(true);

    profileState.profile.set(createInitialProfile('Sol', 6, '🐙', 'ocean'));
    fixture.detectChanges();

    expect(badges.clearQueue).toHaveBeenCalled();
    expect(host.displayOpen()).toBe(false);
  });
});
