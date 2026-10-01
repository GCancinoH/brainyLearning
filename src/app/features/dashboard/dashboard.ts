import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';

interface SubjectCard {
  id: 'math' | 'japanese' | 'spanish' | 'english' | 'chinese';
  title: string;
  subtitle: string;
  icon: string;
  bgGradient: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);

  readonly activeProfile = this.profileState.activeProfile;

  readonly subjects: SubjectCard[] = [
    {
      id: 'math',
      title: 'Matemáticas',
      subtitle: 'Misiones numéricas y espacio',
      icon: '🚀',
      bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
    },
    {
      id: 'japanese',
      title: 'Japonés (日本語)',
      subtitle: 'Hiragana, Katakana, Kanjis y lectura interactiva.',
      icon: '🇯🇵',
      bgGradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)'
    },
    {
      id: 'spanish',
      title: 'Lectura y Comprensión',
      subtitle: 'Cuentos Mágicos y preguntas para explorar historias',
      icon: '📖',
      bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
    },
    {
      id: 'english',
      title: 'Inglés',
      subtitle: 'El cuerpo humano, ciencia y vocabulario en el laboratorio',
      icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
      bgGradient: 'linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)'
    },
    {
      id: 'chinese',
      title: 'Chino (中文）',
      subtitle: 'Caracteres, tonos y palabras mágicas con la Dragona',
      icon: '🇨🇳',
      bgGradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
    }
  ];

  openSubjectMenu(subjectId: string): void {
    // Redirige al submenú de juegos de la categoría seleccionada
    console.log(subjectId);
    this.router.navigate(['/games', subjectId]);
  }

  openStickerAlbum(): void {
    this.router.navigate(['/stickers']);
  }

  switchProfile(): void {
    this.router.navigate(['/']);
  }
}
