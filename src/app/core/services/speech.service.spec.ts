import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { SpeechService } from './speech.service';

/**
 * Tests del servicio de voz. El objetivo no es que suene, sino que **no finja**:
 *
 *  - Si no hay voz local para el idioma, NO debe llamar a `speechSynthesis.speak()`
 *    (porque leería el texto con una voz de otro idioma, que es peor que callarse).
 *  - Si `speak()` falla, debe quedar registrado, porque el fallo nativo es silencioso.
 */

interface FakeVoice {
  name: string;
  lang: string;
  localService: boolean;
  default?: boolean;
}

/** Sustituto de speechSynthesis con las voces que le pidamos */
class FakeSpeechSynthesis {
  voices: FakeVoice[] = [];
  spoken: Array<{ text: string; voice: FakeVoice | null }> = [];
  cancelled = 0;
  /** Si se pone a true, speak() emite error sin lanzar excepción (como el navegador real) */
  failSilently = false;

  getVoices = () => this.voices as unknown as SpeechSynthesisVoice[];

  speak(u: SpeechSynthesisUtterance): void {
    if (this.failSilently) {
      const ev = new Event('error') as Event & { error?: string };
      ev.error = 'synthesis-failed';
      u.dispatchEvent(ev);
      return;
    }
    this.spoken.push({
      text: u.text,
      voice: (u.voice as unknown as FakeVoice) ?? null,
    });
  }

  cancel(): void {
    this.cancelled++;
  }

  addEventListener(): void {
    /* no-op: no necesitamos simular voiceschanged */
  }
}

/** speechSynthesis global, listo para inyectar antes de construir el servicio */
let fake: FakeSpeechSynthesis;

/**
 * Instancia nueva del servicio. Se inyecta (y no se importa directo) para que el
 * constructor lea el `speechSynthesis` falso que pone `beforeEach`.
 */
function crearServicio(): SpeechService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [SpeechService] });
  return TestBed.inject(SpeechService);
}

/** El entorno de test no define `SpeechSynthesisUtterance`; en un navegador sí existe. */
class FakeUtterance extends EventTarget {
  text: string;
  lang = '';
  rate = 1;
  pitch = 1;
  voice: SpeechSynthesisVoice | null = null;
  constructor(text: string) {
    super();
    this.text = text;
  }
}

describe('SpeechService', () => {
  beforeEach(() => {
    fake = new FakeSpeechSynthesis();
    (globalThis as unknown as { speechSynthesis: unknown }).speechSynthesis = fake;
    (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
      FakeUtterance;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    const g = globalThis as unknown as {
      speechSynthesis?: unknown;
      SpeechSynthesisUtterance?: unknown;
    };
    delete g.speechSynthesis;
    delete g.SpeechSynthesisUtterance;
    vi.restoreAllMocks();
  });

  it('elige una voz LOCAL del idioma y habla con ella', () => {
    fake.voices = [
      { name: 'Red MX', lang: 'es-MX', localService: false },
      { name: 'Local MX', lang: 'es-MX', localService: true },
    ];
    const s = crearServicio();

    expect(s.speak('cinco', 'es-MX')).toBe(true);
    expect(fake.spoken).toHaveLength(1);
    // Debe usar la local, no la de red
    expect(fake.spoken[0]!.voice?.name).toBe('Local MX');
  });

  it('NUNCA habla con una voz de red (fallaría en silencio sin conexión)', () => {
    fake.voices = [{ name: 'Solo Red', lang: 'es-MX', localService: false }];
    const s = crearServicio();

    expect(s.speak('cinco', 'es-MX')).toBe(false);
    expect(fake.spoken).toHaveLength(0);
    expect(console.warn).toHaveBeenCalled();
  });

  it('si no hay ninguna voz para el idioma, no intenta hablar', () => {
    fake.voices = [{ name: 'Local ES', lang: 'es-ES', localService: true }];
    const s = crearServicio();

    expect(s.speak('こんにちは', 'ja-JP')).toBe(false);
    expect(fake.spoken).toHaveLength(0);
  });

  it('acepta un idioma del mismo grupo (es-MX pide y encuentra es-ES)', () => {
    fake.voices = [{ name: 'Local ES', lang: 'es-ES', localService: true }];
    const s = crearServicio();

    expect(s.speak('cinco', 'es-MX')).toBe(true);
  });

  it('registra el error silencioso del navegador en vez de perderlo', () => {
    fake.voices = [{ name: 'Local MX', lang: 'es-MX', localService: true }];
    fake.failSilently = true;
    const s = crearServicio();

    s.speak('cinco', 'es-MX');
    // El fallo nativo no lanza excepción: solo un evento 'error'. Debe quedar anotado.
    expect(s.lastError()).toBe('synthesis-failed');
  });

  it('avisa una sola vez por idioma, para no inundar la consola al contar', () => {
    fake.voices = [{ name: 'Local ES', lang: 'es-ES', localService: true }];
    const s = crearServicio();

    for (let i = 0; i < 10; i++) s.speak('uno', 'ja-JP');
    expect(console.warn).toHaveBeenCalledTimes(1);
  });

  it('trata una voz sin localService como local (navegadores que no lo exponen)', () => {
    fake.voices = [{ name: 'Vieja', lang: 'es-MX' } as FakeVoice];
    const s = crearServicio();
    expect(s.speak('cinco', 'es-MX')).toBe(true);
  });

  it('sin texto vacío no intenta hablar', () => {
    fake.voices = [{ name: 'Local MX', lang: 'es-MX', localService: true }];
    const s = crearServicio();
    expect(s.speak('', 'es-MX')).toBe(false);
    expect(fake.spoken).toHaveLength(0);
  });

  it('cancel() delega en el motor sin lanzar si no existe', () => {
    const s = crearServicio();
    delete (globalThis as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    expect(() => s.cancel()).not.toThrow();
  });
});