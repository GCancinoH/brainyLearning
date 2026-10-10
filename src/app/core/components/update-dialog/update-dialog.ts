import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SWUpdater } from '@core/services/sw-updater';

@Component({
  selector: 'sw-update-dialog',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './update-dialog.html',
  styleUrl: './update-dialog.scss'
})
export class UpdateDialog {
  readonly pwaUpdater = inject(SWUpdater);

  reloadApp(): void {
    this.pwaUpdater.reload();
  }
}
