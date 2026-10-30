import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';

export interface SyncEvent {
  type: 'progress' | 'achievement' | 'session' | 'tracing' | 'reflection';
  payload: unknown;
  timestamp: number;
  profileId: string;
}

@Injectable({ providedIn: 'root' })
export class PwaSyncService {
  private readonly swUpdate = inject(SwUpdate);

  // Cola de eventos pendientes de sincronización
  readonly pendingSync = signal<SyncEvent[]>([]);

  // Estado de sincronización
  readonly isSyncing = signal(false);
  readonly lastSyncAt = signal<number | null>(null);
  readonly syncError = signal<string | null>(null);

  // SW update disponible
  readonly updateAvailable = signal(false);

  constructor() {
    this.cargarCola();
    this.escucharActualizacionesSW();
    this.registrarSyncPeriodico();
  }

  /** Añade un evento a la cola de sincronización */
  encolar(evento: Omit<SyncEvent, 'timestamp' | 'profileId'>): void {
    const profileId = this.obtenerProfileId();
    if (!profileId) return;

    const eventoCompleto: SyncEvent = {
      ...evento,
      timestamp: Date.now(),
      profileId,
    };

    this.pendingSync.update(cola => [...cola, eventoCompleto]);
    this.guardarCola();
    this.intentarSync();
  }

  /** Fuerza sincronización inmediata */
  async sincronizarAhora(): Promise<void> {
    if (this.isSyncing() || this.pendingSync().length === 0) return;

    this.isSyncing.set(true);
    this.syncError.set(null);

    try {
      await this.ejecutarSync();
      this.lastSyncAt.set(Date.now());
      this.pendingSync.set([]);
      this.guardarCola();
    } catch (e) {
      this.syncError.set(e instanceof Error ? e.message : 'Error de sincronización');
    } finally {
      this.isSyncing.set(false);
    }
  }

  /** Marca actualización SW disponible */
  private escucharActualizacionesSW(): void {
    this.swUpdate.versionUpdates
      .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable.set(true);
      });
  }

  /** Aplica actualización SW y recarga */
  async aplicarActualizacion(): Promise<void> {
    await this.swUpdate.activateUpdate();
    window.location.reload();
  }

  /** Registra sincronización periódica (cada 5 min si hay cola) */
  private registrarSyncPeriodico(): void {
    setInterval(() => {
      if (this.pendingSync().length > 0 && !this.isSyncing()) {
        this.intentarSync();
      }
    }, 5 * 60 * 1000); // 5 minutos
  }

  /** Intenta sincronizar si hay conectividad */
  private async intentarSync(): Promise<void> {
    if (!navigator.onLine || this.isSyncing() || this.pendingSync().length === 0) return;

    // Usar Background Sync API si está disponible
    if ('serviceWorker' in navigator && 'sync' in (window as any).registration) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await (registration as any).sync.register('api-sync');
        return;
      } catch {
        // Fallback a sync manual
      }
    }

    await this.ejecutarSync();
  }

  /** Ejecuta la sincronización real (POST a /api/sync) */
  private async ejecutarSync(): Promise<void> {
    const cola = this.pendingSync();
    if (cola.length === 0) return;

    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: cola }),
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (e) {
      // Si falla, mantenemos la cola para reintentar
      throw e;
    }
  }

  private cargarCola(): void {
    try {
      const raw = localStorage.getItem('brainyLearning_syncQueue');
      if (raw) this.pendingSync.set(JSON.parse(raw));
    } catch {
      this.pendingSync.set([]);
    }
  }

  private guardarCola(): void {
    localStorage.setItem('brainyLearning_syncQueue', JSON.stringify(this.pendingSync()));
  }

  private obtenerProfileId(): string | null {
    return localStorage.getItem('brainyLearning_active_id');
  }
}