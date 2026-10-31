import {
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewChild,
  ElementRef,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { BadgeArt } from '@shared/game-ui/badge-art/badge-art';
import { BadgeDialog } from '@shared/game-ui/badge-dialog/badge-dialog';
import { ProfileStateService } from '@core/services/profile-state';
import { BadgeService } from '@core/badges/badge.service';
import { BadgeVoice } from '@core/badges/badge-voice';
import { ALL_BADGES, CATEGORY_BADGES, GAME_BADGES, EFFORT_BADGES, TIER_LABEL, badgeById } from '@core/badges/badge-catalog';
import { CATEGORY_META, LearningCategory, CATEGORY_ORDER } from '@core/models/learning-category';
import { Badge, EarnedBadge } from '@core/badges/badge-types';
import { Sticker } from '@core/models/player-profile';
import { ALL_GAMES } from '@core/models/game-catalog';

const TIER_LABEL_LOCAL = TIER_LABEL;

type AlbumTab = 'badges' | 'stickers';

interface BadgeGroup {
  category: LearningCategory;
  gameBadges: Badge[];
  categoryBadges: Badge[];
}

interface GameBadgeGroup {
  gameId: string;
  badges: Badge[];
}

/** Rompecabezas del mundo: cada insignia de categoría = 1 pieza */
interface WorldPuzzle {
  category: LearningCategory;
  totalPieces: number;
  earnedPieces: number;
  pieces: { id: string; earned: boolean; badge?: Badge }[];
}

/** Sellos de la semana (cartulina 7 días) */
interface WeeklyStamps {
  days: { date: string; earned: boolean }[];
  currentStreak: number;
  completedThisWeek: boolean;
}

/** Marco de perfil desbloqueable */
interface ProfileFrame {
  id: string;
  name: string;
  gameId: string;
  icon: string;
  earned: boolean;
}

@Component({
  selector: 'app-album',
  standalone: true,
  imports: [CommonModule, BadgeArt, BadgeDialog],
  templateUrl: './album.html',
  styleUrl: './album.scss',
})
export class AlbumComponent implements OnDestroy, OnInit {
  private readonly profileState = inject(ProfileStateService);
  private readonly badgeService = inject(BadgeService);
  private readonly badgeVoice = inject(BadgeVoice);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  @ViewChild('carousel') carouselRef!: ElementRef<HTMLDivElement>;
  @ViewChild('dialog', { static: false }) dialogRef!: BadgeDialog;

  readonly activeProfile = this.profileState.activeProfile;

  /** Pestaña activa: insignias o pegatinas */
  readonly activeTab = signal<AlbumTab>('badges');

  readonly TIER_LABEL = TIER_LABEL_LOCAL;
  readonly CATEGORY_META = CATEGORY_META;
  readonly CATEGORY_ORDER = CATEGORY_ORDER;

  /** Insignia seleccionada para el diálogo */
  readonly selectedBadge = signal<Badge | null>(null);
  readonly dialogVisible = signal(false);

  /** Carrusel de fin de sesión: insignias recién ganadas en esta visita */
  readonly sessionNewBadges = signal<EarnedBadge[]>([]);
  readonly showSessionSummary = signal(false);
  private carouselTimer: ReturnType<typeof setTimeout> | null = null;

  /** Insignia de bienvenida (se muestra una vez al crear perfil) */
  readonly showWelcomeBadge = signal(false);
  private welcomeShown = false;

  /** Agrupación: mundo → insignias de categoría + por juego */
  readonly badgeGroups = computed<BadgeGroup[]>(() => {
    const profile = this.activeProfile();
    if (!profile) return [];

    const earnedIds = new Set(profile.badges.map(b => b.id));
    const groups: BadgeGroup[] = [];

    for (const category of CATEGORY_ORDER) {
      const meta = CATEGORY_META[category];
      if (!meta.available) continue;

      const gameBadges = GAME_BADGES.filter(b => b.category === category);
      const categoryBadges = CATEGORY_BADGES.filter(b => b.category === category);

      // Solo muestra el mundo si tiene al menos una insignia ganada o jugable
      const hasAny = gameBadges.some(b => earnedIds.has(b.id)) || categoryBadges.some(b => earnedIds.has(b.id));
      if (!hasAny && gameBadges.length === 0) continue;

      groups.push({ category, gameBadges, categoryBadges });
    }
    return groups;
  });

  /** Rompecabezas del mundo: cada insignia de categoría ganada = pieza */
  readonly worldPuzzles = computed<WorldPuzzle[]>(() => {
    const profile = this.activeProfile();
    if (!profile) return [];

    const earnedIds = new Set(profile.badges.map(b => b.id));
    const puzzles: WorldPuzzle[] = [];

    for (const category of CATEGORY_ORDER) {
      const meta = CATEGORY_META[category];
      if (!meta.available) continue;

      const categoryBadges = CATEGORY_BADGES.filter(b => b.category === category);
      const pieces = categoryBadges.map(badge => ({
        id: badge.id,
        earned: earnedIds.has(badge.id),
        badge,
      }));
      const earnedPieces = pieces.filter(p => p.earned).length;

      if (pieces.length > 0) {
        puzzles.push({ category, totalPieces: pieces.length, earnedPieces, pieces });
      }
    }
    return puzzles;
  });

  /** Sellos de la semana (cartulina 7 días) */
  readonly weeklyStamps = computed<WeeklyStamps>(() => {
    const profile = this.activeProfile();
    if (!profile) return { days: [], currentStreak: 0, completedThisWeek: false };

    const today = new Date();
    const days: { date: string; earned: boolean }[] = [];
    let currentStreak = 0;
    let streakBroken = false;

    // Últimos 7 días (hoy + 6 anteriores)
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const earned = profile.badgeStats?.daysPlayed?.includes(key) ?? false;
      days.push({ date: key, earned });
      if (earned && !streakBroken) {
        currentStreak++;
      } else {
        streakBroken = true;
      }
    }

    const completedThisWeek = days.every(d => d.earned);
    return { days, currentStreak, completedThisWeek };
  });

  /** Marcos de perfil desbloqueables (1 por juego al lograr Oro) */
  readonly profileFrames = computed<ProfileFrame[]>(() => {
    const profile = this.activeProfile();
    if (!profile) return [];

    const earnedIds = new Set(profile.badges.map(b => b.id));
    const frames: ProfileFrame[] = [];

    for (const game of ALL_GAMES) {
      const goldBadgeId = `${game.id}.gold`;
      const earned = earnedIds.has(goldBadgeId);
      if (earned || game.available !== false) {
        frames.push({
          id: `frame-${game.id}`,
          name: `Marco: ${game.title}`,
          gameId: game.id,
          icon: game.icon,
          earned,
        });
      }
    }
    return frames;
  });

  /** Pegatinas agrupadas por tema visual */
  readonly stickerGroups = computed(() => {
    const profile = this.activeProfile();
    if (!profile) return [];

    const groups: Record<string, Sticker[]> = {};
    for (const sticker of profile.stickers) {
      (groups[sticker.category] ??= []).push(sticker);
    }
    return Object.entries(groups).map(([category, stickers]) => ({ category, stickers }));
  });

  constructor() {
    // Detectar insignias nuevas al entrar al álbum (para el carrusel)
    effect(() => {
      const profile = this.activeProfile();
      if (!profile) return;

      const unseen = profile.badges.filter(b => !b.seen);
      if (unseen.length > 0) {
        this.sessionNewBadges.set(unseen);
        this.showSessionSummary.set(true);
      }
    });

    // Si venimos de una sesión que acaba de terminar (?rest=...), mostrar resumen
    this.route.queryParamMap.subscribe(params => {
      if (params.get('rest') && this.sessionNewBadges().length > 0) {
        this.showSessionSummary.set(true);
      }
    });
  }

  ngOnInit(): void {
    // Insignia de bienvenida: se muestra una vez por perfil
    const profile = this.activeProfile();
    if (profile && !this.welcomeShown && !profile.badges.some(b => b.id === 'welcome')) {
      this.showWelcomeBadge.set(true);
      this.welcomeShown = true;
    }
  }

  ngOnDestroy(): void {
    if (this.carouselTimer) clearTimeout(this.carouselTimer);
  }

  /** Agrupa insignias de juego por gameId */
  gameBadgesByGame(badges: Badge[]): GameBadgeGroup[] {
    const groups = new Map<string, Badge[]>();
    for (const b of badges) {
      if (b.gameId) {
        const existing = groups.get(b.gameId);
        if (existing) {
          existing.push(b);
        } else {
          groups.set(b.gameId, [b]);
        }
      }
    }
    return Array.from(groups.entries())
      .map(([gameId, badges]) => ({ gameId, badges }))
      .sort((a, b) => {
        const ga = ALL_GAMES.find(g => g.id === a.gameId);
        const gb = ALL_GAMES.find(g => g.id === b.gameId);
        return (ga?.title ?? '').localeCompare(gb?.title ?? '');
      });
  }

  getGameTitle(gameId: string): string {
    return ALL_GAMES.find(g => g.id === gameId)?.title ?? gameId;
  }

  getGameIcon(gameId: string): string {
    return ALL_GAMES.find(g => g.id === gameId)?.icon ?? '';
  }

  isBadgeUnlocked(badge: Badge): boolean {
    const profile = this.activeProfile();
    return profile?.badges.some(b => b.id === badge.id) ?? false;
  }

  isBadgeNew(badge: Badge): boolean {
    const profile = this.activeProfile();
    return profile?.badges.some(b => b.id === badge.id && !b.seen) ?? false;
  }

  getBadgeById(id: string): Badge | undefined {
    return badgeById(id);
  }

  stickerCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      space: '🚀 Espacio',
      mushrooms: '🍄 Hongos',
      ocean: '🌊 Océano',
      'human-body': '🧠 Cuerpo Humano',
    };
    return labels[category] ?? category;
  }

  /** Obtiene el rompecabezas para una categoría */
  getWorldPuzzle(category: LearningCategory): WorldPuzzle | undefined {
    return this.worldPuzzles().find(p => p.category === category);
  }

  /** Formato corto para etiqueta de día (Lun, Mar, etc.) */
  formatDayLabel(dateStr: string): string {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-ES', { weekday: 'short' }).slice(0, 3);
  }

  /** Categoría del juego para el gradiente del marco */
  getGameCategory(gameId: string): LearningCategory | undefined {
    return ALL_GAMES.find(g => g.id === gameId)?.category;
  }

  /** Gradiente para el marco de perfil (con fallback) */
  getFrameGradient(gameId: string): string {
    const cat = this.getGameCategory(gameId);
    return cat ? CATEGORY_META[cat].bgGradient : 'linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%)';
  }

  setTab(tab: AlbumTab): void {
    this.activeTab.set(tab);
  }

  /** Marca la insignia como vista y reproduce su voz */
  openBadge(badge: Badge): void {
    this.selectedBadge.set(badge);
    this.dialogVisible.set(true);

    // Marcar como vista
    const profile = this.activeProfile();
    if (profile?.badges.some(b => b.id === badge.id && !b.seen)) {
      this.badgeService.markSeen([badge.id]);
    }

    // Voz: la mascota dice el nombre
    this.badgeVoice.say(badge);
  }

  closeBadge(): void {
    this.dialogVisible.set(false);
    this.selectedBadge.set(null);
  }

  /** Cierra el resumen de sesión */
  dismissSessionSummary(): void {
    this.showSessionSummary.set(false);
    this.sessionNewBadges.set([]);
  }

  /** Cierra la insignia de bienvenida y la otorga */
  dismissWelcomeBadge(): void {
    this.showWelcomeBadge.set(false);
    this.badgeService.awardBadge('welcome');
  }

  /** Navega a un juego */
  goToGame(route: string): void {
    this.router.navigateByUrl(route);
  }

  /** TrackBy para listas */
  trackById = (_: number, item: { id: string }) => item.id;

  /** Clases CSS para el badge en la cuadrícula */
  badgeClass(badge: Badge): string {
    const profile = this.activeProfile();
    const earned = profile?.badges.some(b => b.id === badge.id) ?? false;
    const isNew = profile?.badges.some(b => b.id === badge.id && !b.seen) ?? false;
    return `album-badge ${earned ? 'earned' : 'silhouette'} ${isNew ? 'is-new' : ''}`;
  }

  /** Accesibilidad: label para lector de pantalla */
  badgeAriaLabel(badge: Badge): string {
    const profile = this.activeProfile();
    const earned = profile?.badges.some(b => b.id === badge.id) ?? false;
    const isNew = profile?.badges.some(b => b.id === badge.id && !b.seen) ?? false;
    return `${isNew ? 'Nueva: ' : ''}${badge.name}${earned ? ', ganada' : ', por ganar'}`;
  }
}