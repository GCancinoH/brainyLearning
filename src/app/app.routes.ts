import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('@features/profile-selection/profile-selection').then(m => m.ProfileSelectionComponent)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('@features/dashboard/dashboard').then(m => m.DashboardComponent)
  },
  {
    path: 'games/math',
    loadComponent: () => import('@features/games/math/math-menu/math-menu').then(m => m.MathMenu)
  },
  {
    path: 'games/math/space-addition',
    loadComponent: () => import('@features/games/math/space-addition/space-addition').then(m => m.SpaceAddition)
  },
  {
    path: 'games/math/space-load-ship',
    loadComponent: () => import('@features/games/math/space-load-ship/space-load-ship').then(m => m.SpaceLoadShip)
  },
  {
    path: 'games/math/space-fuel-tank',
    loadComponent: () => import('@features/games/math/space-fuel-tank/space-fuel-tank').then(m => m.SpaceFuelTank)
  },
  {
    path: 'games/math/space-subtraction',
    loadComponent: () => import('@features/games/math/space-subtraction/space-subtraction').then(m => m.SpaceSubtraction)
  },
  {
    path: 'games/math/space-multiplication',
    loadComponent: () => import('@features/games/math/space-multiply/space-multiply').then(m => m.SpaceMultiply)
  },
  {
    path: 'games/japanese',
    loadComponent: () => import('@features/games/japanese/japanese-menu/japanese-menu').then(m => m.JapaneseMenu)
  },
  {
    path: 'games/japanese/listening',
    loadComponent: () => import('@features/games/japanese/listening/listening-game').then(m => m.ListeningGameComponent)
  },
  {
    path: 'games/japanese/kanji-find',
    loadComponent: () => import('@features/games/japanese/kanji-find/kanji-find-game').then(m => m.KanjiFindGameComponent)
  },
  {
    path: 'games/japanese/nature',
    loadComponent: () => import('@features/games/japanese/nature/nature-game').then(m => m.NatureGameComponent)
  },
  {
    path: 'games/japanese/calendar',
    loadComponent: () => import('@features/games/japanese/calendar/calendar-game').then(m => m.CalendarGameComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];
