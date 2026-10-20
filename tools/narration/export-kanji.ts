/**
 * Exporta `CLIP_MANIFEST` de TypeScript a JSON, que es lo que lee `generate.py`.
 *
 *     npx tsx tools/narration/export-kanji.ts
 *
 * POR QUÉ HAY QUE EXPORTAR Y NO MANTENER EL JSON A MANO
 * El guion vive en el código porque de ahí lo consume el juego. Si el JSON se escribiera a
 * mano, bastaría con olvidar regenerarlo para que el `.wav` que se genera sea de una frase
 * que el juego nunca dice — y como el fallo es silencioso (suena algo, solo que lo
 * equivocado), nadie se entera hasta que una niña aprende 明 como "claro luminoso".
 *
 * El JSON es una **salida**, nunca una fuente. `verify-kanji.mjs` lo compara con el código
 * y falla si divergen.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Con extensión explícita: sin ella `tsx` resuelve esto como CommonJS y falla.
import { CLIP_MANIFEST, ALL_CLIPS } from '../../src/app/core/learning/kanji-narration.ts';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SALIDA = join(RAIZ, 'tools', 'narration', 'kanji-compose.json');

// Orden estable: sin esto el fichero cambia de contenido en cada regeneración y el
// `git diff` no dice nada.
const ordenado: Record<string, { tts: string; lang: string }> = {};
for (const clave of [...ALL_CLIPS].sort()) {
  ordenado[clave] = CLIP_MANIFEST[clave];
}

mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify(ordenado, null, 2) + '\n', 'utf-8');

const porLang = ALL_CLIPS.reduce<Record<string, number>>((acc, k) => {
  acc[CLIP_MANIFEST[k].lang] = (acc[CLIP_MANIFEST[k].lang] ?? 0) + 1;
  return acc;
}, {});

console.log(`Exportadas ${ALL_CLIPS.length} claves a tools/narration/kanji-compose.json`);
console.log('  por idioma:', porLang);