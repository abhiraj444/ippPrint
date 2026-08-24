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
}

const PAPER_DIMENSIONS: Record<string, [number, number]> = {
  A4: [595.28, 841.89],
  Letter: [612.0, 792.0],
  Legal: [612.0, 1008.0],
};

/**
 * Convert an image (JPEG, PNG, etc.) to a standard PDF document Buffer
 */
export async function imageToPdf(imageBytes: Uint8Array, mimeType: string): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  let image;
  if (mimeType.includes('png')) {
    image = await pdfDoc.embedPng(imageBytes);
  } else {
    image = await pdfDoc.embedJpg(imageBytes);
  }

  const { width, height } = image;
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, {
    x: 0,
    y: 0,
    width,
    height,
  });

  return await pdfDoc.save();
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
 * Create N-in-1 Imposition Layout on the given PDF document
 */
export async function applyNupLayout(
  sourcePdfBytes: Uint8Array,
  options: NupOptions,
  documentTitle?: string,
  selectedPageIndices?: number[]
): Promise<{ pdfBytes: Uint8Array; totalSheets: number }> {
  const { nup = 1, orientation = 'auto', drawBorders = true, marginPt = 20, gutterPt = 10, paperSize = 'A4' } = options;

  const srcDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const allSrcPages = srcDoc.getPages();
  
  // Filter pages if selectedPageIndices is specified
  const filteredIndices = selectedPageIndices && selectedPageIndices.length > 0
    ? selectedPageIndices.filter(idx => idx >= 0 && idx < allSrcPages.length)
    : srcDoc.getPageIndices();

  if (filteredIndices.length === 0) {
    throw new Error('No pages selected to print');
  }

  // If nup === 1, copy only selected pages
  if (nup === 1) {
    const singleDoc = await PDFDocument.create();
    if (documentTitle) {
      singleDoc.setTitle(documentTitle);
      singleDoc.setSubject(documentTitle);
      singleDoc.setProducer('Cloud Print Kiosk');
    }
    const copiedPages = await singleDoc.copyPages(srcDoc, filteredIndices);
    copiedPages.forEach(p => singleDoc.addPage(p));
    return { pdfBytes: await singleDoc.save(), totalSheets: singleDoc.getPageCount() };
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

  const outDoc = await PDFDocument.create();
  if (documentTitle) {
    outDoc.setTitle(documentTitle);
    outDoc.setSubject(documentTitle);
    outDoc.setProducer('Cloud Print Kiosk');
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

  const slotsPerPage = rows * cols;
  const totalSheets = Math.ceil(filteredIndices.length / slotsPerPage);

  const usableW = sheetW - 2 * marginPt - (cols - 1) * gutterPt;
  const usableH = sheetH - 2 * marginPt - (rows - 1) * gutterPt;

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    const outPage = outDoc.addPage([sheetW, sheetH]);

    for (let slotIdx = 0; slotIdx < slotsPerPage; slotIdx++) {
      const targetItemIdx = sheetIdx * slotsPerPage + slotIdx;
      if (targetItemIdx >= filteredIndices.length) break;

      const srcPageIdx = filteredIndices[targetItemIdx];
      const srcPage = allSrcPages[srcPageIdx];
      const mediaBox = srcPage.getMediaBox() || { x: 0, y: 0, width: srcPage.getWidth(), height: srcPage.getHeight() };
      const rotation = (srcPage.getRotation()?.angle || 0) % 360;

      const [embeddedPage] = await outDoc.embedPages([srcPage]);

      const isRotated90or270 = rotation === 90 || rotation === 270;
      const origW = isRotated90or270 ? (mediaBox.height || embeddedPage.height) : (mediaBox.width || embeddedPage.width);
      const origH = isRotated90or270 ? (mediaBox.width || embeddedPage.width) : (mediaBox.height || embeddedPage.height);

      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;

      const cellX = marginPt + c * (cellW + gutterPt);
      const cellY = sheetH - marginPt - (r + 1) * cellH - r * gutterPt;

      const scaleW = cellW / origW;
      const scaleH = cellH / origH;
      const scale = Math.min(scaleW, scaleH);

      const fittedW = origW * scale;
      const fittedH = origH * scale;

      const drawX = cellX + (cellW - fittedW) / 2;
      const drawY = cellY + (cellH - fittedH) / 2;

      // Adjust for non-zero MediaBox / CropBox origins so content is never drawn offscreen
      const adjustedX = drawX - (mediaBox.x || 0) * scale;
      const adjustedY = drawY - (mediaBox.y || 0) * scale;

      outPage.drawPage(embeddedPage, {
        x: adjustedX,
        y: adjustedY,
        width: embeddedPage.width * scale,
        height: embeddedPage.height * scale,
      });

      if (drawBorders) {
        outPage.drawRectangle({
          x: drawX,
          y: drawY,
          width: fittedW,
          height: fittedH,
          borderColor: rgb(0.75, 0.75, 0.75),
          borderWidth: 0.5,
        });
      }
    }
  }

  const pdfBytes = await outDoc.save();
  return { pdfBytes, totalSheets };
}
