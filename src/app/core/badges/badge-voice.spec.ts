import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { BadgeVoice } from './badge-voice';
import { SpeechService } from '../services/speech.service';
import { Badge } from './badge-types';

class SpeechServiceStub {
  speak = vi.fn(() => true);
  cancel = vi.fn();
}

describe('BadgeVoice', () => {
  let voice: BadgeVoice;
  let speech: SpeechServiceStub;

  beforeEach(() => {
    speech = new SpeechServiceStub();
    TestBed.configureTestingModule({
      providers: [
        BadgeVoice,
        { provide: SpeechService, useValue: speech },
      ],
    });
    voice = TestBed.inject(BadgeVoice);
  });

  it('no habla si speechSynthesis.speaking es true (M4)', () => {
    // Simular que el narrador del juego está hablando
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speaking: true },
      configurable: true,
    });

    const badge: Badge = {
      id: 'test.badge',
      scope: 'effort',
      icon: '⭐',
      nameKey: 'badge.test',
      name: 'Test',
      voice: 'Test voice',
    };

    voice.say(badge);

    // No debe llamar a speech.speak
    expect(speech.speak).not.toHaveBeenCalled();
  });

  it('habla normalmente si speechSynthesis no está hablando', () => {
    Object.defineProperty(window, 'speechSynthesis', {
      value: { speaking: false },
      configurable: true,
    });

    const badge: Badge = {
      id: 'test.badge',
      scope: 'effort',
      icon: '⭐',
      nameKey: 'badge.test',
      name: 'Test',
      voice: 'Test voice',
    };

    voice.say(badge);

    expect(speech.speak).toHaveBeenCalledWith('Test voice', 'es-MX', { rate: 0.82, pitch: 1.15 });
  });

  it('cancela clip de audio si existe', () => {
    const badge: Badge = {
      id: 'test.badge',
      scope: 'effort',
      icon: '⭐',
      nameKey: 'badge.test',
      name: 'Test',
      voice: 'Test voice',
    };

    // BADGE_CLIPS está vacío, así que usa TTS
    voice.say(badge);
    voice.cancel();

    expect(speech.cancel).toHaveBeenCalled();
  });
});