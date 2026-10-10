import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { TutorialSeen } from './tutorial-seen.service';
import { ProfileStateService } from '../services/profile-state';

/**
 * El entorno de test de Angular no trae `localStorage`, y el servicio está pensado para
 * sobrevivir a eso (si no hay almacenamiento, se muestran tutoriales de más, que es un
 * fallo mucho más barato que romper la app). Aquí se instala uno falso para poder
 * comprobar tanto el camino con almacenamiento como el sin él.
 */
function instalarLocalStorage(): { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> } {
  const store = new Map<string, string>();
  const getItem = vi.fn((k: string) => store.get(k) ?? null);
  const setItem = vi.fn((k: string, v: string) => { store.set(k, v); });
  (globalThis as unknown as { localStorage: unknown }).localStorage = { getItem, setItem };
  return { getItem, setItem };
}

function perfil(id: string) {
  const estado = TestBed.inject(ProfileStateService) as unknown as {
    activeProfile: ReturnType<typeof vi.fn>;
  };
  vi.spyOn(estado, 'activeProfile').mockReturnValue({ id } as never);
}

function nuevoServicio(): TutorialSeen {
  return TestBed.runInInjectionContext(() => new TutorialSeen());
}

describe('TutorialSeen', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TutorialSeen, ProfileStateService] });
    instalarLocalStorage();
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    vi.restoreAllMocks();
  });

  it('no ha visto ningún tutorial al empezar', () => {
    perfil('ana');
    const s = nuevoServicio();
    expect(s.has('logic-blocks', 'one')).toBe(false);
  });

  it('recuerda lo que se marcó', () => {
    perfil('ana');
    const s = nuevoServicio();
    s.mark('logic-blocks', 'one');
    expect(s.has('logic-blocks', 'one')).toBe(true);
  });

  it('el tutorial es POR MODO: ver el de una canasta no marca el de dos', () => {
    // Es el motivo de que la clave sea `perfil:juego:modo`: el paso a dos canastas en el
    // nivel 8 es otra mecánica y hay que presentarla aunque ya se haya visto la otra.
    perfil('ana');
    const s = nuevoServicio();
    s.mark('logic-blocks', 'one');
    expect(s.has('logic-blocks', 'one')).toBe(true);
    expect(s.has('logic-blocks', 'two')).toBe(false);
  });

  it('los perfiles distintos no se pisan', () => {
    perfil('ana');
    const s1 = nuevoServicio();
    s1.mark('logic-blocks', 'one');

    perfil('lucia');
    const s2 = nuevoServicio();
    expect(s2.has('logic-blocks', 'one')).toBe(false);
  });

  it('un juego distinto no se confunde con otro', () => {
    perfil('ana');
    const s = nuevoServicio();
    s.mark('logic-blocks', 'one');
    expect(s.has('otro-juego', 'one')).toBe(false);
  });

  it('reset() de un juego borra solo ese juego', () => {
    perfil('ana');
    const s = nuevoServicio();
    s.mark('logic-blocks', 'one');
    s.mark('coin-shop', 'count');

    s.reset('logic-blocks');
    expect(s.has('logic-blocks', 'one')).toBe(false);
    expect(s.has('coin-shop', 'count')).toBe(true);
  });

  it('reset() sin argumento borra todo', () => {
    perfil('ana');
    const s = nuevoServicio();
    s.mark('logic-blocks', 'one');
    s.mark('coin-shop', 'count');
    s.reset();
    expect(s.has('logic-blocks', 'one')).toBe(false);
    expect(s.has('coin-shop', 'count')).toBe(false);
  });

  it('persiste en localStorage, no solo en memoria', () => {
    const { setItem } = instalarLocalStorage();
    perfil('ana');
    nuevoServicio().mark('logic-blocks', 'one');
    expect(setItem).toHaveBeenCalledWith('brainyLearning_tutorialSeen', expect.any(String));
  });

  it('si el almacenamiento no deja escribir, no se rompe: se muestran tutoriales de más', () => {
    // Es el fallo barato. El caro sería lanzar y dejar el juego sin jugar.
    //
    // Se prueba el caso real y habitual: la **escritura** falla (cuota llena, modo
    // privado de Safari). `getItem` se deja funcionando a propósito, porque la lectura se
    // cubre con el test de basura en el JSON, y porque `ProfileStateService` — de la que
    // este servicio depende — llama a `getItem` en su inicializador sin protegerlo: si
    // aquí `getItem` lanzado, el fallo sería de la dependencia, no de lo que se quiere
    // comprobar aquí.
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: () => { throw new Error('QuotaExceededError'); }
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [TutorialSeen, ProfileStateService] });
    perfil('ana');

    const s = nuevoServicio();
    expect(() => s.mark('logic-blocks', 'one')).not.toThrow();
    expect(s.has('logic-blocks', 'one')).toBe(true);   // en memoria sí se guardó
  });

  it('si el almacenamiento tiene basura, se ignora en vez de romper', () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => '{esto no es json',
      setItem: () => { }
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [TutorialSeen, ProfileStateService] });
    perfil('ana');
    const s = nuevoServicio();
    expect(s.has('logic-blocks', 'one')).toBe(false);
  });
});