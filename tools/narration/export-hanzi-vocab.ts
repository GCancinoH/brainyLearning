/**
 * Exporta `CLIP_MANIFEST` del vocabulario Hanzi a JSON, que es lo que lee `generate.py`.
 *
 *     npx tsx tools/narration/export-hanzi-vocab.ts
 *
 * Mismo motivo que en Números Hanzi: el guion vive en el código porque de ahí lo consume
 * el juego. El JSON es una **salida**, nunca una fuente.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Con extensión explícita: sin ella `tsx` resuelve esto como CommonJS y falla.
import {
  CLIP_MANIFEST,
  ALL_CLIPS,
} from '../../src/app/features/games/chinese/hanzi-vocab/hanzi-vocab-narration.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = join(RAIZ, 'tools', 'narration', 'hanzi-vocab.json');

// Orden estable: sin esto el fichero cambia de contenido en cada regeneración y el
// `git diff` no dice nada.
const ordenado: Record<string, { tts: string; lang: string }> = {};
for (const clave of [...ALL_CLIPS].sort()) {
  ordenado[clave] = CLIP_MANIFEST[clave]!;
}

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify(ordenado, null, 2) + '\n', 'utf-8');

const porLang = ALL_CLIPS.reduce<Record<string, number>>((acc, k) => {
  const lang = CLIP_MANIFEST[k]!.lang;
  acc[lang] = (acc[lang] ?? 0) + 1;
  return acc;
}, {});

console.log(`Exportadas ${ALL_CLIPS.length} claves a tools/narration/hanzi-vocab.json`);
console.log('  por idioma:', porLang);
