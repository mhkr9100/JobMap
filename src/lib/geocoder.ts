const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
const STL_BBOX = "-91.14,37.904,-89.26,39.35";
const STL_PROXIMITY = "-90.1994,38.627";

export interface GeocodeResult {
  coords: [number, number];
  isCityOnly: boolean;
  label: string;
}

export async function geocodeStartingLocation(query: string): Promise<GeocodeResult | null> {
  const trimmed = query.trim();
  if (!trimmed) return null;

  // 1. Try Mapbox Geocoding v5 bounded to the 50-mile St. Louis launch region
  if (MAPBOX_TOKEN) {
    try {
      const params = new URLSearchParams({
        access_token: MAPBOX_TOKEN,
        bbox: STL_BBOX,
        proximity: STL_PROXIMITY,
        country: "us",
        limit: "1",
      });
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json?${params}`
      );
      if (response.ok) {
        const data = (await response.json()) as {
          features?: Array<{
            center?: [number, number];
            place_name?: string;
            place_type?: string[];
          }>;
        };
        const feature = data.features?.[0];
        if (feature?.center) {
          const types = feature.place_type ?? [];
          const isCityOnly =
            !(/\b\d{1,6}\b/.test(trimmed)) &&
            types.some((t) => t === "place" || t === "locality" || t === "region" || t === "district" || t === "postcode");
          return {
            coords: feature.center,
            isCityOnly,
            label: feature.place_name ?? trimmed,
          };
        }
      }
    } catch (error) {
      console.error("Mapbox v5 geocoding error:", error);
    }
  }

  // 2. Fallback to ArcGIS World Geocoder bounded to St. Louis 50-mile extent (handles schools, companies, addresses, cities)
  try {
    const arcParams = new URLSearchParams({
      SingleLine: trimmed,
      searchExtent: STL_BBOX,
      location: STL_PROXIMITY,
      outFields: "PlaceName,Place_addr,Addr_type,Type",
      maxLocations: "1",
      f: "json",
    });
    const response = await fetch(
      `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?${arcParams}`
    );
    if (response.ok) {
      const data = (await response.json()) as {
        candidates?: Array<{
          address?: string;
          location?: { x: number; y: number };
          attributes?: { Addr_type?: string; PlaceName?: string; Place_addr?: string };
        }>;
      };
      const cand = data.candidates?.[0];
      if (cand?.location && typeof cand.location.x === "number" && typeof cand.location.y === "number") {
        const addrType = cand.attributes?.Addr_type ?? "";
        const isCityOnly =
          !(/\b\d{1,6}\b/.test(trimmed)) &&
          (addrType === "Locality" || addrType === "Postal" || addrType === "Admin");
        return {
          coords: [cand.location.x, cand.location.y],
          isCityOnly,
          label: cand.attributes?.PlaceName || cand.attributes?.Place_addr || cand.address || trimmed,
        };
      }
    }
  } catch (error) {
    console.error("ArcGIS geocoding error:", error);
  }

  return null;
}

export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  const result = await geocodeStartingLocation(address);
  return result ? result.coords : null;
}

export async function reverseGeocode(coords: [number, number]): Promise<string | null> {
  try {
    const [lng, lat] = coords;
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ place_name?: string }> };
    const feature = data.features?.[0];
    return feature?.place_name ?? null;
  } catch (error) {
    console.error("Reverse geocoding error:", error);
  }
  return null;
}
