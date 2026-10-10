import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ProfileStateService } from '@core/services/profile-state';
import { ThemeTimeService } from '@core/services/theme-time.service';
import { Theme } from '@core/services/theme-time';
import { ALL_GAMES } from '@core/models/game-catalog';
import { Margin } from '@core/directives/margin';

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
  imports: [CommonModule, Margin],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss'
})
export class DashboardComponent {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly themeTime = inject(ThemeTimeService);

  readonly activeProfile = this.profileState.activeProfile;

  /** Temas que ya tienen juegos (y por lo tanto reloj). Chino, inglés y lectura aún no. */
  private readonly PLAYABLE: Theme[] = ['math', 'japanese'];

  /** ?rest=math -> se acabó el tiempo de ese tema */
  private readonly restParam = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('rest'))),
    { initialValue: null }
  );

  readonly restTheme = computed<Theme | null>(() => {
    const v = this.restParam();
    return v === 'math' || v === 'japanese' ? v : null;
  });

  readonly restSubject = computed(() => this.subjects.find(s => s.id === this.restTheme()) ?? null);

  /** Minutos que faltan para que el tema vuelva a abrirse */
  readonly restMinutes = computed(() => {
    const t = this.restTheme();
    return t ? Math.max(1, Math.ceil(this.themeTime.restLeftMs(t) / 60000)) : 0;
  });

  /** Otros temas con juegos disponibles, cada uno con hasta 2 juegos que ella puede jugar ya */
  readonly suggestions = computed(() => {
    const rest = this.restTheme();
    if (!rest) return [];
    const age = this.activeProfile()?.age ?? 4;
    return this.subjects
      .filter(s => this.PLAYABLE.includes(s.id as Theme) && s.id !== rest && !this.themeTime.isResting(s.id as Theme))
      .map(subject => ({
        subject,
        games: ALL_GAMES
          .filter(g => g.route.startsWith(`/games/${subject.id}/`))
          .filter(g => (g.minAge ?? 4) <= age && this.profileState.isGameUnlocked(g.id))
          .slice(0, 2)
      }));
  });

  isResting(subjectId: string): boolean {
    return (subjectId === 'math' || subjectId === 'japanese') && this.themeTime.isResting(subjectId);
  }

  closeRestDialog(): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { rest: null },
      queryParamsHandling: 'merge',
      replaceUrl: true
    });
  }

  openGame(route: string): void {
    this.router.navigateByUrl(route);
  }

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
