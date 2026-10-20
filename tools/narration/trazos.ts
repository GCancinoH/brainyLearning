/**
 * Qué kanji necesita la Fase E (trazo guiado, §5.3).
 *
 * Imprime los **objetivos** —los que se componen y se trazan en el paso de dibujar— y las
 * piezas, para ver si hace falta también su orden de trazos.
 *
 * Uso:  npx tsx tools/narration/trazos.ts
 */
import { KANJI_COMPOSITIONS } from '../../src/app/core/learning/kanji-composition';

const objetivos = [...new Set(KANJI_COMPOSITIONS.map(c => c.kanji))];
const piezas = [...new Set(KANJI_COMPOSITIONS.flatMap(c => c.slots.map(s => s.kanji)))];

console.log(`objetivos (${objetivos.length}): ${objetivos.join(' ')}`);
console.log(`  con trazos declarados: ${KANJI_COMPOSITIONS.map(c => `${c.kanji}=${c.strokeCount}`).join(' ')}`);
console.log(`piezas (${piezas.length}): ${piezas.join(' ')}`);

const soloPiezas = piezas.filter(p => !objetivos.includes(p));
console.log(`solo piezas (${soloPiezas.length}): ${soloPiezas.join(' ')}`);
console.log(`total kanji distintos: ${new Set([...objetivos, ...piezas]).size}`);
