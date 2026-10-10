# Spec técnica — "Clasificador de Bloques" para pre-lectoras (4 años)

> **Problema**: la niña de 4 años no sabe leer y no entendió qué debía hacer en `logic-blocks`.
> **Objetivo**: que pueda *entender la consigna, ver qué se espera y corregirse sola* sin leer una sola palabra, manteniendo el método Zvonkin (preguntas, no veredictos) y sin quitarle el descubrimiento.

---

## 1. Diagnóstico: dónde el juego depende hoy de texto

| # | Dónde (código) | Qué pasa | Por qué rompe a una pre-lectora |
|---|---|---|---|
| 1 | `logic-blocks.ts` → `idleMessage()` + `<game-feedback [customMessage]>` | La **única** forma de comunicar la regla es un banner de texto: *"Lleva todas las figuras rojas a la canasta 🧺"* | No puede leerla. No hay audio de consigna. |
| 2 | `feedbackState()` | En cuanto hay un error el banner pasa a `try-again` y **la consigna desaparece de pantalla** | Aunque un adulto se la leyera, tras el primer error ya no está. |
| 3 | `logic-blocks.html` → `<div class="basket-title">🧺 {{ z.title }}</div>` | La canasta se identifica con texto (*"Figuras rojas"*, *"Círculos"*) | No sabe qué canasta es cuál (modo `two`, niveles 8-10). |
| 4 | `hintFor(round)` → `hint()` | Las pistas socráticas son texto (*"¿es roja?"*) | Nunca las recibe. |
| 5 | `place()` → `wrongCount++` / `onRoundComplete()` | Cada drop erróneo cuenta, y con 3 errores la ronda **rompe la racha** | Está siendo penalizada por *no entender la consigna*, no por no saber clasificar. |
| 6 | Modo `one` | Las figuras que **no** cumplen la regla quedan en el pool, y no hay señal de "cuántas faltan" | No sabe si debe mover todas, solo algunas, ni cuándo terminó. |
| 7 | No hay demostración | Se asume que "arrastrar a la canasta" es obvio | A los 4 años la mecánica también se aprende (Montessori: primero se *presenta*). |
| 8 | Tap-to-place (`onTap` → `onBoardTap`) | Seleccionar una figura solo pinta un borde blanco | No hay pista visual de *dónde* tocar después. |

**Conclusión**: no es un problema de dificultad cognitiva (clasificar por 1 propiedad es adecuado a los 4 años); es un problema de **canal de comunicación**. Hay que sustituir texto por **icono + voz + demostración**.

---

## 2. Principios de diseño

1. **Tres canales, ninguno es solo texto**: *icono persistente* (qué regla), *voz* (consigna y preguntas), *demostración* (cómo se juega).
2. **Lección en tres tiempos (Montessori)**: *"Esto es…"* (mostrar la regla) → *"Muéstrame…"* (ella hace) → *"¿Qué es?"* (verifica sola). Se refleja en el tutorial (§5.7).
3. **Zvonkin**: la voz **pregunta** (*"¿Esta figura es roja?"*), nunca dice *"mal"*. Se mantiene que no se le dice dónde va cada figura; solo se le recuerda la regla y se le hace comparar.
4. **Aprendizaje sin error (errorless) al inicio**, retirando apoyos con el tiempo: ejemplo ya resuelto → pistas → demo → atenuar distractores.
5. **No penalizar el no haber entendido la consigna**: ningún error cuenta hasta que la consigna se haya escuchado completa.
6. **La consigna siempre visible**: sale del banner efímero y vive en una barra fija con icono + botón 🔊.
7. **Cuerpo pequeño**: dedos de 4 años → blancos de toque ≥ 64 px, vista previa de arrastre que no tape la figura.

---

## 3. Visión de la solución (7 pilares)

| Pilar | Qué es | Reemplaza al problema # |
|---|---|---|
| **P1 Insignia de regla** | Componente `RuleBadge`: muestra la regla como *muestra visual* (chip de color, silueta de forma) en una **barra fija** y en cada canasta | 1, 2, 3 |
| **P2 Narración por voz** | `Narrator` + clips `.wav` cortos: consigna al empezar la ronda, botón 🔊 para repetirla, etiqueta hablada al tocar una canasta | 1, 3, 4 |
| **P3 Mano fantasma** | Demostración animada de **una** figura yendo a su canasta (sobre un clon, sin alterar el estado) | 7 |
| **P4 Escalera de ayuda** | Máquina de estados por inactividad **y** por error: repetir voz → pulsar insignia → resaltar figuras → demo + atenuar distractores | 2, 4, 8 |
| **P5 Cierre visual** | Ranuras fantasma en la canasta (modo `one`), ejemplo ya colocado en niveles 1-2, distractores que se desvanecen al terminar | 6 |
| **P6 Errores de comprensión no penalizan** | Flag `instructionHeard`; los drops erróneos solo cuentan después de oír la consigna | 5 |
| **P7 Tutorial inicial** | 3 pasos (mirar → demo → "ahora tú") la **primera vez** por perfil y modo; persistido | 7 |

Complementos: cara de ánimo en vez de banner de texto (4 años), blancos de toque más grandes, pista visual en tap-to-place.

### 2.1 Cómo se reparte entre las dos edades

El objetivo no es solo que juegue la de 4 años: es que **ninguna de las dos necesite a un adulto
para empezar una ronda**. Pero el canal principal cambia, y conviene decidirlo en voz alta:

| | 4 años | 6 años |
|---|---|---|
| **Canal principal** | insignia visual + voz (no lee) | **texto** (lee y comprende) |
| Insignia de regla | muestra de color/forma, sin texto | muestra + texto de la regla |
| Voz de la consigna | **siempre**, es el canal principal | **opcional**, botón 🔊 para repetir |
| Ejemplo ya colocado | niveles 1-2 | no |
| Ranuras fantasma | niveles 1-5 | no |
| Escalera de ayuda | completa (8/16/24 s) | más larga (20/40 s), sin demo |
| Cara de ánimo | sí (sustituye al banner) | no, banner normal |

Regla de implementación: **la barra de insignia se muestra a las dos edades** (es la garantía de
que la consigna está siempre a la vista), pero solo a 4 años se **sustituye** el texto por la
muestra visual. Lo que hoy está tras `isPreReader()` y no debería estarlo: la barra de regla y
el botón 🔊. Lo que sí queda tras `isPreReader()`: cara de ánimo, tamaños táctiles grandes,
ejemplo colocado y ranuras.

> Si al medir (§8b) la de 6 años no está usando el botón 🔊 por iniciativa propia, la voz está
> de sobra para ella y se puede quitar de su camino sin tocar nada de lo demás.

---

## 4. Arquitectura: archivos nuevos y modificados

```
src/app/
├─ core/games/
│  ├─ narrator.service.ts            [NUEVO]  voz: secuencias, cancelación, fallback TTS
│  ├─ hint-ladder.ts                 [NUEVO]  lógica pura de la escalera de ayuda
│  ├─ tutorial-seen.service.ts       [NUEVO]  qué tutoriales ya vio cada perfil (signals + localStorage)
│  └─ game-audio.service.ts          [MOD]    + playFileAndWait(), + hasPending (signal)
├─ shared/game-ui/
│  ├─ rule-badge/rule-badge.{ts,html,scss}   [NUEVO]  insignia visual de la regla
│  ├─ ghost-hand/ghost-hand.{ts,html,scss}   [NUEVO]  demo animada de arrastre
│  └─ _block-shapes.scss                     [NUEVO]  parcial SCSS con .blk (extraído de logic-blocks.scss)
├─ features/games/math/logic-blocks/
│  ├─ logic-blocks-narration.ts      [NUEVO]  claves de clip + textos (puro, testeable)
│  ├─ logic-blocks.{ts,html,scss}    [MOD]    barra de regla, ladder, demo, tutorial, ranuras
│  └─ logic-blocks-problem.ts        [MOD]    opcional: `seed` (ejemplo ya colocado)
├─ features/dev/lab-stubs.ts         [MOD]    + reset del tutorial en el laboratorio
public/audio/logic-blocks/es/*.wav [NUEVO]  ~30 clips
tools/narration/logic-blocks.es.json [NUEVO] manifiesto clave → texto
tools/narration/generate.py        [NUEVO]  genera los .wav
```

**Convenciones del repo que se respetan**: `@Service()` en lugar de `@Injectable`, componentes sin `standalone: true`, `inject()`, signals + `computed`, `later()` para timers cancelables, `afterRenderEffect` para medir DOM (patrón ya usado en `kanji-compose`), `devOnlyGuard` para laboratorios.

---

## 5. Especificación detallada

### 5.1 `RuleBadge` — insignia visual de la regla (P1)

**Ruta**: `shared/game-ui/rule-badge/`

**Inputs** (signal inputs):

| Input | Tipo | Default | Notas |
|---|---|---|---|
| `attr` | `Attr` (de `logic-blocks-problem.ts`) | requerido | Regla a representar |
| `size` | `'md' \| 'lg'` | `'lg'` | `lg` = 72 px, `md` = 52 px |
| `pulse` | `boolean` | `false` | Anima la insignia (ayuda nivel 1+) |

**Render por tipo de regla** (distinguibles *sin leer*):

| `attr.kind` | Representación | Por qué |
|---|---|---|
| `color` | **Chip de color** lleno (gota/círculo plano) del color de la regla, **sin forma reconocible** | Si fuera un círculo rojo podría leerse como "los círculos". Se usa un chip tipo muestra de pintura (borde blanco grueso, esquinas muy redondeadas). |
| `shape` | **Silueta de la forma en gris neutro** (`#e2e8f0`) | Sin color, para que no se confunda con regla de color. |
| `size` (6 años, opcional) | Dos siluetas grises, una grande y una pequeña, con un 👆 sobre la que corresponde | — |

**Reglas**:
- Pixel-perfect igual que `.blk` (mismos `clip-path` para triángulo) → por eso se extrae `_block-shapes.scss` y ambos componentes hacen `@use`.
- `role="img"` + `aria-label` con el texto (para accesibilidad real; la niña no lo usa).
- La barra de regla es **independiente del banner de feedback**: nunca se oculta por un error.

**Dónde se usa**:
1. **Barra de regla** (arriba del tablero, fija): `[🔊] [RuleBadge] ➜ [🧺]` (modo `one`) · `[🔊] [Badge A] / [Badge B]` (modo `two`).
2. **Cabecera de cada canasta** (modo `one`/`two`) para 4 años: **sustituye** a `basket-title` (texto). Para 6 años se conserva el texto.
3. Venn de 6 años (Fase 4, opcional): etiquetas de los círculos.

**Interacción**: tocar una insignia reproduce su etiqueta hablada (`lb.label.*`). Importante: el click debe llamar `$event.stopPropagation()` porque `.zones` tiene `(click)="onBoardTap($event)"` y colocaría la figura seleccionada.

---

### 5.2 `Narrator` — voz (P2)

**Ruta**: `core/games/narrator.service.ts` (genérico, reutilizable por otros juegos).

```ts
export type ClipKey = string;                 // p. ej. 'lb.one.color.red'

@Service()
export class Narrator {
  private readonly audio = inject(GameAudioService);
  private seq = 0;                             // token: cada say() invalida al anterior

  readonly speaking = signal(false);

  /** Reproduce una secuencia de clips. Resuelve true si se oyó completa (no cancelada). */
  async say(keys: ClipKey | ClipKey[], opts?: { gapMs?: number }): Promise<boolean>;

  /** Corta lo que suene (al destruir el componente, al subir de nivel, etc.) */
  cancel(): void;
}
```

**Comportamiento**:
1. `say()` incrementa `seq`; tras cada `await`, si `seq` cambió → **aborta** (evita voces solapadas cuando ella toca rápido).
2. Resuelve el path con `clipPath(key)` = `audio/logic-blocks/es/${key}.wav` (el prefijo por juego lo da quien llama o un mapa `CLIP_BASE`).
3. Usa `audio.playFileAndWait(path)`; si devuelve `false` (archivo ausente o no reproducible),
   cae al **TTS de `SpeechService`** con el texto de `CLIP_TEXT[key]`.
4. `speaking` (signal) se pone a `true/false` para animar el botón 🔊.
5. `cancel()` → `seq++`, `audio.stopAll()`, `speech.cancel()`.

> **Por qué `SpeechService` y no `speechSynthesis` crudo** (esta sección sustituye a una
> versión anterior que llamaba a `speechSynthesis` directamente). `SpeechService` ya resuelve
> tres fallos que son silenciosos — es decir, no dan error, solo audio que no suena:
>
> | Problema | Qué hace `SpeechService` |
> |---|---|
> | `getVoices()` devuelve `[]` al arrancar | espera al evento `voiceschanged` |
> | `speak()` falla sin lanzar excepción | resuelve `false` y avisa por consola (una vez) |
> | Sin red solo existen las voces de `localService` | filtra por `localService !== false` |
>
> Además, las 5 tareas de TTS que ya arden en la app (`coin-shop`, `kanji-compose`,
> `space-fuel-ship`, `space-load-ship`, `space-fuel-tank`) lo usan. `Narrator` debe hacer
> lo mismo y **no** crear un segundo pathway de síntesis.

**Riesgo del TTS aquí, en contraste con `kanji-compose`**: allí se descartó el TTS porque una
voz equivocada *enseña una pronunciación equivocada*. Aquí no aplica: el peor caso del TTS es
que **no suene** o suene con acento, y ella sigue entendiendo el español. Por eso el fallback
por TTS es aceptable en este juego y no lo sería en el de kanji.

**Cambios en `GameAudioService`**:

```ts
/** Reproduce un archivo y espera a que termine. Devuelve true si realmente sonó. */
async playFileAndWait(path: string, volume = 0.85): Promise<boolean> {
  if (!this._enabled()) return false;
  const resolved = this._resolve(path);
  await this._playFile(resolved, volume);
  const audio = this._audioCache.get(resolved);
  if (!audio || audio.error || audio.paused && audio.currentTime === 0) return false;
  if (audio.ended) return true;
  await new Promise<void>(res => {
    audio.addEventListener('ended', () => res(), { once: true });
    audio.addEventListener('pause', () => res(), { once: true });   // stopAll() cancela
  });
  return audio.ended;
}

/** Hay un audio bloqueado por autoplay esperando un gesto */
readonly hasPending = computed(() => this._pendingAudio() !== null);
```
> `playAndWait(type)` existente puede refactorizarse para reutilizar `playFileAndWait`.

**Autoplay**: si al empezar la ronda `hasPending()` es `true`, se muestra el botón 🔊 **pulsando** (ladder nivel 1 inmediato). El primer toque en cualquier sitio llama a `retryPendingAudio()` (ya existe en `place()`/`selectOption`).

---

### 5.3 Guion y claves de clips (P2)

**Módulo puro** `logic-blocks-narration.ts`:

```ts
export const clipForRule     = (round: Round): ClipKey[]  // consigna de la ronda
export const clipForQuestion = (attr: Attr): ClipKey      // "¿Esta figura es roja?"
export const clipForLabel    = (attr: Attr): ClipKey      // "Rojas"
export const CLIP_TEXT: Record<ClipKey, string>           // fuente del fallback TTS
```

**Inventario** (frases cortas, voz cálida y pausada; cada clip ≤ 4 s):

| Clave | Texto | Cuándo |
|---|---|---|
| `lb.one.color.red/blue/yellow` | "Lleva a la canasta todas las figuras **rojas / azules / amarillas**." | Inicio ronda modo `one` (regla de color) |
| `lb.one.shape.circle/square/triangle` | "Lleva a la canasta todos los **círculos / cuadrados / triángulos**." | Inicio ronda modo `one` (regla de forma) |
| `lb.two.generic` | "Pon cada figura en su canasta." | Inicio ronda modo `two` |
| `lb.label.color.red/blue/yellow` | "Rojas / Azules / Amarillas" | Tocar insignia/canasta |
| `lb.label.shape.circle/square/triangle` | "Círculos / Cuadrados / Triángulos" | Tocar insignia/canasta |
| `lb.q.color.red/blue/yellow` | "¿Esta figura es **roja / azul / amarilla**?" | Tras error (modo `one`) |
| `lb.q.shape.circle/square/triangle` | "¿Esta figura es un **círculo / cuadrado / triángulo**?" | Tras error (modo `one`) |
| `lb.q.which-looks` | "¿Con cuál se parece?" | Tras error (modo `two`) |
| `lb.go.tap` | "Ahora toca la canasta." | Figura seleccionada y sin destino (tap-to-place) |
| `lb.intro.look` | "¡Mira!" | Tutorial paso 1 |
| `lb.intro.now-you` | "Ahora tú." | Tutorial paso 3 |
| `lb.retry` | "Mmm… ¿lo pensamos otra vez?" | Comodín socrático |
| `lb.done` | "¡Todas están en su lugar!" | Ronda completa |
| *(Fase 4, 6 años)* `lb.venn.generic`, `lb.venn.both`, `lb.venn.none` | "Pon cada figura donde vive. En el medio, las que son de las dos." / "Las dos" / "Ni una ni otra" | Venn |

**Por qué frases completas y no concatenar fragmentos**: el español exige concordancia (*todas las figuras rojas* / *todos los círculos*) y la concatenación de clips suena entrecortada. El conjunto combinatorio es pequeño (6 reglas), así que se generan completas. El elogio reutiliza `audio/praise-*.wav` (ya registrados).

**Alcance de los clips de `size`**: `buildRound` solo usa la regla `size` en el diagrama de
Venn (6 años, nivel ≥ 7); para 4 años todas las figuras son `big` y la regla nunca es de tamaño.
Por eso **no hay clips `lb.one.size.*` / `lb.q.size.*`**, y `clipForRule` debe devolver `null`
—no una clave inexistente— ante un `Attr` de tamaño en los modos `one`/`two`. Los clips de
tamaño (`lb.venn.size.*`) son de la Fase 4.

**Nunca** hay un clip que diga "mal", "incorrecto" o "no es" (mismo criterio que `SOCRATIC_LINES` de `kanji-composition`; se valida con test, §8).

---

### 5.4 Producción de audio

**Opción recomendada**: **grabar la voz de papá o mamá** (vínculo afectivo, y la niña reacciona mejor a una voz conocida). Mientras tanto, **TTS como andamio**.

`tools/narration/logic-blocks.es.json` — fuente de verdad (`{ "lb.one.color.red": "Lleva a la canasta todas las figuras rojas.", ... }`).

`tools/narration/generate.py` (esqueleto con `edge-tts` + `ffmpeg`; ajusta voz/velocidad a gusto):

```python
import asyncio, json, pathlib, subprocess, edge_tts

VOICE = "es-MX-DaliaNeural"
manifest = json.load(open("tools/narration/logic-blocks.es.json", encoding="utf-8"))
out = pathlib.Path("public/audio/logic-blocks/es"); out.mkdir(parents=True, exist_ok=True)

async def main():
    for key, text in manifest.items():
        mp3 = out / f"{key}.mp3"
        await edge_tts.Communicate(text, VOICE, rate="-10%").save(str(mp3))
        subprocess.run(["ffmpeg", "-y", "-i", str(mp3), "-ar", "22050", "-ac", "1",
                        "-af", "loudnorm", str(out / f"{key}.wav")], check=True)
        mp3.unlink()

asyncio.run(main())
```

**Formato**: WAV mono 22.05 kHz, normalizado (`loudnorm`), ~30-60 KB por clip → ≈ 1.5 MB en total.

**PWA**: el grupo `game-audio` de `ngsw-config.json` cubre `/audio/**/*.wav` con
`installMode: "lazy"`, **no** `prefetch`. Consecuencias reales:

- El **primer** uso de cada clip necesita red (lo descarga y lo guarda en caché para siempre).
- A partir de la segunda sesión, todos los clips están disponibles offline.
- Si se quiere que estén offline **desde el primer arranque**, hay que subir el grupo a
  `prefetch`, lo que añade ≈1.5 MB a la descarga inicial. Decisión del padre; con `lazy`
  compensa, porque una niña que nunca ha jugado no necesita los clips.

> Corrección: una versión anterior de este documento afirmaba que ya estaban prefetcheados.
> No lo estaban.

---

### 5.5 `HintLadder` — escalera de ayuda (P4)

**Ruta**: `core/games/hint-ladder.ts`. **Lógica pura** (sin Angular) para poder probarla con `vitest` y un RNG/tiempo inyectado.

**Niveles**:

| Nivel | Disparo (4 años) | Efecto |
|---|---|---|
| **0** | Inicio de ronda | Narración automática de la consigna |
| **1** | Inactividad ≥ **8 s** **o** 1.er error | Repite la voz (consigna, o `lb.q.*` si fue error) + **pulsa** la insignia y el botón 🔊 |
| **2** | Inactividad ≥ **16 s** **o** 2.º error | Se **resaltan** (pulso suave) las figuras que cumplen la regla (modo `two`: una figura y su canasta) |
| **3** | Inactividad ≥ **24 s** **o** 3.er error | **Mano fantasma** con demo de una figura + **atenuar** (opacity .25) las que no cumplen (modo `one`) |

**Reglas**:
- El nivel **sube** por *max(inactividad, errores de esa figura/ronda)* y **baja a 0** tras una colocación correcta (se reinician temporizadores).
- Máximo **2 demos por ronda**; después, se mantiene el nivel 3 (sin repetir la mano) para no volverla pasiva.
- El temporizador de inactividad se reinicia con cualquier `pointerdown` / `pointermove` en el contenedor del juego.
- Para 6 años los umbrales son más largos (`[20 s, 40 s]`, sin nivel 3 de demo).

```ts
export interface LadderConfig {
  idleMs: readonly number[];
  maxDemos: number;
  /** Tope duro. Para 6 años es 2: no hay mano fantasma. */
  maxLevel: 0 | 1 | 2 | 3;
}
export const LADDER_BY_AGE: Record<4 | 6, LadderConfig> = {
  4: { idleMs: [8_000, 16_000, 24_000], maxDemos: 2, maxLevel: 3 },
  6: { idleMs: [20_000, 40_000, Infinity], maxDemos: 0, maxLevel: 2 },
};

export function levelFor(idleMs: number, wrongInStreak: number, cfg: LadderConfig): 0 | 1 | 2 | 3 {
  const byIdle = cfg.idleMs.filter(t => idleMs >= t).length;
  // El tope NO puede venir solo de `idleMs`: con 3 errores, `max(byIdle, wrongInStreak)`
  // llegaría a 3 aunque `idleMs` solo tenga 2 peldaños, y 6 años dispararía la mano
  // fantasma justo en el caso donde no debe (cuando más le cuesta).
  return Math.min(cfg.maxLevel, Math.max(byIdle, wrongInStreak)) as 0 | 1 | 2 | 3;
}
```

**En el componente** (`logic-blocks.ts`):
- `readonly ladder = signal<0|1|2|3>(0)`
- `readonly pulseBadge = computed(() => this.ladder() >= 1)`
- `readonly hintBlocks = computed(() => this.ladder() >= 2 ? blocksToPlace(this.round()).filter(b => this.placed()[b.id] === undefined) : [])`
- `readonly dimDistractors = computed(() => this.ladder() >= 3 && mode()==='one')`
- Timers con el `later()` existente (se cancelan solos en `ngOnDestroy`/`clearTimers`).

**Pregunta socrática tras un error** (sustituye al `hint()` de texto para 4 años):
- Modo `one`: `narrator.say(clipForQuestion(round.a))` + **pulso simultáneo** sobre la figura que acaba de intentar (`shakeId`, ya existe) y sobre la insignia → ella *compara* la figura con la muestra.
- Modo `two`: `lb.q.which-looks` + pulso en las dos insignias de canasta.
- El `hint()` de texto se mantiene **solo** para 6 años.

---

### 5.6 `GhostHand` — demostración (P3)

**Ruta**: `shared/game-ui/ghost-hand/`.

**Inputs**: `from: {x:number;y:number}`, `to: {x:number;y:number}`, `active: boolean`, `ghostEmoji?`/`ghostClass?` (el clon de la figura que viaja con la mano).

**Cálculo de coordenadas** (en el componente del juego, con `afterRenderEffect`, patrón de `kanji-compose`):

```ts
private readonly poolEls = viewChildren<ElementRef<HTMLElement>>('poolBlk'); // <span #poolBlk [attr.data-id]="b.id">
private readonly zoneEls = viewChildren<ElementRef<HTMLElement>>('zone');
private readonly host = viewChild<ElementRef<HTMLElement>>('container');

readonly demo = signal<{ from: Pt; to: Pt; blockId: number } | null>(null);

private measureDemo(blockId: number, region: Region): void {
  const root = this.host()!.nativeElement.getBoundingClientRect();
  const src  = this.poolEls().find(e => +e.nativeElement.dataset['id']! === blockId)!.nativeElement.getBoundingClientRect();
  const dst  = this.zoneEls().find(e => e.nativeElement.dataset['region'] === region)!.nativeElement.getBoundingClientRect();
  const c = (r: DOMRect) => ({ x: r.left + r.width / 2 - root.left, y: r.top + r.height / 2 - root.top });
  this.demo.set({ from: c(src), to: c(dst), blockId });
}
```
Como ambas medidas son relativas al contenedor, el resultado es válido aunque la página haga scroll.

**Animación** (CSS puro, sin librerías; el contenedor `.blocks-container` necesita `position: relative`):

```scss
.ghost-hand {
  position: absolute; left: 0; top: 0; pointer-events: none; z-index: 40;
  font-size: 2.6rem;
  animation: hand-drag 2.2s ease-in-out 2;          // se repite 2 veces
}
@keyframes hand-drag {
  0%   { translate: var(--x0) var(--y0); opacity: 0; scale: 1; }
  12%  { opacity: 1; }
  28%  { scale: .85; }                               // "presiona"
  75%  { translate: var(--x1) var(--y1); scale: .85; }
  90%  { scale: 1; opacity: 1; }
  100% { translate: var(--x1) var(--y1); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) { .ghost-hand { animation: none; opacity: .9; translate: var(--x1) var(--y1); } }
```

**Regla clave**: la demo se hace sobre un **clon visual**; **no** cambia `placed()` ni cuenta como acierto. Al terminar, `narrator.say('lb.intro.now-you')` y se devuelve el control.

**Qué figura se demuestra**: la primera de `hintBlocks()` que cumple la regla; en modo `two`, su canasta (`regionOf`). Se evita demostrar en venn para 4 años (no aplica).

---

### 5.7 Tutorial inicial en tres tiempos (P7)

**Servicio**: `core/games/tutorial-seen.service.ts`

```ts
@Service()
export class TutorialSeen {
  private readonly profile = inject(ProfileStateService);
  private readonly seen = signal<Record<string, true>>(load());       // localStorage 'brainyLearning_tutorialSeen'

  has(gameId: string, mode: string): boolean { /* clave: `${profileId}:${gameId}:${mode}` */ }
  mark(gameId: string, mode: string): void  { /* persiste */ }
  reset(gameId?: string): void              { /* para el laboratorio */ }
}
```
> **Ojo**: `LabProfileState` solo expone `activeProfile` y `activePlayerAge` (no `activeProfileId`). Usa `this.profile.activeProfile()?.id` y no `activeProfileId()`, o fallará en el laboratorio.

**Máquina de estados** en el componente: `tutorial = signal<'off' | 'look' | 'demo' | 'your-turn'>('off')`.

| Paso | Qué ocurre | Duración |
|---|---|---|
| `look` | Se atenúa todo salvo la **barra de regla**; suena la consigna (`clipForRule`), 🔊 pulsando | duración del audio + 0.5 s |
| `demo` | `lb.intro.look` → mano fantasma con **una** figura (sobre un clon) | ~4.5 s (2 pasadas) |
| `your-turn` | `lb.intro.now-you`; se quita el atenuado y arranca el juego | hasta que ella actúe |

**Reglas**:
- Se dispara en `generateRound()` si `age <= 4 && !tutorialSeen.has(GAME_ID, round.mode)` → **por modo**, así el cambio a "dos canastas" (nivel 8) también tiene su presentación.
- Cualquier `pointerdown` sobre una figura **cancela** el tutorial (`mark()` + paso a `your-turn`): si ya quiere jugar, que juegue.
- Se marca como visto al llegar a `your-turn`.
- El tutorial **no cuenta** para la racha ni para `wrongCount`.
- Tiempo total ≤ ~15-20 s (el reloj de 10 min por tema de `ThemeTimeService` sigue corriendo).

---

### 5.8 Cierre visual (P5)

| Elemento | Detalle | Aplica |
|---|---|---|
| **Ranuras fantasma** | En la canasta (modo `one`) se dibujan N círculos punteados = `blocksToPlace(round).length`; cada figura colocada ocupa una. Cuando se llenan, termina la ronda. Responde "¿cuántas faltan y cuándo acabo?" sin texto. | 4 años, modo `one`, niveles 1-5 |
| **Ejemplo ya colocado** (*worked example*) | La primera figura que cumple la regla **arranca ya dentro de la canasta**. La niña ve qué *tipo* de cosa va ahí. Se implementa en el componente (`placed.set({[seedId]: 'basket'})`), sin tocar `buildRound`; la comprobación de fin (`blocksToPlace(...).every(placed)`) sigue funcionando porque hay ≥ 2 figuras objetivo. | 4 años, modo `one`, niveles 1-2 |
| **Distractores se desvanecen** | Al completar la ronda, las figuras restantes del pool bajan a `opacity .25` (500 ms) → señal de "esas no iban". | 4 años, modo `one` |
| **Atenuar distractores** | Con `ladder === 3` (ver §5.5). | 4 años, modo `one` |

> Las ranuras revelan *cuántas* hay, no *cuáles*: la clasificación sigue siendo suya.

---

### 5.9 Errores de comprensión no penalizan (P6)

Estado nuevo: `instructionHeard = signal(false)`.

- Se pone a `false` en `generateRound()`.
- Pasa a `true` cuando `narrator.say(...)` resuelve `true`, **o** si la niña pulsa 🔊
  (repetición voluntaria).
- **Red de seguridad por tiempo**: un `later()` de 6 s la pone a `true` aunque la narración
  haya fallado (sin `.wav` y sin voz local, o el navegador bloqueó el audio por autoplay).

> **Por qué hace falta ese timeout.** Sin él, si la narración falla en silencio,
> `instructionHeard` se queda en `false` **para siempre** en esa ronda. Como `wrongCount` es lo
> único que rompe la racha, la consecuencia sería que *esa ronda es imposible de romper la
> racha* — un efecto secundario que nadie pidió. El timeout lo evita y mantiene el requisito
> real: que no se penalice el **no haber entendido**, no que no se pueda penalizar nunca.

- En `place()`:

```ts
if (regionOf(...) !== region) {
  if (this.instructionHeard()) this.wrongCount++;   // antes: siempre
  ...
}
```
- En `onRoundComplete()` el umbral `wrongCount >= 3 → recordIncorrect()` se mantiene, pero para 4 años solo cuentan errores **posteriores** al nivel 1 de ayuda de la escalera (un error que ya recibió pregunta socrática y demo no debería castigar la racha; decisión abierta, ver §11).

---

### 5.10 Cara de ánimo en vez de banner de texto (4 años)

Para `age <= 4` se oculta `<game-feedback>` y se muestra un indicador de emoji (solo visual, `aria-live="polite"` con el texto para lectores de pantalla):

| `feedbackState()` | Emoji |
|---|---|
| `idle` | 🧺 |
| `success` | 🌟 |
| `try-again` | 🤔 |
| `game-over` | 🏆 |

Esto evita que un banner con mucho texto compita visualmente con la insignia de regla. Para 6 años no cambia nada.

---

### 5.11 Ergonomía táctil

| Cambio | Valor actual | Para 4 años |
|---|---|---|
| `.blk` tamaño | `--size: 54px` | `68px` (pequeñas `44px`) |
| `.blk.placed` | `38px` | `44px` |
| `regionAt` margen de acierto `m` | `10` | `24` (más permisivo) |
| `.basket` `min-height` | `150px` | `190px` |
| Botón 🔊 | — | **64 × 64 px**, junto a la insignia |
| Vista previa de arrastre | por defecto | `cdkDragPreview` desplazado ~28 px **hacia arriba** del dedo para que no tape la figura |
| Tap-to-place | borde blanco | al seleccionar una figura: **pulsan** las canastas destino (+ `lb.go.tap` si pasan ≥ 4 s sin elegir) |

Usar una clase `.prereader` en `.blocks-container` (`[class.prereader]="isPreReader()"`) para variar los tamaños en SCSS sin duplicar reglas.

---

## 6. Comportamiento resultante por modo y nivel (4 años)

| Niveles | Modo | Apoyos activos |
|---|---|---|
| 1-2 | `one` · color (todas círculos) | Barra de regla + voz · **ejemplo ya colocado** · ranuras fantasma · tutorial la 1.ª vez · escalera completa |
| 3-4 | `one` · forma (mismo color) | Barra de regla + voz · ranuras fantasma · escalera completa (sin ejemplo ya colocado) |
| 5-7 | `one` · color o forma, 8 figuras | Barra de regla + voz · ranuras (solo hasta nivel 5) · escalera completa |
| 8-10 | `two` (2 canastas) | Insignia en **cada** canasta + `lb.two.generic` · tocar insignia dice la etiqueta · tutorial propio · escalera (demo con una figura y su canasta) |

---

## 7. Cambios concretos en `logic-blocks`

**`logic-blocks.html`** (esquema):

```html
<div #container class="blocks-container" [class.prereader]="isPreReader()">
  <!-- … header igual … -->
  <main class="game-board">
    @if (isPreReader()) {
      <div class="mood" [attr.data-state]="feedbackState()" aria-live="polite">{{ mood() }}</div>
    } @else {
      <game-feedback [state]="feedbackState()" [customMessages]="customFeedbackMessages" [customMessage]="idleMessage()" />
    }

    <!-- BARRA DE REGLA: visible a las DOS edades (ver §2.1).
         Solo a 4 años la insignia sustituye al texto. -->
    @if (mode() !== 'venn') {
      <section class="rule-bar">
        <button class="speak-btn" [class.pulse]="pulseBadge()" [class.speaking]="narrator.speaking()"
                (click)="repeatRule()" aria-label="Escuchar la consigna">🔊</button>
        @for (a of ruleAttrs(); track $index) {
          <rule-badge [attr]="a" [pulse]="pulseBadge()" (click)="speakLabel(a); $event.stopPropagation()" />
        }
        <span class="rule-arrow" aria-hidden="true">➜ 🧺</span>
      </section>
    }

    <!-- ZONAS: en 4 años la cabecera de canasta usa <rule-badge>, no texto -->
    <!-- POOL: <span #poolBlk [attr.data-id]="b.id" [class.hint]="hintIds().has(b.id)" [class.dim]="dim(b)" …> -->
    <!-- DEMO -->
    @if (demo(); as d) { <ghost-hand [from]="d.from" [to]="d.to" /> }
  </main>
</div>
```

**`logic-blocks.ts`** — incorporar: `narrator`, `ladder`, `instructionHeard`, `demo`, `tutorial`, `seed`, `hintBlocks`, `ruleAttrs()`, `repeatRule()`, `speakLabel()`, reinicio de inactividad en `(pointerdown)` del contenedor, y `narrator.cancel()` en `ngOnDestroy` **antes** de `audio.dispose()`.

**`generateRound()`** (orden):
1. `clearTimers()`, `narrator.cancel()`.
2. `round.set(buildRound(...))`; reset de `placed/selectedId/hint/wrongCount/ladder/instructionHeard`.
3. Si 4 años y niveles 1-2 modo `one`: colocar el **ejemplo** (`seed`).
4. Si `!tutorialSeen.has(...)` → `startTutorial()`; si no → `later(() => narrateRule(), 400)` y arrancar el temporizador de inactividad.

**Coordinación con el elogio**: `onRoundComplete` ya llama a `audio.playPraise()` y programa `generateRound()` a los 2.4 s; el clip de consigna arranca 0.4 s después → no se pisan. Al subir de nivel, `handleSessionEvent('level-up')` ya espera 2.5 s.

---

## 8. Pruebas

**Unitarias (`vitest`, lógica pura, RNG determinista `mulberry32` como el resto del repo)**:

| Test | Qué verifica |
|---|---|
| `narration.spec` | Toda combinación de `Attr` de **color (×3) y forma (×3)** tiene clave `one`/`q`/`label`; `clipForRule` existe para cada ronda de `buildRound(level, 4)` en los 10 niveles (300 iteraciones) |
| `narration.spec` | `clipForRule` devuelve `null` para un `Attr` de `size` en modo `one`/`two` (nunca una clave inexistente) |
| `narration.spec` | **Ninguna** frase de `CLIP_TEXT` contiene `incorrecto`, `está mal`, `mal hecho`, `no es`, `equivocado`, `fallaste` (misma lista prohibida que `kanji-composition.spec`) |
| `narration.spec` | El manifiesto `tools/narration/logic-blocks.es.json` y `CLIP_TEXT` tienen **las mismas claves y textos** (lee el JSON con `fs`) |
| `narration.spec` | **Los `.wav` en disco** → **no va aquí**: ver `tools/narration/verify.mjs` más abajo |
| `hint-ladder.spec` | `levelFor`: sube por inactividad, por errores y por el máximo de ambos; no supera `maxLevel` |
| `hint-ladder.spec` | **6 años con 3 errores se queda en nivel 2** (el tope `maxLevel`, no `idleMs`, es lo que impide la demo) |
| `hint-ladder.spec` | Tras éxito baja a 0; máximo 2 demos por ronda |
| `hint-ladder.spec` | Tocar la pantalla reinicia el reloj de inactividad **pero no borra los errores** |
| `tutorial-seen.spec` | Persistencia por `perfil:juego:modo`; `reset()` limpia; perfiles distintos no se pisan |
| `tutorial-seen.spec` | Si el almacenamiento no deja escribir, no lanza: se muestran tutoriales de más |
| `game-audio` (nuevo) | `playFileAndWait` resuelve `false` con archivo inexistente y no lanza |

#### Verificación de los ficheros de audio: `npm run voice:check`

Las pruebas que **leen el disco** no pueden vivir en un spec: el builder de test de Angular
compila sin los tipos de Node, así que ahí no hay `fs`. Y hace falta poder hacerlo, porque
un `.wav` que falta **no produce ningún error en la app** — `Narrator` cae al TTS, el TTS
puede no tener voz local (sobre todo sin red, que es como juegan ellas) y la niña simplemente
no oye nada. El fallo es invisible salvo que alguien mire.

`tools/narration/verify.mjs` (Node puro, salida con código 1 si falla) comprueba:

1. El manifiesto `logic-blocks.es.json` y `CLIP_TEXT` dicen **exactamente lo mismo**.
2. Ninguna frase contiene palabras prohibidas (`mal`, `incorrecto`, `no es`…).
3. Cada clave tiene su `.wav`, y cada `.wav` tiene su clave (los huérfanos son ~85 KB que se
   descargan para que nadie los escuche).
4. Ningún `.wav` está vacío o truncado.

#### RNG compartido

`mulberry32` estaba **duplicado en 7 specs**, cada copia con una variante del algoritmo. Dos
copias "parecidas" son la forma más fácil de tener un test que pasa por casualidad. Se exporta
desde `logic-blocks-problem.ts` y lo usan los specs que lo necesitan. Queda pendiente hacerlo
en los otros seis ficheros.

**Laboratorio** (patrón `coin-shop-lab` / `kanji-compose-lab`): crear `lab/logic-blocks` con `LabProfileState` + `LabProgress`, botones de edad, nivel, **"Reiniciar tutorial"** (`TutorialSeen.reset()`), selector de umbrales de la escalera (para probar los 24 s sin esperar) y la tabla de auditoría de narración por nivel. Recordar: la ruta va fuera de `games/` y con `devOnlyGuard`.

---

## 8b. Medición con tu hija (criterios de aceptación)

Instrumentación ligera por ronda en `localStorage` (`brainyLearning_lbMetrics`, máx. 200):

```ts
interface RoundMetric {
  profileId: string; level: number; mode: 'one'|'two'|'venn';
  timeToFirstMoveMs: number;
  maxLadderLevel: 0|1|2|3;
  demosShown: number;
  replaysOfVoice: number;       // veces que pulsó 🔊 por voluntad propia
  wrongAfterHeard: number;
  completed: boolean;
}
```

**Aceptación** (observando 5 sesiones):
1. Sin ayuda de adulto, completa la **primera ronda tras el tutorial** en ≤ 2 intentos.
2. `timeToFirstMoveMs` < 12 s a partir de la 3.ª ronda.
3. `maxLadderLevel` medio **baja** a < 1 a lo largo de las primeras 5 rondas (señal de que internalizó la mecánica).
4. Pulsa 🔊 por iniciativa propia (señal de que usa la voz como recurso).
5. Cero rondas en las que la racha se rompió por errores *antes* de oír la consigna.

---

## 9. Plan de implementación por fases

| Fase | Contenido | Resultado visible | Esfuerzo orientativo |
|---|---|---|---|
| **1 — MVP "se entiende"** | `_block-shapes.scss`, `RuleBadge`, barra de regla fija, `Narrator`, `playFileAndWait`, clips (TTS), `instructionHeard`, cara de ánimo, tamaños táctiles | Entiende la regla y la puede repetir | 1-1.5 días |
| **2 — "se corrige sola"** | `HintLadder`, preguntas habladas tras error, resaltado de figuras, atenuar distractores, ranuras fantasma, ejemplo ya colocado | Los errores guían en lugar de frustrar | 1-1.5 días |
| **3 — "se le enseña a jugar"** | `GhostHand`, tutorial en tres tiempos, `TutorialSeen`, laboratorio, tests | La mecánica se presenta, no se supone | 1 día |
| **4 — Extensión** | Audio opcional para 6 años (Venn), grabar voz de papá/mamá, `Narrator` en `coin-shop` / `space-fuel-tank` / `space-load-ship` (también tienen consignas solo-texto para 4 años) y `game-feedback` con botón 🔊 | Patrón reutilizable | 1-2 días |

---

## 10. Reutilización en otros juegos

El mismo problema existe en cualquier juego de 4 años cuya consigna sea un `idleMessage`:

| Juego | Consigna solo-texto |
|---|---|
| `coin-shop` (modo `count`) | `prompt` = "¿Cuántas manzanas hay?" |
| `space-fuel-tank` | `idleMessage` = "Llena el tanque justo hasta N" |
| `space-load-ship` | `idleMessage` = "¡Carga todos los cohetes en la nave!" |
| `paths-bridges` (modo `trail`) | "Lleva a la rana a su casa… sin pisar las líneas rojas" |

Propuesta: que `Narrator`, `GhostHand`, `HintLadder` y `TutorialSeen` queden **genéricos** (por eso viven en `core/games` y `shared/game-ui`), y que `game-feedback` acepte un input opcional `[narration]="clipKey"` que pinte un botón 🔊 persistente. Cada juego aporta solo su módulo `*-narration.ts` y sus clips.

---

## 11. Riesgos y decisiones abiertas

1. **Voz**: ya resuelto en la práctica — se generaron los 28 clips con `edge-tts`
   (`npm run voice`), y en la tablet son **offline de verdad** (van en el service
   worker), cosa que el TTS del navegador nunca garantiza. Verificado: en un entorno sin
   ninguna voz TTS disponible, los `.wav` suenan igual.
   Siguiente paso recomendado: **probar diez redacciones de una consigna** con las niñas y
   re-grabar solo la ganadora con la voz de la familia. El manifiesto y los `ClipKey` no
   cambian al re-grabar; basta con sustituir los `.wav`.
   ⚠️ `edge-tts` es un andamio: la voz es sintética y se nota. Para la familia es aceptable
   como borrador, no como versión final.
2. **Revelar el conteo (ranuras)**: facilita saber cuándo terminó pero da pista del número. Se limita a niveles 1-5; se puede desactivar con un flag si ves que se vuelve muleta.
3. **Ejemplo ya colocado vs. pureza Zvonkin**: es un *ejemplo resuelto*, no una respuesta a su pregunta; se retira desde el nivel 3. Si prefieres que no haya ejemplo, la demo con mano fantasma cumple la misma función.
4. **Umbral de errores tras ayuda**: ¿un error que ya recibió pregunta + demo debe romper la racha? Propuesta: no cuenta hasta que haya recibido al menos nivel 1 de ayuda. Ajustar con los datos de §8b.
5. **Autoplay del navegador**: la navegación desde el menú suele dar *user activation* suficiente; si no, el botón 🔊 pulsante + `hasPending` resuelven el caso. Probar en Safari/iPad (tablet es el dispositivo objetivo).
6. **Presupuesto de estilos**: `anyComponentStyle` avisa a 10 kB; con `_block-shapes.scss` compartido y un componente por insignia/mano no debería acercarse.
7. **Daltonismo** (colores rojo/azul/amarillo): son distinguibles, pero si más adelante se añaden verdes/naranjas, sumar un patrón (puntos/rayas) a la insignia de color.
8. **Reloj de tema (10 min)**: el tutorial consume ~15-20 s la 1.ª vez por modo; es aceptable, pero queda dicho.

---

## 11b. Estado de la implementación

Implementado y verificado en navegador (perfil de 4 años y de 6):

| Pilar | Estado |
|---|---|
| P1 Insignia de regla | Hecho. `RuleBadge`, 72 px (barra) / 52 px (canasta). La insignia y las figuras del tablero comparten `_block-shapes.scss` para que sean pixel-perfect iguales. |
| P2 Narración por voz | Hecho. `Narrator` + 28 clips generados + `playFileAndWait` + `SpeechService` de reserva. |
| P3 Mano fantasma | Hecho. `GhostHand`, sobre un clon, sin tocar `placed()`. |
| P4 Escalera de ayuda | Hecho. `HintLadder` con reloj inyectado. |
| P5 Cierre visual | Hecho. Ranuras fantasma y ejemplo ya colocado (niveles 1-2). El "distractor se desvanece al completar" queda pendiente. |
| P6 Errores de comprensión | Hecho, **con el timeout de 6 s** que faltaba (§5.9). |
| P7 Tutorial | Hecho. Tres pasos, por perfil y por modo, persistente. |

**Verificado en el navegador**: insignia a 72 px con el color de la regla; ranuras fantasma
marcando el ejemplo ya colocado; la escalera resalta **solo** las figuras que cumplen; la
mano fantasma interpola de (441,556) a (400,412) y repite; los `.wav` se sirven (`RIFF`,
139 KB) y suenan **con cero voces TTS disponibles**; el modo Venn de 6 años queda intacto.

**Pendiente**: laboratorio (§8), audio para Venn, y el `distractor se desvanece` de P5.

---

## 12. Resumen ejecutivo

Cambiar **qué canal lleva la consigna**: de un banner de texto efímero a **(a) una insignia visual fija + (b) voz repetible + (c) una demostración**, con una **escalera de ayuda** que se activa por inactividad o error, **ejemplos resueltos al inicio**, y **sin penalizar** los errores de comprensión. La mecánica de clasificación y el método Zvonkin quedan intactos; lo que se elimina es la barrera de la lectura.
