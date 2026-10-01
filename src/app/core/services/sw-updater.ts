import { ApplicationRef, Service, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs/operators';
import { concat, interval } from 'rxjs';

@Service()
export class SWUpdater {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  readonly updateAvailable = signal(false);

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.listenForUpdates();
    this.startUpdateChecks();
  }

  private listenForUpdates(): void {
    this.swUpdate.versionUpdates
      .pipe(
        filter(
          (evt): evt is VersionReadyEvent =>
            evt.type === 'VERSION_READY'
        )
      )
      .subscribe(() => {
        this.updateAvailable.set(true);
      });

    this.swUpdate.unrecoverable.subscribe(() => {
      document.location.reload();
    });
  }

  private startUpdateChecks(): void {
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable)
    );

    const periodicChecks$ = interval(
      6 * 60 * 60 * 1000
    );

    concat(
      appIsStable$,
      periodicChecks$
    ).subscribe(() => {
      this.checkForUpdates();
    });
  }

  private async checkForUpdates(): Promise<void> {
    try {
      const updateFound = await this.swUpdate.checkForUpdate();

      console.log(
        updateFound
          ? 'Nueva versión disponible.'
          : 'La aplicación ya está actualizada.'
      );
    } catch (error) {
      console.error(
        'Error comprobando actualización del Service Worker:',
        error
      );
    }
  }

  reload(): void {
    document.location.reload();
  }
}
