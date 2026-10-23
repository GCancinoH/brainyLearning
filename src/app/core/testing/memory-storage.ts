/**
 * `localStorage` en el entorno de test.
 *
 * Existe porque `ProfileStateService` lee el almacén en su inicializador: sin un
 * `localStorage` de verdad, cualquier spec que lo inyecte revienta **en el montaje**,
 * no en la aserción. Y el fallo se ve como "service not provided" o como un
 * `SecurityError` raro, nunca apuntando al origen.
 *
 * Dos funciones en vez de una porque el guard es necesario pero no basta:
 * `installMemoryStorage` no debe reinstalar algo que ya funciona (rompería los specs
 * que sí persisten entre `beforeEach`), pero **vaciar** el contenido entre pruebas sí
 * hace falta para que cada test empiece de cero.
 */

/** Monta un `localStorage` en memoria solo si no hay uno funcional. Idempotente. */
export function installMemoryStorage(): void {
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
  Object.defineProperty(globalThis, 'localStorage', {
    value: fake,
    configurable: true,
    writable: true,
  });
}

/** Vacía el almacén para que la siguiente spec no arrastre estado de la anterior. */
export function clearMemoryStorage(): void {
  installMemoryStorage();
  globalThis.localStorage.clear();
}
