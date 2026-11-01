/**
 * Seguimiento del esfuerzo dentro de una ronda.
 *
 * Cada juego reinicia el tracker al generar un problema, marca los errores y la
 * ayuda, y al acertar pasa `snapshot()` a `GameSessionService.recordCorrect()`.
 * Así las insignias 🎯 (primer intento) y 🌟 (ronda perfecta) funcionan igual en
 * todos los juegos sin copiar la lógica 15 veces.
 */
export interface RoundSnapshot {
  /** No hubo ningún error en esta ronda. */
  firstTry: boolean;
  /** No hubo errores ni se usó ayuda en esta ronda. */
  perfectRound: boolean;
}

export class RoundTracker {
  private wrong = 0;
  private helped = false;

  /** Se llama al generar un problema nuevo. */
  reset(): void {
    this.wrong = 0;
    this.helped = false;
  }

  /** Se llama junto a `recordIncorrect()` (o cuando el juego cuenta un fallo). */
  markWrong(): void {
    this.wrong++;
  }

  /** Se llama cuando se muestra una pista o se usa una ayuda. */
  markHelp(): void {
    this.helped = true;
  }

  get wrongCount(): number {
    return this.wrong;
  }

  get helpUsed(): boolean {
    return this.helped;
  }

  snapshot(): RoundSnapshot {
    return {
      firstTry: this.wrong === 0,
      perfectRound: this.wrong === 0 && !this.helped,
    };
  }
}
