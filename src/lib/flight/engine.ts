import * as THREE from "three";
import { createPlane, type PlaneModel } from "./plane";
import { createGoogleWorld, createSatelliteWorld, fromLocal, type World } from "./world";

export type CameraMode = "chase" | "far" | "cockpit";

export interface HudState {
  speedKts: number;
  altitudeFt: number;
  headingDeg: number;
  throttle: number;
  crashed: boolean;
  cameraMode: CameraMode;
  mapLabel: string;
  attribution: string;
  lat: number;
  lon: number;
  warning: string | null;
}

export interface ControlAxes {
  pitch: number; // +1 nose up
  roll: number; // +1 roll right
  yaw: number; // +1 yaw right
  throttle: number; // +1 increase, -1 decrease
}

interface Options {
  container: HTMLElement;
  mapboxToken: string;
  googleKey?: string;
  onHud: (hud: HudState) => void;
}

const MAX_RADIUS_M = 80_467; // 50 miles around downtown St. Louis
const MIN_SPEED = 28;
const MAX_SPEED = 125;
const SPAWN = { position: new THREE.Vector3(-2600, 320, 250), yaw: -Math.PI / 2 }; // west of downtown, heading east to the Arch

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

const KEYMAP: Record<string, [keyof ControlAxes, number]> = {
  arrowup: ["pitch", 1],
  arrowdown: ["pitch", -1],
  arrowleft: ["roll", -1],
  arrowright: ["roll", 1],
  a: ["yaw", -1],
  d: ["yaw", 1],
  w: ["throttle", 1],
  s: ["throttle", -1],
  shift: ["throttle", 1],
  control: ["throttle", -1],
};

export class FlightGame {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private sun: THREE.DirectionalLight;
  private plane: PlaneModel;
  private world: World | null = null;
  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;

  private position = SPAWN.position.clone();
  private quaternion = new THREE.Quaternion().setFromAxisAngle(AXIS_Y, SPAWN.yaw);
  private speed = 60;
  private throttle = 0.55;
  private crashed = false;
  private crashTimer = 0;
  private explosion: THREE.Mesh;
  private cameraMode: CameraMode = "chase";

  private keys = new Set<string>();
  private touch: ControlAxes = { pitch: 0, roll: 0, yaw: 0, throttle: 0 };
  private raycaster = new THREE.Raycaster();
  private groundY = 0;
  private frame = 0;
  private hudTimer = 0;
  private warning: string | null = null;

  constructor(private opts: Options) {
    const { container } = opts;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(65, container.clientWidth / container.clientHeight, 1, 60_000);

    const sky = new THREE.Color(0xa7d3f5);
    this.scene.background = sky;
    this.scene.fog = new THREE.Fog(sky, 2500, 22_000);

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b7f5a, 1.4));
    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -40;
    sc.right = 40;
    sc.top = 40;
    sc.bottom = -40;
    sc.near = 1;
    sc.far = 2000;
    this.scene.add(this.sun, this.sun.target);

    this.plane = createPlane();
    this.scene.add(this.plane.root);
    this.addClouds();

    this.explosion = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0, fog: false }),
    );
    this.scene.add(this.explosion);

    this.raycaster.far = 4000;
    (this.raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    window.addEventListener("resize", this.onResize);
  }

  async start() {
    const { googleKey, mapboxToken } = this.opts;
    let world: World | null = null;
    if (googleKey) {
      try {
        world = await createGoogleWorld(googleKey, this.camera, this.renderer);
      } catch (err) {
        console.warn("Google 3D tiles unavailable, using satellite fallback", err);
      }
    }
    if (this.disposed) {
      world?.dispose();
      return;
    }
    if (!world) world = createSatelliteWorld(mapboxToken, this.renderer);
    this.world = world;
    this.scene.add(world.object);
    this.groundY = world.baseGround ?? 0;
    this.clock.start();
    this.loop();
  }

  setTouchAxes(axes: Partial<ControlAxes>) {
    this.touch = { ...this.touch, ...axes };
  }

  cycleCamera() {
    this.cameraMode = this.cameraMode === "chase" ? "far" : this.cameraMode === "far" ? "cockpit" : "chase";
  }

  respawn() {
    this.position.copy(SPAWN.position);
    this.quaternion.setFromAxisAngle(AXIS_Y, SPAWN.yaw);
    this.speed = 60;
    this.throttle = 0.55;
    this.crashed = false;
    this.crashTimer = 0;
    this.plane.root.visible = true;
    (this.explosion.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    window.removeEventListener("resize", this.onResize);
    this.world?.dispose();
    this.plane.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // -------------------------------------------------------------------------

  private onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
    const key = e.key.toLowerCase();
    if (key === "c") return this.cycleCamera();
    if (key === "r") return this.respawn();
    if (KEYMAP[key]) {
      e.preventDefault();
      this.keys.add(key);
    }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };

  private onBlur = () => this.keys.clear();

  private onResize = () => {
    const { container } = this.opts;
    this.camera.aspect = container.clientWidth / container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(container.clientWidth, container.clientHeight);
  };

  private axes(): ControlAxes {
    const a: ControlAxes = { ...this.touch };
    for (const key of this.keys) {
      const [axis, v] = KEYMAP[key];
      a[axis] += v;
    }
    a.pitch = THREE.MathUtils.clamp(a.pitch, -1, 1);
    a.roll = THREE.MathUtils.clamp(a.roll, -1, 1);
    a.yaw = THREE.MathUtils.clamp(a.yaw, -1, 1);
    a.throttle = THREE.MathUtils.clamp(a.throttle, -1, 1);
    return a;
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.frame++;

    if (this.crashed) {
      this.crashTimer += dt;
      const m = this.explosion.material as THREE.MeshBasicMaterial;
      this.explosion.scale.setScalar(4 + this.crashTimer * 30);
      m.opacity = Math.max(0, 0.9 - this.crashTimer * 0.6);
      if (this.crashTimer > 2.5) this.respawn();
    } else {
      this.fly(dt);
    }

    this.plane.root.position.copy(this.position);
    this.plane.root.quaternion.copy(this.quaternion);
    this.plane.propeller.rotation.z += dt * (20 + this.throttle * 60);

    this.updateCamera(dt);

    // Keep the shadow camera tight around the plane.
    this.sun.position.set(this.position.x + 300, this.position.y + 600, this.position.z + 200);
    this.sun.target.position.copy(this.position);

    this.world?.update(this.camera, this.renderer, this.position);
    this.renderer.render(this.scene, this.camera);

    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.emitHud();
    }
  };

  private fly(dt: number) {
    const input = this.axes();
    const q = this.quaternion;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(q);

    const bank = Math.asin(THREE.MathUtils.clamp(-right.y, -1, 1)); // + = right wing down
    const pitchAngle = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));

    // Throttle & airspeed (diving trades height for speed, climbing bleeds it).
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * dt * 0.6, 0, 1);
    const target = MIN_SPEED + this.throttle * (MAX_SPEED - MIN_SPEED);
    this.speed += (target - this.speed) * 0.5 * dt - forward.y * 9.8 * dt;
    this.speed = THREE.MathUtils.clamp(this.speed, 15, MAX_SPEED * 1.4);

    // Angular rates (rad/s) in the plane's local frame.
    let pitchRate = input.pitch * 1.1;
    let rollRate = input.roll * 2.0;
    const yawRate = input.yaw * 0.45;

    // Gentle auto-levelling makes it arcade-friendly (like fly.pieter.com).
    if (input.roll === 0) rollRate -= bank * 1.6;
    if (input.pitch === 0) pitchRate -= pitchAngle * 0.35;
    // Stall: below ~30 m/s the nose drops.
    if (this.speed < 32) pitchRate -= (32 - this.speed) * 0.04;

    const tmp = new THREE.Quaternion();
    q.multiply(tmp.setFromAxisAngle(AXIS_X, pitchRate * dt));
    q.multiply(tmp.setFromAxisAngle(AXIS_Z, -rollRate * dt));
    q.multiply(tmp.setFromAxisAngle(AXIS_Y, -yawRate * dt));
    // Banked turn: lift vector tilts, so the plane turns toward the low wing.
    q.premultiply(tmp.setFromAxisAngle(AXIS_Y, -Math.sin(bank) * 0.9 * dt));

    // Soft boundary: steer back toward St. Louis beyond 50 miles.
    const dist = Math.hypot(this.position.x, this.position.z);
    this.warning = null;
    if (dist > MAX_RADIUS_M) {
      this.warning = "Leaving the St. Louis area — turning back";
      const toCenter = Math.atan2(-this.position.x, -this.position.z);
      const heading = Math.atan2(forward.x, forward.z);
      const diff = Math.atan2(Math.sin(toCenter - heading), Math.cos(toCenter - heading));
      q.premultiply(tmp.setFromAxisAngle(AXIS_Y, Math.sign(diff) * 0.6 * dt));
    }
    q.normalize();

    forward.set(0, 0, -1).applyQuaternion(q);
    const step = this.speed * dt;

    // Forward collision with buildings / 3D tiles.
    if (this.world && this.frame % 2 === 0) {
      this.raycaster.set(this.position, forward);
      this.raycaster.far = step * 2 + 6;
      const hit = this.raycaster.intersectObjects(this.world.colliders, true)[0];
      if (hit) return this.crash();
    }

    this.position.addScaledVector(forward, step);
    if (this.position.y > 3000) this.position.y = 3000;

    // Ground height under the plane.
    if (this.world && this.frame % 3 === 0) {
      this.raycaster.set(new THREE.Vector3(this.position.x, this.position.y + 50, this.position.z), new THREE.Vector3(0, -1, 0));
      this.raycaster.far = 6000;
      const hit = this.raycaster.intersectObjects(this.world.colliders, true)[0];
      const base = this.world.baseGround ?? -Infinity;
      this.groundY = Math.max(hit ? hit.point.y : -Infinity, base);
      if (!Number.isFinite(this.groundY)) this.groundY = this.position.y - 500;
    }
    if (this.position.y - this.groundY < 1.6) this.crash();
  }

  private crash() {
    if (this.crashed) return;
    this.crashed = true;
    this.crashTimer = 0;
    this.speed = 0;
    this.plane.root.visible = false;
    this.explosion.position.copy(this.position);
  }

  private updateCamera(dt: number) {
    const q = this.quaternion;
    const cam = this.camera;
    if (this.cameraMode === "cockpit") {
      this.plane.root.visible = false;
      cam.position.copy(new THREE.Vector3(0, 1.2, -1.2).applyQuaternion(q).add(this.position));
      cam.quaternion.copy(q);
      return;
    }
    if (!this.crashed) this.plane.root.visible = true;

    const offset = this.cameraMode === "far" ? new THREE.Vector3(0, 14, 48) : new THREE.Vector3(0, 5, 19);
    // Follow heading & pitch but only part of the roll, so the horizon stays readable.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const yaw = Math.atan2(-forward.x, -forward.z);
    const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -1, 1));
    const followQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch * 0.7, yaw, 0, "YXZ"));
    const desired = offset.applyQuaternion(followQ).add(this.position);
    const k = 1 - Math.exp(-6 * dt);
    cam.position.lerp(desired, k);

    const planeUp = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    cam.up.lerp(new THREE.Vector3(0, 1, 0).lerp(planeUp, 0.25), k).normalize();
    cam.lookAt(new THREE.Vector3().copy(forward).multiplyScalar(18).add(this.position));
  }

  private emitHud() {
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.quaternion);
    const heading = (THREE.MathUtils.radToDeg(Math.atan2(forward.x, -forward.z)) + 360) % 360;
    const { lat, lon } = fromLocal(this.position.x, this.position.z);
    this.opts.onHud({
      speedKts: this.speed * 1.944,
      altitudeFt: Math.max(0, (this.position.y - this.groundY) * 3.281),
      headingDeg: heading,
      throttle: this.throttle,
      crashed: this.crashed,
      cameraMode: this.cameraMode,
      mapLabel: this.world?.label ?? "Loading map…",
      attribution: this.world?.attribution ?? "",
      lat,
      lon,
      warning: this.warning,
    });
  }

  private addClouds() {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, transparent: true, opacity: 0.92 });
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    for (let i = 0; i < 70; i++) {
      const cloud = new THREE.Group();
      const cx = rand(-15000, 15000);
      const cz = rand(-15000, 15000);
      const cy = rand(550, 900);
      const puffs = 3 + Math.floor(Math.random() * 4);
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(geo, mat);
        const s = rand(40, 90);
        puff.scale.set(s * 1.4, s * 0.8, s);
        puff.position.set(rand(-90, 90), rand(-15, 20), rand(-50, 50));
        cloud.add(puff);
      }
      cloud.position.set(cx, cy, cz);
      this.scene.add(cloud);
    }
  }
}
