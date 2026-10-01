import { Directive, ElementRef, Renderer2, input, effect } from '@angular/core';

@Directive({
  selector: '[margin]',
  standalone: true
})
export class Margin {
  marginConfig = input.required<string>({ alias: 'margin' });

  constructor(private el: ElementRef, private renderer: Renderer2) {

    effect(() => {
      const config = this.marginConfig();
      if (!config) return;

      const parts = config.trim().split(/\s+/);

      if (parts.length === 2) {
        const direction = parts[0].toLowerCase(); // top, bottom, left, right
        const value = parts[1];
        const cssProperty = `margin-${direction}`;

        this.renderer.setStyle(this.el.nativeElement, cssProperty, value);
      }
    });
  }
}
