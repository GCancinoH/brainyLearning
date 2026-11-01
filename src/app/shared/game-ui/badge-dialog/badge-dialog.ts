import {
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import confetti from 'canvas-confetti';
import { CATEGORY_META } from '@core/models/learning-category';
import { Badge } from '@core/badges/badge-types';
import { BadgeArt } from '../badge-art/badge-art';

/**
 * Cuadro de diálogo de una insignia.
 *
 * Un solo botón enorme, voz corta y nada de texto para los 4 años. El nombre escrito
 * solo aparece a los 6. Se cierra tocando el velo después de 1,5 s para que un toque
 * accidental no se lleve la celebración.
 */
@Component({
  selector: 'badge-dialog',
  standalone: true,
  imports: [BadgeArt],
  templateUrl: './badge-dialog.html',
  styleUrl: './badge-dialog.scss',
})
export class BadgeDialog {
  readonly badge = input<Badge | null>(null);
  readonly isVisible = input<boolean>(false);
  readonly queueSize = input<number>(1);
  readonly age = input<number>(4);

  readonly dismiss = output<void>();

  private readonly saveButton = viewChild<ElementRef<HTMLButtonElement>>('saveButton');
  private openedAt = 0;
  private previousOverflow: string | null = null;

  readonly mascot = computed(() => {
    const category = this.badge()?.category;
    if (!category) return { emoji: '🌈', name: 'Brainy' };
    const meta = CATEGORY_META[category];
    return { emoji: meta.mascot, name: meta.mascotName };
  });

  readonly isCelebration = computed(() => {
    const badge = this.badge();
    return badge?.tier === 'gold' || badge?.scope === 'category';
  });

  readonly isReader = computed(() => this.age() >= 6);
  readonly saveLabel = computed(() => (this.isReader() ? '⭐ Guardar' : '⭐'));
  /** Insignias a mostrar en esta sesión (máx 4: 1 a mitad + 3 al final). */
  readonly displayQueueSize = computed(() => Math.min(this.queueSize(), 4));
  /** Insignias extra que solo se verán en el álbum. */
  readonly extraForAlbum = computed(() => Math.max(0, this.queueSize() - 4));

  constructor() {
    effect(() => {
      if (!this.isVisible()) {
        this.openedAt = 0;
        this.unlockScroll();
        return;
      }

      this.openedAt = Date.now();
      this.lockScroll();
      if (this.isCelebration()) this.fireConfetti();
      setTimeout(() => this.saveButton()?.nativeElement.focus(), 60);
    });

    inject(DestroyRef).onDestroy(() => this.unlockScroll());
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isVisible()) return;
    this.tryDismiss();
  }

  onBackdrop(): void {
    this.tryDismiss();
  }

  private tryDismiss(): void {
    // Un toque/tecla cierra, pero no en el primer segundo y medio.
    if (Date.now() - this.openedAt < 1500) return;
    this.dismiss.emit();
  }

  private lockScroll(): void {
    if (typeof document === 'undefined' || this.previousOverflow !== null) return;
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  private unlockScroll(): void {
    if (typeof document === 'undefined' || this.previousOverflow === null) return;
    document.body.style.overflow = this.previousOverflow;
    this.previousOverflow = null;
  }

  private fireConfetti(): void {
    if (typeof window === 'undefined') return;
    try {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
      // Por encima del diálogo (300), o el confeti quedaría detrás del velo.
      confetti({ particleCount: 110, spread: 80, origin: { y: 0.55 }, zIndex: 400 });
    } catch {
      /* sin canvas o sin animaciones: la insignia se ve igual */
    }
  }
}
