// Decorative real-world props (CC0 models) that make the plant read as a working factory.
// Every placement is skipped silently if its model failed to load.
import * as THREE from 'three';
import { FLOOR, at, Batcher } from './core.js';
import { model } from './models.js';

const PLACE = [
  // name, options, x, y, z, rotationY
  // Production: overhead crane bridge spanning the line, carts and a drill press at the maintenance corner
  ['tool_cart', { width: 1.3 }, 16.5, FLOOR, 7.8, 0],
  ['industrial_storage_cart', { width: 1.6 }, 1.5, FLOOR, -2.8, 0],
  ['industrial_storage_cart', { width: 1.6 }, 44, FLOOR, 8.8, Math.PI],
  ['drill_press_01', { height: 1.7 }, 56, FLOOR, -19, -Math.PI / 2],
  ['drill_press_01', { height: 1.7 }, 58, FLOOR, -19, -Math.PI / 2],
  ['worn_metal_rack', { height: 2 }, 60, FLOOR, -19.5, -Math.PI / 2],
  ['WetFloorSign_01', { height: 0.65 }, 29, FLOOR, 9.0, 0.4],
  // Dock: hand truck, roller-shutter doors on the two bays without a docked truck
  ['hand_truck', { height: 1.4 }, -33.5, FLOOR, 21, 0.6],
  ['rollershutter_door', { node: 'rollershutter_door', fit: [4.1, 4.0, 0.3] }, -48, FLOOR, 24.25, 0],
  ['rollershutter_door', { node: 'rollershutter_door', fit: [4.1, 4.0, 0.3] }, -32, FLOOR, 24.25, 0],
  // Gate: concrete barriers channel the access road
  ['concrete_road_barrier', { width: 1.6 }, -52.6, FLOOR, 50, Math.PI / 2],
  ['concrete_road_barrier', { width: 1.6 }, -52.6, FLOOR, 52, Math.PI / 2],
  ['concrete_road_barrier', { width: 1.6 }, -52.6, FLOOR, 54, Math.PI / 2],
  ['exterior_aircon_unit', { node: 'exterior_aircon_unit', width: 0.9 }, -43.5, FLOOR, 45.0, Math.PI],
  // Office: shelving along the back wall
  ['steel_frame_shelves_03', { width: 2.3 }, -56, FLOOR, -44.6, 0],
  ['steel_frame_shelves_03', { width: 2.3 }, -22, FLOOR, -44.6, 0],
  // Server room / infrastructure: electrical and network cabinets
  // Maintenance corner + process area: oil drums, welding cart, parts shelves (Poly Haven CC0)
  ['Barrel_01', { height: 0.9 }, 52.4, FLOOR, -21, 0],
  ['Barrel_01', { height: 0.9 }, 53.1, FLOOR, -21.1, 1.2],
  ['Barrel_01', { height: 0.9 }, 52.75, FLOOR, -20.4, 2.5],
  ['Barrel_01', { height: 0.9 }, 13.2, FLOOR, 20.6, 0.4],
  ['Barrel_01', { height: 0.9 }, 13.9, FLOOR, 20.8, 2.0],
  ['Barrel_01', { height: 0.9 }, 13.5, FLOOR, 21.4, 3.1],
  ['portable_welding_cart', { height: 1.5 }, 50.6, FLOOR, -20.6, 0.3],
  ['steel_frame_shelves_02', { height: 2.1 }, 61.6, FLOOR, -15, -Math.PI / 2],
  ['steel_frame_shelves_02', { height: 2.1 }, 61.6, FLOOR, -13.8, -Math.PI / 2],
  ['steel_frame_shelves_02', { height: 2.1 }, 29.4, FLOOR, -16.6, 0],
  ['steel_frame_shelves_02', { height: 2.1 }, 59, FLOOR, -44.9, 0],
  // Office lounge next to the meeting room
  ['modern_arm_chair_01', { height: 1.0 }, 4.6, FLOOR, -30.4, Math.PI / 2],
  ['modern_arm_chair_01', { height: 1.0 }, 7.2, FLOOR, -30.4, -Math.PI / 2],
  // Outdoor electrical cabinets (gate, east wall)
  ['utility_box_02', { height: 1.15 }, -38.6, FLOOR, 41.6, Math.PI],
  ['utility_box_02', { height: 1.15 }, 65.2, 0.3, -30, -Math.PI / 2],
  ['utility_box_01', { height: 1.6 }, 22, FLOOR, -43.6, 0],
  ['utility_box_01', { height: 1.6 }, 23, FLOOR, -43.6, 0],
  ['power_box_01', { width: 0.8 }, 36, FLOOR + 1.0, -45.4, 0],
  ['utility_box_01', { height: 1.4 }, -20, FLOOR, -22.5, Math.PI / 2],
  ['utility_box_01', { height: 1.4 }, -61, FLOOR, 21, Math.PI / 2],
];

export function buildProps(root) {
  let n = 0;
  for (const [name, opts, x, y, z, ry] of PLACE) {
    const m = model(name, opts);
    if (!m) continue;
    at(m, x, y, z, root);
    m.rotation.y = ry;
    n++;
  }
  // Overhead crane on a runway: two steel beams on columns along the line, bridge spanning across it
  const crane = model('overhead_crane', { width: 15 });
  if (crane) {
    at(crane, 40, FLOOR + 2.2, 3, root);
    crane.rotation.y = Math.PI / 2;
    crane.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(crane);
    const top = bb.max.y, z0 = bb.min.z + 0.3, z1 = bb.max.z - 0.3;
    const b = new Batcher();
    for (const z of [z0, z1]) {
      b.add(30, 0.5, 0.35, 0xd97706, 40, top - 0.25, z);                  // runway beam (safety yellow-orange)
      for (let x = 26; x <= 54; x += 7) b.add(0.4, top - 0.5 - FLOOR, 0.4, 0x2f5d8a, x, FLOOR + (top - 0.5 - FLOOR) / 2, z);
    }
    b.build(root);
    n++;
  }
  return n;
}
