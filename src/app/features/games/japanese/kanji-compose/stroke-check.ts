/**
 * Validación **suave** del trazo (§5.3).
 *
 * "Suave" no es un adorno del informe: es la regla. El juego nunca dice *incorrecto*.
 * Compara el trazo de la niña con el de KanjiVG y devuelve qué cuadra y qué no; qué hacer
 * con eso lo decide el componente, y lo normal es repetir la demostración y volver a
 * preguntar.
 *
 * Lógica pura, sin DOM ni Angular, para poder probarla con `vitest`.
 *
 * POR QUÉ SE MIRA LA DIRECCIÓN Y NO LA FORMA
 * A los 4 años la forma sale torre siempre: eso no es un error, es una mano que todavía
 * no tiene control fino. Lo que sí se puede aprender es que **este trazo va de arriba
 * abajo** y aquel **de izquierda a derecha**. Es el orden de trazos, que es lo que
 * enseña el kanji; el dibujo fino llega solo.
 *
 * Por eso `aceptado` depende solo de la dirección. El punto de entrada se calcula igual —
 * se usa para saber qué decir, no para rechazar: una niña que empieza 2 cm a la derecha
 * pero traza en la buena dirección lo ha entendido, y no hay razón para devolvérselo.
 */

/** Un punto en coordenadas normalizadas 0..1 del lienzo. */
export interface Punto {
  x: number;
  y: number;
}

/**
 * Por debajo de esto no es un trazo, es un toque suelto. Se ignora sin commentary: contar
 * un toque como trazo hecho dejaría el kanji "terminado" con cinco dedos sobre la pantalla.
 */
export const LONGITUD_MINIMA = 0.04;

/** Tolerancia al punto de entrada, en fracción del lado del lienzo. */
export const TOLERANCIA_ENTRADA = 0.2;

/**
 * Producto escalar normalizado mínimo entre la dirección de ella y la del trazo esperado.
 *
 * 1 es la misma dirección, 0 es perpendicular, -1 es al revés. Con 0.25 se aceptan las
 * diagonas ligeramente torcidas —que las hay— y se rechaza el trazo al revés, que es el
 * fallo que de verdad hay que devolver.
 */
export const DIRECCION_MINIMA = 0.25;

export interface Veredicto {
  /** Demasiado corto para evaluar: ni se acepta ni se rechaza, se ignora. */
  esToque: boolean;
  /** Empezó cerca de por donde empieza el trazo de KanjiVG. */
  entradaOk: boolean;
  /** Fue más o menos hacia donde va. Es lo único que decide el resultado. */
  direccionOk: boolean;
  aceptado: boolean;
  /** Cuánto se alejó del punto de entrada; sirve para elegir qué decir. */
  distanciaEntrada: number;
}

/** Vector del trazo, del primer punto al último. Ese es todo su significado direccional. */
function vector(tramo: readonly Punto[]): Punto | null {
  const a = tramo[0];
  const b = tramo[tramo.length - 1];
  if (!a || !b) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.hypot(dx, dy) < 1e-9) return null;   // ida y vuelta sobre el mismo sitio
  return { x: dx, y: dy };
}

/** Distancia entre dos puntos, en fracción del lado del lienzo. */
export function distancia(a: Punto, b: Punto): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * ¿Es este el trazo que toca, o hay que probar otra vez?
 *
 * @param ella     los puntos que dejó el dedo, en el orden en que los dejó
 * @param esperado los puntos del trazo de KanjiVG, muestreados **desde su entrada**
 */
export function evaluarTrazo(ella: readonly Punto[], esperado: readonly Punto[]): Veredicto {
  const largo = Math.hypot(
    (ella[ella.length - 1]?.x ?? 0) - (ella[0]?.x ?? 0),
    (ella[ella.length - 1]?.y ?? 0) - (ella[0]?.y ?? 0),
  );
  if (ella.length < 2 || largo < LONGITUD_MINIMA) {
    return { esToque: true, entradaOk: false, direccionOk: false, aceptado: false, distanciaEntrada: Infinity };
  }

  const puntoEntrada = esperado[0];
  const distanciaEntrada = puntoEntrada ? distancia(ella[0]!, puntoEntrada) : Infinity;
  const entradaOk = distanciaEntrada <= TOLERANCIA_ENTRADA;

  const ve = vector(ella);
  const vs = vector(esperado);
  let direccionOk = false;
  if (ve && vs) {
    const prod = (ve.x * vs.x + ve.y * vs.y) / (Math.hypot(ve.x, ve.y) * Math.hypot(vs.x, vs.y));
    direccionOk = prod >= DIRECCION_MINIMA;
  }

  // Solo la dirección decide. Ver el comentario de la cabecera.
  return { esToque: false, entradaOk, direccionOk, aceptado: direccionOk, distanciaEntrada };
}
