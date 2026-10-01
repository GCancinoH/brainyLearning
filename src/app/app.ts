import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SplashScreenComponent } from './core/components/splash-screen';
import { UpdateDialog } from '@core/components/update-dialog/update-dialog';
import { SWUpdater } from '@core/services/sw-updater';

@Component({
  imports: [
    RouterOutlet,
    SplashScreenComponent,
    UpdateDialog
  ],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  private readonly swUpdater = inject(SWUpdater)
  readonly showSplash = signal<boolean>(true);

  readonly updateAvailable = this.swUpdater.updateAvailable;

  onSplashFinished(): void {
    this.showSplash.set(false);
  }

  refreshUpdate(): void { this.swUpdater.reload() }
}
