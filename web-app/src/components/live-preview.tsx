'use client';

import React, { useEffect, useState } from 'react';
import { Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { invertCanvasImageData } from '@/lib/color-inverter';
import { NupOptions } from '@/lib/pdf-processor';

interface LivePreviewProps {
  sourcePdfBytes: Uint8Array | null;
  nupOptions: NupOptions;
  selectedPages: Set<number>;
  invertedPages: Set<number>;
  currentSheet: number;
  totalSheets: number;
  onPageChange: (page: number) => void;
}

export function LivePreview({
  sourcePdfBytes,
  nupOptions,
  selectedPages,
  invertedPages,
  currentSheet,
  totalSheets,
  onPageChange,
}: LivePreviewProps) {
  const [scale, setScale] = useState<number>(0.85);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [sheetDataUrl, setSheetDataUrl] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function renderSingleSheet() {
      if (!sourcePdfBytes || sourcePdfBytes.length === 0 || selectedPages.size === 0) {
        setSheetDataUrl(null);
        return;
      }

      try {
        setIsRendering(true);
        setRenderError(null);

        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/build/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument({
          data: sourcePdfBytes.slice(),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
          cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (isCancelled) return;

        const sortedSelected = Array.from(selectedPages).sort((a, b) => a - b);
        let cols = 1;
        let rows = 1;
        if (nupOptions.nup === 2) { cols = 2; rows = 1; }
        else if (nupOptions.nup === 3) { cols = 1; rows = 3; }
        else if (nupOptions.nup === 4) { cols = 2; rows = 2; }
        else if (nupOptions.nup === 6) { cols = 3; rows = 2; }
        else if (nupOptions.nup === 9) { cols = 3; rows = 3; }
        else if (nupOptions.rows && nupOptions.cols) {
          rows = nupOptions.rows;
          cols = nupOptions.cols;
        }

        const slotsPerPage = rows * cols;
        const sheetIdx = Math.max(0, currentSheet - 1);
        const startTargetIdx = sheetIdx * slotsPerPage;
        const targetPageIndices = sortedSelected.slice(startTargetIdx, startTargetIdx + slotsPerPage);

        // Preview canvas size (A4 aspect at crisp 1.2x display scale)
        let baseW = 595;
        let baseH = 842;
        if (nupOptions.orientation === 'landscape' || (nupOptions.orientation === 'auto' && cols > rows)) {
          baseW = 842;
          baseH = 595;
        }

        const previewScale = 1.2;
        const sheetCanvas = document.createElement('canvas');
        sheetCanvas.width = Math.round(baseW * previewScale);
        sheetCanvas.height = Math.round(baseH * previewScale);
        const sCtx = sheetCanvas.getContext('2d');
        if (!sCtx) return;

        sCtx.fillStyle = '#ffffff';
        sCtx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height);

        const margin = 20 * previewScale;
        const gutter = 10 * previewScale;
        const usableW = sheetCanvas.width - 2 * margin - (cols - 1) * gutter;
        const usableH = sheetCanvas.height - 2 * margin - (rows - 1) * gutter;
        const cellW = usableW / cols;
        const cellH = usableH / rows;

        for (let slotIdx = 0; slotIdx < targetPageIndices.length; slotIdx++) {
          if (isCancelled) return;
          const srcIdx = targetPageIndices[slotIdx];
          const page = await pdfDoc.getPage(srcIdx + 1);

          const r = Math.floor(slotIdx / cols);
          const c = slotIdx % cols;
          const cellX = margin + c * (cellW + gutter);
          const cellY = margin + r * (cellH + gutter);

          // Shrink-to-fit only: If larger than cell, scale down. If smaller, keep 100% original scale (previewScale).
          const unscaled = page.getViewport({ scale: 1.0 });
          const fit = Math.min(cellW / unscaled.width, cellH / unscaled.height, previewScale);
          const viewport = page.getViewport({ scale: fit });

          const pCanvas = document.createElement('canvas');
          pCanvas.width = Math.round(viewport.width);
          pCanvas.height = Math.round(viewport.height);
          const pCtx = pCanvas.getContext('2d');
          if (!pCtx) continue;

          pCtx.fillStyle = '#ffffff';
          pCtx.fillRect(0, 0, pCanvas.width, pCanvas.height);

          await page.render({ canvasContext: pCtx, viewport }).promise;

          if (invertedPages.has(srcIdx)) {
            invertCanvasImageData(pCtx, pCanvas.width, pCanvas.height, true);
          }

          const drawX = cellX + (cellW - pCanvas.width) / 2;
          const drawY = cellY + (cellH - pCanvas.height) / 2;

          sCtx.drawImage(pCanvas, drawX, drawY);

          if (nupOptions.drawBorders) {
            sCtx.strokeStyle = '#e5e7eb';
            sCtx.lineWidth = 1;
            sCtx.strokeRect(drawX, drawY, pCanvas.width, pCanvas.height);
          }
        }

        if (!isCancelled) {
          const dataUrl = sheetCanvas.toDataURL('image/jpeg', 0.90);
          setSheetDataUrl(dataUrl);
          setIsRendering(false);
        }
      } catch (err: any) {
        console.error('[LivePreview] Render sheet error:', err);
        if (!isCancelled) {
          setRenderError(err.message || 'Failed to render sheet');
          setIsRendering(false);
        }
      }
    }

    renderSingleSheet();

    return () => {
      isCancelled = true;
    };
  }, [sourcePdfBytes, nupOptions, selectedPages, invertedPages, currentSheet]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            N-in-1 Sheet Preview
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Exact preview of the printed physical paper sheets</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.15))}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-medium text-gray-500">{Math.round(scale * 100)}%</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(1.5, s + 0.15))}
            className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Preview Sheet Viewport */}
      <div className="flex-1 min-h-[420px] bg-gray-100 dark:bg-gray-950/60 rounded-xl flex items-center justify-center p-4 overflow-auto relative border border-gray-200/50 dark:border-gray-800/50">
        {isRendering ? (
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-medium text-gray-500">Rendering sheet preview...</p>
          </div>
        ) : !sourcePdfBytes || selectedPages.size === 0 ? (
          <div className="text-center text-gray-400 space-y-1">
            <Eye className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">No document uploaded</p>
            <p className="text-xs">Upload a PDF or image to see real-time sheet preview</p>
          </div>
        ) : renderError ? (
          <div className="text-center text-red-500 text-xs p-4">
            <p className="font-semibold">Preview Notice</p>
            <p>{renderError}</p>
          </div>
        ) : sheetDataUrl ? (
          <img
            src={sheetDataUrl}
            alt={`Sheet ${currentSheet}`}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center center' }}
            className="max-w-full max-h-[500px] object-contain rounded shadow-xl bg-white transition-all border border-gray-200"
          />
        ) : null}
      </div>

      {/* Navigation Controls */}
      {totalSheets > 1 && (
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            disabled={currentSheet <= 1}
            onClick={() => onPageChange(Math.max(1, currentSheet - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium flex items-center gap-1 disabled:opacity-40 hover:bg-gray-100"
          >
            <ChevronLeft className="w-4 h-4" /> Previous Sheet
          </button>

          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Sheet {currentSheet} of {totalSheets}
          </span>

          <button
            type="button"
            disabled={currentSheet >= totalSheets}
            onClick={() => onPageChange(Math.min(totalSheets, currentSheet + 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium flex items-center gap-1 disabled:opacity-40 hover:bg-gray-100"
          >
            Next Sheet <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
