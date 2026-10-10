import { ApplicationRef, Service, inject, signal } from '@angular/core';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { concat, fromEvent, interval, merge, timer } from 'rxjs';
import { filter, first } from 'rxjs/operators';

/**
 * Detecta actualizaciones del service worker y avisa con un diálogo.
 *
 * CONTEXTO: POR QUÉ ESTE SERVICIO ES MÁS COMPLEJO DE LO QUE PARECE
 *
 * En la laptop el diálogo aparecía y en las tabletas no. La causa no es el service worker
 * (funciona bien en ambos), sino CUÁNDO se mira si hay versión nueva:
 *
 *  - El chequeo se lanzaba en cuanto la app se estabilizaba (t≈0), pero el service worker
 *    se registra DESPUÉS (`registerWhenStable`, 5 s). En esa primera comprobación todavía
 *    no existía, así que no encontraba nada.
 *  - El siguiente intento era **6 horas** después. En una tableta, que puede quedarse
 *    "abierta" en el multitasking días enteros, esa espera es eterno.
 *
 * Qué hace ahora, en orden de frecuencia:
 *  1. Primer chequeo con 8 s de margen, para que el service worker ya esté registrado.
 *  2. Cada vez que la app vuelve al primer plano (`visibilitychange` / `focus`), que es
 *     justo el patrón de uso de una tableta: se abre, se cierra, se abre.
 *  3. Cada vez que vuelve la conexión (`online`): si estaba sin red, es el momento de
 *     mirar si hay algo nuevo descargado.
 *  4. Cada 15 minutos mientras la app queda abierta y activa. Este es el único que
 *     cubre el caso de que la niña juegue seguido sin cambiar de app.
 *
 * `lastCheck` evita ráfagas: abrir y cerrar la app cinco veces en un minuto no debe
 * generar cinco peticiones al servidor.
 */
@Service()
export class SWUpdater {
  private readonly swUpdate = inject(SwUpdate);
  private readonly appRef = inject(ApplicationRef);

  readonly updateAvailable = signal(false);

  /** Evita que un doble toque pulse "Actualizar" dos veces */
  readonly activating = signal(false);

  /** Margen inicial: deja tiempo a que el service worker se registre */
  private readonly FIRST_CHECK_DELAY_MS = 8_000;
  /** Red de seguridad si la app no cambia de estado */
  private readonly PERIODIC_CHECK_MS = 15 * 60 * 1000;
  /** Anti-ráfaga: como mucho una comprobación cada 30 s */
  private readonly MIN_INTERVAL_BETWEEN_CHECKS_MS = 30_000;

  private lastCheck = 0;

  constructor() {
    if (!this.swUpdate.isEnabled) {
      return;
    }

    this.listenForUpdates();
    this.startUpdateChecks();
  }

  // ============================================
  // EVENTOS
  // ============================================

  private listenForUpdates(): void {
    this.swUpdate.versionUpdates.subscribe((evt: VersionEvent) => {
      switch (evt.type) {
        case 'VERSION_DETECTED':
          // El service worker acaba de ver un ngsw.json distinto: está descargando
          console.log('[SW] Versión nueva detectada, descargando…');
          break;

        case 'VERSION_READY':
          // Ya está instalada y solo falta que una recarga la active
          this.updateAvailable.set(true);
          console.log('[SW] Versión lista. Recarga para usarla.');
          break;

        case 'VERSION_INSTALLATION_FAILED':
          // Importante verlo: suele ser cuota de almacenamiento o un 404 en un recurso.
          // Sin este log, el fallo es invisible y la app se queda en la versión vieja.
          console.error('[SW] Falló la instalación de la versión nueva:', evt.error);
          break;

        case 'NO_NEW_VERSION_DETECTED':
          console.log('[SW] La app ya está actualizada.');
          break;
      }
    });

    this.swUpdate.unrecoverable.subscribe(() => {
      console.error('[SW] Estado irrecuperable: recargando.');
      document.location.reload();
    });
  }

  // ============================================
  // CUÁNDO COMPROBAR
  // ============================================

  private startUpdateChecks(): void {
    const appIsStable$ = this.appRef.isStable.pipe(first(isStable => isStable));

    // 1) Primer chequeo: se espera a que la app se estabilice y luego se deja un
    //    margen para que el service worker se registre. Sin ese margen, la comprobación
    //    ocurre antes de que exista y no encuentra nada.
    const firstCheck$ = concat(
      appIsStable$.pipe(first()),
      timer(this.FIRST_CHECK_DELAY_MS)
    );

    // 2) Red de seguridad
    const periodic$ = interval(this.PERIODIC_CHECK_MS);

    // 3) Volver a primer plano / recuperar conexión.
    //    OJO: aquí va `merge`, NO `concat`. `concat` se suscribe al primer observable y
    //    espera a que complete; como `fromEvent` nunca completa, los siguientes (focus y
    //    online) quedarían sin suscribir. Es un fallo silencioso: no da error, simplemente
    //    nunca se escuchan.
    const reactivate$ = merge(
      fromEvent(document, 'visibilitychange').pipe(filter(() => !document.hidden)),
      fromEvent(window, 'focus'),
      fromEvent(window, 'online')
    );

    // Los tres a la vez con `merge`. Con `concat` solo se suscribiría el primero
    // (los observables de eventos y `interval` nunca completan), dejando los demás mudos.
    merge(firstCheck$, periodic$, reactivate$).subscribe(() => this.checkForUpdates());
  }

  // ============================================
  // CHEQUEO
  // ============================================

  private async checkForUpdates(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCheck < this.MIN_INTERVAL_BETWEEN_CHECKS_MS) return;
    this.lastCheck = now;

    try {
      await this.swUpdate.checkForUpdate();
    } catch (error) {
      console.error('[SW] Error comprobando actualización:', error);
    }
  }

  /**
 * Activa la versión nueva y recarga.
 *
 * Por qué no basta con `location.reload()`: la versión nueva queda INSTALADA pero esperando
 * (Angular no hace `skipWaiting` por defecto). Al recargar, el cliente actual se cierra y el
 * service worker en espera puede activarse… pero es una carrera: la recarga puede llegar
 * antes de que la activación termine, y entonces seguirías viendo la versión vieja.
 *
 * `activateUpdate()` le dice explícitamente al service worker en espera que tome el control.
 * Resuelve `true` si se activó, `false` si no había nada pendiente (ya estás al día).
 */
async reload(): Promise<void> {
  if (this.activating()) return; // doble toque
  this.activating.set(true);

  try {
    if (this.swUpdate.isEnabled) {
      const activado = await this.swUpdate.activateUpdate();
      if (!activado) {
        console.log('[SW] No había ninguna versión pendiente.');
      }
    }
  } catch (error) {
    console.error('[SW] Error activando la actualización:', error);
  } finally {
    document.location.reload();
  }
}
}