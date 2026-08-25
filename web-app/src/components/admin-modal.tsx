'use client';

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  X,
  Printer,
  Sparkles,
  Zap,
  CheckCircle2,
  AlertCircle,
  Radio,
  Sliders,
  DollarSign,
  SunMoon,
} from 'lucide-react';
import { PrinterInfo, PrintJobSettings } from '@/components/print-settings';

interface AdminModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdmin: boolean;
  onLogin: (password: string) => boolean;
  onLogout: () => void;
  freeMode: boolean;
  onToggleFreeMode: (val: boolean) => void;
  printers: PrinterInfo[];
  selectedPrinterSlug: string;
  onSelectPrinter: (slug: string) => void;
  agentConnected: boolean;
}

export function AdminModal({
  isOpen,
  onClose,
  isAdmin,
  onLogin,
  onLogout,
  freeMode,
  onToggleFreeMode,
  printers,
  selectedPrinterSlug,
  onSelectPrinter,
  agentConnected,
}: AdminModalProps) {
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const success = onLogin(passwordInput);
    if (success) {
      setPasswordInput('');
    } else {
      setLoginError('Invalid Admin Password. Please try again.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center text-white ${
              isAdmin ? 'bg-emerald-600 shadow-emerald-600/30' : 'bg-indigo-600 shadow-indigo-600/30'
            } shadow-lg`}>
              {isAdmin ? <ShieldCheck className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="font-extrabold text-base text-gray-900 dark:text-gray-100">
                {isAdmin ? 'Admin Control Portal' : 'Admin Authentication'}
              </h3>
              <p className="text-xs text-gray-500">
                {isAdmin ? 'Manage Kiosk Pricing, Printers & Free Mode' : 'Enter admin password to unlock management features'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Not Logged In View */}
        {!isAdmin ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                Admin Password
              </label>
              <input
                type="password"
                placeholder="Enter admin password..."
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-sm focus:ring-2 focus:ring-indigo-600 text-gray-900 dark:text-gray-100 outline-none"
              />
            </div>

            {loginError && (
              <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md shadow-indigo-600/30 flex items-center gap-1.5"
              >
                <Unlock className="w-3.5 h-3.5" />
                <span>Unlock Admin Portal</span>
              </button>
            </div>
          </form>
        ) : (
          /* Logged In Admin Controls */
          <div className="space-y-5">
            {/* 1. Free Mode / Payment Bypass Toggle */}
            <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-800/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                  Free Print / Bypass Payment Mode
                </span>
                <span className="text-[11px] text-gray-500 block mt-0.5">
                  When enabled, users & admin can print directly without paying via Razorpay
                </span>
              </div>

              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={freeMode}
                  onChange={(e) => onToggleFreeMode(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* 2. Destination Printer Override */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                <Printer className="w-3.5 h-3.5 text-indigo-600" />
                <span>Default Output Printer</span>
              </label>

              <div className="space-y-2">
                {printers.map((p) => {
                  const isSelected = selectedPrinterSlug === p.slug;
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => onSelectPrinter(p.slug)}
                      className={`w-full p-3 rounded-xl border text-left flex items-center justify-between transition-all ${
                        isSelected
                          ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-600/20'
                          : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 bg-white dark:bg-gray-800'
                      }`}
                    >
                      <div>
                        <p className="font-bold text-xs text-gray-900 dark:text-gray-100">
                          {p.displayName} {p.slug === 'canonir7105' ? '(Primary Kiosk Copier)' : '(Secondary WiFi)'}
                        </p>
                        <p className="text-[11px] text-gray-400">{p.localName} • {p.isColor ? 'Color' : 'B&W'}</p>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. System Connection Diagnostics */}
            <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700/60 space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Laptop Spooler Agent:</span>
                <span className={`font-bold flex items-center gap-1.5 ${agentConnected ? 'text-emerald-600' : 'text-red-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${agentConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  {agentConnected ? 'Connected & Online' : 'Offline / Checking...'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Cloudflare Relay:</span>
                <span className="font-mono text-[10px] text-indigo-600">relay-worker.abhinavip.workers.dev</span>
              </div>
            </div>

            {/* Footer Logout & Close */}
            <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-2 rounded-xl text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                Lock / Logout Admin
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
