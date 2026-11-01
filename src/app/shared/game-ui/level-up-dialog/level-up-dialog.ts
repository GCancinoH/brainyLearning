import { Component, input, output } from '@angular/core';
import { LottieWrapper } from '../lottie-wrapper/lottie-wrapper';

@Component({
  imports: [LottieWrapper],
  selector: 'level-up-dialog',
  styleUrl: './level-up-dialog.scss',
  templateUrl: './level-up-dialog.html',
})
export class LevelUpDialog {
  readonly isVisible = input.required<boolean>();
  readonly level = input.required<number>();
  readonly message = input<string>('¡Lo estás haciendo increíble!');
  readonly advance = output<void>();

  readonly lottieSrc = '/lottie/congratulations.lottie';

  onLottieReady(): void {
    // La animación está lista
  }
}
