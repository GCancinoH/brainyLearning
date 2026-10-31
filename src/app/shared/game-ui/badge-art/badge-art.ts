import { Component, computed, input } from '@angular/core';
import { CATEGORY_META } from '@core/models/learning-category';
import { EFFORT_GRADIENT, TIER_ICON } from '@core/badges/badge-catalog';
import { Badge } from '@core/badges/badge-types';

/**
 * Insignia compuesta: forma por nivel + icono del juego + cinta del mundo.
 *
 * No hay arte propio todavía. Cuando lo haya, este componente se sustituye por una
 * imagen y ni las reglas ni la persistencia cambian.
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

  readonly tier = computed(() => this.badge().tier ?? 'seed');
  readonly tierIcon = computed(() => TIER_ICON[this.tier()]);
  readonly ribbon = computed(() => {
    const category = this.badge().category;
    return category ? CATEGORY_META[category].bgGradient : EFFORT_GRADIENT;
  });
  readonly shapeClass = computed(() => `shape-${this.tier()}`);
}
