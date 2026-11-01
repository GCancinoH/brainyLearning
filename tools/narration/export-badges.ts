#!/usr/bin/env npx tsx
/**
 * Genera clips de audio .m4a placeholder (silencio) para todas las insignias.
 *
 * Cuando haya infraestructura TTS real (espeak-ng, festival, cloud TTS),
 * reemplazar esta función por una que sintetice voz real.
 *
 * Uso:
 *   npx tsx tools/narration/export-badges.ts
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { spawn } from 'node:child_process';

const OUT_DIR = path.resolve(import.meta.dirname, '../../public/audio/badges');
const SILENCE_DURATION = 1.5; // segundos
const SAMPLE_RATE = 44100;

// ============================================
// CATÁLOGO (copiado de badge-catalog.ts)
// ============================================
const GAMES = [
  { id: 'space-addition', title: 'Suma Espacial 1', category: 'math' },
  { id: 'space-subtraction', title: 'Resta Espacial', category: 'math' },
  { id: 'space-multiply', title: 'Multiplica Espacial', category: 'math' },
  { id: 'space-load-ship', title: 'Carga la nave', category: 'math' },
  { id: 'space-fuel-tank', title: 'Tanque de combustible', category: 'math' },
  { id: 'space-rescue-mission', title: 'Misión de rescate', category: 'math' },
  { id: 'paths-bridges', title: 'Puentes y caminos', category: 'math' },
  { id: 'coin-shop', title: 'Tienda de monedas', category: 'math' },
  { id: 'logic-blocks', title: 'Bloques lógicos', category: 'math' },
  { id: 'hanzi-numbers', title: 'Números Hanzi', category: 'chinese' },
  { id: 'japanese-listening', title: 'Escucha japonés', category: 'japanese' },
  { id: 'japanese-nature', title: 'Naturaleza japonesa', category: 'japanese' },
  { id: 'japanese-kanji-find', title: 'Busca el kanji', category: 'japanese' },
  { id: 'japanese-kanji-compose', title: 'Construye el kanji', category: 'japanese' },
  { id: 'japanese-calendar', title: 'Calendario japonés', category: 'japanese' },
];

const CATEGORY_META = {
  math: { worldName: 'Mundo Espacial', available: true },
  chinese: { worldName: 'Jardín de Sakura', available: true },
  japanese: { worldName: 'Planeta Dragón', available: true },
  stories: { worldName: 'Mundo de Cuentos', available: false },
  lab: { worldName: 'Laboratorio', available: false },
} as const;

const EFFORT_BADGES = [
  { kind: 'retry', threshold: 1 },
  { kind: 'retry', threshold: 10 },
  { kind: 'retry', threshold: 25 },
  { kind: 'explorer', threshold: 3 },
  { kind: 'explorer', threshold: 6 },
  { kind: 'explorer', threshold: 10 },
  { kind: 'days', threshold: 3 },
  { kind: 'days', threshold: 7 },
  { kind: 'days', threshold: 14 },
  { kind: 'calm', threshold: undefined },
  { kind: 'firstTry', threshold: 5 },
  { kind: 'firstTry', threshold: 15 },
  { kind: 'firstTry', threshold: 30 },
  { kind: 'help', threshold: 1 },
  { kind: 'help', threshold: 5 },
  { kind: 'help', threshold: 15 },
  { kind: 'perfect', threshold: 1 },
  { kind: 'perfect', threshold: 3 },
  { kind: 'perfect', threshold: 10 },
  { kind: 'welcome', threshold: undefined },
];

function allBadgeIds(): string[] {
  const ids: string[] = [];

  // Juegos (4 tiers cada uno)
  const TIERS = ['seed', 'bronze', 'silver', 'gold'];
  for (const game of GAMES) {
    for (const tier of TIERS) {
      ids.push(`${game.id}.${tier}`);
    }
  }

  // Mundos
  for (const [category, meta] of Object.entries(CATEGORY_META)) {
    if (!meta.available) continue;
    const gamesInCat = GAMES.filter(g => g.category === category);
    if (gamesInCat.length >= 3) {
      ids.push(`cat.${category}.explorer`);
    }
    for (const tier of ['bronze', 'silver', 'gold']) {
      ids.push(`cat.${category}.${tier}`);
    }
  }

  // Esfuerzo
  for (const e of EFFORT_BADGES) {
    const id = e.threshold === undefined ? `effort.${e.kind}` : `effort.${e.kind}.${e.threshold}`;
    ids.push(id);
  }

  return ids;
}

function generateSilenceM4a(outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // ffmpeg: genera silencio y codifica a AAC .m4a
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-f', 'lavfi', '-i', `anullsrc=r=${SAMPLE_RATE}:cl=stereo`,
      '-t', String(SILENCE_DURATION),
      '-c:a', 'aac', '-b:a', '64k',
      outFile
    ]);

    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const ids = allBadgeIds();
  console.log(`Generando ${ids.length} clips placeholder en ${OUT_DIR}...`);

  let ok = 0, fail = 0;
  for (const id of ids) {
    const outFile = path.join(OUT_DIR, `${id}.m4a`);

    try {
      await generateSilenceM4a(outFile);
      console.log(`  ✅ ${id}.m4a`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${id}: ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nListo: ${ok} ok, ${fail} fallos.`);
  if (fail > 0) process.exit(1);

  console.log('\n⚠️  Estos son clips de SILENCIO (placeholder).');
  console.log('   Para voz real, instalar espeak-ng + ffmpeg y usar TTS,');
  console.log('   o grabar clips manualmente. La app hará fallback a TTS del navegador.');
}

main().catch(e => { console.error(e); process.exit(1); });