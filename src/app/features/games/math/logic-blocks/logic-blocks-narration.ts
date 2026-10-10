import { Attr, Round } from './logic-blocks-problem';

/**
 * Guion hablado de "Clasificador de bloques".
 *
 * Lógica pura: aquí no hay audio, solo *qué se diría* y con qué clave se busca el clip.
 * Quien reproduce es `Narrator`; quien dibuja las muestras es `RuleBadge`.
 *
 * POR QUÉ FRASES COMPLETAS Y NO FRAGMENTOS PEGADOS
 * El español exige concordancia: "todas las figuras **rojas**" / "todos los **círculos**".
 * Si se concatenan clips ("figuras" + "rojas") suena entrecortado y además obliga a tener
 * una matriz de combinaciones. El conjunto es pequeño (6 reglas), así que se generan enteras.
 *
 * POR QUÉ NINGUNA FRASE VEREDICTA
 * Las preguntas del juego son socráticas: "¿esta figura es roja?", no "está mal".
 * Una pre-lectora que recibe un veredicto no puede entender *por qué* está mal, solo que
 * alguien mayor lo decidió. Además, ninguna frase contiene palabras como "mal" o
 * "incorrecto": hay un test (`logic-blocks-narration.spec.ts`) que lo verifica, igual que
 * en `kanji-composition`.
 */

export type ClipKey = string;

/** Carpeta donde viven los `.wav`. Cambiar aquí y nowhere más. */
export const CLIP_BASE = 'audio/logic-blocks/es';

export const clipPath = (key: ClipKey): string => `${CLIP_BASE}/${key}.wav`;

/** Palabras que un juego con método Zvonkin no puede pronunciar nunca. */
export const FORBIDDEN_IN_NARRATION = [
  'incorrecto', 'está mal', 'mal hecho', 'no es', 'equivocado', 'fallaste'
];

const ADJ = {
  color: { red: 'rojas', blue: 'azules', yellow: 'amarillas' },
  shape: { circle: 'círculos', square: 'cuadrados', triangle: 'triángulos' },
  size: { big: 'grandes', small: 'pequeñas' }
} as const;

const SINGULAR = {
  color: { red: 'roja', blue: 'azul', yellow: 'amarilla' },
  shape: { circle: 'círculo', square: 'cuadrado', triangle: 'triángulo' },
  size: { big: 'grande', small: 'pequeña' }
} as const;

/** "rojas", "círculos", "grande"… */
const plural = (a: Attr): string => (ADJ[a.kind] as Record<string, string>)[a.value];
/** "roja", "círculo", "grande"… */
const singular = (a: Attr): string => (SINGULAR[a.kind] as Record<string, string>)[a.value];

// ============================================
// TEXTO DE CADA CLIP  (fuente de verdad)
// ============================================

export const CLIP_TEXT: Record<ClipKey, string> = {
  // --- Consigna de la ronda ---
  'lb.one.color.red': 'Lleva a la canasta todas las figuras rojas.',
  'lb.one.color.blue': 'Lleva a la canasta todas las figuras azules.',
  'lb.one.color.yellow': 'Lleva a la canasta todas las figuras amarillas.',
  'lb.one.shape.circle': 'Lleva a la canasta todos los círculos.',
  'lb.one.shape.square': 'Lleva a la canasta todos los cuadrados.',
  'lb.one.shape.triangle': 'Lleva a la canasta todos los triángulos.',
  'lb.two.generic': 'Pon cada figura en su canasta.',
  'lb.venn.generic': 'Pon cada figura donde vive. En el medio, las que son de las dos.',

  // --- Etiqueta de una canasta o insignia (al tocarla) ---
  'lb.label.color.red': 'Rojas',
  'lb.label.color.blue': 'Azules',
  'lb.label.color.yellow': 'Amarillas',
  'lb.label.shape.circle': 'Círculos',
  'lb.label.shape.square': 'Cuadrados',
  'lb.label.shape.triangle': 'Triángulos',

  // --- Preguntas socráticas (tras un error) ---
  'lb.q.color.red': '¿Esta figura es roja?',
  'lb.q.color.blue': '¿Esta figura es azul?',
  'lb.q.color.yellow': '¿Esta figura es amarilla?',
  'lb.q.shape.circle': '¿Esta figura es un círculo?',
  'lb.q.shape.square': '¿Esta figura es un cuadrado?',
  'lb.q.shape.triangle': '¿Esta figura es un triángulo?',
  'lb.q.which-looks': '¿Con cuál se parece?',

  // --- Navegación y tutorial ---
  'lb.go.tap': 'Ahora toca la canasta.',
  'lb.intro.look': '¡Mira!',
  'lb.intro.now-you': 'Ahora tú.',
  'lb.retry': 'Mmm… ¿lo pensamos otra vez?',

  // --- Cierre ---
  'lb.done': '¡Todas están en su lugar!',

  // --- Venn (Fase 4) ---
  'lb.venn.both': 'Las dos',
  'lb.venn.none': 'Ni una ni otra'
};

/**
 * El manifiesto en el formato que espera `Narrator`.
 *
 * Se **deriva** de `CLIP_TEXT` en vez de escribirse aparte: son todos en español, y dos
 * listas paralelas acabarían divergiendo sin que nadie se entere (el síntoma sería un clip
 * que suena con un texto que el juego nunca dice).
 */
export const CLIP_MANIFEST: Record<string, { tts: string; lang: string }> =
  Object.fromEntries(Object.entries(CLIP_TEXT).map(([k, tts]) => [k, { tts, lang: 'es-MX' }]));

// ============================================
// RESOLUCIÓN DE CLAVES
// ============================================

/**
 * Clave de la etiqueta hablada de una regla, o `null` si no hay clip para ese `Attr`.
 *
 * Devuelve `null` y **no** una clave inexistente a propósito: si se inventara una clave,
 * `Narrator` buscaría un `.wav` que no está, caería al TTS y, si tampoco hay voz, la niña
 * oiría un silencio sin explicación. Un `null` explícito permite decidir en su lugar.
 */
export function clipForLabel(attr: Attr): ClipKey | null {
  const key = `lb.label.${attr.kind}.${attr.value}`;
  return key in CLIP_TEXT ? key : null;
}

/**
 * Pregunta socrática tras un error, o `null` si no hay clip.
 *
 * Modo 'two' no usa esta: con dos canastas, "¿es roja?" no orienta, así que se usa
 * `lb.q.which-looks`, que obliga a **comparar** con las dos muestras.
 */
export function clipForQuestion(attr: Attr): ClipKey | null {
  const key = `lb.q.${attr.kind}.${attr.value}`;
  return key in CLIP_TEXT ? key : null;
}

/** Texto de la consigna de la ronda. */
export function textForRule(round: Round): string | null {
  if (round.mode === 'one') {
    const key = `lb.one.${round.a.kind}.${round.a.value}`;
    return key in CLIP_TEXT ? CLIP_TEXT[key] : null;
  }
  if (round.mode === 'two') return CLIP_TEXT['lb.two.generic'];
  return CLIP_TEXT['lb.venn.generic'];
}

/** Clave de la consigna de la ronda, o `null` si no hay clip. */
export function clipForRule(round: Round): ClipKey | null {
  if (round.mode === 'one') {
    const key = `lb.one.${round.a.kind}.${round.a.value}`;
    return key in CLIP_TEXT ? key : null;
  }
  return round.mode === 'two' ? 'lb.two.generic' : 'lb.venn.generic';
}

/**
 * El texto que se dice al tocar una canasta: en 'two' cada canasta tiene su propia regla,
 * y eso es justo lo que una pre-lectora no puede leer.
 */
export function clipForZone(round: Round, region: 'A' | 'B'): ClipKey | null {
  if (round.mode !== 'two' || !round.b) return null;
  return clipForLabel(region === 'A' ? round.a : round.b);
}

// Reexportado para que el componente no tenga que importar el problema entero
export { plural as pluralFor, singular as singularFor };