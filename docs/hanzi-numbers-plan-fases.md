# Números Hanzi — plan por fases

Fuente: observaciones del usuario en `plan-hanziNumbers.md` (originalmente en `src/`), verificadas
una por una contra el código el 28/10/2026. Este documento es **el plan de implementación**; el de
observaciones queda como anexo en `docs/plan-hanziNumbers-observaciones.md`.

Regla de oro de las fases: cada fase termina con suite en verde (4 fallos baseline, sin `ng serve`
corriendo), `npx ng build` limpio y verificación en lab dev (`npx ng serve --port 4213`) antes de
toca la siguiente. **Nunca `npm run build`** (despliega a Firebase). Un commit por fase.

---

## Fase 0 — Verificación (hecha)

| Obs. | Veredicto |
|---|---|
| 1 · rangos muertos | ✅ real |
| 2 · el acierto no mide nada | ✅ real (herramientas ya existen en el repo) |
| 3 · el audio hace la respuesta | ✅ real |
| 4 · `playPraise` solapa con `level-up` | ✅ real |
| 5 · ngsw sin `.m4a` | ❌ no procede: grupo `hanzi-numbers-audio` (prefetch) ya existe |
| 6 · rest sin `chinese` | ❌ ya hecho en fase anterior; **sí** falta `chinese` en `PlayerProgress` (va en Fase 3) |
| 7 · 4 opciones fijas a los 4 años | ✅ real (`DEFAULT_PROFILE_CONFIGS[4]` = 2–3) |
| 8 · duda prematura | ✅ real |
| 9 · 6 años arranca en nivel 1 | ✅ real (`GameSessionService`: `state?.level ?? 1`) |
| 10 · acantilado 6→7 | ✅ real |
| 11 · doble narración al acertar | ✅ real (`elegir()` y `finishProblem()` ambos llaman `narrar`) |
| trazado 1–10 | `KANJI_TRAZOS` no incluye 一…十 → requiere añadir datos KanjiVG (CC BY-SA, atribución ya montada) |

---

## Fase 1 — MUY IMPORTANTE: que el juego mida y progrese

Sin esto, subir de nivel no significa nada y 16–20 es inalcanzable.

### 1.1 Rangos muertos → una perilla por nivel

Fichero: `src/app/core/learning/hanzi-numbers-problem.ts` (+ specs).

- **Reconocer (niveles 1–6):** `topeReconocer` hoy es `≤2→5, ≤4→10, ≤6→15, resto 20`, pero la
  etapa termina en el 6 ⇒ **16–20 jamás se practica** pese a la insignia "Aprende 1–20".
  Indexar la tabla por nivel directamente (6 entradas), p. ej.:
  `N1: 1–5 · N2: 1–10 · N3: 1–15 · N4: 1–20 · N5: 1–20 (distractores vecinos) · N6: 1–20 (mixto)`.
  En N5–N6 la perilla deja de ser el tope y pasa a ser la dificultad de los distractores.
- **Combinar (niveles 7–12):** hoy `rangoObjetivo`/`tamanoBandeja` ramifican con `lvl <= 4`, pero
  la etapa empieza en el 7 ⇒ **código muerto**. Indexar con `lvl = level - NIVEL_ULTIMO_RECONOCER`
  (1..6) y tablas de 6 entradas. Propuesta (una sola perilla cambia por salto, nunca dos):

  | Nivel | Edad 4: rango · distractores | Edad 6: rango · distractores |
  |---|---|---|
  | 7 | 11–20 · 0 | 21–60 · 1 |
  | 8 | 11–20 · 1 | 21–60 · 2 |
  | 9 | 11–30 · 1 | 41–99 · 2 |
  | 10 | 11–30 · 2 | 41–99 · 3 |
  | 11 | 15–30 · 2 | 11–99 mixto · 3 |
  | 12 | 11–30 mixto · 3 | 11–99 mixto · 4 |

  (Los rangos exactos se afinan en implementación; la **regla** es lo importante: hoy los niveles
  7–12 de los 4 años son idénticos y los 9–12 de los 6 años también.)
- **Invariantes que NO se tocan:** bandeja sin segundo `十` salvo que la escritura lo pida;
  `leer()` sigue siendo la validación (sin "incorrecto"); brute-force de unicidad en specs.

Tests: actualizar/añadir specs de tabla por nivel (cada nivel produce un tope/rango distinto),
mantener brute-force.

### 1.2 El acierto no mide nada

- **Primer intento cuenta** (`FirstAttemptGuard` ya existe en `core/learning/`): en `reconocer`,
  lo que cuenta para el progreso es acertar al primer toque.
- **Opciones ya probadas se atenúan** con el patrón `recall-option--no` de kanji-compose
  (clase en `.scss`, binding en `.html`) → la niña ve qué ya descartó, sin veredicto.
- **No se rompe la racha por error** (Zvonkin: el error es exploración); se mide, no se castiga.

Ficheros: `hanzi-numbers.ts/.html/.scss` + specs de integración.

### 1.3 Duda prematura

`revisar()` dispara la duda de "dieces" en cuanto el parcial no lee (p. ej. `三五`), aunque vaya
a seguir agregando piezas. Regla propuesta: **solo dudar cuando el parcial es un callejón sin
salida** (no puede completarse a una lectura) o tras una pausa; si aún puede cerrarse, callar.

### 1.4 `playPraise` solapado con `level-up`

Hoy: `void this.narrar(...).then(() => this.audio.playPraise())` se programa **antes** del chequeo
de `leveledUp` ⇒ premio sonoro junto a `playLevelUp()` (y también si la narración fue cancelada).
Fix: programar el premio solo si `!result.leveledUp` y solo si la narración fue aceptada.

### 1.5 Doble narración al acertar (reconocer)

`elegir()` narra el número y `finishProblem()` lo narra 1 ms después → el 2.º `say()` corta al 1.º.
Fix: que `elegir()` **no** narre cuando acierta (narra solo `finishProblem`), o al revés — una sola
voz por acierto.

**Aceptación Fase 1:** un niño de 6 llega a practicar 16–20 antes del nivel 7; cada nivel de
combinar se distingue del anterior; el primer intento queda registrado; no hay doble audio ni
premio solapado con el level-up.

**Estado (28 oct): ✅ completada.** Suite en baseline (4 fallos preexistentes ajenos al juego,
355 verdes), `npx ng build` limpio y verificación en lab dev (puerto 4213): distractores N4–N6
seguían la perilla (aleatorios ≤20 en N4, vecinos ±1..±3 en N5, trampa de decena + vecinos en N6),
el 19 se practicó antes del nivel 7, y el N7 de combinar abrió con bandeja = solución exacta
(0 distractores a los 4 años) y 0 errores de consola.

---

## Fase 2 — IMPORTANTE: andamio por edad y arranque

### 2.1 Opciones por edad

Usar `getProfileDifficultyConfig(age)` (ya existe): 4 años → **2–3 opciones**, 6 años → 3–4.
Hoy el juego fija 4 siempre.

### 2.2 Nivel inicial para los 6 años — ✅ *decidido: (b) mini-diagnóstico*

Hoy todos arrancan en nivel 1 (1–5, trivial para 6 años). **Decisión del usuario (29 oct): opción
(b)** — mini-diagnóstico de 3 preguntas al primer uso, solo para perfiles de 6 años **sin** partida
guardada (`getProgress === null`; quien ya jugó, su nivel manda). *(Las opciones (a) nivel 3 y (c)
dejar el 1 quedaron descartadas.)*

- Las 3 preguntas son problemas de reconocer generados **con su nivel** (tramos 5, 15 y 20): la
  dirección, el ancla del audio y las opciones son exactamente las del juego; nada de examen aparte.
- Lo que decide es el **primer toque** de cada una.
- Ubicación = aciertos + 1: 3 → nivel 4 (1–20), 2 → N3, 1 → N2, 0 → N1. Se guarda como cualquier
  otro nivel: a partir de ahí el juego no distingue a una diagnosticada de una que llegó al 4
  jugando.
- La sesión **no existe** hasta que el diagnóstico acaba (nada de tiempo consumido ni subidas de
  nivel a medias); la insignia enseña "📝 1/3".
- Los 4 años siguen arrancando en el 1 sin diagnóstico; `startLevel` del catálogo no se toca.

### 2.3 El audio no hace la respuesta

Andamio por nivel como el "fantasma" de kanji-compose: **N1–N2** el inicio dice el número (oído →
emparejar está bien); **N3+** ya no lo dice al inicio — solo la duda y el oído al tocar piezas.
Evita que resuelvan por oreja sin mirar el glifo.

### 2.4 Puente del salto 6→7 (acantilado)

Al pasar de reconocer a combinar, un problema-guía: narración "ahora agarra las piezas", demo de
una pieza que entra, y solo después el primer problema real. (Patrón: tarjeta/tutorial como en
otros juegos.)

### 2.5 Texto → iconos y voz (pre-lectores)

El texto no es consigna para 4 años: insignia (`🔤 Aprende 1–20` / `🧩 Combina` — con Fase 1.1 la
promesa de la primera será cierta), rótulo "Forma", texto de la pista, banner de feedback →
sustituir por iconos/emojis + mood + narración. De paso: eliminar el parámetro `text` sin uso de
`narrar()`.

### 2.6 Dirección fija en N1–N2

Hoy la dirección se alterna desde el nivel 1. Para 4 años: N1–N2 fija (dígito → hanzi), desde N3
aleatoria/alterna. *(Su observación "quitar random direction in levels 1–2".)*

**Aceptación Fase 2:** perfil de 4 años ve 2–3 opciones; un recién llegado de 6 no empieza en
1–5; el audio guía solo aparece al principio; el cambio de etapa se explica solo.

**Estado (29 oct): ✅ completada.** Suite en baseline (4 fallos preexistentes ajenos al juego, 369
verdes), `npx ng build` limpio (los mismos 2 avisos de presupuesto de siempre) y verificación en
lab dev (puerto 4213): el perfil de 4 años vio **siempre 2–3 opciones** (6 problemas seguidos),
una recién llegada de 6 años jugó el mini-diagnóstico `📝 1/3 → 3/3` al primer toque y quedó en
**Nivel 4** (nunca 1–5), insignia/rótulo/pista/banner salen de **iconos** con `aria-label`, y el
puente 6→7 narró con `hn.puente.m4a` (regenerado con `export-hanzi.ts` + `generate.py`;
prefetchado en `ngsw.json`), enseñó la demo de la pieza y, tras tocarse, no volvió a interrumpir.
0 errores de consola (solo los avisos ambientales de siempre: TTS local y Firebase offline).

---

## Fase 3 — IMPORTANTE: datos honestos (§5.11) y reflexión

### 3.1 `SkillProgressService` en hanzi-numbers

`recordAttempt`/`recordMistake` ya existen y los usan kanji-find, calendar, nature, listening;
hanzi-numbers no los llama. Copiar el patrón de `kanji-find-engine.ts:184-232`.
**Qué cuenta como error (mismo criterio que T1 de `PLAN-pendientes.md`):** primer intento fallido
en reconocer; en combinar, el uso de ayuda (pista/fantasma) y los reinicios por orden inválido —
no cada toque, que es exploración.
Añadir `chinese` a `PlayerProgress` (`player-profile.ts`) para que el panel/reflexión lo lea.

### 3.2 SRS / `ProblemPicker`

Repetición espaciada de los números fallados (mismo motor que el resto). Hoy el problema sale
siempre del nivel, sin memoria de cuáles cuestan.

### 3.3 Distractores intencionales

Sustituir distractores aleatorios por `distractoresFor`-style (vecinos: 13/15 para 14; 二/三 para
una opción de 20…) — patrón ya existente en `kanji-composition.ts:700`.

### 3.4 Reflexión de toque único para 6 años

Copiar el patrón `reflecting` de `coin-shop` (lo que queda de T4 en `PLAN-pendientes.md`); la
elección **no** se persiste aquí (eso es §5.11).

**Aceptación Fase 3:** el panel de padres/reflexión muestra intentos reales de este juego; los
números difíciles vuelven a aparecer; la reflexión es de un toque.

---

## ✅ Estado Fase 3 (29 oct)

- **3.1** `SkillProgressService` integrado: `recordAttempt`/`recordMistake` con criterio T1 (primer toque fallido en reconocer; duda-pausa = ayuda, callejón = orden en combinar). Catálogo `CHINESE_SKILLS` + `digit` en `RepresentationType` + `PlayerProgress.chinese` — los datos honestos quedan grabados y legibles por el futuro panel.
- **3.2** SRS vía `SpacedRepetition` (mismo motor que kanji-compose): mazo `hanzi-numbers`, `due()` manda al generar, `review({correct, ayuda})` al cerrar. Builders aceptan número/objetivo forzado validado al tramo del nivel.
- **3.3** Distractores intencionales N1–N4 (comparten glifo primero, estilo `distractoresFor`); N5 vecinos / N6 trampa intactos.
- **3.4** Reflexión de un toque (6 años, post-acierto sin level-up, no en diagnóstico): velo `.reflexion`, 3 botones con `aria-label`, cada uno hace lo que dice (nuevo / repaso / ancla) y no se persiste (eso es §5.11).
- **Verificación lab**: suite 4 baseline / 383 passed, `ng build` limpio, 0 consola en :4213 (perfil 6 años: diagnóstico sin reflexión → sesión con reflexión funcional; perfil 4 años: sin reflexión, auto-avance 2600 ms; SRS reaparece número vencido; storage muestra intentos y errores reales).

---

## Fase 4 — MENOS IMPORTANTE: features nuevas

Orden libre; ninguna bloquea las anteriores.

1. **CPA / bloques Dienes** — cantidades concretas (11–35) antes del símbolo: barras de decenas y
   unidades junto al hanzi. Refuerza lo positional.
2. **Reordenar con arrastre** — `cdkDropList` sobre las piezas ya colocadas (hoy solo se agarra
   en orden); el orden sigue validando por `leer()`.
3. **Dirección inversa en combinar** — versión espejo del problema (otra perilla de dificultad).
4. **Par (pair mode), ritual Flash, Guía Sabio Long** — reutilizar §5.7 y patrones de otros juegos.
5. **Trazado de 一–十** — añadir esos 10 kanji a `KANJI_TRAZOS` (datos KanjiVG; **CC BY-SA 3.0 →
   la atribución visible ya montada para kanji-compose se reutiliza**) + `stroke-check`.
   Es el único punto que exige licencia con cuidado.
6. **Spec de narración** — test que el manifiesto cubre los 7 clips es + 99 zh-CN y que todo
   `numeroClip(n)` existe (evita roturas silenciosas al regenerar audio). ✅ **hecho (29 oct)**.
7. **Botón 🔊 repetir** en ambos sentidos.
8. **两 vs 二** — se mantiene **fuera** (decisión ya tomada en la spec: no mezclar variantes culturales
   en la validación); solo nota de diseño si acaso.

---

## ✅ Estado Fase 4 — ítem 6 (29 oct)

- **Spec `hanzi-narration.spec.ts`** (7 tests):
  - Cuenta correcta: 7 consignas es-MX + 99 números zh-CN = 106 claves.
  - Las 7 claves es-MX son exactamente las esperadas (incluye `hn.puente`).
  - Las 99 claves zh-CN son `hn.num.1 … hn.num.99`.
  - `numeroClip(n)` existe en el manifiesto para todo n=1..99.
  - Ningún clip contiene palabras veredicto prohibidas (FORBIDDEN_IN_NARRATION).
  - TTS de números usa hanzi real (no dígitos ni pinyin).
  - `CLIP_TEXT` cubre las 7 consignas es-MX; los 99 números se generan dinámicamente.
- **Verificación**: suite 4 baseline / 390 passed, `ng build` limpio (mismos 2 warnings).
- **Nota**: la igualdad con el JSON exportado (`tools/narration/hanzi-numbers.json`) se valida en CI
  ejecutando `npx tsx tools/narration/export-hanzi.ts` y comparando el fichero.

## ✅ Estado Fase 4 — ítem 1 (29 oct)

- **CPA / bloques Dienes** en etapa combinar (N7+):
  - Helper `descomponerCPA(numero)` en `hanzi-numbers-problem.ts` → `{ decenas, unidades }`.
  - Computed `cpa()` en componente reactivo al objetivo.
  - HTML: `.cpa` con `.cpa-decenas` (barras oro) y `.cpa-unidades` (cubos azules), `role="img"` + `aria-label`.
  - CSS: `.cpa-barra` (48×10px, gradiente oro), `.cpa-cubo` (16×16px, gradiente azul).
  - Solo visible en `etapa() === 'combinar'`; `reconocer` y diagnóstico no lo muestran.
- **Verificación lab** (perfil 6 años, N7): objetivo 48 → 4 barras + 8 cubos; objetivo 58 → 5 barras + 8 cubos; `aria-label` correctos.
- **Verificación**: suite 4 baseline / 390 passed, `ng build` limpio (mismos 2 warnings).

## ✅ Estado Fase 4 — ítem 2 (29 oct)

- **Reordenar con arrastre (`cdkDropList`)** en zona de lectura (etapa combinar):
  - Imports: `CdkDrag`, `CdkDropList`, `CdkDragDrop` de `@angular/cdk/drag-drop`.
  - HTML: `.lectura` con `cdkDropList` + `(cdkDropListDropped)="reorderPieces($event)"`; cada `.chip` con `cdkDrag` + `[cdkDragData]="$index"`.
  - Método `reorderPieces(event)` mueve el elemento en `agarradas[]` y limpia la duda; valida con `leer()` (la escritura canónica).
  - Test `4.2` en spec: reordenar rompe la canonicidad → `leido()` = null.
- **Verificación**: suite 4 baseline / 391 passed, `ng build` limpio (mismos 2 warnings).

## ✅ Estado Fase 4 — ítem 3 (29 oct)

- **Dirección inversa en combinar** (`numero-a-hanzi`):
  - Tipo `DireccionCombinar = 'hanzi-a-numero' | 'numero-a-hanzi'` en problem module.
  - `DIGITOS = ['0'..'9']` + `leerNumero(piezas)` para validar dígitos (sin ceros a la izquierda).
  - `buildCombinacionProblem(..., direccion?)` genera:
    - Normal: objetivo = número, `objetivoMostrado` = "35", bandeja = hanzi (`三十五`).
    - Inversa: objetivo = número, `objetivoMostrado` = hanzi (`三十五`), bandeja = dígitos (`3`, `5`).
  - Componente: signal `direccionCombinar` alterna a partir de N7 (impar = inversa).
  - `leido` usa `leer` (hanzi) o `leerNumero` (dígitos) según dirección.
  - HTML: `objetivo-hanzi` + icono 🔤 en inversa; `lectura-vacia` dice "Toca los dígitos".
  - CPA/Dienes solo en dirección normal.
  - Test 4.2 actualizado (reordenar con dígitos/hanzi según dirección).
- **Verificación**: suite 4 baseline / 391 passed, `ng build` limpio (mismos 2 warnings).

---

## Cerrado / no procede

- **ngsw `.m4a`** (obs. 5): el grupo `hanzi-numbers-audio` con prefetch ya cubre
  `/audio/hanzi-numbers/**/*.m4a`. Solo haría falta re-verificar instalación offline en la tablet.
- **rest con `chinese`** (obs. 6, resto): hecho en la fase anterior (`Theme`, `PLAYABLE`,
  `restTheme`). Lo único pendiente es `PlayerProgress.chinese` → Fase 3.1.

## Fuera de este plan

T1–T8 globales siguen en `docs/PLAN-pendientes.md` (panel de padres `/padres` espera decisión de
protección; T1 kanji-compose comparte el criterio de "qué cuenta como error" de Fase 3.1).

## ✅ Decisiones ya resueltas

1. ~~**2.2**~~ — resuelta: **(b) mini-diagnóstico** (29 oct).
2. ~~**1.1**~~ — resuelta y jugada en Fase 1 (rangos por nivel y distractores N5/N6 validados).
