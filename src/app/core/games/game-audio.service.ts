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
  // RUTAS
  // ============================================

  /**
   * Normaliza una ruta de audio a absoluta desde la raíz del sitio.
   * - 'audio/x.wav'        -> '/audio/x.wav'
   * - 'assets/audio/x.wav' -> '/audio/x.wav' (esa carpeta no existe en el build;
   *                           los archivos viven en public/audio)
   * Es idempotente. Sin esto, una ruta relativa se resolvía contra la URL actual
   * y devolvía el index.html en vez del audio.
   */
  private _resolve(path: string): string {
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    let p = path.replace(/^\/+/, '');
    p = p.replace(/^assets\/audio\//, 'audio/');
    return '/' + p;
  }

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
      assets.forEach(raw => {
        const newAsset = { ...raw, paths: raw.paths.map(p => this._resolve(p)) };
        const idx = merged.findIndex(a => a.type === newAsset.type);
        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...newAsset };
        } else {
          merged.push(newAsset);
        }
      });
      return merged;
    });
    this._precacheAssets(assets.map(a => ({ ...a, paths: a.paths.map(p => this._resolve(p)) })));
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

  /** Habilita/deshabilita audio globalmente */
  setEnabled(enabled: boolean): void {
    this._enabled.set(enabled);
    if (!enabled) this.stopAll();
  }

  /** Volumen maestro (0-1) */
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

  /** Reproduce un audio por tipo (selecciona variante aleatoria / round-robin para praise) */
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
    return this._playFile(this._resolve(path), asset.volume ?? 0.85);
  }

  /**
   * Reproduce un archivo específico
   */
  playFile(path: string, volume?: number): Promise<void> {
    if (!this._enabled()) return Promise.resolve();
    return this._playFile(this._resolve(path), volume ?? 0.85);
  }

  async playAndWait(type: AudioType): Promise<void> {
    const asset = this._assets().find(a => a.type === type);
    const path = asset?.paths[0] ? this._resolve(asset.paths[0]) : undefined;
    if (!this._enabled() || !path) return;
    await this._playFile(path, asset?.volume ?? 0.85);
    const audio = this._audioCache.get(path);
    if (!audio || audio.ended || audio.paused) return;
    await new Promise<void>(resolve => {
      audio.addEventListener('ended', () => resolve(), { once: true });
      audio.addEventListener('pause', () => resolve(), { once: true });
    });
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
        // NotSupportedError suele significar 404 / archivo que no es audio
        console.warn(`[GameAudio] Error reproduciendo ${path}:`, err.message);
      }
      // No relanzar - el juego debe continuar sin audio
    }
  }

  // Estado para audio pendiente tras autoplay bloqueado
  private _pendingAudio = signal<{ path: string; volume: number } | null>(null);

  /**
   * Reproduce un archivo y **espera a que termine**. Devuelve `true` si realmente se oyó.
   *
   * Existe porque `_playFile` se traga todos los errores a propósito (el juego debe seguir
   * aunque no haya audio), y quien narra necesita saberlo: si el clip no existe, hay que
   * caer al TTS; si sonó, hay que marcar la consigna como oída para no castigar a la niña
   * por no haber entendido (§5.9 del spec).
   *
   * ⚠️ `playFileAndWait` devuelve `false` en estos casos, todos ellos indistinguibles desde
   * fuera salvo por el motivo:
   *  - el juego tiene el sonido apagado;
   *  - el navegador bloqueó el autoplay (queda en `_pendingAudio`);
   *  - el archivo no existe o no es audio (queda `audio.error`);
   *  - `stopAll()` la cortó a mitad.
   */
  async playFileAndWait(path: string, volume = 0.85, maxWaitMs = 8000): Promise<boolean> {
    if (!this._enabled()) return false;
    const resolved = this._resolve(path);

    await this._playFile(resolved, volume);

    const audio = this._audioCache.get(resolved);
    if (!audio) return false;

    // Autoplay bloqueado: no sonó, pero hay un reintento pendiente de un toque.
    if (this._pendingAudio()?.path === resolved) return false;

    // 404 / formato inválido: el elemento de audio lo sabe aunque `play()` no lanzara.
    if (audio.error) return false;

    if (audio.ended) return true;
    if (audio.paused) return false;   // llegó a `play()` pero no arrancó

    // Techo de seguridad: si el evento nunca llega, esta promesa quedaría colgada para
    // siempre y con ella toda la secuencia de narración de la ronda.
    await new Promise<void>(resolve => {
      const fin = () => resolve();
      const techo = setTimeout(fin, maxWaitMs);
      audio.addEventListener('ended', () => { clearTimeout(techo); fin(); }, { once: true });
      audio.addEventListener('pause', () => { clearTimeout(techo); fin(); }, { once: true });
      audio.addEventListener('error', () => { clearTimeout(techo); fin(); }, { once: true });
    });

    return audio.ended && !audio.error;
  }

  /**
   * Calienta clips para que suenan al instante, sin pagar la descarga en el momento de
   * oírlos.
   *
   * Importa en los juegos "audio-first": el sonido tiene que llegar **justo cuando** el
   * elemento aparece, porque esa coincidencia es lo que forma la asociación. Si el
   * primer sonido de una ronda espera medio segundo a que se descargue el fichero, la
   * niña ve el kanji aparecer en silencio y el momento se pierde.
   */
  preload(paths: string[], volume = 0.85): void {
    for (const raw of paths) {
      const path = this._resolve(raw);
      if (this._audioCache.has(path)) continue;
      try {
        const audio = new Audio(path);
        audio.preload = 'auto';
        audio.volume = volume * this._masterVolume();
        this._audioCache.set(path, audio);
        // `load()` explícito: sin esto algunos navegadores no empiezan a descargar hasta
        // que hay un `<audio>` en el DOM, y este elemento nunca lo estará.
        audio.load();
      } catch {
        // Un clip que no se puede precalentar no es motivo para romper nada: se descargará
        // al usarlo.
      }
    }
  }

  /**
   * Hay un audio que el navegador bloqueó por autoplay y que sonará tras el próximo toque.
   * El juego lo usa para mostrar el botón 🔊 pulsando desde el principio.
   */
  readonly hasPending = computed(() => this._pendingAudio() !== null);

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
      audio.pause();
      audio.currentTime = 0;
    });
    this._currentAudio = null;
    this._pendingAudio.set(null);
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
