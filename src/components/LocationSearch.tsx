"use client";

import React, { useEffect, useRef, useState } from "react";
import { Building2, GraduationCap, Landmark, Loader2, MapPin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MapTarget } from "@/types";

/**
 * Location-only search: cities, states, neighborhoods, addresses and every kind of
 * organization (universities, schools, companies, non-profits, hospitals…).
 * Primary: Mapbox Search Box (suggest → retrieve, billed per session).
 * Fallback: Photon (OpenStreetMap, free) if Mapbox returns nothing or errors.
 */

type PlaceKind = "region" | "city" | "area" | "address" | "school" | "org";

interface PlaceSuggestion {
  id: string;
  name: string;
  subtitle: string;
  kind: PlaceKind;
  source: "mapbox" | "photon";
  zoom: number;
  /** Photon results already carry coordinates. */
  center?: [number, number];
  bbox?: [number, number, number, number];
}

interface MapboxSuggestion {
  mapbox_id: string;
  name: string;
  feature_type: string;
  full_address?: string;
  place_formatted?: string;
  poi_category?: string[];
}

interface MapboxRetrieveResponse {
  features?: {
    geometry: { coordinates: [number, number] };
    properties: { bbox?: [number, number, number, number]; feature_type?: string };
  }[];
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    name?: string;
    city?: string;
    state?: string;
    country?: string;
    extent?: [number, number, number, number];
  };
}

interface LocationSearchProps {
  onLocationSelected: (target: Omit<MapTarget, "nonce">, name: string) => void;
  proximity?: [number, number] | null;
}

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";
const SCHOOL_WORDS = /universit|college|school|academy|campus|institute/i;

function zoomForMapboxType(type: string): number {
  switch (type) {
    case "country":
      return 3.5;
    case "region":
      return 6;
    case "postcode":
    case "district":
      return 10;
    case "place":
    case "city":
      return 11;
    case "locality":
    case "neighborhood":
      return 13.5;
    case "street":
      return 15.5;
    default:
      return 17; // address, poi
  }
}

function kindForMapbox(s: MapboxSuggestion): PlaceKind {
  if (s.feature_type === "country" || s.feature_type === "region") return "region";
  if (s.feature_type === "place" || s.feature_type === "city") return "city";
  if (["postcode", "district", "locality", "neighborhood"].includes(s.feature_type)) return "area";
  if (s.feature_type === "poi") {
    const cats = (s.poi_category ?? []).join(" ");
    return SCHOOL_WORDS.test(`${s.name} ${cats}`) ? "school" : "org";
  }
  return "address";
}

function newSessionToken(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function suggestMapbox(
  q: string,
  session: string,
  proximity: [number, number] | null | undefined,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  if (!TOKEN) return [];
  const params = new URLSearchParams({
    q,
    access_token: TOKEN,
    session_token: session,
    limit: "8",
    language: "en",
    types: "region,postcode,district,place,locality,neighborhood,street,address,poi",
  });
  if (proximity) params.set("proximity", `${proximity[0]},${proximity[1]}`);
  const res = await fetch(`https://api.mapbox.com/search/searchbox/v1/suggest?${params}`, {
    signal,
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { suggestions?: MapboxSuggestion[] };
  return (data.suggestions ?? []).map((s) => ({
    id: s.mapbox_id,
    name: s.name,
    subtitle: s.full_address ?? s.place_formatted ?? "",
    kind: kindForMapbox(s),
    source: "mapbox" as const,
    zoom: zoomForMapboxType(s.feature_type),
  }));
}

async function suggestPhoton(
  q: string,
  proximity: [number, number] | null | undefined,
  signal: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const params = new URLSearchParams({ q, limit: "8", lang: "en" });
  if (proximity) {
    params.set("lon", String(proximity[0]));
    params.set("lat", String(proximity[1]));
  }
  const res = await fetch(`https://photon.komoot.io/api/?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return (data.features ?? [])
    .filter((f) => f.properties.name)
    .map((f) => {
      const p = f.properties;
      const isPlace = p.osm_key === "place" || p.osm_key === "boundary";
      const kind: PlaceKind = isPlace
        ? p.osm_value === "state"
          ? "region"
          : p.osm_value === "city" || p.osm_value === "town"
            ? "city"
            : "area"
        : SCHOOL_WORDS.test(`${p.name} ${p.osm_value}`)
          ? "school"
          : "org";
      const e = p.extent; // [minLon, maxLat, maxLon, minLat]
      return {
        id: `photon-${p.osm_id ?? p.name}`,
        name: p.name ?? "",
        subtitle: [p.city, p.state].filter(Boolean).join(", "),
        kind,
        source: "photon" as const,
        zoom: kind === "region" ? 6 : kind === "city" ? 11 : kind === "area" ? 13.5 : 17,
        center: f.geometry.coordinates,
        bbox: e ? ([e[0], e[3], e[2], e[1]] as [number, number, number, number]) : undefined,
      };
    });
}

function KindIcon({ kind }: { kind: PlaceKind }) {
  if (kind === "school") return <GraduationCap className="size-3.5" />;
  if (kind === "org") return <Building2 className="size-3.5" />;
  if (kind === "region") return <Landmark className="size-3.5" />;
  return <MapPin className="size-3.5" />;
}

const KIND_LABEL: Record<PlaceKind, string> = {
  region: "State",
  city: "City",
  area: "Area",
  address: "Address",
  school: "Education",
  org: "Organization",
};

export default function LocationSearch({ onLocationSelected, proximity }: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<string>(newSessionToken());
  /** Set when a result is chosen so the resulting query change doesn't re-open the list. */
  const suppressSearchRef = useRef(false);
  const proximityRef = useRef(proximity);
  proximityRef.current = proximity;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        let found = await suggestMapbox(q, sessionRef.current, proximityRef.current, controller.signal);
        if (found.length === 0) {
          found = await suggestPhoton(q, proximityRef.current, controller.signal);
        }
        setResults(found);
        setIsOpen(found.length > 0);
        setActiveIndex(-1);
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          console.warn("Location search failed:", err);
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  async function select(place: PlaceSuggestion) {
    // Close everything immediately; the query change must not re-open the dropdown.
    suppressSearchRef.current = true;
    setQuery(place.name);
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.blur();

    if (place.source === "photon" && place.center) {
      onLocationSelected({ center: place.center, zoom: place.zoom, bbox: place.bbox }, place.name);
      return;
    }

    setIsLoading(true);
    try {
      const params = new URLSearchParams({ access_token: TOKEN, session_token: sessionRef.current });
      const res = await fetch(
        `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(place.id)}?${params}`,
      );
      const data = (await res.json()) as MapboxRetrieveResponse;
      const feature = data.features?.[0];
      if (feature) {
        onLocationSelected(
          {
            center: feature.geometry.coordinates,
            zoom: place.zoom,
            bbox: place.kind === "org" || place.kind === "school" ? undefined : feature.properties.bbox,
          },
          place.name,
        );
      }
    } catch (err) {
      console.warn("Location retrieve failed:", err);
    } finally {
      sessionRef.current = newSessionToken(); // one session per completed search
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!isOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex >= 0 ? activeIndex : 0];
      if (target) void select(target);
    }
  }

  return (
    <div ref={containerRef} className="absolute right-6 top-6 z-30 w-[min(26rem,calc(100vw-3rem))]">
      <div className="relative">
        <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
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
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search a city, state, university, company…"
          aria-label="Search locations"
          className="w-full rounded-full border border-white/40 bg-white/95 py-3 pl-11 pr-10 text-sm font-medium text-slate-900 shadow-2xl backdrop-blur-2xl outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/50"
        />
        {query && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setResults([]);
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-700"
            aria-label="Clear search"
          >
            <X className="size-4" />
          </button>
        )}

        {isOpen && results.length > 0 && (
          <ul className="absolute right-0 top-full mt-2 max-h-96 w-full overflow-y-auto rounded-2xl border border-white/40 bg-white/95 p-1.5 shadow-2xl backdrop-blur-2xl">
            {results.map((place, i) => (
              <li key={`${place.id}-${i}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    void select(place);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors",
                    i === activeIndex ? "bg-blue-50" : "hover:bg-slate-100",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      place.kind === "school"
                        ? "bg-amber-100 text-amber-700"
                        : place.kind === "org"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-blue-100 text-blue-700",
                    )}
                  >
                    <KindIcon kind={place.kind} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-slate-900">{place.name}</span>
                    <span className="truncate text-xs text-slate-500">{place.subtitle}</span>
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {KIND_LABEL[place.kind]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
