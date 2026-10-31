import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { ProfileStateService } from '@core/services/profile-state';
import { ThemeTimeService } from '@core/services/theme-time.service';
import { Theme } from '@core/services/theme-time';
import { ALL_GAMES } from '@core/models/game-catalog';
import { CATEGORY_META, LearningCategory } from '@core/models/learning-category';
import { Margin } from '@core/directives/margin';

interface SubjectCard {
  id: LearningCategory;
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
  private readonly PLAYABLE: Theme[] = ['math', 'japanese', 'chinese'];

  /** ?rest=math -> se acabó el tiempo de ese tema */
  private readonly restParam = toSignal(
    this.route.queryParamMap.pipe(map(p => p.get('rest'))),
    { initialValue: null }
  );

  readonly restTheme = computed<Theme | null>(() => {
    const v = this.restParam();
    return v === 'math' || v === 'japanese' || v === 'chinese' ? v : null;
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
    return this.PLAYABLE.includes(subjectId as Theme) && this.themeTime.isResting(subjectId as Theme);
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

  private card(id: LearningCategory, subtitle: string): SubjectCard {
    const meta = CATEGORY_META[id];
    return {
      id,
      title: meta.title,
      subtitle,
      icon: meta.icon,
      bgGradient: meta.bgGradient,
    };
  }

  readonly subjects: SubjectCard[] = [
    this.card('math', 'Misiones numéricas y espacio'),
    this.card('japanese', 'Hiragana, Katakana, Kanjis y lectura interactiva.'),
    this.card('spanish', 'Cuentos Mágicos y preguntas para explorar historias'),
    this.card('english', 'El cuerpo humano, ciencia y vocabulario en el laboratorio'),
    this.card('chinese', 'Caracteres, tonos y palabras mágicas con la Dragona'),
  ];

  openSubjectMenu(subjectId: string): void {
    // Redirige al submenú de juegos de la categoría seleccionada
    console.log(subjectId);
    this.router.navigate(['/games', subjectId]);
  }

  openAlbum(): void {
    this.router.navigate(['/album']);
  }

  switchProfile(): void {
    this.router.navigate(['/']);
  }
}
