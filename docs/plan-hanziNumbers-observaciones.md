# MODIFICACIÓN DEL JUEGO "HANZI NUMBERS"

## Qué modificaría (bugs y desajustes reales, por prioridad)
1. **Hay rangos que nunca se usan.**
    * `topeReconocer` llega a 20 solo con nivel ≥ 7, pero el reconocimiento termina en el nivel 6. Las niñas nunca practican 16–20, aunque la insignia dice “Aprende 1–20”.
    * En `combinar` pasa lo contrario. `rangoObjetivo` y `tamanoBandeja` ramifican con `lvl <= 4`, pero esa etapa solo existe desde el nivel 7, así que esas ramas son código muerto.
    * Resultado: a los 4 años los niveles 7–12 son idénticos (objetivo 11–30, bandeja de 6). A los 6 años los niveles 9–12 son idénticos y la bandeja siempre trae 10 piezas. Indexa las tablas con `level - NIVEL_ULTIMO_RECONOCER` y reparte la dificultad de verdad, con una sola perilla por salto, como ya haces en `kanji-composition`.
2. **El acierto no mide nada.**
    * Un error no rompe la racha y la opción equivocada no se desactiva. Tocando las cuatro opciones siempre se acierta y se sube de nivel.
    * Cuenta solo el primer intento (hay un `FirstAttemptGuard`) o rompe la racha a partir del 2.º error, y atenúa las opciones ya descartadas como en `recall-option--no`.
3. **El audio hace la respuesta.** La consigna dice el número en chino al entrar, así que basta con emparejar sonidos sin leer el glifo. Está bien en los niveles 1–2, pero retira ese andamio en niveles altos, como haces con el fantasma en kanji-compose.
4. **Sonido de elogio.** En `finishProblem`, `playPraise()` suena siempre, también cuando hay subida de nivel, y se solapa con `playLevelUp()`. En el resto de juegos solo suena si no sube de nivel. Además, el `.then()` lo dispara aunque la narración se haya cancelado.
5. **Audio offline.** Los clips son .m4a, pero `ngsw-config.json` solo precachea .wav en el grupo `game-audio`. En la tableta sin red los números caen al TTS, y si no hay voz `zh-CN` local no suena nada. Añade `/audio/**/*.m4a`. Esto también afecta a kanji-compose.
6. **Dashboard.** `isResting()` solo contempla `math` y `japanese`, así que Chino nunca muestra “😴 Descansando”. Además, `PlayerProgress` no tiene chinese.
7. **Opciones para 4 años.** Muestras 4 opciones, pero tu propio `DEFAULT_PROFILE_CONFIGS[4]` dice 2–3. Los dos niveles de edad hoy son idénticos en reconocer, y el documento pide variantes explícitas.
8. **Duda prematura.** `revisar()` dispara “¿cuántos dieces lleva?” en cuanto el montaje parcial no se lee (por ejemplo 五三 mientras aún va a poner el 十). Evalúa cuando el número de piezas alcance la longitud de la solución, o tras una pausa.
9. **Arranque de las niñas de 6 años.** `startLevel: {6: 1}` las hace empezar en 1–5. Pon un nivel inicial más alto o un pequeño diagnóstico.
10. Salto del nivel 6 al 7. Se pasa de elegir entre cuatro opciones a armar números de hasta 30. Es un acantilado.
---
## Qué añadiría
* **Cantidad concreta (CPA y tarjetas de Doman).** Antes del dígito, mostrar N objetos o puntos (🍎×7) y luego el hanzi y el dígito. Ahora los 4 años pasan de oír “qī” a elegir glifos sin ningún referente de cantidad.
* **Bloques de decenas (Dienes) en `combinar`.** Al lado de la lectura, dibujar barras de diez y unidades. Así 三十五 son 3 decenas y 5 unidades, y el valor posicional se ve, no solo se lee. Muestra también qué cantidad significa el 十.
* **Reordenar chips con `cdkDropList`.** Que puedan intercambiar 三十五 ↔ 五十三 y vean cambiar el número. Ese contraste es la idea central del juego, y ahora solo se descubre soltando y volviendo a agarrar.
* **Dirección inversa en `combinar`.** Ver 三十五 y componer 35 con teclado numérico, o comparar 十二 con 二十.
* **Distractores con intención.** A partir del nivel 3, números que comparten piezas o van invertidos (二十 / 十二), como haces con `distractoresFor` en kanji.
* **Repetición espaciada y progreso.** Un mazo hanzi-numbers en `SpacedRepetition` con los números fallados, `SkillProgressService`.`recordAttempt`, y `ProblemPicker` para no repetir el mismo número seguido. Hoy es `randInt` puro.
* **Escalera de ayuda y tutorial.** Reutiliza `HintLadder`, `TutorialSeen` y `GhostHand`. Hoy solo hay una duda hablada por ronda y no escala.
* **Botón 🔊 para repetir la consigna.** Ahora no hay forma de volver a oírla, salvo tocar las opciones.
* **Modo pareja.** La de 6 años lee el número y decide, la de 4 coloca, como en kanji-compose.
* **Ritual Flash** de 1–10 antes de empezar.
* **El Sabio Long** como guía visible.
* **Opcional:** trazar los hanzi. Reutiliza `stroke-check`, pero necesitas añadir 一–十 a `kanji-strokes`.
* **Un spec de la narración.** Existe `contieneVeredicto`, pero ningún test verifica los 99 clips ni las frases prohibidas, como sí hay en logic-blocks y kanji-compose.
---
## Qué quitaría
* **Texto para pre-lectoras.** El badge “Aprende 1–20”, “Forma”, “Toca los hanzis de abajo 👇” y el banner `game-feedback`. Sustitúyelos por iconos y la cara de ánimo (mood), como en kanji-compose.
* **Doble narración en el acierto de reconocer.** `elegir()` dice el número y `finishProblem()` lo repite 1 ms después, cortando el primero.
* **El parámetro de texto en `narrar()`.** El manifiesto ya trae el TTS y el idioma de cada clip, así que es redundante.
* **La dirección aleatoria en los niveles 1–2.** Empieza con una sola y alterna después, una habilidad nueva por vez.
* **Detalle cultural menor.** En chino, para contar cosas se dice 两 (liǎng), no 二. Si usas objetos concretos, conviene tenerlo presente al grabar el audio de 2.
