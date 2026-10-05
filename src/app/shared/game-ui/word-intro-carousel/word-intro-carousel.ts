import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { Margin } from '@core/directives/margin';
import { GameAudioService } from '@core/games/game-audio.service';
import { JapaneseWord } from '@core/learning/learning-content';

@Component({
  imports: [Margin],
  selector: 'word-intro-carousel',
  styleUrl: './word-intro-carousel.scss',
  templateUrl: './word-intro-carousel.html',
})
export class WordIntroCarousel {
  readonly words = input.required<JapaneseWord[]>();
  readonly showReading = input<boolean>(false);
  readonly done = output<void>();

  private readonly audio = inject(GameAudioService);
  readonly index = signal(0);
  readonly current = computed(() => this.words()[this.index()]);
  readonly isLast = computed(() => this.index() >= this.words().length - 1);

  constructor() {
    effect(() => {
      const word = this.current();
      if (word) setTimeout(() => this.audio.playFile(word.audio), 300);
    });
  }

  emoji(word: JapaneseWord): string {
    return word.representations?.find(r => r.type === 'image')?.value ?? '❓';
  }

  replay(): void {
    this.audio.retryPendingAudio();
    const word = this.current();
    if (word) this.audio.playFile(word.audio);
  }

  next(): void {
    this.audio.stopAll();
    if (this.isLast()) this.done.emit();
    else this.index.update(i => i + 1);
  }
}
