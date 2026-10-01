import { Component, OnInit, signal, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'splash-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="splash-container" [class.fade-out]="isLeaving()">
      <!-- Fondo Estelar / Cósmico -->
      <div class="stars-bg"></div>

      <div class="splash-content">
        <!-- Mascota / Logotipo de Brainy -->
        <div class="brainy-avatar-wrapper">
          <div class="brainy-glow"></div>
          <!-- Representación de Brainy con SVG/Emoji animado -->
          <div class="brainy-character">🧠✨</div>
        </div>

        <h1 class="brand-title">Brainy<span class="highlight">Learning</span></h1>
        <p class="brand-tagline">Explora, Descubre y Aprende</p>

        <!-- Barra de Carga Divertida -->
        <div class="progress-bar-container">
          <div class="progress-bar-fill" [style.width.%]="loadingProgress()"></div>
        </div>
        <p class="loading-text">{{ loadingMessage() }}</p>
      </div>
    </div>
  `,
  styleUrl: './splash-screen.scss'
})
export class SplashScreenComponent implements OnInit {
  // Output signal para avisar al App Root que la SplashScreen terminó
  readonly loaded = output<void>();

  readonly loadingProgress = signal<number>(0);
  readonly loadingMessage = signal<string>('Despertando a Brainy...');
  readonly isLeaving = signal<boolean>(false);

  private readonly messages = [
    'Despertando a Brainy...',
    'Cargando hongos mágicos...',
    'Alineando los planetas...',
    'Afilando los lápices espaciales...',
    '¡Todo listo para la aventura!'
  ];

  ngOnInit(): void {
    this.startLoadingSequence();
  }

  private startLoadingSequence(): void {
    let step = 0;
    const interval = setInterval(() => {
      step += 1;
      const progress = Math.min(step * 20, 100);
      this.loadingProgress.set(progress);

      const messageIndex = Math.min(Math.floor(progress / 25), this.messages.length - 1);
      this.loadingMessage.set(this.messages[messageIndex]);

      if (progress >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          this.isLeaving.set(true); // Dispara la transición de salida
          setTimeout(() => {
            this.loaded.emit(); // Notifica al App Component
          }, 600); // Tiempo que dura el fade-out en CSS
        }, 400);
      }
    }, 350);
  }
}
