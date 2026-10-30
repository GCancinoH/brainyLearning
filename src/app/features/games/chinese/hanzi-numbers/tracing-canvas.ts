/**
 * Canvas de trazado para Números Hanzi (一–十).
 * Lógica pura: solo dibuja y valida trazos con `evaluarTrazo`.
 * No tiene Angular: se usa desde el componente vía `viewChild`.
 */
import { evaluarTrazo, type Punto, type Veredicto, LONGITUD_MINIMA } from '../../japanese/kanji-compose/stroke-check';
import { KANJI_TRAZOS, type KanjiTrazos } from '@core/learning/kanji-strokes';

export interface TrazoDibujado {
  puntos: Punto[];
  veredicto: Veredicto | null;
}

export class TracingCanvas {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private kanji: string;
  private trazosKanji: readonly string[];
  private vb: string;
  private trazoActual = 0;
  private puntos: Punto[] = [];
  private trazosDibujados: TrazoDibujado[] = [];
  private readonly onCambio: (trazo: number, veredicto: Veredicto | null) => void;
  private dibujando = false;
  private readonly dpr: number;

  constructor(
    canvas: HTMLCanvasElement,
    kanji: string,
    onCambio: (trazo: number, veredicto: Veredicto | null) => void,
  ) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context no disponible');
    this.ctx = ctx;
    this.onCambio = onCambio;

    const datos = KANJI_TRAZOS[kanji];
    if (!datos) throw new Error(`Kanji ${kanji} no está en KANJI_TRAZOS`);
    this.kanji = kanji;
    this.trazosKanji = datos.trazos;
    this.vb = datos.vb;
    this.dpr = window.devicePixelRatio || 1;

    this.configurarCanvas();
    this.dibujarGuia();
    this.vincularEventos();
  }

  private configurarCanvas(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = width * this.dpr;
    this.canvas.height = height * this.dpr;
    // Escalamos el contexto para trabajar en coordenadas CSS (1 px = 1 px CSS)
    this.ctx.scale(this.dpr, this.dpr);
  }

  private parseVB(): { x: number; y: number; w: number; h: number } {
    const [x, y, w, h] = this.vb.split(' ').map(Number);
    return { x, y, w, h };
  }

  /** Convierte coordenadas del viewBox (0..109) a coordenadas CSS del canvas (0..width). */
  private puntoVBScaled(x: number, y: number): { x: number; y: number } {
    const vb = this.parseVB();
    const { width, height } = this.canvas.getBoundingClientRect();
    const ratioX = width / vb.w;
    const ratioY = height / vb.h;
    return {
      x: (x - vb.x) * ratioX,
      y: (y - vb.y) * ratioY,
    };
  }

  /** Convierte un path SVG (M, L, C, Q, Z) a puntos muestreados en coordenadas CSS del canvas. */
  private pathToPuntos(path: string): Punto[] {
    const puntos: Punto[] = [];
    // Regex que captura comandos SVG path y sus coordenadas
    const regex = /([MLCQZH])([^MLCQZH]*)/gi;
    let match;
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;

    while ((match = regex.exec(path)) !== null) {
      const tipo = match[1].toUpperCase();
      const coordsStr = match[2].trim();
      if (!coordsStr) continue;
      const coords = coordsStr.split(/[\s,]+/).filter(Boolean).map(Number);

      if (tipo === 'M') {
        // Move to absolute
        if (coords.length >= 2) {
          lastX = coords[0];
          lastY = coords[1];
        }
        startX = lastX;
        startY = lastY;
      } else if (tipo === 'L') {
        // Line to absolute - muestreamos 10 puntos
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          const x = lastX + (coords[0] - lastX) * t;
          const y = lastY + (coords[1] - lastY) * t;
          const p = this.puntoVBScaled(x, y);
          puntos.push({ x: p.x, y: p.y });
        }
        lastX = coords[0];
        lastY = coords[1];
      } else if (tipo === 'C') {
        // Cubic Bézier - 3 puntos de control + final
        // Muestreamos 20 puntos a lo largo de la curva
        const x1 = coords[0], y1 = coords[1];
        const x2 = coords[2], y2 = coords[3];
        const x3 = coords[4], y3 = coords[5];
        for (let i = 0; i <= 20; i++) {
          const t = i / 20;
          const u = 1 - t;
          const uu = u * u;
          const uuu = uu * u;
          const tt = t * t;
          const ttt = tt * t;
          const x = uuu * lastX + 3 * uu * t * x1 + 3 * u * tt * x2 + ttt * coords[4];
          const y = uuu * lastY + 3 * uu * t * y1 + 3 * u * tt * y2 + ttt * coords[5];
          const p = this.puntoVBScaled(x, y);
          puntos.push({ x: p.x, y: p.y });
        }
        lastX = coords[4];
        lastY = coords[5];
      } else if (tipo === 'Q') {
        // Quadratic Bézier
        const x1 = coords[0], y1 = coords[1];
        for (let i = 0; i <= 15; i++) {
          const t = i / 15;
          const u = 1 - t;
          const x = u * u * lastX + 2 * u * t * x1 + t * t * coords[2];
          const y = u * u * lastY + 2 * u * t * y1 + t * t * coords[3];
          const p = this.puntoVBScaled(x, y);
          puntos.push({ x: p.x, y: p.y });
        }
        lastX = coords[2];
        lastY = coords[3];
      } else if (tipo === 'Z') {
        // Close path - línea al inicio
        for (let i = 0; i <= 5; i++) {
          const t = i / 5;
          const x = lastX + (startX - lastX) * t;
          const y = lastY + (startY - lastY) * t;
          const p = this.puntoVBScaled(x, y);
          puntos.push({ x: p.x, y: p.y });
        }
        lastX = startX;
        lastY = startY;
      }
    }
    return puntos;
  }

  private dibujarGuia(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    // Dibuja la guía (trazo esperado) en coordenadas CSS
    this.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    this.ctx.lineWidth = 6;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    for (let i = 0; i < this.trazosKanji.length; i++) {
      const path = this.trazosKanji[i];
      const puntos = this.pathToPuntos(this.trazosKanji[i]);
      if (puntos.length > 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(puntos[0].x, puntos[0].y);
        for (let j = 1; j < puntos.length; j++) {
          this.ctx.lineTo(puntos[j].x, puntos[j].y);
        }
        this.ctx.stroke();
      }
    }

    // Dibuja trazos ya completados (verdes)
    this.ctx.strokeStyle = '#22c55e';
    this.ctx.lineWidth = 5;
    for (const t of this.trazosDibujados) {
      if (t.puntos.length > 1) {
        this.ctx.beginPath();
        this.ctx.moveTo(t.puntos[0].x, t.puntos[0].y);
        for (let i = 1; i < t.puntos.length; i++) {
          this.ctx.lineTo(t.puntos[i].x, t.puntos[i].y);
        }
        this.ctx.stroke();
      }
    }

    // Dibuja trazo actual en curso (amarillo)
    if (this.puntos.length > 1) {
      this.ctx.strokeStyle = '#fde047';
      this.ctx.lineWidth = 5;
      this.ctx.beginPath();
      this.ctx.moveTo(this.puntos[0].x, this.puntos[0].y);
      for (let i = 1; i < this.puntos.length; i++) {
        this.ctx.lineTo(this.puntos[i].x, this.puntos[i].y);
      }
      this.ctx.stroke();
    }
  }

  private vincularEventos(): void {
    const add = (e: PointerEvent) => {
      if (!this.dibujando) return;
      const rect = this.canvas.getBoundingClientRect();
      this.puntos.push({
        x: (e.clientX - rect.left) * this.dpr,
        y: (e.clientY - rect.top) * this.dpr,
      });
      this.dibujarGuia();
    };

    const start = (e: PointerEvent) => {
      this.dibujando = true;
      this.puntos = [];
      const rect = this.canvas.getBoundingClientRect();
      this.puntos.push({
        x: (e.clientX - rect.left) * this.dpr,
        y: (e.clientY - rect.top) * this.dpr,
      });
    };

    const end = () => {
      if (!this.dibujando) return;
      this.dibujando = false;
      this.evaluarTrazoActual();
    };

    this.canvas.addEventListener('pointerdown', start);
    this.canvas.addEventListener('pointermove', add);
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointerleave', end);
  }

  private evaluarTrazoActual(): void {
    if (this.trazoActual >= this.trazosKanji.length) return;

    const esperado = this.pathToPuntos(this.trazosKanji[this.trazoActual]);
    if (esperado.length === 0) return;

    const veredicto = evaluarTrazo(this.puntos, esperado);

    this.trazosDibujados.push({
      puntos: this.puntos,
      veredicto,
    });

    this.onCambio(this.trazoActual, veredicto);

    if (veredicto.aceptado) {
      this.trazoActual++;
      this.puntos = [];
      if (this.trazoActual >= this.trazosKanji.length) {
        this.onCambio(-1, null); // señal de fin
      }
    }
    this.dibujarGuia();
  }

  reiniciar(): void {
    this.trazoActual = 0;
    this.puntos = [];
    this.trazosDibujados = [];
    this.dibujarGuia();
  }

  get progreso(): { actual: number; total: number } {
    return { actual: this.trazoActual, total: this.trazosKanji.length };
  }
}