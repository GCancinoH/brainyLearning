/**
 * Categorías de aprendizaje (los "mundos" del dashboard).
 *
 * Antes vivían duplicadas: el dashboard tenía su propia lista de títulos, iconos y
 * gradientes, y el catálogo de juegos no decía a qué categoría pertenecía cada juego.
 * Las insignias necesitan esa relación para agrupar por mundo, así que ahora hay una
 * sola fuente de verdad.
 *
 * `spanish` e `english` aún no tienen juegos; existen aquí para que el álbum y los
 * perfiles viejos puedan nombrarlas sin inventar tipos.
 */

export type LearningCategory = 'math' | 'japanese' | 'chinese' | 'spanish' | 'english';

export interface CategoryMeta {
  id: LearningCategory;
  title: string;
  icon: string;
  bgGradient: string;
  /** Nombre del mundo que se ve en el álbum */
  worldName: string;
  /** Mascota/guía que reacciona en el diálogo de insignia */
  mascot: string;
  mascotName: string;
  /** Si ya hay juegos jugables en esta categoría */
  available: boolean;
}

export const CATEGORY_META: Record<LearningCategory, CategoryMeta> = {
  math: {
    id: 'math',
    title: 'Matemáticas',
    icon: '🚀',
    bgGradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
    worldName: 'Espacio',
    mascot: '🚀',
    mascotName: 'Comandante Estrella',
    available: true,
  },
  japanese: {
    id: 'japanese',
    title: 'Japonés (日本語)',
    icon: '🇯🇵',
    bgGradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    worldName: 'Jardín de Sakura',
    mascot: '🌸',
    mascotName: 'Sakura',
    available: true,
  },
  chinese: {
    id: 'chinese',
    title: 'Chino (中文）',
    icon: '🇨🇳',
    bgGradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
    worldName: 'Planeta Dragón',
    mascot: '🐉',
    mascotName: 'Sabio Long',
    available: true,
  },
  spanish: {
    id: 'spanish',
    title: 'Lectura y Comprensión',
    icon: '📖',
    bgGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
    worldName: 'Bosque de Cuentos',
    mascot: '🦉',
    mascotName: 'Búho Lector',
    available: false,
  },
  english: {
    id: 'english',
    title: 'Inglés',
    icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    bgGradient: 'linear-gradient(135deg, #a855f7 0%, #6d28d9 100%)',
    worldName: 'Laboratorio',
    mascot: '🔬',
    mascotName: 'Profe Lab',
    available: false,
  },
};

export const CATEGORY_ORDER: LearningCategory[] = ['math', 'japanese', 'chinese', 'spanish', 'english'];
