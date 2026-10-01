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
}

export const MATH_GAMES: MathGameInfo[] = [
  {
    id: 'space-addition',
    title: 'Suma Espacial',
    description: '¡Aprende a sumar contando cohetes espaciales!',
    icon: '🛸',
    route: '/games/math/space-addition',
    cssClass: 'addition',
    unlockRequirement: null
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
    }
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
    }
  }
];
