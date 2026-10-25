
'use client';
import React from 'react';
import { Database, Filter, Eye } from 'lucide-react';

interface AnalyticsDockProps {
  total: number;
  filtered: number;
  visible: number;
}

export default function AnalyticsDock({ total, filtered, visible }: AnalyticsDockProps) {
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex items-center gap-6 px-6 py-3 backdrop-blur-md bg-white/60 dark:bg-slate-900/60 rounded-full border border-white/30 dark:border-slate-700 shadow-2xl transition-all animate-in fade-in slide-in-from-bottom-4">
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Database size={14} className="text-blue-500" />
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{total} <span className="font-normal opacity-60">Total</span></span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
        <Filter size={14} className="text-green-500" />
        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{filtered} <span className="font-normal opacity-60">Filtered</span></span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500 text-white border border-blue-400 shadow-inner">
        <Eye size={14} className="text-white" />
        <span className="text-xs font-bold">{visible} <span className="font-normal opacity-80">On Screen</span></span>
      </div>
    </div>
  );
}
