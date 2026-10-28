# Plan de pendientes — 28 de octubre de 2026

> Este documento existe porque la sesión se acaba. Resume **dónde está el proyecto y qué
> queda**, en el orden en que conviene atacarlo. Quien lo retome empieza leyendo **aquí** y
> después `docs/kanji-compose-revision.md` (las tareas vienen de sus §5.x) y
> `docs/hanzi-numbers-spec.md` (el juego chino).

---

## 0. Dónde estamos

- **Juegos**: 12 de matemáticas, 5 de japonés, **1 de chino** (`Números Hanzi`, nuevo).
- **Último commit**: `39c9de6` *"Números Hanzi"* — **subido a GitHub**, `origin/main` al día.
- **Suite**: 341 pasan / 4 fallan (los 4 son baseline, ver crib sheet). `npx ng build` limpio.
- **Nada sin commitear.**

---

## 1. MUY IMPORTANTE

### T1 · `kanji-compose` y los juegos de matemáticas no reportan a `SkillProgress`

**Estado real (comprobado el 28 oct)**: el servicio **ya está listo** y **cuatro juegos ya lo
usan** — `kanji-find-engine`, `calendar-engine`, `nature-engine` y `listening-engine` llaman a
`recordAttempt()` **y** `recordMistake()`. Falta que los **dos juegos grandes no lo usen en
absoluto**: `kanji-compose` y toda la rama de matemáticas reportan solo niveles vía
`GameProgressService`, así que sus skills **no tienen precisión ni errores**.

- **Dónde**: `src/app/core/learning/skill-progress.service.ts` — `recordAttempt` ya acepta
  `correct: false`, y `recordMistake` guarda `LearningMistake` con `expected`/`answered`.
- **Patrón a copiar**: `kanji-find-engine.ts` líneas 184–232 — construye el `AttemptRecord`,
  lo manda, y **si falló** manda también el `LearningMistake`. Es la plantilla exacta.
- **La decisión que hay que tomar no es un `else`**: aquí *equivocarse es explorar* — en
  `kanji-compose` un toque fallido **no rompe la racha** a propósito. Así que **no** basta
  con registrar cada toque como "error": hay que decidir **qué cuenta**. Recomendación:
  acierto → `recordAttempt({correct:true})`; y como "mistake", la **ayuda usada** (hasta qué
  rung llegó `HintLadder`, si apareció el ghost, cuántas veces se rechazó el trazado), que son
  señales honestas y no juzgan a la niña.
- **Por qué primero**: sin esto, "Mis kanji más difíciles" (§5.8) y el panel parental (§5.11)
  serían **una mentira con buena cara** — hoy la precisión de esos skills no existe.
- **Verificar**: test del servicio + que se vea en algún sitio (el panel parental, T2).

### T2 · Panel parental `/padres` (§5.11)

**Bloqueado por una decisión del usuario** — preguntar ANTES de construir:
1. Ruta `/padres` **sin protección** (las niñas no la encontrarían),
2. **PIN de 4 dígitos**,
3. Algo que ellas no sepan pulsar (texto largo, cálculo…).

Además: **la ruta no existe** (hay que crearla, no "mostrarla"), y tras T1 ya habrá datos
honestos que enseñar. Ver §5.11 de `kanji-compose-revision.md`.

---

## 2. IMPORTANTE

### T3 · Álbum y árbol de familias (§5.8)

El perfil ya tiene `stickers` y el dashboard ya **enseña** un álbum, pero **nada los añade
desde los juegos**. Hacer: al completar un kanji (o una familia), pegatinas. Y "Mis kanji
más difíciles" **solo es posible tras T1**.

- **Dónde**: `ProfileStateService.stickers`, el álbum de `dashboard.ts`, y el camino de éxito
  de `kanji-compose` (donde hoy se llama `progress.saveProgress`).

### T4 · Reflexión de un toque para 6 años en **Números Hanzi**

Es lo único que este juego no tiene y todos los demás sí: en `coin-shop` (`reflecting`) y en
`kanji-compose` (Q4, cada botón hace lo que dice). Patrón a copiar: señal `reflecting`, tres
botones, y **la respuesta no se guarda** (eso es §5.11). ~1 fichero + spec.

### T5 · Puentes con calendario y naturaleza (§5.10)

Enlazar los juegos entre sí (kanji ↔ calendario ↔ naturaleza). Ver §5.10.

---

## 3. MENOS IMPORTANTE

### T6 · Resto del Planeta Dragón (§5.12)
- **Pinyin**: está **fuera a propósito**, con el motivo escrito en
  `docs/hanzi-numbers-spec.md` §3 (mezclar letra latina bajo el glifo es la Plantilla 6 del
  método). Si se añade, **detrás del toque, nunca debajo del kanji**.
- Pictogramas **Jiaguwen** (§C.1 del método) y **radicales chinos** (§C.4): juegos aparte,
  no skins de `Números Hanzi`.

### T7 · Pulido técnico (§5.13 + resto del Sprint 2)
`navigator.vibrate` al colocar (Android), imán/resaltado de hueco con `cdkDragMoved`,
repintado en resize, **sprite / Web Audio** (el m4a ya está; es optimización, no requisito).

### T8 · Lab con "salto de estado" (§5.14)
Botones en el lab de `kanji-compose` (`/lab/kanji-compose`) para saltar a **Dibujar**,
**Siblings** o **Reflexión** sin jugar el flujo entero.

---

## 4. Verificación en tablet — *parte del usuario*

1. **Números Hanzi**: ¿entienden **sin consigna de adulto** que las piezas de la bandeja se
   tocan **en orden**? (Es la duda nº 1 de este juego.)
2. Audio `zh-CN`: ¿suena en la tablet? (105 clips, prefetch — deberían estar sin red.)
3. Historias largas de kanji (`kc.es.k.*.story`, 5,7–6,0 s) sin sincronía visual.

---

## 5. Crib sheet: arranque de sesión nueva

**Trampas que ya se pagaron y no conviene volver a pagar:**

- **`npm run build` despliega a Firebase.** Para compilar: **`npx ng build`**.
- **`npm test` ≠ `npx vitest`**: `ng test` compila los specs sin tipos de Node. **Baseline =
  4 fallos** (`app.spec` ×2, `level-up-dialog`, `word-intro-carousel`). Hoy: **341 / 4**.
- **Para con `ng serve` antes de leer resultados**: con el servidor corriendo, tests de 5 s
  tardan 8–17 s y salen *timeouts falsos*. Anotado en §3.8 de la revisión.
- Filtros que funcionan: `npx ng test --filter='5.7'`, `'integración'`, `'build'`, `'tema'`.
- `Narrator._sleep` usa `Date.now()` real contra **fake timers**: cualquier spec que necesite
  narración debe `vi.spyOn(component.narrator, 'say').mockResolvedValue(true)`.
- Navegador: `npx ng serve --port 4213` (**el 4200 es otro proyecto**). El progreso vive en
  `localStorage['brainyLearning_gameProgress']` con clave **`${profileId}:${gameId}`**.
  Tras cada `setAge`/`setLevel` hay que **re-acoger** `window.ng.getComponent`.
- **No existe `@angular/animations`**: `animate.enter="nombre"` solo **añade la clase**
  `nombre`, y esa clase **debe llevar** la declaración `animation:` en el SCSS. Sin eso no
  hay animación **y tampoco hay error**.
- Sin `browser.screenshot` hasta `browser.tabs.focus` el tab.

**Rutas nuevas**: `/games/chinese` (menú) y `/games/chinese/hanzi-numbers` (juego);
`Theme` ya incluye `'chinese'`, así que el reloj de descanso también corre allí.
