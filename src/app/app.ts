import { Component, DestroyRef, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { SplashScreenComponent } from './core/components/splash-screen';
import { UpdateDialog } from '@core/components/update-dialog/update-dialog';
import { SWUpdater } from '@core/services/sw-updater';
import { GameClockComponent } from '@core/components/game-clock';
import { ThemeTimeService } from '@core/services/theme-time.service';
import { Theme, parseGameUrl } from '@core/services/theme-time';
import { GameSessionService } from '@core/games/game-session.service';
import { GameProgressService } from '@core/games/game-progress.service';

@Component({
  imports: [
    RouterOutlet,
    SplashScreenComponent,
    UpdateDialog,
    GameClockComponent
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly swUpdater = inject(SWUpdater)
  private readonly router = inject(Router);
  private readonly themeTime = inject(ThemeTimeService);
  private readonly session = inject(GameSessionService);
  private readonly progress = inject(GameProgressService);
  readonly showSplash = signal<boolean>(true);
  readonly buildToken = 'BUILD_VERSION_1_0_A';

  readonly updateAvailable = this.swUpdater.updateAvailable;

  /** El reloj se ve (y cuenta) solo dentro de un juego */
  readonly clockVisible = this.themeTime.running;

  constructor() {
    console.log('Fuerza ejecucion:', this.buildToken);

    // El reloj corre solo dentro de un juego de matemáticas o japonés
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(e => {
        const parsed = parseGameUrl(e.urlAfterRedirects);
        if (parsed?.playing) this.themeTime.enter(parsed.theme);
        else this.themeTime.leave();
      });

    // Se acabó el tiempo del tema: guardar avance y volver al dashboard
    effect(() => {
      const expired = this.themeTime.expired();
      if (expired) untracked(() => this.handleTimeUp(expired.theme));
    });
  }

  private handleTimeUp(theme: Theme): void {
    // 1. Guardar el avance de la sesión en curso (nivel y aciertos/errores)
    const s = this.session.state();
    if (s?.gameId) {
      this.progress.saveProgress(s.gameId, {
        level: Math.max(s.level, this.progress.getLevel(s.gameId)),
        totalAttempts: s.attempts,
        totalCorrect: s.correctAnswers,
        totalIncorrect: s.incorrectAnswers,
        totalPlayTimeMs: this.session.sessionElapsedMs()
      });
    }
    // 2. Al dashboard con el aviso (el juego limpia audio y sesión al destruirse)
    this.themeTime.leave();
    this.router.navigate(['/dashboard'], { queryParams: { rest: theme } });
  }

  onSplashFinished(): void {
    this.showSplash.set(false);
  }

  refreshUpdate(): void { this.swUpdater.reload() }
}
