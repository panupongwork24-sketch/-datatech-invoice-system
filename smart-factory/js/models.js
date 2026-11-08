// Real 3D models (CC0 Poly Haven + CC-BY Sketchfab, see credits.md) — loaded once, then cloned or instanced.
// Dev mode loads assets/models/<name>.glb; the single-file build embeds them as base64 in window.__SF_MODELS.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const MODEL_NAMES = [
  'cardboard_box_01', 'plastic_crate_02', 'plastic_crate_03', 'security_camera_01', 'security_camera_02',
  'metal_office_desk', 'potted_plant_01', 'potted_plant_02', 'overhead_crane', 'industrial_storage_cart',
  'tool_cart', 'drill_press_01', 'hand_truck', 'power_box_01', 'utility_box_01', 'exterior_aircon_unit',
  'concrete_road_barrier', 'WetFloorSign_01', 'steel_frame_shelves_03', 'worn_metal_rack', 'rollershutter_door',
  // Sketchfab (CC-BY) vehicles — passenger_cars holds one child node per car: car_sedan, car_hatchback, …
  'forklift_truck', 'box_truck', 'passenger_cars',
];

const lib = new Map();

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Load every model; missing / failing models are skipped (callers fall back to primitives). */
export async function loadModels(onProgress) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const embedded = window.__SF_MODELS;
  let done = 0;
  await Promise.all(MODEL_NAMES.map(async (name) => {
    try {
      const gltf = embedded
        ? await loader.parseAsync(b64ToBuffer(embedded[name]), '')
        : await loader.loadAsync(`assets/models/${name}.glb`);
      const root = gltf.scene;
      root.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true; o.receiveShadow = true;
          o.userData.fromModel = true;
        }
      });
      lib.set(name, root);
    } catch (e) {
      console.warn('model failed', name, e);
    }
    onProgress && onProgress(++done / MODEL_NAMES.length);
  }));
}

export const hasModel = (name) => lib.has(name);

/**
 * Clone a model, normalised so its footprint is centred on the origin and it stands on y = 0.
 * opts: { node } pick one child node by name; { height | width | depth | fit:[w,h,d] } target size in metres.
 */
export function model(name, opts = {}) {
  const src = lib.get(name);
  if (!src) return null;
  let obj = src;
  if (opts.node) obj = src.getObjectByName(opts.node) || src;
  const clone = obj.clone(true);
  clone.position.set(0, 0, 0);
  const wrap = new THREE.Group();
  wrap.add(clone);
  const box = new THREE.Box3().setFromObject(clone);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  clone.position.set(-centre.x, -box.min.y, -centre.z);
  if (opts.fit) wrap.scale.set(opts.fit[0] / size.x, opts.fit[1] / size.y, opts.fit[2] / size.z);
  else if (opts.height) wrap.scale.setScalar(opts.height / size.y);
  else if (opts.width) wrap.scale.setScalar(opts.width / size.x);
  else if (opts.depth) wrap.scale.setScalar(opts.depth / size.z);
  return wrap;
}

/**
 * Many copies of one model as InstancedMesh (one draw call per sub-mesh).
 * items: [{ x, y, z, rotY, size:[w,h,d] }] — each copy is scaled to `size` and stands on y.
 */
export function instanced(name, items, parent) {
  const src = lib.get(name);
  if (!src || !items.length) return false;
  src.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(src);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const norm = new THREE.Matrix4().makeTranslation(-centre.x, -box.min.y, -centre.z);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  src.traverse((mesh) => {
    if (!mesh.isMesh) return;
    const local = norm.clone().multiply(mesh.matrixWorld);
    const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, items.length);
    items.forEach((it, i) => {
      const [w, h, d] = it.size;
      q.setFromEuler(e.set(0, it.rotY || 0, 0));
      m4.compose(p.set(it.x, it.y, it.z), q, s.set(w / size.x, h / size.y, d / size.z)).multiply(local);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = true;
    parent.add(im);
  });
  return true;
}
