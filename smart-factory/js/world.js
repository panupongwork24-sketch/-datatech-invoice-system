// Static environment (site, zones, roads, walls) + ambient actors (people, cars, trucks).
import * as THREE from 'three';
import { ZONES, FLOOR, gsap, mat, basic, box, cyl, sphere, at, v3, Batcher, Screen, txt, hex, pathCurve, placeOn } from './core.js';

export function buildWorld(ctx) {
  const { scene } = ctx;
  const root = new THREE.Group();
  scene.add(root);

  // Ground + subtle grid
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: 0x0a0f1d, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  root.add(ground);
  const grid = new THREE.GridHelper(400, 100, 0x1e293b, 0x131c31);
  grid.position.y = -0.01;
  grid.material.transparent = true;
  grid.material.opacity = 0.5;
  root.add(grid);

  // Site slab (the "concrete" the fiber runs inside). Transparent in X-ray mode.
  const xrayMats = [];
  const siteMat = new THREE.MeshStandardMaterial({ color: 0x141c2f, roughness: 0.95, flatShading: true });
  xrayMats.push(siteMat);
  const site = at(new THREE.Mesh(new THREE.BoxGeometry(132, 0.3, 104), siteMat), 0, 0.15, 4, root);
  site.receiveShadow = true;

  // Zone tiles with neon edge
  const zoneLabels = {};
  for (const [id, z] of Object.entries(ZONES)) {
    const w = z.x[1] - z.x[0], d = z.z[1] - z.z[0];
    const cx = (z.x[0] + z.x[1]) / 2, cz = (z.z[0] + z.z[1]) / 2;
    const tint = new THREE.Color(0x0e1424).lerp(new THREE.Color(z.color), 0.075);
    const tm = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.9, flatShading: true });
    xrayMats.push(tm);
    const tile = at(new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), tm), cx, 0.32, cz, root);
    tile.receiveShadow = true;
    const em = basic(z.color, { toneMapped: false });
    const t = 0.14;
    at(box(w, 0.05, t, em), cx, FLOOR + 0.02, z.z[0] + t / 2, root).castShadow = false;
    at(box(w, 0.05, t, em), cx, FLOOR + 0.02, z.z[1] - t / 2, root).castShadow = false;
    at(box(t, 0.05, d, em), z.x[0] + t / 2, FLOOR + 0.02, cz, root).castShadow = false;
    at(box(t, 0.05, d, em), z.x[1] - t / 2, FLOOR + 0.02, cz, root).castShadow = false;

    // Floor-painted zone name (re-drawn on language change)
    const s = new Screen(Math.min(w - 2, 18), 2.2, 1024, 128, (c, W, H, st) => {
      c.clearRect(0, 0, W, H);
      txt(c, (st.text || '').toUpperCase(), 12, H / 2, 74, hex(z.color), 800);
    }, { transparent: true, text: id });
    s.mesh.material.opacity = 0.55;
    s.mesh.material.depthWrite = false;
    s.mesh.rotation.x = -Math.PI / 2;
    const lw = Math.min(w - 2, 18);
    at(s.mesh, z.x[0] + 1 + lw / 2, FLOOR + 0.03, z.z[1] - 1.6, root);
    zoneLabels[id] = s;
  }

  // Roads: main east-west road + gate access road (south)
  const roadM = mat(0x1f2937);
  at(box(44, 0.04, 10.8, mat(0x182235)), -42, 0.33, 29.6, root).castShadow = false; // dock apron
  at(box(132, 0.05, 4.4, roadM), 0, 0.33, 37.4, root).castShadow = false;
  at(box(5, 0.06, 16.6, roadM), -49.5, 0.34, 47.7, root).castShadow = false;
  const b = new Batcher();
  for (let x = -63; x < 64; x += 4) b.add(1.8, 0.02, 0.18, 0xe5e7eb, x, 0.37, 37.4);
  for (let z = 41.5; z < 56; z += 4) b.add(0.18, 0.02, 1.8, 0xe5e7eb, -49.5, 0.38, z);
  // Building walls (north / west / east) and glass partition to offices
  const wallM = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8, flatShading: true });
  xrayMats.push(wallM);
  at(new THREE.Mesh(new THREE.BoxGeometry(128, 2.2, 0.4), wallM), 0, 1.4, -45.8, root).castShadow = true;
  at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 70), wallM), -63.8, 1.4, -11, root).castShadow = true;
  at(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.2, 70), wallM), 63.8, 1.4, -11, root).castShadow = true;
  const glass = new THREE.MeshStandardMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.12, roughness: 0.1, depthWrite: false });
  at(new THREE.Mesh(new THREE.BoxGeometry(124, 1.6, 0.08), glass), 0, FLOOR + 0.8, -25.5, root);
  // Dock bumpers / door frames on the south side of the dock
  for (const x of [-56, -48, -40, -32]) {
    b.add(4.2, 0.25, 0.4, 0x0f172a, x, FLOOR + 0.6, 24.2);
    b.add(0.3, 3.4, 0.3, 0x475569, x - 2.1, FLOOR + 1.7, 24.1);
    b.add(0.3, 3.4, 0.3, 0x475569, x + 2.1, FLOOR + 1.7, 24.1);
    b.add(4.5, 0.3, 0.3, 0x475569, x, FLOOR + 3.4, 24.1);
  }
  // Parking stripes south of the road (east)
  for (let x = -20; x < 60; x += 3.2) b.add(0.12, 0.02, 4, 0x94a3b8, x, 0.36, 44);
  b.build(root);

  // Parked cars
  const carColors = [0x64748b, 0xe2e8f0, 0x1d4ed8, 0xb91c1c, 0x0f766e, 0x475569];
  for (let i = 0; i < 12; i++) {
    if (Math.random() < 0.25) continue;
    const c = car(carColors[i % carColors.length]);
    at(c, -18.4 + i * 3.2, FLOOR - 0.04, 44, root);
    c.rotation.y = Math.random() < 0.5 ? 0 : Math.PI;
  }

  // Trucks: one docked, one driving along the road
  const docked = truck(0xe2e8f0);
  at(docked, -40, FLOOR - 0.04, 29.8, root);
  docked.rotation.y = 0; // trailer rear toward the dock (-z)
  const docked2 = truck(0xcbd5e1);
  at(docked2, -56, FLOOR - 0.04, 29.8, root);

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
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.position.y = 0.55;
  const torso = cyl(0.22, 0.28, seated ? 0.6 : 0.95, 7, color);
  torso.position.y = seated ? 0.2 : 0.38;
  body.add(torso);
  const head = sphere(0.19, 0xf2c9a0, 8);
  head.position.y = seated ? 0.7 : 1.05;
  body.add(head);
  if (helmet) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.21, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xfacc15));
    h.position.y = head.position.y + 0.04;
    body.add(h);
  }
  if (!seated) {
    for (const s of [-0.11, 0.11]) at(box(0.13, 0.55, 0.15, 0x1e293b), s, -0.28, 0, body);
  }
  return g;
}

export function car(color) {
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

export function truck(color) {
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
