export interface JapaneseGameInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  cssClass: string; // 'listening', 'kanji', 'nature', 'calendar', 'clock', 'word-builder'
  unlockRequirement: {
    requiredGameId: string;
    requiredLevel: number;
    description: string;
  } | null;
  minAge?: 4 | 6;
  startLevel?: { 4: number; 6: number };
}

export const JAPANESE_GAMES: JapaneseGameInfo[] = [
  {
    id: 'japanese-listening',
    title: '¿Qué escuchaste?',
    description: 'Escucha palabras en japonés y elige la imagen correcta',
    icon: '👂',
    route: '/games/japanese/listening',
    cssClass: 'listening',
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'japanese-kanji-compose',
    title: 'Construye el Kanji',
    description: 'Descubre de qué piezas está hecho cada kanji, colócalas y luego dibújalo tú',
    icon: '🧩',
    route: '/games/japanese/kanji-compose',
    cssClass: 'kanji-compose',
    // Sin candado a propósito: se deja accesible mientras se afinan los niveles con las
    // niñas. Cuando esté listo, encadenarlo (p. ej. tras Kanji Naturaleza nivel 3).
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'japanese-kanji-find',
    title: 'Encuentra el Kanji',
    description: 'Relaciona kanji con su significado y lectura',
    icon: '🔍',
    route: '/games/japanese/kanji-find',
    cssClass: 'kanji',
    unlockRequirement: {
      requiredGameId: 'japanese-listening',
      requiredLevel: 16,
      description: 'Llega al Nivel 3 en ¿Qué escuchaste?'
    },
    minAge: 6,
  },
  {
    id: 'japanese-nature',
    title: 'Kanji Naturaleza',
    description: '12 kanji de la naturaleza con actividades visuales',
    icon: '🌳',
    route: '/games/japanese/nature',
    cssClass: 'nature',
    unlockRequirement: {
      requiredGameId: 'japanese-kanji-find',
      requiredLevel: 3,
      description: 'Llega al Nivel 3 en Encuentra el Kanji'
    },
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'japanese-calendar',
    title: 'Calendario Japonés',
    description: 'Días de la semana, kanji, lectura y descomposición',
    icon: '📅',
    route: '/games/japanese/calendar',
    cssClass: 'calendar',
    unlockRequirement: {
      requiredGameId: 'japanese-kanji-find',
      requiredLevel: 2,
      description: 'Llega al Nivel 2 en Encuentra el Kanji'
    },
    minAge: 6,
  },
  {
    id: 'japanese-clock',
    title: 'Reloj Japonés',
    description: 'Aprende a leer la hora en japonés',
    icon: '🕐',
    route: '/games/japanese/clock',
    cssClass: 'clock',
    unlockRequirement: {
      requiredGameId: 'japanese-calendar',
      requiredLevel: 2,
      description: 'Llega al Nivel 2 en Calendario Japonés'
    },
    minAge: 6,
  },
  {
    id: 'japanese-word-builder',
    title: 'Construye Palabras',
    description: 'Escucha y construye palabras y horas',
    icon: '🧩',
    route: '/games/japanese/word-builder',
    cssClass: 'word-builder',
    unlockRequirement: {
      requiredGameId: 'japanese-clock',
      requiredLevel: 3,
      description: 'Llega al Nivel 3 en Reloj Japonés'
    },
    minAge: 6,
  }
];
