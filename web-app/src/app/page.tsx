'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { NupSettings } from '@/components/nup-settings';
import { PrintSettings, PrinterInfo, PrintJobSettings } from '@/components/print-settings';
import { LivePreview } from '@/components/live-preview';
import { PageGrid } from '@/components/page-grid';
import { PaymentModal } from '@/components/payment-modal';
import { AdminModal } from '@/components/admin-modal';
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
  ShieldCheck,
  Lock,
  Unlock,
  Layers,
  ArrowRight,
  Eye,
  FileText,
  Plus,
  Trash2,
  X,
  UploadCloud,
  Check,
  ChevronDown,
  LayoutGrid,
  SunMoon,
  Files,
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
  includedInPrint: boolean;
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
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);

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

  // 4. UI, Printing, & Modals state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [printProgressText, setPrintProgressText] = useState<string | null>(null);
  const [printSuccessMessage, setPrintSuccessMessage] = useState<string | null>(null);
  const [printErrorMessage, setPrintErrorMessage] = useState<string | null>(null);
  const [freeMode, setFreeMode] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAdminModalOpen, setIsAdminModalOpen] = useState<boolean>(false);

  const handleAdminLogin = (pw: string) => {
    if (pw === 'admin' || pw === 'admin123' || pw === 'kiosk@2026' || pw === 'abhinav') {
      setIsAdmin(true);
      return true;
    }
    return false;
  };

  const handleAdminLogout = () => {
    setIsAdmin(false);
    setFreeMode(false);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const anyInputRef = useRef<HTMLInputElement>(null);

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
            const canon = data.printers.find((p: any) => p.slug === 'canonir7105' || p.slug.toLowerCase().includes('canon'));
            setPrintSettings((s) => ({ ...s, printerSlug: canon ? canon.slug : data.printers[0].slug }));
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
            const canon = fallbackData.printers.find((p: any) => p.slug === 'canonir7105' || p.slug.toLowerCase().includes('canon'));
            setPrintSettings((s) => ({ ...s, printerSlug: canon ? canon.slug : fallbackData.printers[0].slug }));
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

  // Handle uploaded files (all processed and queued together)
  const handleFilesAdded = async (fileList: FileList | File[]) => {
    if (!fileList || fileList.length === 0) return;

    try {
      setIsProcessingFiles(true);
      setPrintErrorMessage(null);
      setPrintSuccessMessage(null);

      const newDocs: DocumentItem[] = [];
      const timestamp = Date.now();

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        try {
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
            id: `${timestamp}-${i}-${Math.random().toString(36).substring(2, 8)}`,
            name: file.name,
            size: file.size,
            type: file.type,
            pdfBytes,
            pageCount,
            selectedPages: allPages,
            invertedPages: new Set<number>(),
            nupOptions: { ...DEFAULT_NUP },
            includedInPrint: true,
          });
        } catch (fileErr: any) {
          console.warn(`[handleFilesAdded] Error processing file "${file.name}":`, fileErr);
        }
      }

      if (newDocs.length > 0) {
        setDocuments((prev) => [...prev, ...newDocs]);
        setActiveDocId((prev) => prev || newDocs[0].id);
      } else {
        setPrintErrorMessage('Could not load the selected file(s). Please try standard PDF or PNG/JPG files.');
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

  const handleToggleDocIncluded = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDocuments((prev) =>
      prev.map((d) => (d.id === id ? { ...d, includedInPrint: !d.includedInPrint } : d))
    );
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

  // Batch N-up update for all documents
  const applyNupToAll = (nupVal: number) => {
    setDocuments((prev) =>
      prev.map((d) => ({
        ...d,
        nupOptions: { ...d.nupOptions, nup: nupVal },
      }))
    );
  };

  // Sheet calculation for any doc
  const getDocSheets = (doc: DocumentItem) => {
    const nup = doc.nupOptions.nup;
    const slots = nup === 2 ? 2 : nup === 3 ? 3 : nup === 4 ? 4 : nup === 6 ? 6 : nup === 9 ? 9 : 1;
    return Math.max(1, Math.ceil(doc.selectedPages.size / slots));
  };

  const activeDocSheets = activeDoc ? getDocSheets(activeDoc) : 0;

  // Documents queued for print (all included documents)
  const docsToPrint = documents.filter((d) => d.includedInPrint && d.selectedPages.size > 0);
  const totalPrintSheets = docsToPrint.reduce((acc, d) => acc + getDocSheets(d) * printSettings.copies, 0);
  const totalPagesSelected = docsToPrint.reduce((acc, d) => acc + d.selectedPages.size, 0);

  // Selected printer details & pricing
  const selectedPrinter = printers.find((p) => p.slug === printSettings.printerSlug);
  const isColorPrinter = selectedPrinter ? selectedPrinter.isColor : false;
  const isDuplexMode = printSettings.duplex !== 'simplex';
  const ratePerSheet = isColorPrinter ? 10.0 : isDuplexMode ? 3.0 : 2.0;
  const totalAmount = Math.max(1, Math.round(totalPrintSheets * ratePerSheet));

  // Dispatch Sequential Print Execution
  const executePrint = async () => {
    if (docsToPrint.length === 0) return;

    try {
      setIsPrinting(true);
      setPrintSuccessMessage(null);
      setPrintErrorMessage(null);

      const RELAY_WORKER_URL = 'https://relay-worker.abhinavip.workers.dev';
      const spooledDocNames: string[] = [];

      for (let i = 0; i < docsToPrint.length; i++) {
        const doc = docsToPrint[i];
        setPrintProgressText(`Printing (${i + 1}/${docsToPrint.length}): "${doc.name}"...`);

        const sortedSelected = Array.from(doc.selectedPages).sort((a, b) => a - b);
        const sortedInverted = Array.from(doc.invertedPages).sort((a, b) => a - b);

        // Generate print document for this specific file with its exact clean filename
        const { pdfBytes: printBytes } = await applyNupLayout(
          doc.pdfBytes,
          doc.nupOptions,
          doc.name,
          sortedSelected,
          sortedInverted
        );

        let binary = '';
        const len = printBytes.byteLength;
        for (let j = 0; j < len; j++) {
          binary += String.fromCharCode(printBytes[j]);
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
          : `All ${spooledDocNames.length} documents (${spooledDocNames.join(', ')}) successfully dispatched to "${selectedPrinter?.displayName || 'Printer'}"!`
      );
      setIsPaymentModalOpen(false);
    } catch (err: any) {
      console.error('[Print] Error:', err);
      setPrintErrorMessage(err.message || 'Printing failed. Check laptop agent.');
    } finally {
      setIsPrinting(false);
      setPrintProgressText(null);
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

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 pb-32">
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
              Multi-Document Queue • All-in-One Checkout • Exact File Names
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

          {/* Password-Protected Admin Button */}
          {!isAdmin ? (
            <button
              type="button"
              onClick={() => setIsAdminModalOpen(true)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-sm"
              title="Admin Settings (Password Protected)"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Admin</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsAdminModalOpen(true)}
                className="px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 shadow-sm ring-2 ring-indigo-500/20 hover:bg-indigo-100 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Admin Settings</span>
                {freeMode && (
                  <span className="bg-emerald-600 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                    FREE ACTIVE
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={handleAdminLogout}
                className="text-xs text-red-500 hover:underline font-bold px-1"
                title="Lock Admin Mode"
              >
                Lock
              </button>
            </div>
          )}
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

      {/* Drag & Drop Multi-file Upload Bar with Native Android & Desktop Multi-Select Labels */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingOver(true);
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingOver(false);
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            const files = Array.from(e.dataTransfer.files);
            handleFilesAdded(files);
          }
        }}
        className={`border-2 border-dashed rounded-3xl p-6 text-center transition-all flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm ${
          isDraggingOver
            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 ring-4 ring-indigo-600/20'
            : 'border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900'
        }`}
      >
        <label className="flex items-center gap-4 text-left cursor-pointer flex-1 group">
          <input
            type="file"
            multiple
            accept="application/pdf,image/*,.pdf,.png,.jpg,.jpeg,.webp"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                const files = Array.from(e.target.files);
                e.target.value = '';
                handleFilesAdded(files);
              }
            }}
            className="sr-only"
          />
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
            <UploadCloud className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              {documents.length === 0
                ? 'Upload Documents to Print (Select Multiple PDFs & Images)'
                : 'Add More Files to Print Queue'}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tap here or drop multiple files (hold Ctrl / Shift on laptop, long-press on Android)
            </p>
          </div>
        </label>

        {/* Mobile & Desktop Tap-Friendly Native Selectors */}
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <label className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold text-xs rounded-xl shadow-md shadow-indigo-600/20 flex items-center gap-1.5 transition-all cursor-pointer">
            <FileText className="w-4 h-4" />
            <span>+ Add PDFs</span>
            <input
              type="file"
              multiple
              accept="application/pdf,.pdf"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const files = Array.from(e.target.files);
                  e.target.value = '';
                  handleFilesAdded(files);
                }
              }}
              className="sr-only"
            />
          </label>

          <label className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs rounded-xl shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all cursor-pointer">
            <Plus className="w-4 h-4" />
            <span>+ Add Photos</span>
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const files = Array.from(e.target.files);
                  e.target.value = '';
                  handleFilesAdded(files);
                }
              }}
              className="sr-only"
            />
          </label>

          <label className="px-3.5 py-2.5 border border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all cursor-pointer">
            <span>Browse Any</span>
            <input
              type="file"
              multiple
              accept="*/*"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  const files = Array.from(e.target.files);
                  e.target.value = '';
                  handleFilesAdded(files);
                }
              }}
              className="sr-only"
            />
          </label>
        </div>
      </div>

      {/* Main Multi-Document Content */}
      {documents.length > 0 && (
        <div className="space-y-6">
          {/* Section 1: All Uploaded Documents Cards Grid */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-2.5">
                <Files className="w-5 h-5 text-indigo-600" />
                <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base">
                  Uploaded Documents ({documents.length} {documents.length === 1 ? 'file' : 'files'})
                </h2>
                <span className="text-xs text-gray-400 font-medium">
                  • {totalPagesSelected} pages ({totalPrintSheets} physical sheets)
                </span>
              </div>

              {/* Batch Presets for all files */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-gray-400 font-semibold">Set Layout for All:</span>
                <button
                  type="button"
                  onClick={() => applyNupToAll(1)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  1 in 1
                </button>
                <button
                  type="button"
                  onClick={() => applyNupToAll(2)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  2 in 1
                </button>
                <button
                  type="button"
                  onClick={() => applyNupToAll(4)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                >
                  4 in 1
                </button>
                <span className="text-gray-300 dark:text-gray-700">|</span>
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* Document Cards List */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {documents.map((doc, idx) => {
                const isActive = doc.id === activeDoc?.id;
                const docSheets = getDocSheets(doc);

                return (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setActiveDocId(doc.id);
                      setCurrentSheetIndex(1);
                    }}
                    className={`relative rounded-2xl border-2 p-4 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                      isActive
                        ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 shadow-md ring-2 ring-indigo-600/20'
                        : 'border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/40 hover:border-indigo-300'
                    }`}
                  >
                    {/* Top Row: File Name & Checkbox */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => handleToggleDocIncluded(doc.id, e)}
                          className={`w-5 h-5 rounded-md flex items-center justify-center border mt-0.5 transition-colors flex-shrink-0 ${
                            doc.includedInPrint
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'border-gray-400 bg-white dark:bg-gray-800'
                          }`}
                          title={doc.includedInPrint ? 'Included in print' : 'Excluded from print'}
                        >
                          {doc.includedInPrint && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </button>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-gray-900 dark:text-gray-100 truncate" title={doc.name}>
                            {idx + 1}. {doc.name}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.size)} • {doc.selectedPages.size} of {doc.pageCount} pgs
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleRemoveDoc(doc.id, e)}
                        className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 flex-shrink-0"
                        title="Remove document"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Middle Row: N-in-1 layout pill for this file */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700/60 text-xs">
                      <div className="flex items-center gap-1">
                        {[1, 2, 4].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDocuments((prev) =>
                                prev.map((d) => (d.id === doc.id ? { ...d, nupOptions: { ...d.nupOptions, nup: n } } : d))
                              );
                            }}
                            className={`px-2 py-0.5 rounded-md font-semibold transition-colors ${
                              doc.nupOptions.nup === n
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300'
                            }`}
                          >
                            {n}-in-1
                          </button>
                        ))}
                      </div>

                      <span className="font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100 dark:bg-indigo-950 px-2 py-0.5 rounded-full">
                        {docSheets} {docSheets === 1 ? 'sheet' : 'sheets'}
                      </span>
                    </div>

                    {/* Bottom Status / Inspect Active Button */}
                    <div className="flex items-center justify-between text-xs">
                      <span
                        className={`font-semibold ${
                          isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'
                        }`}
                      >
                        {isActive ? '● Currently Inspecting' : 'Click to inspect & edit pages'}
                      </span>

                      {doc.invertedPages.size > 0 && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-1.5 py-0.5 rounded-full font-bold">
                          {doc.invertedPages.size} Inverted
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 2: Active Document Detailed Inspector & Printer Settings */}
          {activeDoc && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Main Stage (Left 8 Cols): Interactive Viewer for Active Document */}
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

                  <span className="text-xs font-bold text-gray-500 hidden sm:inline truncate max-w-[250px] px-2">
                    Inspecting: {activeDoc.name}
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
                    isAdmin={isAdmin}
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
                {/* N-in-1 Imposition Settings for active doc */}
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
                  isAdmin={isAdmin}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating Bottom Sticky Action Bar (Calculates Total for ALL Uploaded Files) */}
      {documents.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-800 p-4 shadow-2xl">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {/* Summary details */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div>
                <span className="text-xs text-gray-400 block font-medium">Batch Queue:</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {docsToPrint.length} of {documents.length} Files Selected
                </span>
              </div>

              <div className="border-l border-gray-200 dark:border-gray-700 pl-4">
                <span className="text-xs text-gray-400 block font-medium">Total Output Sheets:</span>
                <div className="flex items-baseline gap-2 mt-0.5">
                  <span className="font-bold text-gray-900 dark:text-gray-100">
                    {totalPrintSheets} {totalPrintSheets === 1 ? 'Sheet' : 'Sheets'}
                  </span>
                  <span className="text-xs text-gray-500">
                    ({totalPagesSelected} pages total)
                  </span>
                </div>
              </div>

              <div className="border-l border-gray-200 dark:border-gray-700 pl-4">
                <span className="text-xs text-gray-400 block font-medium">Combined Price:</span>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    ₹{freeMode ? '0' : totalAmount}
                  </span>
                  {freeMode && <span className="text-[10px] text-emerald-600 font-bold">Admin Free</span>}
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
                  <span>{printProgressText || `Printing ${docsToPrint.length} Document(s)...`}</span>
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5" />
                  <span>
                    {freeMode
                      ? `Print All (${docsToPrint.length}) Files Now`
                      : `Proceed to Pay ₹${totalAmount} & Print All (${docsToPrint.length}) Files`}
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
        documentName={
          docsToPrint.length === 1
            ? docsToPrint[0].name
            : `${docsToPrint.length} Documents (${docsToPrint.map((d) => d.name).slice(0, 2).join(', ')}${docsToPrint.length > 2 ? '...' : ''})`
        }
        totalOriginalPages={totalPagesSelected}
        totalSheets={totalPrintSheets}
        copies={printSettings.copies}
        isColor={isColorPrinter}
        isDuplex={isDuplexMode}
        onPaymentSuccess={executePrint}
        isPrinting={isPrinting}
      />

      {/* Password-Protected Admin Portal Modal */}
      <AdminModal
        isOpen={isAdminModalOpen}
        onClose={() => setIsAdminModalOpen(false)}
        isAdmin={isAdmin}
        onLogin={handleAdminLogin}
        onLogout={handleAdminLogout}
        freeMode={freeMode}
        onToggleFreeMode={setFreeMode}
        printers={printers}
        selectedPrinterSlug={printSettings.printerSlug}
        onSelectPrinter={(slug) => setPrintSettings((s) => ({ ...s, printerSlug: slug }))}
        agentConnected={agentConnected}
      />
    </main>
  );
}
