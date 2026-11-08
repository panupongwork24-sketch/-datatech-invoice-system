// Static environment (site, zones, roads, walls) + ambient actors (people, cars, trucks).
import * as THREE from 'three';
import { model, hasModel } from './models.js';
import { ZONES, FLOOR, gsap, mat, basic, box, cyl, sphere, at, v3, Batcher, Screen, txt, hex, pathCurve, placeOn, floorTexture } from './core.js';

export function buildWorld(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group();
  scene.add(root);

  // Ground: dark asphalt yard around the building
  const groundTex = floorTexture('#1b1e23', { joints: false, noise: 22, stains: 40 }).clone();
  groundTex.needsUpdate = true; groundTex.repeat.set(60, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);

  // Site slab (the concrete the fiber runs inside). Transparent in X-ray mode.
  const xrayMats = [];
  const siteMat = new THREE.MeshStandardMaterial({ color: 0x353a41, roughness: 0.9 });
  xrayMats.push(siteMat);
  const site = at(new THREE.Mesh(new THREE.BoxGeometry(132, 0.3, 104), siteMat), 0, 0.15, 4, root);
  site.receiveShadow = true;

  // Real-world floor finish per zone (texture metres per tile = 4)
  const FINISH = {
    gate: ['#4f5358', true], dock: ['#5d6268', true], warehouse: ['#676c73', true], amr: ['#565e68', true],
    production: ['#40574a', true], office: ['#3f4656', false], infra: ['#6c727a', true],
  };
  const zoneLabels = {};
  for (const [id, z] of Object.entries(ZONES)) {
    const w = z.x[1] - z.x[0], d = z.z[1] - z.z[0];
    const cx = (z.x[0] + z.x[1]) / 2, cz = (z.z[0] + z.z[1]) / 2;
    const [col, joints] = FINISH[id];
    const t0 = floorTexture(col, { joints, noise: joints ? 16 : 30 });
    const tex = t0.clone(); tex.needsUpdate = true; tex.repeat.set(w / 4, d / 4);
    // Epoxy-coated floors: low roughness so the warehouse HDRI shows as a soft sheen (office stays matte)
    const tm = new THREE.MeshStandardMaterial({ map: tex, roughness: id === 'production' || id === 'amr' ? 0.3 : id === 'office' ? 0.7 : 0.45, metalness: 0.05, envMapIntensity: 1.1 });
    xrayMats.push(tm);
    const tile = at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), tm), cx, 0.32, cz, root);
    tile.receiveShadow = true;
    // Zone colour kept as a thin glowing border (presentation colour coding)
    const em = basic(z.color, { toneMapped: false });
    const t = 0.09;
    at(box(w, 0.03, t, em), cx, FLOOR + 0.01, z.z[0] + t / 2, root).castShadow = false;
    at(box(w, 0.03, t, em), cx, FLOOR + 0.01, z.z[1] - t / 2, root).castShadow = false;
    at(box(t, 0.03, d, em), z.x[0] + t / 2, FLOOR + 0.01, cz, root).castShadow = false;
    at(box(t, 0.03, d, em), z.x[1] - t / 2, FLOOR + 0.01, cz, root).castShadow = false;

    // Floor-painted zone name (re-drawn on language change)
    const s = new Screen(Math.min(w - 2, 18), 2.2, 1024, 128, (c, W, H, st) => {
      c.clearRect(0, 0, W, H);
      txt(c, (st.text || '').toUpperCase(), 12, H / 2, 74, hex(z.color), 800);
    }, { transparent: true, text: id });
    s.mesh.material.opacity = 0.5;
    s.mesh.material.depthWrite = false;
    s.mesh.rotation.x = -Math.PI / 2;
    const lw = Math.min(w - 2, 18);
    at(s.mesh, z.x[0] + 1 + lw / 2, FLOOR + 0.03, z.z[1] - 1.6, root);
    zoneLabels[id] = s;
  }

  // Roads: asphalt with painted markings
  const asphalt = (w, d) => { const t = floorTexture('#25282d', { joints: false, noise: 26, stains: 30 }).clone(); t.needsUpdate = true; t.repeat.set(w / 6, d / 6); return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 }); };
  const flat = (w, h, d, m) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.receiveShadow = true; return o; };
  at(flat(44, 0.04, 10.8, asphalt(44, 10.8)), -42, 0.33, 29.6, root); // dock apron
  at(flat(132, 0.05, 4.4, asphalt(132, 4.4)), 0, 0.33, 37.4, root);
  at(flat(5, 0.06, 16.6, asphalt(5, 16.6)), -49.5, 0.34, 47.7, root);
  const b = new Batcher();
  for (let x = -63; x < 64; x += 4) b.add(1.8, 0.02, 0.16, 0xf1f5f9, x, 0.37, 37.4);
  for (let z = 41.5; z < 56; z += 4) b.add(0.16, 0.02, 1.8, 0xf1f5f9, -49.5, 0.38, z);
  // Yellow safety walkway lines (pairs) along main aisles
  const Y = 0xeab308;
  for (const z of [9.6, 11.4, -9.4, -11.2]) b.add(64, 0.012, 0.1, Y, 29, FLOOR + 0.006, z);
  for (const z of [-3.6, -5.4]) b.add(38, 0.012, 0.1, Y, -42, FLOOR + 0.006, z);
  for (const x of [-37.6, -42.4]) b.add(0.1, 0.012, 13, Y, x, FLOOR + 0.006, 16.5);
  // Hatched no-go box in front of the dock doors
  for (let x = -60; x < -24; x += 1.2) b.add(0.12, 0.012, 1.6, Y, x, FLOOR + 0.006, 23.0, 0.6);

  // Building shell: tall insulated-panel walls (north / west) with window band and steel columns.
  // The south and east sides stay open like a cut-away so the camera can look in.
  const wallM = new THREE.MeshStandardMaterial({ color: 0x8e96a3, roughness: 0.6, metalness: 0.3 });
  xrayMats.push(wallM);
  const WH = 7.5;
  at(new THREE.Mesh(new THREE.BoxGeometry(128, WH, 0.35), wallM), 0, WH / 2, -46, root).castShadow = true;
  at(new THREE.Mesh(new THREE.BoxGeometry(0.35, WH, 72), wallM), -64, WH / 2, -10, root).castShadow = true;
  const winM = new THREE.MeshStandardMaterial({ color: 0x9ec9ff, emissive: 0x6aa8ff, emissiveIntensity: 0.35, roughness: 0.1, metalness: 0.8 });
  at(new THREE.Mesh(new THREE.BoxGeometry(126, 1.0, 0.05), winM), 0, 5.6, -45.8, root);
  at(new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 70), winM), -63.8, 5.6, -10, root);
  for (let x = -60; x <= 60; x += 8) { b.add(0.45, WH, 0.45, 0x2f5d8a, x, WH / 2, -45.6); b.add(0.6, 0.25, 0.6, 0x2f5d8a, x, WH, -45.6); }
  for (let z = -42; z <= 22; z += 8) { b.add(0.45, WH, 0.45, 0x2f5d8a, -63.6, WH / 2, z); }
  // Corrugation ribs on the wall panels
  for (let x = -63; x < 64; x += 1.0) b.add(0.06, WH - 2.2, 0.06, 0xb4bac4, x, (WH - 2.2) / 2 + 0.3, -45.78);
  // Low east wall + glass partition to offices
  at(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 72), wallM), 64, 0.55, -10, root);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false });
  at(new THREE.Mesh(new THREE.BoxGeometry(124, 2.4, 0.06), glass), 0, FLOOR + 1.2, -25.5, root);
  for (let x = -60; x <= 60; x += 4) b.add(0.06, 2.4, 0.08, 0x64748b, x, FLOOR + 1.2, -25.5);
  // Dock doors: frames, rubber seals and leveller plates
  for (const x of [-56, -48, -40, -32]) {
    b.add(4.2, 0.25, 0.4, 0x111827, x, FLOOR + 0.6, 24.2);
    b.add(0.3, 4.2, 0.3, 0x475569, x - 2.1, FLOOR + 2.1, 24.1);
    b.add(0.3, 4.2, 0.3, 0x475569, x + 2.1, FLOOR + 2.1, 24.1);
    b.add(4.5, 0.4, 0.4, 0x475569, x, FLOOR + 4.2, 24.1);
    b.add(3.2, 0.04, 1.2, 0x6b7280, x, FLOOR + 0.03, 23.4);
    b.add(0.35, 0.35, 0.25, 0x111827, x - 1.3, FLOOR + 0.4, 24.45);
    b.add(0.35, 0.35, 0.25, 0x111827, x + 1.3, FLOOR + 0.4, 24.45);
  }
  // Parking stripes south of the road (east)
  for (let x = -20; x < 60; x += 3.2) b.add(0.12, 0.02, 4, 0xe2e8f0, x, 0.36, 44);
  b.build(root);

  // Landscaping: lawn strips and trees outside the site
  const lawn = new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 1 });
  for (const [x, z, w, d] of [[0, 56.5, 132, 5], [-70, 4, 6, 104], [70, 4, 6, 104]]) {
    const g = at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), lawn), x, 0.06, z, root); g.receiveShadow = true;
  }
  const leaf = new THREE.MeshStandardMaterial({ color: 0x2e5e2e, roughness: 0.9 });
  const trunk = new THREE.MeshStandardMaterial({ color: 0x5b4636, roughness: 0.9 });
  const treeAt = (x, z, s) => {
    const t = new THREE.Group();
    at(new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.22 * s, 1.6 * s, 8), trunk), 0, 0.8 * s, 0, t).castShadow = true;
    for (const [dx, dy, dz, r] of [[0, 2.3, 0, 1.1], [0.6, 2.0, 0.3, 0.8], [-0.5, 2.1, -0.4, 0.85], [0.1, 2.9, -0.1, 0.7]]) {
      const m = at(new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 1), leaf), dx * s, dy * s, dz * s, t); m.castShadow = true;
    }
    at(t, x, 0.1, z, root);
  };
  for (let x = -60; x <= 60; x += 9) treeAt(x + (x % 2) * 1.5, 57, 1 + ((x * 7) % 3) * 0.12);
  for (let z = -40; z <= 50; z += 10) { treeAt(-70, z, 1.1); treeAt(70, z + 4, 1.0); }

  // Parked cars
  const carColors = [0x64748b, 0xe2e8f0, 0x1d4ed8, 0xb91c1c, 0x0f766e, 0x475569];
  for (let i = 0; i < 12; i++) {
    if (Math.random() < 0.25) continue;
    const c = car(carColors[i % carColors.length]);
    at(c, -18.4 + i * 3.2, FLOOR - 0.04, 44, root);
    c.rotation.y = Math.random() < 0.5 ? 0 : Math.PI;
  }

  // Trucks: one docked, one driving along the road
  // Rear of the cargo box sits against the dock (z ≈ 24.35) whatever the truck length
  const dockZ = hasModel('box_truck') ? 24.4 + TRUCK_LEN / 2 : 29.8;
  const docked = truck(0xe2e8f0);
  at(docked, -40, FLOOR - 0.04, dockZ, root);
  docked.rotation.y = 0; // trailer rear toward the dock (-z)
  const docked2 = truck(0xcbd5e1);
  at(docked2, -56, FLOOR - 0.04, dockZ, root);

  const updaters = [];

  // Road traffic loop (east ↔ west), decorative
  const roadCar = car(0x0ea5e9);
  root.add(roadCar);
  const roadCurve = pathCurve([[66, 0.3, 36.3], [-66, 0.3, 36.3]], 0);
  const rc = { u: 0 };
  gsap.to(rc, { u: 1, duration: 16, repeat: -1, ease: 'none', delay: 3, onUpdate: () => placeOn(roadCar, roadCurve, rc.u) });
  placeOn(roadCar, roadCurve, 0);

  const movingTruck = truck(0xf1f5f9);
  root.add(movingTruck);
  const tc = { u: 0 };
  const truckCurve = pathCurve([[-70, 0.3, 38.5], [70, 0.3, 38.5]], 0);
  gsap.to(tc, { u: 1, duration: 24, repeat: -1, ease: 'none', delay: 8, onUpdate: () => placeOn(movingTruck, truckCurve, tc.u) });
  placeOn(movingTruck, truckCurve, 0);

  // Ambient workers walking around the site
  const walkers = [
    { c: 0xf59e0b, a: [-30, 14], b: [-30, 20], d: 6 },
    { c: 0x38bdf8, a: [-58, -3], b: [-30, -3], d: 14 },
    { c: 0x22c55e, a: [0, 10.5], b: [44, 10.5], d: 20 },
    { c: 0x22c55e, a: [40, -10], b: [8, -10], d: 16 },
    { c: 0xa855f7, a: [-18, 18], b: [-8, 18], d: 7 },
    { c: 0xec4899, a: [-58, -30], b: [-4, -30], d: 22 },
    { c: 0x14b8a6, a: [16, -30], b: [56, -30], d: 18 },
  ];
  for (const w of walkers) {
    const p = person(w.c);
    root.add(p);
    const curve = pathCurve([[w.a[0], FLOOR, w.a[1]], [w.b[0], FLOOR, w.b[1]]], 0);
    const o = { u: Math.random() };
    let dir = 1;
    updaters.push((t, dt) => {
      o.u += (dir * dt) / w.d;
      if (o.u > 1) { o.u = 1; dir = -1; } else if (o.u < 0) { o.u = 0; dir = 1; }
      placeOn(p, curve, o.u, dir < 0);
      p.children[0].position.y = 0.55 + Math.abs(Math.sin(t * 7 + w.d)) * 0.06;
    });
  }

  function setXray(on) {
    for (const m of xrayMats) {
      m.transparent = true;
      m.depthWrite = !on;
      gsap.to(m, { opacity: on ? 0.13 : 1, duration: 0.8, onComplete: () => { if (!on) { m.transparent = false; m.depthWrite = true; m.needsUpdate = true; } } });
      m.needsUpdate = true;
    }
  }

  return { root, zoneLabels, updaters, setXray };
}

/* ---------- reusable low-poly actors ---------- */
export function person(color = 0x22c55e, { seated = false, helmet = true } = {}) {
  // Worker: trousers, shirt, hi-vis vest in the zone colour with reflective bands, arms, head, hard hat.
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.position.y = 0.55;
  const skin = mat(0xe0b48f, { roughness: 0.7, metalness: 0 });
  const cloth = mat(0x1f2937, { roughness: 0.85, metalness: 0 });
  const vest = mat(color, { roughness: 0.6, metalness: 0 });
  const tape = mat(0xe5e7eb, { roughness: 0.3, metalness: 0.4 });
  const torsoY = seated ? 0.22 : 0.42;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 12), cloth);
  torso.position.y = torsoY; torso.castShadow = true; body.add(torso);
  const v = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.225, 0.42, 14), vest);
  v.position.y = torsoY + 0.02; v.castShadow = true; body.add(v);
  for (const dy of [-0.08, 0.08]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.218, 0.228, 0.035, 14), tape); t.position.y = torsoY + dy; body.add(t);
  }
  for (const sx of [-0.26, 0.26]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.38, 4, 8), cloth);
    arm.position.set(sx, torsoY - 0.02, 0.02); arm.rotation.z = sx > 0 ? 0.12 : -0.12; arm.castShadow = true; body.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.055, 10, 8), skin); hand.position.set(sx * 1.08, torsoY - 0.27, 0.03); body.add(hand);
  }
  const neckY = torsoY + 0.42;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 18, 14), skin);
  head.position.y = neckY + 0.1; head.castShadow = true; body.add(head);
  if (helmet) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfacc15, { roughness: 0.35, metalness: 0.05 }));
    h.position.y = head.position.y + 0.03; h.castShadow = true; body.add(h);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 18), h.material); brim.position.y = head.position.y + 0.03; body.add(brim);
  } else {
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.155, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.2), mat(0x2b2118, { roughness: 0.9, metalness: 0 }));
    hair.position.y = head.position.y + 0.01; body.add(hair);
  }
  if (!seated) {
    for (const sx of [-0.1, 0.1]) {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.42, 4, 8), cloth);
      leg.position.set(sx, -0.22, 0); leg.castShadow = true; body.add(leg);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.07, 0.24), mat(0x111111, { roughness: 0.6, metalness: 0 }));
      shoe.position.set(sx, -0.5, 0.04); body.add(shoe);
    }
  }
  return g;
}

// Sketchfab car pack (CC-BY): native scale in metres, front faces +Z. Falls back to primitives.
const CAR_KINDS = ['sedan', 'hatchback', 'compact', 'minivan', 'coupe', 'pickup'];
let carSeq = 0;
export function car(color, kind) {
  const m = model('passenger_cars', { node: 'car_' + (kind || CAR_KINDS[carSeq++ % CAR_KINDS.length]) });
  if (m) return m;
  const g = new THREE.Group();
  at(box(1.8, 0.6, 3.8, color), 0, 0.55, 0, g);
  at(box(1.6, 0.55, 2.0, 0x0f172a), 0, 1.1, -0.2, g);
  for (const [x, z] of [[-0.9, 1.2], [0.9, 1.2], [-0.9, -1.2], [0.9, -1.2]]) {
    const w = cyl(0.34, 0.34, 0.25, 8, 0x0b0f19);
    w.rotation.z = Math.PI / 2;
    at(w, x, 0.34, z, g);
  }
  const hl = basic(0xfef9c3, { toneMapped: false });
  at(box(0.4, 0.15, 0.05, hl), -0.55, 0.65, 1.92, g);
  at(box(0.4, 0.15, 0.05, hl), 0.55, 0.65, 1.92, g);
  return g;
}

export const TRUCK_LEN = 5.7; // box-truck model length after scaling (m)
export function truck(color) {
  const m = model('box_truck', { width: 2.3 }); // front faces +Z, box at the rear (-Z)
  if (m) return m;
  const g = new THREE.Group();
  at(box(2.5, 2.7, 8.5, color), 0, 1.95, -1.2, g);
  at(box(2.4, 2.0, 2.2, 0x1e3a8a), 0, 1.4, 4.4, g);
  at(box(2.2, 0.8, 0.05, 0x0f172a), 0, 1.9, 5.52, g);
  for (const z of [-4.2, -3.0, 0.8, 4.4]) {
    for (const x of [-1.15, 1.15]) {
      const w = cyl(0.45, 0.45, 0.35, 8, 0x0b0f19);
      w.rotation.z = Math.PI / 2;
      at(w, x, 0.45, z, g);
    }
  }
  return g;
}
