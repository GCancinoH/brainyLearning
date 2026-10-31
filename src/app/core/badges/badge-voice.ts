/**
 * Voz de las insignias, aislada del `Narrator` de los juegos.
 *
 * El `Narrator` se configura por juego y cada juego lo cancela al destruirse. Si la
 * insignia usara ese mismo servicio, al salir del juego la frase se cortaría justo
 * cuando aparece el diálogo. Aquí hay un `HTMLAudioElement` propio y, si no hay clip,
 * TTS con `SpeechService`.
 *
 * Regla de convivencia: si ya hay una voz hablando (la del juego), no se la pisa. La
 * insignia se ve igual; el sonido es un extra, no un requisito.
 */

import { Service, inject } from '@angular/core';
import { SpeechService } from '../services/speech.service';
import { Badge } from './badge-types';

/** Clips ya generados. Vacío hasta que `tools/narration` produzca `audio/badges/*.m4a`. */
const BADGE_CLIPS = new Set<string>([]);
const BADGE_AUDIO_BASE = '/audio/badges';
const BADGE_AUDIO_EXT = 'm4a';

@Service()
export class BadgeVoice {
  private readonly speech = inject(SpeechService);
  private clip: HTMLAudioElement | null = null;
  private spokeWithTts = false;

  /** Dice la frase de la insignia. Nunca lanza. */
  say(badge: Badge): void {
    this.stopClip();

    if (BADGE_CLIPS.has(badge.id)) {
      const audio = new Audio(`${BADGE_AUDIO_BASE}/${badge.id}.${BADGE_AUDIO_EXT}`);
      audio.volume = 0.9;
      this.clip = audio;
      audio.play().catch(() => this.speak(badge));
      return;
    }

    this.speak(badge);
  }

  cancel(): void {
    this.stopClip();
    if (this.spokeWithTts) {
      this.speech.cancel();
      this.spokeWithTts = false;
    }
  }

  private speak(badge: Badge): void {
    // Si el juego está hablando, la insignia no lo interrumpe.
    if (typeof speechSynthesis !== 'undefined' && speechSynthesis.speaking) return;

    const ok = this.speech.speak(badge.voice, 'es-MX', { rate: 0.82, pitch: 1.15 });
    this.spokeWithTts = ok;
  }

  private stopClip(): void {
    if (!this.clip) return;
    try {
      this.clip.pause();
      this.clip.currentTime = 0;
    } catch {
      /* el audio ya no existe */
    }
    this.clip = null;
  }
}
