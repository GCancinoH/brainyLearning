import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { provideDotLottie } from 'ngx-lottie/dotlottie-web';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      // 30000 (30 s) era demasiado: si la niña abre la app un rato corto y la cierra,
      // el service worker no llega a registrarse nunca, y sin él no hay nada precacheado
      // para jugar sin conexión. 5 s sigue siendo "cuando la app está estable", pero dentro
      // de una sesión real de juego ya está instalado.
      registrationStrategy: 'registerWhenStable:5000',
    }),
    provideDotLottie({
      player: () => import('@lottiefiles/dotlottie-web').then(m => m.DotLottie),
    }),
  ],
};
