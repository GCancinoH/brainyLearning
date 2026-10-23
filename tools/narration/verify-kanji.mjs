/**
 * Comprueba que el guion de kanji-compose y sus clips están sincronizados y bien formados.
 *
 *     node tools/narration/verify-kanji.mjs
 *
 * POR QUÉ ESTO ES UN SCRIPT Y NO UN TEST DE VITEST
 * El builder de test de Angular compila los specs sin los tipos de Node, así que ahí no se
 * puede leer el disco. Y hace falta poder hacerlo, por una razón concreta:
 *
 * Un `.wav` que falta **no produce ningún error en la app**. `Narrator` cae al TTS del
 * navegador, que sin conexión (como juegan ellas) puede no tener voz japonesa, y el kanji
 * aparece **mudo**. Eso es exactamente el problema que este trabajo vino a arreglar, y
 * volvería sin que nadie se entere.
 *
 * Además comprueba las tres reglas del contenido sobre los ficheros ya generados, no solo
 * sobre el manifiesto: un `.wav` puede haberse generado con una versión vieja de la frase.
 *
 * Sale con código 1 si algo falla.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFESTO = join(RAIZ, 'tools', 'narration', 'kanji-compose.json');
const AUDIO = join(RAIZ, 'public', 'audio', 'kanji-compose');
const FUENTE = join(RAIZ, 'src', 'app', 'core', 'learning', 'kanji-narration.ts');
// El mismo formato que declara `kanji-compose` al configurar el Narrator y que
// `generate.py` escribe. Si aquí no cuadra con el del juego, se verifica el formato
// equivocado y el juego pide archivos que no existen — quedando mudo, que es el
// problema que este script vino a vigilar.
const EXT = 'm4a';

/** Duración en segundos, o `null` si no hay ffprobe o el fichero no se puede leer. */
function duracion(archivo) {
  try {
    const t = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', archivo],
      { encoding: 'utf-8' },
    ).trim();
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/**
 * ¿El fichero es de verdad un `.m4a` (MP4 con `ftyp` en el offset 4)?
 *
 * Existe porque el caso que hay que detectar es este: alguien regenera con el generador
 * viejo y renombra `.wav` a `.m4a`. Sobre el papel la carpeta está completa; en la
 * tableta el navegador no encuentra formato y el kanji sale mudo.
 */
function esM4a(archivo) {
  const fd = readFileSync(archivo).subarray(4, 8);
  return fd.toString('latin1') === 'ftyp';
}

const PROHIBIDO = ['incorrecto', 'está mal', 'mal hecho', 'no es', 'equivocado', 'fallaste'];
const HIRAGANA = /^[぀-ゟー]+$/;
const RUIDO_ES = /[぀-ヿ一-鿿豈-﫿＀-￯\p{Extended_Pictographic}]/u;

let fallos = 0;
const fallo = (msg) => { console.error(`  ✗ ${msg}`); fallos++; };
const ok = (msg) => console.log(`  ✓ ${msg}`);

console.log('Verificación de la narración de kanji-compose\n');

if (!existsSync(MANIFESTO)) {
  fallo(`falta ${MANIFESTO} (ejecuta: npx tsx tools/narration/export-kanji.ts)`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(MANIFESTO, 'utf-8'));
const claves = Object.keys(manifest);
console.log(`  Manifiesto: ${claves.length} clips\n`);

// --- 1. El JSON exportado coincide con el código ---
// El JSON es una SALIDA de `export-kanji.ts`, no una fuente. Si alguien edita el JSON a
// mano, el `.wav` generado sería de una frase que el juego nunca dice.
const fuente = readFileSync(FUENTE, 'utf-8');
const enCodigo = fuente.includes('construirManifiesto')
  && (fuente.match(/kc\.es\.sys/g) || []).length > 0;
if (enCodigo) ok('el manifiesto se genera desde el código');
else fallo('el manifiesto ya no parece generarse desde el código: revisa export-kanji.ts');

// --- 2. Regla 1: el japonés solo recibe hiragana ---
const noHiragana = claves.filter(k =>
  manifest[k].lang === 'ja-JP' && !HIRAGANA.test(manifest[k].tts));
if (noHiragana.length === 0) {
  const n = claves.filter(k => manifest[k].lang === 'ja-JP').length;
  ok(`los ${n} clips japoneses son hiragana puro (nunca un kanji al TTS)`);
} else noHiragana.forEach(k => fallo(`${k}: "${manifest[k].tts}" no es hiragana`));

// --- 3. Regla 2: el español no recibe emojis ni CJK ---
const conRuido = claves.filter(k => manifest[k].lang === 'es-MX' && RUIDO_ES.test(manifest[k].tts));
if (conRuido.length === 0) {
  const n = claves.filter(k => manifest[k].lang === 'es-MX').length;
  ok(`los ${n} clips españoles no llevan emojis ni caracteres CJK`);
} else conRuido.forEach(k => fallo(`${k}: "${manifest[k].tts}" lleva ruido para el TTS`));

// --- 4. Regla 3: ningún veredicto ---
const veredictos = claves.filter(k =>
  PROHIBIDO.some(p => manifest[k].tts.toLowerCase().includes(p)));
if (veredictos.length === 0) ok('ninguna frase dice "mal", "incorrecto", "no es"…');
else veredictos.forEach(k => fallo(`${k}: "${manifest[k].tts}" emite un veredicto`));

// --- 5. Ningún texto vacío ---
const vacios = claves.filter(k => !manifest[k].tts.trim());
if (vacios.length === 0) ok('ningún clip tiene el texto vacío');
else vacios.forEach(k => fallo(`${k}: texto vacío`));

// --- 6. Cada clave tiene su fichero, y cada fichero su clave ---
if (!existsSync(AUDIO)) {
  fallo(`falta la carpeta ${AUDIO} (ejecuta: npm run voice -- kanji-compose)`);
} else {
  const enDisco = readdirSync(AUDIO)
    .filter(f => f.endsWith(`.${EXT}`))
    .map(f => f.slice(0, -(EXT.length + 1)));
  const sinAudio = claves.filter(k => !enDisco.includes(k));
  const huerfanos = enDisco.filter(k => !claves.includes(k));

  if (sinAudio.length === 0) ok(`${claves.length} clips tienen su .${EXT}`);
  else sinAudio.slice(0, 8).forEach(k => fallo(`falta ${k}.${EXT}`)) || null;

  if (huerfanos.length === 0) ok(`no hay .${EXT} huérfanos`);
  else huerfanos.slice(0, 8).forEach(k => fallo(`${k}.${EXT} no está en el manifiesto`)) || null;

  // --- 6b. Y el que hay es del formato que dice tener ---
  const disfrazados = enDisco.filter(k => !esM4a(join(AUDIO, `${k}.${EXT}`)));
  if (disfrazados.length === 0) ok(`los ${enDisco.length} clips son MP4/AAC de verdad`);
  else disfrazados.slice(0, 8)
    .forEach(k => fallo(`${k}.${EXT} no empieza por ftyp: es otro formato renombrado`));

  const mudos = enDisco.filter(k => statSync(join(AUDIO, `${k}.${EXT}`)).size < 1000);
  if (mudos.length === 0) ok(`ningún .${EXT} está vacío o truncado`);
  else mudos.forEach(k => fallo(`${k}.${EXT} está vacío (< 1 KB)`));

  // --- 7. Duración: un clip de 0.4 s en un texto largo significa recorte ---
  // Pasó de verdad al usar `silenceremove` con `stop_periods=1`: truncaba las frases en el
  // primer respiro. Se avisa si alguna palabra quedó sin sitio para pronunciarse.
  //
  // Antes la duración se infería de `bytes / 44100`, que es cierto **solo** para PCM 16-bit
  // a 22 kHz. Con AAC esos bytes no miden segundos sino compresión, y con la misma frase
  // el número saldría igual de mal para un clip que dura 5 s que para uno que dura 0,4 s:
  // el chequeo entero habría dejado de servir. Pasa a preguntárselo a ffprobe.
  const ratio = 0.09;  // ~11 palabras por segundo, margen amplio para no dar falsos positivos
  const sinFfprobe = duracion(join(AUDIO, `${enDisco[0]}.${EXT}`)) === null;
  if (sinFfprobe) {
    console.log('  ⚠ ffprobe no está en el PATH: se salta la comprobación de duración');
  } else {
    const demasiadoCorto = [];
    for (const k of enDisco) {
      const palabras = manifest[k]?.tts.trim().split(/\s+/).length ?? 0;
      const segundos = duracion(join(AUDIO, `${k}.${EXT}`)) ?? 0;
      if (palabras > 2 && segundos < palabras * ratio) {
        demasiadoCorto.push(`${k} (${palabras} palabras en ${segundos.toFixed(2)} s)`);
      }
    }
    if (demasiadoCorto.length === 0) ok('ningún clip parece truncado por su duración');
    else demasiadoCorto.forEach(d => fallo(`${d}: sospechosa truncatura`));
  }
}

console.log(fallos === 0 ? '\nTodo correcto.\n' : `\n${fallos} problema(s).\n`);
process.exit(fallos === 0 ? 0 : 1);