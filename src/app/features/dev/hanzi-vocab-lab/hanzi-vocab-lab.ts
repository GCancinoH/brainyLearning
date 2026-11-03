import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { HanziVocabGame } from '@features/games/chinese/hanzi-vocab/hanzi-vocab-game';
import {
  buildVocabProblem,
  MAX_LEVEL,
  knobFor,
  poolFor,
  type VocabMode,
  type VocabProblem,
} from '@features/games/chinese/hanzi-vocab/hanzi-vocab-problem';
import { HANZI_VOCAB, vocabForDeck, type HanziDeck } from '@core/learning/hanzi-vocab';
import { LabProfileState, LabProgress } from '../lab-stubs';

/**
 * LABORATORIO de "Vocabulario Hanzi" (Colores, Animales, Naturaleza, Familia, Acciones, ¿Qué escuchaste?).
 *
 * Solo existe para probar el juego antes de registrarlo en el catálogo. Permite forzar la
 * edad, el mazo y el nivel sin tocar el componente real, y auditar de un vistazo que los
 * 10 niveles de ambas edades generan problemas resolubles.
 *
 * La ruta (`lab/hanzi-vocab`) va FUERA de `games/` a propósito, para que el reloj por tema no
 * la bloquee durante las pruebas, y va protegida con `devOnlyGuard`, para que no exista en
 * un build de producción.
 */

type Deck = HanziDeck | 'listening';

@Component({
  selector: 'hanzi-vocab-lab',
  imports: [HanziVocabGame],
  templateUrl: './hanzi-vocab-lab.html',
  styleUrl: './hanzi-vocab-lab.scss',
  providers: [
    LabProfileState,
    LabProgress,
    { provide: ProfileStateService, useExisting: LabProfileState },
    { provide: GameProgressService, useExisting: LabProgress },
  ],
})
export class HanziVocabLab {
  private readonly router = inject(Router);
  private readonly labProfile = inject(LabProfileState);
  private readonly labProgress = inject(LabProgress);

  readonly decks: Deck[] = ['colors', 'animals', 'nature', 'family', 'actions', 'listening'];
  readonly deckLabels: Record<Deck, string> = {
    colors: '🎨 Colores',
    animals: '🐲 Animales',
    nature: '🌿 Naturaleza',
    family: '👨‍👩‍👧‍👦 Familia',
    actions: '🏃 Acciones',
    listening: '👂 ¿Qué escuchaste?',
  };
  readonly deck = signal<Deck>('colors');
  readonly age = this.labProfile.age;
  readonly level = this.labProgress.level;
  readonly levels = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);
  readonly MAX_LEVEL = MAX_LEVEL;

  /** Cambia este valor para forzar el remontaje del juego */
  readonly stageKey = computed(() => `${this.deck()}-${this.age()}-${this.level()}-${this.saved()}`);
  readonly saved = signal(0);

  /** Auditoría previa: qué problema genera cada nivel de cada mazo/edad. */
  readonly audit = computed(() => {
    const rows: Array<{
      deck: Deck;
      level: number;
      age: 4 | 6;
      mode: VocabMode;
      poolSize: number;
      summary: string;
      solvable: boolean;
    }> = [];

    for (const deck of this.decks) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        for (const age of [4, 6] as const) {
          const knob = knobFor(deck, level);
          const pool = poolFor(deck, level);
          const modes = knob.modes;

          // Generamos varios problemas para ver la variedad
          const samples: VocabProblem[] = [];
          for (let i = 0; i < 5; i++) {
            const p = buildVocabProblem(deck, level, age, () => Math.random());
            samples.push(p);
          }

          const uniqueModes = [...new Set(samples.map(s => s.mode))];
          const sample = samples[0]!;

          let summary = `pool=${pool.length} modos=[${uniqueModes.join(',')}]`;
          if (deck === 'listening') {
            summary += ' (solo presentadas)';
          }

          rows.push({
            deck,
            level,
            age,
            mode: sample.mode,
            poolSize: pool.length,
            summary,
            solvable: sample.options.length >= 2 && sample.options.some(o => o.id === sample.item.id),
          });
        }
      }
    }
    return rows;
  });

  readonly allSolvable = computed(() => this.audit().every(r => r.solvable));

  // Import ProfileStateService for type
  private readonly _profileStateService = inject(ProfileStateService);
  private readonly _gameProgressService = inject(GameProgressService);

  setDeck(deck: Deck): void {
    this.deck.set(deck);
  }

  setAge(age: 4 | 6): void {
    this.age.set(age);
  }

  setLevel(level: number): void {
    this.labProgress.setLevel(level);
    this.saved.update(v => v + 1);
  }

  nextLevel(): void {
    this.setLevel(Math.min(MAX_LEVEL, this.level() + 1));
  }

  prevLevel(): void {
    this.setLevel(Math.max(1, this.level() - 1));
  }

  remount(): void {
    this.saved.update(v => v + 1);
  }

  goBack(): void {
    this.router.navigate(['/games/chinese']);
  }
}

// Needed for providers
import { ProfileStateService } from '@core/services/profile-state';
import { GameProgressService } from '@core/games/game-progress.service';