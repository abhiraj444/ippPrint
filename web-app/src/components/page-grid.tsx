'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  Check,
  Eye,
  SunMoon,
  Sparkles,
  Maximize2,
  X,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  CheckSquare,
  Square,
  Layers,
} from 'lucide-react';
import { invertCanvasImageData } from '@/lib/color-inverter';

export interface PageItemData {
  pageIndex: number; // 0-based
  pageNumber: number; // 1-based
  dataUrl: string;
  width: number;
  height: number;
}

interface PageGridProps {
  pdfBytes: Uint8Array | null;
  selectedPages: Set<number>;
  invertedPages: Set<number>;
  onToggleSelect: (pageIndex: number) => void;
  onToggleInvert: (pageIndex: number) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onInvertAll: () => void;
  onResetInvert: () => void;
  onSelectOdd: () => void;
  onSelectEven: () => void;
}

export function PageGrid({
  pdfBytes,
  selectedPages,
  invertedPages,
  onToggleSelect,
  onToggleInvert,
  onSelectAll,
  onDeselectAll,
  onInvertAll,
  onResetInvert,
  onSelectOdd,
  onSelectEven,
}: PageGridProps) {
  const [pages, setPages] = useState<PageItemData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [modalPageIndex, setModalPageIndex] = useState<number | null>(null);
  const [modalScale, setModalScale] = useState<number>(1.0);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);

  // Render all pages into thumbnails when pdfBytes changes
  useEffect(() => {
    let isCancelled = false;

    async function loadThumbnails() {
      if (!pdfBytes || pdfBytes.length === 0) {
        setPages([]);
        return;
      }

      try {
        setIsLoading(true);
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/build/pdf.worker.min.js`;

        const loadingTask = pdfjsLib.getDocument({
          data: pdfBytes.slice(),
          cMapUrl: `https://unpkg.com/pdfjs-dist@${pdfjsLib.version || '3.11.174'}/cmaps/`,
          cMapPacked: true,
        });

        const pdfDoc = await loadingTask.promise;
        if (isCancelled) return;

        const renderedItems: PageItemData[] = [];

        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (isCancelled) return;
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 }); // thumbnail scale

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');

          if (ctx) {
            await page.render({ canvasContext: ctx, viewport }).promise;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
            renderedItems.push({
              pageIndex: i - 1,
              pageNumber: i,
              dataUrl,
              width: viewport.width,
              height: viewport.height,
            });
          }
        }

        if (!isCancelled) {
          setPages(renderedItems);
          setIsLoading(false);
        }
      } catch (err) {
        console.error('[PageGrid] Error loading thumbnails:', err);
        if (!isCancelled) setIsLoading(false);
      }
    }

    loadThumbnails();

    return () => {
      isCancelled = true;
    };
  }, [pdfBytes]);

  // Render high-res page into Lightbox Modal when opened
  useEffect(() => {
    let isCancelled = false;

    async function renderModalPage() {
      if (modalPageIndex === null || !pdfBytes || !modalCanvasRef.current) return;

      try {
        const pdfjsLib = await import('pdfjs-dist');
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
        const pdfDoc = await loadingTask.promise;

        if (isCancelled) return;
        const page = await pdfDoc.getPage(modalPageIndex + 1);

        const canvas = modalCanvasRef.current;
        if (!canvas || isCancelled) return;

        const viewport = page.getViewport({ scale: modalScale * 1.5 });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        await page.render({ canvasContext: ctx, viewport }).promise;

        if (isCancelled) return;

        // If this page is inverted, apply inversion to modal canvas
        if (invertedPages.has(modalPageIndex)) {
          invertCanvasImageData(ctx, canvas.width, canvas.height, true);
        }
      } catch (e) {
        console.error('[PageGrid] Modal render error:', e);
      }
    }

    renderModalPage();

    return () => {
      isCancelled = true;
    };
  }, [modalPageIndex, modalScale, pdfBytes, invertedPages]);

  if (!pdfBytes || pdfBytes.length === 0) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-center text-gray-400 space-y-2">
        <Layers className="w-10 h-10 mx-auto opacity-30" />
        <p className="text-sm font-semibold">No Document Uploaded</p>
        <p className="text-xs">Upload a PDF or image above to view and select individual pages.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-5">
      {/* Header & Quick Batch Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Page Grid & Selection ({selectedPages.size} of {pages.length} selected)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Click checkboxes to include/exclude pages, toggle dark mode toner saver per page, or click any page to zoom.
          </p>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            type="button"
            onClick={onSelectAll}
            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
          >
            All
          </button>
          <button
            type="button"
            onClick={onSelectOdd}
            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
          >
            Odd
          </button>
          <button
            type="button"
            onClick={onSelectEven}
            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium"
          >
            Even
          </button>
          <button
            type="button"
            onClick={onDeselectAll}
            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium text-red-500"
          >
            None
          </button>
          <span className="text-gray-300 dark:text-gray-700">|</span>
          <button
            type="button"
            onClick={onInvertAll}
            className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-medium flex items-center gap-1"
          >
            <SunMoon className="w-3.5 h-3.5" /> Invert All
          </button>
          <button
            type="button"
            onClick={onResetInvert}
            className="px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 font-medium text-gray-500"
          >
            Reset Invert
          </button>
        </div>
      </div>

      {/* Grid of Pages */}
      {isLoading ? (
        <div className="py-16 text-center space-y-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-medium text-gray-500">Generating page thumbnails...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 max-h-[600px] overflow-y-auto p-1">
          {pages.map((p) => {
            const isSelected = selectedPages.has(p.pageIndex);
            const isInverted = invertedPages.has(p.pageIndex);

            return (
              <div
                key={p.pageIndex}
                className={`relative group rounded-2xl border-2 transition-all overflow-hidden flex flex-col bg-white dark:bg-gray-800 shadow-sm ${
                  isSelected
                    ? 'border-indigo-600 ring-2 ring-indigo-600/20'
                    : 'border-gray-200 dark:border-gray-700 opacity-60 grayscale'
                }`}
              >
                {/* Top Action Bar on Card */}
                <div className="p-2 bg-gray-50 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-700/80 flex items-center justify-between z-10">
                  {/* Select Checkbox */}
                  <button
                    type="button"
                    onClick={() => onToggleSelect(p.pageIndex)}
                    className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200 hover:text-indigo-600"
                  >
                    <div className={`w-4 h-4 rounded flex items-center justify-center border transition-colors ${
                      isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-gray-400 bg-white dark:bg-gray-800'
                    }`}>
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span>#{p.pageNumber}</span>
                  </button>

                  {/* Per-Page Invert Toggle */}
                  <button
                    type="button"
                    onClick={() => onToggleInvert(p.pageIndex)}
                    title={isInverted ? 'Toner Saver Active (Inverted)' : 'Invert Dark Colors to Save Toner'}
                    className={`p-1 rounded-lg transition-colors ${
                      isInverted
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 font-bold'
                        : 'text-gray-400 hover:text-indigo-600 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }`}
                  >
                    <SunMoon className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Thumbnail Image Container */}
                <div
                  onClick={() => setModalPageIndex(p.pageIndex)}
                  className="relative aspect-[1/1.3] bg-gray-100 dark:bg-gray-950 cursor-pointer overflow-hidden flex items-center justify-center p-2 group"
                >
                  <img
                    src={p.dataUrl}
                    alt={`Page ${p.pageNumber}`}
                    className={`w-full h-full object-contain rounded shadow transition-all ${
                      isInverted ? 'filter invert hue-rotate-180 contrast-125' : ''
                    }`}
                  />

                  {/* Hover Zoom Overlay */}
                  <div className="absolute inset-0 bg-indigo-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white backdrop-blur-[1px]">
                    <div className="px-3 py-1.5 rounded-full bg-black/70 text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                      <Maximize2 className="w-3.5 h-3.5" /> Zoom & Inspect
                    </div>
                  </div>

                  {isInverted && (
                    <span className="absolute bottom-2 right-2 bg-black/80 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                      Inverted
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox / Popup Inspector Modal */}
      {modalPageIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 max-w-3xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg text-gray-900 dark:text-gray-100">
                  Page {modalPageIndex + 1} of {pages.length}
                </span>

                {/* Status Badges */}
                <button
                  type="button"
                  onClick={() => onToggleSelect(modalPageIndex)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                    selectedPages.has(modalPageIndex)
                      ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                  {selectedPages.has(modalPageIndex) ? 'Selected for Print' : 'Excluded from Print'}
                </button>

                <button
                  type="button"
                  onClick={() => onToggleInvert(modalPageIndex)}
                  className={`text-xs px-3 py-1 rounded-full font-semibold flex items-center gap-1.5 ${
                    invertedPages.has(modalPageIndex)
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  <SunMoon className="w-3.5 h-3.5" />
                  {invertedPages.has(modalPageIndex) ? 'Toner Saver Active (Inverted)' : 'Normal Colors'}
                </button>
              </div>

              <div className="flex items-center gap-2">
                {/* Zoom Controls */}
                <button
                  type="button"
                  onClick={() => setModalScale((s) => Math.max(0.6, s - 0.2))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="text-xs font-semibold">{Math.round(modalScale * 100)}%</span>
                <button
                  type="button"
                  onClick={() => setModalScale((s) => Math.min(2.0, s + 0.2))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setModalPageIndex(null)}
                  className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 ml-2"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            {/* Modal Canvas Viewport */}
            <div className="flex-1 overflow-auto my-4 bg-gray-100 dark:bg-gray-950 rounded-2xl p-4 flex items-center justify-center min-h-[400px]">
              <canvas
                ref={modalCanvasRef}
                className="max-w-full max-h-[550px] object-contain rounded-lg shadow-xl bg-white"
              />
            </div>

            {/* Modal Footer with Navigation */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                disabled={modalPageIndex <= 0}
                onClick={() => setModalPageIndex(Math.max(0, modalPageIndex - 1))}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <ChevronLeft className="w-4 h-4" /> Previous Page
              </button>

              <span className="text-xs text-gray-400 font-medium">
                Use arrow buttons to browse through document pages
              </span>

              <button
                type="button"
                disabled={modalPageIndex >= pages.length - 1}
                onClick={() => setModalPageIndex(Math.min(pages.length - 1, modalPageIndex + 1))}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold flex items-center gap-2 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                Next Page <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
