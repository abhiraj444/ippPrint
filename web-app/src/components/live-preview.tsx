'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Eye, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Sparkles } from 'lucide-react';
import { invertCanvasImageData } from '@/lib/color-inverter';

interface LivePreviewProps {
  pdfBytes: Uint8Array | null;
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  invertMode: string;
  isProcessing: boolean;
}

export function LivePreview({
  pdfBytes,
  currentPage,
  totalPages,
  onPageChange,
  invertMode,
  isProcessing,
}: LivePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState<number>(0.85);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfObjectUrl, setPdfObjectUrl] = useState<string | null>(null);
  const [useFallbackViewer, setUseFallbackViewer] = useState<boolean>(false);

  // Maintain object URL for fallback viewer
  useEffect(() => {
    if (!pdfBytes || pdfBytes.length === 0) {
      if (pdfObjectUrl) URL.revokeObjectURL(pdfObjectUrl);
      setPdfObjectUrl(null);
      return;
    }

    const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    setPdfObjectUrl(url);
    setUseFallbackViewer(false);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [pdfBytes]);

  useEffect(() => {
    let isCancelled = false;

    async function renderPage() {
      if (!pdfBytes || pdfBytes.length === 0 || !canvasRef.current) return;

      try {
        setIsRendering(true);
        setRenderError(null);

        // Dynamically import pdfjs-dist in client
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/build/pdf.worker.min.js`;

        const renderPromise = (async () => {
          const loadingTask = pdfjsLib.getDocument({
            data: pdfBytes.slice(),
            cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
            cMapPacked: true,
          });

          const pdfDoc = await loadingTask.promise;
          if (isCancelled) return;

          const pageNum = Math.min(Math.max(1, currentPage), pdfDoc.numPages);
          const page = await pdfDoc.getPage(pageNum);

          const canvas = canvasRef.current;
          if (!canvas || isCancelled) return;

          const viewport = page.getViewport({ scale: scale * 1.5 });
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          await page.render({
            canvasContext: ctx,
            viewport: viewport,
          }).promise;

          if (isCancelled) return;

          // Apply client-side color inversion to the preview if enabled
          if (invertMode === 'all' || invertMode === 'custom') {
            invertCanvasImageData(ctx, canvas.width, canvas.height, true);
          }
        })();

        // 3.5-second timeout guard to prevent infinite hanging
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Canvas render timeout')), 3500)
        );

        await Promise.race([renderPromise, timeoutPromise]);

        if (!isCancelled) {
          setIsRendering(false);
        }
      } catch (err: any) {
        if (!isCancelled) {
          console.warn('[LivePreview] Canvas notice, switching to direct PDF viewer:', err.message);
          setUseFallbackViewer(true);
          setIsRendering(false);
        }
      }
    }

    renderPage();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes, currentPage, scale, invertMode]);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col h-full">
      <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Eye className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Live Print Sheet Preview
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Exact output preview of what comes out of the printer</p>
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

      {/* Preview Canvas Area */}
      <div className="flex-1 min-h-[380px] my-4 bg-gray-100 dark:bg-gray-950/60 rounded-xl flex items-center justify-center p-4 overflow-auto relative border border-gray-200/50 dark:border-gray-800/50">
        {isProcessing || isRendering ? (
          <div className="text-center space-y-2">
            <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs font-medium text-gray-500">Generating live preview...</p>
          </div>
        ) : !pdfBytes ? (
          <div className="text-center text-gray-400 space-y-1">
            <Eye className="w-10 h-10 mx-auto opacity-30" />
            <p className="text-sm font-medium">No document uploaded</p>
            <p className="text-xs">Upload a PDF or image to see real-time preview</p>
          </div>
        ) : renderError ? (
          <div className="text-center text-red-500 text-xs p-4">
            <p className="font-semibold">Preview Render Notice</p>
            <p>{renderError}</p>
          </div>
        ) : useFallbackViewer && pdfObjectUrl ? (
          <iframe
            src={`${pdfObjectUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            className="w-full h-[460px] rounded-lg border-0 shadow-md bg-white"
            title="Live PDF Preview"
          />
        ) : (
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[480px] object-contain rounded shadow-lg bg-white transition-all"
          />
        )}
      </div>

      {/* Navigation Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium flex items-center gap-1 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Previous Sheet
          </button>

          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Sheet {currentPage} of {totalPages}
          </span>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-xs font-medium flex items-center gap-1 disabled:opacity-40"
          >
            Next Sheet <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
