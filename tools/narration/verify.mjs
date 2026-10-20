/**
 * Comprueba que el guion y los `.wav` están sincronizados.
 *
 *     node tools/narration/verify.mjs
 *
 * POR QUÉ ESTO ES UN SCRIPT Y NO UN TEST DE VITEST
 * El builder de test de Angular compila los specs sin los tipos de Node, así que ahí no
 * se puede leer `CLIP_TEXT` del código ni listar un directorio. Y hace falta poder hacerlo,
 * por una razón concreta:
 *
 * Un `.wav` que falta **no produce ningún error en la app**. `Narrator` cae al TTS, el TTS
 * puede no tener voz local (sobre todo sin red, que es como juegan ellas) y la niña
 * simplemente no oye nada. El fallo es totalmente invisible salvo que alguien mire. Aquí
 * se mira.
 *
 * Sale con código 1 si algo falla, para poder colgarlo de un script de npm.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFESTO = join(RAIZ, 'tools', 'narration', 'logic-blocks.es.json');
const AUDIO = join(RAIZ, 'public', 'audio', 'logic-blocks', 'es');
const FUENTE = join(RAIZ, 'src', 'app', 'features', 'games', 'math', 'logic-blocks', 'logic-blocks-narration.ts');

const PROHIBIDO = ['incorrecto', 'está mal', 'mal hecho', 'no es', 'equivocado', 'fallaste'];

let fallos = 0;
const fallo = (msg) => { console.error(`  ✗ ${msg}`); fallos++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

/** Saca el CLIP_TEXT del TypeScript sin necesitar un compilador: es un objeto literal plano. */
function guionDesdeElCodigo() {
  const src = readFileSync(FUENTE, 'utf-8');
  const cuerpo = src.match(/export const CLIP_TEXT[\s\S]*?= \{([\s\S]*?)\n\};/);
  if (!cuerpo) throw new Error('No se encontró CLIP_TEXT en logic-blocks-narration.ts');
  const pares = [...cuerpo[1].matchAll(/^\s*'([^']+)':\s*\n?\s*'([^']*)',?\s*$/gm)];
  return Object.fromEntries(pares.map(m => [m[1], m[2]]));
}

console.log('Verificación de la narración de logic-blocks\n');

const texto = guionDesdeElCodigo();
console.log(`  Guion en el código: ${Object.keys(texto).length} clips\n`);

// --- 1. Manifiesto y código dicen lo mismo ---
if (!existsSync(MANIFESTO)) {
  fallo(`falta ${MANIFESTO}`);
} else {
  const manifiesto = JSON.parse(readFileSync(MANIFESTO, 'utf-8'));
  const a = JSON.stringify(mango(manifiesto));
  const b = JSON.stringify(mango(texto));
  if (a === b) ok('el manifiesto y CLIP_TEXT coinciden');
  else fallo('el manifiesto y CLIP_TEXT NO coinciden (¿se regeneró el JSON?)');
}

// --- 2. Ningún clip se traga un veredicto ---
const offenders = Object.entries(texto).filter(([, t]) =>
  PROHIBIDO.some(p => t.toLowerCase().includes(p))
);
if (offenders.length === 0) ok('ninguna frase dice "mal", "incorrecto", "no es"…');
else offenders.forEach(([k, t]) => fallo(`"${k}" dice un veredicto: "${t}"`));

// --- 3. Cada frase tiene su fichero, y cada fichero su frase ---
if (!existsSync(AUDIO)) {
  fallo(`falta la carpeta ${AUDIO} (ejecuta generate.py)`);
} else {
  const enDisco = readdirSync(AUDIO).filter(f => f.endsWith('.wav')).map(f => f.slice(0, -4));
  const declarados = Object.keys(texto);

  const sinAudio = declarados.filter(k => !enDisco.includes(k));
  const huerfanos = enDisco.filter(k => !declarados.includes(k));

  if (sinAudio.length === 0) ok(`${declarados.length} clips tienen su .wav`);
  else sinAudio.forEach(k => fallo(`falta ${k}.wav`));

  if (huerfanos.length === 0) ok('no hay .wav huérfanos');
  else huerfanos.forEach(k => fallo(`${k}.wav no está en CLIP_TEXT`));

  const mudos = enDisco.filter(k => statSync(join(AUDIO, `${k}.wav`)).size < 1000);
  if (mudos.length === 0) ok('ningún .wav está vacío o truncado');
  else mudos.forEach(k => fallo(`${k}.wav está vacío (< 1 KB)`));
}

console.log(fallos === 0 ? '\nTodo correcto.\n' : `\n${fallos} problema(s).\n`);
process.exit(fallos === 0 ? 0 : 1);

/** Ordena las claves para comparar dos objetos sin que importe el orden. */
function mango(o) {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
}