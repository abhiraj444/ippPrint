import { PDFDocument } from 'pdf-lib';

export interface InvertOptions {
  mode: 'none' | 'all' | 'custom' | 'grayscale';
  pageRange?: string; // e.g. "1, 3-5, 8"
  highContrast?: boolean;
}

/**
 * Parse a human page range string (e.g. "1, 3-5, 8") into a 0-indexed Set of page numbers
 */
export function parsePageRange(rangeStr: string, totalPages: number): Set<number> {
  const result = new Set<number>();
  if (!rangeStr || !rangeStr.trim()) return result;

  const parts = rangeStr.split(',').map((p) => p.trim());
  for (const part of parts) {
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => parseInt(s.trim(), 10));
      const start = Math.max(1, isNaN(startStr) ? 1 : startStr);
      const end = Math.min(totalPages, isNaN(endStr) ? totalPages : endStr);
      for (let i = start; i <= end; i++) {
        result.add(i - 1);
      }
    } else {
      const pageNum = parseInt(part, 10);
      if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= totalPages) {
        result.add(pageNum - 1);
      }
    }
  }
  return result;
}

/**
 * Invert canvas pixel data for dark mode / ink saving
 */
export function invertCanvasImageData(ctx: CanvasRenderingContext2D, width: number, height: number, highContrast = false) {
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  for (let i = 0; i < data.length; i += 4) {
    let r = 255 - data[i];
    let g = 255 - data[i + 1];
    let b = 255 - data[i + 2];

    if (highContrast) {
      // Convert to luminance
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      // High contrast thresholding (turns near-white background into pure white)
      if (lum > 220) {
        r = 255; g = 255; b = 255;
      } else if (lum < 50) {
        r = 0; g = 0; b = 0;
      }
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
}
