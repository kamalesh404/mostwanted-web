import * as THREE from 'three';
import type { ModelMap } from './assets';

export const PITCH = 96;   // distance between road centerlines (m)
export const ROAD_W = 16;  // road width (m)
export const GRID = 9;     // road nodes per axis
export const WORLD_HALF = ((GRID - 1) * PITCH) / 2;

export interface AABB { minX: number; maxX: number; minZ: number; maxZ: number; }

export interface CityData {
  group: THREE.Group;
  colliders: AABB[];
  /** road node world position */
  node(i: number, j: number): THREE.Vector2;
  /** nearest road node indices to a world position */
  nearestNode(x: number, z: number): { i: number; j: number; x: number; z: number };
  isRoad(x: number, z: number): boolean;
  /** true if position is inside a drivable block (park/lot) */
  isBlockOpen(x: number, z: number): boolean;
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Build InstancedMeshes for a template model placed at many transforms. */
function instanceModel(tpl: THREE.Object3D, mats: THREE.Matrix4[], name: string): THREE.Group {
  const out = new THREE.Group();
  out.name = name;
  const meshes: THREE.Mesh[] = [];
  tpl.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  for (const src of meshes) {
    src.updateWorldMatrix(true, false);
    const rel = src.matrixWorld.clone();
    const inst = new THREE.InstancedMesh(src.geometry, src.material as THREE.Material, mats.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    for (let k = 0; k < mats.length; k++) {
      inst.setMatrixAt(k, mats[k].clone().multiply(rel));
    }
    inst.instanceMatrix.needsUpdate = true;
    inst.frustumCulled = false;
    out.add(inst);
  }
  return out;
}

function asphaltTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#33363b'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.random() * 45;
    g.fillStyle = `rgba(${v},${v},${v + 4},${0.25 + Math.random() * 0.4})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(48, 48);
  return t;
}

function concreteTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#8d9095'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 2500; i++) {
    const v = 130 + Math.random() * 50;
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2);
  }
  g.strokeStyle = 'rgba(60,62,66,0.55)'; g.lineWidth = 2;
  for (let i = 0; i <= 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function buildCity(models: ModelMap): CityData {
  const group = new THREE.Group();
  const colliders: AABB[] = [];
  const half = WORLD_HALF;
  const center = (GRID - 1) / 2;
  const nodeX = (i: number) => (i - center) * PITCH;

  // ---- ground: asphalt covering the whole map ----
  const groundMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.95, metalness: 0.02 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(half * 2 + 400, half * 2 + 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---- lane markings: dashed center lines along every road ----
  const dashGeo = new THREE.PlaneGeometry(0.35, 3.2);
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xe8e4d0, roughness: 0.8 });
  const dashes: THREE.Matrix4[] = [];
  const edgeGeo = new THREE.PlaneGeometry(0.22, PITCH);
  const edges: THREE.Matrix4[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  const scale1 = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < GRID; i++) {
    for (let d = -half + 6; d < half; d += 9) {
      // vertical road (along z) at x = nodeX(i)
      dashes.push(m4.clone().compose(new THREE.Vector3(nodeX(i), 0.02, d), q, scale1));
      // horizontal road (along x) at z = nodeX(i)
      const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
      dashes.push(m4.clone().compose(new THREE.Vector3(d, 0.02, nodeX(i)), q2, scale1));
    }
    // solid edge lines
    for (let j = 0; j < GRID - 1; j++) {
      const zc = (nodeX(j) + nodeX(j + 1)) / 2;
      const xc = (nodeX(j) + nodeX(j + 1)) / 2;
      for (const s of [-1, 1]) {
        edges.push(m4.clone().compose(new THREE.Vector3(nodeX(i) + s * (ROAD_W / 2 - 0.6), 0.015, zc), q, scale1));
        const q3 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2));
        edges.push(m4.clone().compose(new THREE.Vector3(xc, 0.015, nodeX(i) + s * (ROAD_W / 2 - 0.6)), q3, scale1));
      }
    }
  }
  const dashMesh = new THREE.InstancedMesh(dashGeo, dashMat, dashes.length);
  dashes.forEach((m, k) => dashMesh.setMatrixAt(k, m));
  dashMesh.instanceMatrix.needsUpdate = true;
  dashMesh.frustumCulled = false;
  group.add(dashMesh);
  const edgeMesh = new THREE.InstancedMesh(edgeGeo, dashMat, edges.length);
  edges.forEach((m, k) => edgeMesh.setMatrixAt(k, m));
  edgeMesh.instanceMatrix.needsUpdate = true;
  edgeMesh.frustumCulled = false;
  group.add(edgeMesh);

  // ---- blocks: sidewalks, buildings, parks, parking lots ----
  const walkMat = new THREE.MeshStandardMaterial({ map: concreteTexture(), roughness: 0.9 });
  const blockSize = PITCH - ROAD_W;
  const openBlocks: AABB[] = [];
  const buildingVariants = ['building_1', 'building_2', 'building_3', 'building_4', 'building_5', 'building_6', 'building_8'];
  const buildingTransforms: Record<string, THREE.Matrix4[]> = {};
  for (const v of buildingVariants) buildingTransforms[v] = [];
  const treeTransforms: THREE.Matrix4[] = [];
  const lightTransforms: THREE.Matrix4[] = [];
  const tq = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);

  for (let i = 0; i < GRID - 1; i++) {
    for (let j = 0; j < GRID - 1; j++) {
      const cx = (nodeX(i) + nodeX(i + 1)) / 2;
      const cz = (nodeX(j) + nodeX(j + 1)) / 2;
      const inner = blockSize - 3;
      // sidewalk slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(inner, 0.34, inner), walkMat);
      slab.position.set(cx, 0.17, cz);
      slab.receiveShadow = true;
      group.add(slab);
      const distFromCenter = Math.hypot(cx, cz) / half;
      const roll = Math.random();
      const kind: 'towers' | 'buildings' | 'park' | 'lot' =
        distFromCenter < 0.35 && roll < 0.55 ? 'towers' : roll < 0.72 ? 'buildings' : roll < 0.87 ? 'park' : 'lot';

      if (kind === 'park' || kind === 'lot') {
        openBlocks.push({ minX: cx - inner / 2, maxX: cx + inner / 2, minZ: cz - inner / 2, maxZ: cz + inner / 2 });
      }
      if (kind === 'towers') {
        const v = Math.random() < 0.4 ? 'building_6' : Math.random() < 0.5 ? 'building_1' : 'building_2';
        const sx = rnd(0.85, 1.15);
        buildingTransforms[v].push(m4.clone().compose(
          new THREE.Vector3(cx, 0.34, cz), tq.clone().setFromEuler(new THREE.Euler(0, rnd(0, Math.PI), 0)), new THREE.Vector3(sx, rnd(1, 1.7), sx)));
        colliders.push({ minX: cx - 15 * sx, maxX: cx + 15 * sx, minZ: cz - 15 * sx, maxZ: cz + 15 * sx });
      } else if (kind === 'buildings') {
        const count = Math.random() < 0.5 ? 1 : 2;
        for (let b = 0; b < count; b++) {
          const v = buildingVariants[Math.floor(Math.random() * buildingVariants.length)];
          const ox = count === 1 ? 0 : (b === 0 ? -1 : 1) * inner * 0.24;
          const oz = count === 1 ? 0 : rnd(-6, 6);
          const sx = rnd(0.7, 1.05);
          const bq = tq.clone().setFromEuler(new THREE.Euler(0, Math.round(rnd(0, 4)) * Math.PI / 2, 0));
          buildingTransforms[v].push(m4.clone().compose(new THREE.Vector3(cx + ox, 0.34, cz + oz), bq, new THREE.Vector3(sx, rnd(0.6, 1.1), sx)));
          const hw = (count === 1 ? 16 : 9) * sx;
          colliders.push({ minX: cx + ox - hw, maxX: cx + ox + hw, minZ: cz + oz - hw, maxZ: cz + oz + hw });
        }
      } else if (kind === 'park') {
        for (let t = 0; t < 6; t++) {
          treeTransforms.push(m4.clone().compose(
            new THREE.Vector3(cx + rnd(-inner / 2 + 5, inner / 2 - 5), 0.34, cz + rnd(-inner / 2 + 5, inner / 2 - 5)),
            tq.clone().setFromEuler(new THREE.Euler(0, rnd(0, 6.28), 0)), one.clone().setScalar(rnd(0.7, 1.2))));
        }
      } else {
        // parking lot: a few trees around the edge only
        for (let t = 0; t < 3; t++) {
          treeTransforms.push(m4.clone().compose(
            new THREE.Vector3(cx + rnd(-inner / 2 + 4, inner / 2 - 4), 0.34, cz + (Math.random() < 0.5 ? -1 : 1) * (inner / 2 - 3)),
            tq.clone().setFromEuler(new THREE.Euler(0, rnd(0, 6.28), 0)), one.clone().setScalar(rnd(0.6, 0.9))));
        }
      }

      // street lights along the four block edges
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as [number, number][]) {
        if (Math.random() < 0.55) {
          lightTransforms.push(m4.clone().compose(
            new THREE.Vector3(cx + dx * (inner / 2 + 1.6), 0.2, cz + dz * (inner / 2 + 1.6)),
            tq.clone().setFromEuler(new THREE.Euler(0, rnd(0, 6.28), 0)), one.clone()));
        }
      }
    }
  }

  for (const v of buildingVariants) {
    if (buildingTransforms[v].length) group.add(instanceModel(models[v], buildingTransforms[v], `b_${v}`));
  }
  if (treeTransforms.length) group.add(instanceModel(models['tree_1'], treeTransforms, 'trees'));
  if (lightTransforms.length) group.add(instanceModel(models['streetlight_1'], lightTransforms, 'lights'));

  // ---- boundary barriers so the player stays in the city ----
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.8 });
  const wallLen = half * 2 + 60;
  const walls: [number, number, number, number][] = [
    [0, -half - 24, wallLen, 2], [0, half + 24, wallLen, 2],
    [-half - 24, 0, 2, wallLen], [half + 24, 0, 2, wallLen],
  ];
  for (const [x, z, w, d] of walls) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, d), barrierMat);
    m.position.set(x, 1.1, z);
    m.castShadow = true; m.receiveShadow = true;
    group.add(m);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
  }

  const node = (i: number, j: number) => new THREE.Vector2(nodeX(i), nodeX(j));

  const data: CityData = {
    group,
    colliders,
    node,
    nearestNode(x, z) {
      const i = Math.max(0, Math.min(GRID - 1, Math.round(x / PITCH + center)));
      const j = Math.max(0, Math.min(GRID - 1, Math.round(z / PITCH + center)));
      return { i, j, x: nodeX(i), z: nodeX(j) };
    },
    isRoad(x, z) {
      const fx = Math.abs(((x / PITCH + center) % 1 + 1) % 1 - 0.5);
      const fz = Math.abs(((z / PITCH + center) % 1 + 1) % 1 - 0.5);
      return fx * PITCH > PITCH / 2 - ROAD_W / 2 || fz * PITCH > PITCH / 2 - ROAD_W / 2;
    },
    isBlockOpen(x, z) {
      return openBlocks.some(b => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ);
    },
  };
  return data;
}

/** Push a circle out of the city colliders; returns the hit normal or null. */
export function resolveCollisions(pos: THREE.Vector3, radius: number, colliders: AABB[]): THREE.Vector2 | null {
  let hit: THREE.Vector2 | null = null;
  for (const c of colliders) {
    const cx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const cz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - cx, dz = pos.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      const d = Math.sqrt(d2) || 0.0001;
      const nx = dx / d, nz = dz / d;
      const push = radius - d;
      pos.x += nx * push; pos.z += nz * push;
      hit = new THREE.Vector2(nx, nz);
    }
  }
  return hit;
}
