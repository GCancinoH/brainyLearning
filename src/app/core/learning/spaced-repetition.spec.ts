import { TestBed } from '@angular/core/testing';
import { ProfileStateService } from '../services/profile-state';
import { clearMemoryStorage, installMemoryStorage } from '../testing/memory-storage';
import { CAJA_MAX, INTERVALOS, SpacedRepetition } from './spaced-repetition';

/**
 * Antes este fichero solo montaba el servicio y miraba que no fuera `undefined`, y aun
 * así **fallaba**: `ProfileStateService` lee `localStorage` en su inicializador.
 *
 * Ahora prueba lo que §5.4 pide de verdad, y eso obliga a controlar el reloj: las cajas
 * miden días, y sin mover `Date.now()` ningún kanji vencería jamás dentro de una prueba.
 */
describe('SpacedRepetition', () => {
  const DECK = 'kanji-composition';
  const DIA = 86_400_000;
  let srs: SpacedRepetition;
  /** Identidad de la perfil activa. Cambia entre pruebas para comprobar el aislamiento. */
  let perfilId: string;

  class PerfilStub {
    activeProfile = () => ({
      id: perfilId,
      name: perfilId,
      age: 6,
      avatar: '🌸',
      preferredTheme: 'sakura' as const,
      createdAt: '',
      stickers: [],
      progress: {} as never,
    });
  }

  /** Crea el servicio con un perfil activo, o sin ninguno si se pide. */
  function montar(conPerfil = true): SpacedRepetition {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: ProfileStateService,
          useValue: conPerfil
            ? new PerfilStub()
            : { activeProfile: () => null },
        },
      ],
    });
    return TestBed.inject(SpacedRepetition);
  }

  /** Mueve el reloj a una fecha concreta. Devuelve el instante en ms. */
  function hoy(fecha: string): number {
    const t = new Date(fecha).getTime();
    vi.setSystemTime(t);
    return t;
  }

  /** Cuántos días faltan para que venza un kanji. Los tests piensan en días. */
  const enDias = (desde: number, id: string) =>
    Math.round(((srs.dueAt(DECK, id) ?? 0) - desde) / DIA);

  beforeEach(() => {
    installMemoryStorage();
    clearMemoryStorage();
    vi.useFakeTimers();
    hoy('2026-03-01T09:00:00Z');
    perfilId = 'ana';
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('se monta con un perfil activo', () => {
    expect(montar()).toBeTruthy();
  });

  it('se monta aunque no haya perfil, y no se le cae encima', () => {
    srs = montar(false);
    expect(srs.due(DECK)).toEqual([]);
    expect(srs.dueAt(DECK, 'mori')).toBeNull();
  });

  // ============================================
  // REVISAR · SUBE LA CAJA, REPROGRAMA
  // ============================================

  it('un acierto sube de caja y aleja el próximo repaso', () => {
    srs = montar();
    srs.markIntroduced(DECK, ['mori']);
    const t0 = Date.now();

    srs.review(DECK, 'mori', { correct: true });

    // Presentado hoy en caja 1; un acierto lo deja en la 2 → vence en 2 días.
    expect(enDias(t0, 'mori')).toBe(INTERVALOS[2]);
    expect(srs.due(DECK, t0), 'hoy no toca todavía').toEqual([]);
  });

  it('la caja se queda en el tope, sin acelerar el olvido', () => {
    srs = montar();
    srs.markIntroduced(DECK, ['mori']);
    for (let i = 0; i < 8; i++) srs.review(DECK, 'mori', { correct: true });
    const t0 = Date.now();

    // Ocho aciertos seguidos no pueden acabar en "sale cada 14 días". Si la caja
    // siguiera subiendo, caería al intervalo por defecto —el de la caja 1— y el kanji
    // acabaría saliendo más a menudo cuanto más se le acierte, que es justo al revés.
    expect(enDias(t0, 'mori')).toBe(INTERVALOS[CAJA_MAX]);

    vi.advanceTimersByTime(INTERVALOS[3]! * DIA);
    expect(srs.due(DECK), 'a los 4 días sigue sin tocar').toEqual([]);

    vi.advanceTimersByTime(INTERVALOS[CAJA_MAX]! * DIA);
    expect(srs.due(DECK), 'a los 14 sí sale').toEqual(['mori']);
  });

  it('un fallo vuelve a la caja 1, y eso es mañana', () => {
    srs = montar();
    srs.markIntroduced(DECK, ['mori']);
    for (let i = 0; i < 3; i++) srs.review(DECK, 'mori', { correct: true });
    const t0 = Date.now();
    expect(enDias(t0, 'mori'), 'estaba en la caja 4').toBe(INTERVALOS[4]);

    srs.review(DECK, 'mori', { correct: false });

    // La consecuencia de equivocarse es que salga pronto. Nunca que desaparezca.
    expect(enDias(Date.now(), 'mori')).toBe(INTERVALOS[1]);
  });

  it('un acierto con ayuda no sube de caja, pero vuelve mañana', () => {
    srs = montar();
    srs.markIntroduced(DECK, ['mori']);
    for (let i = 0; i < 2; i++) srs.review(DECK, 'mori', { correct: true });
    const t0 = Date.now();
    expect(enDias(t0, 'mori'), 'estaba en la caja 3').toBe(INTERVALOS[3]);

    // Lo terminó, pero con la escalera subida hasta el final.
    srs.review(DECK, 'mori', { correct: true, ayuda: 3 });

    // La caja no sube: lo que importa es recordar sin andamio. Si contase igual, un
    // kanji que nunca sale sola acabaría desapareciendo dos semanas.
    expect(enDias(Date.now(), 'mori'), 'vuelve mañana').toBe(INTERVALOS[1]);

    // Y un acierto limpio después sí la sube.
    srs.review(DECK, 'mori', { correct: true });
    expect(enDias(Date.now(), 'mori')).toBe(INTERVALOS[4]);
  });

  it('registra un kanji que nadie había presentado, sin romperse', () => {
    srs = montar();
    srs.review(DECK, 'kyuu', { correct: true });

    // Caja 0 (nunca visto) + acierto = caja 1, que es "se ha visto una vez".
    expect(enDias(Date.now(), 'kyuu')).toBe(INTERVALOS[1]);
    expect(srs.isIntroduced(DECK, 'kyuu'), 'ya cuenta como presentado').toBe(true);
  });

  // ============================================
  // DUE · QUIÉN TOCA REPASAR, Y EN QUÉ ORDEN
  // ============================================

  it('devuelve solo los que vencieron, el más atrasado primero', () => {
    srs = montar();
    srs.markIntroduced(DECK, ['hon', 'mori', 'hoshi']);

    hoy('2026-03-01T09:00:00Z');
    srs.review(DECK, 'hon', { correct: false });    // caja 1 → vence el 2
    hoy('2026-03-02T09:00:00Z');
    srs.review(DECK, 'mori', { correct: false });   // caja 1 → vence el 3
    srs.review(DECK, 'hoshi', { correct: true });   // caja 2 → vence el 4

    hoy('2026-03-03T08:00:00Z');
    expect(srs.due(DECK), 'solo hon, que lleva un día vencido').toEqual(['hon']);

    vi.advanceTimersByTime(3 * 60 * 60 * 1000);     // 3 de marzo, 11:00
    // El orden es el del vencimiento y no el del mazo: hon venció antes que mori.
    expect(srs.due(DECK)).toEqual(['hon', 'mori']);
    expect(srs.due(DECK), 'hoshi vence el 4').not.toContain('hoshi');
  });

  it('el orden es por vencimiento, no por alfabeto ni por orden de presentación', () => {
    srs = montar();
    srs.review(DECK, 'mori', { correct: false });    // vence mañana
    vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    srs.review(DECK, 'hon', { correct: false });     // también mañana, pero 6 h después

    vi.advanceTimersByTime(2 * DIA);
    // mori venció antes, y 'hon' va antes en el alfabeto: si el orden saliera por
    // cualquiera de esas dos cosas, la lista saldría al revés.
    expect(srs.due(DECK)).toEqual(['mori', 'hon']);
  });

  it('no mezcla los kanjis de otra perfil', () => {
    srs = montar();
    srs.review(DECK, 'mori', { correct: true });

    // Lucía entra a jugar, con su propio registro en el mismo mazo.
    perfilId = 'lucia';
    srs.review(DECK, 'hon', { correct: true });

    vi.advanceTimersByTime(2 * DIA);

    perfilId = 'ana';
    expect(srs.due(DECK), 'a Ana solo le toca mori').toEqual(['mori']);

    perfilId = 'lucia';
    expect(srs.due(DECK), 'a Lucía solo le toca hon').toEqual(['hon']);
  });
});
