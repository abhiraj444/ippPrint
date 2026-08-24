'use client';

import React from 'react';
import { SunMoon, Sparkles, AlertCircle } from 'lucide-react';
import { InvertOptions } from '@/lib/color-inverter';

interface InkSaverSettingsProps {
  options: InvertOptions;
  onChange: (opts: Partial<InvertOptions>) => void;
  totalPages: number;
}

export function InkSaverSettings({ options, onChange, totalPages }: InkSaverSettingsProps) {
  return (
    <div className="space-y-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <SunMoon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            Color Inverter & Toner Saver
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Flips dark backgrounds to white — saves up to 80% toner on lecture slides & dark PDFs
          </p>
        </div>
        {options.mode !== 'none' && (
          <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold px-2.5 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5" /> Toner Saver Active
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { id: 'none', label: 'Original (No Inversion)', desc: 'Keep document colors intact' },
          { id: 'all', label: 'Invert All Pages', desc: 'Convert all dark pages to white' },
          { id: 'custom', label: 'Invert Specific Pages', desc: 'Select specific slides/pages' },
        ].map((m) => {
          const isSelected = options.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onChange({ mode: m.id as any })}
              className={`p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                  : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40'
              }`}
            >
              <p className={`font-semibold text-sm ${isSelected ? 'text-indigo-900 dark:text-indigo-200' : 'text-gray-800 dark:text-gray-200'}`}>
                {m.label}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{m.desc}</p>
            </button>
          );
        })}
      </div>

      {options.mode === 'custom' && (
        <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 space-y-2">
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
            Pages to Invert (e.g. 1, 3-5, 8):
          </label>
          <input
            type="text"
            value={options.pageRange || ''}
            onChange={(e) => onChange({ pageRange: e.target.value })}
            placeholder="e.g. 1, 3-5, 8"
            className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-gray-800 dark:text-gray-200 focus:ring-2 focus:ring-indigo-500"
          />
          <p className="text-[11px] text-gray-400">
            Total pages available in document: <span className="font-semibold text-gray-600 dark:text-gray-300">{totalPages || 0}</span>
          </p>
        </div>
      )}

      {options.mode !== 'none' && (
        <div className="flex items-center gap-2 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={options.highContrast !== false}
              onChange={(e) => onChange({ highContrast: e.target.checked })}
              className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              High-contrast thresholding (completely strips gray background noise for crisp text)
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
