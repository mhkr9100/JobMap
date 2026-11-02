import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Local world frame used by the whole game:
 *   +X = east, +Y = up, -Z = north (metres), origin = Gateway Arch, St. Louis.
 */
export const ORIGIN = { lat: 38.6247, lon: -90.1848 };
/** Approx. ellipsoid height of the Mississippi riverfront (orthometric ~130 m, geoid ~ -31 m). */
const ORIGIN_ELLIPSOID_HEIGHT = 100;
const M_PER_DEG_LAT = 110_540;
const M_PER_DEG_LON = 111_320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function toLocal(lat: number, lon: number): { x: number; z: number } {
  return { x: (lon - ORIGIN.lon) * M_PER_DEG_LON, z: -(lat - ORIGIN.lat) * M_PER_DEG_LAT };
}

export function fromLocal(x: number, z: number): { lat: number; lon: number } {
  return { lat: ORIGIN.lat - z / M_PER_DEG_LAT, lon: ORIGIN.lon + x / M_PER_DEG_LON };
}

export interface World {
  /** Human readable map source, e.g. "Google Photorealistic 3D". */
  label: string;
  attribution: string;
  object: THREE.Object3D;
  /** Meshes that the plane can crash into (raycast targets). */
  colliders: THREE.Object3D[];
  /** Height of flat ground when nothing else is hit. */
  baseGround: number | null;
  update(camera: THREE.PerspectiveCamera, renderer: THREE.WebGLRenderer, focus: THREE.Vector3): void;
  dispose(): void;
}

// ---------------------------------------------------------------------------
// Google Photorealistic 3D Tiles (same data source as worldflightsim.com)
// ---------------------------------------------------------------------------

export async function createGoogleWorld(
  apiKey: string,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): Promise<World> {
  const { TilesRenderer } = await import("3d-tiles-renderer");
  const { GoogleCloudAuthPlugin, ReorientationPlugin, TilesFadePlugin, GLTFExtensionsPlugin, TileCompressionPlugin } =
    await import("3d-tiles-renderer/plugins");
  const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");

  const draco = new DRACOLoader().setDecoderPath("https://www.gstatic.com/draco/versioned/decoders/1.5.7/");
  const tiles = new TilesRenderer();
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey, autoRefreshToken: true }));
  tiles.registerPlugin(new GLTFExtensionsPlugin({ dracoLoader: draco }));
  tiles.registerPlugin(new TileCompressionPlugin());
  tiles.registerPlugin(new TilesFadePlugin());
  tiles.registerPlugin(
    new ReorientationPlugin({
      lat: (ORIGIN.lat * Math.PI) / 180,
      lon: (ORIGIN.lon * Math.PI) / 180,
      height: ORIGIN_ELLIPSOID_HEIGHT,
      recenter: true,
    }),
  );
  tiles.errorTarget = 12;
  tiles.setCamera(camera);
  tiles.setResolutionFromRenderer(camera, renderer);

  // The reorientation plugin yields +X west / +Z north; rotate 180° to get +X east / -Z north.
  const holder = new THREE.Group();
  holder.rotation.y = Math.PI;
  holder.add(tiles.group);

  return {
    label: "Google Photorealistic 3D",
    attribution: "Map data © Google",
    object: holder,
    colliders: [tiles.group],
    baseGround: null,
    update(cam, r) {
      tiles.setResolutionFromRenderer(cam, r);
      cam.updateMatrixWorld();
      tiles.update();
    },
    dispose() {
      tiles.dispose();
      draco.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// Fallback: Mapbox satellite imagery ground + OpenStreetMap 3D buildings
// ---------------------------------------------------------------------------

const lon2tile = (lon: number, z: number) => ((lon + 180) / 360) * 2 ** z;
const lat2tile = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
};
const tile2lon = (x: number, z: number) => (x / 2 ** z) * 360 - 180;
const tile2lat = (y: number, z: number) => {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

interface TileLayer {
  zoom: number;
  radius: number;
  y: number;
  tiles: Map<string, THREE.Mesh>;
  centerKey: string;
}

export function createSatelliteWorld(mapboxToken: string, renderer: THREE.WebGLRenderer): World {
  const root = new THREE.Group();
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const anisotropy = renderer.capabilities.getMaxAnisotropy();

  const layers: TileLayer[] = [
    { zoom: 12, radius: 2, y: -1.2, tiles: new Map(), centerKey: "" },
    { zoom: 14, radius: 3, y: -0.6, tiles: new Map(), centerKey: "" },
    { zoom: 16, radius: 4, y: 0, tiles: new Map(), centerKey: "" },
  ];

  const makeTile = (z: number, x: number, y: number, height: number) => {
    const west = tile2lon(x, z);
    const east = tile2lon(x + 1, z);
    const north = tile2lat(y, z);
    const south = tile2lat(y + 1, z);
    const nw = toLocal(north, west);
    const se = toLocal(south, east);
    const w = se.x - nw.x;
    const d = se.z - nw.z;
    const geo = new THREE.PlaneGeometry(w, d);
    geo.rotateX(-Math.PI / 2);
    const material = new THREE.MeshLambertMaterial({ color: 0x6b7f5a });
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(nw.x + w / 2, height, nw.z + d / 2);
    mesh.receiveShadow = true;
    const url = `https://api.mapbox.com/v4/mapbox.satellite/${z}/${x}/${y}@2x.jpg90?access_token=${mapboxToken}`;
    loader.load(url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = anisotropy;
      material.map = texture;
      material.color.set(0xffffff);
      material.needsUpdate = true;
    });
    return mesh;
  };

  const disposeTile = (mesh: THREE.Mesh) => {
    root.remove(mesh);
    mesh.geometry.dispose();
    const m = mesh.material as THREE.MeshLambertMaterial;
    m.map?.dispose();
    m.dispose();
  };

  const updateLayer = (layer: TileLayer, focus: THREE.Vector3) => {
    const { lat, lon } = fromLocal(focus.x, focus.z);
    const cx = Math.floor(lon2tile(lon, layer.zoom));
    const cy = Math.floor(lat2tile(lat, layer.zoom));
    const key = `${cx}/${cy}`;
    if (key === layer.centerKey) return;
    layer.centerKey = key;
    const wanted = new Set<string>();
    for (let dx = -layer.radius; dx <= layer.radius; dx++) {
      for (let dy = -layer.radius; dy <= layer.radius; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        const k = `${x}/${y}`;
        wanted.add(k);
        if (!layer.tiles.has(k)) {
          const mesh = makeTile(layer.zoom, x, y, layer.y);
          layer.tiles.set(k, mesh);
          root.add(mesh);
        }
      }
    }
    for (const [k, mesh] of layer.tiles) {
      if (!wanted.has(k)) {
        disposeTile(mesh);
        layer.tiles.delete(k);
      }
    }
  };

  // ---- OpenStreetMap buildings around downtown (extruded, merged) ----
  const buildings = new THREE.Group();
  root.add(buildings);
  const buildingMaterial = new THREE.MeshLambertMaterial({ color: 0xe7e5e4, flatShading: true });
  const abort = new AbortController();
  void loadOsmBuildings(abort.signal)
    .then((geos) => {
      for (const g of geos) {
        const mesh = new THREE.Mesh(g, buildingMaterial);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        buildings.add(mesh);
      }
    })
    .catch(() => {
      /* buildings are optional decoration */
    });

  return {
    label: "Mapbox satellite + OSM buildings",
    attribution: "Imagery © Mapbox · Buildings © OpenStreetMap contributors",
    object: root,
    colliders: [buildings],
    baseGround: 0,
    update(_camera, _renderer, focus) {
      for (const layer of layers) updateLayer(layer, focus);
    },
    dispose() {
      abort.abort();
      for (const layer of layers) for (const mesh of layer.tiles.values()) disposeTile(mesh);
      buildings.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
      buildingMaterial.dispose();
    },
  };
}

interface OverpassWay {
  type: string;
  tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[];
}

async function loadOsmBuildings(signal: AbortSignal): Promise<THREE.BufferGeometry[]> {
  // ~3 km around the Arch covers downtown, the riverfront and Midtown edge.
  const dLat = 3000 / M_PER_DEG_LAT;
  const dLon = 4500 / M_PER_DEG_LON;
  const bbox = `${ORIGIN.lat - dLat},${ORIGIN.lon - dLon - 0.01},${ORIGIN.lat + dLat},${ORIGIN.lon + dLon * 0.4}`;
  const query = `[out:json][timeout:25];way["building"](${bbox});out geom;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: new URLSearchParams({ data: query }),
    signal,
  });
  if (!res.ok) throw new Error(`overpass ${res.status}`);
  const data = (await res.json()) as { elements: OverpassWay[] };

  const batch: THREE.BufferGeometry[] = [];
  const merged: THREE.BufferGeometry[] = [];
  const flush = () => {
    if (!batch.length) return;
    const m = mergeGeometries(batch, false);
    batch.forEach((g) => g.dispose());
    batch.length = 0;
    if (m) merged.push(m);
  };

  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 4) continue;
    const tags = el.tags ?? {};
    const levels = parseFloat(tags["building:levels"] ?? "");
    let height = parseFloat(tags.height ?? "");
    if (!Number.isFinite(height)) height = Number.isFinite(levels) ? levels * 3.4 : 9;
    height = Math.max(4, Math.min(height, 260));

    const shape = new THREE.Shape();
    el.geometry.forEach((p, i) => {
      const { x, z } = toLocal(p.lat, p.lon);
      // Shape lives in the XY plane: x = east, y = north (= -z).
      if (i === 0) shape.moveTo(x, -z);
      else shape.lineTo(x, -z);
    });
    const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    geo.rotateX(-Math.PI / 2);
    batch.push(geo);
    if (batch.length >= 400) flush();
  }
  flush();
  return merged;
}
