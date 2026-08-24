'use client';

import React, { useCallback } from 'react';
import { UploadCloud, FileText, Image as ImageIcon, Trash2, X } from 'lucide-react';

export interface UploadedFileItem {
  id: string;
  file: File;
  name: string;
  size: number;
  type: string;
  previewUrl?: string;
  pageCount?: number;
}

interface UploaderProps {
  files: UploadedFileItem[];
  onFilesAdded: (newFiles: File[]) => void;
  onFileRemoved: (id: string) => void;
  onClearAll: () => void;
}

export function Uploader({ files, onFilesAdded, onFileRemoved, onClearAll }: UploaderProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        onFilesAdded(Array.from(e.dataTransfer.files));
      }
    },
    [onFilesAdded]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onFilesAdded(Array.from(e.target.files));
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className="border-2 border-dashed border-indigo-200 dark:border-indigo-800 hover:border-indigo-500 rounded-2xl p-8 text-center transition-all bg-indigo-50/50 dark:bg-indigo-950/20 cursor-pointer group"
      >
        <label className="cursor-pointer flex flex-col items-center justify-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-800 dark:text-gray-200">
              Drag & Drop documents here, or <span className="text-indigo-600 dark:text-indigo-400 underline">browse</span>
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Supports PDF, PNG, JPG, JPEG, WEBP • Multiple files supported
            </p>
          </div>
          <input
            type="file"
            multiple
            accept=".pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleChange}
          />
        </label>
      </div>

      {files.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {files.length} {files.length === 1 ? 'Document' : 'Documents'} uploaded
            </span>
            <button
              onClick={onClearAll}
              className="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>

          <div className="divide-y divide-gray-100 dark:divide-gray-800 mt-2 max-h-48 overflow-y-auto">
            {files.map((item) => (
              <div key={item.id} className="py-2.5 flex items-center justify-between text-sm">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                    {item.type.includes('pdf') ? <FileText className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />}
                  </div>
                  <div className="truncate">
                    <p className="font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                    <p className="text-xs text-gray-400">{formatSize(item.size)}</p>
                  </div>
                </div>
                <button
                  onClick={() => onFileRemoved(item.id)}
                  className="text-gray-400 hover:text-red-500 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
