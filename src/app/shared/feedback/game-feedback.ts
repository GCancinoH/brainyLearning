/**
 * Componente de feedback compartido - Estados base reutilizables
 * Fase 1: Motor común mínimo
 */

import { Component, input, output, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FeedbackState, BASE_FEEDBACK_MESSAGES } from '../../core/games/game-types';

@Component({
  selector: 'game-feedback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="feedback-banner" [class]="state()">
      <p>{{ displayMessage() }}</p>
    </div>
  `,
  styles: [`
    .feedback-banner {
      min-height: 70px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0.8rem 1.2rem;
      border-radius: 20px;
      margin-bottom: 1.5rem;
      width: 100%;
      transition: all 0.3s ease;
      box-sizing: border-box;
    }

    .feedback-banner p {
      margin: 0;
      font-size: 1.3rem;
      font-weight: 700;
    }

    /* Estado idle - instrucción inicial */
    .idle p { color: #94a3b8; }

    /* Éxito */
    .success {
      background: rgba(34, 197, 94, 0.2);
      border: 2px solid #22c55e;
    }
    .success p { color: #4ade80; }

    /* Intenta de nuevo */
    .try-again {
      background: rgba(245, 158, 11, 0.2);
      border: 2px solid #f59e0b;
    }
    .try-again p { color: #fbbf24; }

    /* Subida de nivel */
    .level-up {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(245, 158, 11, 0.3) 100%);
      border: 2px solid #f59e0b;
      box-shadow: 0 0 20px rgba(245, 158, 11, 0.4);
      animation: pulse-glow 1s infinite alternate;
    }
    .level-up p {
      color: #fef08a;
      font-size: 1.5rem;
    }

    /* Juego completado */
    .game-over {
      background: linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(56, 189, 248, 0.3) 100%);
      border: 2px solid #38bdf8;
      box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    }
    .game-over p {
      color: #7dd3fc;
      font-size: 1.4rem;
    }

    @keyframes pulse-glow {
      0% { transform: scale(1); box-shadow: 0 0 20px rgba(245, 158, 11, 0.4); }
      100% { transform: scale(1.02); box-shadow: 0 0 30px rgba(245, 158, 11, 0.6); }
    }
  `]
})
export class GameFeedbackComponent {
  // Input: estado actual del feedback
  readonly state = input.required<FeedbackState>();

  // Input opcional: mensaje personalizado (sobrescribe el mensaje base)
  readonly customMessage = input<string>('');

  // Input opcional: mensajes personalizados por estado (para juegos específicos)
  readonly customMessages = input<Partial<Record<Exclude<FeedbackState, 'idle'>, string[]>>>({});

  // Output: cuando la animación de feedback termina (para encadenar siguiente pregunta)
  readonly feedbackComplete = output<void>();

  readonly displayMessage = computed(() => {
    const currentState = this.state();
    const custom = this.customMessage();

    // Solo usar customMessage para estado 'idle'
    if (currentState === 'idle' && custom) return custom;

    if (currentState === 'idle') {
      return '¿Cuántos cohetes hay en total?';
    }

    const messages = this.customMessages()[currentState as Exclude<FeedbackState, 'idle'>]
      ?? BASE_FEEDBACK_MESSAGES[currentState as Exclude<FeedbackState, 'idle'>];
    return messages[Math.floor(Math.random() * messages.length)];
  });
}