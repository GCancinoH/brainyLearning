/**
 * Servicio de audio para juegos educativos
 * Abstrae la reproducción con manejo seguro de errores
 * Fase 1: Motor común mínimo
 */
import { Service, signal, computed, effect } from '@angular/core';
import { AudioType, AudioAsset, DEFAULT_AUDIO_CONFIG } from './game-types';

@Service()
export class GameAudioService {
  // Estado
  private _assets = signal<AudioAsset[]>(DEFAULT_AUDIO_CONFIG);
  private _enabled = signal<boolean>(true);
  private _masterVolume = signal<number>(1.0);
  private _audioCache: Map<string, HTMLAudioElement> = new Map();
  private _currentAudio: HTMLAudioElement | null = null;
  // Round-robin para praise (evita repetir el mismo)
  private _praiseIndex = 0;

  // Selectors
  readonly enabled = this._enabled.asReadonly();
  readonly masterVolume = this._masterVolume.asReadonly();
  readonly assets = this._assets.asReadonly();

  // ============================================
  // CONFIGURACIÓN
  // ============================================

  /**
   * Registra/actualiza assets de audio para este juego
   * Los juegos pueden llamar esto en su inicialización
   */
  registerAssets(assets: AudioAsset[]): void {
    this._assets.update(current => {
      const merged = [...current];
      assets.forEach(newAsset => {
        const idx = merged.findIndex(a => a.type === newAsset.type);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...newAsset };
        } else {
          merged.push(newAsset);
        }
      });
      return merged;
    });
    this._precacheAssets(assets);
  }

  /**
   * Precarga assets en caché para reproducción instantánea
   */
  private _precacheAssets(assets: AudioAsset[]): void {
    assets.forEach(asset => {
      asset.paths.forEach(path => {
        if (!this._audioCache.has(path)) {
          try {
            const audio = new Audio(path);
            audio.preload = 'auto';
            audio.volume = (asset.volume ?? 0.85) * this._masterVolume();
            this._audioCache.set(path, audio);
          } catch (e) {
            console.warn(`[GameAudio] No se pudo precargar: ${path}`, e);
          }
        }
      });
    });
  }

  /**
   * Habilita/deshabilita audio globalmente
   */
  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    if (!enabled) this.stopAll();
  }

  /**
   * Volumen maestro (0-1)
   */
  setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this._masterVolume.set(clamped);
    this._audioCache.forEach(audio => {
      audio.volume = audio.volume * (clamped / (this._masterVolume() || 1));
    });
  }

  // ============================================
  // REPRODUCCIÓN
  // ============================================

  /**
   * Reproduce un audio por tipo (selecciona variante aleatoria / round-robin para praise)
   */
  play(type: AudioType): Promise<void> {
    if (!this._enabled()) return Promise.resolve();

    const asset = this._assets().find(a => a.type === type);
    if (!asset || asset.paths.length === 0) {
      console.debug(`[GameAudio] Sin asset para tipo: ${type}`);
      return Promise.resolve();
    }

    // Para praise: round-robin para distribuir uniformemente
    let path: string;
    if (type === 'praise' && asset.paths.length > 1) {
      path = asset.paths[this._praiseIndex];
      this._praiseIndex = (this._praiseIndex + 1) % asset.paths.length;
    } else {
      // Seleccionar variante aleatoria
      path = asset.paths[Math.floor(Math.random() * asset.paths.length)];
    }
    return this._playFile(path, asset.volume ?? 0.85);
  }

  /**
   * Reproduce un archivo específico
   */
  playFile(path: string, volume?: number): Promise<void> {
    if (!this._enabled()) return Promise.resolve();
    return this._playFile(path, volume ?? 0.85);
  }

  /**
   * Reproducción interna con manejo de errores y reintento tras interacción
   */
  private async _playFile(path: string, volume: number): Promise<void> {
    try {
      let audio = this._audioCache.get(path);

      if (!audio) {
        audio = new Audio(path);
        this._audioCache.set(path, audio);
      }

      // Resetear si ya se reprodujo
      if (audio.currentTime > 0) {
        audio.currentTime = 0;
      }

      audio.volume = volume * this._masterVolume();

      // Reproducir y manejar promesa
      const playPromise = audio.play();

      if (playPromise !== undefined) {
        await playPromise;
      }

      this._currentAudio = audio;
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };

      // Autoplay bloqueado - registrar para reintento tras click del usuario
      if (err.name === 'NotAllowedError') {
        console.debug('[GameAudio] Autoplay bloqueado - se reintentará en próxima interacción');
        // Guardar pendiente para reintento
        this._pendingAudio.set({ path, volume });
        return;
      }

      if (err.name !== 'AbortError') {
        console.warn(`[GameAudio] Error reproduciendo ${path}:`, err.message);
      }
      // No relanzar - el juego debe continuar sin audio
    }
  }

  // Estado para audio pendiente tras autoplay bloqueado
  private _pendingAudio = signal<{ path: string; volume: number } | null>(null);

  /**
   * Reintenta audio pendiente (llamar tras interacción del usuario, ej. click en botón)
   */
  retryPendingAudio(): void {
    const pending = this._pendingAudio();
    if (pending) {
      this._pendingAudio.set(null);
      this._playFile(pending.path, pending.volume);
    }
  }

  /**
   * Detiene el audio actual (NO detiene level-up ni praise para que terminen)
   */
  stopCurrent(): void {
    if (this._currentAudio) {
      // No interrumpir level-up ni praise - dejar que terminen naturalmente
      this._currentAudio = null;
    }
  }

  /**
   * Detiene todos los audios (NO detiene level-up para que termine)
   */
  stopAll(): void {
    this._audioCache.forEach(audio => {
      // No pausar - dejar que terminen naturalmente
    });
    this._currentAudio = null;
  }

  /**
   * Pausa/reanuda audio actual
   */
  togglePause(): void {
    if (this._currentAudio) {
      if (this._currentAudio.paused) {
        this._currentAudio.play().catch(() => {});
      } else {
        this._currentAudio.pause();
      }
    }
  }

  // ============================================
  // MÉTODOS DE CONVENIENCIA (semánticos)
  // ============================================

  playPraise(): Promise<void> { return this.play('praise'); }
  playSuccess(): Promise<void> { return this.play('success'); }
  playFailure(): Promise<void> { return this.play('failure'); }
  playLevelUp(): Promise<void> { return this.play('level-up'); }
  playInstruction(): Promise<void> { return this.play('instruction'); }
  playQuestion(): Promise<void> { return this.play('question'); }
  playComplete(): Promise<void> { return this.play('complete'); }

  // ============================================
  // LIMPIEZA
  // ============================================

  /**
   * Libera recursos (llamar en ngOnDestroy del juego)
   */
  dispose(): void {
    this.stopAll();
    this._audioCache.clear();
  }
}
