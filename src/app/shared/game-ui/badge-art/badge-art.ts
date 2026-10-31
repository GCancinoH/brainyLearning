import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { CATEGORY_META } from '@core/models/learning-category';
import { EFFORT_GRADIENT, TIER_ICON } from '@core/badges/badge-catalog';
import { Badge } from '@core/badges/badge-types';
import { getGameBadgeSvg, getCategoryBadgeSvg, getEffortBadgeSvg, CATEGORY_TO_MASCOT_KEY, EFFORT_SVGS } from '@core/badges/badge-svgs';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

/**
 * Insignia con arte SVG por tier + mascota de mundo.
 *
 * Reemplaza la forma CSS compuesta por SVGs ilustados con animaciones.
 * Cada mundo tiene su mascota que evoluciona: huevo → cría → juvenil → adulto.
 */
@Component({
  selector: 'badge-art',
  standalone: true,
  templateUrl: './badge-art.html',
  styleUrl: './badge-art.scss',
})
export class BadgeArt {
  readonly badge = input.required<Badge>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly animated = input<boolean>(true);

  private readonly sanitizer = inject(DomSanitizer);

  readonly tier = computed(() => this.badge().tier ?? 'seed');
  readonly tierIcon = computed(() => TIER_ICON[this.tier()]);
  readonly ribbon = computed(() => {
    const category = this.badge().category;
    return category ? CATEGORY_META[category].bgGradient : EFFORT_GRADIENT;
  });
  readonly shapeClass = computed(() => `shape-${this.tier()}`);

  /** SVG sanitizado según tipo de insignia */
  readonly svgHtml = computed<SafeHtml>(() => {
    const b = this.badge();
    let svg: string;

    if (b.scope === 'game' && b.category) {
      svg = getGameBadgeSvg(b.category, this.tier());
    } else if (b.scope === 'category' && b.category) {
      const kind = this.tier() === 'seed' ? 'explorer' : this.tier();
      svg = getCategoryBadgeSvg(b.category, kind as 'explorer' | 'bronze' | 'silver' | 'gold');
    } else {
      // Esfuerzo: usar icono del catálogo como fallback por ahora
      const kind = this.mapEffortKind(b.id);
      svg = getEffortBadgeSvg(kind);
    }

    // Inyectar currentColor para que herede el color del ribbon
    svg = svg.replace(/stroke="currentColor"/g, 'stroke="currentColor"')
             .replace(/fill="currentColor"/g, 'fill="currentColor"');

    return this.sanitizer.bypassSecurityTrustHtml(svg);
  });

  /** Animación de entrada "pop" */
  readonly entranceClass = signal<'pop' | ''>('pop');

  constructor() {
    effect(() => {
      if (this.animated()) {
        this.entranceClass.set('pop');
        setTimeout(() => this.entranceClass.set(''), 600);
      }
    });
  }

  private mapEffortKind(id: string): keyof typeof EFFORT_SVGS {
    if (id.includes('retry')) return 'retry';
    if (id.includes('explorer')) return 'explorer';
    if (id.includes('days')) return 'days';
    if (id.includes('calm')) return 'calm';
    if (id.includes('firstTry')) return 'firstTry';
    if (id.includes('help')) return 'help';
    if (id.includes('perfect')) return 'perfect';
    return 'retry' as const;
  }
}
