/**
 * Real-time 3D Polygon Mesh Aircraft Renderer (GTA Vice City / Flight Sim style).
 * Renders a 3D multi-surface twin-engine jet with true 3D [x, y, z] vertices,
 * surface normal lighting, 3D roll/pitch/yaw rotation matrices, wingtip contrails,
 * glowing 3D exhaust cones, and a projected ground shadow.
 */

export interface AircraftFlightState {
  /** Roll/bank angle in degrees (-40 to +40, positive = bank right) */
  rollDeg: number;
  /** Pitch angle in degrees (-15 to +15, positive = nose up) */
  pitchDeg: number;
  /** Nose yaw lead angle in degrees (-18 to +18, positive = nose right) */
  yawDeg: number;
  /** Lateral chase-camera offset (-1 to +1) */
  lateralOffset: number;
  /** Time in ms (performance.now()) for flight bobbing & exhaust animation */
  timeMs: number;
  /** Camera mode */
  cameraView: "cockpit" | "chase-close" | "chase-far";
  /** True when actively flying forward, false when holding */
  isFlying: boolean;
}

type Vec3 = [number, number, number];

interface Face3D {
  verts: Vec3[];
  baseColor: [number, number, number];
  emissive?: boolean;
  alpha?: number;
  specular?: number;
}

interface TrailPoint {
  leftWing: Vec3;
  rightWing: Vec3;
}

// 3D Aircraft Geometry in local aircraft coordinates:
// X = Right (+), Left (-)
// Y = Forward (+ nose), Back (- tail)
// Z = Up (+ top), Down (- belly)
function buildAircraftFaces(): Face3D[] {
  const faces: Face3D[] = [];

  const addQuad = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    color: [number, number, number],
    specular = 0.25,
    alpha = 1,
  ) => {
    faces.push({ verts: [a, b, c, d], baseColor: color, specular, alpha });
  };

  const addTri = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: [number, number, number],
    specular = 0.25,
    alpha = 1,
    emissive = false,
  ) => {
    faces.push({ verts: [a, b, c], baseColor: color, specular, alpha, emissive });
  };

  // Symmetric helper across X axis
  const addSymQuad = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    d: Vec3,
    color: [number, number, number],
    specular = 0.25,
  ) => {
    addQuad(a, b, c, d, color, specular);
    addQuad(
      [-d[0], d[1], d[2]],
      [-c[0], c[1], c[2]],
      [-b[0], b[1], b[2]],
      [-a[0], a[1], a[2]],
      color,
      specular,
    );
  };

  const addSymTri = (
    a: Vec3,
    b: Vec3,
    c: Vec3,
    color: [number, number, number],
    specular = 0.25,
  ) => {
    addTri(a, b, c, color, specular);
    addTri([-c[0], c[1], c[2]], [-b[0], b[1], b[2]], [-a[0], a[1], a[2]], color, specular);
  };

  // Colors (RGB)
  const hullTop: [number, number, number] = [241, 245, 249];
  const hullSide: [number, number, number] = [203, 213, 225];
  const hullBelly: [number, number, number] = [71, 85, 105];
  const noseColor: [number, number, number] = [30, 41, 59];
  const canopyGlass: [number, number, number] = [14, 165, 233];
  const wingTop: [number, number, number] = [226, 232, 240];
  const wingBottom: [number, number, number] = [100, 116, 139];
  const stripeBlue: [number, number, number] = [37, 99, 235];
  const tailDark: [number, number, number] = [30, 58, 138];
  const engineDark: [number, number, number] = [51, 65, 85];

  // 1. Nose cone (y = 3.2 to 4.8)
  const noseTip: Vec3 = [0, 4.8, -0.05];
  addSymTri([0, 3.2, 0.35], [0.42, 3.2, 0.05], noseTip, noseColor, 0.5);
  addSymTri([0.42, 3.2, 0.05], [0, 3.2, -0.32], noseTip, hullBelly, 0.2);

  // 2. Forward Fuselage & 3D Cockpit Canopy (y = 0.8 to 3.2)
  addSymQuad([0, 0.8, 0.88], [0.36, 0.8, 0.42], [0.32, 2.5, 0.32], [0, 2.7, 0.55], canopyGlass, 0.85);
  addSymTri([0, 2.7, 0.55], [0.32, 2.5, 0.32], [0, 3.2, 0.35], canopyGlass, 0.85);
  addSymQuad([0, 0.2, 0.52], [0.36, 0.8, 0.42], [0, 0.8, 0.88], [0, 0.2, 0.52], canopyGlass, 0.8);

  // Forward fuselage sides & belly
  addSymQuad([0.36, 0.8, 0.42], [0.68, 0.8, 0.0], [0.42, 3.2, 0.05], [0.32, 2.5, 0.32], hullSide, 0.35);
  addSymQuad([0.68, 0.8, 0.0], [0, 0.8, -0.45], [0, 3.2, -0.32], [0.42, 3.2, 0.05], hullBelly, 0.15);

  // 3. Main Center Fuselage Spine & Sides (y = -3.2 to 0.8)
  addSymQuad([0, -3.2, 0.44], [0.52, -3.2, 0.22], [0.58, 0.8, 0.36], [0, 0.8, 0.54], hullTop, 0.45);
  addSymQuad([0.52, -3.2, 0.22], [0.62, -3.2, -0.18], [0.68, 0.8, 0.0], [0.58, 0.8, 0.36], hullSide, 0.3);
  addSymQuad([0.62, -3.2, -0.18], [0, -3.2, -0.36], [0, 0.8, -0.45], [0.68, 0.8, 0.0], hullBelly, 0.15);

  // 4. 3D Swept Main Wings (with real 3D thickness: top, bottom, leading & trailing edges)
  // Root: x = 0.62, y = -1.6..+0.6, z = 0.08 (top) / -0.08 (bottom)
  // Tip:  x = 4.95, y = -2.35..-1.45, z = 0.14 (slight dihedral)
  addSymQuad(
    [0.6, -1.65, 0.1],
    [4.95, -2.35, 0.16],
    [4.95, -1.45, 0.18],
    [0.62, 0.65, 0.12],
    wingTop,
    0.4,
  );
  // Blue racing/avionics stripe on top of wings
  addSymQuad(
    [1.1, -1.15, 0.13],
    [4.35, -2.05, 0.17],
    [4.35, -1.62, 0.18],
    [1.1, -0.15, 0.14],
    stripeBlue,
    0.5,
  );
  // Wing underside
  addSymQuad(
    [0.62, 0.65, -0.08],
    [4.95, -1.45, 0.06],
    [4.95, -2.35, 0.05],
    [0.6, -1.65, -0.08],
    wingBottom,
    0.15,
  );
  // Wing leading edge (3D thickness face)
  addSymQuad(
    [0.62, 0.65, 0.12],
    [4.95, -1.45, 0.18],
    [4.95, -1.45, 0.06],
    [0.62, 0.65, -0.08],
    hullSide,
    0.35,
  );
  // Wing trailing edge (3D thickness face)
  addSymQuad(
    [4.95, -2.35, 0.16],
    [0.6, -1.65, 0.1],
    [0.6, -1.65, -0.08],
    [4.95, -2.35, 0.05],
    wingBottom,
    0.2,
  );

  // 5. 3D Upturned Wingtip Winglets
  addSymQuad(
    [4.95, -2.35, 0.12],
    [5.22, -2.48, 0.78],
    [5.22, -1.9, 0.78],
    [4.95, -1.45, 0.14],
    stripeBlue,
    0.45,
  );
  addSymQuad(
    [4.95, -1.45, 0.14],
    [5.22, -1.9, 0.78],
    [5.22, -2.48, 0.78],
    [4.95, -2.35, 0.12],
    tailDark,
    0.3,
  );

  // 6. 3D Horizontal Tail Stabilizers (Elevators)
  addSymQuad(
    [0.48, -3.35, 0.08],
    [2.35, -3.85, 0.1],
    [2.35, -3.25, 0.11],
    [0.52, -2.45, 0.09],
    wingTop,
    0.35,
  );
  addSymQuad(
    [0.52, -2.45, -0.02],
    [2.35, -3.25, 0.02],
    [2.35, -3.85, 0.02],
    [0.48, -3.35, -0.02],
    wingBottom,
    0.15,
  );

  // 7. 3D Twin Angled Vertical Tail Fins (Rudders sticking UP in +Z!)
  // Inner and outer faces of each canted vertical fin
  addSymQuad(
    [0.42, -3.35, 0.25],
    [0.82, -3.65, 1.62],
    [0.82, -2.85, 1.62],
    [0.45, -2.05, 0.32],
    tailDark,
    0.45,
  );
  addSymQuad(
    [0.45, -2.05, 0.32],
    [0.82, -2.85, 1.62],
    [0.82, -3.65, 1.62],
    [0.42, -3.35, 0.25],
    stripeBlue,
    0.45,
  );

  // 8. Twin 3D Jet Engine Nozzles (at y = -3.2 to -3.65)
  for (const sign of [-1, 1]) {
    const cx = sign * 0.28;
    const rOuter = 0.22;
    const rInner = 0.17;
    const segs = 8;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const p0: Vec3 = [cx + Math.cos(a0) * rOuter, -3.15, 0.02 + Math.sin(a0) * rOuter];
      const p1: Vec3 = [cx + Math.cos(a1) * rOuter, -3.15, 0.02 + Math.sin(a1) * rOuter];
      const p2: Vec3 = [cx + Math.cos(a1) * rInner, -3.68, 0.02 + Math.sin(a1) * rInner];
      const p3: Vec3 = [cx + Math.cos(a0) * rInner, -3.68, 0.02 + Math.sin(a0) * rInner];
      addQuad(p0, p1, p2, p3, engineDark, 0.4);
    }
  }

  return faces;
}

const AIRCRAFT_FACES = buildAircraftFaces();

function rotateAircraftPoint(
  [x, y, z]: Vec3,
  rollRad: number,
  pitchRad: number,
  yawRad: number,
): Vec3 {
  // 1. Roll around Y (forward axis): positive roll tilts right wing down (-Z)
  const cr = Math.cos(rollRad);
  const sr = Math.sin(rollRad);
  const x1 = x * cr + z * sr;
  const z1 = -x * sr + z * cr;
  const y1 = y;

  // 2. Pitch around X (right axis): positive pitch lifts nose up (+Z)
  const cp = Math.cos(pitchRad);
  const sp = Math.sin(pitchRad);
  const y2 = y1 * cp - z1 * sp;
  const z2 = y1 * sp + z1 * cp;
  const x2 = x1;

  // 3. Yaw around Z (up axis): positive yaw turns nose right (+X)
  const cy = Math.cos(yawRad);
  const sy = Math.sin(yawRad);
  const x3 = x2 * cy + y2 * sy;
  const y3 = -x2 * sy + y2 * cy;
  const z3 = z2;

  return [x3, y3, z3];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export class Aircraft3DRenderer {
  private trail: TrailPoint[] = [];

  render(ctx: CanvasRenderingContext2D, width: number, height: number, state: AircraftFlightState) {
    ctx.clearRect(0, 0, width, height);

    if (state.cameraView === "cockpit") {
      this.renderCockpitCanopy(ctx, width, height, state);
      return;
    }

    // Natural aerodynamic bobbing & micro-roll in flight
    const t = state.timeMs * 0.001;
    const bobZ = state.isFlying ? Math.sin(t * 2.6) * 0.14 : Math.sin(t * 1.4) * 0.05;
    const microRoll = state.isFlying ? Math.sin(t * 1.9) * 1.6 : 0;
    const microPitch = state.isFlying ? Math.cos(t * 2.2) * 1.2 : 0;

    const rollRad = ((state.rollDeg + microRoll) * Math.PI) / 180;
    const pitchRad = ((state.pitchDeg + microPitch + 4) * Math.PI) / 180;
    const yawRad = (state.yawDeg * Math.PI) / 180;

    // Aircraft position in 3D chase camera world space
    const planeOffset: Vec3 = [
      state.lateralOffset * 1.65,
      state.cameraView === "chase-close" ? 0 : 2.2,
      bobZ,
    ];

    // Camera positioned behind and slightly above the tail looking forward (GTA Vice City chase angle)
    const camPos: Vec3 = [0, -9.8, 3.35];
    const camPitchDown = 0.25; // radians looking slightly downward toward nose
    const cosCam = Math.cos(camPitchDown);
    const sinCam = Math.sin(camPitchDown);

    const fovScale = Math.min(width, height) * (state.cameraView === "chase-close" ? 0.28 : 0.22);
    const screenCenterX = width * 0.5;
    const screenCenterY = height * (state.cameraView === "chase-close" ? 0.73 : 0.7);

    const project = (worldPt: Vec3): [number, number, number] | null => {
      const dx = worldPt[0] - camPos[0];
      const dy = worldPt[1] - camPos[1];
      const dz = worldPt[2] - camPos[2];

      // Rotate into camera space (Y = depth forward, Z = screen up)
      const camY = dy * cosCam - dz * sinCam;
      const camZ = dy * sinCam + dz * cosCam;
      const camX = dx;

      if (camY <= 0.5) return null;
      const sx = screenCenterX + (camX / camY) * fovScale;
      const sy = screenCenterY - (camZ / camY) * fovScale;
      return [sx, sy, camY];
    };

    const toWorld = (localPt: Vec3): Vec3 => {
      const r = rotateAircraftPoint(localPt, rollRad, pitchRad, yawRad);
      return [r[0] + planeOffset[0], r[1] + planeOffset[1], r[2] + planeOffset[2]];
    };

    // 1. Draw 3D Projected Ground Shadow on z = -2.3 plane
    const shadowZ = -2.35;
    ctx.save();
    for (const face of AIRCRAFT_FACES) {
      const pts: [number, number][] = [];
      for (const v of face.verts) {
        const w = toWorld(v);
        const p = project([w[0] + 0.25, w[1] - 0.2, shadowZ]);
        if (p) pts.push([p[0], p[1]]);
      }
      if (pts.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.closePath();
        ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
        ctx.fill();
      }
    }
    ctx.restore();

    // 2. Update & Draw 3D Wingtip Contrail Ribbons
    const leftTipWorld = toWorld([-5.1, -2.35, 0.45]);
    const rightTipWorld = toWorld([5.1, -2.35, 0.45]);
    if (state.isFlying) {
      // Shift old trail points backward along -Y to simulate forward airspeed
      for (const pt of this.trail) {
        pt.leftWing[1] -= 0.48;
        pt.rightWing[1] -= 0.48;
      }
      this.trail.unshift({
        leftWing: [...leftTipWorld],
        rightWing: [...rightTipWorld],
      });
      if (this.trail.length > 18) this.trail.pop();
    } else {
      this.trail.length = 0;
    }

    if (this.trail.length > 2) {
      for (const side of ["leftWing", "rightWing"] as const) {
        for (let i = 0; i < this.trail.length - 1; i++) {
          const p0 = project(this.trail[i][side]);
          const p1 = project(this.trail[i + 1][side]);
          if (!p0 || !p1) continue;
          const alpha = (1 - i / this.trail.length) * 0.48;
          ctx.beginPath();
          ctx.moveTo(p0[0], p0[1]);
          ctx.lineTo(p1[0], p1[1]);
          ctx.strokeStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
          ctx.lineWidth = Math.max(1, (1 - i / this.trail.length) * 3.5);
          ctx.lineCap = "round";
          ctx.stroke();
        }
      }
    }

    // 3. Build & Depth-Sort All 3D Aircraft Faces + Dynamic 3D Afterburner Cones
    const dynamicFaces: Face3D[] = [...AIRCRAFT_FACES];
    const flameLen = state.isFlying ? 1.55 + Math.sin(t * 28) * 0.28 : 0.45;
    for (const sign of [-1, 1]) {
      const cx = sign * 0.28;
      const r = 0.15;
      const tip: Vec3 = [cx, -3.68 - flameLen, 0.02];
      const segs = 6;
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2;
        const a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0: Vec3 = [cx + Math.cos(a0) * r, -3.68, 0.02 + Math.sin(a0) * r];
        const p1: Vec3 = [cx + Math.cos(a1) * r, -3.68, 0.02 + Math.sin(a1) * r];
        dynamicFaces.push({
          verts: [p0, p1, tip],
          baseColor: i % 2 === 0 ? [56, 189, 248] : [249, 115, 22],
          emissive: true,
          alpha: state.isFlying ? 0.9 : 0.45,
        });
      }
    }

    const sunDir = normalize([0.35, -0.25, 0.88]);
    const viewDir = normalize([0, -1, 0.35]);

    const drawable = dynamicFaces
      .map((face) => {
        const worldVerts = face.verts.map(toWorld);
        const projected = worldVerts.map(project);
        if (projected.some((p) => p === null)) return null;
        const pts = projected as [number, number, number][];

        // Centroid depth in camera space for Painter's algorithm
        const depth =
          pts.reduce((sum, p) => sum + p[2], 0) / pts.length;

        // Compute 3D surface normal for Lambert + Specular lighting
        const e1 = sub(worldVerts[1], worldVerts[0]);
        const e2 = sub(worldVerts[2], worldVerts[0]);
        let normal = normalize(cross(e1, e2));
        // Ensure normal faces upward/outward for two-sided wing/fin surfaces
        if (dot(normal, viewDir) < 0) {
          normal = [-normal[0], -normal[1], -normal[2]];
        }

        return { face, pts, depth, normal };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    // Sort back-to-front (largest depth drawn first)
    drawable.sort((a, b) => b.depth - a.depth);

    // 4. Render 3D Shaded Polygons
    for (const { face, pts, normal } of drawable) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i][0], pts[i][1]);
      }
      ctx.closePath();

      if (face.emissive) {
        const [r, g, b] = face.baseColor;
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${face.alpha ?? 0.9})`;
        ctx.fill();
        continue;
      }

      const diffuse = Math.max(0, dot(normal, sunDir));
      const halfVec = normalize([
        sunDir[0] + viewDir[0],
        sunDir[1] + viewDir[1],
        sunDir[2] + viewDir[2],
      ]);
      const spec =
        Math.pow(Math.max(0, dot(normal, halfVec)), 16) * (face.specular ?? 0.25);

      const light = 0.52 + diffuse * 0.48;
      const r = Math.min(255, Math.round(face.baseColor[0] * light + spec * 180));
      const g = Math.min(255, Math.round(face.baseColor[1] * light + spec * 195));
      const b = Math.min(255, Math.round(face.baseColor[2] * light + spec * 210));

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${face.alpha ?? 1})`;
      ctx.fill();
      ctx.strokeStyle = "rgba(15, 23, 42, 0.28)";
      ctx.lineWidth = 0.85;
      ctx.stroke();
    }

    // 5. Wingtip Navigation Strobe Lights (Red Left, Green Right)
    const leftLight = project(toWorld([-5.15, -2.15, 0.55]));
    const rightLight = project(toWorld([5.15, -2.15, 0.55]));
    if (leftLight) {
      ctx.beginPath();
      ctx.arc(leftLight[0], leftLight[1], 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#ef4444";
      ctx.fill();
    }
    if (rightLight) {
      ctx.beginPath();
      ctx.arc(rightLight[0], rightLight[1], 3.5, 0, Math.PI * 2);
      ctx.fillStyle = "#22c55e";
      ctx.fill();
    }
  }

  private renderCockpitCanopy(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: AircraftFlightState,
  ) {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const rollRad = (-state.rollDeg * Math.PI) / 180;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rollRad);

    // Subtle green HUD horizon line
    ctx.strokeStyle = "rgba(52, 211, 153, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-110, 0);
    ctx.lineTo(-35, 0);
    ctx.moveTo(35, 0);
    ctx.lineTo(110, 0);
    ctx.stroke();

    // Center reticle
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
