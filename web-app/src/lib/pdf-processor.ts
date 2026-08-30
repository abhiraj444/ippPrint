import { PDFDocument, rgb, degrees, PageSizes } from 'pdf-lib';
import { invertCanvasImageData } from '@/lib/color-inverter';

export interface NupOptions {
  nup: number; // 1, 2, 3, 4, 6, 9
  rows?: number;
  cols?: number;
  orientation: 'auto' | 'portrait' | 'landscape';
  drawBorders: boolean;
  marginPt: number; // margin in points (default: 20)
  gutterPt: number; // space between slots in points (default: 10)
  paperSize: 'A4' | 'Letter' | 'Legal';
  dpi?: number; // 150 or 300 (default: 150)
}

const PAPER_DIMENSIONS: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612.0, 792.0],
  Legal: [612.0, 1008.0],
};

/**
 * Convert an image (JPEG, PNG, WEBP, BMP, GIF, etc.) to a standard A4-fitted PDF document
 */
export async function imageToPdf(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const [a4W, a4H] = PAPER_DIMENSIONS.A4;

  // 1. Try direct embedding if standard PNG or JPG
  try {
    const pdfDoc = await PDFDocument.create();
    let image;

    if (mimeType && mimeType.toLowerCase().includes('png')) {
      try {
        image = await pdfDoc.embedPng(imageBytes);
      } catch {
        image = await pdfDoc.embedJpg(imageBytes);
      }
    } else {
      try {
        image = await pdfDoc.embedJpg(imageBytes);
      } catch {
        image = await pdfDoc.embedPng(imageBytes);
      }
    }

    if (image) {
      const isLandscape = image.width > image.height;
      const pageW = isLandscape ? a4H : a4W;
      const pageH = isLandscape ? a4W : a4H;

      const scale = Math.min((pageW - 40) / image.width, (pageH - 40) / image.height, 1.0);
      const drawW = image.width * scale;
      const drawH = image.height * scale;
      const x = (pageW - drawW) / 2;
      const y = (pageH - drawH) / 2;

      const page = pdfDoc.addPage([pageW, pageH]);
      page.drawImage(image, {
        x,
        y,
        width: drawW,
        height: drawH,
      });

      return await pdfDoc.save();
    }
  } catch (directErr) {
    console.warn('[imageToPdf] Direct embed failed, falling back to Canvas rendering:', directErr);
  }

  // 2. Universal HTML Canvas fallback (works for WEBP, BMP, GIF, screenshots, camera photos)
  return new Promise<Uint8Array>((resolve, reject) => {
    try {
      const blob = new Blob([imageBytes as any], { type: mimeType || 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = async () => {
        try {
          URL.revokeObjectURL(url);
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 800;
          canvas.height = img.naturalHeight || img.height || 600;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Could not create canvas context');

          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
          const base64Data = dataUrl.split(',')[1];
          const binaryStr = atob(base64Data);
          const jpgBytes = new Uint8Array(binaryStr.length);
          for (let j = 0; j < binaryStr.length; j++) {
            jpgBytes[j] = binaryStr.charCodeAt(j);
          }

          const pdfDoc = await PDFDocument.create();
          const embeddedImg = await pdfDoc.embedJpg(jpgBytes);

          const isLandscape = embeddedImg.width > embeddedImg.height;
          const pageW = isLandscape ? a4H : a4W;
          const pageH = isLandscape ? a4W : a4H;

          const scale = Math.min((pageW - 40) / embeddedImg.width, (pageH - 40) / embeddedImg.height, 1.0);
          const drawW = embeddedImg.width * scale;
          const drawH = embeddedImg.height * scale;
          const x = (pageW - drawW) / 2;
          const y = (pageH - drawH) / 2;

          const page = pdfDoc.addPage([pageW, pageH]);
          page.drawImage(embeddedImg, {
            x,
            y,
            width: drawW,
            height: drawH,
          });

          resolve(await pdfDoc.save());
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image into browser'));
      };

      img.src = url;
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Merge multiple PDF documents into a single PDF
 */
export async function mergePdfs(pdfBuffers: Uint8Array[]): Promise<Uint8Array> {
  if (pdfBuffers.length === 0) throw new Error('No PDF documents provided to merge');
  if (pdfBuffers.length === 1) return pdfBuffers[0];

  const mergedDoc = await PDFDocument.create();
  for (const buffer of pdfBuffers) {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const copiedPages = await mergedDoc.copyPages(doc, doc.getPageIndices());
    copiedPages.forEach((p) => mergedDoc.addPage(p));
  }
  return await mergedDoc.save();
}

/**
 * Invert specific pages of a PDF document by rasterizing them to high-res inverted images
 */
export async function invertPdfPages(
  sourcePdfBytes: Uint8Array,
  invertedPageIndices: number[]
): Promise<Uint8Array> {
  if (!invertedPageIndices || invertedPageIndices.length === 0) {
    return sourcePdfBytes;
  }

  const invertSet = new Set(invertedPageIndices);
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/build/pdf.worker.min.js`;

  const loadingTask = pdfjsLib.getDocument({
    data: sourcePdfBytes.slice(),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
    cMapPacked: true,
  });

  const pdfDoc = await loadingTask.promise;
  const outDoc = await PDFDocument.create();
  const srcPdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });

  for (let i = 0; i < pdfDoc.numPages; i++) {
    const pageNum = i + 1;
    if (invertSet.has(i)) {
      // Rasterize & Invert this page at high print quality
      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        await page.render({ canvasContext: ctx, viewport }).promise;
        invertCanvasImageData(ctx, canvas.width, canvas.height, true);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
        const base64Data = dataUrl.split(',')[1];
        const binaryStr = atob(base64Data);
        const imageBytes = new Uint8Array(binaryStr.length);
        for (let j = 0; j < binaryStr.length; j++) {
          imageBytes[j] = binaryStr.charCodeAt(j);
        }
        const embeddedImg = await outDoc.embedJpg(imageBytes);

        const origPage = srcPdfDoc.getPage(i);
        const { width: origW, height: origH } = origPage.getSize();
        const newPage = outDoc.addPage([origW, origH]);
        newPage.drawImage(embeddedImg, {
          x: 0,
          y: 0,
          width: origW,
          height: origH,
        });
      }
    } else {
      const [copiedPage] = await outDoc.copyPages(srcPdfDoc, [i]);
      outDoc.addPage(copiedPage);
    }
  }

  return await outDoc.save();
}

/**
 * Create N-in-1 Imposition Layout on the given PDF document with optional page selection and color inversion
 */
export async function applyNupLayout(
  sourcePdfBytes: Uint8Array,
  options: NupOptions,
  documentTitle?: string,
  selectedPageIndices?: number[],
  invertedPageIndices?: number[]
): Promise<{ pdfBytes: Uint8Array; totalSheets: number }> {
  const {
    nup = 1,
    orientation = 'auto',
    drawBorders = true,
    marginPt = 20,
    gutterPt = 10,
    paperSize = 'A4',
    dpi = 150,
  } = options;

  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/build/pdf.worker.min.js`;

  const loadingTask = pdfjsLib.getDocument({
    data: sourcePdfBytes.slice(),
    cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
    cMapPacked: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;

  // Filter page indices (0-based)
  const filteredIndices = selectedPageIndices && selectedPageIndices.length > 0
    ? selectedPageIndices.filter((idx) => idx >= 0 && idx < numPages)
    : Array.from({ length: numPages }, (_, i) => i);

  if (filteredIndices.length === 0) {
    throw new Error('No pages selected to print');
  }

  const invertSet = new Set(invertedPageIndices || []);

  // Ultra-fast path for 1-in-1 without inversion: Instant vector page copy in < 10ms
  if (nup === 1 && invertSet.size === 0) {
    const fastDoc = await PDFDocument.create();
    if (documentTitle) {
      fastDoc.setTitle(documentTitle);
      fastDoc.setSubject(documentTitle);
      fastDoc.setProducer('Cloud Print Kiosk');
    }
    const srcPdfDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    const copiedPages = await fastDoc.copyPages(srcPdfDoc, filteredIndices);
    copiedPages.forEach((p) => fastDoc.addPage(p));
    return {
      pdfBytes: await fastDoc.save(),
      totalSheets: filteredIndices.length,
    };
  }

  let cols = 1;
  let rows = 1;
  if (nup === 2) { cols = 2; rows = 1; }
  else if (nup === 3) { cols = 1; rows = 3; }
  else if (nup === 4) { cols = 2; rows = 2; }
  else if (nup === 6) { cols = 3; rows = 2; }
  else if (nup === 9) { cols = 3; rows = 3; }
  else if (options.rows && options.cols) {
    rows = options.rows;
    cols = options.cols;
  }

  const [baseW, baseH] = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.A4;

  let sheetW = baseW;
  let sheetH = baseH;

  if (orientation === 'landscape' || (orientation === 'auto' && cols > rows)) {
    sheetW = Math.max(baseW, baseH);
    sheetH = Math.min(baseW, baseH);
  } else if (orientation === 'portrait') {
    sheetW = Math.min(baseW, baseH);
    sheetH = Math.max(baseW, baseH);
  }

  const outDoc = await PDFDocument.create();
  if (documentTitle) {
    outDoc.setTitle(documentTitle);
    outDoc.setSubject(documentTitle);
    outDoc.setProducer('Cloud Print Kiosk');
  }

  const slotsPerPage = rows * cols;
  const totalSheets = Math.ceil(filteredIndices.length / slotsPerPage);

  // Render scale factor for requested DPI print quality (DPI / 72 PT)
  const targetDpi = dpi || 150;
  const renderScale = targetDpi / 72;

  const usableW = (sheetW - 2 * marginPt - (cols - 1) * gutterPt) * renderScale;
  const usableH = (sheetH - 2 * marginPt - (rows - 1) * gutterPt) * renderScale;

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    // 1. Create a Master Canvas for the sheet
    const sheetCanvas = document.createElement('canvas');
    sheetCanvas.width = Math.round(sheetW * renderScale);
    sheetCanvas.height = Math.round(sheetH * renderScale);
    const sCtx = sheetCanvas.getContext('2d');
    if (!sCtx) continue;

    // Fill master sheet with clean white background
    sCtx.fillStyle = '#ffffff';
    sCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

    for (let slotIdx = 0; slotIdx < slotsPerPage; slotIdx++) {
      const targetItemIdx = sheetIdx * slotsPerPage + slotIdx;
      if (targetItemIdx >= filteredIndices.length) break;

      const srcPageIdx = filteredIndices[targetItemIdx];
      const pageNum = srcPageIdx + 1;
      const page = await pdfDoc.getPage(pageNum);

      // Grid position in canvas coordinates (top to bottom, left to right)
      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;

      const cellX = marginPt * renderScale + c * (cellW + gutterPt * renderScale);
      const cellY = marginPt * renderScale + r * (cellH + gutterPt * renderScale);

      // Render miniature page to its own canvas
      // Shrink-to-fit only: If larger than cell, scale down. If smaller, keep 100% original scale (renderScale).
      const unscaledViewport = page.getViewport({ scale: 1.0 });
      const fitScale = Math.min(cellW / unscaledViewport.width, cellH / unscaledViewport.height, renderScale);
      const viewport = page.getViewport({ scale: fitScale });

      const pageCanvas = document.createElement('canvas');
      pageCanvas.width = Math.round(viewport.width);
      pageCanvas.height = Math.round(viewport.height);
      const pCtx = pageCanvas.getContext('2d');
      if (!pCtx) continue;

      pCtx.fillStyle = '#ffffff';
      pCtx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);

      await page.render({ canvasContext: pCtx, viewport }).promise;

      // Apply color inversion if this page is marked
      if (invertSet.has(srcPageIdx)) {
        invertCanvasImageData(pCtx, pageCanvas.width, pageCanvas.height, true);
      }

      // Center the page within the cell
      const drawX = cellX + (cellW - pageCanvas.width) / 2;
      const drawY = cellY + (cellH - pageCanvas.height) / 2;

      sCtx.drawImage(pageCanvas, drawX, drawY);

      // Optional subtle dividing border around miniature page
      if (drawBorders) {
        sCtx.strokeStyle = '#d1d5db';
        sCtx.lineWidth = 1;
        sCtx.strokeRect(drawX, drawY, pageCanvas.width, pageCanvas.height);
      }
    }

    // Convert sheet canvas to JPEG image bytes at fast 150 DPI
    const sheetDataUrl = sheetCanvas.toDataURL('image/jpeg', 0.88);
    const base64Data = sheetDataUrl.split(',')[1];
    const binaryStr = atob(base64Data);
    const imageBytes = new Uint8Array(binaryStr.length);
    for (let j = 0; j < binaryStr.length; j++) {
      imageBytes[j] = binaryStr.charCodeAt(j);
    }

    const embeddedImg = await outDoc.embedJpg(imageBytes);
    const outPage = outDoc.addPage([sheetW, sheetH]);
    outPage.drawImage(embeddedImg, {
      x: 0,
      y: 0,
      width: sheetW,
      height: sheetH,
    });
  }

  const pdfBytes = await outDoc.save();
  return { pdfBytes, totalSheets };
}
