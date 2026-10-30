# Números Hanzi — Fase 5 (propuesta)

> Estado: **borrador**. Se decide qué entra antes de empezar.

---

## 1. Panel de padres `/padres` (T2 en PLAN-pendientes)
- Ruta protegida (PIN o FaceID) que lea `SkillProgressService` + `GameProgressService`.
- Vista: árbol de skills por niño, números difíciles (SRS `due`), tiempo de juego, racha, logros.
- Filtro por juego (hanzi-numbers, kanji-compose, etc.) y rango de fechas.
- Exportar CSV/PDF para el tutor.

---

## 2. Pair Mode (juego en pareja)
- Dos niños en la misma tablet (o dos tablets en LAN/WebRTC).
- Modos:
  - **Cooperativo**: se turnan para armar el mismo número; aciertos compartidos.
  - **Competitivo**: cada uno tiene su bandeja; gana quien acierte más en 60 s.
- UI: avatares arriba, indicador de turno, botón "pasar turno".
- Reutiliza `GameSessionService` con `mode: 'pair'`.

---

## 3. Guía Sabio Long expandida
- **Tutorial interactivo** primera vez (paso a paso con overlay, como el puente 6→7 pero más largo).
- **Tips contextuales**: si la niña duda 2× en el mismo número, Long sugiere "mira la decena".
- **Modo "profe"**: adulto puede grabar su voz para reemplazar clips (`SpeechService` ya soporta TTS + fallback).

---

## 4. Cuantificadores (两 vs 二) — nivel avanzado
- Nuevo modo "Cuantificadores" (desbloqueable tras nivel 12).
- Enseña la distinción: **二** (número puro, ordinal) vs **两** (cuantificador: 两个, 两岁, 两本书).
- Ejercicios: "¿二 o 两? — 两岁 ✓ / 二岁 ✗".
- Reutiliza `TracingCanvas` para trazar 两.

---

## 5. Niveles 13–20 (hasta 99)
- Extiende `perillaCombinar` y `topeReconocer` hasta nivel 20.
- Rangos: 13 (11–99, 4 distractores), 14 (mixto 11–20 + 21–99), 15–20 progresión de dificultad.
- Insignias nuevas: "Centena" (llegar a 100), "Maestro del trazo" (todos los kanji trazados).

---

## 6. Logros / Insignias
- Sistema de badges persistente por perfil (`localStorage` + `GameProgressService`).
- Ejemplos:
  - 🥇 "Primer 20" — completar reconocimiento 1–20.
  - 🔥 "Racha 10" — 10 aciertos seguidos.
  - ✏️ "Calígrafo" — trazar los 10 kanji sin ayuda.
  - 🧠 "Memoria de elefante" — 50 números repasados por SRS.
- Vista en `/perfil` y en panel de padres.

---

## ✅ Estado Fase 5 — ítem 5 (30 oct)

- **PWA offline completo**:
  - `manifest.webmanifest` con shortcuts a juegos (Hanzi, Kanji)
  - `ngsw-config.json`: assetGroup `game-data` + `dataGroups` para BackgroundSync
  - `PwaSyncService`: cola offline, BackgroundSync API, reintentos automáticos
  - `InstallPromptComponent`: prompt nativo, detección de actualización SW, errores de sync
  - Integrado en `AppComponent`
  - `serviceWorker` registration con `registrationStrategy: 'registerWhenStable:5000'`
- **Verificación**: suite 4 baseline / 391 passed, `ng build` limpio (mismos 2 warnings)

---

## 6. Logros / Insignias

## 7. Analytics / Telemetría anónima
- Eventos: `nivel_iniciado`, `nivel_completado`, `error_primer_toque`, `flash_visto`, `trazo_completado`, `reorder_usado`.
- Sin PII: solo `profileId` hasheado, `gameId`, `timestamp`, `metadata`.
- Endpoint propio (Cloud Function) → BigQuery / PostHog / archivo JSON local.
- Opt-out en ajustes de perfil.

---

## 8. Editor de niveles (para adultos)
- Pantalla `/editor` (solo adults con PIN).
- Crear secuencia personalizada: elegir números, orden, distractores, dirección.
- Guardar como "lección personalizada" en perfil del niño.
- Compartir por QR / enlace profundo (`/games/chinese/hanzi-numbers?lesson=xyz`).

---

## 9. Trazado completo (KanjiVG real + atribución)
- Sustituir trazos "a mano" de 一–十 por datos reales de KanjiVG (script `fetch-kanjivg.mjs`).
- Atribución visible en créditos (`<a href="https://kanjivg.github.io">KanjiVG</a> CC BY-SA 3.0`).
- Añadir 两, 零, 百, 千, 万 para niveles futuros.

---

## 10. Tests de regresión visual (Storybook + Chromatic)
- Storybook para `TracingCanvas`, `ReorderPieces`, `FlashRitual`, `CPABlocks`.
- Chromatic en CI para detectar regresiones visuales en modal trazado, reflexión, puente, etc.

---

## Priorización sugerida (MVP Fase 5)

| Semana | Entregable |
|--------|------------|
| 1 | Panel `/padres` (lectura) + logs anónimos |
| 2 | Pair Mode (cooperativo) |
| 3 | Cuantificadores (两) + trazado 两 |
| 4 | Niveles 13–15 + insignias |
| 5 | PWA offline + analytics opt-in |
| 6 | Editor de niveles (MVP) + KanjiVG real para trazado |

---

## Notas técnicas pendientes (bugs conocidos)

Ver archivo `docs/bugs-conocidos.md` (crear) con:
- ~~`reorderPieces` no llama a `revisar()`~~ ✅
- ~~`iniciarFlash` nunca suena (guard `isOver()` en bucle)~~ ✅
- ~~HTML duplicado (`reflecting`, `hint`)~~ ✅
- ~~Trazado > 10 falla (KANJI_TRAZOS solo 一–十)~~ ✅
- ~~`TracingCanvas`: guía no escala a viewBox, `devicePixelRatio` no aplicado~~ ✅
- ~~Trazos 一–十 son líneas rectas a mano, no KanjiVG (licencia CC BY-SA)~~ ✅ (separados en KANJI_TRAZOS_NUMEROS CC0)

---

## Decisiones abiertas

- [ ] ¿Pair Mode en misma tablet o WebRTC?
- [ ] ¿Analytics propio o servicio externo?
- [ ] ¿Editor de niveles solo local o sync cloud?
- [ ] ¿KanjiVG para todos los kanji o solo números?
- [ ] ¿Migración de `localStorage` a IndexedDB para PWA?