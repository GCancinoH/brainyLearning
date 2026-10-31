import { Component, computed, signal } from '@angular/core';
import { BadgeArt } from '@shared/game-ui/badge-art/badge-art';
import { BadgeDialog } from '@shared/game-ui/badge-dialog/badge-dialog';
import { ALL_BADGES, TIER_LABEL } from '@core/badges/badge-catalog';
import { Badge, BadgeScope } from '@core/badges/badge-types';

interface BadgeGroup {
  title: string;
  scope: BadgeScope;
  badges: Badge[];
}

/**
 * Laboratorio de insignias: ver todas las variantes sin jugar 15 juegos.
 * Solo existe en desarrollo (`devOnlyGuard`).
 */
@Component({
  selector: 'badge-lab',
  standalone: true,
  imports: [BadgeArt, BadgeDialog],
  template: `
    <div class="lab">
      <header>
        <h1>🏅 Laboratorio de insignias</h1>
        <p>{{ ALL_BADGES.length }} insignias en el catálogo. Toca una para ver el diálogo.</p>
        <div class="age-toggle">
          <button [class.active]="age() === 4" (click)="age.set(4)">4 años (sin texto)</button>
          <button [class.active]="age() === 6" (click)="age.set(6)">6 años (con texto)</button>
        </div>
      </header>

      @for (group of groups(); track group.scope) {
        <section>
          <h2>{{ group.title }} <small>({{ group.badges.length }})</small></h2>
          <div class="grid">
            @for (badge of group.badges; track badge.id) {
              <button class="badge-item" (click)="show(badge)">
                <badge-art [badge]="badge" size="sm" />
                <span>{{ badge.name }}</span>
                @if (badge.tier) {
                  <small>{{ TIER_LABEL[badge.tier] }}</small>
                }
              </button>
            }
          </div>
        </section>
      }
    </div>

    <badge-dialog
      [badge]="preview()"
      [isVisible]="visible()"
      [age]="age()"
      (dismiss)="close()"
    />
  `,
  styles: [`
    .lab {
      max-width: 1100px;
      margin: 0 auto;
      padding: 2rem 1.5rem 4rem;
      color: #fff;
    }

    h1 { margin: 0 0 0.5rem; }
    h2 { margin: 2rem 0 1rem; font-size: 1.1rem; text-transform: uppercase; letter-spacing: 1px; opacity: 0.85; }
    h2 small { opacity: 0.6; }

    .age-toggle { display: flex; gap: 0.6rem; margin-top: 1rem; }

    button {
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      border-radius: 14px;
      padding: 0.6rem 1rem;
      cursor: pointer;
    }

    .age-toggle button.active { background: #7c3aed; border-color: #a78bfa; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 1rem;
    }

    .badge-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.6rem;
      padding: 1rem 0.6rem;
      text-align: center;
      font-size: 0.8rem;
    }

    .badge-item small { opacity: 0.6; }
  `],
})
export class BadgeLab {
  readonly ALL_BADGES = ALL_BADGES;
  readonly TIER_LABEL = TIER_LABEL;

  readonly age = signal<4 | 6>(4);
  readonly preview = signal<Badge | null>(null);
  readonly visible = signal(false);

  readonly groups = computed<BadgeGroup[]>(() => [
    { title: 'Por juego', scope: 'game', badges: ALL_BADGES.filter(b => b.scope === 'game') },
    { title: 'Por mundo', scope: 'category', badges: ALL_BADGES.filter(b => b.scope === 'category') },
    { title: 'De esfuerzo', scope: 'effort', badges: ALL_BADGES.filter(b => b.scope === 'effort') },
  ]);

  show(badge: Badge): void {
    this.preview.set(badge);
    this.visible.set(true);
  }

  close(): void {
    this.visible.set(false);
  }
}
