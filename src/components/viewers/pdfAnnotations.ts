import { PDFDocument, rgb } from 'pdf-lib';

export type HighlightAnnotation = {
  type: 'highlight';
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity: number;
};

export type PenAnnotation = {
  type: 'pen';
  page: number;
  points: Array<{ x: number; y: number }>;
  color: string;
  width: number;
};

export type TextAnnotation = {
  type: 'text';
  page: number;
  x: number;
  y: number;
  text: string;
  size: number;
  color: string;
};

export type PdfAnnotation = HighlightAnnotation | PenAnnotation | TextAnnotation;

export type PdfEditState = {
  version: 1;
  annotations: PdfAnnotation[];
};

export function safeParseState(value: string): PdfEditState {
  try {
    const v = JSON.parse(value);
    if (v && v.version === 1 && Array.isArray(v.annotations)) return v;
  } catch {
    return { version: 1, annotations: [] };
  }
  return { version: 1, annotations: [] };
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim();
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(v, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  return rgb(r, g, b);
}

export async function applyPdfAnnotations(pdfBytes: Uint8Array, state: PdfEditState) {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  for (const a of state.annotations) {
    const p = pages[a.page - 1];
    if (!p) continue;
    const { width, height } = p.getSize();

    if (a.type === 'highlight') {
      const c = hexToRgb(a.color);
      const x = a.x * width;
      const y = (1 - a.y - a.h) * height;
      const w = a.w * width;
      const h = a.h * height;
      p.drawRectangle({ x, y, width: w, height: h, color: c, opacity: clamp01(a.opacity) });
    }

    if (a.type === 'pen') {
      const c = hexToRgb(a.color);
      const pts = a.points.map((pt) => ({ x: pt.x * width, y: (1 - pt.y) * height }));
      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];
        p.drawLine({ start: p0, end: p1, thickness: a.width, color: c });
      }
    }

    if (a.type === 'text') {
      const c = hexToRgb(a.color);
      const x = a.x * width;
      const y = (1 - a.y) * height;
      p.drawText(a.text, { x, y, size: a.size, color: c });
    }
  }

  return await pdfDoc.save();
}
