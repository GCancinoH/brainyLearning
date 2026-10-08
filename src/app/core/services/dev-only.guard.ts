import { isDevMode, inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

function isLocalhost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname === '::1' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * Herramientas de desarrollo: solo accesibles en local.
 *
 * Se permiten en dos casos:
 *  1. `ng serve` normal (isDevMode() === true).
 *  2. Cualquier build servido desde localhost, para poder probar también con
 *     `ng serve --configuration production`, que es como se sirve a veces en local.
 *
 * Lo que mantiene la garantía es el punto 2: lo desplegado (Firebase Hosting) corre en un
 * dominio real, nunca en localhost, así que allí el laboratorio no existe. Además, en un
 * build de producción su chunk ni siquiera se emite, por lo que la ruta da error al
 * importarlo aunque se pasara el guard.
 */
export const devOnlyGuard: CanActivateFn = () => {
  if (isDevMode()) return true;
  try {
    if (typeof location !== 'undefined' && isLocalhost(location.hostname)) return true;
  } catch {
    // sin `location` (SSR o similar): se cae al redirect
  }
  return inject(Router).createUrlTree(['/dashboard']);
};