"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Building2, ExternalLink, X } from "lucide-react";
import type { Job, JobViewport } from "@/types";
import { getJobApplicationLink } from "@/lib/jobs";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

interface MapViewProps {
  jobs: Job[];
  selectedJobId: string | null;
  onSelectJob: (job: Job) => void;
  onViewportChange?: (viewport: JobViewport) => void;
  onVisibleCountChange?: (count: number) => void;
  targetLocation?: [number, number] | null;
}

interface ClusterPopupState {
  coords: [number, number];
  jobs: Job[];
  point: { x: number; y: number };
}

type JobPointFeature = {
  type: "Feature";
  properties: { id: string };
  geometry: { type: "Point"; coordinates: [number, number] };
};

type JobsGeoJSON = {
  type: "FeatureCollection";
  features: JobPointFeature[];
};

type ClusterFeature = {
  properties?: { cluster_id?: number };
  geometry: { type: string; coordinates: [number, number] };
};

function jobsToGeoJSON(jobs: Job[]): JobsGeoJSON {
  return {
    type: "FeatureCollection",
    features: jobs
      .filter(
        (job) =>
          job.coords &&
          typeof job.coords[0] === "number" &&
          typeof job.coords[1] === "number",
      )
      .map((job) => ({
        type: "Feature",
        properties: { id: job.id },
        geometry: {
          type: "Point",
          coordinates: [job.coords[0], job.coords[1]],
        },
      })),
  };
}

function selectedPinPaint(selectedJobId: string | null) {
  return {
    "circle-color": [
      "case",
      ["==", ["get", "id"], selectedJobId ?? ""],
      "#0f172a",
      "#ef4444",
    ] as mapboxgl.ExpressionSpecification,
    "circle-radius": [
      "case",
      ["==", ["get", "id"], selectedJobId ?? ""],
      11,
      8,
    ] as mapboxgl.ExpressionSpecification,
    "circle-stroke-width": 2,
    "circle-stroke-color": "#fff",
  };
}

export default function MapView({
  jobs,
  selectedJobId,
  onSelectJob,
  onViewportChange,
  onVisibleCountChange,
  targetLocation,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const jobsRef = useRef(jobs);
  const onSelectRef = useRef(onSelectJob);
  const onViewportChangeRef = useRef(onViewportChange);
  const onVisibleCountChangeRef = useRef(onVisibleCountChange);
  const selectedIdRef = useRef(selectedJobId);
  const sourceReady = useRef(false);
  const [clusterPopup, setClusterPopup] = useState<ClusterPopupState | null>(null);

  jobsRef.current = jobs;
  onSelectRef.current = onSelectJob;
  onViewportChangeRef.current = onViewportChange;
  onVisibleCountChangeRef.current = onVisibleCountChange;
  selectedIdRef.current = selectedJobId;

  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const instance = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/standard",
      center: [-90.1994, 38.627],
      zoom: 12.5,
      pitch: 65,
      bearing: -18,
      antialias: true,
    });
    map.current = instance;

    instance.on("load", () => {
      try {
        const layers = instance.getStyle().layers;
        const labelLayerId = layers?.find(
          (layer) => layer.type === "symbol" && layer.layout?.["text-field"],
        )?.id;

        if (!instance.getLayer("3d-buildings")) {
          instance.addLayer(
            {
              id: "3d-buildings",
              source: "composite",
              "source-layer": "building",
              filter: ["==", "extrude", "true"],
              type: "fill-extrusion",
              minzoom: 12,
              paint: {
                "fill-extrusion-color": [
                  "interpolate",
                  ["linear"],
                  ["coalesce", ["get", "height"], 0],
                  0,
                  "#cbd5e1",
                  50,
                  "#b0bec5",
                  150,
                  "#90a4ae",
                ],
                "fill-extrusion-height": [
                  "interpolate",
                  ["linear"],
                  ["zoom"],
                  12,
                  ["*", ["coalesce", ["get", "height"], 24], 1.15],
                  15,
                  ["*", ["coalesce", ["get", "height"], 24], 1.4],
                ],
                "fill-extrusion-base": ["coalesce", ["get", "min_height"], 0],
                "fill-extrusion-opacity": 0.92,
                "fill-extrusion-vertical-gradient": true,
              },
            },
            labelLayerId,
          );
        } else {
          try {
            instance.setLayerZoomRange("3d-buildings", 12, 24);
            instance.setPaintProperty(
              "3d-buildings",
              "fill-extrusion-opacity",
              0.92,
            );
          } catch {
            // Ignore if setting zoom range fails
          }
        }
      } catch {
        // Standard style may already include 3D buildings.
      }

      instance.addSource("jobs", {
        type: "geojson",
        data: jobsToGeoJSON(jobsRef.current),
        cluster: true,
        clusterMaxZoom: 14,
        clusterRadius: 50,
      });

      instance.addLayer({
        id: "clusters",
        type: "circle",
        source: "jobs",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": "#3b82f6",
          "circle-radius": ["step", ["get", "point_count"], 20, 100, 30, 750, 40],
          "circle-stroke-width": 3,
          "circle-stroke-color": "#fff",
        },
      });

      instance.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "jobs",
        filter: ["has", "point_count"],
        layout: {
          "text-field": "{point_count_abbreviated}",
          "text-font": ["Open Sans Bold"],
          "text-size": 12,
        },
        paint: { "text-color": "#fff" },
      });

      instance.addLayer({
        id: "unclustered-point",
        type: "circle",
        source: "jobs",
        filter: ["!", ["has", "point_count"]],
        paint: selectedPinPaint(selectedIdRef.current),
      });

      sourceReady.current = true;

      if (selectedIdRef.current) {
        const initialJob = jobsRef.current.find(
          (item) => item.id === selectedIdRef.current,
        );
        if (
          initialJob &&
          initialJob.coords &&
          initialJob.coords[0] != null &&
          initialJob.coords[1] != null
        ) {
          instance.flyTo({
            center: [initialJob.coords[0], initialJob.coords[1]],
            zoom: 16,
            pitch: 65,
            bearing: -18,
            duration: 1600,
            essential: true,
          });
        }
      }

      instance.on("click", "clusters", (event) => {
        const features = instance.queryRenderedFeatures(event.point, {
          layers: ["clusters"],
        }) as unknown as ClusterFeature[];
        const feature = features[0];
        if (!feature || feature.geometry.type !== "Point") return;

        const clusterId = feature.properties?.cluster_id;
        if (clusterId == null) return;

        const source = instance.getSource("jobs") as mapboxgl.GeoJSONSource | undefined;
        if (!source || typeof source.getClusterLeaves !== "function") return;

        source.getClusterLeaves(clusterId, 50, 0, (error, leaves) => {
          let clusterJobs: Job[] = [];
          if (!error && leaves && leaves.length > 0) {
            const ids = new Set(leaves.map((leaf) => String(leaf.properties?.id)));
            clusterJobs = jobsRef.current.filter((job) => ids.has(job.id));
          }

          if (clusterJobs.length === 0) {
            const [clng, clat] = feature.geometry.coordinates;
            clusterJobs = jobsRef.current.filter(
              (job) =>
                Math.abs(job.coords[0] - clng) < 0.35 &&
                Math.abs(job.coords[1] - clat) < 0.35,
            );
          }

          if (clusterJobs.length > 0) {
            setClusterPopup({
              coords: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
              jobs: clusterJobs,
              point: { x: event.point.x, y: event.point.y },
            });
          }
        });
      });

      instance.on("click", (event) => {
        const hits = instance.queryRenderedFeatures(event.point, {
          layers: ["clusters", "unclustered-point"].filter((id) =>
            Boolean(instance.getLayer(id)),
          ),
        });
        if (hits.length === 0) {
          setClusterPopup(null);
        }
      });

      instance.on(
        "click",
        "unclustered-point",
        (event: mapboxgl.MapLayerMouseEvent) => {
          const feature = event.features?.[0] as
            | { properties?: { id?: string | number } }
            | undefined;
          const id = feature?.properties?.id;
          if (id == null) return;
          const job = jobsRef.current.find((item) => item.id === String(id));
          if (job) onSelectRef.current(job);
        },
      );

      instance.on("mouseenter", "clusters", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "clusters", () => {
        instance.getCanvas().style.cursor = "";
      });
      instance.on("mouseenter", "unclustered-point", () => {
        instance.getCanvas().style.cursor = "pointer";
      });
      instance.on("mouseleave", "unclustered-point", () => {
        instance.getCanvas().style.cursor = "";
      });

      const reportViewport = () => {
        const bounds = instance.getBounds();
        onViewportChangeRef.current?.({
          minLng: bounds.getWest(),
          minLat: bounds.getSouth(),
          maxLng: bounds.getEast(),
          maxLat: bounds.getNorth(),
        });
      };
      instance.on("moveend", reportViewport);
      reportViewport();
    });

    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(mapContainer.current);

    return () => {
      observer.disconnect();
      sourceReady.current = false;
      instance.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    onVisibleCountChangeRef.current?.(jobs.length);
  }, [jobs.length]);

  useEffect(() => {
    if (!map.current || !targetLocation) return;
    map.current.flyTo({
      center: targetLocation,
      zoom: 14,
      pitch: 65,
      bearing: -18,
      duration: 1400,
      essential: true,
    });
  }, [targetLocation]);

  useEffect(() => {
    if (!map.current || !sourceReady.current) return;
    const source = map.current.getSource("jobs") as mapboxgl.GeoJSONSource | undefined;
    source?.setData(jobsToGeoJSON(jobs));
  }, [jobs]);

  useEffect(() => {
    if (!map.current || !sourceReady.current) return;
    if (map.current.getLayer("unclustered-point")) {
      const paint = selectedPinPaint(selectedJobId);
      map.current.setPaintProperty(
        "unclustered-point",
        "circle-color",
        paint["circle-color"],
      );
      map.current.setPaintProperty(
        "unclustered-point",
        "circle-radius",
        paint["circle-radius"],
      );
    }

    if (!selectedJobId) return;

    const job = jobsRef.current.find((item) => item.id === selectedJobId);
    if (!job || !job.coords || job.coords[0] == null || job.coords[1] == null) return;

    map.current.flyTo({
      center: [job.coords[0], job.coords[1]],
      zoom: 16,
      pitch: 65,
      bearing: -18,
      duration: 1600,
      essential: true,
    });
  }, [selectedJobId]);

  useEffect(() => {
    if (!map.current) return;
    const instance = map.current;
    const handleMove = () => {
      setClusterPopup((current) => {
        if (!current || !map.current) return null;
        const pt = map.current.project(current.coords);
        return { ...current, point: { x: pt.x, y: pt.y } };
      });
    };

    instance.on("move", handleMove);
    return () => {
      instance.off("move", handleMove);
    };
  }, []);

  function handleClusterJobClick(job: Job) {
    setClusterPopup(null);
    onSelectRef.current(job);

    map.current?.flyTo({
      center: [job.coords[0], job.coords[1]],
      zoom: 16.5,
      pitch: 65,
      bearing: -18,
      duration: 1600,
      essential: true,
    });

    const url = getJobApplicationLink(job);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-900">
      <div ref={mapContainer} className="h-full w-full" />
      {clusterPopup && (
        <div
          className="absolute z-30 flex max-h-84 w-80 flex-col gap-2.5 rounded-3xl border border-border/70 bg-card/95 p-4 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150"
          style={{
            left: Math.max(
              16,
              Math.min(
                (mapContainer.current?.clientWidth ?? 400) - 336,
                clusterPopup.point.x - 160,
              ),
            ),
            top: Math.max(
              16,
              Math.min(
                (mapContainer.current?.clientHeight ?? 400) - 340,
                clusterPopup.point.y + 16,
              ),
            ),
          }}
        >
          <div className="flex items-center justify-between border-b border-border/50 pb-2">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Building2 className="size-4" />
              </span>
              <div>
                <p className="text-xs font-semibold leading-tight text-foreground">
                  {clusterPopup.jobs.length} Opportunities
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {clusterPopup.jobs[0]?.location_label || "Selected location"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setClusterPopup(null)}
              className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Close popup"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="job-scrollbar flex max-h-56 flex-col gap-2 overflow-y-auto pr-0.5">
            {clusterPopup.jobs.map((job) => (
              <button
                key={job.id}
                type="button"
                onClick={() => handleClusterJobClick(job)}
                className="group flex w-full flex-col gap-1.5 rounded-2xl border border-border/60 bg-background/60 p-2.5 text-left transition hover:border-primary/50 hover:bg-accent/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary">
                    {job.title}
                  </span>
                  <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-60 transition group-hover:opacity-100 group-hover:text-primary" />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground/85">{job.company}</span>
                  <span className="rounded-md bg-secondary/80 px-1.5 py-0.5 font-medium">{job.workType}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
