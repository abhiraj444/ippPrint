'use client';

import React, { useEffect, useState } from 'react';
import { Printer, Copy, RotateCcw, CheckCircle2, RefreshCw, Sparkles, Zap } from 'lucide-react';

export interface PrinterInfo {
  slug: string;
  displayName: string;
  localName: string;
  isColor: boolean;
}

export interface PrintJobSettings {
  printerSlug: string;
  copies: number;
  duplex: 'simplex' | 'duplex' | 'duplexshort';
  pageRangeMode: 'all' | 'odd' | 'even' | 'custom';
  customPageRange: string;
  dpi: 150 | 300;
}

interface PrintSettingsProps {
  settings: PrintJobSettings;
  onChange: (settings: Partial<PrintJobSettings>) => void;
  printers: PrinterInfo[];
  isLoadingPrinters: boolean;
  onRefreshPrinters: () => void;
  isAdmin?: boolean;
}

export function PrintSettings({
  settings,
  onChange,
  printers,
  isLoadingPrinters,
  onRefreshPrinters,
  isAdmin = false,
}: PrintSettingsProps) {
  const selectedPrinter = printers.find((p) => p.slug === settings.printerSlug) || printers[0];

  return (
    <div className="space-y-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Printer className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Printer & Output Settings
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Select copies and double-sided duplex options</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={onRefreshPrinters}
            disabled={isLoadingPrinters}
            className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-medium flex items-center gap-1.5 p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingPrinters ? 'animate-spin' : ''}`} /> Refresh
          </button>
        )}
      </div>

      {/* Printer Selection (Admin) vs Fixed Canon Copier (User) */}
      <div>
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Destination Printer</label>
        {isAdmin ? (
          <div className="space-y-2">
            {printers.length === 0 ? (
              <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 text-center text-sm text-gray-500">
                {isLoadingPrinters ? 'Discovering laptop printers...' : 'No printers detected. Ensure laptop-agent is running.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {printers.map((p) => {
                  const isSelected = settings.printerSlug === p.slug;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => onChange({ printerSlug: p.slug })}
                      className={`p-3 rounded-xl border text-left flex items-start justify-between transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'
                      }`}
                    >
                      <div>
                        <p className={`font-medium text-sm ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-800 dark:text-gray-200'}`}>
                          {p.displayName}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">{p.localName}</p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            p.isColor ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300' : 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {p.isColor ? 'Color' : 'Monochrome B&W'}
                          </span>
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-indigo-600">
                <Printer className="w-4 h-4" />
              </div>
              <div>
                <p className="font-bold text-xs text-gray-900 dark:text-gray-100">
                  {selectedPrinter?.displayName || 'Canon Copier (iR7105)'}
                </p>
                <p className="text-[11px] text-gray-400">High-Speed Commercial Copier • Heavy Duty</p>
              </div>
            </div>
            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
              Ready
            </span>
          </div>
        )}
      </div>

      {/* Copies & Duplex */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Number of Copies</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ copies: Math.max(1, settings.copies - 1) })}
              className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              -
            </button>
            <input
              type="number"
              min="1"
              max="99"
              value={settings.copies}
              onChange={(e) => onChange({ copies: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              className="w-full text-center font-semibold text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 py-2 text-gray-800 dark:text-gray-200"
            />
            <button
              type="button"
              onClick={() => onChange({ copies: settings.copies + 1 })}
              className="w-10 h-10 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Double-Sided (Duplex)</label>
          <select
            value={settings.duplex}
            onChange={(e) => onChange({ duplex: e.target.value as any })}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="simplex">Single-Sided (1 Side)</option>
            <option value="duplex">Double-Sided (Flip on Long Edge)</option>
            <option value="duplexshort">Double-Sided (Flip on Short Edge / Tablet)</option>
          </select>
        </div>
      </div>

      {/* Print Quality / DPI Resolution Selector */}
      <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
          Print Quality / Resolution
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChange({ dpi: 150 })}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              (settings.dpi || 150) === 150
                ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 bg-gray-50/50 dark:bg-gray-800/40'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${
              (settings.dpi || 150) === 150
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-bold text-xs text-gray-900 dark:text-gray-100">150 DPI</p>
              <p className="text-[10px] text-gray-500">Fast Standard RIP</p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => onChange({ dpi: 300 })}
            className={`p-2.5 rounded-xl border text-left flex items-start gap-2.5 transition-all ${
              settings.dpi === 300
                ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 bg-gray-50/50 dark:bg-gray-800/40'
            }`}
          >
            <div className={`p-1.5 rounded-lg ${
              settings.dpi === 300
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
            }`}>
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div>
              <p className="font-bold text-xs text-gray-900 dark:text-gray-100">300 DPI</p>
              <p className="text-[10px] text-gray-500">High Res / Photos</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
