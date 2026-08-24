'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Uploader, UploadedFileItem } from '@/components/uploader';
import { NupSettings } from '@/components/nup-settings';
import { InkSaverSettings } from '@/components/ink-saver-settings';
import { PrintSettings, PrinterInfo, PrintJobSettings } from '@/components/print-settings';
import { LivePreview } from '@/components/live-preview';
import { PageGrid } from '@/components/page-grid';
import { PaymentModal } from '@/components/payment-modal';
import { NupOptions, imageToPdf, mergePdfs, applyNupLayout } from '@/lib/pdf-processor';
import { InvertOptions } from '@/lib/color-inverter';
import { PDFDocument } from 'pdf-lib';
import {
  Printer,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Clock,
  Shield,
  Layers,
  ArrowRight,
  Eye,
} from 'lucide-react';

export default function PrintKioskPage() {
  // 1. Files state
  const [files, setFiles] = useState<UploadedFileItem[]>([]);
  const [originalPdfBytes, setOriginalPdfBytes] = useState<Uint8Array | null>(null);
  const [transformedPdfBytes, setTransformedPdfBytes] = useState<Uint8Array | null>(null);
  const [totalOriginalPages, setTotalOriginalPages] = useState<number>(0);
  const [totalSheets, setTotalSheets] = useState<number>(0);
  const [currentSheetIndex, setCurrentSheetIndex] = useState<number>(1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // 2. Page Selection & Per-page Inversion Sets (0-based indices)
  const [selectedPages, setSelectedPages] = useState<Set<number>>(new Set());
  const [invertedPages, setInvertedPages] = useState<Set<number>>(new Set());
  const [previewTab, setPreviewTab] = useState<'grid' | 'sheet'>('grid');

  // 3. N-up Layout state
  const [nupOptions, setNupOptions] = useState<NupOptions>({
    nup: 1,
    orientation: 'auto',
    drawBorders: true,
    marginPt: 20,
    gutterPt: 10,
    paperSize: 'A4',
  });

  // 4. Ink Saver & Invert state
  const [invertOptions, setInvertOptions] = useState<InvertOptions>({
    mode: 'none',
    pageRange: '',
    highContrast: true,
  });

  // 5. Print Job Settings
  const [printSettings, setPrintSettings] = useState<PrintJobSettings>({
    printerSlug: 'canonir7105',
    copies: 1,
    duplex: 'simplex',
    pageRangeMode: 'all',
    customPageRange: '',
  });

  // 6. Printers & Connectivity
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(true);
  const [agentConnected, setAgentConnected] = useState<boolean>(true);

  // 7. UI & Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null);
  const [freeMode, setFreeMode] = useState<boolean>(false);

  // Fetch live printers on load & interval
  const loadPrinters = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoadingPrinters(true);
      const res = await fetch('/api/printers', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.printers && data.printers.length > 0) {
          setPrinters(data.printers);
          // Select default printer
          if (!printSettings.printerSlug || !data.printers.some((p: any) => p.slug === printSettings.printerSlug)) {
            setPrintSettings((s) => ({ ...s, printerSlug: data.printers[0].slug }));
          }
          setAgentConnected(data.status === 'ok' || data.status !== 'fallback');
        } else {
          setAgentConnected(false);
        }
      } else {
        setAgentConnected(false);
      }
    } catch (err) {
      console.error('Failed to load printers:', err);
      setAgentConnected(false);
    } finally {
      if (isInitial) setIsLoadingPrinters(false);
    }
  }, [printSettings.printerSlug]);

  useEffect(() => {
    loadPrinters(true);
    const interval = setInterval(() => {
      loadPrinters(false);
    }, 6000);
    return () => clearInterval(interval);
  }, [loadPrinters]);

  // Handle adding new uploaded files
  const handleFilesAdded = async (newRawFiles: File[]) => {
    const newItems: UploadedFileItem[] = [];

    for (const f of newRawFiles) {
      const item: UploadedFileItem = {
        id: `${f.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        file: f,
        name: f.name,
        size: f.size,
        type: f.type,
      };
      newItems.push(item);
    }

    setFiles((prev) => [...prev, ...newItems]);
  };

  const handleFileRemoved = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleClearAll = () => {
    setFiles([]);
    setOriginalPdfBytes(null);
    setTransformedPdfBytes(null);
    setTotalOriginalPages(0);
    setTotalSheets(0);
    setSelectedPages(new Set());
    setInvertedPages(new Set());
  };

  // Main Document Name
  const mainDocName = files.length === 1 ? files[0].name : files.length > 1 ? `${files[0].name.replace(/\.[^/.]+$/, '')}_merged.pdf` : 'Document.pdf';

  // Process files whenever files change
  useEffect(() => {
    let isCancelled = false;

    async function processFiles() {
      if (files.length === 0) {
        setOriginalPdfBytes(null);
        setTransformedPdfBytes(null);
        setTotalOriginalPages(0);
        setTotalSheets(0);
        setSelectedPages(new Set());
        setInvertedPages(new Set());
        return;
      }

      try {
        setIsProcessing(true);

        const pdfBuffers: Uint8Array[] = [];

        for (const item of files) {
          const buffer = new Uint8Array(await item.file.arrayBuffer());
          const isPdf = item.type.includes('pdf') || item.name.toLowerCase().endsWith('.pdf');
          const isImage = item.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(item.name);

          if (isPdf) {
            pdfBuffers.push(buffer);
          } else if (isImage) {
            const convertedPdf = await imageToPdf(buffer, item.type || 'image/jpeg');
            pdfBuffers.push(convertedPdf);
          } else {
            pdfBuffers.push(buffer);
          }
        }

        if (isCancelled) return;

        if (pdfBuffers.length === 0) {
          throw new Error('No valid documents found');
        }

        // Merge into single source PDF
        const merged = await mergePdfs(pdfBuffers);
        setOriginalPdfBytes(merged);

        const srcDoc = await PDFDocument.load(merged, { ignoreEncryption: true });
        const srcPageCount = srcDoc.getPageCount();
        setTotalOriginalPages(srcPageCount);

        // Select all pages by default
        const allIndices = new Set<number>();
        for (let i = 0; i < srcPageCount; i++) allIndices.add(i);
        setSelectedPages(allIndices);

        setIsProcessing(false);
      } catch (err: any) {
        if (!isCancelled) {
          console.error('[Processor] Error processing document:', err);
          setIsProcessing(false);
        }
      }
    }

    processFiles();

    return () => {
      isCancelled = true;
    };
  }, [files]);

  // Re-generate N-in-1 Transformed PDF whenever options, selectedPages, or invertedPages change
  useEffect(() => {
    let isCancelled = false;

    async function generateTransformedPdf() {
      if (!originalPdfBytes || totalOriginalPages === 0 || selectedPages.size === 0) {
        setTransformedPdfBytes(null);
        setTotalSheets(0);
        return;
      }

      try {
        setIsProcessing(true);
        const sortedSelectedIndices = Array.from(selectedPages).sort((a, b) => a - b);

        // 1. If any pages are marked for inversion, apply pixel-level inversion to the PDF binary
        let processedSourcePdf = originalPdfBytes;
        if (invertedPages.size > 0) {
          const { invertPdfPages } = await import('@/lib/pdf-processor');
          processedSourcePdf = await invertPdfPages(originalPdfBytes, Array.from(invertedPages));
        }

        // 2. Apply N-in-1 layout imposition with clean Document Title
        const { pdfBytes: nupBytes, totalSheets: calculatedSheets } = await applyNupLayout(
          processedSourcePdf,
          nupOptions,
          mainDocName,
          sortedSelectedIndices
        );

        if (isCancelled) return;

        setTransformedPdfBytes(nupBytes);
        setTotalSheets(calculatedSheets);
        setCurrentSheetIndex(1);
        setIsProcessing(false);
      } catch (err) {
        console.error('[Processor] Error updating transformed PDF:', err);
        if (!isCancelled) setIsProcessing(false);
      }
    }

    generateTransformedPdf();

    return () => {
      isCancelled = true;
    };
  }, [originalPdfBytes, totalOriginalPages, selectedPages, invertedPages, nupOptions, mainDocName]);

  // Page Grid Selection Handlers
  const togglePageSelect = (idx: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const togglePageInvert = (idx: number) => {
    setInvertedPages((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const selectAllPages = () => {
    const all = new Set<number>();
    for (let i = 0; i < totalOriginalPages; i++) all.add(i);
    setSelectedPages(all);
  };

  const deselectAllPages = () => {
    setSelectedPages(new Set());
  };

  const selectOddPages = () => {
    const odds = new Set<number>();
    for (let i = 0; i < totalOriginalPages; i += 2) odds.add(i);
    setSelectedPages(odds);
  };

  const selectEvenPages = () => {
    const evens = new Set<number>();
    for (let i = 1; i < totalOriginalPages; i += 2) evens.add(i);
    setSelectedPages(evens);
  };

  const invertAllPages = () => {
    const all = new Set<number>();
    for (let i = 0; i < totalOriginalPages; i++) all.add(i);
    setInvertedPages(all);
  };

  const resetInvert = () => {
    setInvertedPages(new Set());
  };

  // Selected printer details
  const selectedPrinter = printers.find((p) => p.slug === printSettings.printerSlug);
  const isColorPrinter = selectedPrinter ? selectedPrinter.isColor : false;
  const isDuplexMode = printSettings.duplex !== 'simplex';

  // Pricing calculation
  const totalPrintSheets = totalSheets * printSettings.copies;
  const ratePerSheet = isColorPrinter ? 10.0 : isDuplexMode ? 3.0 : 2.0;
  const totalAmount = Math.max(1, Math.round(totalPrintSheets * ratePerSheet));

  // Dispatch Print Execution
  const executePrint = async () => {
    if (!transformedPdfBytes) return;

    try {
      setIsPrinting(true);
      setPrintSuccessMessage(null);
      setPrintErrorMessage(null);

      // Convert Uint8Array to base64
      let binary = '';
      const len = transformedPdfBytes.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(transformedPdfBytes[i]);
      }
      const pdfBase64 = btoa(binary);

      const RELAY_WORKER_URL = 'https://relay-worker.abhinavip.workers.dev';
      const printPayload = {
        printerSlug: printSettings.printerSlug,
        documentName: mainDocName,
        pdfBase64,
        copies: printSettings.copies,
        duplex: printSettings.duplex,
      };

      let res: Response;
      try {
        // 1. Try direct Cloudflare Worker relay (no 4.5MB Vercel serverless limit)
        res = await fetch(`${RELAY_WORKER_URL}/api/print`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(printPayload),
        });
      } catch (directErr) {
        console.warn('[Print] Direct relay notice, falling back to Next.js route:', directErr);
        res = await fetch('/api/print', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(printPayload),
        });
      }

      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch {
        data = { error: responseText.slice(0, 200) || `Server error (${res.status})` };
      }

      if (res.ok && (data.success || data.status === 'ok')) {
        setPrintSuccessMessage(`Print job "${mainDocName}" successfully dispatched to "${data.printer || selectedPrinter?.displayName}"!`);
        setIsPaymentModalOpen(false);
      } else {
        throw new Error(data.error || `Failed to dispatch print job (${res.status})`);
      }
    } catch (err: any) {
      console.error('[Print] Error:', err);
      setPrintErrorMessage(err.message || 'Printing failed. Check laptop agent.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintClick = () => {
    if (!transformedPdfBytes || selectedPages.size === 0) return;
    if (freeMode) {
      executePrint();
    } else {
      setIsPaymentModalOpen(true);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-gray-200 dark:border-gray-800">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
                Cloud Print Kiosk
              </h1>
              <p className="text-xs text-gray-500">
                Interactive Page Grid • N-in-1 Imposition • Dark Mode Toner Saver
              </p>
            </div>
          </div>
        </div>

        {/* Status Indicators & Free Mode Toggle */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-xs font-medium">
            <span className={`w-2 h-2 rounded-full ${agentConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            <span className="text-gray-700 dark:text-gray-300">
              {agentConnected ? 'Laptop Printer Online' : 'Connecting to Agent...'}
            </span>
          </div>

          <label className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold text-indigo-700 dark:text-indigo-300 cursor-pointer">
            <input
              type="checkbox"
              checked={freeMode}
              onChange={(e) => setFreeMode(e.target.checked)}
              className="w-3.5 h-3.5 text-indigo-600 rounded"
            />
            <span>Free / Admin Mode</span>
          </label>
        </div>
      </header>

      {/* Notifications */}
      {printSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between text-emerald-800 dark:text-emerald-300 text-sm animate-fade-in shadow-sm">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span className="font-semibold">{printSuccessMessage}</span>
          </div>
          <button
            onClick={() => setPrintSuccessMessage(null)}
            className="text-xs font-bold underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {printErrorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 flex items-center justify-between text-red-800 dark:text-red-300 text-sm animate-fade-in shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-600 dark:text-red-400" />
            <span className="font-medium">{printErrorMessage}</span>
          </div>
          <button
            onClick={() => setPrintErrorMessage(null)}
            className="text-xs font-bold underline hover:no-underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: Upload, N-up Settings, and Printer Settings */}
        <div className="lg:col-span-5 space-y-6">
          {/* 1. Uploader */}
          <Uploader
            files={files}
            onFilesAdded={handleFilesAdded}
            onFileRemoved={handleFileRemoved}
            onClearAll={handleClearAll}
          />

          {/* 2. N-in-1 Multi-Page Settings */}
          <NupSettings
            options={nupOptions}
            onChange={(opts) => setNupOptions((prev) => ({ ...prev, ...opts }))}
            originalPages={selectedPages.size}
          />

          {/* 3. Printer & Duplex Settings */}
          <PrintSettings
            settings={printSettings}
            onChange={(opts) => setPrintSettings((prev) => ({ ...prev, ...opts }))}
            printers={printers}
            isLoadingPrinters={isLoadingPrinters}
            onRefreshPrinters={loadPrinters}
          />

          {/* Price & Summary Checkout Card */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
              <span className="font-semibold text-gray-900 dark:text-gray-100">Order Summary</span>
              <span className="text-xs text-indigo-600 dark:text-indigo-400 font-medium flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5" /> High-Speed RIP
              </span>
            </div>

            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex justify-between">
                <span>Selected Pages:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200 font-semibold">{selectedPages.size} of {totalOriginalPages} pages</span>
              </div>
              <div className="flex justify-between">
                <span>Layout Imposition:</span>
                <span className="font-medium text-indigo-600 dark:text-indigo-400 font-semibold">{nupOptions.nup} in 1 ({nupOptions.paperSize})</span>
              </div>
              <div className="flex justify-between">
                <span>Sheets to Print:</span>
                <span className="font-semibold text-gray-800 dark:text-gray-200">
                  {totalSheets} sheets × {printSettings.copies} {printSettings.copies === 1 ? 'copy' : 'copies'} = <span className="text-indigo-600 dark:text-indigo-400">{totalPrintSheets} total sheets</span>
                </span>
              </div>
              <div className="flex justify-between">
                <span>Print Destination:</span>
                <span className="font-medium text-gray-800 dark:text-gray-200 truncate max-w-[170px]">
                  {selectedPrinter?.displayName || 'Canon Copier'}
                </span>
              </div>

              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-baseline">
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">Total Price:</span>
                <div className="text-right">
                  <span className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    ₹{freeMode ? '0' : totalAmount}
                  </span>
                  {freeMode && <span className="block text-[10px] text-emerald-600 font-medium">Free Mode Active</span>}
                </div>
              </div>
            </div>

            {/* Print Submit Button */}
            <button
              type="button"
              onClick={handlePrintClick}
              disabled={files.length === 0 || selectedPages.size === 0 || isProcessing || isPrinting}
              className="w-full py-4 px-6 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {isPrinting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Printing on Copier...</span>
                </>
              ) : isProcessing ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing Layout...</span>
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5" />
                  <span>{freeMode ? 'Print Document Now' : `Proceed to Pay ₹${totalAmount} & Print`}</span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Interactive Page Grid Gallery & Full Sheet Viewer Tabs */}
        <div className="lg:col-span-7 space-y-4">
          {/* Tab Navigation */}
          <div className="flex items-center justify-between bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-2 shadow-sm">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPreviewTab('grid')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  previewTab === 'grid'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Layers className="w-4 h-4" />
                <span>Page Grid & Selection ({selectedPages.size})</span>
              </button>

              <button
                type="button"
                onClick={() => setPreviewTab('sheet')}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                  previewTab === 'sheet'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <Eye className="w-4 h-4" />
                <span>N-in-1 Sheet View ({totalSheets} {totalSheets === 1 ? 'Sheet' : 'Sheets'})</span>
              </button>
            </div>
          </div>

          {/* Active Tab View */}
          {previewTab === 'grid' ? (
            <PageGrid
              pdfBytes={originalPdfBytes}
              selectedPages={selectedPages}
              invertedPages={invertedPages}
              onToggleSelect={togglePageSelect}
              onToggleInvert={togglePageInvert}
              onSelectAll={selectAllPages}
              onDeselectAll={deselectAllPages}
              onInvertAll={invertAllPages}
              onResetInvert={resetInvert}
              onSelectOdd={selectOddPages}
              onSelectEven={selectEvenPages}
            />
          ) : (
            <LivePreview
              pdfBytes={transformedPdfBytes}
              currentPage={currentSheetIndex}
              totalPages={totalSheets}
              onPageChange={setCurrentSheetIndex}
              invertMode={invertOptions.mode}
              isProcessing={isProcessing}
            />
          )}
        </div>
      </div>

      {/* Razorpay Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        documentName={mainDocName}
        totalOriginalPages={totalOriginalPages}
        totalSheets={totalSheets}
        copies={printSettings.copies}
        isColor={isColorPrinter}
        isDuplex={isDuplexMode}
        onPaymentSuccess={executePrint}
        isPrinting={isPrinting}
      />
    </main>
  );
}
