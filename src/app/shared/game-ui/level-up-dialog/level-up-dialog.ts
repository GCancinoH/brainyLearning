import { Component, input, output } from '@angular/core';
import { DotLottie } from '@lottiefiles/dotlottie-web';
import { DotLottieComponent } from 'ngx-lottie/dotlottie-web';

@Component({
  imports: [DotLottieComponent],
  selector: 'level-up-dialog',
  styleUrl: './level-up-dialog.scss',
  templateUrl: './level-up-dialog.html',
})
export class LevelUpDialog {
  readonly isVisible = input.required<boolean>();
  readonly level = input.required<number>();
  readonly message = input<string>('¡Lo estás haciendo increíble!');
  readonly advance = output<void>();

  onDotLottieCreated(dotLottie: DotLottie): void {
    console.log('DotLottie instance:', dotLottie);
  }
}
