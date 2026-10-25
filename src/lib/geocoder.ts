
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;

export async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ center?: [number, number] }> };
    const feature = data.features?.[0];
    if (feature && feature.center) {
      return feature.center as [number, number];
    }
  } catch (error) {
    console.error('Geocoding error:', error);
  }
  return null;
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
    console.error('Reverse geocoding error:', error);
  }
  return null;
}
