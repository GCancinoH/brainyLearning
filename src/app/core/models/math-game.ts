export interface MathGameInfo {
  id: string;
  title: string;
  description: string;
  icon: string;
  route: string;
  cssClass: string; // 'addition', 'subtraction', 'multiplication'
  unlockRequirement: {
    requiredGameId: string;
    requiredLevel: number;
    description: string;
  } | null;
  minAge?: 4 | 6;
  startLevel?: { 4: number; 6: number };
}

export const MATH_GAMES: MathGameInfo[] = [
  {
    id: 'space-addition',
    title: 'Suma Espacial',
    description: '¡Aprende a sumar contando cohetes espaciales!',
    icon: '🛸',
    route: '/games/math/space-addition',
    cssClass: 'addition',
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 3 },
  },
  {
    id: 'space-load-ship',
    title: 'Carga la Nave',
    description: 'Arrastra los cohetes a la bahía, cuéntalos y descubre cuántos hay',
    icon: '📦',
    route: '/games/math/space-load-ship',
    cssClass: 'load-ship',
    unlockRequirement: {
      requiredGameId: 'space-addition',
      requiredLevel: 10,
      description: 'Llega al Nivel 10 en Suma Espacial'
    },
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'space-fuel-tank',
    title: 'El Tanque de Combustible',
    description: 'Llena el tanque con bloques y descubre todas las formas de lograrlo',
    icon: '⛽',
    route: '/games/math/space-fuel-tank',
    cssClass: 'fuel-tank',
    unlockRequirement: {
      requiredGameId: 'space-load-ship',
      requiredLevel: 5,
      description: 'Llega al Nivel 5 en Carga la Nave'
    },
    minAge: 4,
    startLevel: { 4: 1, 6: 3 },
  },
  {
    id: 'space-rescue-mission',
    title: 'Misión de Rescate',
    description: 'Juego en pareja: una planea, la otra carga, y juntas cuentan las estrellas',
    icon: '🛟',
    route: '/games/math/space-rescue-mission',
    cssClass: 'rescue-mission',
    unlockRequirement: {
      requiredGameId: 'space-fuel-tank',
      requiredLevel: 3,
      description: 'Llega al Nivel 3 en El Tanque de Combustible'
    },
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'space-subtraction',
    title: 'Resta en la Estación',
    description: 'Despega asteroides y cuenta los que quedan',
    icon: '☄️',
    route: '/games/math/space-subtraction',
    cssClass: 'subtraction',
    unlockRequirement: {
      requiredGameId: 'space-addition',
      requiredLevel: 6,
      description: 'Llega al Nivel 6 en Suma Espacial'
    },
    startLevel: { 4: 1, 6: 3 },
  },
  {
    id: 'space-multiplication',
    title: 'Multiplicación Espacial',
    description: 'Agrupa constelaciones y multiplica estrellas',
    icon: '⭐',
    route: '/games/math/space-multiplication',
    cssClass: 'multiplication',
    unlockRequirement: {
      requiredGameId: 'space-subtraction',
      requiredLevel: 6,
      description: 'Llega al Nivel 6 en Resta Espacial'
    },
    minAge: 6,
  },
  {
    id: 'logic-blocks',
    title: 'Clasificador de Bloques',
    description: 'Clasifica figuras por color, forma y tamaño, y descubre qué hay en el medio del diagrama',
    icon: '🔷',
    route: '/games/math/logic-blocks',
    cssClass: 'logic-blocks',
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
  {
    id: 'paths-bridges',
    title: 'Caminos y Puentes',
    description: 'Traza caminos con el dedo: lleva a la rana a casa y cruza todos los puentes una sola vez',
    icon: '🌉',
    route: '/games/math/paths-bridges',
    cssClass: 'paths-bridges',
    unlockRequirement: null,
    minAge: 4,
    startLevel: { 4: 1, 6: 1 },
  },
];
