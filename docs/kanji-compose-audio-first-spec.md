# Spec técnica — "Construye el Kanji" **audio-first** (4 y 6 años)

> **Problemas reportados**
> - **4 años**: no lee hiragana/katakana, no lee en general, y el kanji **no suena desde el principio**, así que no puede asociar *imagen ↔ sonido*.
> - **6 años**: olvida parte del katakana, **no oye** el sonido del kanji y **no logra asociar rápido** kanji ↔ sonido.
>
> **Objetivo**: que cada kanji y cada pieza **suene siempre que aparece o se toca**, que el significado (emoji) y el sonido vayan **juntos con la forma**, que la lectura que ve la de 6 años sea **hiragana (una palabra que ya conoce)** y no katakana suelto, y que haya un paso de **recuperación** para fijar la asociación.

**Dependencia**: este spec reutiliza piezas definidas en `logic-blocks-prelectores-spec.md`: `Narrator`, `GameAudioService.playFileAndWait()`, `hasPending`, `HintLadder`, `GhostHand`, `TutorialSeen` y el patrón de manifiesto + script de TTS. Si aún no se implementaron, van primero (**Fase 0**, §12).

> **Corrección al spec anterior (laboratorios)**: los servicios `@Service()` son de raíz y **no ven** los stubs que el laboratorio declara en `providers` del componente (`LabProfileState`, `LabProgress`). Cualquier servicio nuevo que inyecte `ProfileStateService` (`TutorialSeen`, `SpacedRepetition`) debe **volver a declararse** en `providers` del componente de laboratorio para que use el perfil falso.

---

## 1. Diagnóstico: qué falla hoy en `kanji-compose`

| # | Dónde | Qué pasa | Efecto |
|---|---|---|---|
| 1 | `kanji-compose.ts` → `speak(kanji)` | Pasa el **carácter kanji** a `SpeechSynthesisUtterance` (`'明'`, `lang ja-JP/zh-CN`) | El motor del dispositivo decide la lectura (on/kun impredecible), y en Android puede no haber voz `ja-JP`. No es una palabra controlada. |
| 2 | `startComposing()` y `onComposed()` | Son los **únicos** momentos con sonido | En el paso **Historia** (donde aparece el kanji grande) **no suena nada**; tampoco al dibujar. Es exactamente lo que reportas. |
| 3 | `onDragEnded` / `onTap` / `place` / `pickBack` | Mover una pieza no produce sonido | Nunca asocia *pieza ↔ sonido* (el emparejamiento ocurre al tocar, y ahí hay silencio). |
| 4 | `kanji-composition.ts` → `reading` de los 13 compuestos | Son lecturas **on'yomi en katakana** (`メイ`, `キュウ`, `リン`, `ガン`…) | Es justo lo que la de 6 años olvida y lo que la de 4 no puede leer. Además **no es la palabra que ella conoce** (`あかるい`, `やすむ`, `はやし`). |
| 5 | `kanji-compose.html` → `reveal-reading`, `sibling-reading` | Esa lectura (o el pinyin) es el **único** canal de sonido | Sin audio ni hiragana. |
| 6 | `kanji-compose.html` → `story-text` | La historia (lo pedagógico) está solo en texto | Una pre-lectora se pierde la enseñanza. |
| 7 | `kanji-compose.html` → `tray-label` | Texto bajo cada pieza, para todas las edades | Ruido ilegible a los 4 años. Además `toTrayPiece()` **pierde** `reading/pinyin/meaning` al devolver una pieza a la bandeja. |
| 8 | `evaluate()` → `pickLine()` + `audio.playFailure()` | Las dudas socráticas son texto y se acompañan de un **zumbido de error** | Sin voz no hay pregunta; el zumbido es un veredicto (contradice Zvonkin). |
| 9 | `guide-bar` ("Soy Aki, de Planeta Sakura"), botones (`Ahora hazlo tú`, `Ver el dibujo →`, `Trazo`, `Borrar`, `¡Listo!`), `draw-hint` | Todo texto | Una pre-lectora no sabe qué hace cada botón. |
| 10 | Flujo Historia → Componer → Dibujar | **No hay ejercicio de recuperación** (oír ➜ elegir) | Se *muestra* la asociación pero nunca se *practica*; por eso a la de 6 años no le sale rápido. |
| 11 | `pickComposition()` | Aleatorio puro, **sin buffer de recientes ni repetición espaciada** | Puede repetir el mismo kanji dos veces seguidas y nunca vuelve a los que le costaron. |
| 12 | `game-feedback` | Solo muestra `customMessage` en estado `idle`; en `success` muestra mensajes base | Las líneas `complete` / `draw-done` **nunca se ven**; además `onComposed()` deja `localFeedback = 'success'` durante todo el paso de dibujo. |

---

## 2. Principios de diseño

1. **Sonido primero**: el sonido del kanji empieza ≤ 300 ms después de que aparece (estilo *flash* Doman: grande, claro, una sola vez, con alegría).
2. **El trío siempre junto**: **forma** (glifo) + **significado** (emoji) + **sonido** (voz). Si falta uno, se pierde la asociación.
3. **Palabra que conoce, no lectura erudita**: se enseña `あかるい`, `やすむ`, `はyashi`… (kun/palabra) en **hiragana**; el on'yomi en katakana pasa a ser **opcional y secundario**.
4. **Cada toque suena**: agarrar, soltar, tocar, devolver. No hace falta una UI extra.
5. **Katakana nunca solo**: si aparece, va con su hiragana encima (ruby) y se puede tocar para oír.
6. **Recuperar > releer**: un mini-ejercicio *oír → elegir* (o *ver → oír*) vale más que repetir la historia.
7. **Zvonkin**: ningún zumbido de error; el sistema pregunta, replaya el sonido y atenúa opciones; no dice "mal".
8. **Nunca mandar kanji al TTS**: el TTS japonés recibe **hiragana**; el español recibe texto sin emojis ni caracteres CJK.
9. **Repetir con memoria**: lo que ya sabe se resume; lo que le costó vuelve.

---

## 3. Visión de la solución (8 pilares)

| Pilar | Qué es | Resuelve # |
|---|---|---|
| **K1 Audio real por clip** | Clips `.wav` por kanji y por pieza (hiragana para TTS), narración de historias en español, voz para las preguntas socráticas | 1, 2, 5, 6, 8 |
| **K2 "Cine" de la Historia** | Secuencia automática con **karaoke**: suena el kanji → historia → cada pieza se ilumina mientras suena (japonés + significado en español) → suena otra vez el kanji | 2, 6 |
| **K3 Todo toque suena** | Al agarrar/soltar/tocar una pieza, al tocar el kanji grande y los hermanos, suena su palabra | 3 |
| **K4 UI sin texto a los 4 años** | Emoji + glifo + voz; botones solo con icono; guía con saludo hablado | 7, 9 |
| **K5 Hiragana primero, katakana con ayuda (6 años)** | `reading` pasa a hiragana; katakana on'yomi solo desde el nivel 5, con ruby y audio | 4, 5 |
| **K6 Paso de recuperación** | Nuevo paso `recall` entre Componer y Dibujar: oír→emoji (4 años), oír→kanji y ver→oír (6 años) | 10 |
| **K7 Repetición espaciada + recientes** | `SpacedRepetition.grade()` y `pickComposition` con memoria; la historia se acorta con cada exposición | 11 |
| **K8 Silueta de huecos + ayuda graduada** | Cada hueco muestra tenue su pieza (emparejamiento visual tipo puzzle) y reutiliza `HintLadder` / `GhostHand` | 3, 7 |

---

## 4. Cambios de datos (`kanji-composition.ts`)

### 4.1 Modelo

```ts
export interface KanjiPiece {
  id: string;            // NUEVO: nombre de archivo ('hi', 'tsuki', 'chiisai', 'hi-fire'…)
  kanji: string;
  reading: string;       // hiragana. Es lo que se muestra (6 años) Y el texto del TTS japonés
  pinyin: string;
  meaning: string;       // español visible
  meaningTts: string;    // NUEVO: español para TTS (sin paréntesis ni emojis)
  emoji: string;
}

export interface KanjiComposition {
  // … campos actuales …
  reading: string;       // CAMBIA: hiragana kun/palabra ('あかるい'). Antes: katakana on'yomi
  onyomi?: { kata: string; hira: string };   // NUEVO: { kata:'メイ', hira:'めい' } (opcional)
  meaningTts: string;    // NUEVO
  storyTts: string;      // NUEVO: la historia sin emojis ni kanji, lista para TTS
}
```

> Las claves del objeto `P` también se renombran: hoy hay `ko` (子) y `ko_` (小), que invitan a error. Usar `id` explícitos (`ko` = niño, `chiisai` = pequeño).

### 4.2 Compuestos (13) — lecturas a usar

| id | kanji | `reading` (hiragana, **audio y pantalla**) | `onyomi` (opcional, 6 años nivel ≥ 5) |
|---|---|---|---|
| mei | 明 | あかるい | メイ / めい |
| kyuu | 休 | やすむ | キュウ / きゅう |
| rin | 林 | はやし | リン / りん |
| iwa | 岩 | いわ | ガン / がん |
| otoko | 男 | おとこ | ダン / だん |
| koi | 好 | すき | コウ / こう |
| hon | 本 | ほん | *(igual que la palabra; omitir)* |
| sen | 尖 | とがる | セン / せん |
| en | 炎 | ほのお | エン / えん |
| hoshi | 星 | ほし | セイ / せい |
| miran | 看 | みる | カン / かん |
| mori | 森 | もり | シン / しん |
| go | 語 | ご | *(omitir)* |

> El on'yomi de 本 y 語 coincide con la palabra: no se duplica.

### 4.3 Piezas (20) — correcciones y campos nuevos

| id | kanji | `reading` | `meaningTts` | Nota |
|---|---|---|---|---|
| hi | 日 | ひ | sol | **homófono** de 火 → siempre se acompaña del significado |
| tsuki | 月 | つき | luna | |
| hito | 亻 | にんべん | persona | nombre del radical |
| ki | 木 | き | árbol | |
| yama | 山 | やま | montaña | |
| ishi | 石 | いし | piedra | |
| ta | 田 | た | campo de arroz | |
| chikara | 力 | ちから | fuerza | |
| onna | 女 | おんな | mujer | |
| ko | 子 | こ | niño | |
| ichi | 一 | いち | uno | |
| chiisai | 小 | **ちいさい** | pequeño | hoy es `ちい` (incompleto) |
| ookii | 大 | おおきい | grande | |
| hi-fire | 火 | ひ | fuego | **homófono** de 日 |
| sei | 生 | うまれる | nacer | |
| iu | 言 | **いう** | hablar | hoy es `い-う` (guion rompe el TTS y la vista) |
| itsutsu | 五 | いつつ | cinco | |
| kuchi | 口 | くち | boca | |
| te | 手 | て | mano | |
| me | 目 | め | ojo | |

**Homófonos (日/火 = ひ)**: el audio de pieza en modo historia es *japonés + significado en español* (`ひ… sol`, `ひ… fuego`) y el emoji lo refuerza (☀️/🔥). En el paso de recuperación **nunca** aparecen dos opciones con el mismo sonido.

### 4.4 Historias en versión TTS (`storyTts`)

Sin emojis ni kanji (un TTS español intentaría "leerlos"). De paso se corrige la etimología de 看.

| id | `storyTts` |
|---|---|
| mei | Cuando sale el sol y también está la luna, todo se ve clarísimo. Sol y luna juntos quieren decir: claro, luminoso. |
| kyuu | Una persona apoyada en un árbol: ¡así se descansa! El árbol sostiene a la persona. Por eso significa descansar. |
| rin | Un árbol solo es un árbol. Dos árboles juntos ya son un bosque pequeño. |
| iwa | Una montaña y una piedra. La piedra que vive en la montaña es una roca. |
| otoko | En el campo de arroz hace falta fuerza. El campo arriba y la fuerza abajo: el hombre que trabaja la tierra. |
| koi | Una mujer y su niño juntos. Esta pareja significa querer, o estar bien. |
| hon | Un árbol con una rayita en la base, justo donde nacen las raíces. La rayita señala la raíz: el origen. |
| sen | Lo pequeño encima de lo grande hace una punta afilada. Por eso significa puntiagudo. |
| en | Fuego encima de fuego. Los dos juntos arden más: una llama. |
| hoshi | El sol que ilumina y, debajo, algo que nace, como una planta. El sol viendo crecer la vida: una estrella brillando en el cielo. |
| miran | Una mano sobre los ojos, como cuando te tapas el sol para mirar de lejos. Eso es mirar. |
| mori | Tres árboles juntos: un bosque tan grande y profundo que parece un laberinto. |
| go | Hablar es una boca que dice un cinco. La boca que dice cinco forma una palabra. |

> `story` (texto con emojis) se conserva para la pantalla de 6 años; `storyTts` es solo para audio.

### 4.5 Hermanos (siblings)

`siblings` hoy trae `reading` en katakana (`マツ`, `ミ`, `リン`). Cambiar a hiragana: 末 `すえ`, 未 `まだ`, 林 `はやし`, y generar un clip por hermano (`kc.ja.sib.<…>`).

---

## 5. Audio

### 5.1 Reglas de contenido (importantes)

| Regla | Por qué |
|---|---|
| **TTS japonés = solo hiragana** (`/^[\u3040-\u309F\u30FC]+$/`) | Evita lecturas erróneas del kanji y garantiza la palabra que se quiere enseñar. |
| **TTS español = sin emojis ni CJK** | El motor intentaría pronunciarlos. |
| **Una voz por idioma** y la misma para todos los clips | Consistencia (el cerebro infantil asocia la "voz" con el idioma). |
| **Clips cortos** (≤ 4 s la historia, ≤ 1.2 s la palabra) | Cabe en el reloj de 10 min y mantiene la atención. |
| **Nunca** frases con "mal / incorrecto / no es / equivocado" | Mismo criterio que `SOCRATIC_LINES`. |
| Para la **voz de un familiar** | Se recomienda grabar (vínculo afectivo); TTS como andamio hasta entonces. |

### 5.2 Inventario de clips (japonés + español, ≈ 125)

| Namespace / clave | Cantidad | Idioma | Contenido |
|---|---|---|---|
| `kc.ja.k.<id>.word` | 13 | ja | Palabra hiragana del kanji (`あかるい`) |
| `kc.ja.k.<id>.on` | 11 | ja | On'yomi en hiragana (`めい`) — solo 6 años |
| `kc.ja.p.<pieceId>` | 20 | ja | Palabra de la pieza |
| `kc.ja.sib.<id>` | 3 | ja | Hermanos |
| `kc.es.k.<id>.meaning` | 13 | es | Significado ("claro, luminoso") |
| `kc.es.k.<id>.story` | 13 | es | `storyTts` |
| `kc.es.p.<pieceId>` | 20 | es | `meaningTts` ("sol", "luna"…) |
| `kc.es.line.<moment>.<n>` | 15 | es | 5 momentos × 3 frases de `SOCRATIC_LINES` (sin emojis) |
| `kc.es.sys.*` | ~14 | es | Ver abajo |
| `kc.sfx.hmm` | 1 | sfx | Sonido suave de "¿mmm?" (reemplaza al zumbido) |
| *(Fase 4)* `kc.zh.k.<id>`, `kc.zh.p.<pieceId>` | 33 | zh | Dragón 🐉 (zh-CN) |

**Frases de sistema (`kc.es.sys.*`)**

| Clave | Texto |
|---|---|
| `greeting.aki` | "¡Hola! Soy Aki, del Planeta Sakura. ¡Vamos a construir un kanji!" |
| `greeting.long` | "¡Hola! Soy Long, del Planeta Dragón. ¡Vamos a construir un carácter!" |
| `look-ghost` | "Mira el dibujo borroso. ¿Qué piezas necesitas?" |
| `which-piece` | "¿Qué pieza va en cada hueco? Puedes probar." |
| `now-you` | "Ahora tú." |
| `recall-hear` | "Escucha. ¿Cuál es?" |
| `recall-see` | "Mira. ¿Cómo suena?" |
| `recall-again` | "Escucha otra vez." |
| `draw-now` | "Ahora dibújalo tú." |
| `draw-empty` | "Dibuja con el dedo, aunque sea una línea." |
| `done` | "¡Lo conseguiste!" |
| `siblings` | "¡Mira! Con las mismas piezas salen otros kanji." |
| `again` | "¡Otra vez!" |
| `next` | "Vamos con otro." |

### 5.3 Manifiesto (fuente de verdad)

`tools/narration/kanji-compose.json`:

```json
{
  "kc.ja.k.mei.word":  { "lang": "ja-JP", "tts": "あかるい" },
  "kc.ja.k.mei.on":    { "lang": "ja-JP", "tts": "めい" },
  "kc.ja.p.hi":        { "lang": "ja-JP", "tts": "ひ" },
  "kc.es.p.hi":        { "lang": "es-MX", "tts": "sol" },
  "kc.es.k.mei.story": { "lang": "es-MX", "tts": "Cuando sale el sol y también está la luna, todo se ve clarísimo. Sol y luna juntos quieren decir: claro, luminoso." },
  "kc.es.sys.now-you": { "lang": "es-MX", "tts": "Ahora tú." }
}
```

`tools/narration/generate.py` (amplía el del spec anterior; voz por idioma):

```python
import asyncio, json, pathlib, subprocess, edge_tts

VOICES = {"es-MX": "es-MX-DaliaNeural", "ja-JP": "ja-JP-NanamiNeural", "zh-CN": "zh-CN-XiaoxiaoNeural"}
manifest = json.load(open("tools/narration/kanji-compose.json", encoding="utf-8"))
out = pathlib.Path("public/audio/kanji-compose"); out.mkdir(parents=True, exist_ok=True)

async def main():
    for key, spec in manifest.items():
        mp3, wav = out / f"{key}.mp3", out / f"{key}.wav"
        if wav.exists(): continue                                   # idempotente
        await edge_tts.Communicate(spec["tts"], VOICES[spec["lang"]], rate="-10%").save(str(mp3))
        subprocess.run(["ffmpeg", "-y", "-i", str(mp3), "-ar", "22050", "-ac", "1",
                        "-af", "loudnorm", str(wav)], check=True)
        mp3.unlink()

asyncio.run(main())
```

**Ruta de archivos**: plana → `public/audio/kanji-compose/<clave>.wav` (`audio/kanji-compose/kc.ja.k.mei.word.wav`). `ngsw-config.json` ya cubre `/audio/**/*.wav`.

**Reutilización de audio existente**: `ki`, `yama`, `hi`, `tsuki`, `hi-fire` ya tienen `.wav` en `audio/japanese/` (vocabulario). Pueden reutilizarse como `kc.ja.p.*` **solo si** la voz coincide con la que se genere; si no, regenerar todo con la misma voz.

### 5.4 Cambios en `GameAudioService` y `Narrator`

```ts
// GameAudioService (además de playFileAndWait / hasPending del spec anterior)
/** Calienta clips para que suenen al instante (sin latencia de red) */
preload(paths: string[], volume = 0.85): void {
  for (const raw of paths) {
    const path = this._resolve(raw);
    if (!this._audioCache.has(path)) {
      const a = new Audio(path); a.preload = 'auto'; a.volume = volume * this._masterVolume();
      this._audioCache.set(path, a);
    }
  }
}
```

```ts
// Narrator: manifiesto con idioma (para el fallback TTS) + secuencias con cues
export interface ClipSpec { tts: string; lang: 'es-MX' | 'ja-JP' | 'zh-CN'; }
export interface Cue<T = unknown> { clip: ClipKey; tag?: T; pauseAfterMs?: number; }

Narrator.configure(manifest: Record<ClipKey, ClipSpec>, pathOf: (k: ClipKey) => string): void;
Narrator.play<T>(cues: Cue<T>[], onCue?: (c: Cue<T> | null) => void): Promise<boolean>;
```

- `play()` recorre los cues; antes de cada uno invoca `onCue(cue)` (para el karaoke) y al final `onCue(null)`.
- Cualquier `say()`/`play()`/`cancel()` posterior **invalida** la secuencia en curso (token `seq`), así que si ella toca algo, la narración se corta limpia.
- Fallback TTS: usa `ClipSpec.lang` y `ClipSpec.tts` (**para `ja-JP`, el hiragana**, nunca el kanji).

### 5.5 Precarga y desbloqueo de audio

- **Precarga**: al crear el problema, `audio.preload(clipsForProblem(p))` (kanji, piezas, historia, opciones del recall) para que el primer sonido sea inmediato (≤ 300 ms).
- **Puerta de inicio** (`StartGate`): al entrar, una tarjeta con el guía (🤖/🐉) y un botón enorme **▶** (sin texto). Al tocarlo: `audio.retryPendingAudio()` + `kc.es.sys.greeting.aki|long` + empieza la primera ronda. Garantiza el gesto de usuario que iOS/Safari exigen para el audio, y da el saludo hablado que sustituye al texto "Soy Aki…". Se muestra **una vez por entrada al juego**. El laboratorio la omite con `[autoStart]`.

---

## 6. Flujo nuevo, paso por paso

```
StartGate → [warm-up de repaso*] → HISTORIA → COMPONER → RECUPERAR (nuevo) → DIBUJAR → (hermanos) → reflexión (6a)
                *Fase 3: 1 pregunta de un kanji "vencido" según la repetición espaciada
```

### 6.1 Perfil de narración por edad

| | **4 años** | **6 años** |
|---|---|---|
| Sonido del kanji al aparecer | ✅ automático | ✅ automático |
| Historia | **narrada** (clip español) | texto + botón 🔊 (no auto) |
| Piezas en la historia | karaoke: japonés + significado | karaoke: solo japonés |
| Lectura visible | **ninguna** (emoji + glifo) | **hiragana** siempre; katakana (ruby) solo nivel ≥ 5 |
| Etiqueta en bandeja | ninguna | hiragana |
| Botones | solo icono | icono + texto corto |
| Dudas socráticas | **voz** | voz + texto |
| Recuperación | oír → emoji (2 opciones) | oír → kanji (3), y desde nivel 5 ver → oír (3) |

### 6.2 Paso 1 — Historia ("cine" con karaoke)

Secuencia **automática** (pura: `storyCues()`), con `tag` para iluminar el elemento que suena:

| Modo | Secuencia |
|---|---|
| `full` (4 años, 1.ª vez) | ① `kc.ja.k.<id>.word` *(ilumina kanji)* → ② `kc.es.k.<id>.story` → ③ por cada hueco: `kc.ja.p.<pieza>` + `kc.es.p.<pieza>` *(ilumina pieza i)* → ④ `kc.ja.k.<id>.word` otra vez *(ilumina kanji)* → ⑤ `kc.es.sys.now-you` |
| `full` (6 años, 1.ª vez) | ① `word` *(kanji)* → ② piezas solo en japonés → ③ `word` otra vez *(el texto de la historia lo lee ella; 🔊 opcional)* |
| `short` | `word` → piezas en japonés → `word` |
| `skip` | solo `word` (el kanji suena y pasa) |

**Interfaz (4 años)**: el kanji **muy grande** (≥ 7 rem) con su **emoji** debajo; sin texto de lectura ni significado; piezas como tarjetas (glifo + emoji) que **se iluminan** cuando suenan; botón principal **🤲 ▶** (sin texto) que corta la narración y pasa a Componer; botón **🔊** para repetir.

**Interfaz (6 años)**: `reading` en hiragana grande (`あかるい`), significado, texto de la historia, y — solo con nivel ≥ 5 — una "píldora" `<ruby>メイ<rt>めい</rt></ruby>` tocable.

```ts
export type Highlight = { kind: 'kanji' } | { kind: 'piece'; index: number };

export function storyCues(c: KanjiComposition, o: { age: 4|6; mode: 'full'|'short'|'skip' }): Cue<Highlight>[] {
  const word: Cue<Highlight> = { clip: `kc.ja.k.${c.id}.word`, tag: { kind: 'kanji' }, pauseAfterMs: 250 };
  if (o.mode === 'skip') return [word];
  const pieces = c.slots.flatMap((s, i): Cue<Highlight>[] => {
    const id = pieceData(s.kanji).id, tag = { kind: 'piece', index: i } as const;
    return o.age === 4 && o.mode === 'full'
      ? [{ clip: `kc.ja.p.${id}`, tag }, { clip: `kc.es.p.${id}`, tag, pauseAfterMs: 200 }]
      : [{ clip: `kc.ja.p.${id}`, tag, pauseAfterMs: 200 }];
  });
  const story: Cue<Highlight>[] = o.age === 4 && o.mode === 'full' ? [{ clip: `kc.es.k.${c.id}.story` }] : [];
  return [word, ...story, ...pieces, word, ...(o.age === 4 && o.mode === 'full' ? [{ clip: 'kc.es.sys.now-you' }] : [])];
}
```

### 6.3 Paso 2 — Componer (cada toque suena)

| Evento | Sonido |
|---|---|
| Agarrar una pieza (`cdkDragStarted`) o tocarla en la bandeja | `kc.ja.p.<pieza>` |
| Soltarla en un hueco (`place`) | `kc.ja.p.<pieza>` (otra vez: refuerzo) |
| Devolver una pieza (`pickBack`) | `kc.ja.p.<pieza>` |
| Compuesto armado (`onComposed`) | `kc.ja.k.<id>.word` → `kc.es.line.complete.<n>` |
| Duda (piezas incorrectas / orden) | `kc.sfx.hmm` (suave) → `kc.es.line.<momento>.<n>` |
| Inicio del paso | `kc.es.sys.look-ghost` (guiado) o `which-piece` (sin guía) |

- **Se elimina `audio.playFailure()`** en `evaluate()`: es un zumbido de error. Se sustituye por `kc.sfx.hmm`.
- **Silueta de huecos (K8)**: cuando `problem().showGhost` es `true` (4 años y 6 años niveles 1-4), cada hueco muestra **su pieza correcta a ~18 % de opacidad** en lugar del `?`. Es emparejamiento visual por forma (rompecabezas), no lectura.
- **Bandeja 4 años**: glifo (2.2 rem) + **emoji grande** (1.8 rem), **sin label**. **6 años**: glifo + `reading` en hiragana. Arreglar `toTrayPiece()` para reconstruir con `pieceData(kanji)`.
- **Escalera de ayuda** (`HintLadder` del spec anterior), solo si hay inactividad: 8 s → repetir el sonido del kanji y pulsar la bandeja · 16 s → resaltar una pieza correcta y su hueco · 24 s → `GhostHand` con una pieza. Umbrales ya definidos por edad.

### 6.4 Paso 3 — Recuperar (nuevo, `recall`)

**Qué es**: una pregunta corta que **practica** la asociación. No hay timer ni presión.

| Variante | Edad / nivel | Presentación | Respuesta |
|---|---|---|---|
| `sound-to-emoji` | 4 años | Suena la palabra; botón 🔊 grande | Tocar el **emoji** correcto (**2** opciones) |
| `sound-to-kanji` | 6 años, nivel < 5 | Suena la palabra | Tocar el **kanji** correcto (**3** opciones) |
| `kanji-to-sound` | 6 años, nivel ≥ 5 | Kanji grande en pantalla | **3 botones 🔊**: tocar uno **reproduce** esa lectura y *es* la respuesta |

**Comportamiento socrático**:
- Acierto: `praise` + vuelve a sonar la palabra con el kanji pulsando.
- Fallo: la opción se **atenúa**, se replaya el sonido del objetivo (`kc.es.sys.recall-again`) y puede volver a intentar. **No** rompe la racha de la sesión. Se registra el **primer intento** (`FirstAttemptGuard` ya existe).
- Los distractores **nunca** comparten sonido con el objetivo (evita `日`/`火`).

```ts
export type RecallVariant = 'sound-to-emoji' | 'sound-to-kanji' | 'kanji-to-sound';
export interface RecallOption { id: string; kanji: string; emoji: string; clip: ClipKey; }
export interface RecallQuestion {
  variant: RecallVariant; target: KanjiComposition; options: RecallOption[]; correctIndex: number;
}
export function buildRecall(
  target: KanjiComposition, age: number, level: number,
  pool: readonly KanjiComposition[], rng: Rng = Math.random,
): RecallQuestion;
```

**Elección de distractores**: 4 años → de otro **layout** y otro emoji (muy distintos). 6 años nivel < 5 → cualquiera de otro sonido. 6 años nivel ≥ 5 → del **mismo layout** (más parecidos: 林 / 炎 / 明), que es lo que exige una asociación rápida y precisa.

**Registro**: `SkillProgressService.recordAttempt({ skillId: 'japanese.kanji.compose', contentId: id, representation: 'audio', correct, … })` y `SpacedRepetition.grade(...)` (§7.3).

### 6.5 Paso 4 — Dibujar

- Al abrir el paso: `kc.es.sys.draw-now` y después `kc.ja.k.<id>.word`.
- 4 años: botones **solo icono** (`↩️`, `🧽`, `✅`, `🙈`), sin textos "Trazo/Borrar/¡Listo!/sin pista".
- Al terminar (`finishDrawing`): suena otra vez la palabra y luego el elogio.
- Si no hay trazos: `kc.es.sys.draw-empty` (voz) en lugar del texto.

### 6.6 Hermanos (6 años: 本, 森)

El overlay muestra cada hermano con su **hiragana** y, al tocarlo, suena (`kc.ja.sib.*`). Al abrirse suena `kc.es.sys.siblings` + `kc.es.line.sibling-discovery.<n>`.

---

## 7. Piezas técnicas

### 7.1 Visualización de lecturas

```html
<!-- 6 años: hiragana siempre; katakana solo con ayuda y tocable -->
<span class="reveal-reading">{{ t.reading }}</span>
@if (showOnyomi() && t.onyomi; as on) {
  <button class="onyomi" (click)="hear('kc.ja.k.' + t.id + '.on')">
    <ruby>{{ on.kata }}<rt>{{ on.hira }}</rt></ruby>
  </button>
}
```

```ts
readonly showOnyomi = computed(() => !this.isPreReader() && this.currentLevel() >= 5);
readonly isPreReader = computed(() => (this.activeProfile()?.age ?? 6) <= 4);
```

### 7.2 Karaoke

```ts
readonly cue = signal<Cue<Highlight> | null>(null);
private async playStory(): Promise<void> {
  const cues = storyCues(this.target()!, { age: this.age(), mode: this.storyMode() });
  await this.narrator.play(cues, c => this.cue.set(c));
}
```

```scss
.speaking { animation: speak-pulse .55s ease-in-out infinite alternate;
            box-shadow: 0 0 0 4px var(--accent), 0 0 24px var(--accent); }
@keyframes speak-pulse { to { transform: scale(1.08); } }
@media (prefers-reduced-motion: reduce) { .speaking { animation: none; } }
```

### 7.3 Repetición espaciada (`SpacedRepetition`)

El servicio ya guarda `ItemMemory { box, introducedAt, lastSeenAt, dueAt }` pero solo usa `introducedAt`. Se amplía mínimamente (Leitner):

```ts
export const KANJI_COMPOSE_DECK = 'kanji-compose';
const INTERVALS_MS = [0, 10 * 60_000, 24 * 3_600_000, 3 * 86_400_000, 7 * 86_400_000]; // box 1..5

grade(deck: string, itemId: string, correct: boolean): void;        // box ±1 (mín. 1, máx. 5), recalcula dueAt
dueIds(deck: string, ids: readonly string[]): string[];             // introducidos con dueAt <= now
boxOf(deck: string, itemId: string): number;                        // 0 = no visto
```

**`storyMode` (por kanji)**: `boxOf = 0` → `full` · `1-2` → `short` · `≥ 3` → `skip`. Reduce fricción y respeta lo que ya sabe.

### 7.4 Elección del kanji con memoria

```ts
export interface PickMemory { due: readonly string[]; recent: readonly string[]; }

export function pickComposition(level: number, age: number, rng: Rng = Math.random, memory?: PickMemory): KanjiComposition {
  const pool = poolFor(age, clampLevel(level));
  let candidates = pool.filter(id => !memory?.recent.includes(id));
  if (candidates.length === 0) candidates = [...pool];
  const due = candidates.filter(id => memory?.due.includes(id));
  if (due.length > 0 && rng() < 0.5) candidates = due;         // 50 %: repasar lo vencido
  return BY_ID.get(candidates[Math.floor(rng() * candidates.length)]!)!;
}
```

`buildCompositionProblem(level, age, rng, memory?)` reenvía `memory`; los tests actuales (3 parámetros) siguen válidos. El componente mantiene un buffer `recent` de 2 ids (patrón de `ListeningGameEngine`).

### 7.5 Estado nuevo del componente

```ts
type Step = 'story' | 'compose' | 'recall' | 'draw';
readonly started = signal(false);                       // StartGate
readonly storyMode = signal<'full'|'short'|'skip'>('full');
readonly cue = signal<Cue<Highlight> | null>(null);
readonly recall = signal<RecallQuestion | null>(null);
readonly recallWrong = signal<number[]>([]);
readonly recallDone = signal(false);
private recallFirstTry = true;
```

`onComposed()` ya no deja `localFeedback = 'success'` hasta el dibujo: pasa a `recall` (y a `draw` cuando el recall termina); `success` solo se marca en `finishProblem()`. Para 4 años el banner se sustituye por una **cara de ánimo** (🧩 / 🤔 / 🌟 / 🏆), como en el spec del Clasificador. Para 6 años, `line()` se pinta en un elemento propio (`.socratic-line`) y **no** a través de `game-feedback` (que solo muestra `customMessage` en `idle`).

---

## 8. Cambios en archivos

```
src/app/
├─ core/games/
│  ├─ narrator.service.ts            [MOD/NUEVO]  ClipSpec + play(cues) (si no se hizo en el spec anterior)
│  ├─ game-audio.service.ts          [MOD]        + preload(), + playFileAndWait(), + hasPending
│  └─ (hint-ladder, tutorial-seen)   [reuso]
├─ core/learning/
│  ├─ kanji-composition.ts           [MOD]  ids, reading→hiragana, onyomi, meaningTts, storyTts, pickComposition(memory)
│  ├─ kanji-narration.ts             [NUEVO] storyCues(), clipsForProblem(), claves y paths (puro)
│  ├─ kanji-recall.ts                [NUEVO] buildRecall() (puro)
│  └─ spaced-repetition.ts           [MOD]   + grade(), dueIds(), boxOf()
├─ features/games/japanese/kanji-compose/
│  └─ kanji-compose.{ts,html,scss}   [MOD]  StartGate, cine, recall, sonido en cada toque, UI sin texto (4a), ruby (6a)
├─ features/dev/kanji-compose-lab/   [MOD]  providers: SpacedRepetition + TutorialSeen; [autoStart]; verificación de clips
public/audio/kanji-compose/*.wav    [NUEVO] ≈125 clips
tools/narration/kanji-compose.json  [NUEVO] manifiesto
tools/narration/generate.py         [NUEVO/MOD] voz por idioma
```

**Plantilla — Historia (esquema, 4 años)**:

```html
@if (step() === 'story' && target(); as t) {
  <div class="story" [class.prereader]="isPreReader()">
    <button class="reveal" [class.speaking]="cue()?.tag?.kind === 'kanji'" (click)="hearKanji()">
      <span class="reveal-kanji">{{ t.kanji }}</span>
      <span class="reveal-emoji">{{ t.emoji }}</span>
      @if (!isPreReader()) { <span class="reveal-reading">{{ t.reading }}</span> }
    </button>

    @if (!isPreReader()) {
      <p class="story-text">{{ t.story }}</p>
      <button class="mini-btn" (click)="playStory()">🔊</button>
    }

    <div class="story-pieces">
      @for (slot of t.slots; track $index) {
        <button class="story-piece" [class.speaking]="cue()?.tag?.kind === 'piece' && cue()!.tag.index === $index"
                (click)="hearPiece(slot.kanji)">
          <span class="piece-kanji">{{ slot.kanji }}</span><span class="piece-emoji">{{ emojiOf(slot.kanji) }}</span>
        </button>
      }
    </div>
  </div>
  <button class="main-btn go" (click)="startComposing()">@if (isPreReader()) { 🤲 ▶ } @else { Ahora hazlo tú 🤲 }</button>
}
```

---

## 9. Hallazgos adicionales (conviene arreglarlos de paso)

1. `toTrayPiece()` devuelve `reading/pinyin/meaning` vacíos → usar `pieceData(kanji)`.
2. `onComposed()` pone `localFeedback = 'success'` ~2 s antes de que termine el dibujo; el banner celebra durante todo el paso 3.
3. `game-feedback` ignora `customMessage` salvo en `idle`; las líneas `complete` y `draw-done` nunca se muestran.
4. `evaluate()` reproduce `playFailure()` (zumbido): contradice el método socrático.
5. Datos: `ちい` → `ちいさい`, `い-う` → `いう`.
6. `siblings` con katakana → hiragana + audio.
7. 語 (japonés) ≠ 语 (chino simplificado): para el mundo Dragón (`zh-CN`) el glifo y el TTS deben usar la forma simplificada; el resto de los 13 coincide.
8. El juego (`GAME_ID = 'japanese-kanji-compose'`) **no está** todavía en `JAPANESE_GAMES` ni en `app.routes.ts` (solo la ruta de laboratorio): registrarlo al terminar, con `cssClass`, desbloqueo y `minAge: 4`.
9. `pickComposition` puede repetir el mismo kanji dos veces seguidas (resuelto con `recent`).

---

## 10. Pruebas y laboratorio

**Unitarias (`vitest`, RNG determinista `mulberry32`)**

| Archivo | Verifica |
|---|---|
| `kanji-narration.spec` | `storyCues()` por edad × modo: ordena `word → … → word`, solo `full` de 4 años lleva historia y significado, `skip` devuelve 1 cue, todas las claves existen en el manifiesto |
| `kanji-narration.spec` | **Manifiesto**: `ja-JP` solo hiragana (`/^[\u3040-\u309F\u30FC]+$/`); `es-MX` sin emojis (`\p{Extended_Pictographic}`) ni CJK; sin palabras prohibidas (`mal`, `incorrecto`, `equivocad`, `no es`) |
| `kanji-narration.spec` | Cada composición y pieza tiene sus claves (`word`, `on` si procede, `p`, `meaning`, `story`) y su `.wav` en `public/audio/kanji-compose/` (con `fs`) |
| `kanji-composition.spec` (ampliar) | `reading` de compuestos y piezas es hiragana sin guiones; `onyomi.kata` es katakana y `onyomi.hira` hiragana equivalente; `id` de pieza único |
| `kanji-recall.spec` | Opciones únicas, objetivo incluido, **2** (4a) / **3** (6a), variante correcta por edad/nivel, **sin homófonos** del objetivo, 6a nivel ≥ 5 usa mismo layout cuando hay |
| `spaced-repetition.spec` (ampliar) | `grade` sube/baja de caja con topes 1-5; `dueIds` respeta `dueAt`; `boxOf` = 0 sin registro |
| `pickComposition.spec` | Nunca devuelve un id de `recent` si hay alternativa; con `due` y `rng < 0.5` elige un vencido; 3 parámetros siguen funcionando |

**Laboratorio (`lab/kanji-compose`)**: añadir (a) `providers: [SpacedRepetition, TutorialSeen]` (ver nota inicial), (b) `[autoStart]` en `<kanji-compose>`, (c) columnas "clips ✅/❌" en la auditoría por kanji (comprobación `fetch(path, { method: 'HEAD' })`), (d) botón "Reiniciar memoria" (`SpacedRepetition` + `TutorialSeen`), (e) selector de `storyMode` para forzar `full/short/skip`.

---

## 11. Medición (con tus hijas)

Registro ligero por ronda (`localStorage: brainyLearning_kcMetrics`, máx. 200):

```ts
interface KanjiRoundMetric {
  profileId: string; kanjiId: string; level: number; age: 4|6;
  storyMode: 'full'|'short'|'skip';
  audioTapsByChild: number;           // veces que tocó 🔊, el kanji o una pieza por iniciativa propia
  timeToFirstPlaceMs: number;
  recallVariant: RecallVariant; recallFirstTry: boolean; recallMs: number;
  ladderMax: 0|1|2|3;
}
```

**Criterios de aceptación** (5 sesiones):
1. **4 años**: tras 3 exposiciones a un kanji, elige el emoji correcto por sonido **≥ 80 % a la primera**.
2. **4 años**: toca el audio por iniciativa propia (`audioTapsByChild` > 0 en ≥ 50 % de las rondas).
3. **6 años**: `kanji-to-sound` **≥ 70 %** a la primera en kanji vistos ≥ 3 veces, y `recallMs` mediano **decreciente** (objetivo < 6 s).
4. **6 años**: en > 80 % de las rondas el texto visible es hiragana (no depende del katakana); si abre el ruby, lo toca para oírlo.
5. Cero rondas con un zumbido de error (`playFailure`) en el paso Componer.

---

## 12. Plan por fases

| Fase | Contenido | Resultado visible | Esfuerzo orientativo |
|---|---|---|---|
| **0 — Cimientos** *(si no existen)* | `Narrator` con `ClipSpec`/`play(cues)`, `playFileAndWait`, `hasPending`, `preload`, script TTS por idioma | Infraestructura de voz | 0.5-1 día |
| **1 — "Que suene"** | Datos (ids, hiragana, `meaningTts`, `storyTts`), manifiesto + clips, `StartGate`, **cine con karaoke**, sonido en cada toque (agarrar/soltar/tocar/devolver), reemplazar `speak()`, UI sin texto a los 4 años, hiragana (no katakana) a los 6, quitar `playFailure` | Kanji y piezas suenan desde el principio | 1.5-2 días |
| **2 — "Que se asocie"** | Silueta de huecos, bandeja con emoji, paso `recall` (3 variantes), voces socráticas, `kc.sfx.hmm`, ruby de katakana (6a, nivel ≥ 5), arreglos de §9 | Practica oír ↔ ver | 1.5-2 días |
| **3 — "Que se recuerde"** | `SpacedRepetition.grade/dueIds/boxOf`, `pickComposition(memory)`, `storyMode` adaptativo, warm-up de repaso, `HintLadder`/`GhostHand`, métricas | Vuelve lo que le costó; se acorta lo que sabe | 1-1.5 días |
| **4 — Extensión** | Mundo Dragón (zh-CN, 語/语, pinyin opcional), hermanos con audio, puente a katakana (SRS de on'yomi), voz de papá/mamá, registrar el juego en menú y rutas | Los dos mundos y el juego en producción | 2 días |

---

## 13. Riesgos y decisiones abiertas

1. **Lectura "kun" vs "on"**: se prioriza la palabra conocida (kun/palabra). Si prefieres enseñar on'yomi como lectura principal en el futuro, el modelo ya lo soporta (`onyomi`), pero habría que usarlo también en el audio.
2. **Duración de la historia (4 años)**: ~15-20 s en modo `full`. Con la repetición espaciada se acorta (`short`/`skip`). Medir si hay que recortar el clip de historia.
3. **Autoplay en iPad/Safari**: el `StartGate` lo mitiga; aun así probar el audio programático (no iniciado por gesto) tras la primera ronda. Si falla, usar un único `AudioContext` desbloqueado en el gate.
4. **Homófonos 日/火**: resueltos con significado y emoji; vigilar si aparecen más al ampliar el catálogo (el test de `recall` ya lo detecta).
5. **TTS vs voz humana**: el TTS japonés neural es suficiente para palabras cortas, pero un acento humano (o de una hablante nativa) es preferible a largo plazo; el manifiesto permite sustituir `.wav` sin tocar código.
6. **Carga del paso `recall`**: añade ~10-15 s por kanji. Si el reloj de 10 min por tema aprieta, hacerlo **solo** en `storyMode ≠ skip` o cada 2.ª ronda.
7. **Katakana**: este spec lo *aparta* del camino crítico; si quieres que la de 6 años lo recupere, la Fase 4 (puente con SRS y ruby) es el lugar, no mezclarlo con la asociación kanji↔sonido.
8. **Peso de audio**: ~125 clips × 30-60 KB ≈ 4-6 MB prefetcheados por el service worker. Aceptable; si preocupa, mover `kc.ja.k.*.on` y `kc.zh.*` a `installMode: lazy`.

---

## 14. Resumen ejecutivo

El juego **muestra** la asociación forma-significado pero casi **nunca la hace sonar** y, cuando lo hace, usa el kanji crudo en un TTS y katakana on'yomi que ninguna de las dos lee bien. La solución: **clips reales por kanji y pieza (hiragana como entrada de TTS)**, un **"cine" narrado con karaoke** en la Historia, **sonido en cada toque**, **emoji + voz en vez de texto a los 4 años**, **hiragana primero y katakana con ruby a los 6**, un nuevo paso de **recuperación** (oír → elegir / ver → oír) y **repetición espaciada** para que el kanji vuelva cuando hace falta. Se mantiene el método Zvonkin: sin zumbidos de error, solo preguntas.
