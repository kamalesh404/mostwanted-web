import * as THREE from 'three';
import { GRID, type CityData } from './city';
import type { RaceDef } from './types';

export type RaceState = 'idle' | 'countdown' | 'racing' | 'finished';

const MARKER_COLORS: Record<string, number> = { race: 0xffd75e, boss: 0xff4030, safehouse: 0x35d97b };

export interface RaceMarker {
  def: RaceDef | 'safehouse' | 'boss';
  pos: THREE.Vector2;
  mesh: THREE.Mesh;
}

export class RaceManager {
  state: RaceState = 'idle';
  markers: RaceMarker[] = [];
  current: RaceDef | null = null;
  countdown = 0;
  raceTime = 0;
  cpIndex = 0;
  cps: THREE.Vector2[] = [];
  cpMeshes: THREE.Mesh[] = [];
  onEvent: ((e: string, data?: number) => void) | null = null;
  private group = new THREE.Group();
  private city: CityData;

  constructor(city: CityData) {
    this.city = city;
    this.buildRaces();
  }

  get root() { return this.group; }

  private makeRing(color: number): THREE.Mesh {
    const geo = new THREE.TorusGeometry(7, 0.5, 10, 40);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 });
    const m = new THREE.Mesh(geo, mat);
    return m;
  }

  private addMarker(pos: THREE.Vector2, kind: 'race' | 'boss' | 'safehouse', def: RaceDef | 'safehouse' | 'boss') {
    const ring = this.makeRing(MARKER_COLORS[kind]);
    ring.position.set(pos.x, 1.2, pos.y);
    this.group.add(ring);
    this.markers.push({ def, pos, mesh: ring });
  }

  /** Lay out races on the road grid: sprints across town, circuits around blocks. */
  private buildRaces() {
    const node = (i: number, j: number) => new THREE.Vector2(
      (i - (GRID - 1) / 2) * 96, (j - (GRID - 1) / 2) * 96);
    const mid = (GRID - 1) / 2;

    const sprintPaths: [number, number][][] = [
      [[0, 0], [0, 3], [4, 3], [4, 7], [8, 7]],
      [[8, 1], [5, 1], [5, 5], [1, 5], [1, 8]],
      [[2, 0], [2, 2], [6, 2], [6, 6], [8, 6]],
    ];
    sprintPaths.forEach((path, k) => {
      const cps = path.map(([i, j]) => node(i, j));
      const def: RaceDef = {
        id: `sprint${k}`, kind: 'sprint', name: `Sprint ${k + 1}`,
        reward: 1500 + k * 500, cps: cps.map(v => [v.x, v.y]),
      };
      this.addMarker(cps[0], 'race', def);
    });

    const circuits: [number, number][][] = [
      [[1, 1], [6, 1], [6, 4], [1, 4]],
      [[3, 5], [7, 5], [7, 8], [3, 8]],
    ];
    circuits.forEach((loop, k) => {
      const cps = loop.map(([i, j]) => node(i, j));
      cps.push(cps[0].clone()); // close the loop
      const def: RaceDef = {
        id: `circuit${k}`, kind: 'circuit', name: `Circuit ${k + 1}`,
        reward: 2500 + k * 800, cps: cps.map(v => [v.x, v.y]),
      };
      this.addMarker(cps[0], 'race', def);
    });

    // boss duel marker near the center
    this.addMarker(node(mid + 4, mid - 3), 'boss', 'boss');
    // safehouse/garage
    this.addMarker(node(mid, mid), 'safehouse', 'safehouse');
    this.city.nearestNode(0, 0); // keep city helper referenced
  }

  markerNear(pos: THREE.Vector3, radius = 14): RaceMarker | null {
    let best: RaceMarker | null = null;
    let bd = radius;
    for (const m of this.markers) {
      const d = Math.hypot(m.pos.x - pos.x, m.pos.y - pos.z);
      if (d < bd) { bd = d; best = m; }
    }
    return best;
  }

  hideMarker(marker: RaceMarker) { marker.mesh.visible = false; }
  showAllMarkers() { for (const m of this.markers) m.mesh.visible = true; }

  start(def: RaceDef) {
    this.current = def;
    this.cps = def.cps.map(([x, z]) => new THREE.Vector2(x, z));
    this.cpIndex = 0;
    this.state = 'countdown';
    this.countdown = 3.999;
    this.raceTime = 0;
    this.refreshCpVisuals();
  }

  startBoss(def: RaceDef) { this.start(def); }

  private refreshCpVisuals() {
    for (const m of this.cpMeshes) this.group.remove(m);
    this.cpMeshes = [];
    if (!this.current) return;
    this.cps.forEach((cp, idx) => {
      if (idx < this.cpIndex) return;
      const ring = this.makeRing(idx === this.cps.length - 1 ? 0x7dffb0 : 0x3fd0ff);
      ring.position.set(cp.x, 1.2, cp.y);
      this.group.add(ring);
      this.cpMeshes.push(ring);
    });
  }

  get nextCp(): THREE.Vector2 | null {
    if (!this.current || this.state !== 'racing' && this.state !== 'countdown') return null;
    return this.cps[Math.min(this.cpIndex, this.cps.length - 1)] ?? null;
  }

  /** true once the race transitions to finished (consumed by main) */
  update(dt: number, playerPos: THREE.Vector3, rivals: { progressMeters(): number; finished: boolean; finishTime: number }[]): { finished: boolean; place: number; time: number } | null {
    const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.08;
    for (const m of this.markers) if (m.mesh.visible) m.mesh.scale.setScalar(pulse);

    if (this.state === 'countdown') {
      this.countdown -= dt;
      if (this.countdown <= 1) {
        this.state = 'racing';
        this.onEvent?.('go');
      } else {
        this.onEvent?.('count', Math.ceil(this.countdown - 1));
      }
      return null;
    }
    if (this.state !== 'racing' || !this.current) return null;
    this.raceTime += dt;

    // checkpoint visuals pulse
    for (const m of this.cpMeshes) m.scale.setScalar(pulse);

    const cp = this.cps[this.cpIndex];
    if (cp && Math.hypot(cp.x - playerPos.x, cp.y - playerPos.z) < 13) {
      this.cpIndex++;
      this.refreshCpVisuals();
      this.onEvent?.('cp', this.cpIndex);
    }

    if (this.cpIndex >= this.cps.length) {
      this.state = 'finished';
      const myProgress = Infinity; // player finished
      void myProgress;
      let place = 1;
      for (const r of rivals) if (r.finished && r.finishTime < this.raceTime) place++;
      this.onEvent?.('finish', place);
      return { finished: true, place, time: this.raceTime };
    }
    return null;
  }

  abort() {
    this.state = 'idle';
    this.current = null;
    for (const m of this.cpMeshes) this.group.remove(m);
    this.cpMeshes = [];
    this.showAllMarkers();
  }
}
