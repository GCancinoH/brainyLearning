import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ProfileStateService } from '@core/services/profile-state';
import { createInitialProfile, PlayerProfile, ThemePreference } from '@core/models/player-profile';

@Component({
  selector: 'app-profile-selection',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './profile-selection.html',
  styleUrl: './profile-selection.scss'
})
export class ProfileSelectionComponent {
  private readonly profileState = inject(ProfileStateService);
  private readonly router = inject(Router);

  // Signals del servicio
  readonly profiles = this.profileState.profiles;

  // Modos de vista: 'select' (Elegir perfil) o 'create' (Formulario de nuevo perfil)
  readonly mode = signal<'select' | 'create'>('select');

  // Signals para el Formulario de Creación
  readonly newName = signal<string>('');
  readonly newAge = signal<4 | 6>(6);
  readonly newAvatar = signal<string>('🦊');
  readonly newTheme = signal<ThemePreference>('space');

  readonly avatars = ['🦊', '🚀', '🍄', '🐙', '🦖', '🦉', '🐱', '🦄'];
  readonly themes: { id: ThemePreference; label: string; icon: string }[] = [
    { id: 'space', label: 'Espacio', icon: '🌌' },
    { id: 'mushrooms', label: 'Hongos Mágicos', icon: '🍄' },
    { id: 'ocean', label: 'Océano', icon: '🌊' },
    { id: 'human-body', label: 'Cuerpo Humano', icon: '🧬' }
  ];

  selectProfile(profile: PlayerProfile): void {
    this.profileState.setActiveProfile(profile.id);
    this.router.navigate(['/dashboard']);
  }

  toggleCreateMode(): void {
    this.mode.set(this.mode() === 'select' ? 'create' : 'select');
  }

  saveProfile(): void {
    if (!this.newName().trim()) return;

    const profile = createInitialProfile(
      this.newName().trim(),
      this.newAge(),
      this.newAvatar(),
      this.newTheme()
    );

    this.profileState.addProfile(profile);
    this.newName.set('');
    this.mode.set('select');
  }
}
