import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state'
import { MATH_GAMES, MathGameInfo } from '@core/models/math-game';
import { Margin } from '@core/directives/margin';

@Component({
  imports: [CommonModule, Margin],
  selector: 'math-menu',
  styleUrl: './math-menu.scss',
  templateUrl: './math-menu.html',
})
export class MathMenu {
  private readonly router = inject(Router);
  readonly profileState = inject(ProfileStateService);
  readonly games = computed(() => {
    const age = this.profileState.activePlayerAge();
    return MATH_GAMES.filter(g => (g.minAge ?? 4) <= age);
  });
  // Perfil activo para saber quién juega
  readonly activeProfile = this.profileState.activeProfile;

  selectGame(game: MathGameInfo): void {
    if (this.profileState.isGameUnlocked(game.id)) {
      this.router.navigate([game.route]);
    }
  }

  goBack(): void { this.router.navigate(['/dashboard']);  }
}
