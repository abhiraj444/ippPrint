'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NupSettings } from '@/components/nup-settings';
import { PrintSettings, PrinterInfo, PrintJobSettings } from '@/components/print-settings';
import { LivePreview } from '@/components/live-preview';
import { PageGrid } from '@/components/page-grid';
import { PaymentModal } from '@/components/payment-modal';
import { NupOptions, imageToPdf, applyNupLayout } from '@/lib/pdf-processor';
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
  FileText,
  Plus,
  Trash2,
  X,
  FileCheck,
} from 'lucide-react';

export interface DocumentItem {
  id: string;
  name: string;
  size: number;
  type: string;
  pdfBytes: Uint8Array;
  pageCount: number;
  selectedPages: Set<number>;
  invertedPages: Set<number>;
  nupOptions: NupOptions;
}

const DEFAULT_NUP: NupOptions = {
  nup: 1,
  orientation: 'auto',
  drawBorders: true,
  marginPt: 20,
  gutterPt: 10,
  paperSize: 'A4',
};

export default function PrintKioskPage() {
  // 1. Multi-Document Queue state
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [isProcessingFiles, setIsProcessingFiles] = useState<boolean>(false);
  const [previewTab, setPreviewTab] = useState<'grid' | 'sheet'>('grid');
  const [currentSheetIndex, setCurrentSheetIndex] = useState<number>(1);
  const [printScope, setPrintScope] = useState<'current' | 'all'>('current');

  // 2. Global Print Job Settings
  const [printSettings, setPrintSettings] = useState<PrintJobSettings>({
    printerSlug: 'canonir7105',
    copies: 1,
    duplex: 'simplex',
    pageRangeMode: 'all',
    customPageRange: '',
  });

  // 3. Printers & Connectivity
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [isLoadingPrinters, setIsLoadingPrinters] = useState<boolean>(true);
  const [agentConnected, setAgentConnected] = useState<boolean>(true);

  // 4. UI & Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null);
  const [freeMode, setFreeMode] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch live printers on load & interval
  const loadPrinters = useCallback(async (isInitial = false) => {
    try {
      if (isInitial) setIsLoadingPrinters(true);
      const res = await fetch('https://relay-worker.abhinavip.workers.dev/api/printers', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.printers && data.printers.length > 0) {
          setPrinters(data.printers);
          if (!printSettings.printerSlug || !data.printers.some((p: any) => p.slug === printSettings.printerSlug)) {
            setPrintSettings((s) => ({ ...s, printerSlug: data.printers[0].slug }));
          }
          setAgentConnected(data.status === 'ok' || data.status !== 'fallback');
        } else {
          setAgentConnected(false);
        }
      } else {
        const fallbackRes = await fetch('/api/printers', { cache: 'no-store' });
        if (fallbackRes.ok) {
          const fallbackData = await fallbackRes.json();
          if (fallbackData.printers && fallbackData.printers.length > 0) {
            setPrinters(fallbackData.printers);
            setAgentConnected(fallbackData.status === 'ok');
          }
        }
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
    }, 10000);
    return () => clearInterval(interval);
  }, [loadPrinters]);

  // Handle uploaded files (each as a separate document)
  const handleFilesAdded = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;

    try {
      setIsProcessingFiles(true);
      setPrintErrorMessage(null);
      setPrintSuccessMessage(null);

      const newDocs: DocumentItem[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const buffer = new Uint8Array(await file.arrayBuffer());
        const isPdf = file.type.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);

        let pdfBytes: Uint8Array;
        if (isPdf) {
          pdfBytes = buffer;
        } else if (isImage) {
          pdfBytes = await imageToPdf(buffer, file.type || 'image/jpeg');
        } else {
          pdfBytes = buffer;
        }

        const srcDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
        const pageCount = srcDoc.getPageCount();

        const allPages = new Set<number>();
        for (let p = 0; p < pageCount; p++) allPages.add(p);

        newDocs.push({
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          name: file.name,
          size: file.size,
          type: file.type,
          pdfBytes,
          pageCount,
          selectedPages: allPages,
          invertedPages: new Set<number>(),
          nupOptions: { ...DEFAULT_NUP },
        });
      }

      setDocuments((prev) => {
        const combined = [...prev, ...newDocs];
        if (!activeDocId && combined.length > 0) {
          setActiveDocId(combined[0].id);
        }
        return combined;
      });

      if (!activeDocId && newDocs.length > 0) {
        setActiveDocId(newDocs[0].id);
      }
    } catch (err: any) {
      console.error('[Uploader] Error parsing files:', err);
      setPrintErrorMessage(`Error loading file: ${err.message}`);
    } finally {
      setIsProcessingFiles(false);
    }
  };

  const handleRemoveDoc = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDocuments((prev) => {
      const next = prev.filter((d) => d.id !== id);
      if (activeDocId === id) {
        setActiveDocId(next.length > 0 ? next[0].id : null);
      }
      return next;
    });
  };

  const handleClearAll = () => {
    setDocuments([]);
    setActiveDocId(null);
    setPrintSuccessMessage(null);
    setPrintErrorMessage(null);
  };

  // Active Document
  const activeDoc = documents.find((d) => d.id === activeDocId) || documents[0] || null;

  // Active Document updates
  const updateActiveDoc = (updater: (doc: DocumentItem) => DocumentItem) => {
    if (!activeDoc) return;
    setDocuments((prev) =>
      prev.map((d) => (d.id === activeDoc.id ? updater(d) : d))
    );
  };

  // Page Grid Handlers for Active Document
  const togglePageSelect = (idx: number) => {
    updateActiveDoc((doc) => {
      const next = new Set(doc.selectedPages);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { ...doc, selectedPages: next };
    });
  };

  const togglePageInvert = (idx: number) => {
    updateActiveDoc((doc) => {
      const next = new Set(doc.invertedPages);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return { ...doc, invertedPages: next };
    });
  };

  const selectAllPages = () => {
    updateActiveDoc((doc) => {
      const all = new Set<number>();
      for (let i = 0; i < doc.pageCount; i++) all.add(i);
      return { ...doc, selectedPages: all };
    });
  };

  const deselectAllPages = () => {
    updateActiveDoc((doc) => ({ ...doc, selectedPages: new Set() }));
  };

  const selectOddPages = () => {
    updateActiveDoc((doc) => {
      const odds = new Set<number>();
      for (let i = 0; i < doc.pageCount; i += 2) odds.add(i);
      return { ...doc, selectedPages: odds };
    });
  };

  const selectEvenPages = () => {
    updateActiveDoc((doc) => {
      const evens = new Set<number>();
      for (let i = 1; i < doc.pageCount; i += 2) evens.add(i);
      return { ...doc, selectedPages: evens };
    });
  };

  const invertAllPages = () => {
    updateActiveDoc((doc) => {
      const all = new Set<number>();
      for (let i = 0; i < doc.pageCount; i++) all.add(i);
      return { ...doc, invertedPages: all };
    });
  };

  const resetInvert = () => {
    updateActiveDoc((doc) => ({ ...doc, invertedPages: new Set() }));
  };

  const updateActiveNup = (newNup: Partial<NupOptions>) => {
    updateActiveDoc((doc) => ({ ...doc, nupOptions: { ...doc.nupOptions, ...newNup } }));
  };

  // Sheet calculation
  const getDocSheets = (doc: DocumentItem) => {
    const nup = doc.nupOptions.nup;
    const slots = nup === 2 ? 2 : nup === 3 ? 3 : nup === 4 ? 4 : nup === 6 ? 6 : nup === 9 ? 9 : 1;
    return Math.max(1, Math.ceil(doc.selectedPages.size / slots));
  };

  const activeDocSheets = activeDoc ? getDocSheets(activeDoc) : 0;

  // Total sheets across all selected documents
  const docsToPrint = printScope === 'all' ? documents : activeDoc ? [activeDoc] : [];
  const totalPrintSheets = docsToPrint.reduce((acc, d) => acc + getDocSheets(d) * printSettings.copies, 0);

  // Selected printer details & pricing
  const selectedPrinter = printers.find((p) => p.slug === printSettings.printerSlug);
  const isColorPrinter = selectedPrinter ? selectedPrinter.isColor : false;
  const isDuplexMode = printSettings.duplex !== 'simplex';
  const ratePerSheet = isColorPrinter ? 10.0 : isDuplexMode ? 3.0 : 2.0;
  const totalAmount = Math.max(1, Math.round(totalPrintSheets * ratePerSheet));

  // Dispatch Print Execution
  const executePrint = async () => {
    if (docsToPrint.length === 0) return;

    try {
      setIsPrinting(true);
      setPrintSuccessMessage(null);
      setPrintErrorMessage(null);

      const RELAY_WORKER_URL = 'https://relay-worker.abhinavip.workers.dev';
      const spooledDocNames: string[] = [];

      for (const doc of docsToPrint) {
        if (doc.selectedPages.size === 0) continue;

        const sortedSelected = Array.from(doc.selectedPages).sort((a, b) => a - b);
        const sortedInverted = Array.from(doc.invertedPages).sort((a, b) => a - b);

        // Generate print document for this specific file with its exact filename
        const { pdfBytes: printBytes } = await applyNupLayout(
          doc.pdfBytes,
          doc.nupOptions,
          doc.name,
          sortedSelected,
          sortedInverted
        );

        let binary = '';
        const len = printBytes.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(printBytes[i]);
        }
        const pdfBase64 = btoa(binary);

        const printPayload = {
          printerSlug: printSettings.printerSlug,
          documentName: doc.name,
          pdfBase64,
          copies: printSettings.copies,
          duplex: printSettings.duplex,
        };

        let res: Response;
        try {
          res = await fetch(`${RELAY_WORKER_URL}/api/print`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(printPayload),
          });
        } catch (directErr) {
          console.warn('[Print] Relay fallback to internal route:', directErr);
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
          spooledDocNames.push(doc.name);
        } else {
          throw new Error(data.error || `Failed to print "${doc.name}"`);
        }
      }

      setPrintSuccessMessage(
        spooledDocNames.length === 1
          ? `Print job "${spooledDocNames[0]}" successfully dispatched to "${selectedPrinter?.displayName || 'Printer'}"!`
          : `${spooledDocNames.length} separate documents (${spooledDocNames.join(', ')}) successfully dispatched to "${selectedPrinter?.displayName || 'Printer'}"!`
      );
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      console.error('[Print] Error:', err);
      setPrintErrorMessage(err.message || 'Printing failed. Check laptop agent.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintClick = () => {
    if (docsToPrint.length === 0) return;
    if (freeMode) {
      executePrint();
    } else {
      setIsPaymentModalOpen(true);
    }
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-28">
      {/* Top Navbar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 tracking-tight">
              Cloud Print Kiosk
            </h1>
            <p className="text-xs text-gray-500 font-medium">
              Multi-Document Queue • Per-Page Toner Saver • N-in-1 Imposition
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Connection Status */}
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-2 border ${
              agentConnected
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full ${
                agentConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span>{agentConnected ? 'Printer Online' : 'Connecting Agent...'}</span>
          </div>

          {/* Admin Free Toggle */}
          <label className="flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full cursor-pointer hover:bg-gray-200 transition-colors">
            <input
              type="checkbox"
              checked={freeMode}
              onChange={(e) => setFreeMode(e.target.checked)}
              className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500"
            />
            <span>Free / Admin Mode</span>
          </label>
        </div>
      </header>

      {/* Notifications */}
      {printSuccessMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 flex items-start justify-between gap-3 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="text-sm font-semibold">{printSuccessMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintSuccessMessage(null)}
            className="text-xs font-bold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {printErrorMessage && (
        <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 flex items-start justify-between gap-3 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm font-semibold">{printErrorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setPrintErrorMessage(null)}
            className="text-xs font-bold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Hidden File Input for uploading */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,image/*"
        onChange={(e) => {
          if (e.target.files) handleFilesAdded(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Document Queue Switcher Bar */}
      {documents.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-3 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Document Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-thin">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2">
              Queue ({documents.length}):
            </span>

            {documents.map((doc) => {
              const isActive = doc.id === activeDoc?.id;
              return (
                <button
                  key={doc.id}
                  type="button"
                  onClick={() => {
                    setActiveDocId(doc.id);
                    setCurrentSheetIndex(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 border flex-shrink-0 ${
                    isActive
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20 ring-2 ring-indigo-600/30'
                      : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span className="max-w-[150px] truncate">{doc.name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isActive ? 'bg-indigo-700 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {doc.selectedPages.size} / {doc.pageCount} pgs
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleRemoveDoc(doc.id, e)}
                    className="hover:opacity-75 p-0.5"
                    title="Remove file"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </button>
              );
            })}

            {/* Add More Files Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-2 rounded-xl text-xs font-semibold border border-dashed border-gray-300 dark:border-gray-700 hover:border-indigo-500 hover:text-indigo-600 text-gray-500 transition-colors flex items-center gap-1.5 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add PDF / Image</span>
            </button>
          </div>

          {/* Clear Queue */}
          <button
            type="button"
            onClick={handleClearAll}
            className="text-xs font-semibold text-red-500 hover:text-red-600 px-3 py-1 flex items-center gap-1.5 flex-shrink-0 self-end sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear Queue</span>
          </button>
        </div>
      )}

      {/* Main Grid / PDF Viewer Hero Section */}
      {documents.length === 0 ? (
        /* Empty State: Prominent Drag & Drop Uploader */
        <div className="bg-white dark:bg-gray-900 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-3xl p-12 text-center shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
            <FileCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Upload Documents to Print
            </h2>
            <p className="text-sm text-gray-500 max-w-md mx-auto mt-1">
              Drag and drop multiple PDFs or images. Each file will be queued separately with its own real file name.
            </p>
          </div>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-sm rounded-2xl shadow-lg shadow-indigo-600/30 inline-flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Browse Files from Device</span>
          </button>
        </div>
      ) : activeDoc ? (
        /* Hero PDF Stage & Controls */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Stage (Left 8 Cols): Interactive Viewer */}
          <div className="lg:col-span-8 space-y-4">
            {/* Tab View Switcher */}
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
                  <span>Page Grid ({activeDoc.selectedPages.size} / {activeDoc.pageCount})</span>
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
                  <span>N-in-1 Sheet View ({activeDocSheets} {activeDocSheets === 1 ? 'Sheet' : 'Sheets'})</span>
                </button>
              </div>

              <span className="text-xs font-bold text-gray-500 hidden sm:inline truncate max-w-[200px] px-2">
                Active: {activeDoc.name}
              </span>
            </div>

            {/* Viewer Content */}
            {previewTab === 'grid' ? (
              <PageGrid
                pdfBytes={activeDoc.pdfBytes}
                selectedPages={activeDoc.selectedPages}
                invertedPages={activeDoc.invertedPages}
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
                sourcePdfBytes={activeDoc.pdfBytes}
                nupOptions={activeDoc.nupOptions}
                selectedPages={activeDoc.selectedPages}
                invertedPages={activeDoc.invertedPages}
                currentSheet={currentSheetIndex}
                totalSheets={activeDocSheets}
                onPageChange={setCurrentSheetIndex}
              />
            )}
          </div>

          {/* Configuration & Output Settings (Right 4 Cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* N-in-1 Imposition Settings */}
            <NupSettings
              options={activeDoc.nupOptions}
              onChange={updateActiveNup}
              originalPages={activeDoc.selectedPages.size}
            />

            {/* Printer & Output Settings */}
            <PrintSettings
              settings={printSettings}
              onChange={(opts) => setPrintSettings((prev) => ({ ...prev, ...opts }))}
              printers={printers}
              isLoadingPrinters={isLoadingPrinters}
              onRefreshPrinters={() => loadPrinters(true)}
            />
          </div>
        </div>
      ) : null}

      {/* Floating Bottom Sticky Action Bar */}
      {documents.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 shadow-2xl">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Summary details */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400 block font-medium">Print Scope:</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => setPrintScope('current')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      printScope === 'current'
                        ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                        : 'text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    Current File ({activeDoc?.name.slice(0, 16)}...)
                  </button>
                  {documents.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPrintScope('all')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                        printScope === 'all'
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'text-gray-500 hover:bg-gray-100'
                      }`}
                    >
                      All ({documents.length} Files)
                    </button>
                  )}
                </div>
              </div>

              <div className="border-l border-gray-200 dark:border-gray-700 pl-4">
                <span className="text-xs text-gray-400 block font-medium">Sheets & Price:</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {totalPrintSheets} {totalPrintSheets === 1 ? 'Sheet' : 'Sheets'}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({docsToPrint.reduce((acc, d) => acc + d.selectedPages.size, 0)} pages)
                  </span>
                  <span className="text-lg font-extrabold text-indigo-600 dark:text-indigo-400">
                    ₹{totalAmount}
                  </span>
                </div>
              </div>
            </div>

            {/* Main Action Button */}
            <button
              type="button"
              onClick={handlePrintClick}
              disabled={docsToPrint.length === 0 || totalPrintSheets === 0 || isPrinting}
              className="py-3.5 px-8 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-base rounded-2xl shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-2.5 transition-all disabled:opacity-50 disabled:shadow-none"
            >
              {isPrinting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Printing {docsToPrint.length} Document(s)...</span>
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5" />
                  <span>
                    {freeMode
                      ? `Print ${docsToPrint.length === 1 ? `"${docsToPrint[0].name.slice(0, 18)}"` : `All (${docsToPrint.length}) Documents`}`
                      : `Proceed to Pay ₹${totalAmount} & Print (${docsToPrint.length} Doc)`}
                  </span>
                  <ArrowRight className="w-5 h-5 ml-1" />
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Razorpay Payment Modal */}
      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        documentName={docsToPrint.length === 1 ? docsToPrint[0].name : `${docsToPrint.length} Documents Queue`}
        totalOriginalPages={docsToPrint.reduce((acc, d) => acc + d.selectedPages.size, 0)}
        totalSheets={totalPrintSheets}
        copies={printSettings.copies}
        isColor={isColorPrinter}
        isDuplex={isDuplexMode}
        onPaymentSuccess={executePrint}
        isPrinting={isPrinting}
      />
    </main>
  );
}
