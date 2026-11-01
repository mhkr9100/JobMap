"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { Feature, Polygon } from "geojson";
import MapView from "@/components/MapView";
import JobSidebar from "@/components/jobmap/job-sidebar";
import JobResultsPanel from "@/components/jobmap/job-results-panel";
import AnalyticsDock from "@/components/AnalyticsDock";
import LocationSearch from "@/components/LocationSearch";
import { filterJobs, isActiveJob, mapSupabaseJob } from "@/lib/jobs";
import { getCommuteArea, getCommuteBounds, isJobInCommuteArea } from "@/lib/commute";
import { supabase } from "@/lib/supabase";
import { geocodeAddress } from "@/lib/geocoder";
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
  const [showLocationPrompt, setShowLocationPrompt] = useState(false);
  const [startLocation, setStartLocation] = useState("");
  const [locationPromptError, setLocationPromptError] = useState("");
  const [locationPromptLoading, setLocationPromptLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);
  const highlightVisible = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (window.localStorage.getItem("jobmap-location-start-v1") !== "done") {
      setShowLocationPrompt(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user && window.sessionStorage.getItem("jobmap-map-open-tracked") !== "done") {
        void supabase.from("analytics_events").insert({ user_id: data.user.id, event_name: "map_open" });
        window.sessionStorage.setItem("jobmap-map-open-tracked", "done");
      }
    });
    return () => { cancelled = true; };
  }, []);

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

  function finishLocationStart(coords: [number, number], name: string) {
    const [lng, lat] = coords;
    const centerLng = -90.1994;
    const centerLat = 38.627;
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(lat - centerLat);
    const dLng = toRad(lng - centerLng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    const distanceMeters = 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    if (distanceMeters > 80_467.2) {
      setLocationPromptError("JobMap is launching in St. Louis and the surrounding 50 miles. Choose a location in that area.");
      return;
    }
    selectLocation({ center: coords, zoom: 15.2 }, name);
    window.localStorage.setItem("jobmap-location-start-v1", "done");
    setShowLocationPrompt(false);
    setLocationPromptError("");
  }

  function exploreStLouis() {
    // A small randomized start inside the central city keeps the first view at
    // building scale without suggesting a fake employer worksite.
    const angle = Math.random() * Math.PI * 2;
    const radiusKm = Math.sqrt(Math.random()) * 3.5;
    const lat = 38.627 + (Math.sin(angle) * radiusKm) / 111.32;
    const lng = -90.1994 + (Math.cos(angle) * radiusKm) / (111.32 * Math.cos((38.627 * Math.PI) / 180));
    finishLocationStart([lng, lat], "St. Louis, MO");
  }

  async function submitStartingLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = startLocation.trim();
    if (!query) return;
    setLocationPromptLoading(true);
    setLocationPromptError("");
    try {
      const coords = await geocodeAddress(query);
      if (!coords) {
        setLocationPromptError("I could not find that place. Try a city and state or a street address.");
      } else {
        // City-only entries begin at a nearby randomized point. A street
        // address is kept exact; neither path changes a job's stored location.
        const hasStreetNumber = /\b\d{1,6}\b/.test(query);
        if (hasStreetNumber) finishLocationStart(coords, query);
        else {
          const angle = Math.random() * Math.PI * 2;
          const radiusKm = Math.sqrt(Math.random()) * 1.2;
          const lat = coords[1] + (Math.sin(angle) * radiusKm) / 111.32;
          const lng = coords[0] + (Math.cos(angle) * radiusKm) / (111.32 * Math.cos((coords[1] * Math.PI) / 180));
          finishLocationStart([lng, lat], query);
        }
      }
    } finally {
      setLocationPromptLoading(false);
    }
  }

  function startAtCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationPromptError("This browser does not provide location access. Enter a city or address instead.");
      return;
    }
    setLocationPromptLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        finishLocationStart([coords.longitude, coords.latitude], "Your location");
        setLocationPromptLoading(false);
      },
      () => {
        setLocationPromptError("Location access was unavailable. Enter a city or address instead.");
        setLocationPromptLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
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
        onSelectJob={(job) => {
          setSelectedJobId(job.id);
          void supabase.auth.getUser().then(({ data }) => {
            if (data.user) {
              void supabase.from("analytics_events").insert({ user_id: data.user.id, event_name: "job_open" });
            }
          });
        }}
        onViewportChange={setViewport}
        onVisibleCountChange={setVisibleCount}
        onHighlightVisibleReady={(highlight) => {
          highlightVisible.current = highlight;
        }}
        target={target}
      />

      {showLocationPrompt && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="start-location-title" className="w-full max-w-md rounded-3xl border border-white/30 bg-white p-6 text-slate-900 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">St. Louis launch area</p>
            <h1 id="start-location-title" className="mt-2 text-2xl font-semibold">Where should your flight start?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose a city, school, company, address, or your current location. JobMap currently covers St. Louis City and County plus 50 miles.</p>
            <form onSubmit={(event) => void submitStartingLocation(event)} className="mt-5">
              <label htmlFor="start-location" className="sr-only">City or address</label>
              <input id="start-location" autoFocus value={startLocation} onChange={(event) => setStartLocation(event.target.value)} placeholder="City, state or street address" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              <button disabled={locationPromptLoading} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-50">{locationPromptLoading ? "Finding location…" : "Start here"}</button>
            </form>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <button disabled={locationPromptLoading} onClick={startAtCurrentLocation} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium disabled:opacity-50">Use my location</button>
              <button disabled={locationPromptLoading} onClick={exploreStLouis} className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium disabled:opacity-50">Explore St. Louis</button>
            </div>
            {locationPromptError && <p role="alert" className="mt-3 text-sm text-rose-700">{locationPromptError}</p>}
          </section>
        </div>
      )}

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
