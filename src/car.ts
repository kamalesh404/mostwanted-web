import * as THREE from 'three';
import { resolveCollisions, WORLD_BOUND_LIMIT, type AABB, type CityData } from './city.ts';
import { type CarSpec, type UpgradeState } from './types.ts';

export interface CarInput {
  steer: number;   // -1..1
  throttle: number; // 0..1
  brake: number;   // 0..1
  handbrake: boolean;
  nitro: boolean;
}

export const emptyInput = (): CarInput => ({ steer: 0, throttle: 0, brake: 0, handbrake: false, nitro: false });

export interface CarStats { accel: number; topSpeed: number; grip: number; nitro: number; }

export function effectiveStats(spec: CarSpec, upg?: UpgradeState): CarStats {
  const e = upg?.engine ?? 0, h = upg?.handling ?? 0, n = upg?.nitrous ?? 0;
  return {
    accel: spec.accel * (1 + 0.12 * e),
    topSpeed: spec.topSpeed * (1 + 0.045 * e),
    grip: Math.min(0.99, spec.grip + 0.045 * h),
    nitro: spec.nitro * (1 + 0.15 * n),
  };
}

const NITRO_CAPACITY = 100;
const NITRO_DRAIN = 34;   // per second
const NITRO_REFILL = 9;   // per second
const MAX_VELOCITY_CAP = 85; // absolute upper cap (m/s ~306 km/h)

export class CarController {
  spec: CarSpec;
  stats: CarStats;
  mesh: THREE.Group;
  pos = new THREE.Vector3();
  yaw = 0;
  vel = new THREE.Vector2(); // world velocity x,z
  nitroAmount = NITRO_CAPACITY;
  tireDamage = 0; // seconds remaining
  drifting = false;
  crashedInto: ((force: number) => void) | null = null;
  private wheels: THREE.Object3D[] = [];
  private brakeLight: THREE.Mesh | null = null;
  private radius = 1.9;
  private colliders: AABB[] = [];
  private steerVis = 0;
  isPlayer = false;
  isStatic = false;

  constructor(spec: CarSpec, mesh: THREE.Group, upg?: UpgradeState) {
    this.spec = spec;
    this.stats = effectiveStats(spec, upg);
    this.mesh = mesh;
    mesh.traverse((o) => {
      const n = o.name.toLowerCase();
      if (n.includes('wheel') || n.includes('tyre') || n.includes('tire')) this.wheels.push(o);
    });
    // brake light strip at the rear
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    this.radius = Math.max(size.x, size.z) * 0.42;
    const lightGeo = new THREE.PlaneGeometry(size.x * 0.62, 0.14);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xff2211, transparent: true, opacity: 0.0 });
    this.brakeLight = new THREE.Mesh(lightGeo, lightMat);
    this.brakeLight.rotation.x = -Math.PI / 2;
    this.brakeLight.position.set(0, 0.02, -size.z / 2 + 0.05);
    mesh.add(this.brakeLight);
    this.pos.copy(mesh.position);
  }

  setCity(c: CityData) { this.colliders = c.colliders; }

  get speed() { return this.vel.length(); }
  get speedKmh() { return this.vel.length() * 3.6; }
  get forward() { return new THREE.Vector2(Math.sin(this.yaw), Math.cos(this.yaw)); }

  forwardSpeed() { return this.vel.dot(this.forward); }

  update(dt: number, input: CarInput) {
    const st = this.stats;
    const gripMul = this.tireDamage > 0 ? 0.45 : 1;
    const fwd = this.forward;
    const right = new THREE.Vector2(fwd.y, -fwd.x);
    let fSpeed = this.vel.dot(fwd);
    let lSpeed = this.vel.dot(right);

    // --- nitro ---
    const nos = input.nitro && this.nitroAmount > 0 && input.throttle > 0.1;
    if (nos) this.nitroAmount = Math.max(0, this.nitroAmount - NITRO_DRAIN * dt);
    else this.nitroAmount = Math.min(NITRO_CAPACITY, this.nitroAmount + NITRO_REFILL * dt);

    // --- engine / brakes ---
    const top = st.topSpeed * (this.tireDamage > 0 ? 0.72 : 1) * (nos ? 1.18 : 1);
    if (input.throttle > 0) {
      const power = st.accel + (nos ? st.nitro : 0);
      fSpeed += input.throttle * power * Math.max(0.15, 1 - fSpeed / top) * dt;
    }
    if (input.brake > 0) {
      if (fSpeed > 0.5) fSpeed -= input.brake * st.accel * 1.6 * dt;
      else fSpeed -= input.brake * st.accel * 0.5 * dt; // reverse
    }
    if (input.handbrake) fSpeed -= Math.sign(fSpeed) * st.accel * 0.9 * dt;
    fSpeed = Math.max(-9, Math.min(fSpeed, top));
    fSpeed *= 1 - 0.06 * dt; // rolling drag

    // --- steering ---
    const speedFactor = Math.min(1, Math.abs(fSpeed) / 9);
    const highSpeedTame = 1 / (1 + Math.abs(fSpeed) * 0.022);
    let steerRate = 2.1 * speedFactor * highSpeedTame * Math.sign(fSpeed || 1);
    if (input.handbrake) steerRate *= 1.5;
    this.yaw += input.steer * steerRate * dt;
    this.steerVis += ((input.steer * 0.45) - this.steerVis) * Math.min(1, dt * 10);

    // --- lateral grip & drift ---
    const grip = st.grip * gripMul * (input.handbrake ? 0.35 : 1) * (nos ? 0.92 : 1);
    lSpeed *= Math.exp(-grip * 7 * dt);
    // steering injects lateral slip at speed (drift feel)
    lSpeed += input.steer * fSpeed * (input.handbrake ? 0.5 : 0.12) * dt * speedFactor;
    this.drifting = Math.abs(lSpeed) > 3.5 && Math.abs(fSpeed) > 8;

    // recompose
    const nf = this.forward;
    const nr = new THREE.Vector2(nf.y, -nf.x);
    this.vel.copy(nf.clone().multiplyScalar(fSpeed).add(nr.clone().multiplyScalar(lSpeed)));

    // --- integrate + collide ---
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    const hit = resolveCollisions(this.pos, this.radius, this.colliders);
    if (hit) {
      const n = new THREE.Vector2(hit.x, hit.y);
      const vn = this.vel.dot(n);
      if (vn < 0) {
        // Controlled elastic rebound: restitution impulse capped to prevent velocity spikes
        const rebound = Math.min(-vn * 1.35, 26);
        this.vel.add(n.clone().multiplyScalar(rebound));
        const force = Math.min(1, -vn / 22);
        if (force > 0.12) this.crashedInto?.(force);
      }
      // Damped post-collision velocity and tangential surface scrub
      this.vel.multiplyScalar(0.78);
      const postSpeed = this.vel.length();
      if (postSpeed > top * 1.1) {
        this.vel.setLength(top * 1.1);
      }
    }

    // --- boundary clamping sanity check ---
    const bound = WORLD_BOUND_LIMIT - this.radius;
    if (Math.abs(this.pos.x) > bound) {
      this.pos.x = Math.sign(this.pos.x) * bound;
      this.vel.x = -this.vel.x * 0.3; // dampen and rebound inward
    }
    if (Math.abs(this.pos.z) > bound) {
      this.pos.z = Math.sign(this.pos.z) * bound;
      this.vel.y = -this.vel.y * 0.3; // dampen and rebound inward
    }

    // Absolute upper velocity clamp to prevent runaway physics
    if (this.vel.length() > MAX_VELOCITY_CAP) {
      this.vel.setLength(MAX_VELOCITY_CAP);
    }

    if (this.tireDamage > 0) this.tireDamage -= dt;

    // --- visuals ---
    this.mesh.position.set(this.pos.x, this.pos.y, this.pos.z);
    this.mesh.rotation.y = this.yaw;
    // lean into drift
    this.mesh.rotation.z = -Math.max(-0.09, Math.min(0.09, lSpeed * 0.006));
    const spin = fSpeed * dt * 2.4;
    for (const w of this.wheels) w.rotation.x -= spin;
    if (this.brakeLight) {
      const mat = this.brakeLight.material as THREE.MeshBasicMaterial;
      mat.opacity = input.brake > 0 || input.handbrake ? 0.95 : 0.12;
    }
  }

  applySpike(duration = 8) { this.tireDamage = Math.max(this.tireDamage, duration); }

  place(x: number, z: number, yaw: number) {
    this.pos.set(x, 0, z);
    this.yaw = yaw;
    this.vel.set(0, 0);
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.set(0, yaw, 0);
  }

  nitroFraction() { return this.nitroAmount / NITRO_CAPACITY; }
}
