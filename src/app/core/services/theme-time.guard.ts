import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ThemeTimeService } from './theme-time.service';
import { parseGameUrl } from './theme-time';

/** Si el tema está descansando, en vez de abrir el juego/menú se vuelve al dashboard con el aviso */
export const themeRestGuard: CanActivateFn = (_route, state) => {
  const parsed = parseGameUrl(state.url);
  if (parsed && inject(ThemeTimeService).isResting(parsed.theme)) {
    return inject(Router).createUrlTree(['/dashboard'], { queryParams: { rest: parsed.theme } });
  }
  return true;
};
