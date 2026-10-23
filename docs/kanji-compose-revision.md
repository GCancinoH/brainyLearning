# Revisión de "Construye el Kanji" (`kanji-compose`)

> Alcance: `kanji-compose.{ts,html,scss}`, `kanji-composition.ts`, `kanji-narration.ts`, `narrator.service.ts`, `game-audio.service.ts`, `speech.service.ts`, laboratorio (`kanji-compose-lab`), catálogo (`japanese-game.ts`) y specs asociados. Contrastado con el método Zvonkin (§B.5, §B.6, §C.4, §4 del documento), Montessori, Glenn Doman, Spaced Repetition y neurociencia del aprendizaje.

---

## 0. Veredicto

**La base es buena y la dirección es correcta.** El juego ya tiene lo más difícil: un modelo de datos limpio (piezas + huecos normalizados), guion hablado derivado de una sola fuente, clips con *fallback* a TTS, pruebas de contenido, laboratorio aislado y un flujo claro (Historia → Componer → Dibujar).

**Pero hoy es más una "animación interactiva con quiz de 50 %" que un juego que enseña.** Los problemas se agrupan en cuatro frentes:

| Frente | Resumen |
|---|---|
| **Bugs reales** | Doble toque en ✅ cuenta dos aciertos; el banner dice *"¿Cuántos cohetes hay en total?"* en el paso Historia; la instrucción de componer se corta a los 700 ms; 2 clases CSS no coinciden con la plantilla. |
| **Progresión y memoria** | A los 4 años los 10 niveles son idénticos (mismos 6 kanji, sin distractores). Los *pools* por nivel **reemplazan** en vez de acumular: no hay repaso. No usa `SpacedRepetition`, `SkillProgressService`, `HintLadder`, `GhostHand` ni `TutorialSeen`, que ya existen en el proyecto. |
| **Pedagogía** | Se **da la respuesta primero** (historia + piezas) y luego se pide reproducirla: eso es imitación, no indagación (Zvonkin). El paso de dibujar no valida nada ni enseña orden de trazos. El mundo Dragón pronuncia en japonés. |
| **Deuda y duplicación** | Datos sin usar (`strokeCount`, `onyomi`, 10 frases de sistema), solapamiento con `nature-engine` (木→林→森), reflexión que no guarda nada. |

**Recomendación:** 1 día de correcciones (Sprint 0), luego rehacer la progresión con SRS + pools acumulativos (Sprint 1) antes de añadir contenido nuevo. Más kanji sobre una progresión rota solo multiplica el problema.

---

## 1. Qué hace hoy (mapa rápido)

```
Puerta de inicio ▶  (desbloquea audio iOS/Safari + saludo de Aki/Long)
   │
   ▼
1. HISTORIA  → suena kanji → (4a: historia) → piezas con karaoke → suena kanji → "ahora tú"
   │
   ▼
2. COMPONER  → arrastrar/tocar piezas a huecos; evalúa SIN veredicto (preguntas socráticas)
   │             └─ si es exacto → onComposed → (hermanos) → paso 3
   ▼
3. DIBUJAR   → canvas con kanji fantasma; "¡Listo!" → recordCorrect()
   │
   ▼
(6 años) Reflexión de un toque → siguiente kanji
```

- Catálogo: 13 compuestos (6 con `minAge: 4`, 7 con `minAge: 6`), 20 piezas.
- Niveles 1-10; racha de 3 (4 años) o 4 (6 años).
- Audio: 100 % por clips `.wav` con manifiesto → TTS de reserva.

---

## 2. Lo que está bien y hay que conservar

1. **`kanji-composition.ts` como fuente de verdad.** Piezas con `id` estable (el `ko`/`ko_` era una bomba), `meaningTts` y `storyTts` separados de lo que se ve, y `slots` normalizados 0..1. Buen diseño.
2. **Regla "al TTS japonés solo hiragana".** Resuelve de raíz el problema de "el kanji no suena". Los tests (`kanji-narration.spec`) lo blindan.
3. **El `Narrator` evita solapes** con un token `seq` y para solo los clips propios (`stopPaths`), sin cortar *praise* / *level-up*.
4. **Sin veredictos.** `SOCRATIC_LINES` + test que prohíbe "incorrecto / no es / equivocado". Coherente con Zvonkin.
5. **Errores no rompen la racha.** Explorar es el objetivo (regla 5 de Zvonkin).
6. **Puerta de inicio** por el autoplay de iOS: decisión técnica correcta y bien documentada.
7. **Karaoke de la historia** (iluminar el elemento mientras suena): excelente *dual coding*.
8. **Hermanos** (本/末/未, 森/林): es la idea pedagógica más fuerte del juego y está infrautilizada (ver §5.1).
9. **Laboratorio** con auditoría de niveles y `devOnlyGuard`.
10. **Variantes por edad visibles** (`isPreReader`, `.prereader`), iconos sin texto en el paso de dibujar.

---

## 3. Qué podemos mejorar

### 3.1 Bugs y fallos reales (Sprint 0 — ~1 día)

| # | Severidad | Dónde | Problema | Arreglo |
|---|---|---|---|---|
| B1 | 🔴 Alta | `finishDrawing()` | Un doble toque en ✅ llama dos veces a `finishProblem()` → **dos** `recordCorrect()` (racha doble, posible salto de nivel) y dos temporizadores de `generateProblem()`. En `draw`, `busy` es `false` y `localFeedback` ya es `'success'` desde `onComposed`, así que ningún guard lo detiene. | Señal `drawn` que se pone a `true` al primer toque y se resetea en `generateProblem()`. |
| B2 | 🔴 Alta | `kanji-compose.html` + `game-feedback` | `line()` vale `''` en el paso Historia. `GameFeedbackComponent` ignora el `customMessage` vacío y cae a su texto por defecto: **"¿Cuántos cohetes hay en total?"**. Además, `localFeedback` queda en `'success'` desde `onComposed`, así que durante *todo* el paso Dibujar el banner muestra un "¡Muy bien!" aleatorio, y `line` del paso Componer persiste en Dibujar. | Calcular un `stepPrompt` por paso (ver snippet) y no mover `localFeedback` a `success` hasta `finishProblem()`. A los 4 años, sustituir el banner por la cara de ánimo (`mood`) como en `logic-blocks`. |
| B3 | 🟠 Media | `startComposing()` | Se lanza `narrator.say(look-ghost)` (~3 s) y 700 ms después `hearKanji()`. Como `say()` cancela lo anterior, **la instrucción se corta a los 700 ms**. | Encadenar: `await say(...)` y luego `hearKanji()`. |
| B4 | 🟠 Media | `kanji-compose.scss` | `&-emoji`/`&-text` anidados dentro de `.guide-bar` compilan a `.guide-bar-emoji`/`.guide-bar-text`, pero la plantilla usa `.guide-emoji`/`.guide-text`. Igual con `.reflection-btn { &-emoji }` → `.reflection-btn-emoji` vs `.reflection-emoji` en el HTML. Esos estilos nunca se aplican. | Alinear nombres. |
| B5 | 🟠 Media | `hearKanji()` en mundo `chinese` | Muestra pinyin y guía **Long**, pero el audio es `kc.ja.k.*` (japonés). La niña ve "míng" y oye "あかるい". Es justo la colisión Sakura/Dragón que el documento prohíbe. | Quitar el mundo Dragón hasta tener clips `zh-CN` (ver §4) o generarlos. |
| B6 | 🟠 Media | `hearPiece` | Se dispara en `onDragStarted` **y** en `place()`; en `onTap` también dos veces (tap + place). Cada `say()` cancela y reinicia el clip: suena entrecortado. | Un único disparo por gesto (al agarrar), y en `place()` solo si no se acaba de oír. |
| B7 | 🟡 Baja | `onComposed()` | Overlay de hermanos a 900 ms **y** temporizador a 2200 ms que cambia a `draw`: el paso Dibujar queda montado debajo del overlay. Además el `h2` del overlay muestra `line()` como texto (4 años no lee) y no hay audio (`siblingWord`/`sys('siblings')` existen en el manifiesto y **nunca se reproducen**). | Overlay modal real, con audio, que bloquee el avance hasta cerrarse. |
| B8 | 🟡 Baja | `evaluate()` | El temporizador de 3200 ms que borra `line`/`hint` borra también el texto de un intento posterior. | Guardar el id del timer y cancelarlo al reintentar. |
| B9 | 🟡 Baja | Pasos sin audio | `draw-now`, `draw-empty`, `done`, `siblings`, `again`, `next` están en el manifiesto y **no se usan**. El paso Dibujar de 4 años no dice nada; el aviso "Dibuja con el dedo…" es texto que no puede leer. | Reproducirlos (ver §3.5). |
| B10 | 🟡 Baja | Plantilla | `<button #slot>` dentro de `@for (slot of p.slots …)`: la referencia y la variable del bucle comparten nombre. Compila, pero es una trampa de mantenimiento. | Renombrar a `#slotEl`. |
| B11 | 🟡 Baja | SCSS | `.cdk-drag-preview` está dentro de un componente con encapsulación; la vista previa del CDK se inserta en `<body>` y esos estilos **no aplican**. `.piece-enter`/`@keyframes piece-in` y `.draw-hint strong` son código muerto. | Mover a estilos globales o `::ng-deep` acotado; borrar lo muerto. |
| B12 | 🟡 Baja | Canvas | Cualquier puntero dibuja: con la palma apoyada o dos dedos se ensucian los trazos. No hay `ResizeObserver` (al girar la tableta el lienzo no se repinta). | Filtrar por `isPrimary`/`pointerType`, ignorar palma, repintar en resize. |
| B13 | 🟡 Baja | `finishDrawing()` | Acepta un punto suelto. No usa `strokeCount` (dato que existe en cada kanji y **nunca se lee**). | Validación suave (ver §5.3). |
| B14 | 🟡 Baja | `GameSessionService` (transversal) | `isMaxLevel = newLevel >= maxLevel`: el juego termina al *llegar* al nivel 10, así que el nivel 10 nunca se juega y su fila de contenido (`AGE6_LEVELS`) es inalcanzable. | Decidir si `MAX_LEVEL` es "último nivel jugable" o "meta"; ajustar. |

**Snippets de B1, B2 y B3**

```ts
// B1 — guard contra doble toque
private readonly drawn = signal(false);          // reset en generateProblem()
finishDrawing(): void {
  if (this.isOver() || this.busy() || this.drawn()) return;
  if (this.strokes().length === 0) { /* pista hablada, ver B9 */ return; }
  this.drawn.set(true);
  this.line.set(pickLine('draw-done'));
  this.finishProblem();
}
```

```ts
// B2 — prompt por paso, nunca vacío
readonly stepPrompt = computed(() =>
  this.line() || ({
    story:   '👀 Mira cómo se forma',
    compose: '🤔 ¿Qué pieza va en cada hueco?',
    draw:    '✏️ Ahora dibújalo tú',
  } as const)[this.step()]);
// y en la plantilla: [customMessage]="stepPrompt()"
// + localFeedback.set('success') SOLO en finishProblem(); onComposed usa un flag `celebrating`.
```

```ts
// B3 — no cortar la instrucción
async startComposing(): Promise<void> {
  this.audio.retryPendingAudio();
  this.narrator.cancel();
  this.step.set('compose');
  this.line.set(/* … */);
  await this.narrator.say(this.showGhost() ? sys('look-ghost') : sys('which-piece'));
  if (!this.destroyed && this.step() === 'compose') this.hearKanji();
}
```

### 3.2 Progresión y niveles (el problema de fondo)

**Hallazgos en `kanji-composition.ts`:**

1. **A 4 años los 10 niveles son iguales.** `AGE4_LEVELS` tiene una sola fila → mismos 6 kanji, siempre sin distractores y con fantasma. Subir de nivel solo acorta la historia (`storyMode`). Para ella, "nivel 10" = "nivel 1". Con racha de 3, llega al tope viendo cada kanji ~5 veces.
2. **Los pools reemplazan, no acumulan.** `poolFor` devuelve *la última fila alcanzada*: en el nivel 9 solo existen `mori` y `go`. Los kanji aprendidos desaparecen. No hay repaso → es lo contrario de Spaced Repetition.
3. **`好` (koi) nunca sale a los 6 años**: no está en ninguna fila de `AGE6_LEVELS`.
4. **Acantilado en el nivel 5 (6 años):** cambian a la vez el kanji (6 nuevos), los distractores (+2/3) y la guía (se quita el fantasma). Tres dificultades simultáneas.
5. **El paso Componer es una moneda al aire.** Con 2 piezas, sin distractores y *tap* que rellena el primer hueco libre, acertar al azar es 50 %. Con 林, 炎 y 森 las piezas son idénticas: no hay nada que discriminar, solo contar.
6. **Los niveles 1-4 de 6 años = niveles de 4 años** (mismos kanji, sin distractores): sin reto para quien ya lee.
7. **El nivel no mira el historial.** Nada depende de qué kanji falló o cuál olvidó.

**Propuesta de progresión (acumulativa + SRS):**

| Nivel | 4 años | 6 años |
|---|---|---|
| 1-2 | 明, 休 · fantasma 100 % | 明, 休, 林, 岩 · fantasma 60 % |
| 3-4 | + 林, 岩 · fantasma 60 % · **repaso** de lo visto | + 男, 好 · sin fantasma · 1 distractor |
| 5-6 | + 男, 好 · fantasma 30 % | + 星, 本, 看 · 2 distractores · "adivina significado" |
| 7-8 | repaso mezclado · sin fantasma · 1 distractor | + 尖, 炎 · dibujo **de memoria** tras 1 ronda |
| 9-10 | "Mis kanji": ronda de repaso con los que más cuestan | + 森, 語 (3 piezas) · repaso intercalado |

Reglas:
- **Pools acumulativos:** `pool(nivel) = ⋃ filas ≤ nivel`.
- **Mezcla 60 % nuevos / 40 % repaso** (kanji "vencidos" según SRS; ver §5.4).
- **Fantasma que se desvanece** (opacidad 100 → 60 → 30 → 0) en vez de on/off: andamiaje retirable, como en `logic-blocks`.
- **Un cambio de dificultad por salto** (nunca kanji nuevo + distractores + sin guía a la vez).

### 3.3 Pedagogía (lo que falta frente al método)

| Principio | Estado actual | Qué cambiar |
|---|---|---|
| **Zvonkin: no dar la respuesta; hipótesis antes que dato** | El paso 1 muestra el kanji, la historia y las piezas; el paso 2 pide reproducirlo. Es *imitación*. | Invertir al menos parte de las rondas: dar las piezas y preguntar *"¿qué crees que significa 日 + 月?"* con **varias respuestas válidas** (💡 luz, 🌗 día y noche, 🌅…), y **después** revelar. Es el §B.6 del documento ("deducir el orden y significado"), que hoy no existe. |
| **Zvonkin: múltiples soluciones, argumentar** | Solo hay una colocación válida. | Para 6 años: "¿qué otro kanji puedes hacer con estas piezas?" (本/末/未). |
| **Zvonkin: isomorfismo** | El mismo principio (composición) no se reutiliza. | Mismo mecanismo con clasificación (Venn de radicales §B.5): "¿qué kanji llevan 木?" (休 林 森 本). |
| **Montessori: lección de tres tiempos** | Hay *presentación* (historia) pero no *reconocimiento* ("muéstrame…") ni *recuerdo* ("¿cuál es?"). | Añadir paso de reconocimiento: oye "あかるい" → elige 明 entre 2-3. Los textos `recall-hear/see/again` ya existen en el manifiesto; falta el modo. |
| **Montessori: aprendizaje táctil (letras de lija)** | Se dibuja sobre un fantasma de fuente. | Trazo guiado con orden y dirección animados (§5.3). |
| **Doman: breve, rápido, brillante, pocos ítems nuevos** | La historia completa de 4 años encadena ~10 clips (kanji → historia → 2×(pieza+significado) → kanji → "ahora tú") ≈ 20-25 s pasivos. | Tope de **≤ 10 s** de escucha pasiva. Historia ≤ 6 s. El resto, interactivo. Máximo 2-3 kanji nuevos por sesión. |
| **Neurociencia: práctica de recuperación (*retrieval*)** | El dibujo se hace *con el modelo delante* (fantasma activado por defecto + kanji grande arriba): es copia, no recuerdo. | Desde nivel 5: dibujar **sin** modelo; el kanji aparece solo al pedir ayuda. |
| **Neurociencia: espaciado + intercalado** | No hay. | SRS por kanji y por pieza (§5.4). |
| **Neurociencia: generación + *dual coding*** | ✔ Componer (generación) + emoji/voz/forma (dual coding). | Mantener. |
| **Honestidad histórica (nota del documento)** | Las historias se presentan como hechos ("Los japoneses escribieron 明 para decir claro"). Varias son **etimología popular** (語 = "boca que dice cinco"; 星 = sol + "nacer"; 尖). | Reencuadrar como **mnemotecnia**: "Una historia para recordarlo…". Marcar las que son mnemotécnicas con `mnemonic: true` y no afirmar origen histórico. |

### 3.4 UX para 4 años vs 6 años

- **Texto residual a los 4 años.** Aunque el juego "no usa texto", siguen visibles: banner de feedback, `hint()` (*"Prueba otra vez, o muévelas…"*, *"Dibuja con el dedo…"*), `h2` del overlay de hermanos, significados de los hermanos, `tray-empty`, `story-equals`. Cada uno debe ser **icono + voz** o desaparecer.
- **Sin escalera de ayuda.** Una niña atascada en Componer no recibe ayuda progresiva. `HintLadder` + `GhostHand` + `TutorialSeen` (ya usados en `logic-blocks`) resuelven esto con código existente: pulsar la pieza correcta (nivel 2), demostración de arrastre (nivel 3), tutorial de tres tiempos la primera vez.
- **El arrastre/tap no se enseña.** El *tap* que rellena "el primer hueco libre" no coincide con el modelo mental de "esta pieza va aquí"; con 2 piezas y orden aleatorio es azar. Mejor: el *tap* selecciona y el hueco recibe (como `logic-blocks`), o el *tap* coloca en el hueco **que corresponde a esa pieza si es correcta**, y rebota con pregunta si no.
- **Sin feedback durante el arrastre.** Añadir imán/resaltado del hueco más cercano con `cdkDragMoved`.
- **Pico de atención.** La puerta de inicio, el saludo de ~7 s, la historia y luego la instrucción suman casi 30 s antes de poder tocar nada. Solo el saludo la **primera vez por perfil/sesión**.
- **Confeti en cada kanji** devalúa el de subir de nivel. Reservarlo a `level-up`.
- **`LevelUpDialog`** (Lottie) existe y `listening-game` lo usa; aquí se usa solo audio+confeti. Unificar.
- **Botón de salida** en la puerta de inicio (un adulto que entra por error no puede salir).
- **Reflexión de 6 años falsa.** Los tres botones llaman a lo mismo y no guardan nada. O se guarda la elección (dato de metacognición para el panel) o se convierte en algo real: *"Explícaselo a tu hermana"* (modo Mentora, §5.7).

### 3.5 Audio y rendimiento

1. **Cobertura de audio de los pasos mudos:** reproducir `draw-now` al entrar a Dibujar, `draw-empty` si pulsa ✅ sin trazos, `siblings` + `siblingWord` en el overlay y `done` al terminar.
2. **Peso.** ~120 `.wav` (13 kanji × 3 + 20 piezas × 2 + 15 líneas + 15 sistema). A 22 kHz mono y 5-10 s por historia son **decenas de MB**. Convertir a **AAC/m4a** (compatible con Safari) u Opus con *fallback*, o empaquetar las piezas en un *audio sprite* con **Howler** (ya está en `package.json` y no se usa aquí).
3. **Offline real.** `ngsw-config` tiene `game-audio` en `installMode: lazy`: los clips solo se cachean tras reproducirse una vez online. Para este juego, un grupo `prefetch` propio (`/audio/kanji-compose/**`) garantiza que el primer juego sin conexión suene.
4. **Latencia.** El objetivo documentado es ≤ 300 ms entre aparecer y oír. Un `HTMLAudioElement` por clip tiene latencia variable en iOS. Para las piezas (clips cortos) usar **Web Audio / AudioBuffer** (o Howler sprite).
5. **Tipografía.** `index.html` tiene las fuentes comentadas y este SCSS **no declara `font-family` CJK** (otros juegos sí: `'Noto Sans JP'`). El mismo carácter puede dibujarse con variante china o japonesa según el dispositivo. Para 25 glifos conviene un **subconjunto embebido** (p. ej. con `pyftsubset`, pocos KB), idealmente en estilo de libro de texto (教科書体) para que el fantasma sea un buen modelo de trazo.
6. **`audio.dispose()`** vacía la caché global compartida; revisar que `Narrator._mios` no conserve rutas obsoletas entre juegos.

### 3.6 Contenido (revisión lingüística y de datos)

- **Mundo Dragón con `語`:** en chino continental es **语** (讠+吾). El carácter tradicional solo sirve en Taiwán/Hong Kong. Otro motivo para sacar Dragón de producción hasta que tenga contenido propio.
- **Lectura de `亻`:** `にんべん` es el *nombre del radical*, no una palabra que ella conozca. Para audio de 4 años, mejor `ひと` (persona).
- **Lecturas de piezas mezcladas:** sustantivos (`ひ`, `き`), verbos (`いう`, `うまれる`) y adjetivos (`ちいさい`, `おおきい`). Coherente para recordar, pero conviene decidir un criterio y documentarlo (la palabra más común en hiragana).
- **`id: 'koi'` para `好`** con lectura `すき`: el id sugiere `恋`. Renombrar (`suki`) **antes** de generar más audio (el id es el nombre del fichero).
- **`日` y `火`** (ambas `ひ`): bien documentado. Evitar ponerlas juntas como distractores entre sí (hoy `buildCompositionProblem` no lo impide para 6 años).
- **Distractores sin criterio:** se sacan al azar de piezas de otros kanji. Mejor *distractores pedagógicos*: piezas visualmente cercanas (日/目, 木/本, 大/小) o de la misma familia, introducidas gradualmente.
- **Solape con `nature-engine`:** la actividad `ki-hayashi-mori` (木→林→森) duplica contenido de este juego, y además `NatureGameComponent._kanjiToWordId` mapea `林`→`hayashi` y `森`→`mori`, ids que **no existen** en `JAPANESE_WORDS`. Decidir quién es dueño de esa lección.

### 3.7 Código y arquitectura Angular

- **Componente de ~600 líneas** con tres fases y mucha lógica de audio. Extraer: `KanjiComposeStory`, `KanjiComposeAssemble`, `KanjiComposeTrace` como componentes presentacionales (inputs/outputs), y un `KanjiComposeStore` (signals) para el estado de ronda. Facilita la prueba de integración.
- **Máquina de estados explícita** (`story → compose → siblings → draw → reflect → done`) en lugar de `step()` + `busy()` + `reflecting()` + `showSiblings()` + `localFeedback()`. Con 5 flags booleanos es donde nacen B1, B2 y B7.
- **`later()` + `clearTimers()`** se repite en cada juego (math, coin-shop, etc.): extraer a un `RoundTimers`/mixin compartido.
- **`autoStart` declarado como campo `input()` debajo de `ngOnInit`**: funciona, pero muévelo arriba con el resto de inputs.
- **`afterRenderEffect` + `strokes.update(s => [...s])` en cada `pointermove`:** repinta todo el lienzo en cada evento. Para 13 kanji no importa; para trazo guiado conviene `requestAnimationFrame` y repintar solo el trazo activo.
- **Persistencia:** `progress.saveProgress` solo al subir de nivel. No se registra nada por kanji.

### 3.8 Pruebas

Hoy hay muy buena cobertura de **datos** (`kanji-composition.spec`, `kanji-narration.spec`) y **ninguna del componente**. El comentario de `coin-shop.spec.ts` lo dice mejor que nadie: *"los tests de lógica pura pasan aunque el juego sea imposible de terminar"*. Añadir `kanji-compose.spec.ts` de integración que recorra una ronda completa:

1. Monta con edad 4 y 6.
2. Pulsa ▶ → recorre Historia → Componer (colocar correcto y *swapped*) → Dibujar → `consecutiveCorrect === 1`.
3. **Doble toque en ✅ ⇒ solo +1 racha** (regresión B1).
4. Banner nunca muestra texto de cohetes (regresión B2).
5. `busy` siempre se libera.
6. Nivel 10 de 4 años ≠ nivel 1 (regresión de §3.2) y los pools son acumulativos.
7. Test de **clases CSS**: toda clase usada en la plantilla existe en el SCSS (evita B4).

---

## 4. Qué deberíamos quitar

| # | Qué | Por qué | Cuándo |
|---|---|---|---|
| Q1 | **Mundo Dragón / `script` input** en la ruta de producción | Solo es alcanzable desde el laboratorio; hoy pinyin + audio japonés = contradictorio; falta audio `zh-CN`; `語` sería traditional. Mantenerlo en el lab, no en el juego público. | Ya |
| Q2 | **Banner `game-feedback` a los 4 años** | Es texto que no lee y compite con la cara/voz. Sustituir por `mood` (como `logic-blocks`). | Sprint 0 |
| Q3 | **`onyomi` y clips `kc.ja.k.*.on`** | Se generan y se mantienen, pero **ninguna pantalla los muestra ni reproduce**. Reintroducir solo cuando exista el paso "lectura erudita" (6 años, nivel 7+). | Sprint 0 |
| Q4 | ~~**Reflexión de un toque tal como está**~~ ✅ | Los tres botones llamaban a `chooseReflection()` **sin argumento** y solo servían para pasar de página. Ahora cada uno hace lo que dice: 🧩 el recuento en vivo hueco por hueco, 💡 la historia, 🔎 el panel de hermanos. Las dos primeras se oyen y **después** sigue la siguiente ronda —si no, ella tocaría y se quedaría mirando el mismo diálogo—. "Probé otra posición" es un `computed` y se va cuando el kanji no tiene hermanos: un panel vacío es peor que una opción menos. Sin guardar todavía cuál eligió (eso es §5.11). | Sprint 1 ✅ |
| Q5 | **Confeti por cada kanji** | Devalúa el *level-up*. Dejar solo en subida de nivel/fin de juego. | Sprint 0 |
| Q6 | ~~**Historia pasiva larga de 4 años (modo `full`)**~~ ✅ **medido, no hacía falta tocar nada** | El informe estimaba ~20-25 s. Medido sobre los clips reales: la secuencia `full` completa (palabra → historia → piezas con significado → palabra → "ahora tú") son **14,5 s** en 明 y **~15,5 s** en 休, que es la historia más larga a la que llega una niña de 4 en modo `full` (143 caracteres). La historia sola dura **8,9 s** y **9,63 s**: ya cumple el "≤ 10 s" que pedía el propio informe. Y el paso no es pasivo —cada pieza se puede tocar para oírla otra vez, y hay botón de salto—. No se reescriben historias que ya se han escuchado y verificado. | Sprint 1 ✅ |
| Q7 | ~~**Afirmar etimología histórica** en historias mnemotécnicas~~ ✅ | Revisadas las 13 historias: **solo una** afirmaba un acto de escritura — 明 decía "Los japoneses escribieron 明 para decir *claro*". Cambiada por "Así dibujamos 明 para decir *claro*", que es honestamente una mnemotécnica y no una atribución histórica. Las otras 12 ya describían la lógica de las piezas sin reclamar origen. Se regeneró el único clip afectado (`kc.es.k.mei.story`, 8,9 s) con `generate.py`, que salta los que ya existen, así que los otros 109 clips quedan intactos y verificados. | Sprint 1 ✅ |
| Q8 | **Código muerto**: `.piece-enter`, `@keyframes piece-in`, `.draw-hint strong`, `.cdk-drag-preview` encapsulado, `strokeCount` si no se usa, textos de sistema sin uso (`again`, `next`, `guide-composer`, `recall-*` mientras no exista el modo) | Ruido y clips que se generan sin usarse. | Sprint 0 |
| Q9 | **Texto residual en pantalla para pre-lectoras** (`hint`, `tray-empty`, `story-equals`, `h2` de hermanos) | Sustituir por icono + voz. | Sprint 1 |
| Q10 | **`ki-hayashi-mori` en `nature-engine`** (o dejarlo como enlace al nuevo laboratorio de posición) | Contenido duplicado con ids rotos. | Sprint 3 |
| Q11 | ~~**Tap que rellena "el primer hueco libre"**~~ ✅ | `onTap` rellenaba `findIndex(p => p === null)`: el primer hueco libre, sin mirar la pieza. No era azar puro —con dos piezas el orden de toques decidía el resultado— pero era peor: **ella no podía hacer nada para influir**, mientras que con el arrastre sí podía elegir hueco. Ahora el tap es coger: la pieza se queda en la mano, suena y se levanta, los huecos vacíos se ofrecen, y el hueco lo toca ella. Tocar otra pieza la sustituye; tocar la misma la suelta; tocar un hueco vacío con la mano vacía no hace nada, que también es parte del arreglo. | Sprint 1 ✅ |

---

## 5. Qué podemos agregar

Ordenado por **impacto pedagógico / esfuerzo**.

### 5.1 ⭐ "Laboratorio de posición" — *mismas piezas, otro lugar* (impacto ALTO · esfuerzo M)
Hoy los hermanos son un overlay estático. Convertirlo en el **modo estrella**: tablero libre donde mover una pieza y ver cómo el kanji **se transforma en vivo**:

- 木 + 一 abajo → **本** (libro/raíz) · 一 arriba-corto → **末** · 一 arriba-largo → **未**.
- 日 + 月 → **明**; 月 + 日 → "¿se forma algo?" (no) → pregunta socrática.
- 木 + 木 → 林; + 木 → 森 (el árbol que crece: 1, 2, 3).

Mecánica: un reconocedor sencillo por *tabla de posiciones* (los `slots` ya están normalizados) con tolerancia. Es **isomorfismo + multi-solución + hipótesis** puros (Zvonkin) y reutiliza los datos existentes. Lo que la niña descubre ("la posición cambia el significado") es lo más valioso del juego.

### 5.2 "Adivina el significado" — descubrimiento antes de la revelación (impacto ALTO · M) — **Hecho (23 oct)**
Antes de mostrar la historia: se dan las piezas con su emoji y voz (☀️ + 🌙) y se pregunta *"¿qué crees que quiere decir?"* con 3-4 opciones por emoji, **varias válidas**. Después se revela el kanji y su significado real. Cumple el §B.6 del documento (deducir significado) y convierte el paso 1 de espectáculo en indagación. A los 4 años: solo emoji + voz; a los 6: también puede escribir/ordenar la idea.

**Hecho** como el paso 0 de la ronda (`buildGuessProblem` + paso `adivina`), solo para
kanji **nuevos**: el repaso va derecho a la historia, porque volver a preguntar lo que ya
sabe es un examen disfrazado de indagación.

Las opciones son el significado **real** del kanji más los de sus propias piezas,
deduplicadas por emoji. Para 日+🌙 caben "claro", "sol" y "luna", y las tres son hipótesis
con las que la historia puede trabajar —de ahí que haya varias válidas y no una—. Tres
decisiones:

- **No se puntúa.** Ninguna opción es incorrecta, porque una hipótesis no lo es. Elegir
  ☀️ "sol" no es un error: la historia dirá "sol y luna a la vez: claro" y su idea habrá
  crecido. Un "no, es claro" rompería justo lo que el paso busca. Tampoco se anota en el
  SRS: acertar al azar entre dos no dice nada.
- **Se oyen los significados en español, a cualquier edad.** Sin oír que son "sol" y
  "luna" no hay hipótesis que formar; "ひ" y "つき" no dicen nada ni a los 4 ni a los 6, y
  eso es lo que la historia enseña después.
- **2-3 opciones, no 3-4** como preveía el documento. Una opción que no tiene nada que ver
  con las piezas (un 🐟 para sol y luna) se descarta de un vistazo y no haría más que
  fingir que hay elección donde no la hay. Para los kanji de piezas repetidas —森 es
  🌳+🌳+🌳— hace falta un emoji extra en la tabla `GUESS_EXTRA`, porque deduplicando no
  quedaría nada que elegir.

La revelación es la propia historia: no hay clip nuevo para ella, y la única pieza de audio
añadida es la pregunta (`guess-question`, 1,8 s).

### 5.3 Trazo guiado con orden de trazos (impacto ALTO · L)
- Usar **KanjiVG** (CC BY-SA 3.0, requiere atribución) para los 13 kanji + 20 piezas, empaquetado como SVG pequeño.
- Animar el orden y la dirección; el dedo recorre cada trazo; validación **suave**: nº de trazos (usar `strokeCount`), cercanía al trazo plantilla, dirección. Nunca "incorrecto": *"¿Probamos ese trazo otra vez?"*.
- Progresión (retiro de andamios): **trazo animado → fantasma → solo puntos de inicio → de memoria**.
- Equivalente digital de las letras de lija Montessori. Valorar la librería *Hanzi Writer* si encaja con datos japoneses, o un validador propio sobre las rutas KanjiVG.

### 5.4 Spaced Repetition por kanji y pieza (impacto ALTO · M)
**Hecho (23 oct)** — `review()`, `due()` y `dueAt()` en `SpacedRepetition`, cableados en
`finishProblem`/`generateProblem` y probados. Dos desviaciones respecto a la idea de
abajo, ambas a propósito:

- `review` recibe `{ correct, ayuda }` y no `{ correct, ms }`. El tiempo de respuesta en
  este juego está dominado por la motricidad de dibujar, no por la dificultad del kanji,
  así que `ms` sería ruido. `ayuda` sí que importa: sin él, la escalera de ayuda llevaría
  un kanji que nunca sale sola a la caja 5 en una sesión.
- `storyMode` es por **nivel** y no por kanji (≥ 7 deja de contarse sola en cualquier
  edad, y el 🔊 aparece para pedirla). Ver §6.

Queda sin hacer de §5.4: "Mis kanji más difíciles" para el panel parental.

El proyecto ya tenía `SpacedRepetition` (cajas Leitner) y `SkillProgressService`, pero solo
para saber qué se había presentado. La idea de integración original era esta:

```ts
// idea de integración
const KANJI_DECK = 'kanji-compose';
// al terminar una ronda:
this.srs.review(KANJI_DECK, target.id, { correct: attempts === 0, ms });
this.skillProgress.recordAttempt({ skillId: 'japanese.kanji.composition', contentId: target.id, … });
// al generar:
const due = this.srs.due(KANJI_DECK, now);        // vencidos primero
const problem = buildCompositionProblem(level, age, { due, rng });
```
Efectos: `storyMode` por kanji (no por nivel), mezcla 60/40 nuevo/repaso, el nivel 9-10 realmente repasa, y "Mis kanji más difíciles" para el panel parental.

### 5.5 Reutilizar `HintLadder`, `GhostHand`, `TutorialSeen` (impacto ALTO · S)
Cero código nuevo de infraestructura: copiar el patrón de `logic-blocks`.
- Tutorial de tres tiempos la primera vez por perfil+modo: *esto es → mira cómo → ahora tú*.
- Nivel 1: pulsa la 🔊; nivel 2: resalta la pieza correcta; nivel 3 (4 años): mano fantasma arrastra la pieza al hueco. Para 6 años, tope en nivel 2 (como ya define `LADDER_BY_AGE`).
- Fantasma de **arrastre** (`GhostHand`) con la pieza real.

### 5.6 Modo "Reconocer" (tres tiempos, 2.º y 3.er periodo) (impacto MEDIO · S-M) — **Hecho (23 oct)**
Aprovecha los clips `recall-hear`/`recall-see` que ya existen: oye "あかるい" → elige 明 entre 2-3. Es la pieza que falta para completar la lección de tres tiempos y alimenta el SRS con recuerdo "frío" (sin construir).

**Hecho** como calentamiento de dos aciertos que abre la sesión (`buildRecallProblem` +
paso `reconocer`). Cuatro decisiones, todas en el código con su porqué:

- **Solo la dirección "escuchar"** (oye la lectura, elige el kanji). La inversa —ver el
  kanji y elegir su lectura en hiragana— es un examen de *kana*, que es otra asignatura y
  otra edad; la de significado es §5.2 y va por emoji, no por kana.
- **Los distractores comparten pieza** cuando hay de donde elegir (§B.5): un distractor
  que no se parece a nada se elimina de un vistazo y no prueba nada.
- **No cuenta el kanji que va a componer ahora**, para que el recuerdo sea frío de verdad.
- **Solo la primera tirada cuenta** en el SRS: con dos opciones, si contasen todas se
  subiría de caja por descarte.

Un error no zumba: se atenúa la que no es y se vuelve a oír la lectura. Si ya ha descartado
todo lo demás, el kanji se levanta —el peldaño 2 de la escalera, aquí donde no hay hueco—.

### 5.7 Modo pareja asimétrico (§4 del documento) (impacto MEDIO · M)
Como `space-rescue-mission`:
- **6 años = Mentora/Navegante:** lee la historia y decide qué piezas usar.
- **4 años = Ingeniera:** arrastra las piezas.
- Convierte la "reflexión" en algo real: la mayor **explica** a la menor y se registra qué estrategia eligió. Consolida el razonamiento de la mayor y evita que la menor sea espectadora.

### 5.8 Álbum de kanji + "árbol de familias" (impacto MEDIO · M)
- Cada kanji construido y dibujado = una **carta/sticker** (el perfil ya tiene `stickers` y el dashboard muestra el álbum, pero nadie las añade desde juegos).
- Vista de **familias de piezas**: la ficha 木 conecta 休·林·森·本; 日 conecta 明·星. Refuerza reconocimiento de componentes (§B.5) y da objetivo de coleccionar sin presión de tiempo.

### 5.9 Ritual "Flash" de 60 s (Doman + Plantilla 7) (impacto MEDIO · S) — **Hecho (23 oct)**
Calentamiento antes de jugar: 5 kanji ya vistos, **mostrar–decir–retirar** a 1 s cada uno, sin pregunta. Es el ritual de inicio que propone el documento y la forma más barata de repasar.

**Hecho** (paso `flash`, 5 kanji × 1 s ≈ 6 s, no 60). Dos desviaciones, ambas a propósito:

- **Va DESPUÉS de §5.6, no antes.** El Flash enseña los kanji, y en cuanto se enseñan el
  recuerdo deja de ser frío, que es lo único que el Reconocer puede medir. Al revés,
  "¿cuál suena?" se respondería con lo visto hace cinco segundos y el SRS recibiría una
  señal sin significado. La sesión es: examinar → enseñar → jugar.
- **Una sola tarjeta en pantalla**, no una pila de cinco: el ritual es *retirar*, y cinco
  juntas serían un álbum, que es otra cosa.

Es además el único calentamiento que funciona desde la primera sesión: se puede enseñar un
kanji conocido desde que se conoce uno, mientras que reconocer exige tres.

### 5.10 Transferencia entre juegos (impacto MEDIO · S)
Los componentes ya existen en otros juegos: 日 月 火 水 木 金 土 son los días del calendario; 木/林/森 están en Naturaleza. Añadir *"¡Ya conoces este! 木 está en 木曜日"* y puentes de entrada (si domina el calendario, desbloquear las piezas correspondientes).

### 5.11 Panel parental / telemetría (impacto MEDIO · S-M)
Por kanji: intentos, aciertos a la primera, ayudas usadas, tiempo, pieza más confundida. Se guarda en `SkillProgress`/`GameProgress` y se muestra en el dashboard parental. Hoy se pierde toda esa señal.

### 5.12 Mundo Dragón, bien hecho (impacto MEDIO · L)
Si se retoma: clips `zh-CN` propios (Sabio Long), pinyin con tonos, **hanzi simplificado** (语, no 語), pictogramas Jiaguwen del §C.1 como puente, y otro conjunto de caracteres (los de los radicales chinos del §C.4). Tratarlo como juego aparte, no como *skin*.

### 5.13 Pulido técnico (impacto BAJO-MEDIO · S)
`navigator.vibrate` al colocar (Android), imán/resaltado de hueco con `cdkDragMoved`, `aria-live` en el estado del juego, repintado en resize, filtrado de palma, subconjunto de fuente embebido, audio comprimido, prefetch offline.

### 5.14 Prueba de integración + lab con "salto de estado" (impacto ALTO · S)
Ver §3.8. Además, botones en el lab para saltar a **Dibujar**, **Siblings** o **Reflexión** sin jugar el flujo entero.

---

## 6. Hoja de ruta propuesta

*Estado al 23 de octubre: Sprints 0–2 cerrados (salvo lo anotado), incluido §5.4. Queda
Sprint 3 y 4, y de Sprint 2 el sprite/Web Audio.*

### Sprint 0 — Correcciones (≈ 1 día)
- [x] B1 doble toque, B2 banner/estado, B3 instrucción cortada, B4 clases CSS
- [x] Q2 banner → cara de ánimo a 4 años · Q5 confeti solo en level-up
- [x] Q3/Q8 limpiar `onyomi` y código muerto · B9 audio de los pasos mudos
- [x] Test de integración mínimo (B1, B2, `busy`)

### Sprint 1 — Progresión que enseña
- [x] Pools **acumulativos** + tabla de niveles de §3.2 (4 años deja de ser plano)
- [x] SRS por kanji (§5.4) + `storyMode` — este último por **nivel** (≥ 7 se la cuenta
      sola a cualquier edad, y el 🔊 aparece para pedirla), no por kanji: para que fuera
      por kanji habría que decidir si la caja alta borra la historia, y eso se prueba en
      tablet con las niñas, no en un test
- [x] `HintLadder` + `GhostHand` + `TutorialSeen` (§5.5)
- [x] Tap/selección coherente (Q11) — el hueco lo elige ella
- [ ] Imán en arrastre (la pieza se "engancha" al hueco más cercano al soltarla cerca)
- [x] Historia de 4 años: medida, ya cumple ≤ 10 s (Q6) · mnemotecnias reencuadradas (Q7)
- [x] Reflexión útil: cada respuesta hace lo que dice (Q4)

### Sprint 2 — Trazo y tipografía
- [x] KanjiVG + trazo guiado + validación suave (§5.3)
- [x] Fuente subconjunto embebida · filtrado de palma · resize
- [x] Audio comprimido + prefetch offline
- [ ] Sprite / Web Audio (el m4a ya está; el sprite es optimización, no requisito)

### Sprint 3 — Descubrimiento (el salto de calidad)
- [ ] **Laboratorio de posición** (§5.1)
- [x] **Adivina el significado** (§5.2) — solo en kanji nuevos; la historia es la respuesta
- [x] Modo **Reconocer** (§5.6) — calentamiento de 2 aciertos con recuerdo frío
- [x] Ritual **Flash** (§5.9) — mostrar–decir–retirar; va **después** de examinar, no antes
- [ ] Resolver solape con `nature-engine` (Q10)

### Sprint 4 — Motivación y familia
- [ ] Modo pareja (§5.7) · Álbum y familias (§5.8) · panel parental (§5.11)
- [ ] Puentes con calendario/naturaleza (§5.10)
- [ ] (Opcional) Dragón bien hecho (§5.12)

---

## 7. Matriz resumen

| Acción | Tipo | Impacto | Esfuerzo | Sprint |
|---|---|---|---|---|
| Guard doble toque (B1) | Bug | 🔴 | XS | 0 |
| Prompt por paso / sin "cohetes" (B2) | Bug | 🔴 | XS | 0 |
| No cortar instrucción (B3) | Bug | 🟠 | XS | 0 |
| Alinear clases CSS (B4) | Bug | 🟠 | XS | 0 |
| Quitar Dragón de producción (Q1) | Quitar | 🟠 | XS | 0 |
| Pools acumulativos + niveles reales (§3.2) | Mejorar | 🔴 | M | 1 |
| SRS + `SkillProgress` (§5.4) | Agregar | 🔴 | M | 1 |
| `HintLadder`/`GhostHand`/`TutorialSeen` (§5.5) | Agregar | 🔴 | S | 1 |
| Trazo guiado KanjiVG (§5.3) | Agregar | 🔴 | L | 2 |
| Laboratorio de posición (§5.1) | Agregar | 🔴 | M | 3 |
| Adivina el significado (§5.2) | Agregar | 🔴 | M | 3 |
| Reconocer (§5.6) | Agregar | 🟠 | S-M | 3 |
| Modo pareja (§5.7) | Agregar | 🟠 | M | 4 |
| Álbum + familias (§5.8) | Agregar | 🟠 | M | 4 |
| Audio comprimido + offline (§3.5) | Mejorar | 🟠 | M | 2 |
| Dividir en 3 componentes + store (§3.7) | Refactor | 🟡 | M | 1-2 |

---

## 8. Cómo medir que mejoró

- **Aciertos a la primera por kanji** (sin ayuda) ↑, y su caída tras 7 días (retención).
- **Tiempo hasta la primera interacción** ≤ 10 s (hoy ~25-30 s a los 4 años).
- **% de rondas con ayuda nivel 3** ↓ semana a semana.
- **Tasa de rondas completadas** (¿abandonan en Historia, Componer o Dibujar?).
- **Distribución de kanji vistos** (que ninguno concentre > 25 % de las rondas).
- **Retención diferida**: reconocimiento correcto de un kanji 3 y 7 días después de aprenderlo.

---

*Nota de método:* este informe respeta la regla del documento Zvonkin de no presentar como hecho histórico lo que es adaptación lúdica; las propuestas §5.1-§5.2 son **adaptaciones inspiradas** en §B.5/§B.6, no mecánicas documentadas de un autor concreto.
