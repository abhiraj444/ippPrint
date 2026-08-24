'use client';

import React from 'react';
import { LayoutGrid, Grid, Square, Columns, Rows, Check } from 'lucide-react';
import { NupOptions } from '@/lib/pdf-processor';

interface NupSettingsProps {
  options: NupOptions;
  onChange: (opts: Partial<NupOptions>) => void;
  originalPages: number;
}

const PRESETS = [
  { value: 1, label: '1 in 1', desc: 'Standard full page', icon: Square },
  { value: 2, label: '2 in 1', desc: '2 pages side-by-side', icon: Columns },
  { value: 3, label: '3 in 1', desc: '3 pages vertical stack', icon: Rows },
  { value: 4, label: '4 in 1', desc: '2x2 grid (Best for slides)', icon: LayoutGrid, popular: true },
  { value: 6, label: '6 in 1', desc: '2x3 grid', icon: Grid },
  { value: 9, label: '9 in 1', desc: '3x3 grid (Cheat-sheet)', icon: Grid },
];

export function NupSettings({ options, onChange, originalPages }: NupSettingsProps) {
  const calculateSheets = (n: number) => {
    if (!originalPages) return 0;
    return Math.ceil(originalPages / n);
  };

  return (
    <div className="space-y-5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <LayoutGrid className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            N-in-1 Multi-Page Layout
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Save paper by fitting multiple pages onto a single sheet</p>
        </div>
      </div>

      {/* Preset Buttons Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          const isSelected = options.nup === p.value;
          const sheets = calculateSheets(p.value);

          return (
            <button
              key={p.value}
              type="button"
              onClick={() => onChange({ nup: p.value })}
              className={`relative p-3.5 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'
              }`}
            >
              {p.popular && (
                <span className="absolute -top-2 right-2 bg-indigo-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
                  Popular
                </span>
              )}
              <div className="flex items-center justify-between mb-1.5">
                <Icon className={`w-5 h-5 ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />}
              </div>
              <p className={`font-semibold text-sm ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-800 dark:text-gray-200'}`}>
                {p.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{p.desc}</p>
              {originalPages > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-200/60 dark:border-gray-700/60 flex items-center justify-between text-[11px]">
                  <span className="text-gray-500">Result:</span>
                  <span className="font-semibold text-indigo-600 dark:text-indigo-400">{sheets} {sheets === 1 ? 'sheet' : 'sheets'}</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Advanced Layout Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100 dark:border-gray-800">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Sheet Orientation</label>
          <select
            value={options.orientation}
            onChange={(e) => onChange({ orientation: e.target.value as any })}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="auto">Auto (Smart Fit)</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1.5">Paper Size</label>
          <select
            value={options.paperSize}
            onChange={(e) => onChange({ paperSize: e.target.value as any })}
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="A4">A4 (Standard 210 × 297 mm)</option>
            <option value="Letter">Letter (8.5 × 11 in)</option>
            <option value="Legal">Legal (8.5 × 14 in)</option>
          </select>
        </div>

        <div className="sm:col-span-2 flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.drawBorders}
              onChange={(e) => onChange({ drawBorders: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Draw subtle dividing border around miniature pages
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
