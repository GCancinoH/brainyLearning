/**
 * Componente de pantalla de descanso (fin de sesión)
 * Fase 1: Motor común mínimo
 */

import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'game-rest-overlay',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rest-overlay" *ngIf="isVisible()">
      <div class="rest-card">
        <div class="battery-icon">🔋✨</div>
        <h2>¡Hora de recargar baterías!</h2>
        <p>{{ message() }}</p>
        <button class="back-btn" (click)="onBack.emit()">{{ buttonText() }}</button>
      </div>
    </div>
  `,
  styles: [`
    .rest-overlay {
      position: fixed;
      inset: 0;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      padding: 1.5rem;
      animation: fadeIn 0.3s ease;
    }

    .rest-card {
      background: #1e293b;
      border: 3px solid #38bdf8;
      border-radius: 28px;
      padding: 2.5rem 2rem;
      text-align: center;
      max-width: 420px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.4s ease;
    }

    .battery-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
      animation: bounce 2s infinite;
    }

    h2 {
      color: #38bdf8;
      font-size: 1.8rem;
      margin-bottom: 0.8rem;
    }

    p {
      color: #cbd5e1;
      font-size: 1.1rem;
      line-height: 1.5;
      margin-bottom: 2rem;
    }

    .back-btn {
      background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%);
      color: white;
      border: none;
      padding: 1rem 2rem;
      font-size: 1.2rem;
      font-weight: bold;
      border-radius: 18px;
      cursor: pointer;
      width: 100%;
      transition: transform 0.15s ease;
    }

    .back-btn:active { transform: scale(0.96); }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes bounce {
      0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-10px); }
      60% { transform: translateY(-5px); }
    }
  `]
})
export class GameRestOverlayComponent {
  readonly isVisible = input.required<boolean>();
  readonly message = input<string>('Has jugado 5 minutos muy concentrada. Es momento de descansar la vista, tomar agua y estirarte.');
  readonly buttonText = input<string>('Volver al Menú');
  readonly onBack = output<void>();
}