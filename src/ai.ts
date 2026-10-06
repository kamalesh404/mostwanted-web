import * as THREE from 'three';
import { CarController, emptyInput, type CarInput } from './car';
import { GRID, PITCH, ROAD_W, type CityData } from './city';
import type { ModelMap } from './assets';

const LANE = ROAD_W / 4 + 0.4; // lane center offset from road centerline
const TRAFFIC_MODELS = ['sedan_1', 'sedan_2', 'taxi_1', 'van_1'];
const DIRS: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

interface TrafficCar {
  group: THREE.Group;
  x: number; z: number;
  dir: [number, number];
  speed: number;
  target: number;
  knocked: number; // seconds of knocked-out state remaining
  kvx: number; kvz: number;
}

export class TrafficManager {
  cars: TrafficCar[] = [];
  private group = new THREE.Group();
  private city: CityData;
  private templates: THREE.Group[] = [];
  count: number;

  constructor(city: CityData, models: ModelMap, count = 26) {
    this.city = city;
    this.count = count;
    for (const k of TRAFFIC_MODELS) this.templates.push(models[k]);
    for (let n = 0; n < count; n++) {
      const tpl = this.templates[n % this.templates.length];
      const g = tpl.clone(true);
      g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      this.group.add(g);
      const c: TrafficCar = { group: g, x: 0, z: 0, dir: [0, 1], speed: 0, target: 12, knocked: 0, kvx: 0, kvz: 0 };
      this.cars.push(c);
      this.respawn(c, new THREE.Vector3(99999, 0, 99999));
    }
  }

  get root() { return this.group; }

  private respawn(c: TrafficCar, near: THREE.Vector3) {
    for (let tries = 0; tries < 12; tries++) {
      const i = Math.floor(Math.random() * GRID), j = Math.floor(Math.random() * GRID);
      const node = this.city.node(i, j);
      const d = Math.hypot(node.x - near.x, node.y - near.z);
      if (d < 90 || d > 420) continue;
      const dir = DIRS[Math.floor(Math.random() * 4)];
      c.dir = dir;
      c.x = node.x + dir[0] * Math.random() * PITCH * 0.8;
      c.z = node.y + dir[1] * Math.random() * PITCH * 0.8;
      c.speed = c.target = 9 + Math.random() * 5;
      c.knocked = 0;
      return true;
    }
    return false;
  }

  update(dt: number, playerPos: THREE.Vector3, playerVel: THREE.Vector2, onBump: (force: number) => void) {
    for (const c of this.cars) {
      const dist = Math.hypot(c.x - playerPos.x, c.z - playerPos.z);
      if (dist > 480) { this.respawn(c, playerPos); continue; }

      if (c.knocked > 0) {
        c.knocked -= dt;
        c.x += c.kvx * dt; c.z += c.kvz * dt;
        c.kvx *= 1 - 2.2 * dt; c.kvz *= 1 - 2.2 * dt;
        c.group.position.set(c.x, 0, c.z);
        c.group.rotation.y += dt * 3;
        continue;
      }

      // steer along lane toward next node
      const rightX = c.dir[1], rightZ = -c.dir[0];
      const tx = c.x + c.dir[0] * 30 + rightX * LANE;
      const tz = c.z + c.dir[1] * 30 + rightZ * LANE;
      const wantYaw = Math.atan2(tx - c.x, tz - c.z);
      const curYaw = c.group.rotation.y;
      let dy = wantYaw - curYaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      c.group.rotation.y = curYaw + dy * Math.min(1, dt * 3);

      // slow for the player if ahead
      const ahead = new THREE.Vector2(c.x - playerPos.x, c.z - playerPos.z);
      const fwd = new THREE.Vector2(Math.sin(c.group.rotation.y), Math.cos(c.group.rotation.y));
      const nearAhead = ahead.length() < 12 && ahead.dot(fwd) < 0;
      c.speed += ((nearAhead ? 0 : c.target) - c.speed) * Math.min(1, dt * 2);
      c.x += fwd.x * c.speed * dt;
      c.z += fwd.y * c.speed * dt;

      // turn at intersections
      const n = this.city.nearestNode(c.x, c.z);
      if (Math.hypot(c.x - n.x, c.z - n.z) < 4 && Math.random() < dt * 1.5) {
        const options = DIRS.filter(d => !(d[0] === -c.dir[0] && d[1] === -c.dir[1]));
        c.dir = options[Math.floor(Math.random() * options.length)];
      }

      // collision with the player
      if (dist < 3.4) {
        const push = new THREE.Vector2(c.x - playerPos.x, c.z - playerPos.z).normalize();
        const pSpeed = playerVel.length();
        c.knocked = 1.6;
        c.kvx = push.x * pSpeed * 0.6 + playerVel.x * 0.3;
        c.kvz = push.y * pSpeed * 0.6 + playerVel.y * 0.3;
        onBump(Math.min(1, pSpeed / 40));
      }

      c.group.position.set(c.x, 0, c.z);
    }
  }
}

/** A rival racer that drives checkpoints with rubber-band difficulty. */
export class Racer {
  car: CarController;
  cps: THREE.Vector2[];
  cpIndex = 0;
  finished = false;
  finishTime = 0;
  private aggression: number;
  private name: string;

  constructor(name: string, car: CarController, cps: THREE.Vector2[], aggression: number) {
    this.name = name;
    this.car = car;
    this.cps = cps;
    this.aggression = aggression; // 0..1 skill
  }

  get target(): THREE.Vector2 { return this.cps[Math.min(this.cpIndex, this.cps.length - 1)]; }

  update(dt: number, _playerPos: THREE.Vector3, playerProgressM: number, onProgress: (r: Racer) => void) {
    void _playerPos;
    if (this.finished) return;
    const input: CarInput = emptyInput();
    const t = this.target;
    const dx = t.x - this.car.pos.x, dz = t.y - this.car.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 11) {
      this.cpIndex++;
      if (this.cpIndex >= this.cps.length) { this.finished = true; onProgress(this); return; }
      onProgress(this);
    }
    const want = Math.atan2(dx, dz);
    let dy = want - this.car.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    input.steer = Math.max(-1, Math.min(1, dy * 2.2));
    input.throttle = 1;
    const myProgress = this.progressMeters();
    const behind = playerProgressM - myProgress;
    // rubber band: catch up when behind, ease off when far ahead
    const rubber = 1 + Math.max(-0.18, Math.min(0.22, behind * 0.0004)) * this.aggression;
    if (Math.abs(dy) > 1.1 && this.car.speed > 18) { input.throttle = 0.25; input.brake = 0.6; }
    if (this.car.forwardSpeed() > this.car.stats.topSpeed * rubber * 0.97) input.throttle = 0;
    if (this.car.speed > 16 && Math.random() < dt * 0.25 * this.aggression) input.nitro = true;
    this.car.update(dt, input);
    void this.name;
  }

  progressMeters(): number {
    let m = this.cpIndex * 1e6; // checkpoint index dominates
    const t = this.target;
    m -= Math.hypot(t.x - this.car.pos.x, t.y - this.car.pos.z);
    return m;
  }
}
