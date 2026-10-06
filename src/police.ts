import * as THREE from 'three';
import { CarController, emptyInput } from './car';
import { PITCH, type CityData } from './city';
import type { ModelMap } from './assets';

interface Cop {
  car: CarController;
  lamps: { red: THREE.Mesh; blue: THREE.Mesh };
  ram: number; // cooldown
  spike?: boolean; // this roadblock car hides a spike strip
}

export type PoliceEvent = 'spotted' | 'heatup' | 'busted' | 'escaped' | 'spike' | 'roadblock';

export class PoliceSystem {
  active = false;
  heat = 0;          // 0..5 stars
  meter = 0;         // pursuit meter 0..1
  cops: Cop[] = [];
  private group = new THREE.Group();
  private city: CityData;
  private template: THREE.Group;
  private evadeTimer = 0;
  private bustTimer = 0;
  private meterAccum = 0;
  private roadblockCooldown = 14;
  private lampPhase = 0;
  onEvent: ((e: PoliceEvent, data?: number) => void) | null = null;

  constructor(city: CityData, models: ModelMap) {
    this.city = city;
    this.template = models['police_1'];
  }

  get root() { return this.group; }

  startPursuit(heat = 1) {
    if (this.active) { this.heat = Math.min(5, Math.max(this.heat, heat)); return; }
    this.active = true;
    this.heat = heat;
    this.meter = 0.15;
    this.evadeTimer = 0;
    this.bustTimer = 0;
    this.spawnCops();
    this.onEvent?.('spotted');
  }

  endPursuit() {
    this.active = false;
    this.heat = 0;
    this.meter = 0;
    for (const c of this.cops) this.group.remove(c.car.mesh);
    this.cops = [];
  }

  private copCount() { return Math.min(6, 1 + this.heat); }

  private spawnCops() {
    while (this.cops.length < this.copCount()) this.spawnCop();
  }

  private spawnCop(nearPos?: THREE.Vector3, forceNear = false) {
    const mesh = this.template.clone(true);
    mesh.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = true; } });
    // flashing lightbar
    const lampGeo = new THREE.SphereGeometry(0.13, 8, 8);
    const red = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    const blue = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
    const box = new THREE.Box3().setFromObject(mesh);
    const size = box.getSize(new THREE.Vector3());
    red.position.set(-0.35, size.y + 0.08, -0.2);
    blue.position.set(0.35, size.y + 0.08, -0.2);
    mesh.add(red, blue);
    const car = new CarController(
      { id: 'cop', name: 'cop', model: 'police_1', color: 0x111111, accel: 12.5 + this.heat * 0.9, topSpeed: 52 + this.heat * 3.2, grip: 0.9, nitro: 0, price: 0, desc: '' },
      mesh,
    );
    car.setCity(this.city);
    const p = nearPos ?? new THREE.Vector3();
    // spawn on a road node 90–160m away, biased ahead of the player
    let placed = false;
    for (let tries = 0; tries < 16 && !placed; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = forceNear ? 40 + Math.random() * 50 : 90 + Math.random() * 80;
      const x = p.x + Math.cos(ang) * r, z = p.z + Math.sin(ang) * r;
      const n = this.city.nearestNode(x, z);
      car.place(n.x, n.z, Math.random() * Math.PI * 2);
      placed = true;
    }
    this.group.add(mesh);
    this.cops.push({ car, lamps: { red, blue }, ram: 0 });
  }

  /** Drop a roadblock across the road ahead of the player. */
  private spawnRoadblock(player: CarController): Cop[] {
    const v = player.forward;
    const ahead = new THREE.Vector3(player.pos.x + v.x * 170, 0, player.pos.z + v.y * 170);
    const n = this.city.nearestNode(ahead.x, ahead.z);
    // perpendicular across the nearest road
    const alongX = Math.abs(player.pos.x - n.x) > Math.abs(player.pos.z - n.z);
    const dir: [number, number] = alongX ? [0, 1] : [1, 0];
    const spawned: Cop[] = [];
    for (const off of [-4.2, 0, 4.2]) {
      const mesh = this.template.clone(true);
      mesh.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
      const car = new CarController(
        { id: 'cop', name: 'cop', model: 'police_1', color: 0x111111, accel: 0, topSpeed: 0, grip: 1, nitro: 0, price: 0, desc: '' },
        mesh,
      );
      car.setCity(this.city);
      car.place(n.x + dir[0] * off + (alongX ? 2.2 : 0), n.z + dir[1] * off + (alongX ? 0 : 2.2),
        Math.atan2(dir[0], dir[1]));
      car.isStatic = true;
      this.group.add(mesh);
      const lampGeo = new THREE.SphereGeometry(0.13, 8, 8);
      const red = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      const blue = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0x2255ff }));
      const box = new THREE.Box3().setFromObject(mesh);
      const size = box.getSize(new THREE.Vector3());
      red.position.set(-0.35, size.y + 0.08, -0.2);
      blue.position.set(0.35, size.y + 0.08, -0.2);
      mesh.add(red, blue);
      const cop: Cop = { car, lamps: { red, blue }, ram: 0 };
      this.cops.push(cop);
      spawned.push(cop);
    }
    if (this.heat >= 4 && spawned.length > 1) spawned[1].spike = true;
    this.onEvent?.('roadblock');
    return spawned;
  }

  update(dt: number, player: CarController, playerRacing: boolean) {
    this.lampPhase += dt * 6;
    const blink = Math.sin(this.lampPhase) > 0;
    for (const cop of this.cops) {
      (cop.lamps.red.material as THREE.MeshBasicMaterial).color.setHex(blink ? 0xff2222 : 0x551111);
      (cop.lamps.blue.material as THREE.MeshBasicMaterial).color.setHex(blink ? 0x223cff : 0x111144);
    }
    if (!this.active) return;

    // --- spawn replacements / despawn far cops ---
    for (let k = this.cops.length - 1; k >= 0; k--) {
      const cop = this.cops[k];
      if (cop.car.isStatic) continue;
      const d = cop.car.pos.distanceTo(player.pos);
      if (d > 520) { this.group.remove(cop.car.mesh); this.cops.splice(k, 1); }
    }
    const mobile = this.cops.filter(c => !c.car.isStatic);
    if (mobile.length < this.copCount() && Math.random() < dt * 0.5) this.spawnCop(player.pos);

    // --- pursuit meter: fills when cops are close ---
    let nearest = Infinity;
    for (const cop of mobile) nearest = Math.min(nearest, cop.car.pos.distanceTo(player.pos));
    if (nearest < 65) this.meterAccum += dt * (1 - nearest / 65) * 0.5;
    else this.meterAccum -= dt * 0.1;
    this.meterAccum = Math.max(0, Math.min(0.5, this.meterAccum));
    this.meter = Math.min(1, this.meter + (nearest < 65 ? dt * 0.045 * (1 + this.heat * 0.25) : -dt * 0.06));
    if (this.meter >= 1 && this.heat < 5) {
      this.heat++;
      this.meter = 0.3;
      this.onEvent?.('heatup', this.heat);
      this.spawnCops();
    }

    // --- evade / bust ---
    if (nearest > 240) {
      this.evadeTimer += dt;
      if (this.evadeTimer > 9) {
        this.onEvent?.('escaped');
        return;
      }
    } else this.evadeTimer = 0;

    const slow = player.speed < 4.5;
    const cornered = nearest < 15;
    if (slow && cornered) {
      this.bustTimer += dt;
      if (this.bustTimer > 3.2) { this.onEvent?.('busted'); return; }
    } else this.bustTimer = Math.max(0, this.bustTimer - dt * 2);

    // --- roadblocks & spikes at heat 3+ ---
    this.roadblockCooldown -= dt;
    if (this.heat >= 3 && this.roadblockCooldown <= 0 && player.speed > 14) {
      this.roadblockCooldown = 22 - this.heat * 2;
      const block = this.spawnRoadblock(player);
      if (this.heat >= 4) this.onEvent?.('spike');
      void block;
    }

    // --- cop driving AI ---
    const pv = player.forward.clone().multiplyScalar(player.speed * 0.6);
    for (const cop of this.cops) {
      if (cop.car.isStatic) {
        // roadblock cops: solid obstacle for the player
        const d = cop.car.pos.distanceTo(player.pos);
        if (d < 3.6) {
          const push = new THREE.Vector2(player.pos.x - cop.car.pos.x, player.pos.z - cop.car.pos.z).normalize();
          player.vel.multiplyScalar(0.35);
          player.vel.add(push.multiplyScalar(6));
          player.crashedInto?.(0.7);
        }
        if (cop.spike && d < 5.5 && player.speed > 6) {
          cop.spike = false;
          player.applySpike(8);
          this.onEvent?.('spike');
        }
        continue;
      }
      cop.ram -= dt;
      const input = emptyInput();
      const tx = player.pos.x + pv.x, tz = player.pos.z + pv.y;
      const dx = tx - cop.car.pos.x, dz = tz - cop.car.pos.z;
      const want = Math.atan2(dx, dz);
      let dy = want - cop.car.yaw;
      while (dy > Math.PI) dy -= 2 * Math.PI;
      while (dy < -Math.PI) dy += 2 * Math.PI;
      input.steer = Math.max(-1, Math.min(1, dy * 2.4));
      input.throttle = 1;
      const dist = Math.hypot(dx, dz);
      if (Math.abs(dy) > 1.5 && cop.car.speed > 16) { input.throttle = 0.2; input.brake = 0.7; }
      if (dist < 30 && Math.abs(dy) < 0.5 && cop.ram <= 0) { input.nitro = true; if (Math.random() < dt) cop.ram = 6; }
      cop.car.update(dt, input);
      // cop hits player
      if (dist < 3.4) {
        const push = new THREE.Vector2(cop.car.pos.x - player.pos.x, cop.car.pos.z - player.pos.z).normalize();
        player.vel.add(push.multiplyScalar(-5));
        if (cop.ram <= 0) { player.crashedInto?.(0.35); cop.ram = 1.2; }
      }
    }
    void playerRacing;
    void PITCH;
  }

  /** Cop cars & roadblocks also block the player via this check from main. */
  isBusting(): boolean { return this.bustTimer > 0.5; }
  nearestCopDistance(p: THREE.Vector3): number {
    let m = Infinity;
    for (const c of this.cops) m = Math.min(m, c.car.pos.distanceTo(p));
    return m;
  }
}
