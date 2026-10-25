"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Building2,
  ExternalLink,
  Loader2,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Job } from "@/types";

interface GeocodingFeature {
  id: string;
  center: [number, number];
  place_name: string;
}

interface GeocodingResponse {
  features?: GeocodingFeature[];
}

export interface SearchMatch {
  type: "location" | "job";
  title: string;
  subtitle: string;
  coords: [number, number];
  jobId?: string;
}

interface LocationSearchProps {
  onLocationSelected: (coords: [number, number], name: string) => void;
  onJobSelected?: (jobId: string, coords: [number, number]) => void;
  availableJobs?: Job[];
}

export default function LocationSearch({
  onLocationSelected,
  onJobSelected,
  availableJobs = [],
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Debounced search for places & matching jobs/companies
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timeout = setTimeout(async () => {
      const matches: SearchMatch[] = [];

      // 1. Search in loaded jobs (Company or Title match)
      const qLower = trimmed.toLowerCase();
      const jobMatches = availableJobs
        .filter(
          (j) =>
            j.company.toLowerCase().includes(qLower) ||
            j.title.toLowerCase().includes(qLower),
        )
        .slice(0, 4)
        .map((j) => ({
          type: "job" as const,
          title: `${j.company} — ${j.title}`,
          subtitle: `${j.location_label} · ${j.workType}${j.salary ? " · " + j.salary : ""}`,
          coords: j.coords,
          jobId: j.id,
        }));
      matches.push(...jobMatches);

      // 2. Search places via Mapbox Geocoding API
      const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
      if (token) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
            trimmed,
          )}.json?access_token=${token}&autocomplete=true&country=us&types=place,locality,neighborhood,address,poi`;
          const res = await fetch(url, { signal: controller.signal });
          if (res.ok) {
            const data = (await res.json()) as GeocodingResponse;
            const placeMatches = (data.features || []).slice(0, 5).map((f) => ({
              type: "location" as const,
              title: f.place_name.split(",")[0] ?? f.place_name,
              subtitle: f.place_name,
              coords: f.center,
            }));
            matches.push(...placeMatches);
          }
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === "AbortError") {
            return;
          }
          console.warn("Geocoding lookup notice:", err);
        }
      }

      setResults(matches);
      setIsOpen(matches.length > 0);
      setIsLoading(false);
      setSelectedIndex(-1);
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query, availableJobs]);

  const handleSelect = (match: SearchMatch) => {
    if (match.type === "job" && match.jobId && onJobSelected) {
      onJobSelected(match.jobId, match.coords);
    } else {
      onLocationSelected(match.coords, match.title);
    }
    setQuery(match.title);
    setIsOpen(false);
    inputRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || results.length === 0) {
      if (e.key === "Enter" && query.trim()) {
        // Quick geocode fallback
        handleDirectGeocode(query.trim());
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = selectedIndex >= 0 ? results[selectedIndex] : results[0];
      if (target) {
        handleSelect(target);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleDirectGeocode = async (text: string) => {
    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) return;
    setIsLoading(true);
    try {
      const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
        text,
      )}.json?access_token=${token}&limit=1&country=us`;
      const res = await fetch(url);
      if (res.ok) {
        const data = (await res.json()) as GeocodingResponse;
        const feature = data.features?.[0];
        if (feature) {
          onLocationSelected(feature.center, feature.place_name);
          setQuery(feature.place_name.split(",")[0] ?? text);
        }
      }
    } catch (err) {
      console.warn("Direct geocode lookup failed:", err);
    } finally {
      setIsLoading(false);
      setIsOpen(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="absolute top-6 right-6 z-30 w-full max-w-sm sm:max-w-md"
    >
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
          {isLoading ? (
            <Loader2 className="size-4 animate-spin text-blue-500" />
          ) : (
            <Search className="size-4" />
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search city, company, or role…"
          className="w-full rounded-full border border-white/40 bg-white/90 py-2.5 pl-10 pr-9 text-xs font-medium text-slate-900 shadow-2xl backdrop-blur-2xl outline-none ring-blue-500/50 transition placeholder:text-slate-400 focus:bg-white focus:ring-2 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:bg-slate-900"
        />

        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="Clear search input"
          >
            <X className="size-3.5" />
          </button>
        )}

        {/* Suggestions Dropdown */}
        {isOpen && results.length > 0 && (
          <div className="absolute top-full right-0 mt-2 max-h-80 w-full overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 dark:border-slate-800 dark:bg-slate-900/95">
            {results.map((match, i) => {
              const isSelected = i === selectedIndex;
              return (
                <button
                  key={`${match.type}-${match.title}-${i}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(match);
                  }}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                    isSelected
                      ? "bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-100"
                      : "hover:bg-slate-100/80 dark:hover:bg-slate-800/80",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-lg",
                      match.type === "location"
                        ? "bg-blue-100 text-blue-600 dark:bg-blue-950 dark:text-blue-400"
                        : "bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400",
                    )}
                  >
                    {match.type === "location" ? (
                      <MapPin className="size-3.5" />
                    ) : (
                      <Building2 className="size-3.5" />
                    )}
                  </span>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                        {match.title}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.2 text-[9px] font-semibold uppercase tracking-wider",
                          match.type === "location"
                            ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                            : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400",
                        )}
                      >
                        {match.type === "location" ? "City" : "Job"}
                      </span>
                    </div>
                    <span className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                      {match.subtitle}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
