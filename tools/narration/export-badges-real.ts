#!/usr/bin/env npx tsx
/**
 * Genera clips de audio .m4a REALES para insignias usando Google TTS API.
 *
 * Uso:
 *   npx tsx tools/narration/export-badges-real.ts
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { getAudioUrl } from 'google-tts-api';
import { spawn } from 'node:child_process';

const OUT_DIR = path.resolve(import.meta.dirname, '../../public/audio/badges');

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
  { kind: 'retry', threshold: 1, voice: '¡Lo volviste a intentar!' },
  { kind: 'retry', threshold: 10, voice: '¡Diez veces lo volviste a intentar!' },
  { kind: 'retry', threshold: 25, voice: '¡Veinticinco veces lo volviste a intentar!' },
  { kind: 'explorer', threshold: 3, voice: '¡Probaste tres juegos distintos!' },
  { kind: 'explorer', threshold: 6, voice: '¡Seis juegos distintos!' },
  { kind: 'explorer', threshold: 10, voice: '¡Diez juegos distintos!' },
  { kind: 'days', threshold: 3, voice: '¡Volviste a jugar tres días!' },
  { kind: 'days', threshold: 7, voice: '¡Siete días de juego!' },
  { kind: 'days', threshold: 14, voice: '¡Catorce días de juego!' },
  { kind: 'calm', threshold: undefined, voice: '¡Terminaste una sesión completa!' },
  { kind: 'firstTry', threshold: 5, voice: '¡Cinco aciertos a la primera!' },
  { kind: 'firstTry', threshold: 15, voice: '¡Quince aciertos a la primera!' },
  { kind: 'firstTry', threshold: 30, voice: '¡Treinta aciertos a la primera!' },
  { kind: 'help', threshold: 1, voice: '¡Escuchaste la pista y seguiste aprendiendo!' },
  { kind: 'help', threshold: 5, voice: '¡Cinco veces escuchaste la pista!' },
  { kind: 'help', threshold: 15, voice: '¡Quince veces escuchaste la pista!' },
  { kind: 'perfect', threshold: 1, voice: '¡Una ronda perfecta sin ayuda ni errores!' },
  { kind: 'perfect', threshold: 3, voice: '¡Tres rondas perfectas!' },
  { kind: 'perfect', threshold: 10, voice: '¡Diez rondas perfectas!' },
  { kind: 'welcome', threshold: undefined, voice: '¡Bienvenida a tu aventura de aprendizaje!' },
];

function voiceForBadge(id: string): string {
  // Juegos: hanzi-numbers.seed, space-addition.bronze, etc.
  if (id.includes('.')) {
    const parts = id.split('.');
    if (['seed', 'bronze', 'silver', 'gold'].includes(parts[1])) {
      const game = GAMES.find(g => g.id === parts[0]);
      if (game) {
        const tierLabel = { seed: 'Primeros pasos', bronze: 'Bronce', silver: 'Plata', gold: 'Oro' }[parts[1]];
        return `¡${tierLabel} en ${game.title}!`;
      }
    }
  }

  // Mundo: cat.chinese.explorer, cat.math.bronze, etc.
  if (id.startsWith('cat.')) {
    const parts = id.split('.');
    const category = parts[1] as keyof typeof CATEGORY_META;
    const kind = parts[2];
    const meta = CATEGORY_META[category];
    if (!meta) return '';
    if (kind === 'explorer') {
      return `¡Exploradora de ${meta.worldName}! Probaste tres juegos distintos.`;
    }
    if (['bronze', 'silver', 'gold'].includes(kind)) {
      const tierLabel = { bronze: 'Bronce', silver: 'Plata', gold: 'Oro' }[kind];
      return `¡${tierLabel} en ${meta.worldName}!`;
    }
  }

  // Esfuerzo: effort.retry.1, effort.help.5, etc.
  if (id.startsWith('effort.')) {
    const parts = id.split('.');
    const kind = parts[1];
    const threshold = parts[2] ? parseInt(parts[2], 10) : undefined;
    const effort = EFFORT_BADGES.find(e => e.kind === kind && e.threshold === threshold);
    if (effort) return effort.voice;
  }

  return '';
}

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

function downloadMp3(url: string, outFile: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-i', url,
      '-c:a', 'aac', '-b:a', '128k',
      outFile
    ]);

    ffmpeg.on('error', reject);
    ffmpeg.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`)));
  });
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const ids = allBadgeIds();
  console.log(`Generando ${ids.length} clips REALES en ${OUT_DIR}...`);

  let ok = 0, fail = 0;
  for (const id of ids) {
    const text = voiceForBadge(id);
    if (!text) {
      console.warn(`  ⚠️  ${id}: sin texto de voz`);
      continue;
    }
    const outFile = path.join(OUT_DIR, `${id}.m4a`);

    try {
      // Google TTS devuelve URL de audio MP3
      const url = getAudioUrl(text, { lang: 'es', slow: false, host: 'https://translate.google.com' });
      await downloadMp3(url, outFile);
      console.log(`  ✅ ${id}.m4a`);
      ok++;
    } catch (e) {
      console.error(`  ❌ ${id}: ${(e as Error).message}`);
      fail++;
    }
  }

  console.log(`\nListo: ${ok} ok, ${fail} fallos.`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });