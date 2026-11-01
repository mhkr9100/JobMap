"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { Briefcase, Check, ChevronLeft, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { jobFunctionCounts } from "@/lib/jobs";
import type { Job, JobSearchFilters } from "@/types";
import { INITIAL_JOB_FILTERS } from "@/types";

interface JobSidebarProps {
  jobs: Job[];
  titleQuery: string;
  filters: JobSearchFilters;
  setFilters: Dispatch<SetStateAction<JobSearchFilters>>;
}

export default function JobSidebar({ jobs, titleQuery, filters, setFilters }: JobSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const functions = useMemo(() => jobFunctionCounts(jobs, titleQuery), [jobs, titleQuery]);
  const activeCount = filters.jobFunctions.length;

  function toggleFunction(fn: string) {
    setFilters((prev) => ({
      ...prev,
      jobFunctions: prev.jobFunctions.includes(fn)
        ? prev.jobFunctions.filter((item) => item !== fn)
        : [...prev.jobFunctions, fn],
    }));
  }

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={() => setIsCollapsed(false)}
        className="absolute left-4 top-24 z-20 flex size-12 items-center justify-center rounded-2xl border border-white/50 bg-white/95 text-slate-800 shadow-2xl backdrop-blur-2xl transition hover:bg-white md:left-6 md:top-6"
        aria-label="Open job filters"
      >
        <SlidersHorizontal className="size-4 text-blue-600" />
        {activeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
            {activeCount}
          </span>
        )}
      </button>
    );
  }

  return (
    <aside className="absolute left-4 top-24 z-20 flex max-h-[calc(100vh-9rem)] w-64 flex-col rounded-3xl border border-white/50 bg-white/90 p-4 text-slate-900 shadow-2xl backdrop-blur-2xl md:left-6 md:top-6 md:max-h-[calc(100vh-48px)] md:w-72 md:p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/30">
            <Briefcase className="size-4" />
          </span>
          <h1 className="text-lg font-bold tracking-tight">JobMap</h1>
        </div>
        <div className="flex items-center gap-1">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => setFilters(INITIAL_JOB_FILTERS)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-50"
            >
              Clear all
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsCollapsed(true)}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Collapse filters"
          >
            <ChevronLeft className="size-4" />
          </button>
        </div>
      </header>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Job function (A–Z)
        </span>
        {filters.jobFunctions.length > 0 && (
          <button
            type="button"
            onClick={() => setFilters((prev) => ({ ...prev, jobFunctions: [] }))}
            className="text-[11px] font-semibold text-blue-600 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <ul className="job-scrollbar mt-2 flex-1 space-y-0.5 overflow-y-auto pr-1">
        {functions.length === 0 && (
          <li className="py-3 text-xs text-slate-400">No jobs in this map area yet.</li>
        )}
        {functions.map(([fn, count]) => {
          const active = filters.jobFunctions.includes(fn);
          return (
            <li key={fn}>
              <button
                type="button"
                onClick={() => toggleFunction(fn)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition",
                  active ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-100",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded border",
                    active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white",
                  )}
                >
                  {active && <Check className="size-3" />}
                </span>
                <span className="flex-1 truncate">{fn}</span>
                <span className="text-xs tabular-nums text-slate-400">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
