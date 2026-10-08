import { Injectable, computed, signal } from '@angular/core';
import { createInitialProfile } from '@core/models/player-profile';
import { PlayerProfile } from '@core/models/player-profile';

/**
 * Stubs para los laboratorios de desarrollo.
 *
 * Los laboratorios falsean las DOS dependencias que un juego consulta al arrancar
 * (`activeProfile()` para la edad y `getLevel()` para el nivel), de modo que el componente
 * del juego no necesita ni un hook de laboratorio: queda limpio y reutilizable tal cual.
 *
 * No inyectan `ProfileStateService` para evitar la dependencia circular.
 */

@Injectable()
export class LabProfileState {
  readonly age = signal<4 | 6>(6);

  readonly activeProfile = computed<PlayerProfile>(() => {
    const base = createInitialProfile('Laboratorio', this.age(), '🧪', 'space');
    // Id fijo: el progreso real se indexa por perfil, aquí no debe escribir nada real
    return { ...base, id: 'lab-profile' };
  });

  activePlayerAge = computed(() => this.age());
}

@Injectable()
export class LabProgress {
  readonly level = signal(1);

  /**
   * Si el nivel se fijó a mano, las subidas de nivel del juego no lo sobrescriben.
   * Sin esto, probar el nivel 10 mientras el juego sube de nivel lo devuelve al 7 y es
   * imposible quedarse en un nivel concreto mientras se depura.
   */
  readonly pinned = signal(false);

  getLevel(): number {
    return this.level();
  }

  saveProgress(_gameId: string, progress: { level: number }): void {
    if (!this.pinned()) this.level.set(progress.level);
  }

  /** Fija el nivel a mano y lo protege de las subidas de nivel */
  setLevel(level: number): void {
    this.level.set(level);
    this.pinned.set(true);
  }

  reset(): void {
    this.level.set(1);
    this.pinned.set(false);
  }
}