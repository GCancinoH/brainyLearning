import { Component, inject, signal, computed, OnDestroy, effect } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { PwaSyncService } from '@core/services/pwa-sync.service';

@Component({
  selector: 'app-install-prompt',
  standalone: true,
  template: `
    @if (mostrarPrompt()) {
      <div class="install-banner" role="dialog" aria-labelledby="install-title">
        <div class="install-content">
          <div class="install-icon">📱</div>
          <div class="install-text">
            <h3 id="install-title">Instala Brainy Learning</h3>
            <p>Juega sin conexión, recibe actualizaciones automáticas y sincroniza tu progreso.</p>
          </div>
        </div>
        <div class="install-actions">
          <button class="btn-install" (click)="instalar()">Instalar</button>
          <button class="btn-dismiss" (click)="descartar()">Ahora no</button>
        </div>
      </div>
    }

    @if (updateAvailable()) {
      <div class="update-banner" role="alert">
        <span>🔄 Nueva versión disponible</span>
        <button class="btn-update" (click)="aplicarActualizacion()">Actualizar ahora</button>
        <button class="btn-dismiss" (click)="descartarActualizacion()">Después</button>
      </div>
    }

    @if (syncError()) {
      <div class="sync-error-banner" role="alert">
        <span>⚠️ Error de sincronización: {{ syncError() }}</span>
        <button class="btn-retry" (click)="reintentarSync()">Reintentar</button>
        <button class="btn-dismiss" (click)="limpiarErrorSync()">Descartar</button>
      </div>
    }
  `,
  styles: [`
    .install-banner {
      position: fixed;
      bottom: 1rem;
      left: 1rem;
      right: 1rem;
      max-width: 400px;
      margin: 0 auto;
      background: var(--color-surface, #1e293b);
      border: 1px solid var(--color-border, #334155);
      border-radius: 16px;
      padding: 1rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.4);
      z-index: 1000;
      animation: slideUp 0.3s ease;
    }

    .install-content {
      display: flex;
      gap: 0.75rem;
      align-items: flex-start;
    }

    .install-icon {
      font-size: 2rem;
      flex-shrink: 0;
    }

    .install-text h3 {
      margin: 0 0 0.25rem;
      font-size: 1.1rem;
      color: var(--color-text, #fff);
    }

    .install-text p {
      margin: 0;
      font-size: 0.9rem;
      color: var(--color-text-muted, #94a3b8);
      line-height: 1.4;
    }

    .install-actions {
      display: flex;
      gap: 0.5rem;
      margin-top: 1rem;
    }

    .btn-install {
      flex: 1;
      padding: 0.6rem 1rem;
      background: var(--color-primary, #fbaf24);
      color: #0f172a;
      border: none;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-install:hover { background: #f59e0b; }
    .btn-install:active { transform: scale(0.98); }

    .btn-dismiss {
      flex: 1;
      padding: 0.6rem 1rem;
      background: transparent;
      color: var(--color-text-muted, #94a3b8);
      border: 1px solid var(--color-border, #334155);
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.95rem;
      cursor: pointer;
    }

    .btn-dismiss:hover { background: rgba(255,255,255,0.05); }

    .update-banner {
      position: fixed;
      top: 1rem;
      left: 1rem;
      right: 1rem;
      max-width: 500px;
      margin: 0 auto;
      background: var(--color-primary, #fbaf24);
      color: #0f172a;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 1001;
      animation: slideDown 0.3s ease;
    }

    .update-banner span { font-weight: 600; font-size: 0.95rem; }

    .btn-update {
      padding: 0.5rem 1rem;
      background: #0f172a;
      color: #fbaf24;
      border: none;
      border-radius: 8px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
    }

    .sync-error-banner {
      position: fixed;
      top: 1rem;
      left: 1rem;
      right: 1rem;
      max-width: 500px;
      margin: 0 auto;
      background: rgba(239, 68, 68, 0.2);
      border: 1px solid #ef4444;
      color: #fca5a5;
      border-radius: 12px;
      padding: 0.75rem 1rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      z-index: 1001;
      animation: slideDown 0.3s ease;
    }

    .sync-error-banner span { font-size: 0.9rem; }

    .btn-retry, .btn-update {
      padding: 0.5rem 1rem;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
    }

    .btn-retry:hover { background: #dc2626; }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(1rem); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-1rem); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 480px) {
      .install-banner { left: 0.5rem; right: 0.5rem; }
      .install-actions { flex-direction: column; }
    }
  `,
  ],
})
export class InstallPromptComponent implements OnDestroy {
  private readonly swUpdate = inject(SwUpdate);
  private readonly syncService = inject(PwaSyncService);

  readonly mostrarPrompt = signal(false);
  readonly updateAvailable = signal(false);
  readonly syncError = signal<string | null>(null);

  private promptDismissed = false;
  private updateDismissed = false;

  constructor() {
    // Detectar si ya se instaló o se descartó
    this.promptDismissed = localStorage.getItem('brainyLearning_installDismissed') === 'true';
    this.updateDismissed = localStorage.getItem('brainyLearning_updateDismissed') === 'true';

    // Detectar criterios para mostrar prompt
    effect(() => {
      if (this.promptDismissed) return;
      // Mostrar después de 30s en la app y al menos 2 sesiones
      // Simplificado: mostrar si no está instalado y no se descartó
      if (!this.promptDismissed && !this.updateAvailable()) {
        this.mostrarPrompt.set(true);
      }
    });

    // Detectar actualización SW
    this.swUpdate.versionUpdates.subscribe(e => {
      if (e.type === 'VERSION_READY') {
        this.updateAvailable.set(true);
      }
    });

    // Sincronizar estado de sync service
    effect(() => {
      const err = this.syncService.syncError();
      if (err) this.syncError.set(err);
    });
  }

  instalar(): void {
    this.mostrarPrompt.set(false);
    this.promptDismissed = true;
    localStorage.setItem('brainyLearning_installDismissed', 'true');
    // Disparar prompt nativo si está disponible
    (window as any).deferredPrompt?.prompt?.();
  }

  descartar(): void {
    this.mostrarPrompt.set(false);
    this.promptDismissed = true;
    localStorage.setItem('brainyLearning_installDismissed', 'true');
  }

  aplicarActualizacion(): void {
    this.updateAvailable.set(false);
    this.updateDismissed = true;
    localStorage.setItem('brainyLearning_updateDismissed', 'true');
    this.swUpdate.activateUpdate().then(() => window.location.reload());
  }

  descartarActualizacion(): void {
    this.updateAvailable.set(false);
    this.updateDismissed = true;
    localStorage.setItem('brainyLearning_updateDismissed', 'true');
  }

  reintentarSync(): void {
    this.syncService.sincronizarAhora();
  }

  limpiarErrorSync(): void {
    this.syncError.set(null);
    this.syncService['syncError'].set(null);
  }

  ngOnDestroy(): void {}
}