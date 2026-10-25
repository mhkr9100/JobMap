import type { LngLatBounds } from "mapbox-gl";

const POSTGIS_POINT_PATTERN =
  /^\s*POINT\s*\(\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*\)\s*$/i;

/** Convert a PostGIS WKT POINT into a Mapbox [longitude, latitude] tuple. */
export function parsePostGISPoint(pointStr: string): [number, number] {
  const match = POSTGIS_POINT_PATTERN.exec(pointStr);

  if (!match) {
    throw new TypeError(`Invalid PostGIS POINT: ${pointStr}`);
  }

  const longitude = Number(match[1]);
  const latitude = Number(match[2]);

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    throw new RangeError(`PostGIS POINT is outside valid coordinate bounds: ${pointStr}`);
  }

  return [longitude, latitude];
}

/** Build a PostGIS envelope from Mapbox bounds in longitude/latitude order. */
export function buildBoundingBoxQuery(bounds: LngLatBounds): string {
  const southWest = bounds.getSouthWest();
  const northEast = bounds.getNorthEast();

  return `ST_MakeEnvelope(${southWest.lng}, ${southWest.lat}, ${northEast.lng}, ${northEast.lat}, 4326)`;
}
