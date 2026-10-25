
'use client';
import React from 'react';
import { Database, Filter, Eye } from 'lucide-react';

interface AnalyticsDockProps {
  total: number;
  filtered: number;
  visible: number;
  onHighlightVisible: () => void;
}

export default function AnalyticsDock({ total, filtered, visible, onHighlightVisible }: AnalyticsDockProps) {
  return (
    <div className="absolute bottom-6 left-1/2 z-10 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 items-center gap-1.5 rounded-2xl border border-white/50 bg-white/90 px-2 py-2 shadow-2xl backdrop-blur-xl sm:bottom-8 sm:gap-3 sm:rounded-full sm:px-4">
      <div title="Active jobs returned for the current map area" className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 sm:gap-2 sm:px-3">
        <Database size={14} className="text-blue-500" />
        <span className="text-[11px] font-bold tabular-nums text-slate-700 sm:text-xs">{total} <span className="font-normal text-slate-500">Area</span></span>
      </div>
      <div title="Active jobs matching the title and job function filters" className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 sm:gap-2 sm:px-3">
        <Filter size={14} className="text-green-500" />
        <span className="text-[11px] font-bold tabular-nums text-slate-700 sm:text-xs">{filtered} <span className="font-normal text-slate-500">Match</span></span>
      </div>
      <button
        type="button"
        onClick={onHighlightVisible}
        title="Highlight jobs currently on screen"
        aria-label={`Highlight ${visible} visible jobs`}
        className="flex items-center gap-1.5 rounded-full border border-blue-400 bg-blue-600 px-2 py-1 text-white shadow-inner transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 sm:gap-2 sm:px-3"
      >
        <Eye size={14} className="text-white" />
        <span className="text-[11px] font-bold tabular-nums sm:text-xs">{visible} <span className="font-normal opacity-80">Visible</span></span>
      </button>
    </div>
  );
}
