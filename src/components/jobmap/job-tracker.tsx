"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "@/components/MapView";
import JobSidebar from "@/components/jobmap/job-sidebar";
import { FloatingJobPopup } from "@/components/jobmap/job-details";
import AnalyticsDock from "@/components/AnalyticsDock";
import LocationSearch from "@/components/LocationSearch";
import { filterJobs, isActiveJob, mapSupabaseJob } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import type { Job, JobSearchFilters, JobViewport, MapTarget } from "@/types";
import { INITIAL_JOB_FILTERS } from "@/types";

const PAGE_SIZE = 1000;

export default function JobTracker() {
  const [fetchedJobs, setFetchedJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobSearchFilters>(INITIAL_JOB_FILTERS);
  const [viewport, setViewport] = useState<JobViewport | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const highlightVisible = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!viewport) return;

    let cancelled = false;
    const requestNumber = ++latestRequest.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await supabase
            .rpc("get_jobs_in_viewport", {
              min_lng: viewport.minLng,
              min_lat: viewport.minLat,
              max_lng: viewport.maxLng,
              max_lat: viewport.maxLat,
            })
            .order("id", { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1);

          if (error) throw error;
          const page = (data ?? []) as Record<string, unknown>[];
          rows.push(...page);
          if (page.length < PAGE_SIZE || cancelled || requestNumber !== latestRequest.current) break;
        }

        if (cancelled || requestNumber !== latestRequest.current) return;
        setFetchedJobs(
          rows
            .map((row, index) => mapSupabaseJob(row, index))
            .filter((job): job is Job => job !== null),
        );
      } catch (error) {
        if (!cancelled && requestNumber === latestRequest.current) {
          console.error("Could not load jobs for this map area:", error);
          setFetchedJobs([]);
        }
      } finally {
        if (!cancelled && requestNumber === latestRequest.current) setLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [viewport]);

  const filteredJobs = useMemo(() => filterJobs(fetchedJobs, filters), [fetchedJobs, filters]);
  const activeJobs = useMemo(() => fetchedJobs.filter(isActiveJob), [fetchedJobs]);
  const selectedJob = useMemo(
    () => filteredJobs.find((job) => job.id === selectedJobId) ?? null,
    [filteredJobs, selectedJobId],
  );

  useEffect(() => {
    if (selectedJobId && !selectedJob) setSelectedJobId(null);
  }, [selectedJob, selectedJobId]);

  function selectLocation(next: Omit<MapTarget, "nonce">) {
    setTarget({ ...next, nonce: Date.now() });
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <MapView
        jobs={filteredJobs}
        selectedJobId={selectedJobId}
        onSelectJob={(job) => setSelectedJobId(job.id)}
        onViewportChange={setViewport}
        onVisibleCountChange={setVisibleCount}
        onHighlightVisibleReady={(highlight) => {
          highlightVisible.current = highlight;
        }}
        target={target}
      />

      <JobSidebar jobs={fetchedJobs} filters={filters} setFilters={setFilters} />

      <LocationSearch
        onLocationSelected={(next) => selectLocation(next)}
        proximity={viewport ? [(viewport.minLng + viewport.maxLng) / 2, (viewport.minLat + viewport.maxLat) / 2] : null}
      />

      <AnalyticsDock
        total={activeJobs.length}
        filtered={filteredJobs.length}
        visible={visibleCount}
        onHighlightVisible={() => highlightVisible.current()}
      />

      <FloatingJobPopup job={selectedJob} onClose={() => setSelectedJobId(null)} />

      {loading && (
        <div className="absolute bottom-5 right-5 z-20 rounded-full bg-slate-950/80 px-3.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md animate-pulse">
          Counting jobs in this map area…
        </div>
      )}
    </div>
  );
}
