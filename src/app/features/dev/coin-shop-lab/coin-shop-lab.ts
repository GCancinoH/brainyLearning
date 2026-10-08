import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import { CoinShop } from '@features/games/math/coin-shop/coin-shop';
import {
  buildCoinProblem,
  CoinProblem,
  MAX_LEVEL,
} from '@features/games/math/coin-shop/coin-shop-problem';
import { coinWays } from '@core/games/combinations';
import { LabProfileState, LabProgress } from '../lab-stubs';

/**
 * LABORATORIO de "La Tiendita de Monedas".
 *
 * Solo existe para probar el juego antes de registrarlo en el catálogo. Permite forzar la
 * edad y el nivel sin tocar el componente real, y auditar de un vistazo que los 10 niveles
 * de ambas edades generan problemas resolubles.
 *
 * La ruta (`lab/coin-shop`) va FUERA de `games/` a propósito, para que el reloj por tema no
 * la bloquee durante las pruebas, y va protegida con `devOnlyGuard`, para que no exista en
 * un build de producción.
 *
 * Cómo aísla el juego: `CoinShop` no tiene ni un hook de laboratorio. Lo que se falsea son
 * las dependencias que consulta al arrancar (`ProfileStateService.activeProfile()` para la
 * edad y `GameProgressService.getLevel()` para el nivel), mediante los stubs de abajo.
 */

// ============================================
// STUBS
// Compartidos con el laboratorio de kanji (`../lab-stubs`). Se falsean las dos
// dependencias que el juego consulta al arrancar: la edad y el nivel guardado.
// ============================================

// ============================================
// LABORATORIO
// ============================================

@Component({
  selector: 'coin-shop-lab',
  imports: [CoinShop],
  templateUrl: './coin-shop-lab.html',
  styleUrl: './coin-shop-lab.scss',
  providers: [
    LabProfileState,
    LabProgress,
    { provide: ProfileStateService, useExisting: LabProfileState },
    { provide: GameProgressService, useExisting: LabProgress },
  ],
})
export class CoinShopLab {
  private readonly router = inject(Router);
  private readonly labProfile = inject(LabProfileState);
  private readonly labProgress = inject(LabProgress);

  readonly age = this.labProfile.age;
  readonly level = this.labProgress.level;
  readonly levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
  readonly MAX_LEVEL = MAX_LEVEL;

  /** Cambia este valor para forzar el remontaje del juego */
  readonly stageKey = computed(() => `${this.age()}-${this.level()}-${this.saved()}`);
  readonly saved = signal(0);

  /**
   * Auditoría previa: qué problema genera cada nivel de cada edad, y si de verdad hay
   * suficientes formas de pago. Es la comprobación que sustituye a jugar los 10 niveles a mano.
   */
  readonly audit = computed(() => {
    const rows: Array<{
      level: number;
      age: 4 | 6;
      summary: string;
      solvable: boolean;
      available: number;
    }> = [];
    for (const age of [4, 6] as const) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const p: CoinProblem = buildCoinProblem(level, age);
        if (p.mode === 'count') {
          rows.push({
            level,
            age,
            summary: `${p.items} manzanas · opciones [${p.options.join(', ')}]`,
            solvable: p.options.includes(p.items),
            available: p.options.length,
          });
        } else {
          const cap = p.price - p.prePaid;
          const available = coinWays(p.denominations, cap).length;
          rows.push({
            level,
            age,
            summary:
              `precio $${p.price}` +
              (p.prePaid ? ` (cobrado $${p.prePaid})` : '') +
              ` · monedas [${p.denominations.join(', ')}]` +
              ` · pide ${p.ways} forma${p.ways > 1 ? 's' : ''}`,
            solvable: available >= p.ways,
            available,
          });
        }
      }
    }
    return rows;
  });

  readonly allSolvable = computed(() => this.audit().every(r => r.solvable));

  setAge(age: 4 | 6): void {
    this.age.set(age);
  }

  setLevel(level: number): void {
    this.labProgress.setLevel(level);
    this.saved.update(v => v + 1); // remonta el juego con el nivel nuevo
  }

  nextLevel(): void {
    this.setLevel(Math.min(MAX_LEVEL, this.level() + 1));
  }

  prevLevel(): void {
    this.setLevel(Math.max(1, this.level() - 1));
  }

  /** Reinicia la racha remontando el juego */
  remount(): void {
    this.saved.update(v => v + 1);
  }

  goBack(): void {
    this.router.navigate(['/games/math']);
  }
}