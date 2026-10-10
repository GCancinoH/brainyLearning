import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';
import {
  buildCompositionProblem,
  compositionsForAge,
  KANJI_COMPOSITIONS,
  MAX_LEVEL,
  Script,
} from '@core/learning/kanji-composition';
import { LabProfileState, LabProgress } from '../lab-stubs';
import { KanjiCompose } from '@features/games/japanese/kanji-compose/kanji-compose';

/**
 * LABORATORIO de "Construye el Kanji".
 *
 * Igual que el de la Tiendita: el juego no sabe que existe. Se falsean `activeProfile()`
 * (edad) y `getLevel()` (nivel), y además se controla el `script` (input real del componente,
 * no un hook de laboratorio) para probar Sakura 🌸 y Dragón 🐉.
 *
 * Ruta `lab/kanji-compose`: fuera de `games/` para que el reloj por tema no la bloquee, y con
 * `devOnlyGuard` para que no exista en producción.
 */

@Component({
  selector: 'kanji-compose-lab',
  imports: [KanjiCompose],
  templateUrl: './kanji-compose-lab.html',
  styleUrl: './kanji-compose-lab.scss',
  providers: [
    LabProfileState,
    LabProgress,
    { provide: ProfileStateService, useExisting: LabProfileState },
    { provide: GameProgressService, useExisting: LabProgress },
  ],
})
export class KanjiComposeLab {
  private readonly router = inject(Router);
  private readonly labProfile = inject(LabProfileState);
  private readonly labProgress = inject(LabProgress);

  readonly age = this.labProfile.age;
  readonly level = this.labProgress.level;
  readonly levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
  readonly MAX_LEVEL = MAX_LEVEL;

  /** Mundo: Sakura 🌸 (japonés) o Dragón 🐉 (chino) */
  readonly script = signal<Script>('japanese');

  /** Saltar la puerta de inicio. Ver la nota en la plantilla. */
  readonly autoStart = signal(true);

  /** Cambia para forzar el remontaje del juego */
  readonly stageKey = computed(
    () => `${this.age()}-${this.level()}-${this.script()}-${this.saved()}`,
  );
  readonly saved = signal(0);

  /** Auditoría: qué kanji y qué bandeja genera cada nivel */
  readonly audit = computed(() => {
    const rows: Array<{
      level: number;
      age: 4 | 6;
      kanji: string;
      pieces: string;
      distractor: boolean;
      ghost: boolean;
      solvable: boolean;
      detail: string;
    }> = [];

    for (const age of [4, 6] as const) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const p = buildCompositionProblem(level, age);
        // "Resoluble" = las piezas correctas cubren todos los huecos (siempre, por construcción)
        const trayOk = p.tray.filter(t => t.correct).map(t => t.kanji).sort().join('|');
        const needed = p.slots.map(s => s.kanji).sort().join('|');
        rows.push({
          level,
          age,
          kanji: p.target.kanji,
          pieces: p.slots.map(s => s.kanji).join(' + '),
          distractor: p.distractors > 0,
          ghost: p.showGhost,
          solvable: trayOk === needed,
          detail: `${p.target.reading} · ${p.target.meaning} · ${p.slots.length} piezas`,
        });
      }
    }
    return rows;
  });

  readonly allSolvable = computed(() => this.audit().every(r => r.solvable));

  /** Catálogo completo, para consultar sin jugar */
  readonly catalog = KANJI_COMPOSITIONS;
  readonly forAge = computed(() => compositionsForAge(this.age()));

  setAge(age: 4 | 6): void {
    this.age.set(age);
  }

  setLevel(level: number): void {
    this.labProgress.setLevel(level);
  }

  setScript(script: Script): void {
    this.script.set(script);
  }

  nextLevel(): void {
    this.labProgress.setLevel(Math.min(MAX_LEVEL, this.level() + 1));
  }

  prevLevel(): void {
    this.labProgress.setLevel(Math.max(1, this.level() - 1));
  }

  /** Suelta el pin: a partir de aquí el juego vuelve a mandar sobre el nivel */
  unpinLevel(): void {
    this.labProgress.pinned.set(false);
  }

  /** Reinicia la racha remontando el juego */
  remount(): void {
    this.saved.update(v => v + 1);
  }

  goBack(): void {
    this.router.navigate(['/games/japanese']);
  }
}