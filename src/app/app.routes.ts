import { Routes } from '@angular/router';
import { themeRestGuard } from '@core/services/theme-time.guard';
import { devOnlyGuard } from '@core/services/dev-only.guard';

const baseRoutes: Routes = [
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
    path: 'games/math/space-rescue-mission',
    loadComponent: () => import('@features/games/math/space-rescue-mission/space-rescue-mission').then(m => m.SpaceRescueMission)
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
    path: 'games/math/logic-blocks',
    loadComponent: () => import('@features/games/math/logic-blocks/logic-blocks').then(m => m.LogicBlocks)
  },
  {
    path: 'games/math/paths-bridges',
    loadComponent: () => import('@features/games/math/paths-bridges/paths-bridges').then(m => m.PathsBridges)
  },
  {
    path: 'games/math/coin-shop',
    loadComponent: () => import('@features/games/math/coin-shop/coin-shop').then(m => m.CoinShop)
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
    path: 'games/japanese/kanji-compose',
    loadComponent: () => import('@features/games/japanese/kanji-compose/kanji-compose').then(m => m.KanjiCompose)
  },
  {
    // Laboratorio de la Tiendita. Va fuera de `games/` para que el reloj por tema no lo
    // bloquee, y `devOnlyGuard` lo hace desaparecer en builds de producción.
    path: 'lab/coin-shop',
    canActivate: [devOnlyGuard],
    loadComponent: () => import('@features/dev/coin-shop-lab/coin-shop-lab').then(m => m.CoinShopLab)
  },
  {
    // Laboratorio de Kanji (Sakura 🌸 / Dragón 🐉)
    path: 'lab/kanji-compose',
    canActivate: [devOnlyGuard],
    loadComponent: () => import('@features/dev/kanji-compose-lab/kanji-compose-lab').then(m => m.KanjiComposeLab)
  },
  {
    path: '**',
    redirectTo: ''
  }
];

/** Los menús y juegos de cada tema se bloquean mientras el tema descansa */
export const routes: Routes = baseRoutes.map(r =>
  r.path?.startsWith('games/') ? { ...r, canActivate: [themeRestGuard] } : r
);
