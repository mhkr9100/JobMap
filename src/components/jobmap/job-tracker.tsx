"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Feature, Polygon } from "geojson";
import MapView from "@/components/MapView";
import JobSidebar from "@/components/jobmap/job-sidebar";
import JobResultsPanel from "@/components/jobmap/job-results-panel";
import AnalyticsDock from "@/components/AnalyticsDock";
import LocationSearch from "@/components/LocationSearch";
import { filterJobs, isActiveJob, mapSupabaseJob } from "@/lib/jobs";
import { getCommuteArea, getCommuteBounds, isJobInCommuteArea } from "@/lib/commute";
import { supabase } from "@/lib/supabase";
import type { CommutePreferences, Job, JobSearchFilters, JobViewport, MapTarget } from "@/types";
import { INITIAL_JOB_FILTERS } from "@/types";

const PAGE_SIZE = 1000;
const INITIAL_COMMUTE: CommutePreferences = { enabled: false, minutes: 30, profile: "driving" };

interface CommuteOrigin {
  coords: [number, number];
  name: string;
}

function unionViewport(a: JobViewport, b: JobViewport): JobViewport {
  return {
    minLng: Math.min(a.minLng, b.minLng),
    minLat: Math.min(a.minLat, b.minLat),
    maxLng: Math.max(a.maxLng, b.maxLng),
    maxLat: Math.max(a.maxLat, b.maxLat),
  };
}

function areaKey(origin: CommuteOrigin | null, preferences: CommutePreferences): string | null {
  if (!origin) return null;
  return JSON.stringify([origin.coords, preferences.profile, preferences.minutes]);
}

export default function JobTracker() {
  const [fetchedJobs, setFetchedJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [highlightedJobId, setHighlightedJobId] = useState<string | null>(null);
  const [roleQuery, setRoleQuery] = useState("");
  const [filters, setFilters] = useState<JobSearchFilters>(INITIAL_JOB_FILTERS);
  const [viewport, setViewport] = useState<JobViewport | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [target, setTarget] = useState<MapTarget | null>(null);
  const [commute, setCommute] = useState<CommutePreferences>(INITIAL_COMMUTE);
  const [commuteOrigin, setCommuteOrigin] = useState<CommuteOrigin | null>(null);
  const [commuteResult, setCommuteResult] = useState<{ key: string; area: Feature<Polygon> } | null>(null);
  const [commuteLoading, setCommuteLoading] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const highlightVisible = useRef<() => void>(() => undefined);

  const commuteKey = areaKey(commuteOrigin, commute);
  const commuteArea = commute.enabled && commuteKey && commuteResult?.key === commuteKey
    ? commuteResult.area
    : null;
  const commuteBounds = useMemo(
    () => (commuteArea ? getCommuteBounds(commuteArea) : null),
    [commuteArea],
  );
  const queryViewport = useMemo(() => {
    if (!viewport) return null;
    return commuteBounds ? unionViewport(viewport, commuteBounds) : viewport;
  }, [viewport, commuteBounds]);

  useEffect(() => {
    if (!commute.enabled || !commuteOrigin || !commuteKey) {
      setCommuteLoading(false);
      setCommuteError(null);
      return;
    }

    const controller = new AbortController();
    setCommuteLoading(true);
    setCommuteError(null);
    void getCommuteArea(commuteOrigin.coords, commute.minutes, commute.profile, controller.signal)
      .then((area) => {
        if (controller.signal.aborted) return;
        setCommuteResult({ key: commuteKey, area });
        const bounds = getCommuteBounds(area);
        setTarget({ center: commuteOrigin.coords, bbox: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat], zoom: 12, nonce: Date.now() });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCommuteError(error instanceof Error ? error.message : "Commute area could not be loaded.");
        setCommute((current) => ({ ...current, enabled: false }));
      })
      .finally(() => {
        if (!controller.signal.aborted) setCommuteLoading(false);
      });
    return () => controller.abort();
  }, [commute.enabled, commute.minutes, commute.profile, commuteOrigin, commuteKey]);

  useEffect(() => {
    if (!queryViewport) return;

    let cancelled = false;
    const requestNumber = ++latestRequest.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const rows: Record<string, unknown>[] = [];
        for (let offset = 0; ; offset += PAGE_SIZE) {
          const { data, error } = await supabase
            .rpc("get_jobs_in_viewport", {
              min_lng: queryViewport.minLng,
              min_lat: queryViewport.minLat,
              max_lng: queryViewport.maxLng,
              max_lat: queryViewport.maxLat,
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
  }, [queryViewport]);

  const filteredJobs = useMemo(() => {
    if (commute.enabled && !commuteArea) return [];
    return filterJobs(fetchedJobs, filters, roleQuery, commuteArea);
  }, [commute.enabled, commuteArea, fetchedJobs, filters, roleQuery]);
  const activeJobs = useMemo(() => fetchedJobs.filter(isActiveJob), [fetchedJobs]);
  const areaJobs = commuteArea
    ? activeJobs.filter((job) => isJobInCommuteArea(job, commuteArea))
    : activeJobs;
  const selectedJob = filteredJobs.find((job) => job.id === selectedJobId) ?? null;
  const functionJobs = commuteArea
    ? fetchedJobs.filter((job) => isJobInCommuteArea(job, commuteArea))
    : fetchedJobs;

  useEffect(() => {
    if (selectedJobId && !selectedJob) setSelectedJobId(null);
  }, [selectedJob, selectedJobId]);

  function selectLocation(next: Omit<MapTarget, "nonce">, name: string) {
    setTarget({ ...next, nonce: Date.now() });
    setCommuteOrigin({ coords: next.center, name });
  }

  function setCommutePreferences(next: CommutePreferences) {
    setCommute(next);
    if (!next.enabled) setCommuteError(null);
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      <MapView
        jobs={filteredJobs}
        selectedJobId={selectedJobId}
        highlightedJobId={highlightedJobId}
        commuteArea={commuteArea}
        onSelectJob={(job) => setSelectedJobId(job.id)}
        onViewportChange={setViewport}
        onVisibleCountChange={setVisibleCount}
        onHighlightVisibleReady={(highlight) => {
          highlightVisible.current = highlight;
        }}
        target={target}
      />

      <JobSidebar jobs={functionJobs} titleQuery={roleQuery} filters={filters} setFilters={setFilters} />

      <LocationSearch
        roleQuery={roleQuery}
        onRoleQueryChange={setRoleQuery}
        onLocationSelected={selectLocation}
        proximity={viewport ? [(viewport.minLng + viewport.maxLng) / 2, (viewport.minLat + viewport.maxLat) / 2] : null}
        commute={commute}
        commuteOrigin={commuteOrigin?.name ?? null}
        commuteLoading={commuteLoading}
        onCommuteChange={setCommutePreferences}
      />

      <JobResultsPanel
        jobs={filteredJobs}
        selectedJobId={selectedJobId}
        loading={loading || commuteLoading}
        onSelect={(job) => setSelectedJobId(job.id)}
        onHighlight={setHighlightedJobId}
      />

      <AnalyticsDock
        total={areaJobs.length}
        filtered={filteredJobs.length}
        visible={visibleCount}
        onHighlightVisible={() => highlightVisible.current()}
      />

      {(loading || commuteLoading) && (
        <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full bg-slate-950/80 px-3.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md animate-pulse">
          {commuteLoading ? "Calculating commute area…" : "Counting jobs in this map area…"}
        </div>
      )}
      {commuteError && (
        <div role="status" className="absolute bottom-16 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-rose-950/90 px-4 py-2 text-xs text-white shadow-xl">
          {commuteError}
        </div>
      )}
    </div>
  );
}
