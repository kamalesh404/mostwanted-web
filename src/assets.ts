import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';

export interface ModelInfo {
  key: string;
  file: string;
  /** normalize to this target length (meters, largest horizontal dim) for vehicles */
  targetLength?: number;
  /** normalize to this height for buildings/props */
  targetHeight?: number;
  /** extra yaw applied at normalize time (radians) */
  yaw?: number;
  /** shadows on/off (buildings receive/cast) */
  shadow?: boolean;
}

/** All real 3D models used by the game (GLB, see CREDITS.md). */
export const MANIFEST: ModelInfo[] = [
  { key: 'ferrari',       file: 'ferrari.glb',       targetLength: 4.6, yaw: Math.PI, shadow: true },
  { key: 'sports_car_1',  file: 'sports_car_1.glb',  targetLength: 4.5, yaw: Math.PI, shadow: true },
  { key: 'muscle_car_1',  file: 'muscle_car_1.glb',  targetLength: 4.8, yaw: Math.PI, shadow: true },
  { key: 'sedan_1',       file: 'sedan_1.glb',       targetLength: 4.4, yaw: Math.PI, shadow: true },
  { key: 'sedan_2',       file: 'sedan_2.glb',       targetLength: 4.4, yaw: Math.PI, shadow: true },
  { key: 'taxi_1',        file: 'taxi_1.glb',        targetLength: 4.6, yaw: Math.PI, shadow: true },
  { key: 'police_1',      file: 'police_1.glb',      targetLength: 4.8, yaw: Math.PI, shadow: true },
  { key: 'van_1',         file: 'van_1.glb',         targetLength: 4.6, yaw: Math.PI, shadow: true },
  { key: 'building_1',    file: 'building_1.glb',    targetHeight: 46,  shadow: true },
  { key: 'building_2',    file: 'building_2.glb',    targetHeight: 30,  shadow: true },
  { key: 'building_3',    file: 'building_3.glb',    targetHeight: 22,  shadow: true },
  { key: 'building_4',    file: 'building_4.glb',    targetHeight: 14,  shadow: true },
  { key: 'building_5',    file: 'building_5.glb',    targetHeight: 18,  shadow: true },
  { key: 'building_6',    file: 'building_6.glb',    targetHeight: 60,  shadow: true },
  { key: 'building_8',    file: 'building_8.glb',    targetHeight: 12,  shadow: true },
  { key: 'streetlight_1', file: 'streetlight_1.glb', targetHeight: 7 },
  { key: 'tree_1',        file: 'tree_1.glb',        targetHeight: 8 },
  { key: 'tree_2',        file: 'tree_2.glb',        targetHeight: 11 },
];

export type ModelMap = Record<string, THREE.Group>;

/**
 * Load every manifest entry, normalizing scale/orientation so gameplay code can
 * place models by real-world meters. Returns templates to .clone() per instance.
 */
export async function loadModels(onProgress: (p: number, label: string) => void): Promise<ModelMap> {
  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');
  loader.setDRACOLoader(draco);
  const base = import.meta.env.BASE_URL || '/';
  const out: ModelMap = {};
  let done = 0;
  for (const info of MANIFEST) {
    onProgress(done / MANIFEST.length, info.file);
    const gltf = await loader.loadAsync(`${base}models/${info.file}`);
    const root = gltf.scene;
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    let scale = 1;
    if (info.targetLength) scale = info.targetLength / Math.max(size.x, size.z);
    else if (info.targetHeight) scale = info.targetHeight / Math.max(size.y, 0.01);
    // wrap in a group: inner node recentered+rescaled, outer node is the transform users set
    const inner = new THREE.Group();
    inner.add(root);
    root.position.set(-center.x, -box.min.y, -center.z);
    inner.scale.setScalar(scale);
    if (info.yaw) inner.rotation.y = info.yaw;
    const outer = new THREE.Group();
    outer.add(inner);
    outer.userData.size = size.clone().multiplyScalar(scale);
    if (info.shadow) root.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    out[info.key] = outer;
    done++;
    onProgress(done / MANIFEST.length, info.file);
  }
  return out;
}

/** Deep-clone a template including materials that we may tint per car. */
export function cloneModel(models: ModelMap, key: string, tint?: number): THREE.Group {
  const tpl = models[key];
  if (!tpl) throw new Error(`missing model ${key}`);
  const c = tpl.clone(true);
  if (tint !== undefined) {
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.material) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (std.color && !std.name.includes('noglass')) {
            std.color = new THREE.Color(tint).lerp(std.color, 0.35);
          }
        }
      }
    });
  }
  return c;
}
