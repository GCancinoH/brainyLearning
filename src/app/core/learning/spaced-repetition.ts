import { Service, inject, signal } from '@angular/core';
import { ProfileStateService } from '../services/profile-state';

export const JAPANESE_VOCAB_DECK = 'japanese-vocab';
/** Mazo de kanji-compose. El nombre es el fichero de los recuerdos de cada kanji. */
export const KANJI_COMPOSITION_DECK = 'kanji-composition';
/** 3.2 · Mazo de Números Hanzi: un recuerdo por número (1–99), no por nivel. */
export const HANZI_NUMBERS_DECK = 'hanzi-numbers';
const STORAGE_KEY = 'brainyLearning_srs';

/**
 * Cuánto dura cada caja, en días.
 *
 * `[1, 2, 4, 7, 14]`: la curva clásica de Leitner. Es deliberadamente corta por arriba.
 * Con 13 kanji y niñas que juegan a ratos, un fallo vuelve a la caja 1, y el peor caso
 * posible de eso es "sale mañana": la consecuencia de equivocarse es que el kanji se
 * repita pronto, nunca que desaparezca.
 */
export const INTERVALOS: Readonly<Record<number, number>> = { 1: 1, 2: 2, 3: 4, 4: 7, 5: 14 };
export const CAJA_MAX = 5;

const DIA_MS = 24 * 60 * 60 * 1000;

function venceEnDias(box: number): number {
  return (INTERVALOS[box] ?? INTERVALOS[1]!) * DIA_MS;
}

export interface ItemMemory {
  box: number;            // 1..5 (Leitner, siguiente paso)
  introducedAt: number;
  lastSeenAt: number;
  dueAt: number;
}

@Service()
export class SpacedRepetition {
  private readonly profileState = inject(ProfileStateService);
  private readonly _memory = signal<Record<string, ItemMemory>>(this.load());

  isIntroduced(deck: string, itemId: string): boolean {
    const key = this.key(deck, itemId);
    return !!key && key in this._memory();
  }

  markIntroduced(deck: string, itemIds: string[]): void {
    const now = Date.now();
    this._memory.update(mem => {
      const next = { ...mem };
      for (const id of itemIds) {
        const key = this.key(deck, id);
        if (key && !(key in next)) {
          next[key] = { box: 1, introducedAt: now, lastSeenAt: now, dueAt: now };
        }
      }
      return next;
    });
    this.save();
  }

  /**
   * Registra un repaso y programa el siguiente.
   *
   * Leitner clásico: el acierto sube una caja, el fallo vuelve a la 1 (§5.4).
   *
   * `ayuda` son los escalones de la escalera de ayuda que subió (0 = sola). Un acierto
   * **con ayuda** no sube de caja: la memoria que importa es la que recuerda sin
   * andamio, y si la escalera contase igual acabaría todo en la caja 5 en una sola
   * sesión. Pero tampoco se le castiga volviendo a la 1, porque sí sabe hacerlo —solo no
   * sola todavía—, así que vuelve mañana, que es la caja más frecuente.
   *
   * No recibe cuánto tardó ella. Es una decisión: en este juego el tiempo de respuesta
   * está dominado por la motricidad de dibujar —un kanji de 6 trazos se compone a ritmo
   * distinto según la mano que lo haga— y no por la dificultad del kanji, así que ese
   * dato sería ruido y no señal.
   *
   * Un kanji nunca presentado se puede registrar igual: entra en la caja 0 y un acierto
   * lo pone en la 1, que es exactamente "se ha visto una vez".
   */
  review(deck: string, itemId: string, resultado: { correct: boolean; ayuda?: number }): void {
    const key = this.key(deck, itemId);
    if (!key) return;
    const ahora = Date.now();
    const sola = (resultado.ayuda ?? 0) === 0;
    this._memory.update(mem => {
      const previa = mem[key] ?? { box: 0, introducedAt: ahora, lastSeenAt: ahora, dueAt: ahora };
      const box = !resultado.correct
        ? 1
        : sola
          ? Math.min(previa.box + 1, CAJA_MAX)
          : previa.box;
      const espera = sola ? box : INTERVALOS[1]!;
      return { ...mem, [key]: { ...previa, box, lastSeenAt: ahora, dueAt: ahora + venceEnDias(espera) } };
    });
    this.save();
  }

  /**
   * Cuándo vence un item, o `null` si no hay registro.
   *
   * Existe en público porque la alternativa es que las pruebas pinchen en `_memory`, y
   * ese cable se rompe en cuanto se renombra una cosa.
   */
  dueAt(deck: string, itemId: string): number | null {
    const key = this.key(deck, itemId);
    return key ? this._memory()[key]?.dueAt ?? null : null;
  }

  /**
   * Kanjis de este mazo que toca repasar ahora, **el más atrasado primero**.
   *
   * El orden es parte del contrato y no un detalle: `pickComposition` se queda con el
   * primero, así que sin ordenar saldría el mismo kanji mientras los demás se apilasen
   * sin repasar — que sería justo lo contrario de espaciado.
   *
   * El desempate por clave es para que dos kanji que venzan el mismo día no cambien de
   * orden entre partidas, y un test pueda fijar cuál sale.
   */
  due(deck: string, ahora = Date.now()): string[] {
    const profileId = this.profileState.activeProfile()?.id;
    if (!profileId) return [];
    const prefix = `${profileId}:${deck}:`;
    return Object.entries(this._memory())
      .filter(([k, m]) => k.startsWith(prefix) && m.dueAt <= ahora)
      .sort((a, b) => a[1].dueAt - b[1].dueAt || a[0].localeCompare(b[0]))
      .map(([k]) => k.slice(prefix.length));
  }

  /** Reparte el lote alternando categorías (contraste) */
  pickIntroBatch<T extends { id: string; category: string }>(items: T[], size: number): T[] {
    const groups: T[][] = [];
    const index = new Map<string, T[]>();
    for (const item of items) {
      let group = index.get(item.category);
      if (!group) { group = []; index.set(item.category, group); groups.push(group); }
      group.push(item);
    }
    const batch: T[] = [];
    while (batch.length < size && groups.some(g => g.length > 0)) {
      for (const group of groups) {
        const next = group.shift();
        if (next && batch.length < size) batch.push(next);
      }
    }
    return batch;
  }

  /** Perfiles que ya jugaron: sus palabras previas cuentan como presentadas (solo si no hay registro) */
  seedFromAttempts(deck: string, attempts: { profileId: string; contentId: string }[]): void {
    const profileId = this.profileState.activeProfile()?.id;
    if (!profileId) return;
    const prefix = `${profileId}:${deck}:`;
    if (Object.keys(this._memory()).some(k => k.startsWith(prefix))) return;
    const ids = [...new Set(attempts.filter(a => a.profileId === profileId).map(a => a.contentId))];
    if (ids.length) this.markIntroduced(deck, ids);
  }

  private key(deck: string, itemId: string): string | null {
    const profile = this.profileState.activeProfile();
    return profile ? `${profile.id}:${deck}:${itemId}` : null;
  }

  private load(): Record<string, ItemMemory> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private save(): void {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._memory())); }
    catch (e) { console.warn('[SRS] Error guardando:', e); }
  }
}
