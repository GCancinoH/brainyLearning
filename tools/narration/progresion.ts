/**
 * Puesta a punto de la progresión: imprime, por nivel y edad, qué kanji salen y con
 * qué perillas de dificultad. Sirve para leer la tabla sin seguir el código.
 *
 *     npx tsx tools/narration/progresion.ts
 *
 * Se puede borrar sin más: no lo usa ni la app ni la tubería de voz.
 */
import {
  MAX_LEVEL,
  difficultyFor,
  poolFor,
  poolSplit,
} from '../../src/app/core/learning/kanji-composition';

const pct = (n: number): string => `${Math.round(n * 100)}%`;
const barra = (n: number): string => '█'.repeat(Math.round(n * 10)) + '░'.repeat(10 - Math.round(n * 10));

for (const edad of [4, 6]) {
  console.log(`\n${edad} AÑOS`);
  console.log('  nivel  pool (acumulado)                                    fantasma  distractores  reparto');
  for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) {
    const pool = poolFor(edad, nivel);
    const { ghost, distractors } = difficultyFor(edad, nivel);
    const { nuevos, repaso } = poolSplit(edad, nivel);
    const reparto =
      nuevos.length === 0 ? '100% repaso'
      : repaso.length === 0 ? '100% nuevos'
      : '60% nuevos / 40% repaso';
    console.log(
      `   ${String(nivel).padStart(2)}    ` +
      pool.join(' ').padEnd(48) +
      pct(ghost).padStart(6) +
      String(distractors).padStart(12) +
      reparto.padStart(26),
    );
  }
}

console.log('\nIntensidad del fantasma por nivel (lo que se ve en pantalla):');
for (const edad of [4, 6]) {
  const fila = [];
  for (let nivel = 1; nivel <= MAX_LEVEL; nivel++) fila.push(barra(difficultyFor(edad, nivel).ghost));
  console.log(`  ${edad}  ${fila.join(' ')}`);
}
