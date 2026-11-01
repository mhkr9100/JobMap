"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import type { Feature, FeatureCollection, Point, Polygon } from "geojson";
import { ExternalLink, MapPin, X } from "lucide-react";
import type { Job, JobViewport, MapTarget } from "@/types";
import { companyLogoUrl, getJobApplicationLink } from "@/lib/jobs";
import MapControls, { type CameraAction, type FlightCameraView } from "@/components/jobmap/map-controls";

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
  const aircraftRef = useRef<HTMLSpanElement | null>(null);
  const [flightView, setFlightView] = useState<FlightCameraView>("chase-close");
  const [companyPopup, setCompanyPopup] = useState<CompanyPopupState | null>(null);
  const [is3D, setIs3D] = useState(true);
  const [isMapLoaded, setIsMapLoaded] = useState(false);

  onSelectRef.current = onSelectJob;
  onViewportChangeRef.current = onViewportChange;
  onVisibleCountChangeRef.current = onVisibleCountChange;
  onHighlightVisibleReadyRef.current = onHighlightVisibleReady;
  highlightedJobIdRef.current = highlightedJobId;

  const openCompany = useCallback((place: CompanyPlace) => {
    const m = map.current;
    if (!m) return;
    m.easeTo({
      center: place.coords,
      zoom: Math.min(MAX_FLIGHT_ZOOM, Math.max(m.getZoom(), 17)),
      pitch: DEFAULT_PITCH,
      duration: 850,
      essential: true,
    });
    const pt = m.project(place.coords);
    setCompanyPopup({ place, point: { x: pt.x, y: pt.y } });
  }, []);

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

  // ---- Continuous camera loop (keyboard + on-screen pad) ----
  const step = useCallback(() => {
    const m = map.current;
    const keys = keysRef.current;
    if (!m || keys.size === 0) {
      rafRef.current = null;
      return;
    }
    const fast = fastRef.current ? 2.5 : 1;
    const pan = 10 * fast;
    let dx = 0;
    let dy = 0;
    if (keys.has("forward")) dy -= pan;
    if (keys.has("back")) dy += pan;
    if (keys.has("left")) dx -= pan;
    if (keys.has("right")) dx += pan;

    let bearing = m.getBearing();
    if (keys.has("rotateLeft")) bearing -= 2 * fast;
    if (keys.has("rotateRight")) bearing += 2 * fast;

    let pitch = m.getPitch();
    if (keys.has("tiltUp")) pitch += 1.2;
    if (keys.has("tiltDown")) pitch -= 1.2;
    pitch = Math.max(0, Math.min(MAX_PITCH, pitch));

    let zoom = m.getZoom();
    if (keys.has("zoomIn")) zoom += 0.035 * fast;
    if (keys.has("zoomOut")) zoom -= 0.035 * fast;
    zoom = Math.max(MIN_FLIGHT_ZOOM, Math.min(MAX_FLIGHT_ZOOM, zoom));

    let center = m.getCenter();
    if (dx || dy) {
      const c = m.project(center);
      center = m.unproject([c.x + dx, c.y + dy]);
    }
    m.jumpTo({ center, bearing, pitch, zoom });
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const hold = useCallback(
    (action: CameraAction, active: boolean) => {
      if (active) keysRef.current.add(action);
      else keysRef.current.delete(action);
      if (keysRef.current.size > 0 && rafRef.current == null) {
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [step],
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
  }, [hold, resetNorth]);

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
      map.current.flyTo({
        center: selectedPlace.coords,
      zoom: Math.min(MAX_FLIGHT_ZOOM, Math.max(map.current.getZoom(), 17)),
        pitch: DEFAULT_PITCH,
        duration: 1400,
        essential: true,
      });
    }
  }, [selectedJobId]);

  // ---- Location search target ----
  useEffect(() => {
    const m = map.current;
    if (!m || !isMapLoaded || !target) return;
    setCompanyPopup(null);
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
  }, [target, isMapLoaded]);

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
      <div ref={mapContainer} className="h-full w-full overflow-clip" />

      {flightView !== "cockpit" && (
        <div
          className={`pointer-events-none absolute left-1/2 z-[5] flex -translate-x-1/2 items-center justify-center ${flightView === "chase-close" ? "bottom-[22%]" : "bottom-[18%]"}`}
          aria-hidden="true"
        >
          <span
            ref={aircraftRef}
            className="text-3xl text-slate-900 drop-shadow-[0_2px_4px_rgba(255,255,255,0.95)]"
            style={{ transform: "translate(-50%, -50%) rotate(-45deg)" }}
          >✈</span>
        </div>
      )}
      {flightView === "cockpit" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[4] flex h-24 items-end justify-center bg-gradient-to-t from-slate-950/45 to-transparent pb-3">
          <div className="rounded-full border border-white/35 bg-slate-950/55 px-4 py-1.5 font-mono text-[10px] tracking-[0.18em] text-white shadow-lg backdrop-blur-sm">COCKPIT HUD · ST. LOUIS</div>
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
          <p className="pt-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {jobsLabel(popup.place.jobs.length)} here
          </p>
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
        is3D={is3D}
        compassRef={compassRef}
      />
    </div>
  );
}
