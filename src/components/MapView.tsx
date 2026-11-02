"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { ExternalLink, MapPin, X } from "lucide-react";
import type { Job, JobViewport, MapTarget } from "@/types";
import { companyLogoUrl, getJobApplicationLink } from "@/lib/jobs";
import MapControls, { type CameraAction, type FlightCameraView, type FlightVisionMode, type ThrottleLevel } from "@/components/jobmap/map-controls";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

const DEFAULT_PITCH = 60;
const MAX_PITCH = 85;
// Mapbox Standard's 3D building layer is most dependable at neighborhood zoom.
// Keeping the camera above this floor avoids the flat-map views from the launch.
const MIN_FLIGHT_ZOOM = 15.1;
const MAX_FLIGHT_ZOOM = 18;
const ST_LOUIS_CENTER: [number, number] = [-90.1994, 38.627];
const LAUNCH_RADIUS_METERS = 80_467.2;
// This coarse box keeps Mapbox from wrapping or allowing unbounded panning;
// the circular radius is enforced precisely after each camera movement.
const ST_LOUIS_FLIGHT_BOUNDS: [[number, number], [number, number]] = [
  [-91.14, 37.904],
  [-89.26, 39.35],
];
const EMPTY_POLYGONS: FeatureCollection<Polygon> = { type: "FeatureCollection", features: [] };

function clampToLaunchRadius([lng, lat]: [number, number]): [number, number] {
  const [centerLng, centerLat] = ST_LOUIS_CENTER;
  const radians = Math.PI / 180;
  const deltaLat = (lat - centerLat) * radians;
  const deltaLng = (lng - centerLng) * radians;
  const centerLatRadians = centerLat * radians;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(centerLatRadians) * Math.cos(lat * radians) * Math.sin(deltaLng / 2) ** 2;
  const distance = 6_371_008.8 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
  const safeRadius = LAUNCH_RADIUS_METERS - 10;

  if (distance <= safeRadius) return [lng, lat];

  const ratio = safeRadius / distance;
  return [centerLng + (lng - centerLng) * ratio, centerLat + (lat - centerLat) * ratio];
}

interface MapViewProps {
  jobs: Job[];
  selectedJobId: string | null;
  highlightedJobId?: string | null;
  commuteArea?: Feature<Polygon> | null;
  flightStarted?: boolean;
  onChangeStartLocation?: () => void;
  onSelectJob: (job: Job) => void;
  onViewportChange?: (viewport: JobViewport) => void;
  onVisibleCountChange?: (count: number) => void;
  onHighlightVisibleReady?: (highlight: () => void) => void;
  target?: MapTarget | null;
}

/** All jobs of one company at one building. */
interface CompanyPlace {
  id: string;
  company: string;
  coords: [number, number];
  building: string;
  logo: string | null;
  jobs: Job[];
  precision: "building" | "address" | "site" | "approximate";
}

interface PlaceProps {
  id: string;
  count: number;
}

interface SourceFeature {
  geometry: { type: string; coordinates: number[] };
  properties: Record<string, unknown> | null;
}

interface MarkerEntry {
  marker: mapboxgl.Marker;
  sig: string;
}

interface CompanyPopupState {
  place: CompanyPlace;
  point: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Data shaping
// ---------------------------------------------------------------------------

function buildingKey([lng, lat]: [number, number]): string {
  // ~1 m precision: jobs geocoded to the same address share a building.
  return `${lng.toFixed(5)},${lat.toFixed(5)}`;
}

function buildPlaces(jobs: Job[]): Map<string, CompanyPlace> {
  const places = new Map<string, CompanyPlace>();
  for (const job of jobs) {
    const building = buildingKey(job.coords);
    const id = `${job.company.toLowerCase()}|${building}`;
    let place = places.get(id);
    if (!place) {
      place = {
        id,
        company: job.company,
        coords: job.coords,
        building,
        logo: job.logoUrl ?? companyLogoUrl(job.company, job.application_url),
        jobs: [],
        precision: job.locationPrecision ?? "approximate",
      };
      places.set(id, place);
    }
    place.jobs.push(job);
  }
  return places;
}

function placesToGeoJSON(
  places: Map<string, CompanyPlace>,
): FeatureCollection<Point, PlaceProps> {
  return {
    type: "FeatureCollection",
    features: [...places.values()].map((place) => ({
      type: "Feature",
      properties: { id: place.id, count: place.jobs.length },
      geometry: { type: "Point", coordinates: place.coords },
    })),
  };
}

// ---------------------------------------------------------------------------
// Marker DOM builders (vanilla DOM; textContent only — names come from scraped data)
// ---------------------------------------------------------------------------

function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function logoEl(place: CompanyPlace, size: number): HTMLElement {
  const wrap = el("span", "jm-logo");
  wrap.style.width = `${size}px`;
  wrap.style.height = `${size}px`;
  const initials = el("span", "jm-initials", place.company.slice(0, 1).toUpperCase());
  initials.style.background = `hsl(${hueFor(place.company)} 65% 45%)`;
  initials.style.fontSize = `${Math.round(size * 0.45)}px`;
  wrap.appendChild(initials);
  if (place.logo) {
    const img = el("img", "jm-logo-img");
    img.alt = "";
    img.referrerPolicy = "no-referrer";
    img.loading = "lazy";
    img.onerror = () => img.remove();
    img.onload = () => {
      if (img.naturalWidth < 8) img.remove(); // blank placeholder icons
    };
    img.src = place.logo;
    wrap.appendChild(img);
  }
  return wrap;
}

function jobsLabel(n: number): string {
  return `${n} job${n === 1 ? "" : "s"}`;
}

function hoverCardEl(job: Job): HTMLElement {
  const card = el("div", "jm-hovercard");
  card.appendChild(el("span", "jm-hover-company", job.company));
  card.appendChild(el("span", "jm-hover-title", job.title));
  card.appendChild(
    el("span", "jm-hover-meta", [job.salary, job.workType].filter(Boolean).join(" · ") || job.location_label),
  );
  return card;
}

function interactiveMarker(label: string, onClick: () => void): HTMLDivElement {
  const root = el("div", "jm-marker");
  root.setAttribute("role", "button");
  root.setAttribute("tabindex", "-1");
  root.setAttribute("aria-label", label);
  root.addEventListener("mousedown", (event) => {
    event.preventDefault();
  });
  root.addEventListener("click", onClick);
  root.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onClick();
  });
  return root;
}

function singlePinEl(place: CompanyPlace, selected: boolean, onClick: () => void): HTMLElement {
  const accuracy = place.precision === "building" ? "verified building" : place.precision === "address" ? "verified address" : "approximate listing area";
  const root = interactiveMarker(`${place.company}, ${jobsLabel(place.jobs.length)}, ${accuracy}`, onClick);
  const pin = el("div", `jm-pin${selected ? " jm-selected" : ""}`);
  pin.title = `${place.company} — ${jobsLabel(place.jobs.length)} · ${accuracy}`;
  const head = el("div", "jm-pin-head");
  head.appendChild(logoEl(place, 30));
  head.appendChild(el("span", "jm-count", String(place.jobs.length)));
  pin.appendChild(head);
  pin.appendChild(el("span", "jm-tail"));
  pin.appendChild(el("span", "jm-name", place.company));
  root.appendChild(pin);
  root.appendChild(el("span", "jm-ground"));
  if (place.jobs[0]) root.appendChild(hoverCardEl(place.jobs[0]));
  return root;
}

function stackPinEl(places: CompanyPlace[], selected: boolean, onClick: () => void): HTMLElement {
  const total = places.reduce((sum, p) => sum + p.jobs.length, 0);
  const root = interactiveMarker(`${places.length} companies, ${jobsLabel(total)}. Expand company pins.`, onClick);
  const pin = el("div", `jm-pin jm-stack${selected ? " jm-selected" : ""}`);
  pin.title = `${places.length} companies — ${jobsLabel(total)}. Click to expand.`;
  const head = el("div", "jm-pin-head");
  const logos = el("span", "jm-stack-logos");
  places.slice(0, 3).forEach((place) => logos.appendChild(logoEl(place, 26)));
  head.appendChild(logos);
  head.appendChild(el("span", "jm-count", String(total)));
  pin.appendChild(head);
  pin.appendChild(el("span", "jm-stack-badge", String(places.length)));
  pin.appendChild(el("span", "jm-tail"));
  root.appendChild(pin);
  root.appendChild(el("span", "jm-ground"));
  return root;
}

function fanEl(
  places: CompanyPlace[],
  selectedPlaceId: string | null,
  onPick: (place: CompanyPlace) => void,
): HTMLElement {
  const root = el("div", "jm-marker jm-fan");
  root.appendChild(el("span", "jm-fan-anchor"));
  const n = places.length;
  const radius = Math.min(150, 70 + n * 7);
  // Arc above the building; switch to a full ring when crowded.
  const start = n > 7 ? -Math.PI / 2 : -Math.PI + Math.PI / 7;
  const sweep = n > 7 ? Math.PI * 2 : Math.PI - (2 * Math.PI) / 7;
  const steps = n > 7 ? n : Math.max(1, n - 1);

  places.forEach((place, i) => {
    const angle = n === 1 ? -Math.PI / 2 : start + (sweep * i) / steps;
    const item = el("button", `jm-fan-item${place.id === selectedPlaceId ? " jm-selected" : ""}`);
    item.type = "button";
    item.title = `${place.company} — ${jobsLabel(place.jobs.length)}`;
    item.style.setProperty("--x", `${Math.cos(angle) * radius}px`);
    item.style.setProperty("--y", `${Math.sin(angle) * radius}px`);
    item.style.transitionDelay = `${i * 25}ms`;
    const head = el("span", "jm-pin-head");
    head.appendChild(logoEl(place, 28));
    head.appendChild(el("span", "jm-count", String(place.jobs.length)));
    item.appendChild(head);
    item.appendChild(el("span", "jm-fan-name", place.company));
    if (place.jobs[0]) item.appendChild(hoverCardEl(place.jobs[0]));
    item.addEventListener("mousedown", (e) => {
      e.preventDefault();
    });
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      onPick(place);
    });
    root.appendChild(item);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add("jm-open")));
  return root;
}

function clusterEl(total: number, onClick: () => void): HTMLElement {
  const root = interactiveMarker(`${jobsLabel(total)}. Zoom in to see companies.`, onClick);
  const bubble = el("div", "jm-cluster", total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total));
  const size = total < 10 ? 38 : total < 50 ? 46 : total < 200 ? 56 : 66;
  bubble.style.width = `${size}px`;
  bubble.style.height = `${size}px`;
  bubble.title = `${jobsLabel(total)} — click to zoom in`;
  root.appendChild(bubble);
  return root;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const KEY_ACTIONS: Record<string, CameraAction> = {
  w: "forward",
  arrowup: "forward",
  s: "back",
  arrowdown: "back",
  a: "left",
  arrowleft: "left",
  d: "right",
  arrowright: "right",
  q: "rotateLeft",
  e: "rotateRight",
  r: "tiltUp",
  f: "tiltDown",
  z: "zoomIn",
  "+": "zoomIn",
  "=": "zoomIn",
  x: "zoomOut",
  "-": "zoomOut",
  _: "zoomOut",
};

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export default function MapView({
  jobs,
  selectedJobId,
  highlightedJobId = null,
  commuteArea = null,
  flightStarted = true,
  onChangeStartLocation,
  onSelectJob,
  onViewportChange,
  onVisibleCountChange,
  onHighlightVisibleReady,
  target,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const placesRef = useRef<Map<string, CompanyPlace>>(new Map());
  const markersRef = useRef<Map<string, MarkerEntry>>(new Map());
  const expandedBuildingRef = useRef<string | null>(null);
  const selectedPlaceIdRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelectJob);
  const onViewportChangeRef = useRef(onViewportChange);
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const onHighlightVisibleReadyRef = useRef(onHighlightVisibleReady);
  const highlightedJobIdRef = useRef(highlightedJobId);
  const visibleCountRef = useRef(-1);
  const keysRef = useRef<Set<CameraAction>>(new Set());
  const fastRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const lastMarkerRender = useRef(0);
  const compassRef = useRef<HTMLSpanElement | null>(null);
  const aircraftRigRef = useRef<HTMLDivElement | null>(null);
  const shadowRigRef = useRef<HTMLDivElement | null>(null);
  const afterburnerRef = useRef<SVGGElement | null>(null);
  const horizonRef = useRef<HTMLDivElement | null>(null);
  const hudHeadingRef = useRef<HTMLSpanElement | null>(null);
  const hudSpeedRef = useRef<HTMLSpanElement | null>(null);
  const hudAltitudeRef = useRef<HTMLSpanElement | null>(null);
  const hudTargetRef = useRef<HTMLSpanElement | null>(null);
  const lockedPlaceRef = useRef<CompanyPlace | null>(null);
  const lastTargetScanRef = useRef(0);
  const bankAngleRef = useRef(0);
  const pitchOffsetRef = useRef(0);
  const isFlyingRef = useRef(false);
  const throttleRef = useRef<ThrottleLevel>(2);
  const [flightView, setFlightView] = useState<FlightCameraView>("chase-close");
  const [visionMode, setVisionMode] = useState<FlightVisionMode>("day");
  const [isFlying, setIsFlying] = useState(false);
  const [throttle, setThrottle] = useState<ThrottleLevel>(2);
  const [companyPopup, setCompanyPopup] = useState<CompanyPopupState | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  onSelectRef.current = onSelectJob;
  onViewportChangeRef.current = onViewportChange;
  onVisibleCountChangeRef.current = onVisibleCountChange;
  onHighlightVisibleReadyRef.current = onHighlightVisibleReady;
  highlightedJobIdRef.current = highlightedJobId;
  isFlyingRef.current = isFlying;
  throttleRef.current = throttle;

  const pauseFlight = useCallback(() => {
    isFlyingRef.current = false;
    setIsFlying(false);
  }, []);

  const openCompany = useCallback((place: CompanyPlace) => {
    const m = map.current;
    if (!m) return;
    pauseFlight();
    m.easeTo({
      center: place.coords,
      zoom: Math.min(MAX_FLIGHT_ZOOM, Math.max(m.getZoom(), 17)),
      pitch: DEFAULT_PITCH,
      duration: 850,
      essential: true,
    });
    const pt = m.project(place.coords);
    setCompanyPopup({ place, point: { x: pt.x, y: pt.y } });
  }, [pauseFlight]);

  // Rebuild HTML markers from what the clustered source currently renders.
  const renderMarkers = useCallback(() => {
    const m = map.current;
    if (!m || !m.getSource("jobs") || !m.isSourceLoaded("jobs")) return;
    lastMarkerRender.current = performance.now();

    const features = m.querySourceFeatures("jobs") as unknown as SourceFeature[];
    const next = new Map<
      string,
      { sig: string; lngLat: [number, number]; anchor: "bottom" | "center"; build: () => HTMLElement }
    >();
    const buildings = new Map<string, CompanyPlace[]>();
    const seenPlaces = new Set<string>();
    const seenClusters = new Set<number>();
    let jobsOnScreen = 0;
    const width = m.getContainer().clientWidth;
    const height = m.getContainer().clientHeight;

    for (const feature of features) {
      const props = feature.properties ?? {};
      const coords: [number, number] = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]];
      const screenPoint = m.project(coords);
      const onScreen = screenPoint.x >= 0 && screenPoint.x <= width && screenPoint.y >= 0 && screenPoint.y <= height;
      if (!onScreen) continue;
      if (props.cluster) {
        const clusterId = Number(props.cluster_id);
        if (!seenClusters.has(clusterId)) {
          seenClusters.add(clusterId);
          jobsOnScreen += Number(props.jobs ?? props.point_count ?? 0);
        }
        const key = `c${clusterId}`;
        if (next.has(key)) continue;
        const total = Number(props.jobs ?? props.point_count ?? 0);
        next.set(key, {
          sig: `${total}`,
          lngLat: coords,
          anchor: "center",
          build: () =>
            clusterEl(total, () => {
              const source = m.getSource("jobs") as mapboxgl.GeoJSONSource | undefined;
              source?.getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err || zoom == null) return;
                m.easeTo({ center: coords, zoom: Math.min(zoom + 0.5, 18), duration: 700 });
              });
            }),
        });
        continue;
      }
      const id = String(props.id ?? "");
      if (!id || seenPlaces.has(id)) continue;
      seenPlaces.add(id);
      const place = placesRef.current.get(id);
      if (!place) continue;
      jobsOnScreen += place.jobs.length;
      const list = buildings.get(place.building) ?? [];
      list.push(place);
      buildings.set(place.building, list);
    }

    if (jobsOnScreen !== visibleCountRef.current) {
      visibleCountRef.current = jobsOnScreen;
      onVisibleCountChangeRef.current?.(jobsOnScreen);
    }

    for (const [building, list] of buildings) {
      list.sort((a, b) => b.jobs.length - a.jobs.length || a.company.localeCompare(b.company));
      const selectedId = selectedPlaceIdRef.current;
      const selected = list.some((p) => p.id === selectedId);
      const expanded = list.length > 1 && expandedBuildingRef.current === building;
      const sig = `${expanded ? "x" : "s"}|${selected ? selectedId : ""}|${list
        .map((p) => `${p.id}:${p.jobs.length}`)
        .join(",")}`;
      next.set(`b${building}`, {
        sig,
        lngLat: list[0].coords,
        anchor: expanded ? "center" : "bottom",
        build: () => {
          if (list.length === 1) return singlePinEl(list[0], selected, () => openCompany(list[0]));
          if (expanded) return fanEl(list, selectedId, openCompany);
          return stackPinEl(list, selected, () => {
            expandedBuildingRef.current = building;
            setCompanyPopup(null);
            if (m.getZoom() < 16) m.easeTo({ center: list[0].coords, zoom: 16.5, duration: 600 });
            renderMarkersRef.current();
          });
        },
      });
    }

    for (const [key, entry] of markersRef.current) {
      const candidate = next.get(key);
      if (!candidate || candidate.sig !== entry.sig) {
        entry.marker.remove();
        markersRef.current.delete(key);
      }
    }
    for (const [key, candidate] of next) {
      if (markersRef.current.has(key)) continue;
      const marker = new mapboxgl.Marker({ element: candidate.build(), anchor: candidate.anchor })
        .setLngLat(candidate.lngLat)
        .addTo(m);
      markersRef.current.set(key, { marker, sig: candidate.sig });
    }

    const highlightedId = highlightedJobIdRef.current;
    let highlightedPlace: CompanyPlace | null = null;
    if (highlightedId) {
      for (const place of placesRef.current.values()) {
        if (place.jobs.some((job) => job.id === highlightedId)) {
          highlightedPlace = place;
          break;
        }
      }
    }
    const highlightedPoint = highlightedPlace ? m.project(highlightedPlace.coords) : null;
    let bestMarkerEl: HTMLElement | null = null;
    let bestDistance = 54;
    if (highlightedPlace) {
      const directEntry =
        markersRef.current.get(`place:${highlightedPlace.id}`) ??
        markersRef.current.get(`stack:${highlightedPlace.building}`);
      if (directEntry) {
        bestMarkerEl = directEntry.marker.getElement();
      } else if (highlightedPoint) {
        for (const { marker } of markersRef.current.values()) {
          const point = m.project(marker.getLngLat());
          const distance = Math.hypot(point.x - highlightedPoint.x, point.y - highlightedPoint.y);
          if (distance <= bestDistance) {
            bestDistance = distance;
            bestMarkerEl = marker.getElement();
          }
        }
      }
    }
    for (const { marker } of markersRef.current.values()) {
      const elNode = marker.getElement();
      elNode.classList.toggle("jm-hover-target", elNode === bestMarkerEl);
    }
  }, [openCompany]);

  const renderMarkersRef = useRef(renderMarkers);
  renderMarkersRef.current = renderMarkers;

  useEffect(() => {
    renderMarkersRef.current();
  }, [highlightedJobId]);

  const highlightVisibleMarkers = useCallback(() => {
    const m = map.current;
    if (!m) return;
    const width = m.getContainer().clientWidth;
    const height = m.getContainer().clientHeight;
    for (const { marker } of markersRef.current.values()) {
      const point = m.project(marker.getLngLat());
      if (point.x < 0 || point.x > width || point.y < 0 || point.y > height) continue;
      const element = marker.getElement();
      element.classList.remove("jm-highlight");
      void element.offsetWidth;
      element.classList.add("jm-highlight");
      window.setTimeout(() => element.classList.remove("jm-highlight"), 1900);
    }
  }, []);

  useEffect(() => {
    onHighlightVisibleReadyRef.current?.(highlightVisibleMarkers);
  }, [highlightVisibleMarkers]);

  const updateAircraftAndHud = useCallback((m: mapboxgl.Map, bank: number, pitchDelta: number, thrustActive: boolean) => {
    const rawBearing = ((m.getBearing() % 360) + 360) % 360;
    const heading = Math.round(rawBearing) || 360;
    const zoom = m.getZoom();
    // Map zoom 15.1..18.0 to realistic low-altitude flight band (350 FT .. 1,850 FT AGL)
    const altitudeFt = Math.round(350 + ((MAX_FLIGHT_ZOOM - zoom) / (MAX_FLIGHT_ZOOM - MIN_FLIGHT_ZOOM)) * 1500);
    const speedKts = isFlyingRef.current || thrustActive
      ? (throttleRef.current === 1 ? 55 : throttleRef.current === 2 ? 95 : 160) * (fastRef.current ? 1.4 : 1)
      : 0;

    if (hudHeadingRef.current) hudHeadingRef.current.textContent = `${String(heading).padStart(3, "0")}°`;
    if (hudAltitudeRef.current) hudAltitudeRef.current.textContent = `${altitudeFt.toLocaleString()} FT`;
    if (hudSpeedRef.current) hudSpeedRef.current.textContent = `${Math.round(speedKts)} KTS`;
    if (horizonRef.current) {
      horizonRef.current.style.transform = `translate(-50%, -50%) rotate(${-bank.toFixed(1)}deg) translateY(${(pitchDelta * 2.2).toFixed(1)}px)`;
    }
    if (aircraftRigRef.current) {
      aircraftRigRef.current.style.transform = `perspective(700px) rotateZ(${bank.toFixed(1)}deg) rotateX(${(12 + pitchDelta).toFixed(1)}deg)`;
    }
    if (shadowRigRef.current) {
      const shadowScale = Math.max(0.65, Math.min(1.15, (zoom - 14.5) / 3));
      shadowRigRef.current.style.transform = `translateX(${(bank * 1.1).toFixed(1)}px) scale(${shadowScale.toFixed(2)}) rotateZ(${(bank * 0.5).toFixed(1)}deg)`;
    }
    if (afterburnerRef.current) {
      const flameScale = isFlyingRef.current || thrustActive
        ? (throttleRef.current === 1 ? 0.85 : throttleRef.current === 2 ? 1.15 : 1.55) * (0.92 + Math.sin(performance.now() * 0.03) * 0.08)
        : 0.4;
      afterburnerRef.current.style.transform = `scaleY(${flameScale.toFixed(2)})`;
      afterburnerRef.current.style.opacity = isFlyingRef.current || thrustActive ? "0.95" : "0.45";
    }

    // Scan for nearest employer building ahead of aircraft every ~220ms
    const now = performance.now();
    if (now - lastTargetScanRef.current > 220 && hudTargetRef.current) {
      lastTargetScanRef.current = now;
      const center = m.getCenter();
      let bestPlace: CompanyPlace | null = null;
      let bestDistMeters = Infinity;
      const rad = Math.PI / 180;
      const cosLat = Math.cos(center.lat * rad);
      for (const place of placesRef.current.values()) {
        const dLng = (place.coords[0] - center.lng) * 111_320 * cosLat;
        const dLat = (place.coords[1] - center.lat) * 110_540;
        const dist = Math.hypot(dLng, dLat);
        if (dist < bestDistMeters) {
          bestDistMeters = dist;
          bestPlace = place;
        }
      }
      lockedPlaceRef.current = bestPlace;
      if (bestPlace && bestDistMeters <= 2500) {
        const distLabel = bestDistMeters < 1000 ? `${Math.round(bestDistMeters)}m` : `${(bestDistMeters / 1000).toFixed(1)}km`;
        hudTargetRef.current.textContent = `${bestPlace.company.slice(0, 18)} · ${distLabel} (${bestPlace.jobs.length})`;
      } else {
        hudTargetRef.current.textContent = "SCANNING ST. LOUIS…";
      }
    }
  }, []);

  // ---- Continuous 60-FPS Flight Simulator loop (cruise + keyboard + on-screen pad) ----
  const step = useCallback(() => {
    const m = map.current;
    const keys = keysRef.current;
    const cruising = isFlyingRef.current;
    if (!m || (!cruising && keys.size === 0 && Math.abs(bankAngleRef.current) < 0.3 && Math.abs(pitchOffsetRef.current) < 0.2)) {
      bankAngleRef.current = 0;
      pitchOffsetRef.current = 0;
      if (m) updateAircraftAndHud(m, 0, 0, false);
      rafRef.current = null;
      return;
    }

    const fast = fastRef.current ? 1.85 : 1;
    const throttleMult = throttleRef.current === 1 ? 0.65 : throttleRef.current === 2 ? 1.1 : 1.85;
    const baseSpeed = 2.6 * throttleMult * fast;

    let forwardSpeed = cruising ? baseSpeed : 0;
    if (keys.has("forward")) forwardSpeed = Math.max(forwardSpeed, baseSpeed * 1.25);
    if (keys.has("back")) forwardSpeed = cruising ? baseSpeed * 0.25 : -baseSpeed * 0.8;

    const turningLeft = keys.has("left") || keys.has("rotateLeft");
    const turningRight = keys.has("right") || keys.has("rotateRight");

    let turnRate = 0;
    if (turningLeft) turnRate -= 1.35 * fast;
    if (turningRight) turnRate += 1.35 * fast;

    // Smooth bank (roll) physics: bank into turns up to +/-28 degrees
    const targetBank = turningLeft && !turningRight ? -28 : turningRight && !turningLeft ? 28 : 0;
    bankAngleRef.current += (targetBank - bankAngleRef.current) * 0.14;

    // Smooth nose pitch visual response when climbing/descending or accelerating
    const climbing = keys.has("zoomOut") || keys.has("tiltUp") || keys.has("forward");
    const descending = keys.has("zoomIn") || keys.has("tiltDown") || keys.has("back");
    const targetPitchOffset = climbing && !descending ? 8 : descending && !climbing ? -8 : 0;
    pitchOffsetRef.current += (targetPitchOffset - pitchOffsetRef.current) * 0.14;

    let bearing = m.getBearing() + turnRate;

    let pitch = m.getPitch();
    if (keys.has("tiltUp")) pitch += 1.1;
    if (keys.has("tiltDown")) pitch -= 1.1;
    pitch = Math.max(0, Math.min(MAX_PITCH, pitch));

    let zoom = m.getZoom();
    if (keys.has("zoomIn")) zoom += 0.03 * fast;
    if (keys.has("zoomOut")) zoom -= 0.03 * fast;
    zoom = Math.max(MIN_FLIGHT_ZOOM, Math.min(MAX_FLIGHT_ZOOM, zoom));

    // Screen-space forward motion (dy < 0 moves forward along current camera bearing)
    let dx = 0;
    let dy = -forwardSpeed;
    if (!cruising && !keys.has("forward") && !keys.has("back")) {
      if (keys.has("left")) dx -= 4 * fast;
      if (keys.has("right")) dx += 4 * fast;
    }

    let center = m.getCenter();
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
      const projected = m.project(center);
      const unprojected = m.unproject([projected.x + dx, projected.y + dy]);
      const [clampedLng, clampedLat] = clampToLaunchRadius([unprojected.lng, unprojected.lat]);
      // If we reach the 50-mile boundary while cruising, gently bank back toward St. Louis center
      if (Math.abs(clampedLng - unprojected.lng) > 1e-6 || Math.abs(clampedLat - unprojected.lat) > 1e-6) {
        bearing = (bearing + 3.2) % 360;
      }
      center = new mapboxgl.LngLat(clampedLng, clampedLat);
    }

    m.jumpTo({ center, bearing, pitch, zoom });
    updateAircraftAndHud(m, bankAngleRef.current, pitchOffsetRef.current, Math.abs(forwardSpeed) > 0.1);
    rafRef.current = requestAnimationFrame(step);
  }, [updateAircraftAndHud]);

  const ensureLoopRunning = useCallback(() => {
    if (rafRef.current == null) {
      rafRef.current = requestAnimationFrame(step);
    }
  }, [step]);

  const toggleFlying = useCallback(() => {
    setIsFlying((prev) => {
      const next = !prev;
      isFlyingRef.current = next;
      if (next) {
        setCompanyPopup(null);
      }
      return next;
    });
    ensureLoopRunning();
  }, [ensureLoopRunning]);

  useEffect(() => {
    if (flightStarted && isMapLoaded) {
      isFlyingRef.current = true;
      setIsFlying(true);
      ensureLoopRunning();
    }
  }, [flightStarted, isMapLoaded, ensureLoopRunning]);

  const hold = useCallback(
    (action: CameraAction, active: boolean) => {
      if (active) keysRef.current.add(action);
      else keysRef.current.delete(action);
      ensureLoopRunning();
    },
    [ensureLoopRunning],
  );

  const resetNorth = useCallback(() => {
    map.current?.easeTo({ bearing: 0, duration: 600 });
  }, []);

  const toggle3D = useCallback(() => {
    const m = map.current;
    if (!m) return;
    m.easeTo({ pitch: m.getPitch() > 10 ? 0 : DEFAULT_PITCH, duration: 700 });
  }, []);

  const setFlightCameraView = useCallback((view: FlightCameraView) => {
    const m = map.current;
    if (!m) return;
    setFlightView(view);
    const camera = {
      cockpit: { pitch: 72, zoom: 16.4 },
      "chase-close": { pitch: 64, zoom: 15.7 },
      "chase-far": { pitch: 58, zoom: 15.1 },
    }[view];
    m.easeTo({ ...camera, duration: 650, essential: true });
  }, []);

  // ---- Map initialisation ----
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      center: ST_LOUIS_CENTER,
      zoom: 15.4,
      pitch: DEFAULT_PITCH,
      bearing: -20,
      maxPitch: MAX_PITCH,
      minZoom: MIN_FLIGHT_ZOOM,
      maxZoom: MAX_FLIGHT_ZOOM,
      maxBounds: ST_LOUIS_FLIGHT_BOUNDS,
      antialias: true,
      keyboard: false, // replaced by the game-style controls below
      dragRotate: true,
      pitchWithRotate: true,
      touchPitch: true,
    });
    map.current = instance;

    instance.on("style.load", () => {
      // Buildings and what's in them — no street names, road shields, third-party POI clutter, or transit.
      const config: [string, boolean][] = [
        ["showRoadLabels", false],
        ["showTransitLabels", false],
        ["showPointOfInterestLabels", false],
        ["showPlaceLabels", true],
        ["show3dObjects", true],
      ];
      for (const [key, value] of config) {
        try {
          instance.setConfigProperty("basemap", key, value);
        } catch {
          // Option not supported by this style version.
        }
      }
    });

    instance.on("load", () => {
      setIsMapLoaded(true);
      instance.addSource("commute-area", {
        type: "geojson",
        data: commuteArea ?? EMPTY_POLYGONS,
      });
      instance.addLayer({
        id: "commute-area-fill",
        type: "fill",
        source: "commute-area",
        paint: { "fill-color": "#2563eb", "fill-opacity": 0.12 },
      });
      instance.addLayer({
        id: "commute-area-outline",
        type: "line",
        source: "commute-area",
        paint: { "line-color": "#2563eb", "line-width": 2, "line-dasharray": [2, 1] },
      });
      instance.addSource("jobs", {
        type: "geojson",
        data: placesToGeoJSON(placesRef.current),
        cluster: true,
        clusterMaxZoom: 16,
        clusterRadius: 60,
        // Cluster labels show the real number of JOBS, not the number of points.
        clusterProperties: { jobs: ["+", ["get", "count"]] },
      });
      // Invisible layer so the source's tiles load and can be queried for markers.
      instance.addLayer({
        id: "jobs-anchor",
        type: "circle",
        source: "jobs",
        paint: { "circle-radius": 1, "circle-opacity": 0 },
      });

      instance.on("render", () => {
        if (performance.now() - lastMarkerRender.current > 150) renderMarkersRef.current();
      });
      instance.on("idle", () => renderMarkersRef.current());

      let viewportTimer: number | undefined;
      const reportViewport = () => {
        const [lng, lat] = clampToLaunchRadius([instance.getCenter().lng, instance.getCenter().lat]);
        const center = instance.getCenter();
        if (Math.abs(center.lng - lng) > 1e-5 || Math.abs(center.lat - lat) > 1e-5) {
          window.clearTimeout(viewportTimer);
          instance.easeTo({ center: [lng, lat], duration: 250, essential: true });
          return;
        }
        window.clearTimeout(viewportTimer);
        viewportTimer = window.setTimeout(() => {
          const bounds = instance.getBounds();
          if (!bounds) return;
          onViewportChangeRef.current?.({
            minLng: bounds.getWest(),
            minLat: bounds.getSouth(),
            maxLng: bounds.getEast(),
            maxLat: bounds.getNorth(),
          });
        }, 200);
      };
      instance.on("moveend", reportViewport);
      reportViewport();
    });

    instance.on("rotate", () => {
      if (compassRef.current) {
        compassRef.current.style.transform = `rotate(${-instance.getBearing()}deg)`;
      }
    });
    instance.on("pitchend", () => setIs3D(instance.getPitch() > 10));

    instance.on("move", () => {
      setCompanyPopup((current) => {
        if (!current) return null;
        const pt = instance.project(current.place.coords);
        return { ...current, point: { x: pt.x, y: pt.y } };
      });
    });

    instance.on("click", (event) => {
      const target = event.originalEvent.target;
      if (target instanceof Element && target.closest(".jm-marker")) return;
      // Clicking empty map collapses fanned-out stacks and closes the company list.
      setCompanyPopup(null);
      if (expandedBuildingRef.current) {
        expandedBuildingRef.current = null;
        renderMarkersRef.current();
      }
    });

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(mapContainer.current);
    const markers = markersRef.current;

    return () => {
      observer.disconnect();
      markers.forEach((entry) => entry.marker.remove());
      markers.clear();
      instance.remove();
      map.current = null;
    };
  }, []);

  // ---- Keyboard controls ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      fastRef.current = e.shiftKey;
      const key = e.key.toLowerCase();
      if (key === " ") {
        e.preventDefault();
        toggleFlying();
        return;
      }
      if (key === "1" || key === "2" || key === "3") {
        e.preventDefault();
        const level = Number(key) as ThrottleLevel;
        throttleRef.current = level;
        setThrottle(level);
        ensureLoopRunning();
        return;
      }
      if (key === "t") {
        e.preventDefault();
        if (lockedPlaceRef.current) {
          openCompany(lockedPlaceRef.current);
        }
        return;
      }
      if (key === "v") {
        e.preventDefault();
        setVisionMode((prev) => (prev === "day" ? "nvg" : prev === "nvg" ? "flir" : "day"));
        return;
      }
      if (key === "n") {
        resetNorth();
        return;
      }
      const action = KEY_ACTIONS[key];
      if (!action) return;
      e.preventDefault();
      hold(action, true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      fastRef.current = e.shiftKey;
      const action = KEY_ACTIONS[e.key.toLowerCase()];
      if (action) hold(action, false);
    };
    const onBlur = () => {
      keysRef.current.clear();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [hold, resetNorth, toggleFlying, ensureLoopRunning, openCompany]);

  // ---- Vision Mode (Day / NVG Night / FLIR Thermal) ----
  useEffect(() => {
    const m = map.current;
    if (!m || !isMapLoaded) return;
    try {
      m.setConfigProperty("basemap", "lightPreset", visionMode === "day" ? "day" : "night");
    } catch {
      // Fallback handled by optical HUD filter overlay below
    }
  }, [visionMode, isMapLoaded]);

  // ---- Data updates ----
  useEffect(() => {
    placesRef.current = buildPlaces(
      jobs.filter((job) => job.locationPrecision !== "approximate"),
    );
    const m = map.current;
    const source = m?.getSource("jobs") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(placesToGeoJSON(placesRef.current));
    setCompanyPopup((current) => {
      if (!current) return null;
      const fresh = placesRef.current.get(current.place.id);
      return fresh ? { ...current, place: fresh } : null;
    });
    renderMarkersRef.current();
  }, [jobs]);

  useEffect(() => {
    const source = map.current?.getSource("commute-area") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(commuteArea ?? EMPTY_POLYGONS);
  }, [commuteArea, isMapLoaded]);

  // ---- Selection: highlight its pin and fly to the building ----
  useEffect(() => {
    setCompanyPopup(null);
    let selectedPlace: CompanyPlace | null = null;
    if (selectedJobId) {
      for (const place of placesRef.current.values()) {
        if (place.jobs.some((job) => job.id === selectedJobId)) {
          selectedPlace = place;
          break;
        }
      }
    }
    selectedPlaceIdRef.current = selectedPlace?.id ?? null;
    renderMarkersRef.current();
    if (selectedPlace && map.current) {
      pauseFlight();
      map.current.flyTo({
        center: selectedPlace.coords,
        zoom: Math.min(MAX_FLIGHT_ZOOM, Math.max(map.current.getZoom(), 17)),
        pitch: DEFAULT_PITCH,
        duration: 1400,
        essential: true,
      });
    }
  }, [selectedJobId, pauseFlight]);

  // ---- Location search target ----
  useEffect(() => {
    const m = map.current;
    if (!m || !isMapLoaded || !target) return;
    setCompanyPopup(null);
    pauseFlight();
    const targetZoom = Math.max(MIN_FLIGHT_ZOOM, Math.min(MAX_FLIGHT_ZOOM, target.zoom));
    if (target.bbox && targetZoom <= 13.5) {
      m.fitBounds(target.bbox, { padding: 80, pitch: 45, maxZoom: Math.min(MAX_FLIGHT_ZOOM, targetZoom + 1), duration: 1600 });
    } else {
      m.flyTo({
        center: target.center,
        zoom: targetZoom,
        pitch: targetZoom >= 15 ? DEFAULT_PITCH : 45,
        duration: 1800,
        essential: true,
      });
    }
    const timer = window.setTimeout(() => {
      if (flightStarted) {
        isFlyingRef.current = true;
        setIsFlying(true);
        ensureLoopRunning();
      }
    }, 1850);
    return () => window.clearTimeout(timer);
  }, [target, isMapLoaded, pauseFlight, flightStarted, ensureLoopRunning]);

  const popup = companyPopup;
  const containerHeight = mapContainer.current?.clientHeight ?? 800;
  const containerWidth = mapContainer.current?.clientWidth ?? 1200;
  const placeBelow = popup ? popup.point.y < 420 : false;

  return (
    <div
      onScroll={(event) => {
        event.currentTarget.scrollTop = 0;
        event.currentTarget.scrollLeft = 0;
      }}
      onWheel={(event) => {
        if (event.ctrlKey && map.current) {
          event.preventDefault();
          const nextZoom = Math.max(
            MIN_FLIGHT_ZOOM,
            Math.min(MAX_FLIGHT_ZOOM, map.current.getZoom() - event.deltaY * 0.01),
          );
          map.current.zoomTo(nextZoom, { duration: 0 });
        }
      }}
      className="relative h-full w-full overflow-clip bg-slate-900"
    >
      <div
        ref={mapContainer}
        className={`h-full w-full overflow-clip transition-[filter] duration-500 ${
          visionMode === "nvg"
            ? "contrast-125 hue-rotate-[70deg] saturate-150"
            : visionMode === "flir"
              ? "contrast-150 invert hue-rotate-180 saturate-200"
              : ""
        }`}
      />

      {visionMode !== "day" && (
        <div
          className={`pointer-events-none absolute inset-0 z-[5] mix-blend-screen ${
            visionMode === "nvg" ? "bg-emerald-950/25" : "bg-amber-950/20"
          }`}
          aria-hidden="true"
        />
      )}

      {/* Top Flight Telemetry & Target-Lock Ribbon */}
      <div className="pointer-events-auto absolute top-3 left-1/2 z-[15] hidden -translate-x-1/2 items-center gap-3 rounded-2xl border border-sky-400/30 bg-slate-950/85 px-4 py-1.5 font-mono text-xs text-sky-100 shadow-2xl backdrop-blur-md md:flex">
        <div className="flex items-center gap-1.5">
          <span className={`size-2 rounded-full ${isFlying ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
          <span className="text-[10px] font-bold tracking-widest text-sky-400">
            {isFlying ? "CRUISE" : "HOVER"}
          </span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">SPD</span>
          <span ref={hudSpeedRef} className="w-15 text-right font-bold text-emerald-300">
            {isFlying ? (throttle === 1 ? "55 KTS" : throttle === 2 ? "95 KTS" : "160 KTS") : "0 KTS"}
          </span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">HDG</span>
          <span ref={hudHeadingRef} className="w-9 text-right font-bold text-white">340°</span>
        </div>
        <span className="text-slate-600">|</span>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-slate-400">ALT</span>
          <span ref={hudAltitudeRef} className="w-16 text-right font-bold text-sky-300">1,250 FT</span>
        </div>
        <span className="text-slate-600">|</span>
        <button
          type="button"
          onClick={() => {
            if (lockedPlaceRef.current) openCompany(lockedPlaceRef.current);
          }}
          title="Click or press T to lock & inspect nearest building"
          className="flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/25"
        >
          <span className="text-emerald-400">TGT [T]:</span>
          <span ref={hudTargetRef} className="max-w-44 truncate">SCANNING ST. LOUIS…</span>
        </button>
      </div>

      {/* 3D Chase Aircraft Rig (Close Chase & Far Chase) */}
      {flightView !== "cockpit" && (
        <div
          className={`pointer-events-none absolute left-1/2 z-[6] flex -translate-x-1/2 flex-col items-center justify-center ${
            flightView === "chase-close" ? "bottom-[16%] scale-100" : "bottom-[22%] scale-75"
          } transition-all duration-300`}
          aria-hidden="true"
        >
          {/* 3D Articulated Jet Model */}
          <div
            ref={aircraftRigRef}
            className="relative flex items-center justify-center transition-transform duration-75 will-change-transform"
            style={{ transform: "perspective(700px) rotateZ(0deg) rotateX(12deg)" }}
          >
            <svg
              width="168"
              height="152"
              viewBox="0 0 168 152"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="drop-shadow-[0_18px_20px_rgba(2,6,23,0.55)]"
            >
              <defs>
                <linearGradient id="jm-fuselage" x1="84" y1="6" x2="84" y2="124" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#f8fafc" />
                  <stop offset="55%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                <linearGradient id="jm-wing-left" x1="12" y1="78" x2="84" y2="58" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#64748b" />
                  <stop offset="60%" stopColor="#e2e8f0" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
                <linearGradient id="jm-wing-right" x1="156" y1="78" x2="84" y2="58" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#475569" />
                  <stop offset="60%" stopColor="#cbd5e1" />
                  <stop offset="100%" stopColor="#94a3b8" />
                </linearGradient>
                <linearGradient id="jm-canopy" x1="84" y1="22" x2="84" y2="58" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="50%" stopColor="#0284c7" />
                  <stop offset="100%" stopColor="#0f172a" />
                </linearGradient>
                <linearGradient id="jm-afterburner" x1="84" y1="110" x2="84" y2="150" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="30%" stopColor="#38bdf8" />
                  <stop offset="70%" stopColor="#f97316" />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity="0" />
                </linearGradient>
              </defs>

              {/* Swept Main Wings */}
              <path
                d="M84 44 L10 86 L16 96 L74 82 L84 44 Z"
                fill="url(#jm-wing-left)"
                stroke="#1e293b"
                strokeWidth="1.5"
              />
              <path
                d="M84 44 L158 86 L152 96 L94 82 L84 44 Z"
                fill="url(#jm-wing-right)"
                stroke="#1e293b"
                strokeWidth="1.5"
              />

              {/* Blue Accent Wing Stripes */}
              <path d="M70 56 L24 84 L29 89 L72 68 Z" fill="#2563eb" opacity="0.85" />
              <path d="M98 56 L144 84 L139 89 L96 68 Z" fill="#2563eb" opacity="0.85" />

              {/* Rear Horizontal Stabilizers (Elevators) */}
              <path
                d="M84 90 L46 114 L50 120 L78 110 Z"
                fill="#64748b"
                stroke="#0f172a"
                strokeWidth="1.2"
              />
              <path
                d="M84 90 L122 114 L118 120 L90 110 Z"
                fill="#475569"
                stroke="#0f172a"
                strokeWidth="1.2"
              />

              {/* Supersonic Fuselage Body */}
              <path
                d="M84 6 C79 22 75 46 75 78 L73 112 L95 112 L93 78 C93 46 89 22 84 6 Z"
                fill="url(#jm-fuselage)"
                stroke="#0f172a"
                strokeWidth="1.5"
              />

              {/* Cockpit Glass Canopy */}
              <path
                d="M84 22 C80.5 30 79.5 42 80.5 55 C82.5 58 85.5 58 87.5 55 C88.5 42 87.5 30 84 22 Z"
                fill="url(#jm-canopy)"
                stroke="#e0f2fe"
                strokeWidth="1"
              />

              {/* Twin Vertical Tail Fins */}
              <path d="M75 84 L66 114 L73 114 L78 90 Z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />
              <path d="M93 84 L102 114 L95 114 L90 90 Z" fill="#1e293b" stroke="#94a3b8" strokeWidth="1" />

              {/* Twin Jet Engine Nozzles */}
              <ellipse cx="78.5" cy="113" rx="4" ry="2.5" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
              <ellipse cx="89.5" cy="113" rx="4" ry="2.5" fill="#0f172a" stroke="#64748b" strokeWidth="1" />

              {/* Dynamic Afterburner Plumes */}
              <g ref={afterburnerRef} style={{ transformOrigin: "84px 114px" }}>
                <path d="M75 114 Q78.5 144 78.5 148 Q78.5 144 82 114 Z" fill="url(#jm-afterburner)" />
                <path d="M86 114 Q89.5 144 89.5 148 Q89.5 144 93 114 Z" fill="url(#jm-afterburner)" />
                <ellipse cx="78.5" cy="116" rx="2.5" ry="4" fill="#e0f2fe" />
                <ellipse cx="89.5" cy="116" rx="2.5" ry="4" fill="#e0f2fe" />
              </g>

              {/* Wingtip Strobe & Navigation Lights (Port Red, Starboard Green) */}
              <circle cx="13" cy="88" r="2.8" fill="#ef4444" />
              <circle cx="13" cy="88" r="6" fill="#ef4444" opacity="0.35" />
              <circle cx="155" cy="88" r="2.8" fill="#22c55e" />
              <circle cx="155" cy="88" r="6" fill="#22c55e" opacity="0.35" />
            </svg>
          </div>

          {/* Ground Shadow Projected Below Aircraft */}
          <div
            ref={shadowRigRef}
            className="mt-2 h-5 w-28 rounded-full bg-slate-950/35 blur-md transition-transform duration-75"
          />
        </div>
      )}

      {/* First-Person Cockpit View HUD & Canopy Frame */}
      {flightView === "cockpit" && (
        <div className="pointer-events-none absolute inset-0 z-[6] overflow-hidden" aria-hidden="true">
          {/* Upper Canopy Bow & Angled Side Struts */}
          <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 1000 700">
            <path
              d="M0 0 L1000 0 L1000 45 L820 20 L180 20 L0 45 Z"
              fill="rgba(2,6,23,0.65)"
            />
            <path d="M180 20 L65 700 L0 700 L0 45 Z" fill="rgba(2,6,23,0.42)" />
            <path d="M820 20 L935 700 L1000 700 L1000 45 Z" fill="rgba(2,6,23,0.42)" />
            <line x1="180" y1="20" x2="65" y2="700" stroke="rgba(56,189,248,0.28)" strokeWidth="2" />
            <line x1="820" y1="20" x2="935" y2="700" stroke="rgba(56,189,248,0.28)" strokeWidth="2" />
          </svg>

          {/* Center Pitch Ladder & Artificial Horizon */}
          <div
            ref={horizonRef}
            className="absolute top-1/2 left-1/2 flex size-72 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-between py-8 opacity-85 transition-transform duration-75"
          >
            <div className="flex w-32 justify-between border-t-2 border-emerald-400/70 pt-0.5 font-mono text-[9px] text-emerald-300">
              <span>+10</span>
              <span>+10</span>
            </div>
            <div className="flex w-56 items-center justify-between">
              <span className="h-0.5 w-20 bg-emerald-400/90 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
              <span className="h-0.5 w-20 bg-emerald-400/90 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
            </div>
            <div className="flex w-32 justify-between border-b-2 border-dashed border-emerald-400/70 pb-0.5 font-mono text-[9px] text-emerald-300">
              <span>-10</span>
              <span>-10</span>
            </div>
          </div>

          {/* Fixed Aircraft Flight Path Vector Reticle */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="64" height="36" viewBox="0 0 64 36" fill="none">
              <circle cx="32" cy="18" r="6" stroke="#34d399" strokeWidth="2" />
              <line x1="8" y1="18" x2="26" y2="18" stroke="#34d399" strokeWidth="2" />
              <line x1="38" y1="18" x2="56" y2="18" stroke="#34d399" strokeWidth="2" />
              <line x1="32" y1="4" x2="32" y2="12" stroke="#34d399" strokeWidth="2" />
            </svg>
          </div>

          {/* Cockpit Glareshield Dashboard */}
          <div className="absolute inset-x-0 bottom-0 flex h-24 items-end justify-center bg-gradient-to-t from-slate-950/90 via-slate-950/50 to-transparent pb-3">
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-400/40 bg-slate-950/85 px-5 py-2 font-mono text-xs text-emerald-300 shadow-[0_0_24px_rgba(16,185,129,0.25)] backdrop-blur-md">
              <span>COCKPIT HUD · ST. LOUIS 3D FLIGHT DECK</span>
              <span className="text-slate-600">|</span>
              <span className="text-[11px] text-sky-300">3D ALTITUDE LOCK ACTIVE</span>
            </div>
          </div>
        </div>
      )}

      <p className="pointer-events-auto absolute right-3 top-3 z-[4] max-w-[min(34rem,calc(100%-1.5rem))] rounded-lg bg-white/80 px-2.5 py-1.5 text-[10px] text-slate-600 shadow-sm backdrop-blur-sm">
        Employer sites: <a className="underline" href="https://www.stlouis-mo.gov/data/" target="_blank" rel="noreferrer">St. Louis open data</a>
        {" · "}<a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors (ODbL)</a>
      </p>

      {popup && (
        <div
          className="absolute z-30 flex w-80 flex-col rounded-3xl border border-white/50 bg-white/95 p-4 shadow-2xl backdrop-blur-2xl"
          style={{
            left: Math.max(16, Math.min(containerWidth - 336, popup.point.x - 160)),
            top: placeBelow
              ? Math.min(containerHeight - 120, popup.point.y + 16)
              : popup.point.y - 72,
            transform: placeBelow ? undefined : "translateY(-100%)",
          }}
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-200/70 pb-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold text-white"
                style={{ background: `hsl(${hueFor(popup.place.company)} 65% 45%)` }}
              >
                {popup.place.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={popup.place.logo}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="size-full bg-white object-contain p-1"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  popup.place.company.slice(0, 1).toUpperCase()
                )}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{popup.place.company}</p>
                <p className="flex items-center gap-1 truncate text-xs text-slate-500">
                  <MapPin className="size-3 shrink-0" />
                  {popup.place.jobs[0]?.location_label}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCompanyPopup(null)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close company jobs"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="flex items-center justify-between pt-2.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              {jobsLabel(popup.place.jobs.length)} here
            </p>
            <button
              type="button"
              onClick={toggleFlying}
              className="rounded-lg bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-700 hover:bg-emerald-500/25"
            >
              Resume Flight (Space)
            </button>
          </div>
          <ul className="job-scrollbar mt-1.5 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-0.5">
            {popup.place.jobs.map((job) => (
              <li key={job.id}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectRef.current(job)}
                  onKeyDown={(e) => e.key === "Enter" && onSelectRef.current(job)}
                  className={`group flex cursor-pointer items-center gap-2 rounded-2xl border p-2.5 transition ${
                    job.id === selectedJobId
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900">{job.title}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      {[job.jobFunction, job.workType, job.salary].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <a
                    href={getJobApplicationLink(job)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700"
                  >
                    Apply
                    <ExternalLink className="size-3" />
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <MapControls
        onHold={hold}
        onResetNorth={resetNorth}
        onToggle3D={toggle3D}
        onCameraViewChange={setFlightCameraView}
        cameraView={flightView}
        visionMode={visionMode}
        onVisionModeChange={setVisionMode}
        is3D={is3D}
        isFlying={isFlying}
        onToggleFlying={toggleFlying}
        throttle={throttle}
        onThrottleChange={(level) => {
          throttleRef.current = level;
          setThrottle(level);
          ensureLoopRunning();
        }}
        onChangeStartLocation={onChangeStartLocation}
        compassRef={compassRef}
      />
    </div>
  );
}
