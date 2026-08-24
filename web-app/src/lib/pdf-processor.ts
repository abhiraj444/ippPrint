import { PDFDocument, rgb, degrees, PageSizes } from 'pdf-lib';

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
 * Create N-in-1 Imposition Layout on the given PDF document
 */
export async function applyNupLayout(
  sourcePdfBytes: Uint8Array,
  options: NupOptions,
  documentTitle?: string
): Promise<{ pdfBytes: Uint8Array; totalSheets: number }> {
  const { nup = 1, orientation = 'auto', drawBorders = true, marginPt = 20, gutterPt = 10, paperSize = 'A4' } = options;

  if (nup === 1) {
    const srcDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
    if (documentTitle) {
      srcDoc.setTitle(documentTitle);
      srcDoc.setSubject(documentTitle);
      srcDoc.setProducer('Cloud Print Kiosk');
      return { pdfBytes: await srcDoc.save(), totalSheets: srcDoc.getPageCount() };
    }
    return { pdfBytes: sourcePdfBytes, totalSheets: srcDoc.getPageCount() };
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

  const srcDoc = await PDFDocument.load(sourcePdfBytes, { ignoreEncryption: true });
  const srcPages = srcDoc.getPages();
  const totalSrcPages = srcPages.length;

  if (totalSrcPages === 0) {
    throw new Error('PDF has no pages');
  }

  const outDoc = await PDFDocument.create();
  if (documentTitle) {
    outDoc.setTitle(documentTitle);
    outDoc.setSubject(documentTitle);
    outDoc.setProducer('Cloud Print Kiosk');
  }

  const [baseW, baseH] = PAPER_DIMENSIONS[paperSize] || PAPER_DIMENSIONS.A4;

  // Determine Master Sheet Dimensions based on grid aspect
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
  const totalSheets = Math.ceil(totalSrcPages / slotsPerPage);

  const usableW = sheetW - 2 * marginPt - (cols - 1) * gutterPt;
  const usableH = sheetH - 2 * marginPt - (rows - 1) * gutterPt;

  const cellW = usableW / cols;
  const cellH = usableH / rows;

  for (let sheetIdx = 0; sheetIdx < totalSheets; sheetIdx++) {
    const outPage = outDoc.addPage([sheetW, sheetH]);

    for (let slotIdx = 0; slotIdx < slotsPerPage; slotIdx++) {
      const srcIdx = sheetIdx * slotsPerPage + slotIdx;
      if (srcIdx >= totalSrcPages) break;

      const [embeddedPage] = await outDoc.embedPages([srcPages[srcIdx]]);
      const origW = embeddedPage.width;
      const origH = embeddedPage.height;

      // Slot grid coordinate (row 0 is top, col 0 is left)
      const r = Math.floor(slotIdx / cols);
      const c = slotIdx % cols;

      const cellX = marginPt + c * (cellW + gutterPt);
      // In PDF coordinates, Y starts from bottom-left
      const cellY = sheetH - marginPt - (r + 1) * cellH - r * gutterPt;

      // Calculate scale to fit cell while preserving aspect ratio
      const scaleW = cellW / origW;
      const scaleH = cellH / origH;
      const scale = Math.min(scaleW, scaleH);

      const fittedW = origW * scale;
      const fittedH = origH * scale;

      // Center the page inside the cell
      const drawX = cellX + (cellW - fittedW) / 2;
      const drawY = cellY + (cellH - fittedH) / 2;

      outPage.drawPage(embeddedPage, {
        x: drawX,
        y: drawY,
        width: fittedW,
        height: fittedH,
      });

      // Optional subtle outline border
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
