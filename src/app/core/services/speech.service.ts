import { Injectable, computed, signal } from '@angular/core';

/**
 * Voz narrada (speechSynthesis) que SABE si puede hablar y por qué no.
 *
 * Por qué existe esto en lugar de llamar a `speechSynthesis.speak()` directamente:
 *
 *  1. **Falla en silencio.** Si no hay voz, `speak()` NO lanza excepción: emite un evento
 *     `error` y no dice nada. Un `try/catch` no lo detecta. Por eso el fallo se puede
 *     pasar desapercibido durante semanas.
 *
 *  2. **Offline depende de la voz, no del navegador.** Cada voz tiene `localService`:
 *     `true` = está en el dispositivo y funciona sin red; `false` = es una voz de red y
 *     falla sin conexión. Si solo pones `u.lang`, el navegador elige y puede elegir una de
 *     red. Aquí se elige siempre una local, o no se habla.
 *
 *  3. **Las voces cargan de forma asíncrona.** Al pedir `getVoices()` en el arranque suele
 *     devolver `[]` y luego se rellena con el evento `voiceschanged`. Por eso hay que esperar.
 *
 * Los juegos siguen siendo jugables sin voz: esto solo evita que parezca que suena cuando
 * no suena, y avisa una vez para poder diagnosticarlo.
 */
@Injectable({ providedIn: 'root' })
export class SpeechService {
  private readonly _ready = signal(false);
  private readonly _localVoices = signal<SpeechSynthesisVoice[]>([]);
  private readonly _lastError = signal<string | null>(null);
  private readonly _warned = new Set<string>();

  /** Las voces ya llegaron y las conocemos */
  readonly ready = this._ready.asReadonly();
  /** Motivo del último fallo, para poder diagnosticarlo */
  readonly lastError = this._lastError.asReadonly();

  /** Hay al menos una voz local en el idioma pedido */
  canSpeak(lang: string): boolean {
    return this._pickVoice(lang) !== null;
  }

  /**
   * Habla un texto. Si no hay voz local para ese idioma, NO intenta nada y registra por qué.
   * Devuelve si realmente se intentó hablar (útil para tests).
   */
  speak(text: string, lang = 'es-MX', opts: { rate?: number; pitch?: number } = {}): boolean {
    if (typeof speechSynthesis === 'undefined' || !text) return false;

    const voice = this._pickVoice(lang);
    if (!voice) {
      this._warnOnce(lang, `No hay voz local para "${lang}"`);
      return false;
    }

    try {
      speechSynthesis.cancel(); // el motor no serializa bien varios saludos seguidos
      // Se limpia ANTES de hablar: un 'error' puede llegar de forma síncrona dentro de
      // speak(), y limpiarlo después lo borraría justo cuando sí queremos saberlo.
      this._lastError.set(null);
      const u = new SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = opts.rate ?? 0.85;
      u.pitch = opts.pitch ?? 1.1;
      u.addEventListener('error', (e) => {
        this._lastError.set((e as SpeechSynthesisErrorEvent).error || 'error-desconocido');
      });
      speechSynthesis.speak(u);
      return true;
    } catch (e) {
      this._lastError.set(String(e));
      return false;
    }
  }

  cancel(): void {
    try {
      speechSynthesis?.cancel();
    } catch {
      /* sin motor de voz */
    }
  }

  // ============================================
  // INTERNO
  // ============================================

  constructor() {
    if (typeof speechSynthesis === 'undefined') return;

    const load = () => {
      const voices = speechSynthesis.getVoices() ?? [];
      // localService no existe en todos los navegadores; se trata como local salvo que diga false
      this._localVoices.set(voices.filter(v => v.localService !== false));
      this._ready.set(voices.length > 0);
    };

    load();
    if (this._ready()) return;
    // Las voces llegan después: en algunos navegadores hay que esperar al evento
    speechSynthesis.addEventListener('voiceschanged', load, { once: true });
    // Y si el evento no llega (Safari a veces no lo emite), reintento un par de veces
    let tries = 0;
    const retry = setInterval(() => {
      if (this._ready() || ++tries > 10) return clearInterval(retry);
      load();
    }, 500);
  }

  /** Elige la voz local del idioma, prefiriendo la del país exacto (es-MX sobre es-ES) */
  private _pickVoice(lang: string): SpeechSynthesisVoice | null {
    const pool = this._localVoices();
    if (pool.length === 0) return null;
    const base = lang.split('-')[0]!.toLowerCase();
    return (
      pool.find(v => v.lang.toLowerCase() === lang.toLowerCase()) ??
      pool.find(v => v.lang.toLowerCase().startsWith(base)) ??
      null
    );
  }

  /** Avisa una sola vez por idioma: en consola, sin molestar en cada conteo */
  private _warnOnce(lang: string, message: string): void {
    if (this._warned.has(lang)) return;
    this._warned.add(lang);
    this._lastError.set(message);
    console.warn(`[Speech] ${message}. El juego sigue, pero sin voz.`);
  }
}