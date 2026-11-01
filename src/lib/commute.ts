import type { Feature, Polygon, Position } from "geojson";
import type { CommuteProfile, Job, JobViewport } from "@/types";

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? "";

interface IsochroneResponse {
  features?: Feature<Polygon>[];
}

export async function getCommuteArea(
  origin: [number, number],
  minutes: number,
  profile: CommuteProfile,
  signal?: AbortSignal,
): Promise<Feature<Polygon>> {
  if (!MAPBOX_TOKEN) throw new Error("Mapbox token is unavailable for commute estimates.");

  const params = new URLSearchParams({
    contours_minutes: String(minutes),
    polygons: "true",
    denoise: "1",
    generalize: "100",
    access_token: MAPBOX_TOKEN,
  });
  const coordinates = `${origin[0]},${origin[1]}`;
  const response = await fetch(
    `https://api.mapbox.com/isochrone/v1/mapbox/${profile}/${coordinates}?${params}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Commute area request failed (${response.status}).`);
  }

  const data = (await response.json()) as IsochroneResponse;
  const area = data.features?.[0];
  if (!area || area.geometry.type !== "Polygon") {
    throw new Error("No commute area was returned for this location.");
  }
  return area;
}

export function getCommuteBounds(area: Feature<Polygon>): JobViewport {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const ring of area.geometry.coordinates) {
    for (const [lng, lat] of ring) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }
  return { minLng, minLat, maxLng, maxLat };
}

function ringContains(point: [number, number], ring: Position[]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function isJobInCommuteArea(job: Job, area: Feature<Polygon>): boolean {
  const rings = area.geometry.coordinates;
  if (rings.length === 0 || !ringContains(job.coords, rings[0])) return false;
  return !rings.slice(1).some((hole) => ringContains(job.coords, hole));
}
