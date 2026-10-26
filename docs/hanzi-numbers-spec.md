# Spec — "Números Hanzi" (Planeta Dragón 🐉 · Sabio Long)

> **Problema**: la tarjeta 🇨🇳 *Chino (中文)* del dashboard era un **enlace muerto**: al tocarla
> caía en la selección de perfil, porque el mundo Dragón se retiró sin juego propio.
> **Objetivo**: un juego de chino, jugable sin ayuda de un adulto, que enseñe los números
> del 1 al 20 y **cómo se forman** los grandes — con el método Zvonkin (preguntas, nunca
> veredictos) y para las dos edades (4 y 6).

---

## 1. El juego

Un solo juego, **dos etapas**, y el cambio lo da el nivel. Nadie lo cambia a mano:
el distintivo de arriba cambia solo al subir.

| Etapa | Niveles | Qué se hace | Rango |
|---|---|---|---|
| 🔤 **Reconocer** | 1–6 | Se ve un número y se elige su hanzi — **o al revés**: *"¿qué número es 七?"* | 1–20 |
| 🧩 **Combinar** | 7–12 | Se ve un número (35) y hay que **agarrar** de la bandeja los hanzis que lo recrean, **en orden**: 三 → 十 → 五 | 4 años: 11–30 · 6 años: hasta 99 |

La dirección de la etapa 1 se alterna a propósito: reconocer el glifo y **leerlo** son dos
habilidades distintas, y con una sola dirección el juego se convertiría en adivinar cuál de
los cuatro es el bonito.

---

## 2. La regla que lo sostiene: **la lectura es la validación**

El chino es **posicional**. No existe *"treinta y cinco"*, existe *"tres dieces cinco"*. La 三
de 三十五 vale 30 porque va **antes** del 十. Esa posicionalidad es exactamente lo que el
juego enseña, y por qué con diez caracteres (一…十) se escribe cualquier número del 1 al 99.

En vez de juzgar el montaje con un *"correcto / incorrecto"*, el juego **lo lee** y enseña el
número que ha salido:

| La niña hace | El juego muestra | ¿Un veredicto? |
|---|---|---|
| 六 → 六十 → 六十四 (objetivo 46) | chips 六 十 四 con **`= 64`** apagado al lado | **No.** Ve 64 ≠ 46 y lo cambia |
| 四 → 四十 | **`= 40`** | No. Sigue |
| 四 十 六 | **`= 46`** → éxito | — |
| 一 + 三 (sin 十) | chips, sin número, y la duda *"¿Cuántos dieces lleva? Empieza por ahí."* | No. Es un nudge |

Es el mismo criterio que el trazado suave de *kanji-compose*: **error = exploración**, y el
entorno da la cuenta, no un juez. `FORBIDDEN_IN_NARRATION` y el test `contieneVeredicto`
verifican que ninguna frase de audio juzgue.

### 2.1 La "combinación exacta" es exacta de verdad

`leer()` **es el inverso exacto de** `hanziPara()`: un montaje se lee si y solo si es *la*
escritura de ese número. De ahí salen dos consecuencias que no son azar:

- 五十三 sí se lee, y es **53**, no 35 (el orden cambia el número: se aprende tocando).
- 三五 **no** se lee (sin 十 no hay número). 一十五 **no** se lee, porque en chino quince
  es 十五, sin el uno.

Y la unicidad es **estructural**, no una esperanza: la bandeja nunca trae un segundo 十 ni
una copia de más de ningún carácter (salvo las que la propia escritura pide — **二十二
lleva dos veces la 二**, y eso es lección, no bug). Sin un segundo 十, `10+10+10+5` no
existe; y como `leer` solo admite la canónica, **una sola construcción** de la bandeja puede
leer el objetivo. El spec lo comprueba por **fuerza bruta** (todos los subconjuntos y
permutaciones de hasta 3 piezas) en vez de creerlo.

---

## 3. Audio: dos voces, cada una en su lado

| Quién habla | Idioma | Voz | Qué dice |
|---|---|---|---|
| El Sabio Long (la guía) | `es-MX` | Dalia | Consignas y dudas: *"¿Cuál es el hanzi de este número?"*, *"Tócalos uno por uno y escucha."* |
| El contenido | `zh-CN` | Xiaoxiao | Los números: `hn.num.35` → **三十五** → *"sān shí wǔ"* |

Tres decisiones que parecen detalles y no lo son:

1. **El TTS se alimenta del propio hanzi**, no del pinyin. La voz `zh-CN` lee caracteres;
   meter pinyin (letra latina) en la misma pantalla que el hanzi sería **mezclar dos
   sistemas de símbolos en la misma lección**, que es justo lo que la Plantilla 6 del
   método prohíbe. La pronunciación la da el oído, no una fila de letras debajo.
2. **Números 1–99 enteros** (99 clips): la etapa 1 necesita el 1–20, las piezas el 1–10 y
   el pago de la etapa 2 el número armado completo. 105 clips, **0,87 MB**, `m4a` a 48 kbps,
   en su propio grupo del `ngsw-config` (prefetch, como kanji-compose).
3. **La consigna va seguida del número en chino**. Sin oír *"qī"* mientras se mira el 7 no
   hay puente entre número y glifo; con él, tocar opciones hasta oír *"qī"* resuelve el
   problema **sin saber todavía qué glifo es cuál**. La exploración enseña.

---

## 4. Edades y niveles

| | 4 años | 6 años |
|---|---|---|
| Aciertos por subir | 3 | 4 |
| Etapa 2 llega hasta | 30 | 99 |
| Bandeja | 5–6 piezas | 7–10 piezas |

`topeReconocer(level)` crece el tramo de la etapa 1: 1–5, 1–10, 1–15 y de ahí al 20. El rango
**no** depende de la edad (los dos empiezan igual); lo que cambia es a qué nivel llega cada
una, y eso lo pone el perfil, no el generador.

---

## 5. Cómo se prueba

```
/games/chinese            menú chino (desde el dashboard, tarjeta 🇨🇳)
/games/chinese/hanzi-numbers
```

Para saltar a la etapa 2 sin jugar 6 niveles, en la consola:

```js
const k = 'brainyLearning_gameProgress';
const d = JSON.parse(localStorage.getItem(k));
d[localStorage.getItem('brainyLearning_active_id') + ':hanzi-numbers'] = { gameId: 'hanzi-numbers', level: 7 };
localStorage.setItem(k, JSON.stringify(d));
```

---

## 6. Qué está hecho y qué no

- [x] **Fase 1** — núcleo lógico puro `hanzi-numbers-problem.ts` (1–99, canónico, unicidad) + 16 specs
- [x] **Fase 2** — juego jugable de punta a punta: etapa 1, ruta, catálogo, menú chino, audio `zh-CN`
- [x] **Fase 3** — etapa 2 (combinar) con bandeja, chips, lectura en vivo y limpiar
- [x] **Fase 4** — reloj de tema (`Theme` incluye `chinese`), tarjeta del dashboard ya no es enlace muerto
- [ ] **Pendiente** — reflexión de un toque para 6 años (la que tienen `coin-shop` y `kanji-compose`)
- [ ] **Pendiente** — "Mis números más difíciles" requiere que se registren fallos (§5.11 de la revisión)
- [ ] **Pendiente** — pinyin con tonos: **decisión deliberada de no ponerlo** (§3.1); si se añade,
      detrás del toque y nunca debajo del glifo
- [ ] **Pendiente** — pictogramas Jiaguwen (§C.1 del método) como puente: otro juego, no skin

---

## 7. Archivos

| Archivo | Qué |
|---|---|
| `src/app/features/games/chinese/hanzi-numbers/hanzi-numbers-problem.ts` | Núcleo puro: `hanziPara`, `leer`, `piezasDe`, `etapaDeNivel`, los dos generadores |
| `…/hanzi-narration.ts` | Guion: `CLIP_TEXT` (es-MX), `numeroClip(n)` (zh-CN), `CLIP_MANIFEST`, `contieneVeredicto` |
| `…/hanzi-numbers.ts` / `.html` / `.scss` | El juego |
| `…/hanzi-numbers.spec.ts` | Integración del componente (11 pruebas) |
| `src/app/core/models/chinese-game.ts` | Catálogo del Planeta Dragón |
| `src/app/features/games/chinese/chinese-menu/` | Menú de la materia |
| `tools/narration/export-hanzi.ts` | TS → `hanzi-numbers.json` (el JSON es **salida**, nunca fuente) |
| `tools/narration/generate.py` → `JUEGOS['hanzi-numbers']` | Genera los 105 clips |

**Licencias**: este juego no dibuja trazos, así que **no** lleva atribución de KanjiVG.
