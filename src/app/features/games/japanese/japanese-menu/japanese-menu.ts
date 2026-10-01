import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { JAPANESE_GAMES, JapaneseGameInfo } from '@core/models/japanese-game';

@Component({
  imports: [CommonModule],
  selector: 'japanese-menu',
  styleUrl: './japanese-menu.scss',
  templateUrl: './japanese-menu.html',
})
export class JapaneseMenu {
  private readonly router = inject(Router);
  readonly profileState = inject(ProfileStateService);
  readonly games = JAPANESE_GAMES;
  readonly activeProfile = this.profileState.activeProfile;

  selectGame(game: JapaneseGameInfo): void {
    if (this.profileState.isGameUnlocked(game.id)) {
      this.router.navigate([game.route]);
    }
  }

  goBack(): void { this.router.navigate(['/dashboard']); }
}