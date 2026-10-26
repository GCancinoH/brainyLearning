import { Component, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { CHINESE_GAMES, ChineseGameInfo } from '@core/models/chinese-game';

@Component({
  imports: [CommonModule],
  selector: 'chinese-menu',
  styleUrl: './chinese-menu.scss',
  templateUrl: './chinese-menu.html',
})
export class ChineseMenu {
  private readonly router = inject(Router);
  readonly profileState = inject(ProfileStateService);
  readonly games = computed(() => {
    const age = this.profileState.activePlayerAge();
    return CHINESE_GAMES.filter(g => (g.minAge ?? 4) <= age);
  });
  readonly activeProfile = this.profileState.activeProfile;

  selectGame(game: ChineseGameInfo): void {
    if (this.profileState.isGameUnlocked(game.id)) {
      this.router.navigate([game.route]);
    }
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}
