import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { CoinShop } from './coin-shop';
import { waysFor } from './coin-shop-problem';
import { CoinShopGallery } from './coin-shop-gallery.service';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { GameSessionService } from '@core/games/game-session.service';

/**
 * TEST DE INTEGRACIÓN DEL COMPONENTE.
 *
 * Existe por una razón concreta: los tests de lógica pura (`coin-shop-problem.spec.ts`) pasan
 * en verde aunque el juego sea IMPOSIBLE de terminar. Los dos bugs más caros que cometí en este
 * juego —`busy` que se quedaba en `true` y bloqueaba todos los toques— estaban en estado del
 * componente, invisible para `buildCoinProblem`. Solo un test que monte el componente y recorra
 * el flujo entero los atrapa.
 *
 * Este test SIEMPRE debe recorrer una ronda completa de principio a fin.
 */

// ---------- Stubs: edad y nivel controlados ----------

class ProfileStub {
  age: 4 | 6 = 4;
  activeProfile = () => ({
    id: 'test-profile',
    name: 'Test',
    age: this.age,
    avatar: '🧪',
    preferredTheme: 'space' as const,
    createdAt: '',
    stickers: [],
    progress: {} as never,
  });
  getGameLevel = () => 1;
  isGameCompleted = () => false;
  saveGameProgress = () => {};
}

class ProgressStub {
  level = 1;
  getLevel = () => this.level;
  saveProgress = (_id: string, p: { level: number }) => {
    this.level = p.level;
  };
}

/**
 * El entorno de test no trae `localStorage`. Se instala uno en memoria para poder
 * comprobar que la galería persiste; en producción sí existe de verdad.
 */
function installMemoryStorage(): void {
  const g = globalThis as unknown as { localStorage?: Storage };
  if (g.localStorage?.getItem) return;
  const store = new Map<string, string>();
  const fake: Storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  // defineProperty y no asignación: en algunos entornos `localStorage` existe como
  // propiedad de solo lectura y la asignación silenciosa no hace nada.
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
    writable: true,
  });
}

describe('CoinShop (integración)', () => {
  let fixture: ComponentFixture<CoinShop>;
  let component: CoinShop;
  let profile: ProfileStub;
  let progress: ProgressStub;

  /** Monta el componente con edad y nivel concretos */
  function mount(age: 4 | 6, level = 1): void {
    profile = new ProfileStub();
    profile.age = age;
    progress = new ProgressStub();
    progress.level = level;

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CoinShop],
      providers: [
        { provide: ProfileStateService, useValue: profile },
        { provide: GameProgressService, useValue: progress },
        CoinShop,
      ],
    });
    fixture = TestBed.createComponent(CoinShop);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  /** Pulsa el primer elemento que coincida con el selector */
  function click(selector: string): boolean {
    const el = fixture.nativeElement.querySelector(selector) as HTMLElement | null;
    if (!el) return false;
    el.click();
    fixture.detectChanges();
    return true;
  }

  /** Todos los que coincidan, para poder elegir por texto */
  function all(selector: string): HTMLElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  }

  function byText(selector: string, text: string): HTMLElement | undefined {
    return all(selector).find(el => el.textContent?.trim() === text);
  }

  /** Avanza todos los temporizadores pendientes (el juego usa setTimeout) */
  async function advance(ms: number): Promise<void> {
    vi.advanceTimersByTime(ms);
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    installMemoryStorage();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  // ============================================
  // 4 AÑOS · MODO 'count'
  // ============================================

  it('cuenta, se equivoca, y tras el error NO puede responder sin contar todos', () => {
    mount(4, 1);
    expect(component.mode()).toBe('count');

    const total = component.shelf().length;
    expect(total).toBeGreaterThan(0);

    // Se equivoca a propósito
    const wrong = component.options().find(o => o !== component.answer())!;
    component.selectOption(wrong);
    fixture.detectChanges();

    expect(component.feedbackState()).toBe('try-again');
    expect(component.showHint()).toBe(true);
    // con el conteo incompleto NO se puede volver a intentar
    expect(component.canAnswer()).toBe(false);

    // cuenta todos uno a uno
    for (const o of component.shelf()) component.onItemTap(o.id);
    fixture.detectChanges();
    expect(component.canAnswer()).toBe(true);

    // y ahora sí, acertar suma a la racha
    component.selectOption(component.answer());
    fixture.detectChanges();
    expect(component.consecutiveCorrect()).toBe(1);
  });

  it('contar en desorden muestra los números en el orden de toque', () => {
    mount(4, 1);
    const shelf = component.shelf();
    const orden = [shelf[shelf.length - 1]!.id, shelf[0]!.id, shelf[1]!.id].filter(
      v => v !== undefined,
    );
    for (const id of orden) component.onItemTap(id);
    fixture.detectChanges();

    expect(component.tappedOrder(orden[0]!)).toBe(1);
    expect(component.tappedOrder(orden[1]!)).toBe(2);
    expect(component.tappedOrder(orden[2]!)).toBe(3);
  });

  it('no deja contar dos veces el mismo objeto', () => {
    mount(4, 1);
    const first = component.shelf()[0]!.id;
    component.onItemTap(first);
    component.onItemTap(first);
    fixture.detectChanges();
    expect(component.tapped().length).toBe(1);
  });

  // ============================================
  // 4 AÑOS · MODO 'give'
  // ============================================

  it('"ponle N en la bolsa": entrega de más avisa pero no rompe la racha', () => {
    mount(4, 5); // "dame N" solo existe desde el nivel 5
    // El generador decide count/give al azar (50%): pedimos hasta que salga give.
    // Se usa la API pública: `giveMode` es un signal, `mode` se deriva de él.
    for (let i = 0; i < 40 && component.mode() !== 'give'; i++) {
      component.generateProblem();
    }
    component.giveMode.set(true);
    fixture.detectChanges();
    expect(component.mode()).toBe('give');

    const asked = component.answer();
    expect(component.shelf().length).toBe(asked + 3);

    const streakBefore = component.consecutiveCorrect();

    // mete uno de más
    for (const o of component.shelf().slice(0, asked + 1)) component.putInBag(o.id);
    fixture.detectChanges();
    component.deliver();
    fixture.detectChanges();

    expect(component.feedbackState()).not.toBe('success');
    expect(component.consecutiveCorrect()).toBe(streakBefore); // la racha no se rompió

    // saca el de más y entrega bien
    const extra = component.shelf()[asked]!.id;
    component.takeOutOfBag(extra);
    fixture.detectChanges();
    component.deliver();
    fixture.detectChanges();

    expect(component.feedbackState()).toBe('success');
    expect(component.consecutiveCorrect()).toBe(streakBefore + 1);
  });

  // ============================================
  // 6 AÑOS · MODO 'pay'
  // ============================================

  it('no deja gastar más monedas de las que hay en la cartera', () => {
    mount(6, 1);
    expect(component.mode()).toBe('pay');

    const ones = component.coinValues()[0]!;
    const stock = component.coinLeft(ones);
    expect(stock).toBeGreaterThan(0);

    for (let i = 0; i < stock + 5; i++) component.dropCoin(ones);
    fixture.detectChanges();

    const usadas = component.purse().filter(c => c.value === ones).length;
    expect(usadas).toBeLessThanOrEqual(stock);
    expect(component.coinLeft(ones)).toBe(0);
  });

  it('pasarse del precio NO rompe la racha y no mete la moneda', () => {
    mount(6, 1);
    const streakBefore = component.consecutiveCorrect();

    // paga de más: mete una moneda mayor que el total
    const mayor = Math.max(...component.coinValues());
    const fifteens = component.remaining();
    if (mayor > fifteens) {
      component.dropCoin(mayor);
      fixture.detectChanges();
      expect(component.purse().length).toBe(0);
      expect(component.consecutiveCorrect()).toBe(streakBefore);
    }
  });

  it('ataca la racha si se queda sin forma de llegar', () => {
    mount(6, 1);
    // deja la cartera en un estado imposible a propósito
    component.supply.set({ 5: 1 });
    component.price.set(7);
    component.prePaid.set(0);
    fixture.detectChanges();

    expect(component.remaining()).toBe(7);
    expect(component.isStuck()).toBe(true);

    component.dropCoin(5);
    fixture.detectChanges();
    expect(component.remaining()).toBe(2);
    expect(component.isStuck()).toBe(true); // 2 no se puede con lo que queda
  });

  // ============================================
  // EL BUG QUE ESTE TEST EXISTE PARA ATRAPAR
  // ============================================

  it('TRABAJA UNA RONDA COMPLETA QUE PIDE VARIAS FORMAS Y CUENTA EL ACIERTO', async () => {
    mount(6, 5); // nivel 5: exige 2 formas distintas
    // Nos aseguramos de que la ronda pide más de una forma
    component['waysRequired'].set(2);

    const price = component.price();
    const required = 2;

    /** Paga el precio exacto con la lista de monedas dada */
    function pagar(coins: number[]): void {
      component.purse.set([]);
      component.busy.set(false);
      for (const c of coins) component.dropCoin(c);
      fixture.detectChanges();
    }

    // Las dos formas válidas se le piden al propio generador (`waysFor`), así que son
    // garantizadamente distintas y pagables con el stock disponible. Reordenar la misma
    // combinación NO sirve: `comboKey` la ordena y sería la misma forma.
    const cap = price - component.prePaid();
    const formas = waysFor(component.supply(), cap).map(s => s.split('+').map(Number));
    expect(formas.length, 'el generador debe ofrecer al menos 2 formas').toBeGreaterThanOrEqual(required);

    pagar(formas[0]!);
    expect(component.found().length).toBe(1);
    // Descubrir la primera forma todavía NO cuenta como acierto
    expect(component.consecutiveCorrect()).toBe(0);

    // el juego vacía la alcancía solo: nos fijamos en que busy quede libre
    await advance(2500);
    expect(component.busy()).toBe(false); // <-- el bug histórico fallaba AQUÍ
    expect(component.purse().length).toBe(0);

    // segunda forma, genuinamente distinta
    pagar(formas[1]!);
    expect(component.found().length).toBe(required);
    expect(component.consecutiveCorrect()).toBe(1); // <-- y el acierto se cuenta AQUÍ
  });

  it('descubrir la misma forma dos veces no cuenta como nueva', async () => {
    mount(6, 5);
    component.waysRequired.set(2);

    // forma válida sacada del generador (respeta el stock: pedir N $1 lo agotaría)
    const cap = component.price() - component.prePaid();
    const forma = waysFor(component.supply(), cap)[0]!.split('+').map(Number);

    component.purse.set([]);
    component.busy.set(false);
    for (const c of forma) component.dropCoin(c);
    fixture.detectChanges();
    expect(component.found().length).toBe(1);

    await advance(2500);

    // la misma combinación otra vez
    component.purse.set([]);
    component.busy.set(false);
    for (const c of forma) component.dropCoin(c);
    fixture.detectChanges();

    expect(component.found().length).toBe(1); // sigue siendo 1
    expect(component.hint()).toContain('ya la descubriste');
    expect(component.consecutiveCorrect()).toBe(0); // no cuenta como acierto
  });

  // ============================================
  // GALERÍA PERSISTENTE
  // ============================================

  it('la galería recuerda las formas entre rondas y entre sesiones', async () => {
    mount(6, 5);
    component.waysRequired.set(2);

    const cap = component.price() - component.prePaid();
    const forma = waysFor(component.supply(), cap)[0]!.split('+').map(Number);

    component.purse.set([]);
    component.busy.set(false);
    for (const c of forma) component.dropCoin(c);
    fixture.detectChanges();
    await advance(2500);

    expect(component.galleryTotal()).toBe(1);

    // "reconstruir" el componente: la galería debe sobrevivir
    mount(6, 5);
    expect(component.galleryTotal()).toBe(1);
  });

  it('la galería NO cuenta dos veces la misma combinación', () => {
    mount(6, 1);
    // Se prueba el servicio a través de su propia inyección, no expuesta por el componente
    const gallery = TestBed.inject(CoinShopGallery);
    expect(gallery.total()).toBe(0);

    expect(gallery.discover(7, [1, 1, 5])).toBe(true);
    expect(gallery.total()).toBe(1);

    // la misma otra vez, reordenada: no suma
    expect(gallery.discover(7, [5, 1, 1])).toBe(false);
    expect(gallery.total()).toBe(1);
    // misma combinación, distinto precio: sí suma
    gallery.discover(8, [1, 1, 5]);
    expect(gallery.total()).toBe(2);

    // y el componente lo expone sin envolver en otra señal
    expect(component.galleryTotal()).toBe(2);
  });

  // ============================================
  // LÓGICA DE MONEDAS EXPUESTA EN LA VISTA
  // ============================================

  it('los valores de moneda salen del stock, no de una lista fija', () => {
    mount(6, 1);
    expect(component.coinValues()).toEqual(Object.keys(component.supply()).map(Number).sort((a, b) => a - b));
    // el template itera coinValues(), así que el botón de $10 no aparece en niveles bajos
    for (const v of component.coinValues()) expect(component.coinLeft(v)).toBeGreaterThan(0);
  });
});