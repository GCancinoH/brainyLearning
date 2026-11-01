import { Component, input, output, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';

/**
 * Wrapper que carga `dotlottie-player` de forma perezosa.
 * Evita que `ngx-lottie` + `dotlottie-web` entren en el bundle inicial.
 * Solo se hidrata cuando `isVisible` es true.
 */
@Component({
  selector: 'lottie-wrapper',
  standalone: true,
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    @defer (when isVisible()) {
      <ng-template #lottie>
        <dotlottie-player
          [src]="src()"
          [loop]="loop()"
          [autoplay]="autoplay()"
          [style.width]="width()"
          [style.height]="height()"
          (ready)="onReady.emit($event)"
        />
      </ng-template>
    } @placeholder {
      <!-- placeholder vacío; la animación aparece solo cuando se necesita -->
    }
  `,
})
export class LottieWrapper {
  readonly src = input.required<string>();
  readonly loop = input<boolean>(true);
  readonly autoplay = input<boolean>(true);
  readonly width = input<string>('100%');
  readonly height = input<string>('100%');
  readonly isVisible = input<boolean>(true);

  readonly onReady = output<unknown>();
}