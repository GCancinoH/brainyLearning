import { Service, inject, signal } from '@angular/core';
import { GameAudioService } from './game-audio.service';
import { SpeechService } from '../services/speech.service';

/**
 * Dice las cosas: reproduce clips de voz encadenados y, si no hay clip, cae al TTS.
 *
 * POR QUÉ UN SERVICIO Y NO LLAMAR AL AUDIO DIRECTAMENTE DESDE CADA JUEGO
 * Cuatro cosas que hay que hacer siempre igual y que son fáciles de olvidar:
 *
 *  1. **No solapar voces.** Si la niña toca 🔊 tres veces seguidas, sin control se
 *     amontonan tres frases a la vez y no se entiende ninguna. Cada `say()`/`play()`
 *     recibe un número (`seq`) y, al despertar de cada `await`, comprueba que sigue
 *     siendo el suyo.
 *
 *  2. **Saber si de verdad se oyó.** `GameAudioService` se traga los errores a propósito
 *     (el juego debe continuar sin audio). `playFileAndWait` devuelve si/no, y ese "no" es
 *     lo que dispara el TTS y lo que permite no castigar a la niña por no entender.
 *
 *  3. **Que el TTS no se quede mudo sin avisar.** `SpeechService` ya lo resuelve (voces
 *     locales, `voiceschanged`, fallo silencioso). No se llama a `speechSynthesis` aquí
 *     justamente para no duplicar eso.
 *
 *  4. **Un TTS por idioma, y con el texto correcto.** Escribir `speechSynthesis.speak(text,
 *     'ja-JP')` a mano en cada sitio es como se acabaron mandando kanji al TTS: el motor
 *     elige la lectura y dice 明 como "メイ" cuando lo que se quería enseñar era "あかるい".
 *     Aquí el idioma y el texto salen del manifiesto, no del código de quien llama.
 *
 * ⚠️ Un fallo de voz NO es un error de la app: el juego sigue siendo jugable sin sonido
 * gracias a la insignia visual y la escalera de ayuda. Por eso nada de esto lanza.
 */
@Service()
export class Narrator {
  private readonly audio = inject(GameAudioService);
  private readonly speech = inject(SpeechService);

  /** Token de secuencia: cada `say()`/`play()` lo incrementa y queda invalidado por el siguiente. */
  private seq = 0;

  readonly speaking = signal(false);

  /** Un cue: un clip, una etiqueta para la interfaz, y una pausa opcional después. */
  private _cues: Cue[] = [];
  /** Cuál de los cues está sonando ahora. La interfaz lo lee para el karaoke. */
  readonly cue = signal<Cue | null>(null);

  private _base = '';
  private _manifest: Record<string, ClipSpec> = {};
  private _defaultLang = 'es-MX';

  /**
   * Configura dónde viven los clips y qué se dice en cada uno.
   *
   * El manifiesto es lo que permite que el TTS de reserva diga la frase correcta **en el
   * idioma correcto**. Sin él, un clip ausente en japonés intentaría leerse con voz
   * española.
   */
  configure(opts: { base: string; manifest?: Record<string, ClipSpec>; defaultLang?: string }): void {
    if (opts.base !== undefined) this._base = opts.base;
    if (opts.manifest) this._manifest = opts.manifest;
    if (opts.defaultLang) this._defaultLang = opts.defaultLang;
  }

  // ============================================
  // SECUENCIAS CON ETIQUETAS (karaoke)
  // ============================================

  /**
   * Reproduce una secuencia de cues y va avisando de cuál suena.
   *
   * `onCue` recibe el cue **antes** de que suene, que es lo que necesita el karaoke para
   * iluminar la pieza correcta, y `null` al terminar para apagar la iluminación.
   *
   * @returns `true` si la secuencia se oyó **completa**. `false` si se canceló.
   */
  async play<T extends Cue>(cues: T[], onCue?: (c: T | null) => void): Promise<boolean> {
    const mine = ++this.seq;
    this.speaking.set(true);
    this.cue.set(null);

    try {
      for (const c of cues) {
        if (mine !== this.seq) return false;

        onCue?.(c);
        this.cue.set(c);

        const oido = await this._sayOne(c.clip);
        if (mine !== this.seq) return false;

        if (c.pauseAfterMs) await this._sleep(c.pauseAfterMs, mine);
      }
      return mine === this.seq;
    } finally {
      onCue?.(null);
      if (mine === this.seq) {
        this.cue.set(null);
        this.speaking.set(false);
      }
    }
  }

  /** Espera un rato, pero se corta en cuanto la cancelan (no bloquea la partida). */
  private async _sleep(ms: number, mine: number): Promise<void> {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (mine !== this.seq) return;
      await new Promise(r => setTimeout(r, 40));
    }
  }

  // ============================================
  // UN CLIP SUELTO
  // ============================================

  /**
   * Reproduce uno o varios clips en orden.
   *
   * @param text texto de reserva si no hay clip. Si se omite, se usa el del manifiesto.
   */
  async say(
    keys: string | (string | null)[] | null,
    text?: string,
    opts: { gapMs?: number } = {}
  ): Promise<boolean> {
    const gap = opts.gapMs ?? 120;
    const lista = Array.isArray(keys) ? keys : [keys];
    const cues: Cue[] = lista
      .filter((k): k is string => !!k)
      .map(clip => ({ clip }));
    if (cues.length === 0) return false;
    return this._sayWithFallback(cues, text, gap);
  }

  /** `say()` con el TTS de reserva cuando falta el clip. */
  private async _sayWithFallback(cues: Cue[], text?: string, gapMs = 120): Promise<boolean> {
    const mine = ++this.seq;
    this.speaking.set(true);
    try {
      for (let i = 0; i < cues.length; i++) {
        if (mine !== this.seq) return false;
        const c = cues[i];
        const oido = await this._sayOne(c.clip, i === 0 ? text : undefined);
        if (mine !== this.seq) return false;
        if (i < cues.length - 1 && gapMs) await this._sleep(gapMs, mine);
      }
      return mine === this.seq;
    } finally {
      if (mine === this.seq) this.speaking.set(false);
    }
  }

  /**
   * Un clip. Devuelve `true` si se oyó.
   *
   * Si no hay fichero, cae al TTS con el idioma y el texto **del manifiesto**. Ese es el
   * motivo de que el manifiesto exista: no es documentación, es el plan B.
   */
  private async _sayOne(key: string, textoExtra?: string): Promise<boolean> {
    const spec = this._manifest[key];
    const clip = await this._tryClip(key);
    if (clip) return true;

    const texto = textoExtra ?? spec?.tts;
    if (!texto) return false;
    const lang = spec?.lang ?? this._defaultLang;
    const ok = this.speech.speak(texto, lang, { rate: lang === 'es-MX' ? 0.85 : 0.7 });
    if (ok) await this._waitForSpeech();
    return ok;
  }

  /** Reproduce un clip. Devuelve `false` si no hay fichero, no arranca o no terminó. */
  private async _tryClip(key: string): Promise<boolean> {
    if (!this._base) {
      console.warn('[Narrator] Falta `configure({base})`: se intentará solo el TTS para', key);
      return false;
    }
    return this.audio.playFileAndWait(`${this._base}/${key}.wav`);
  }

  /**
   * Calienta clips para que suenen al instante.
   *
   * Sin esto, el primer sonido de una ronda paga la descarga del fichero: se oye un
   * silencio de medio segundo justo cuando el kanji aparece, que es el momento en el que
   * la niña está mirando. El objetivo del diseño es ≤ 300 ms entre aparecer y oír.
   */
  preload(keys: string[]): void {
    if (!this._base) return;
    this.audio.preload(keys.map(k => `${this._base}/${k}.wav`));
  }

  /**
   * Espera a que termine el TTS.
   *
   * `speechSynthesis` no devuelve promesa. Se sondea `speechSynthesis.speaking`, con un
   * techo: si el motor se queda colgado, no se puede quedar colgada también la secuencia
   * de narración de la ronda.
   */
  private async _waitForSpeech(maxMs = 8000): Promise<void> {
    if (typeof speechSynthesis === 'undefined') return;
    const t0 = Date.now();
    while (speechSynthesis.speaking || speechSynthesis.pending) {
      if (Date.now() - t0 > maxMs) break;
      await new Promise(r => setTimeout(r, 80));
    }
    await new Promise(r => setTimeout(r, 60));
  }

  /** Corta lo que esté sonando y anula cualquier secuencia en vuelo. */
  cancel(): void {
    this.seq++;
    this.speaking.set(false);
    this.cue.set(null);
    this.audio.stopAll();
    this.speech.cancel();
  }
}

export interface ClipSpec {
  /** Texto exacto que se dice. Es también el fallback del TTS. */
  tts: string;
  lang: string;
}

export interface Cue<T = unknown> {
  clip: string;
  /** Etiqueta para la interfaz (qué elemento iluminar mientras suena). */
  tag?: T;
  /** Pausa después de este clip, en ms. */
  pauseAfterMs?: number;
}