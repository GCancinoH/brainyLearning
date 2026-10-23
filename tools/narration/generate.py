"""
Genera los clips de voz de los juegos a partir de sus manifiestos.

    python tools/narration/generate.py                     # ambos juegos
    python tools/narration/generate.py kanji-compose       # solo uno

Los clips que produce son **offline de verdad**: viajan en el service worker y suenan
sin red. Eso es justo lo que el TTS del navegador (`speechSynthesis`) NO garantiza, porque
solo tiene voces disponibles si el sistema las trae instaladas y disponibles sin conexión.

Cada mazo declara su formato. `logic-blocks` sigue en `.wav`, que no falla nunca pero pesa
~44 kB por segundo de habla; `kanji-compose` va en `.m4a` (AAC a 48 kbps mono), que a esa
misma voz la deja en un octavo. La extensión vive en una sola tupla por mazo: pasar el
otro a m4a no es tocar el generador, es cambiar su línea.

Para sustituirlos por una voz humana no hay que tocar nada del código: se graba un `.wav`
por clave con el mismo nombre y se vuelve a generar. El juego no sabe de dónde sale.

El manifiesto se exporta desde el TypeScript (`export-kanji.ts`), nunca se escribe a mano:
si divergiera, los clips serían de frases que el juego nunca dice.

Requisitos: `pip install edge-tts` y `ffmpeg` en el PATH.
"""
import argparse
import asyncio
import json
import pathlib
import subprocess
import sys

import edge_tts

# Una sola voz por idioma. Es deliberado: el cerebro infantil asocia "la voz" con el
# idioma, y si el kanji suena con una y la pieza con otra, la asociación se rompe.
#   - la de 6 años ya oye.jp, así que no se nota que es sintética
#   - la de 4 años nunca ha oído japonés, así que es la única referencia
VOICES = {
    "es-MX": "es-MX-DaliaNeural",
    "ja-JP": "ja-JP-NanamiNeural",   #、明瞭な発音。硬い声ではない
    "zh-CN": "zh-CN-XiaoxiaoNeural",
}
RATE = "-12%"

ROOT = pathlib.Path(__file__).resolve().parents[2]

# nombre -> (manifiesto, carpeta de salida, extensión, argumentos de códec).
# El prefijo del fichero es el que espera el juego.
#
# El códec va vacío para `.wav` (PCM es el por defecto y basta con -ar/-ac); para `.m4a` va
# el par de AAC. `libfdk` no hace falta: el códec `aac` nativo de ffmpeg sirve para voz a
# 48 kbps sin que se note.
JUEGOS = {
    "logic-blocks": ("logic-blocks.es.json", "audio/logic-blocks/es", "wav", []),
    # AAC 48 kbps mono: voz transparente y ~1/8 del peso. Este mazo lo prefetcha el service
    # worker al instalar, así que cada MB que se ahorra es un MB menos en la tableta.
    "kanji-compose": ("kanji-compose.json", "audio/kanji-compose", "m4a",
                      ["-c:a", "aac", "-b:a", "48k"]),
}


def manifest_de(nombre: str) -> dict:
    """Lee un manifiesto en cualquiera de los dos formatos admitidos."""
    archivo = JUEGOS[nombre][0]
    datos = json.loads((ROOT / "tools" / "narration" / archivo).read_text(encoding="utf-8"))
    if not datos:
        raise SystemExit(f"{archivo} está vacío. ¿Has ejecutado el export de kanji?")
    # Formato nuevo: {clave: {tts, lang}}. El viejo era {clave: "texto"} y se asume es-MX.
    primero = next(iter(datos.values()))
    if isinstance(primero, str):
        return {k: {"tts": v, "lang": "es-MX"} for k, v in datos.items()}
    return datos


async def generar(nombre: str, solo_faltantes: bool) -> int:
    archivo, carpeta, ext, codigo = JUEGOS[nombre]
    manifest = manifest_de(nombre)
    out = ROOT / "public" / carpeta
    out.mkdir(parents=True, exist_ok=True)

    print(f"\n=== {nombre} ({len(manifest)} clips) → public/{carpeta} ===")

    fallos, saltados, hechos = [], 0, 0
    for key, spec in manifest.items():
        lang = spec["lang"]
        if lang not in VOICES:
            fallos.append(key)
            print(f"  ✗ {key}: no hay voz para '{lang}'", file=sys.stderr)
            continue

        salida = out / f"{key}.{ext}"
        mp3 = out / f"{key}.mp3"
        if solo_faltantes and salida.exists():
            saltados += 1
            continue

        try:
            await edge_tts.Communicate(spec["tts"], VOICES[lang], rate=RATE).save(str(mp3))
            # Filtros, en este orden:
            #
            # 1. Recorte del silencio inicial y final, con el truco de `areverse`, que hace
            #    que `silenceremove` recorte por el principio de un audio al revés = por el
            #    final del original.
            #    ⚠️ NO usar `silenceremove` con `stop_periods=1` directamente: recorta en el
            #    primer respiro y trunca la frase. Medido: "Lleva a la canasta todas las
            #    figuras rojas" pasó de 4.08 s a 0.77 s, dejando solo la primera palabra.
            #    El truco quita 0.20 s iniciales y 0.99 s finales, y conserva la pausa
            #    natural de 0.12 s entre palabras.
            # 2. `loudnorm` iguala el volumen: los clips se encadenan (pieza → significado),
            #    y si uno suena más bajo parece que el juego habla en voz baja.
            # 3. -ar 22050 -ac 1: mono, y sin frecuencias que la voz no usa.
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3),
                 "-af",
                 "areverse,"
                 "silenceremove=start_periods=1:start_silence=0.15:start_threshold=-45dB,"
                 "areverse,"
                 "areverse,"
                 "silenceremove=start_periods=1:start_silence=0.08:start_threshold=-45dB,"
                 "areverse,"
                 "loudnorm",
                 "-ar", "22050", "-ac", "1", *codigo, str(salida)],
                check=True,
            )
            hechos += 1
            if hechos % 20 == 0:
                print(f"  … {hechos} hechos")
        except Exception as exc:                      # noqa: BLE001
            fallos.append(key)
            print(f"  ✗ {key}: {exc}", file=sys.stderr)
        finally:
            if mp3.exists():
                mp3.unlink()

    total = sum(f.stat().st_size for f in out.glob(f"*.{ext}")) / 1024 / 1024
    resumen = f"  {hechos} generados"
    if saltados:
        resumen += f", {saltados} ya estaban"
    print(f"  {len(manifest) - len(fallos)}/{len(manifest)} clips · {total:.2f} MB")
    if fallos:
        print(f"  FALLARON ({len(fallos)}): {', '.join(fallos[:5])}"
              f"{'…' if len(fallos) > 5 else ''}", file=sys.stderr)
    return len(fallos)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("juego", nargs="?", choices=[*JUEGOS, None], default=None,
                    help="qué juego generar (por defecto, todos)")
    ap.add_argument("--todos", action="store_true",
                    help="regenerar aunque el clip ya exista (por defecto se salta)")
    args = ap.parse_args()

    juegos = [args.juego] if args.juego else list(JUEGOS)
    fallos = 0
    for nombre in juegos:
        fallos += await generar(nombre, solo_faltantes=not args.todos)
    return 1 if fallos else 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))