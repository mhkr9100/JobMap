import * as THREE from "three";

/**
 * Low-poly propeller plane in the spirit of fly.pieter.com.
 * Model space: nose points to -Z, up is +Y, right wing is +X.
 * Roughly 9 m long with a 11 m wingspan.
 */
export interface PlaneModel {
  root: THREE.Group;
  propeller: THREE.Object3D;
  dispose: () => void;
}

export function createPlane(color = 0xe11d48): PlaneModel {
  const root = new THREE.Group();
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const mat = (c: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const m = new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.55, metalness: 0.1, ...opts });
    materials.push(m);
    return m;
  };
  const box = (w: number, h: number, d: number, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    geometries.push(g);
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    root.add(mesh);
    return mesh;
  };

  const body = mat(color);
  const white = mat(0xf8fafc);
  const dark = mat(0x1e293b);
  const glass = mat(0x7dd3fc, { metalness: 0.4, roughness: 0.1, transparent: true, opacity: 0.85 });

  // Fuselage (tapered with a nose block and tail boom)
  box(1.3, 1.3, 4.2, body, 0, 0, -0.6);
  box(1.0, 1.0, 1.0, white, 0, 0, -3.2);
  box(0.8, 0.8, 3.4, body, 0, 0.15, 3.0);
  // Cockpit canopy
  box(0.95, 0.6, 1.5, glass, 0, 0.9, -0.9);
  // Main wing + stripes
  box(11, 0.18, 1.7, white, 0, 0.35, -0.9);
  box(1.2, 0.2, 1.72, body, 4.6, 0.36, -0.9);
  box(1.2, 0.2, 1.72, body, -4.6, 0.36, -0.9);
  // Horizontal tail
  box(3.8, 0.14, 1.0, white, 0, 0.25, 4.3);
  // Vertical tail
  box(0.14, 1.5, 1.2, body, 0, 1.0, 4.3);
  // Landing gear
  box(0.15, 0.8, 0.15, dark, 0.7, -0.95, -1.4);
  box(0.15, 0.8, 0.15, dark, -0.7, -0.95, -1.4);
  box(0.25, 0.45, 0.45, dark, 0.7, -1.35, -1.4);
  box(0.25, 0.45, 0.45, dark, -0.7, -1.35, -1.4);

  // Propeller hub + blades
  const propeller = new THREE.Group();
  propeller.position.set(0, 0, -3.8);
  const hubGeo = new THREE.ConeGeometry(0.35, 0.6, 8);
  hubGeo.rotateX(-Math.PI / 2);
  geometries.push(hubGeo);
  propeller.add(new THREE.Mesh(hubGeo, dark));
  const bladeGeo = new THREE.BoxGeometry(0.22, 3.0, 0.08);
  geometries.push(bladeGeo);
  propeller.add(new THREE.Mesh(bladeGeo, dark));
  const blade2 = new THREE.Mesh(bladeGeo, dark);
  blade2.rotation.z = Math.PI / 2;
  propeller.add(blade2);
  root.add(propeller);

  return {
    root,
    propeller,
    dispose: () => {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
