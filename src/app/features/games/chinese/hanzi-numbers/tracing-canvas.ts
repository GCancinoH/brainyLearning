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

    this.configurarCanvas();
    this.dibujarGuia();
    this.vincularEventos();
  }

  private configurarCanvas(): void {
    const { width, height } = this.canvas.getBoundingClientRect();
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  }

  private parseVB(): { x: number; y: number; w: number; h: number } {
    const [x, y, w, h] = this.vb.split(' ').map(Number);
    return { x, y, w, h };
  }

  private puntoVBScaled(x: number, y: number): { x: number; y: number } {
    const vb = this.parseVB();
    const ratioX = this.canvas.width / vb.w;
    const ratioY = this.canvas.height / vb.h;
    return {
      x: (x - vb.x) * ratioX,
      y: (y - vb.y) * ratioY,
    };
  }

  private pathToPuntos(path: string): Punto[] {
    // Convierte un path SVG simple (solo M y C/L) a puntos muestreados
    // Nota: simplificado para trazos lineales; KanjiVG usa curvas Bézier
    const puntos: Punto[] = [];
    const regex = /([MLC])([^MLC]*)/g;
    let match;
    let lastX = 0;
    let lastY = 0;

    while ((match = regex.exec(this.trazosKanji[this.trazoActual])) !== null) {
      const tipo = match[1];
      const coords = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
      if (tipo === 'M') {
        lastX = coords[0];
        lastY = coords[1];
      } else if (tipo === 'L' || tipo === 'C') {
        // Para simplicidad: muestreamos 10 puntos por segmento
        for (let i = 0; i <= 10; i++) {
          const t = i / 10;
          // Aproximación lineal (KanjiVG usa curvas, pero esto sirve para dirección)
          const x = lastX + (coords[coords.length - 2] - lastX) * t;
          const y = lastY + (coords[coords.length - 1] - lastY) * t;
          const p = this.puntoVBScaled(x, y);
          puntos.push({ x: p.x, y: p.y });
        }
        lastX = coords[coords.length - 2];
        lastY = coords[coords.length - 1];
      }
    }
    return puntos;
  }

  private dibujarGuia(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.strokeStyle = 'rgba(0,0,0,0.08)';
    this.ctx.lineWidth = 6;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    for (let i = 0; i < this.trazosKanji.length; i++) {
      const path = this.trazosKanji[i];
      this.ctx.beginPath();
      // Dibuja el path SVG directamente (simplificado)
      this.ctx.stroke(new Path2D(path));
    }

    // Dibuja trazos ya completados
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

    // Dibuja trazo actual en curso
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
        x: (e.clientX - rect.left) * window.devicePixelRatio,
        y: (e.clientY - rect.top) * window.devicePixelRatio,
      });
      this.dibujarGuia();
    };

    const start = (e: PointerEvent) => {
      this.dibujando = true;
      this.puntos = [];
      const rect = this.canvas.getBoundingClientRect();
      this.puntos.push({
        x: (e.clientX - rect.left) * window.devicePixelRatio,
        y: (e.clientY - rect.top) * window.devicePixelRatio,
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
        // Todos los trazos completados
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