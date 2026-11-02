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
import { geocodeStartingLocation } from "@/lib/geocoder";
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
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
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

  function randomStLouisCoords(): [number, number] {
    const angle = Math.PI * (0.55 + Math.random() * 0.9);
    const radiusKm = Math.sqrt(Math.random()) * 1.4;
    const lat = 38.6285 + (Math.sin(angle) * radiusKm) / 111.32;
    const lng = Math.min(
      -90.191,
      -90.1994 + (Math.cos(angle) * radiusKm) / (111.32 * Math.cos((38.627 * Math.PI) / 180)),
    );
    return [lng, lat];
  }

  function distanceFromStLouisMeters([lng, lat]: [number, number]): number {
    const centerLng = -90.1994;
    const centerLat = 38.627;
    const toRad = (degrees: number) => (degrees * Math.PI) / 180;
    const dLat = toRad(lat - centerLat);
    const dLng = toRad(lng - centerLng);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(centerLat)) * Math.cos(toRad(lat)) * Math.sin(dLng / 2) ** 2;
    return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function finishLocationStart(coords: [number, number], name: string, notice?: string) {
    if (distanceFromStLouisMeters(coords) > 80_467.2) {
      setLocationPromptError(
        "JobMap is launching in St. Louis and the surrounding 50 miles. Choose a location in that area.",
      );
      return;
    }
    selectLocation({ center: coords, zoom: 15.6 }, name);
    window.localStorage.setItem("jobmap-location-start-v1", "done");
    setShowLocationPrompt(false);
    setLocationPromptError("");
    if (notice) {
      setLocationNotice(notice);
      window.setTimeout(() => setLocationNotice(null), 6500);
    } else {
      setLocationNotice(null);
    }
  }

  async function submitStartingLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = startLocation.trim();
    if (!query) return;
    setLocationPromptLoading(true);
    setLocationPromptError("");
    try {
      const result = await geocodeStartingLocation(query);
      if (!result) {
        setLocationPromptError(
          "Could not find that place in the 50-mile St. Louis region. Try a St. Louis city, school, company, or street address.",
        );
      } else if (result.isCityOnly) {
        // City-only entries begin at a nearby randomized point inside that city.
        const angle = Math.random() * Math.PI * 2;
        const radiusKm = Math.sqrt(Math.random()) * 1.1;
        const lat = result.coords[1] + (Math.sin(angle) * radiusKm) / 111.32;
        const rawLng =
          result.coords[0] +
          (Math.cos(angle) * radiusKm) / (111.32 * Math.cos((result.coords[1] * Math.PI) / 180));
        // Keep Downtown St. Louis city-only starts west of the Mississippi River
        const lng =
          Math.abs(result.coords[0] - -90.1994) < 0.03 && Math.abs(result.coords[1] - 38.627) < 0.03
            ? Math.min(-90.191, rawLng)
            : rawLng;
        finishLocationStart([lng, lat], result.label || query);
      } else {
        // Full address, school, campus, or company starts at exact coordinates.
        finishLocationStart(result.coords, result.label || query);
      }
    } finally {
      setLocationPromptLoading(false);
    }
  }

  function startAtCurrentLocation() {
    setLocationPromptError("");
    if (!navigator.geolocation) {
      finishLocationStart(
        randomStLouisCoords(),
        "St. Louis, MO",
        "Browser GPS unavailable — starting flight in Downtown St. Louis.",
      );
      return;
    }
    setLocationPromptLoading(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const current: [number, number] = [coords.longitude, coords.latitude];
        setLocationPromptLoading(false);
        if (distanceFromStLouisMeters(current) <= 80_467.2) {
          finishLocationStart(current, "Your location");
        } else {
          finishLocationStart(
            randomStLouisCoords(),
            "St. Louis, MO",
            "Your GPS is outside the 50-mile St. Louis launch zone — starting flight in St. Louis.",
          );
        }
      },
      () => {
        setLocationPromptLoading(false);
        finishLocationStart(
          randomStLouisCoords(),
          "St. Louis, MO",
          "Browser location permission wasn't granted — starting flight in Downtown St. Louis.",
        );
      },
      { enableHighAccuracy: false, timeout: 7_000, maximumAge: 300_000 },
    );
  }

  function setCommutePreferences(next: CommutePreferences) {
    setCommute(next);
    if (!next.enabled) setCommuteError(null);
  }

  useEffect(() => {
    const preventBrowserPinch = (event: WheelEvent) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    const preventGesture = (event: Event) => {
      event.preventDefault();
    };
    const resetViewportScroll = () => {
      if (window.scrollX !== 0 || window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    window.addEventListener("wheel", preventBrowserPinch, { passive: false });
    window.addEventListener("gesturestart", preventGesture, { passive: false });
    window.addEventListener("gesturechange", preventGesture, { passive: false });
    window.addEventListener("scroll", resetViewportScroll, { passive: true });
    return () => {
      window.removeEventListener("wheel", preventBrowserPinch);
      window.removeEventListener("gesturestart", preventGesture);
      window.removeEventListener("gesturechange", preventGesture);
      window.removeEventListener("scroll", resetViewportScroll);
    };
  }, []);

  return (
    <div
      onScroll={(event) => {
        event.currentTarget.scrollTop = 0;
        event.currentTarget.scrollLeft = 0;
      }}
      className="fixed inset-0 h-dvh w-dvw overflow-clip bg-slate-900 select-none"
    >
      <MapView
        jobs={filteredJobs}
        selectedJobId={selectedJobId}
        highlightedJobId={highlightedJobId}
        commuteArea={commuteArea}
        flightStarted={!showLocationPrompt}
        onChangeStartLocation={() => setShowLocationPrompt(true)}
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
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600">St. Louis Flight Simulator</p>
            <h1 id="start-location-title" className="mt-2 text-2xl font-semibold">Where should your flight start?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Enter a city, school, company, or street address in the St. Louis 50-mile area, or start from your current location.</p>
            <form onSubmit={(event) => void submitStartingLocation(event)} className="mt-5">
              <label htmlFor="start-location" className="sr-only">City or address</label>
              <input id="start-location" autoFocus value={startLocation} onChange={(event) => setStartLocation(event.target.value)} placeholder="e.g., Clayton, MO, Washington University, or 100 N Broadway" className="w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-blue-500" />
              <button disabled={locationPromptLoading} className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50">{locationPromptLoading ? "Finding takeoff location…" : "Take off from here"}</button>
            </form>
            <button
              type="button"
              disabled={locationPromptLoading}
              onClick={startAtCurrentLocation}
              className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            >
              Use my location
            </button>
            {locationPromptError && <p role="alert" className="mt-3 text-sm text-rose-700">{locationPromptError}</p>}
          </section>
        </div>
      )}

      {locationNotice && (
        <div role="status" className="absolute top-16 left-1/2 z-40 -translate-x-1/2 rounded-full border border-sky-400/40 bg-slate-950/90 px-4 py-2 text-xs font-medium text-sky-100 shadow-2xl backdrop-blur-md">
          {locationNotice}
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
