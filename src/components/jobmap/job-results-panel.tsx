"use client";

import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, ChevronDown, ExternalLink, LoaderCircle, MapPin } from "lucide-react";
import type { Job } from "@/types";
import { getJobApplicationLink } from "@/lib/jobs";
import { cn } from "@/lib/utils";

interface JobResultsPanelProps {
  jobs: Job[];
  selectedJobId: string | null;
  loading: boolean;
  onSelect: (job: Job) => void;
  onHighlight: (jobId: string | null) => void;
}

export default function JobResultsPanel({
  jobs,
  selectedJobId,
  loading,
  onSelect,
  onHighlight,
}: JobResultsPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const cardRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  useEffect(() => {
    if (!selectedJobId) return;
    cardRefs.current.get(selectedJobId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedJobId]);

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="absolute right-4 top-20 z-20 flex items-center gap-2 rounded-2xl border border-white/50 bg-white/95 px-3.5 py-3 text-sm font-bold text-slate-800 shadow-xl backdrop-blur-xl"
        aria-label={`Open job results, ${jobs.length} jobs`}
      >
        <BriefcaseBusiness className="size-4 text-blue-600" />
        Results <span className="tabular-nums text-blue-600">{jobs.length}</span>
      </button>
    );
  }

  return (
    <section
      aria-label="Job results"
      className="absolute bottom-32 right-4 top-20 z-20 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-white/50 bg-white/95 text-slate-900 shadow-2xl backdrop-blur-2xl"
    >
      <header className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <BriefcaseBusiness className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">Jobs in this area</p>
            <p className="text-[11px] text-slate-500">
              {loading ? "Updating results…" : `${jobs.length.toLocaleString()} matching jobs`}
            </p>
          </div>
          {loading && <LoaderCircle className="size-4 shrink-0 animate-spin text-blue-500" />}
        </div>
        <button
          type="button"
          onClick={() => {
            setIsOpen(false);
            onHighlight(null);
          }}
          className="rounded-lg p-1.5 text-slate-500 transition hover:bg-slate-100"
          aria-label="Collapse job results"
        >
          <ChevronDown className="size-4" />
        </button>
      </header>

      <ul className="job-scrollbar flex-1 space-y-2 overflow-y-auto p-2.5">
        {jobs.length === 0 && (
          <li className="rounded-2xl border border-dashed border-slate-200 p-5 text-center">
            <p className="text-sm font-semibold text-slate-700">No matching jobs here</p>
            <p className="mt-1 text-xs text-slate-500">Move the map, change your search, or clear a job function filter.</p>
          </li>
        )}
        {jobs.map((job) => (
          <li
            key={job.id}
            className="job-result-card rounded-2xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-md"
            onMouseEnter={() => onHighlight(job.id)}
            onMouseLeave={() => onHighlight(null)}
          >
            <button
              ref={(node) => {
                if (node) cardRefs.current.set(job.id, node);
                else cardRefs.current.delete(job.id);
              }}
              type="button"
              onFocus={() => onHighlight(job.id)}
              onBlur={() => onHighlight(null)}
              onClick={() => onSelect(job)}
              className="w-full rounded-t-2xl px-3.5 pb-2 pt-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
              aria-pressed={selectedJobId === job.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-900">{job.title}</p>
                  <p className="mt-1 truncate text-xs font-semibold text-slate-600">{job.company}</p>
                </div>
                {job.salary && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">{job.salary}</span>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                <span className="inline-flex min-w-0 items-center gap-1">
                  <MapPin className="size-3 shrink-0" />
                  <span className="truncate">{job.location_label}</span>
                </span>
                <span>{job.workType}</span>
                {job.jobFunction && <span>{job.jobFunction}</span>}
              </div>
            </button>
            <div className="flex justify-end border-t border-slate-100 px-3 py-2">
              <a
                href={getJobApplicationLink(job)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onHighlight(null)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-blue-700 transition hover:bg-blue-50",
                )}
              >
                Application <ExternalLink className="size-3" />
              </a>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-slate-200/80 px-3 py-2 text-center text-[10px] text-slate-400">
        Select a card to fly to its map location
      </div>
    </section>
  );
}
