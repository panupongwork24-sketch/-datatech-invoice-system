// Brake booster plant — 3D walkthrough draft (Three.js + GSAP).
// Layout (metres): hall x -40..40, z -26..22. Lines run along Z (start z=-20 → end z=12).
//   Line 1 x=-15, Line 2 x=0, Line 3 x=15. Right side x 24..38 = conveyor + AMR.
//   Front z 13..20 = end-of-line label printing + packing. Left = network cabinet + (planned) flow rack.
//   Front exit z=22 = (planned) RFID gate to the FG warehouse annex.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { UI, SCENES } from './content.js';

const gsap = window.gsap;
gsap.ticker.lagSmoothing(0); // keep camera moves time-accurate even on slow GPUs
const isMobile = matchMedia('(max-width: 760px)').matches;

/* ---------------- renderer / scene ---------------- */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 90, 190);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 400);
camera.position.set(8, 62, 66);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 4;
controls.maxDistance = 140;
controls.target.set(-2, 0, -2);

scene.add(new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 2.1);
sun.position.set(30, 60, 35);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 50, bottom: -50, near: 10, far: 160 });
sun.shadow.bias = -0.0004;
scene.add(sun);

/* ---------------- helpers ---------------- */
const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.2, ...o }));
  return mats.get(k);
}
const steel = mat(0xb8c0cc, { roughness: 0.35, metalness: 0.75 });
const dark = mat(0x1f2937, { roughness: 0.6, metalness: 0.3 });
const geos = new Map();
function box(w, h, d, m, parent, x = 0, y = 0, z = 0) {
  const k = `${w},${h},${d}`;
  if (!geos.has(k)) {
    const r = Math.min(w, h, d) * 0.12;
    geos.set(k, r > 0.012 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, 0.05)) : new THREE.BoxGeometry(w, h, d));
  }
  const mesh = new THREE.Mesh(geos.get(k), typeof m === 'number' ? mat(m) : m);
  mesh.position.set(x, y, z);
  const big = Math.max(w, h, d) > 0.4;
  mesh.castShadow = big; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
function cyl(r, h, m, parent, x = 0, y = 0, z = 0, seg = 24, r2 = r) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r2, h, seg), typeof m === 'number' ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = r > 0.2; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
function group(parent, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = ry;
  (parent || scene).add(g);
  return g;
}
function glow(color, i = 1.2) { return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: i, roughness: 0.4 }); }

/** Canvas-texture screen / sign. draw(ctx, w, h) paints it; call .redraw() to refresh. */
function screen(w, h, draw, parent, x, y, z, ry = 0, px = 256) {
  const cv = document.createElement('canvas');
  cv.width = px; cv.height = Math.round(px * h / w);
  const ctx = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  m.position.set(x, y, z); m.rotation.y = ry;
  if (parent) parent.add(m);
  m.redraw = (...a) => { draw(ctx, cv.width, cv.height, ...a); tex.needsUpdate = true; };
  m.redraw();
  return m;
}
function sign(text, w, h, bg, fg, parent, x, y, z, ry = 0, font = 'bold 64px system-ui') {
  return screen(w, h, (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = fg; c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, W / 2, H / 2 + 2);
  }, parent, x, y, z, ry, 512);
}
function person(parent, x, z, ry = 0, vest = 0x2563eb) {
  const g = group(parent, x, 0, z, ry);
  cyl(0.11, 0.85, dark, g, -0.1, 0.43, 0, 10); cyl(0.11, 0.85, dark, g, 0.1, 0.43, 0, 10);
  box(0.5, 0.7, 0.3, vest, g, 0, 1.2, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(0xe0b48f, { roughness: 0.7, metalness: 0 }));
  head.position.set(0, 1.72, 0); g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xf8fafc));
  cap.position.set(0, 1.75, 0); g.add(cap);
  return g;
}
/** Planned (roadmap) items: amber, semi-transparent. */
const planMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.45, roughness: 0.5, depthWrite: false });
const planEdge = new THREE.LineDashedMaterial({ color: 0xfbbf24, dashSize: 0.4, gapSize: 0.25 });
function planBox(w, h, d, parent, x, y, z) {
  const m = box(w, h, d, planMat, parent, x, y, z);
  m.castShadow = false;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), planEdge);
  e.computeLineDistances(); m.add(e);
  return m;
}

/* ---------------- labels ---------------- */
const labels = {};
let goTo = () => {};
function label(id, num, text, kind, x, y, z) {
  const el = document.createElement('div');
  el.className = 'lbl' + (kind === 'plan' ? ' plan' : '');
  el.innerHTML = `<b>${num}</b><span></span>`;
  el.addEventListener('click', () => goTo(SCENES.findIndex((s) => s.id === id)));
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  scene.add(o);
  labels[id] = { el, text };
  return o;
}
function smallLabel(text, x, y, z) {
  const el = document.createElement('div');
  el.className = 'lbl small';
  el.textContent = text;
  const o = new CSS2DObject(el); o.position.set(x, y, z); scene.add(o);
  return o;
}

/* ---------------- hall ---------------- */
const HALL = { x0: -40, x1: 40, z0: -26, z1: 22 };
{
  // outside ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x1e293b, { roughness: 0.95, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  // epoxy floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALL.x1 - HALL.x0, HALL.z1 - HALL.z0),
    mat(0x64748b, { roughness: 0.32, metalness: 0.05, envMapIntensity: 1.1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (HALL.z0 + HALL.z1) / 2); floor.receiveShadow = true; scene.add(floor);
  // green production zones under each line + walkway lines (yellow)
  const zoneMat = mat(0x3f6f55, { roughness: 0.35, metalness: 0.05 });
  for (const lx of [-15, 0, 15]) {
    const z = new THREE.Mesh(new THREE.PlaneGeometry(8, 34), zoneMat);
    z.rotation.x = -Math.PI / 2; z.position.set(lx, 0.01, -4); z.receiveShadow = true; scene.add(z);
  }
  const yellow = mat(0xfacc15, { roughness: 0.5, metalness: 0 });
  const stripe = (x, z, w, d) => { const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), yellow); s.rotation.x = -Math.PI / 2; s.position.set(x, 0.02, z); scene.add(s); };
  for (const lx of [-15, 0, 15]) { stripe(lx - 4, -4, 0.12, 34); stripe(lx + 4, -4, 0.12, 34); }
  stripe(0, -23, 76, 0.12); stripe(0, 13.2, 46, 0.12);
  // AMR lane (purple)
  const amrZone = new THREE.Mesh(new THREE.PlaneGeometry(14, 30), mat(0x4c3d73, { roughness: 0.35, metalness: 0.05 }));
  amrZone.rotation.x = -Math.PI / 2; amrZone.position.set(31, 0.01, -8); scene.add(amrZone);

  // walls: back + left full height, front + right low (open view)
  const wall = mat(0xcbd5e1, { roughness: 0.8, metalness: 0.1 });
  box(80, 8, 0.4, wall, scene, 0, 4, HALL.z0);
  box(0.4, 8, 48, wall, scene, HALL.x0, 4, -2);
  box(0.4, 1, 48, wall, scene, HALL.x1, 0.5, -2);
  box(30, 1, 0.4, wall, scene, -27, 0.5, HALL.z1);
  box(42, 1, 0.4, wall, scene, 19, 0.5, HALL.z1);
  // columns + roof trusses outline
  for (let x = -40; x <= 40; x += 16) for (const z of [HALL.z0, HALL.z1]) box(0.6, 9, 0.6, steel, scene, x, 4.5, z);
  for (let x = -40; x <= 40; x += 16) box(0.3, 0.5, 48, steel, scene, x, 9, -2);
  // sign on back wall
  sign('BRAKE BOOSTER PRODUCTION', 22, 2, '#0f172a', '#e2e8f0', scene, 0, 6.2, HALL.z0 + 0.22);
}

/* ---------------- production lines ---------------- */
const LINES = [-15, 0, 15];
const LINE_Z0 = -20, LINE_Z1 = 12;
const STATIONS = [-16, -9, -2, 5];
const rollerTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#6b7280'); g.addColorStop(0.5, '#e5e7eb'); g.addColorStop(1, '#6b7280');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#374151'; c.fillRect(0, 58, 64, 6);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const rollerTexes = [];
/** Roller conveyor along Z (or X when alongX). Returns its group. */
function conveyor(x, z, len, width = 1.1, alongX = false, h = 0.85) {
  const g = group(scene, x, 0, z, alongX ? Math.PI / 2 : 0);
  const t = rollerTex.clone(); t.needsUpdate = true; t.repeat.set(1, len * 3); rollerTexes.push(t);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.7 }));
  top.rotation.x = -Math.PI / 2; top.position.y = h; top.receiveShadow = true; g.add(top);
  box(0.1, 0.18, len, steel, g, -width / 2 - 0.05, h - 0.02, 0);
  box(0.1, 0.18, len, steel, g, width / 2 + 0.05, h - 0.02, 0);
  for (let s = -len / 2 + 0.5; s < len / 2; s += 2) {
    box(0.08, h, 0.08, dark, g, -width / 2, h / 2, s); box(0.08, h, 0.08, dark, g, width / 2, h / 2, s);
  }
  return g;
}
function lightTower(parent, x, y, z) {
  const g = group(parent, x, y, z);
  cyl(0.03, 0.5, steel, g, 0, 0.25, 0, 8);
  const cols = [0x22c55e, 0xf59e0b, 0xef4444];
  g.lamps = cols.map((c, i) => { const l = cyl(0.07, 0.14, glow(c, i === 0 ? 1.6 : 0.08), g, 0, 0.58 + i * 0.15, 0, 16); return l; });
  return g;
}
function hmi(parent, x, y, z, ry, title, rows) {
  const g = group(parent, x, y, z, ry);
  cyl(0.03, 0.5, steel, g, 0, -0.25, 0, 8);
  box(0.62, 0.42, 0.05, dark, g, 0, 0.05, -0.02);
  const s = screen(0.56, 0.36, (c, W, H, hl = -1) => {
    c.fillStyle = '#0b1f33'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d4ed8'; c.fillRect(0, 0, W, 34);
    c.fillStyle = '#fff'; c.font = 'bold 20px system-ui'; c.fillText(title, 10, 24);
    c.font = '17px system-ui';
    rows.forEach((r, i) => {
      if (i === hl) { c.fillStyle = 'rgba(34,197,94,.35)'; c.fillRect(4, 42 + i * 26, W - 8, 24); }
      c.fillStyle = '#cbd5e1'; c.fillText(r[0], 10, 60 + i * 26);
      c.fillStyle = r[1] === 'OK' ? '#4ade80' : '#e2e8f0'; c.textAlign = 'right'; c.fillText(r[1], W - 10, 60 + i * 26); c.textAlign = 'left';
    });
  }, g, 0, 0.05, 0.01, 0, 320);
  g.screen = s;
  return g;
}
/** SATO-style thermal label printer (no logo). Returns group with .label strip to animate. */
function printer(parent, x, y, z, ry = 0, bodyColor = 0xe5e7eb) {
  const g = group(parent, x, y, z, ry);
  box(0.5, 0.36, 0.6, bodyColor, g, 0, 0.18, 0);
  box(0.5, 0.06, 0.6, 0x9ca3af, g, 0, 0.38, 0);
  box(0.18, 0.12, 0.02, dark, g, 0.12, 0.26, 0.31);
  g.led = box(0.04, 0.04, 0.02, glow(0x22c55e, 1.5), g, -0.16, 0.28, 0.31);
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.001 + 0.2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
  lbl.rotation.x = -Math.PI / 2; lbl.position.set(0, 0.2, 0.31); lbl.scale.set(1, 0.01, 1);
  // QR pattern on the label
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#000';
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0) c.fillRect(14 + i * 4, 6 + j * 4, 4, 4);
  [[14, 6], [42, 6], [14, 34]].forEach(([a, b]) => { c.fillRect(a, b, 10, 10); c.fillStyle = '#fff'; c.fillRect(a + 2, b + 2, 6, 6); c.fillStyle = '#000'; c.fillRect(a + 4, b + 4, 2, 2); });
  lbl.material.map = new THREE.CanvasTexture(cv);
  g.add(lbl); g.label = lbl;
  return g;
}
function plcCabinet(parent, x, z, ry = 0) {
  const g = group(parent, x, 0, z, ry);
  box(0.9, 1.9, 0.5, 0xd1d5db, g, 0, 0.95, 0);
  box(0.8, 1.7, 0.02, 0xc0c6cf, g, 0, 1.0, 0.26);
  box(0.05, 0.3, 0.04, dark, g, 0.3, 1.1, 0.28);
  for (let i = 0; i < 4; i++) box(0.06, 0.06, 0.02, glow([0x22c55e, 0x22c55e, 0x38bdf8, 0xf59e0b][i], 1.4), g, -0.25 + i * 0.1, 1.65, 0.28);
  sign('PLC', 0.4, 0.16, '#111827', '#fbbf24', g, 0, 1.4, 0.275, 0, 'bold 80px system-ui');
  return g;
}
function machine(parent, x, z, side, color = 0xe2e8f0) {
  // process machine beside the conveyor (side = -1 left / +1 right)
  const g = group(parent, x + side * 1.75, 0, z);
  box(1.9, 1.9, 2.0, color, g, 0, 0.95, 0);
  box(1.95, 0.25, 2.05, 0x1e3a8a, g, 0, 1.95, 0);
  // window
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0x93c5fd, transparent: true, opacity: 0.45, roughness: 0.1, metalness: 0.2 }));
  win.position.set(-side * 0.96, 1.25, 0); win.rotation.y = -side * Math.PI / 2; g.add(win);
  g.tower = lightTower(g, side * 0.7, 2.05, -0.8);
  return g;
}

const products = [];   // brake boosters on lines
const boosterGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 28);
const boosterMat = mat(0x374151, { roughness: 0.35, metalness: 0.8 });
const studMat = mat(0x9ca3af, { roughness: 0.3, metalness: 0.9 });
function booster() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(boosterGeo, boosterMat); b.castShadow = true; b.position.y = 0.13; g.add(b);
  const s = cyl(0.07, 0.22, studMat, g, 0, 0.36, 0, 12);
  s.castShadow = false;
  return g;
}

const towers = [], hmis = [], tracePrinters = [];
let aepPrinter, aepPlc;
LINES.forEach((lx, li) => {
  conveyor(lx, (LINE_Z0 + LINE_Z1) / 2, LINE_Z1 - LINE_Z0);
  sign(`LINE ${li + 1}`, 3, 0.8, li === 1 ? '#7c3aed' : '#166534', '#ffffff', scene, lx, 4.6, LINE_Z0 - 1.6, 0);
  { const p = group(scene, lx, 0, LINE_Z0 - 1.6); box(0.12, 4.2, 0.12, steel, p, -1.3, 2.1, 0); box(0.12, 4.2, 0.12, steel, p, 1.3, 2.1, 0); }
  STATIONS.forEach((sz, si) => {
    const side = si % 2 === 0 ? -1 : 1;
    const m = machine(scene, lx, sz, side, si === 0 ? 0xf1f5f9 : 0xe2e8f0);
    towers.push(m.tower);
    // operator side opposite the machine, with WI screen + scanner
    const os = -side;
    const h = hmi(scene, lx + os * 1.2, 1.55, sz + 0.9, os * Math.PI / 2, 'WI · STATION ' + (si + 1), [
      ['Scan QR', '✓'], ['Part No.', 'BB-' + (li + 1) + '0' + (si + 1)], ['Step', (si + 1) + ' / 4'], ['Result', 'OK']]);
    hmis.push(h);
    if (si !== 0) person(scene, lx + os * 2.1, sz + 0.2, os > 0 ? -Math.PI / 2 : Math.PI / 2, [0x2563eb, 0x0ea5e9, 0x16a34a][li]);
  });
  // start station: SATO QR printer + PLC (traceability)
  const tp = printer(scene, lx + 1.25, 1.0, LINE_Z0 + 0.6, -Math.PI / 2);
  box(0.8, 1.0, 0.8, steel, scene, lx + 1.25, 0.5, LINE_Z0 + 0.6);
  tracePrinters.push(tp);
  plcCabinet(scene, lx - 2.4, LINE_Z0 - 0.4, 0);
  // end of line: unload table
  box(1.6, 0.85, 1.4, 0x94a3b8, scene, lx, 0.425, LINE_Z1 + 1.0);
});

// products moving along each line
LINES.forEach((lx, li) => {
  for (let k = 0; k < 9; k++) {
    const p = booster(); scene.add(p);
    products.push({ obj: p, x: lx, off: k / 9, speed: 0.022 + li * 0.002 });
  }
});

/* ---------------- traceability server / network cabinet (left) ---------------- */
const rackPos = new THREE.Vector3(-35.5, 0, -20);
{
  const g = group(scene, rackPos.x, 0, rackPos.z, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const r = group(g, (i - 1) * 0.75, 0, 0);
    box(0.7, 2.1, 1.0, 0x111827, r, 0, 1.05, 0);
    for (let u = 0; u < 9; u++) {
      box(0.58, 0.12, 0.02, 0x374151, r, 0, 0.35 + u * 0.18, 0.51);
      box(0.03, 0.03, 0.01, glow(u % 3 ? 0x22c55e : 0x38bdf8, 1.6), r, 0.22, 0.35 + u * 0.18, 0.525);
    }
  }
  // traceability dashboard on wall
  screen(3.2, 1.8, (c, W, H) => {
    c.fillStyle = '#0b1f33'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#1d4ed8'; c.fillRect(0, 0, W, 44);
    c.fillStyle = '#fff'; c.font = 'bold 26px system-ui'; c.fillText('TRACEABILITY · UNIT HISTORY', 14, 31);
    c.font = '20px system-ui';
    const rows = [['Serial (QR)', 'BB-2-0001'], ['Line', 'Line 2'], ['Leak test', 'OK'], ['Process values (PLC)', 'OK'], ['WI steps', '4 / 4'], ['Customer label', 'Printed']];
    rows.forEach((r, i) => { c.fillStyle = '#94a3b8'; c.fillText(r[0], 18, 82 + i * 34); c.fillStyle = r[1] === 'OK' ? '#4ade80' : '#e2e8f0'; c.textAlign = 'right'; c.fillText(r[1], W - 18, 82 + i * 34); c.textAlign = 'left'; });
    c.fillStyle = '#64748b'; c.font = '15px system-ui'; c.fillText('Sample screen — illustrative data', 18, H - 12);
  }, scene, HALL.x0 + 0.25, 3.4, -15, Math.PI / 2, 512);
}

/* ---------------- infrastructure: cable trays + wireless APs ---------------- */
const aps = [];
const rings = [];
const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
{
  const trayMat = mat(0x94a3b8, { roughness: 0.4, metalness: 0.7 });
  const trayY = 6.2;
  box(72, 0.12, 0.5, trayMat, scene, -2, trayY, -23.5); // main trunk along back
  for (const lx of LINES) box(0.5, 0.12, 34, trayMat, scene, lx + 3.2, trayY, -6);
  box(0.5, 0.12, 4, trayMat, scene, rackPos.x + 1.0, trayY, -21.5);
  // drops to stations
  for (const lx of LINES) for (const sz of STATIONS) cyl(0.03, trayY - 2, mat(0x38bdf8, { roughness: 0.5, metalness: 0 }), scene, lx + 3.2, (trayY + 2) / 2, sz + 0.9, 6);
  // APs
  const apPos = [[-15, -10], [-15, 6], [0, -10], [0, 6], [15, -10], [15, 6], [31, -16], [31, 0], [-30, 0], [0, 17]];
  apPos.forEach(([x, z]) => {
    const g = group(scene, x + 3.2, trayY - 0.25, z);
    cyl(0.22, 0.06, 0xf8fafc, g, 0, 0, 0, 24);
    box(0.05, 0.03, 0.02, glow(0x38bdf8, 2), g, 0, -0.04, 0.18);
    aps.push(g);
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), ringMat.clone());
      ring.rotation.x = -Math.PI / 2; ring.position.set(x + 3.2, trayY - 0.4, z); ring.userData.phase = r * 0.5;
      scene.add(ring); rings.push(ring);
    }
  });
}

/* ---------------- AEP print at Line 3 station 3 ---------------- */
{
  const lx = 15, sz = -2;
  box(0.8, 1.0, 0.8, steel, scene, lx + 1.2, 0.5, sz - 1.6);
  aepPrinter = printer(scene, lx + 1.2, 1.0, sz - 1.6, -Math.PI / 2, 0xf3f4f6);
  aepPlc = plcCabinet(scene, lx + 3.0, sz - 1.6, -Math.PI / 2);
}

/* ---------------- right side: conveyor + 3 AMRs ---------------- */
const inBoxes = [];
const PICK = new THREE.Vector3(29.6, 0, -14);
const DROP = new THREE.Vector3(5.2, 0, -9);
{
  // incoming conveyor from front-right to the transfer point
  conveyor(33, -2, 26, 1.3, false, 0.75);
  // transfer station (short powered conveyor across)
  conveyor(31.3, -14, 2.2, 1.3, true, 0.75);
  box(0.12, 1.6, 0.12, steel, scene, 30.2, 0.8, -15); box(0.12, 1.6, 0.12, steel, scene, 30.2, 0.8, -13);
  box(0.12, 0.12, 2.1, steel, scene, 30.2, 1.6, -14);
  smallLabel('Transfer point', 31.3, 2.2, -14);
  // drop station at Line 2 (buffer table beside station 2)
  box(1.4, 0.75, 1.4, 0x7c3aed, scene, DROP.x + 0.2, 0.375, DROP.z);
  smallLabel('Line 2 process station', DROP.x, 2.4, DROP.z);
  // incoming boxes on conveyor
  for (let k = 0; k < 7; k++) {
    const b = box(0.9, 0.6, 0.9, mat(0xb08350, { roughness: 0.9, metalness: 0 }));
    scene.add(b); inBoxes.push({ obj: b, off: k / 7 });
  }
  // dashed AMR route on floor
  const pts = [[PICK.x - 1.6, -14], [27, -14], [27, -23.5], [8, -23.5], [8, -9], [DROP.x + 1.2, -9], [8, -9.01], [8.6, -23], [27.6, -23], [27.6, -14.01]];
  const routeGeo = new THREE.BufferGeometry().setFromPoints(pts.map(([x, z]) => new THREE.Vector3(x, 0.04, z)));
  const route = new THREE.Line(routeGeo, new THREE.LineDashedMaterial({ color: 0xc084fc, dashSize: 0.6, gapSize: 0.4 }));
  route.computeLineDistances(); scene.add(route);
}
// AMR loop path
const amrCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(28.0, 0, -14), new THREE.Vector3(27.2, 0, -18), new THREE.Vector3(26, 0, -23.2), new THREE.Vector3(18, 0, -23.6),
  new THREE.Vector3(9, 0, -23), new THREE.Vector3(7.6, 0, -18), new THREE.Vector3(7.4, 0, -11), new THREE.Vector3(6.6, 0, -9),
  new THREE.Vector3(8.6, 0, -8.2), new THREE.Vector3(9.4, 0, -14), new THREE.Vector3(10, 0, -21.6), new THREE.Vector3(18, 0, -22.2),
  new THREE.Vector3(25.8, 0, -21.8), new THREE.Vector3(28.4, 0, -17.5),
], true, 'catmullrom', 0.3);
const DROP_T = 0.5, PICK_T = 0.0;
function amr(color = 0xf8fafc) {
  const g = new THREE.Group();
  box(0.9, 0.32, 1.3, color, g, 0, 0.26, 0);
  box(0.92, 0.06, 1.32, 0x334155, g, 0, 0.1, 0);
  box(0.7, 0.04, 1.0, 0x111827, g, 0, 0.44, 0);
  const led = box(0.86, 0.04, 0.02, glow(0x22d3ee, 2), g, 0, 0.3, 0.66);
  box(0.12, 0.08, 0.12, 0x0f172a, g, 0, 0.5, 0.48);
  g.led = led;
  const cargo = box(0.9, 0.6, 0.9, mat(0xb08350, { roughness: 0.9, metalness: 0 }), g, 0, 0.78, 0);
  g.cargo = cargo;
  g.castShadow = true;
  scene.add(g);
  return g;
}
const amrs = [0, 1, 2].map((i) => ({ obj: amr(), off: i / 3 }));

/* ---------------- end of line: 3 SATO label printers + packing ---------------- */
const labelPrinters = [];
{
  const z = 15.2;
  LINES.forEach((lx, i) => {
    box(1.4, 0.9, 0.8, 0x94a3b8, scene, lx + 2.4, 0.45, z);
    const pr = printer(scene, lx + 2.4, 0.9, z, Math.PI, 0xf3f4f6);
    labelPrinters.push(pr);
    hmi(scene, lx + 3.4, 1.7, z - 0.1, Math.PI, 'LABEL PRINT', [['Customer', '—'], ['Part No.', 'BB-' + (i + 1)], ['Tag card', 'Printed'], ['Verify', 'OK']]);
    person(scene, lx + 2.6, z + 1.3, Math.PI, 0xf97316);
    smallLabel('SATO #' + (i + 1), lx + 2.4, 2.1, z);
  });
  // customer label sample board
  screen(6, 1.3, (c, W, H) => {
    c.fillStyle = '#111827'; c.fillRect(0, 0, W, H);
    const names = ['Ford', 'Chevrolet', 'Nissan'];
    names.forEach((n, i) => {
      const x = 12 + i * (W - 24) / 3, w = (W - 24) / 3 - 12;
      c.fillStyle = '#fff'; c.fillRect(x, 14, w, H - 28);
      c.fillStyle = '#111'; c.font = 'bold 34px system-ui'; c.fillText(n.toUpperCase(), x + 14, 58);
      c.font = '20px system-ui'; c.fillText('Customer label format', x + 14, 88);
      for (let b = 0; b < 26; b++) c.fillRect(x + 14 + b * 6, 102, b % 3 ? 2 : 4, 26);
    });
  }, scene, 0, 3.3, 18.6, Math.PI, 768);
  { const p = group(scene, 0, 0, 18.6); box(0.12, 4, 0.12, steel, p, -3.1, 2, 0); box(0.12, 4, 0.12, steel, p, 3.1, 2, 0); }
  // packing: pallets with boxes
  for (const [x, zz] of [[-20, 18.5], [-9, 18.5], [9, 18.5], [20, 18.5]]) {
    box(1.2, 0.15, 1.0, mat(0xa16207, { roughness: 0.9, metalness: 0 }), scene, x, 0.075, zz);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) box(0.55, 0.45, 0.45, mat(0xc49a6c, { roughness: 0.9, metalness: 0 }), scene, x - 0.28 + a * 0.56, 0.38, zz - 0.23 + b * 0.46);
  }
  sign('PACKING', 3, 0.7, '#0f172a', '#fde68a', scene, -14.5, 3, 20.5, Math.PI);
}

/* ---------------- ROADMAP: e-Kanban + ESL flow rack (left) ---------------- */
const esls = [];
let kanbanBoard;
{
  const g = group(scene, -31, 0, 0, Math.PI / 2);
  for (let r = 0; r < 2; r++) {
    const rx = (r - 0.5) * 3.6;
    // flow rack frame (real steel) + planned overlay
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.6, 0.6]) box(0.08, 1.9, 0.08, steel, g, rx + sx, 0.95, sz);
    for (let lv = 0; lv < 3; lv++) {
      const y = 0.45 + lv * 0.55;
      const shelf = box(3.2, 0.04, 1.2, mat(0x9ca3af), g, rx, y, 0); shelf.rotation.x = 0.08;
      for (let b = 0; b < 4; b++) {
        box(0.6, 0.3, 0.9, mat([0x2563eb, 0x16a34a, 0xdc2626, 0xf59e0b][b], { roughness: 0.6, metalness: 0 }), g, rx - 1.2 + b * 0.8, y + 0.18, 0);
        // ESL tag (planned) on shelf front
        const tag = screen(0.36, 0.16, (c, W, H, low = false) => {
          c.fillStyle = low ? '#fde68a' : '#f1f5f9'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#111'; c.font = 'bold 26px system-ui'; c.fillText('P-' + (lv + 1) + (b + 1), 8, 30);
          c.font = '20px system-ui'; c.fillText(low ? 'LOW · KANBAN' : 'QTY OK', 8, 54);
        }, g, rx - 1.2 + b * 0.8, y - 0.05, 0.64, 0, 128);
        const frame = box(0.4, 0.2, 0.02, 0x111827, g, rx - 1.2 + b * 0.8, y - 0.05, 0.62);
        frame.castShadow = false;
        esls.push(tag);
      }
    }
    planBox(3.4, 2.1, 1.4, g, rx, 1.05, 0);
  }
  kanbanBoard = screen(2.6, 1.5, (c, W, H, n = 0) => {
    c.fillStyle = '#1c1206'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#f59e0b'; c.fillRect(0, 0, W, 40);
    c.fillStyle = '#1c1206'; c.font = 'bold 24px system-ui'; c.fillText('e-KANBAN (PLANNED)', 12, 28);
    c.font = '20px system-ui';
    ['Lane P-12 → refill', 'Lane P-23 → refill', 'Lane P-31 → OK', 'Lane P-34 → OK'].forEach((t, i) => {
      c.fillStyle = i < 1 + (n % 3) ? '#fbbf24' : '#64748b'; c.fillText(t, 16, 76 + i * 32);
    });
  }, scene, -36.5, 2.7, 4.6, Math.PI / 2, 384);
  { const p = group(scene, -36.5, 0, 4.6); box(0.1, 3.4, 0.1, steel, p, 0, 1.7, -1.35); box(0.1, 3.4, 0.1, steel, p, 0, 1.7, 1.35); }
}

/* ---------------- ROADMAP: RFID gate + FG warehouse ---------------- */
let rfidGate, rfidPallet;
{
  const gx = -8, gz = HALL.z1;
  rfidGate = group(scene, gx, 0, gz);
  // opening in front wall area: gate arch (planned)
  const pm = glow(0xf59e0b, 0.6); pm.transparent = true; pm.opacity = 0.85;
  box(0.35, 3.6, 0.35, pm, rfidGate, -2, 1.8, 0); box(0.35, 3.6, 0.35, pm, rfidGate, 2, 1.8, 0); box(4.35, 0.35, 0.35, pm, rfidGate, 0, 3.6, 0);
  for (const s of [-1, 1]) box(0.08, 0.5, 0.3, 0x111827, rfidGate, s * 1.78, 2.2, 0);
  rfidGate.waves = [0, 1, 2].map((i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6, depthWrite: false }));
    w.position.set(0, 0.2, 0); w.userData.phase = i / 3; rfidGate.add(w); return w;
  });
  // FG warehouse annex (planned ghost)
  const fg = group(scene, -8, 0, 30);
  planBox(24, 4.2, 12, fg, 0, 2.1, 0);
  for (let r = 0; r < 3; r++) for (let lv = 0; lv < 3; lv++) {
    box(7, 0.1, 1.2, mat(0xf97316), fg, -7 + r * 7, 0.2 + lv * 1.25, 3);
    for (let b = 0; b < 3; b++) box(1.1, 0.9, 1.0, mat(0xc49a6c, { roughness: 0.9, metalness: 0 }), fg, -9.2 + r * 7 + b * 2.2, 0.72 + lv * 1.25, 3);
  }
  sign('FG WAREHOUSE (PLANNED)', 8, 1.1, '#f59e0b', '#1c1206', scene, -8, 4.9, 23.9, 0);
  // pallet that crosses the gate
  rfidPallet = group(scene, gx, 0, 18);
  box(1.2, 0.15, 1.0, mat(0xa16207, { roughness: 0.9, metalness: 0 }), rfidPallet, 0, 0.075, 0);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) box(0.55, 0.45, 0.45, mat(0xc49a6c, { roughness: 0.9, metalness: 0 }), rfidPallet, -0.28 + a * 0.56, 0.38, -0.23 + b * 0.46);
  const tag = box(0.2, 0.12, 0.02, 0xfbbf24, rfidPallet, 0, 0.35, 0.51); tag.castShadow = false;
  // pallet jack driver
  rfidPallet.add(person(null, 0, -1.0, 0, 0xf59e0b));
}

/* ---------------- data flows (shown in "connected" + relevant scenes) ---------------- */
const flows = [];
function flow(points, color, tags) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(line);
  const dots = [0, 1, 2].map(() => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), new THREE.MeshBasicMaterial({ color })); scene.add(d); return d; });
  const f = { curve, line, dots, tags, vis: 0 };
  flows.push(f);
  return f;
}
const R = [rackPos.x + 1, 6.2, rackPos.z];
LINES.forEach((lx) => {
  flow([[lx + 1.25, 1.6, LINE_Z0 + 0.6], [lx + 1.6, 6.0, LINE_Z0 - 1], [lx + 3.2, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0x38bdf8, ['trace', 'connected']);
  flow([[lx - 2.4, 2.0, LINE_Z0 - 0.4], [lx - 2.4, 6.0, -22.5], [lx - 2.4, 6.3, -23.6], [R[0], 6.3, -23.6], [R[0] + 0.3, 2.2, R[2]]], 0x22c55e, ['trace', 'connected']);
  flow([[lx + 3.2, 6.2, 5.9], [lx + 3.2, 6.2, -23.5], [R[0], 6.25, -23.5], [R[0], 2.2, R[2] + 0.3]], 0x60a5fa, ['infra', 'connected']);
  flow([[lx + 2.4, 1.4, 15.2], [lx + 3.2, 6.2, 13], [lx + 3.2, 6.2, -23.4], [R[0], 6.2, -23.4], [R[0], 2.2, R[2] - 0.3]], 0xf472b6, ['label', 'connected']);
});
flow([[16.2, 1.6, -3.6], [18.2, 6.0, -3.6], [18.2, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0xa3e635, ['aep', 'connected']);
flow([[-31, 2.4, 0], [-31, 6.2, -10], [R[0], 6.2, -20], [R[0], 2.2, R[2]]], 0xf59e0b, ['ekanban', 'connected']);
flow([[-8, 3.8, 22], [-8, 6.2, 14], [-12, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0xf59e0b, ['rfid', 'connected']);

/* ---------------- labels (numbered hotspots) ---------------- */
label('amr', '1', 'amr', 'done', 30, 4.2, -9);
label('trace', '2', 'trace', 'done', -15, 4.0, LINE_Z0 + 0.6);
label('infra', '3', 'infra', 'done', rackPos.x + 1, 4.4, rackPos.z + 2);
label('aep', '4', 'aep', 'done', 16.4, 3.4, -3.6);
label('label', '5', 'label', 'done', 0, 5.4, 18.6);
label('ekanban', '6', 'ekanban', 'plan', -31, 3.8, 0);
label('rfid', '7', 'rfid', 'plan', -8, 5.2, HALL.z1);
for (const [i, lx] of LINES.entries()) smallLabel(`Line ${i + 1}`, lx, 1.8, LINE_Z1 + 1.6);

/* ---------------- UI / i18n / scenes ---------------- */
let lang = 'en';
let current = 0;
let tourTimer = null;
const $ = (id) => document.getElementById(id);
function renderUI() {
  const t = UI[lang];
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });
  $('btnTour').textContent = tourTimer ? t.tourStop : t.tour;
  $('btnLang').textContent = lang === 'en' ? 'TH' : 'EN';
  for (const list of ['listDone', 'listPlan', 'listMisc']) $(list).innerHTML = '';
  SCENES.forEach((s, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="num ${s.kind === 'plan' ? 'plan' : s.kind === 'misc' ? 'misc' : ''}">${s.num}</span><span>${s[lang].name}</span>`;
    li.onclick = () => { stopTour(); goTo(i); };
    if (i === current) li.classList.add('active');
    $(s.kind === 'done' ? 'listDone' : s.kind === 'plan' ? 'listPlan' : 'listMisc').appendChild(li);
  });
  for (const [id, l] of Object.entries(labels)) {
    const s = SCENES.find((x) => x.id === id);
    l.el.querySelector('span').textContent = s[lang].name;
  }
  const s = SCENES[current];
  const tag = $('capTag');
  tag.className = 'tag ' + (s.kind === 'done' ? '' : s.kind);
  tag.textContent = s.kind === 'done' ? t.tagDone : s.kind === 'plan' ? t.tagPlan : t.tagMisc;
  $('capTitle').textContent = s[lang].title;
  $('capText').textContent = s[lang].text;
  $('capPoints').innerHTML = s[lang].points.map((p) => `<li>${p}</li>`).join('');
  $('capStep').textContent = `${current + 1} / ${SCENES.length}`;
}
goTo = (i) => {
  if (i < 0 || i >= SCENES.length) return;
  current = i;
  const s = SCENES[i];
  const cam = isMobile ? s.cam.map((v, k) => (k === 1 ? v * 1.25 : v + (v - s.tgt[k]) * 0.35)) : s.cam;
  gsap.to(camera.position, { x: cam[0], y: cam[1], z: cam[2], duration: 2.2, ease: 'power2.inOut' });
  gsap.to(controls.target, { x: s.tgt[0], y: s.tgt[1], z: s.tgt[2], duration: 2.2, ease: 'power2.inOut' });
  for (const [id, l] of Object.entries(labels)) {
    const on = s.focus.includes(id);
    l.el.classList.toggle('focus', on && s.focus.length === 1);
    l.el.classList.toggle('dim', !on);
  }
  renderUI();
};
function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; renderUI(); } }
$('btnTour').onclick = () => {
  if (tourTimer) return stopTour();
  tourTimer = setInterval(() => goTo((current + 1) % SCENES.length), 10000);
  goTo((current + 1) % SCENES.length);
};
$('btnLang').onclick = () => { lang = lang === 'en' ? 'th' : 'en'; renderUI(); };
$('btnPrev').onclick = () => { stopTour(); goTo(current - 1); };
$('btnNext').onclick = () => { stopTour(); goTo(current + 1); };
addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') { stopTour(); goTo(current + 1); } if (e.key === 'ArrowLeft') { stopTour(); goTo(current - 1); } });
controls.addEventListener('start', () => stopTour());

/* ---------------- layout: keep subject in the free area (not under sidebar / caption) ---------------- */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h); labelRenderer.setSize(w, h);
  const top = $('topbar').offsetHeight;
  const cap = $('caption').getBoundingClientRect();
  const capH = h - cap.top;
  const side = isMobile ? 0 : $('sidebar').getBoundingClientRect().right;
  const dy = Math.max(0, capH - top);
  camera.aspect = w / h;
  camera.setViewOffset(w + side, h + dy, 0, dy, w, h);
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
new ResizeObserver(resize).observe($('caption'));

/* ---------------- animation ---------------- */
const clock = new THREE.Clock();
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
let printPhase = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  // rollers
  for (const r of rollerTexes) r.offset.y -= dt * 0.8;
  // products: travel with short dwell at each station
  for (const p of products) {
    p.off = (p.off + dt * p.speed) % 1;
    const z = LINE_Z0 + 0.4 + p.off * (LINE_Z1 - LINE_Z0 - 0.8);
    p.obj.position.set(p.x, 0.86, z);
    p.obj.visible = p.off > 0.02 && p.off < 0.98;
  }
  // incoming boxes on right conveyor (towards -Z, ending at transfer)
  for (const b of inBoxes) {
    b.off = (b.off + dt * 0.035) % 1;
    b.obj.position.set(33, 0.75 + 0.3, 11 - b.off * 24);
    b.obj.visible = b.off < 0.96;
  }
  // AMRs on loop: carry cargo from PICK to DROP
  for (const a of amrs) {
    a.off = (a.off + dt * 0.018) % 1;
    amrCurve.getPointAt(a.off, tmp);
    amrCurve.getTangentAt(a.off, tmp2);
    a.obj.position.copy(tmp);
    a.obj.rotation.y = Math.atan2(tmp2.x, tmp2.z);
    a.obj.cargo.visible = a.off > PICK_T + 0.02 && a.off < DROP_T;
    a.obj.led.material.emissiveIntensity = 1.2 + Math.sin(t * 6 + a.off * 20) * 0.8;
  }
  // light towers: occasional amber blink
  towers.forEach((tw, i) => {
    const amber = Math.sin(t * 0.7 + i * 1.9) > 0.93;
    tw.lamps[0].material.emissiveIntensity = amber ? 0.1 : 1.6;
    tw.lamps[1].material.emissiveIntensity = amber ? (Math.sin(t * 10) > 0 ? 2 : 0.2) : 0.08;
  });
  // printers: label feed loop
  printPhase = (t % 3) / 3;
  const feed = (pr, ph) => { const s = Math.min(1, Math.max(0.01, (ph - 0.1) / 0.5)); pr.label.scale.y = s; pr.label.position.z = 0.31 + s * 0.1; pr.led.material.emissiveIntensity = ph < 0.6 ? 2.5 : 0.6; };
  tracePrinters.forEach((p, i) => feed(p, (printPhase + i * 0.33) % 1));
  labelPrinters.forEach((p, i) => feed(p, (printPhase + 0.5 + i * 0.33) % 1));
  feed(aepPrinter, ((t % 4) / 4));
  // WI screens: highlight the scanned row cycle
  if (Math.floor(t * 1.5) !== tick.lastHmi) {
    tick.lastHmi = Math.floor(t * 1.5);
    const h = hmis[tick.lastHmi % hmis.length];
    h.screen.redraw(tick.lastHmi % 4);
  }
  // wireless rings
  for (const r of rings) {
    const ph = ((t * 0.5 + r.userData.phase) % 1);
    r.scale.setScalar(0.3 + ph * 3.2);
    r.material.opacity = 0.45 * (1 - ph) * (SCENES[current].id === 'infra' || SCENES[current].id === 'connected' ? 1.6 : 0.5);
  }
  // ESL + kanban
  if (Math.floor(t / 2) !== tick.lastEsl) {
    tick.lastEsl = Math.floor(t / 2);
    esls.forEach((e, i) => e.redraw(((i * 7 + tick.lastEsl) % 11) === 0));
    kanbanBoard.redraw(tick.lastEsl);
  }
  // RFID pallet passes through the gate into FG
  const rp = (t % 12) / 12;
  rfidPallet.position.z = 16 + rp * 14;
  rfidPallet.visible = rp < 0.95;
  const near = Math.abs(rfidPallet.position.z - HALL.z1) < 1.5;
  rfidGate.waves.forEach((w) => {
    const ph = (t * 0.8 + w.userData.phase) % 1;
    w.scale.setScalar(0.6 + ph * 1.8); w.position.y = 1.5;
    w.material.opacity = (near ? 0.9 : 0.3) * (1 - ph);
  });
  // data flows: fade in for the relevant scene
  const sid = SCENES[current].id;
  for (const f of flows) {
    const want = f.tags.includes(sid) ? 1 : 0;
    f.vis += (want - f.vis) * Math.min(1, dt * 3);
    const on = f.vis > 0.02;
    f.line.visible = on; f.line.material.opacity = 0.5 * f.vis;
    f.dots.forEach((d, i) => {
      d.visible = on;
      if (on) { f.curve.getPointAt((t * 0.18 + i / 3) % 1, tmp); d.position.copy(tmp); }
    });
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  requestAnimationFrame(tick);
}

renderUI();
resize();
goTo(0);
tick();
$('loading').classList.add('hide');
window.__bb = { scene, camera, controls, renderer, goTo };
