/**
 * Baja el orden de trazos de KanjiVG para los kanji que se **trazan** en el juego y lo
 * empaqueta como módulo TypeScript.
 *
 * Por qué un módulo y no un JSON servido: la app tiene que funcionar sin conexión, y un
 * `import` se resuelve en tiempo de build. No hay fetch en el momento de jugar.
 *
 * KanjiVG es de Ulrich Apel y está bajo CC BY-SA 3.0 — **exige atribución**, y todo lo
 * derivado queda bajo esa misma licencia. El aviso va en la cabecera del fichero generado
 * y hay que publicarlo también en la app (una pantalla de créditos basta).
 *
 * Uso:  node tools/narration/fetch-kanjivg.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { KANJI_COMPOSITIONS } from '../../src/app/core/learning/kanji-composition.ts';

const BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji';
const DESTINO = 'src/app/core/learning/kanji-strokes.ts';

/** KanjiVG nombra cada fichero por el codepoint, en hexadecimal y con 5 dígitos. */
const nombre = (kanji) => kanji.codePointAt(0).toString(16).padStart(5, '0') + '.svg';

const objetivos = [...new Set(KANJI_COMPOSITIONS.map(c => c.kanji))];
const declarados = new Map(KANJI_COMPOSITIONS.map(c => [c.kanji, c.strokeCount]));

const errores = [];
const entradas = [];

for (const kanji of objetivos) {
  const url = `${BASE}/${nombre(kanji)}`;
  const res = await fetch(url);
  if (!res.ok) {
    errores.push(`${kanji}: HTTP ${res.status} en ${url}`);
    continue;
  }
  const svg = await res.text();

  // KanjiVG es un SVG muy regular: cada trazo es un `<path id="kvg:XXXXX-sN" ... d="..."/>`
  // y vienen **en orden**. El orden es el dato; la dirección la da el propio `d`, que
  // empieza por el punto de entrada del trazo.
  const trazos = [...svg.matchAll(/<path[^>]*\bid="[^"]*-s(\d+)"[^>]*\bd="([^"]+)"/g)]
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map(m => m[2]);

  const vb = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 109 109';
  const esperados = declarados.get(kanji);

  if (trazos.length === 0) {
    errores.push(`${kanji}: sin trazos extraídos de ${url}`);
    continue;
  }
  if (esperados !== undefined && trazos.length !== esperados) {
    // No es un error del script: es que el catálogo y KanjiVG no coinciden, y eso hay
    // que verlo antes de que lo descubra la niña en el lienzo.
    errores.push(`${kanji}: KanjiVG da ${trazos.length} trazos y el catálogo declara ${esperados}`);
  }

  entradas.push({ kanji, vb, trazos });
  console.log(`  ok  ${kanji} (${esperados ?? '?'}) → ${trazos.length} trazos`);
}

if (errores.length) {
  console.error('\nPROBLEMAS:');
  for (const e of errores) console.error(`  · ${e}`);
  process.exit(1);
}

const cuerpo = entradas
  .map(e => `  '${e.kanji}': {\n    vb: '${e.vb}',\n    trazos: [\n${e.trazos.map(t => `      '${t}',`).join('\n')}\n    ],\n  },`)
  .join('\n');

const total = entradas.reduce((n, e) => n + e.trazos.length, 0);

await mkdir('src/app/core/learning', { recursive: true });
await writeFile(
  DESTINO,
  `/**
 * Orden de trazos, empaquetado desde KanjiVG.
 *
 * ============================================  LICENCIA (importante)
 * KanjiVG es copyright de **Ulrich Apel** y está publicado bajo
 * **Creative Commons Attribution-ShareAlike 3.0 (CC BY-SA 3.0)**
 * <https://creativecommons.org/licenses/by-sa/3.0/>.
 *
 * Este fichero es un derivado: los trazos son los de KanjiVG, sin cambiar el orden ni la
 * dirección, solo reempaquetados aquí. Por la cláusula *ShareAlike*, **todo lo derivado de
 * este fichero queda bajo esa misma licencia**, y la app está obligada a publicar la
 * atribución en algún sitio visible (créditos).
 *
 * Créditos: KanjiVG — Kanji Vector Graphics, copyright Ulrich Apel.
 * ============================================
 *
 * \\\`trazos\\\` está en orden: el índice 0 es el trazo 1. La dirección la da el propio
 * \\\`d\\\`, que empieza por el punto de entrada — es lo que permite animar el trazo y saber
 * si el dedo fue en la buena dirección.
 *
 * No se edita a mano: lo genera \\\`tools/narration/fetch-kanjivg.mjs\\\`.
 */

/** Un kanji con sus trazos, en orden, en el sistema de coordenadas de \\\`vb\\\`. */
export interface KanjiTrazos {
  readonly vb: string;
  readonly trazos: readonly string[];
}

export const KANJI_TRAZOS: Readonly<Record<string, KanjiTrazos>> = {
${cuerpo}
};

/** Cuántos trazos tiene. Es la validación más barata y la más útil: 0 si no está. */
export function trazoCount(kanji: string): number {
  return KANJI_TRAZOS[kanji]?.trazos.length ?? 0;
}
`,
  'utf-8',
);

console.log(`\nhecho: ${entradas.length} kanji, ${total} trazos → ${DESTINO}`);
