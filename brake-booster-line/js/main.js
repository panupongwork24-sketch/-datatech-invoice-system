// Brake booster plant — 3D walkthrough (Three.js + GSAP).
// Layout (metres): hall x -40..40, z -26..22. Lines run along Z (start z=-20 → end z=12).
//   Line 1 x=-15, Line 2 x=0, Line 3 x=15.
//   Right side x 28..37: 3 conveyor units → lane switch → X-lift (safety cage) → AMR + karakuri cart.
//   AMRs dock at Line 2 (x≈9.6, z=-9); totes roll off the karakuri cart onto the line-side conveyor.
//   Front z 13..20 = end-of-line label printing + packing. Left = network cabinet + (planned) RFID e-Kanban flow rack.
//   Front exit z=22 = (planned) RFID gate to the FG warehouse annex.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { UI, SCENES } from './content.js';

const gsap = window.gsap;
gsap.ticker.lagSmoothing(0); // keep camera moves time-accurate even on slow GPUs
const VIDEO = ['current', 'future'].includes(new URLSearchParams(location.search).get('video')) ? new URLSearchParams(location.search).get('video') : null;
const isMobile = !VIDEO && matchMedia('(max-width: 760px)').matches;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------------- palette (clean, light factory like the site photos) ---------------- */
const C = {
  bg: 0x1b2433, floor: 0xcfd5db, lineZone: 0xb7cbbf, wall: 0xe4e8ec, column: 0xe5e7eb,
  machine: 0xe9ecef, machineTrim: 0x5b6573, panel: 0x3a4250, alu: 0xc5ccd4,
  tote: 0x1f5fc4, toteRim: 0xb9c3cf, belt: 0x2f7d5e, safety: 0xf2c200, stainless: 0xd5dbe1,
  amrTop: 0xf4f5f7, amrBody: 0x2a2f37, amrAccent: 0xc62f3a, cardboard: 0xc49a6c, pallet: 0xa77b46,
  walkway: 0x4f9d6c, yellow: 0xf5c400,
};

/* ---------------- renderer / scene ---------------- */
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isMobile ? 1.5 : 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.cssText = 'position:fixed;inset:0;pointer-events:none;';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.bg);
scene.fog = new THREE.Fog(C.bg, 110, 220);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
// Real warehouse HDRI (Poly Haven, CC0) for believable reflections; RoomEnvironment stays as fallback.
new RGBELoader().loadAsync(window.__BB_ENV || '../smart-factory/assets/env/warehouse_env.hdr')
  .then((hdr) => { hdr.mapping = THREE.EquirectangularReflectionMapping; scene.environment = pmrem.fromEquirectangular(hdr).texture; hdr.dispose(); })
  .catch(() => {});

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.3, 400);
camera.position.set(6, 70, 62);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.47;
controls.minDistance = 2;
controls.maxDistance = 140;
controls.target.set(-1, 0, 0);

scene.add(new THREE.HemisphereLight(0xf1f5f9, 0x64748b, 0.45));
const sun = new THREE.DirectionalLight(0xfffaf0, 1.6);
sun.position.set(28, 60, 30);
sun.castShadow = true;
sun.shadow.mapSize.set(isMobile ? 1024 : 2048, isMobile ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 50, bottom: -50, near: 10, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

/* ---------------- helpers ---------------- */
const mats = new Map();
function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o }));
  return mats.get(k);
}
const steel = mat(C.stainless, { roughness: 0.3, metalness: 0.8 });
const alu = mat(C.alu, { roughness: 0.35, metalness: 0.75 });
const dark = mat(0x23272e, { roughness: 0.6, metalness: 0.3 });
const rubber = mat(0x15171a, { roughness: 0.9, metalness: 0 });
const toteMat = mat(C.tote, { roughness: 0.55, metalness: 0 });
const cardMat = mat(C.cardboard, { roughness: 0.9, metalness: 0 });
const palletMat = mat(C.pallet, { roughness: 0.9, metalness: 0 });
const glass = new THREE.MeshStandardMaterial({ color: 0xdbeafe, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
const geos = new Map();
function box(w, h, d, m, parent, x = 0, y = 0, z = 0) {
  const k = `${w},${h},${d}`;
  if (!geos.has(k)) {
    const r = Math.min(w, h, d) * 0.12;
    geos.set(k, r > 0.012 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, 0.05)) : new THREE.BoxGeometry(w, h, d));
  }
  const mesh = new THREE.Mesh(geos.get(k), typeof m === 'number' ? mat(m) : m);
  mesh.position.set(x, y, z);
  mesh.castShadow = Math.max(w, h, d) > 0.4; mesh.receiveShadow = true;
  if (parent) parent.add(mesh);
  return mesh;
}
const cylGeos = new Map();
function cyl(r, h, m, parent, x = 0, y = 0, z = 0, seg = 24, r2 = r) {
  const k = `${r},${h},${seg},${r2}`;
  if (!cylGeos.has(k)) cylGeos.set(k, new THREE.CylinderGeometry(r, r2, h, seg));
  const mesh = new THREE.Mesh(cylGeos.get(k), typeof m === 'number' ? mat(m) : m);
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
function plane(w, d, m, x, y, z) {
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof m === 'number' ? mat(m) : m);
  p.rotation.x = -Math.PI / 2; p.position.set(x, y, z); p.receiveShadow = true; scene.add(p);
  return p;
}

/** Canvas-texture screen / sign. draw(ctx, w, h, ...args) paints it; call .redraw(...args) to refresh. */
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
const skin = mat(0xd9a77f, { roughness: 0.7, metalness: 0 });
const headGeo = new THREE.SphereGeometry(0.13, 16, 12);
const capGeo = new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
function person(parent, x, z, ry = 0, shirt = 0x3b6ea5) {
  const g = group(parent, x, 0, z, ry);
  const pants = mat(0x2b3442, { roughness: 0.8, metalness: 0 });
  cyl(0.085, 0.82, pants, g, -0.1, 0.43, 0, 10); cyl(0.085, 0.82, pants, g, 0.1, 0.43, 0, 10);
  box(0.2, 0.08, 0.28, rubber, g, -0.1, 0.04, 0.04); box(0.2, 0.08, 0.28, rubber, g, 0.1, 0.04, 0.04);
  box(0.46, 0.66, 0.26, mat(shirt, { roughness: 0.85, metalness: 0 }), g, 0, 1.18, 0);
  cyl(0.06, 0.6, mat(shirt, { roughness: 0.85, metalness: 0 }), g, -0.29, 1.15, 0.05, 8);
  cyl(0.06, 0.6, mat(shirt, { roughness: 0.85, metalness: 0 }), g, 0.29, 1.15, 0.05, 8);
  const head = new THREE.Mesh(headGeo, skin); head.position.set(0, 1.66, 0); g.add(head);
  const cap = new THREE.Mesh(capGeo, mat(0xf8fafc, { roughness: 0.6, metalness: 0 })); cap.position.set(0, 1.69, 0); g.add(cap);
  return g;
}
/** Planned (roadmap) items: amber, semi-transparent. */
const planMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, transparent: true, opacity: 0.32, roughness: 0.5, depthWrite: false });
const planEdge = new THREE.LineDashedMaterial({ color: 0xf59e0b, dashSize: 0.4, gapSize: 0.25 });
function planBox(w, h, d, parent, x, y, z) {
  const m = box(w, h, d, planMat, parent, x, y, z);
  m.castShadow = false;
  const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(w, h, d)), planEdge);
  e.computeLineDistances(); m.add(e);
  return m;
}
/** Blue plastic tote with white label card (no logos). */
const toteLabelMat = mat(0xf8fafc, { roughness: 0.8, metalness: 0 });
function tote(parent, x = 0, y = 0, z = 0, w = 0.6, h = 0.26, d = 0.42, simple = false) {
  const g = group(parent, x, y, z);
  const b = box(w, h, d, toteMat, g, 0, h / 2, 0); b.castShadow = !simple;
  if (simple) return g;
  box(w + 0.02, 0.03, d + 0.02, mat(C.toteRim, { roughness: 0.5, metalness: 0 }), g, 0, h - 0.01, 0);
  const l = box(0.16, 0.09, 0.005, toteLabelMat, g, 0, h * 0.5, d / 2 + 0.004); l.castShadow = false;
  return g;
}

/* ---------------- labels ---------------- */
const labels = {};
let goTo = () => {};
function label(id, num, kind, x, y, z) {
  const el = document.createElement('div');
  el.className = 'lbl' + (kind === 'plan' ? ' plan' : '');
  el.innerHTML = `<b>${num}</b><span></span>`;
  el.addEventListener('click', () => goTo(SCENES.findIndex((s) => s.id === id)));
  const o = new CSS2DObject(el);
  o.position.set(x, y, z);
  scene.add(o);
  labels[id] = { el };
  return o;
}
const smallLabels = [];
function smallLabel(text, x, y, z, scenes = null) {
  const el = document.createElement('div');
  el.className = 'lbl small';
  el.textContent = text;
  const o = new CSS2DObject(el); o.position.set(x, y, z); scene.add(o);
  smallLabels.push({ o, scenes });
  return o;
}

/* ---------------- hall ---------------- */
const HALL = { x0: -40, x1: 40, z0: -26, z1: 22 };
{
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), mat(0x2b3442, { roughness: 0.95, metalness: 0 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
  // light epoxy floor (like the site photos)
  plane(HALL.x1 - HALL.x0, HALL.z1 - HALL.z0, mat(C.floor, { roughness: 0.22, metalness: 0.02 }), 0, 0, (HALL.z0 + HALL.z1) / 2);
  for (const lx of [-15, 0, 15]) plane(8, 34, mat(C.lineZone, { roughness: 0.25, metalness: 0.02 }), lx, 0.006, -4);
  const yellow = mat(C.yellow, { roughness: 0.5, metalness: 0 });
  const walk = mat(C.walkway, { roughness: 0.4, metalness: 0 });
  const stripe = (x, z, w, d, m = yellow) => plane(w, d, m, x, 0.012, z);
  for (const lx of [-15, 0, 15]) { stripe(lx - 4, -4, 0.1, 34); stripe(lx + 4, -4, 0.1, 34); }
  stripe(0, -22.6, 76, 0.1); stripe(0, 13.2, 46, 0.1);
  // green walkway along the front
  plane(70, 1.2, walk, 0, 0.009, 21.0);
  // AMR lane edges (dashed white)
  // AMR / material zone floor (soft lilac)
  plane(10, 30, mat(0xd7d2e8, { roughness: 0.25, metalness: 0.02 }), 32.5, 0.006, -8);

  // walls: back + left full height (light), front + right low (open view)
  const wall = mat(C.wall, { roughness: 0.85, metalness: 0 });
  box(80, 8, 0.4, wall, scene, 0, 4, HALL.z0);
  box(0.4, 8, 48, wall, scene, HALL.x0, 4, -2);
  box(0.4, 1, 48, wall, scene, HALL.x1, 0.5, -2);
  box(30, 1, 0.4, wall, scene, -27, 0.5, HALL.z1);
  box(42, 1, 0.4, wall, scene, 19, 0.5, HALL.z1);
  // skirting stripe on walls
  box(80, 0.3, 0.42, mat(0x94a3b8), scene, 0, 0.15, HALL.z0);
  box(0.42, 0.3, 48, mat(0x94a3b8), scene, HALL.x0, 0.15, -2);
  // columns with yellow/black protection
  const colMat = mat(C.column, { roughness: 0.7, metalness: 0.1 });
  for (let x = -40; x <= 40; x += 16) for (const z of [HALL.z0, HALL.z1]) {
    if (x === -8 && z === HALL.z1) continue; // keep the RFID gate opening clear
    box(0.6, 9, 0.6, colMat, scene, x, 4.5, z);
    box(0.68, 1.0, 0.68, mat(C.safety, { roughness: 0.5, metalness: 0.1 }), scene, x, 0.5, z);
  }
  for (let x = -40; x <= 40; x += 16) box(0.3, 0.5, 48, alu, scene, x, 9, -2);
  sign('BRAKE BOOSTER PRODUCTION', 22, 2, '#1e293b', '#f1f5f9', scene, 0, 6.2, HALL.z0 + 0.22);
  // ceiling light rows (LED battens) over the lines and aisles
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const lampGeo = new THREE.BoxGeometry(0.22, 0.06, 2.4);
  const lampXs = [-34, -21, -15, -8, 0, 7, 15, 22, 31];
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lampXs.length * 7);
  const m4 = new THREE.Matrix4(); let li = 0;
  for (const x of lampXs) for (let z = -21; z <= 15; z += 6) { m4.makeTranslation(x, 7.6, z); lamps.setMatrixAt(li++, m4); }
  lamps.count = li; scene.add(lamps);
  // material racks with blue totes along the back wall
  for (const rx of [-28, 22]) {
    const r = group(scene, rx, 0, HALL.z0 + 0.9);
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.35, 0.35]) box(0.06, 2.2, 0.06, alu, r, sx, 1.1, sz);
    for (let lv = 0; lv < 4; lv++) {
      box(3.3, 0.04, 0.8, alu, r, 0, 0.12 + lv * 0.55, 0);
      for (let b = 0; b < 5; b++) tote(r, -1.3 + b * 0.65, 0.14 + lv * 0.55, 0, 0.58, 0.24, 0.6, true);
    }
  }
}

/* ---------------- production lines ---------------- */
const LINES = [-15, 0, 15];
const LINE_Z0 = -20, LINE_Z1 = 12;
const STATIONS = [-16, -9, -2, 5];
const rollerTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#7c8591'); g.addColorStop(0.5, '#eef1f4'); g.addColorStop(1, '#7c8591');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  c.fillStyle = '#4b5563'; c.fillRect(0, 58, 64, 6);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const beltTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
  const c = cv.getContext('2d');
  c.fillStyle = '#2f7d5e'; c.fillRect(0, 0, 64, 64);
  c.fillStyle = 'rgba(0,0,0,.12)'; for (let i = 0; i < 64; i += 8) c.fillRect(0, i, 64, 2);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
})();
const movingTexes = [];
/** Conveyor along local Z (ry rotates it). kind 'roller' | 'belt'. */
function conveyor(x, z, len, width = 1.1, ry = 0, h = 0.85, kind = 'roller', parent = scene) {
  const g = group(parent, x, 0, z, ry);
  const t = (kind === 'belt' ? beltTex : rollerTex).clone(); t.needsUpdate = true;
  t.repeat.set(1, len * (kind === 'belt' ? 1 : 3)); movingTexes.push(t);
  const top = new THREE.Mesh(new THREE.PlaneGeometry(width, len),
    new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'belt' ? 0.7 : 0.35, metalness: kind === 'belt' ? 0 : 0.7 }));
  top.rotation.x = -Math.PI / 2; top.position.y = h; top.receiveShadow = true; g.add(top);
  box(0.08, 0.16, len, steel, g, -width / 2 - 0.04, h - 0.03, 0);
  box(0.08, 0.16, len, steel, g, width / 2 + 0.04, h - 0.03, 0);
  for (let s = -len / 2 + 0.4; s < len / 2; s += 1.8) {
    box(0.06, h, 0.06, alu, g, -width / 2, h / 2, s); box(0.06, h, 0.06, alu, g, width / 2, h / 2, s);
    box(width, 0.05, 0.05, alu, g, 0, 0.15, s);
  }
  if (kind === 'belt') box(0.3, 0.3, 0.3, steel, g, width / 2 + 0.2, h - 0.25, len / 2 - 0.3); // drive motor
  return g;
}
function lightTower(parent, x, y, z) {
  const g = group(parent, x, y, z);
  cyl(0.025, 0.4, steel, g, 0, 0.2, 0, 8);
  const cols = [0x22c55e, 0xf59e0b, 0xef4444];
  g.lamps = cols.map((c, i) => cyl(0.06, 0.12, glow(c, i === 0 ? 1.6 : 0.06), g, 0, 0.47 + i * 0.13, 0, 16));
  return g;
}
/** Digital WI screen: work instruction picture + step text (replaces paper WI). */
function digitalWI(parent, x, y, z, ry, line, st) {
  const g = group(parent, x, y, z, ry);
  cyl(0.025, 0.6, steel, g, 0, -0.35, 0, 8);
  box(0.78, 0.5, 0.05, dark, g, 0, 0.05, -0.03);
  const steps = ['Pick part and verify model', 'Assemble as shown in the picture', 'Check and confirm the result', 'Scan QR to complete the step'];
  const s = screen(0.72, 0.44, (c, W, H, k = 0) => {
    c.fillStyle = '#f8fafc'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f4c81'; c.fillRect(0, 0, W, 30);
    c.fillStyle = '#fff'; c.font = 'bold 17px system-ui'; c.fillText(`DIGITAL WI · L${line} ST${st}`, 8, 21);
    c.textAlign = 'right'; c.fillText('QR ✓', W - 8, 21); c.textAlign = 'left';
    // picture panel
    c.fillStyle = '#e2e8f0'; c.fillRect(8, 38, W * 0.48, H - 70);
    const cx = 8 + W * 0.24, cy = 38 + (H - 70) / 2;
    c.fillStyle = '#475569'; c.beginPath(); c.arc(cx, cy, 34, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#94a3b8'; c.beginPath(); c.arc(cx, cy, 20, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#334155'; c.fillRect(cx - 4, cy - 52, 8, 24);
    c.strokeStyle = '#ef4444'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, 44, -0.6 + k, 0.6 + k); c.stroke();
    // step text
    c.fillStyle = '#0f172a'; c.font = 'bold 17px system-ui'; c.fillText(`Step ${k + 1} / 4`, W * 0.52, 58);
    c.font = '15px system-ui';
    const words = steps[k % 4].split(' '); let line2 = '', ly = 84;
    for (const w of words) { if (c.measureText(line2 + w).width > W * 0.45) { c.fillText(line2, W * 0.52, ly); line2 = ''; ly += 20; } line2 += w + ' '; }
    c.fillText(line2, W * 0.52, ly);
    c.fillStyle = '#16a34a'; c.font = 'bold 15px system-ui'; c.fillText('● OK', W * 0.52, H - 44);
    // progress
    c.fillStyle = '#cbd5e1'; c.fillRect(8, H - 22, W - 16, 10);
    c.fillStyle = '#0f4c81'; c.fillRect(8, H - 22, (W - 16) * (k + 1) / 4, 10);
  }, g, 0, 0.05, 0.0, 0, 360);
  g.screen = s;
  // handheld scanner on a holder
  box(0.06, 0.16, 0.06, mat(0xf59e0b), g, 0.46, -0.12, 0.05);
  return g;
}
function hmi(parent, x, y, z, ry, title, rows) {
  const g = group(parent, x, y, z, ry);
  cyl(0.025, 0.5, steel, g, 0, -0.25, 0, 8);
  box(0.62, 0.42, 0.05, dark, g, 0, 0.05, -0.03);
  g.screen = screen(0.56, 0.36, (c, W, H) => {
    c.fillStyle = '#0b1f33'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f4c81'; c.fillRect(0, 0, W, 34);
    c.fillStyle = '#fff'; c.font = 'bold 20px system-ui'; c.fillText(title, 10, 24);
    c.font = '17px system-ui';
    rows.forEach((r, i) => {
      c.fillStyle = '#cbd5e1'; c.fillText(r[0], 10, 60 + i * 26);
      c.fillStyle = r[1] === 'OK' ? '#4ade80' : '#e2e8f0'; c.textAlign = 'right'; c.fillText(r[1], W - 10, 60 + i * 26); c.textAlign = 'left';
    });
  }, g, 0, 0.05, 0.0, 0, 320);
  return g;
}
/** SATO CL4NX Plus (from the product photo): 271 W × 321 H × 457 D mm.
 *  Charcoal front with a left control column (SATO / CL4NX Plus wordmark text, colour LCD, D-pad), large front door,
 *  silver side cover with a media window, tear bar + label exit across the front. Front faces local +Z. */
const prFront = mat(0x2c2f35, { roughness: 0.45, metalness: 0.2 });
const prSilver = mat(0xb9bec4, { roughness: 0.32, metalness: 0.65 });
const prSilverLow = mat(0x8e949b, { roughness: 0.38, metalness: 0.6 });
const prWindow = new THREE.MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.85 });
const prFaceTex = (() => {
  const cv = document.createElement('canvas'); cv.width = 271 * 2; cv.height = 321 * 2;
  const c = cv.getContext('2d'); const W = cv.width, H = cv.height, colW = W * 0.31;
  c.fillStyle = '#2b2e34'; c.fillRect(0, 0, W, H);
  // control column
  c.fillStyle = '#25282d'; c.fillRect(0, 0, colW, H);
  c.fillStyle = '#d9dde2'; c.font = 'italic 900 34px Arial, sans-serif'; c.fillText('SATO', 26, 62);
  c.font = '600 21px Arial, sans-serif'; c.fillText('CL4NX', 26, 92);
  c.fillStyle = '#d9dde2'; c.fillRect(100, 76, 46, 20); c.fillStyle = '#25282d'; c.font = '700 15px Arial'; c.fillText('Plus', 106, 92);
  c.fillStyle = '#3a3e45'; c.fillRect(22, 118, colW - 44, 30);                    // power key bar
  c.fillStyle = '#17191c'; c.fillRect(16, 172, colW - 32, 300);                   // LCD bezel + keypad
  c.fillStyle = '#2f7fd6'; c.fillRect(28, 190, colW - 56, 130);                   // colour LCD
  c.fillStyle = '#7fb8f0'; c.fillRect(28, 190, colW - 56, 18);
  c.fillStyle = '#e8f2fd'; c.font = '600 16px Arial'; c.fillText('Online', 64, 232);
  c.strokeStyle = '#e8f2fd'; c.lineWidth = 3; c.strokeRect(70, 246, 54, 34);
  c.fillStyle = '#3b8ff0'; c.fillRect(28, 340, colW - 56, 4);
  c.fillStyle = '#5d636c';
  c.beginPath(); c.arc(colW / 2, 384, 15, 0, Math.PI * 2); c.fill();               // D-pad centre
  for (const [dx, dy] of [[0, -36], [0, 36], [-36, 0], [36, 0]]) { c.beginPath(); c.arc(colW / 2 + dx, 420 + dy * 0.6, 9, 0, Math.PI * 2); c.fill(); }
  for (const dx of [-62, 62]) c.fillRect(colW / 2 + dx - 8, 410, 16, 28);
  c.fillStyle = '#3a3e45'; c.fillRect(22, H - 70, 44, 18);                        // USB port
  // front door
  c.fillStyle = '#30343a'; c.fillRect(colW + 8, 12, W - colW - 20, H * 0.56);
  c.strokeStyle = '#1d2024'; c.lineWidth = 4; c.strokeRect(colW + 8, 12, W - colW - 20, H * 0.56);
  // tear bar / label exit band
  c.fillStyle = '#1b1d21'; c.fillRect(colW, H * 0.6, W - colW, 46);
  c.fillStyle = '#c5cad0'; c.fillRect(colW + 18, H * 0.6 + 12, W - colW - 50, 14);
  c.fillStyle = '#2f6fd0'; c.fillRect(W - 30, H * 0.6 + 8, 10, 22);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
})();
const prFaceMat = new THREE.MeshStandardMaterial({ map: prFaceTex, roughness: 0.5, metalness: 0.15 });
function printer(parent, x, y, z, ry = 0) {
  const g = group(parent, x, y, z, ry);
  const W = 0.271, H = 0.321, D = 0.457, FD = 0.07; // FD = depth of the charcoal front frame
  box(W, H, FD, prFront, g, 0, H / 2, D / 2 - FD / 2);                              // front frame
  box(W + 0.004, H * 0.68, D - FD, prSilver, g, 0, H * 0.66, -FD / 2);               // silver side cover (top + sides)
  box(W, H * 0.33, D - FD, prSilverLow, g, 0, H * 0.165, -FD / 2);                   // lower body
  box(W + 0.006, 0.006, D - FD, prFront, g, 0, H * 0.325, -FD / 2);                  // seam
  for (const sx of [-1, 1]) {                                                         // media windows on both sides
    const w = new THREE.Mesh(new THREE.PlaneGeometry(D * 0.32, H * 0.36), prWindow);
    w.position.set(sx * (W / 2 + 0.0035), H * 0.66, D * 0.05); w.rotation.y = sx * Math.PI / 2; g.add(w);
  }
  const face = new THREE.Mesh(new THREE.PlaneGeometry(W, H), prFaceMat);
  face.position.set(0, H / 2, D / 2 + 0.001); g.add(face);
  g.led = box(0.01, 0.01, 0.004, glow(0x3b8ff0, 1.6), g, W / 2 - 0.02, H * 0.37, D / 2 + 0.004);
  for (const sx of [-1, 1]) box(0.03, 0.012, 0.05, rubber, g, sx * 0.1, 0.006, D / 2 - 0.06); // feet
  // label leaving the exit and hanging down the front (QR + barcode)
  const lbl = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
  lbl.position.set(0.04, H * 0.37, D / 2 + 0.012); lbl.rotation.x = -0.35;
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 102; const c = cv.getContext('2d');
  c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 102); c.fillStyle = '#000';
  for (let i = 0; i < 7; i++) for (let j = 0; j < 7; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0) c.fillRect(8 + i * 4, 8 + j * 4, 4, 4);
  for (let b = 0; b < 30; b++) c.fillRect(44 + b * 2.6, 10, b % 3 ? 1 : 2, 24);
  for (let b = 0; b < 44; b++) c.fillRect(10 + b * 2.5, 52, b % 4 ? 1 : 2, 30);
  lbl.material.map = new THREE.CanvasTexture(cv);
  lbl.geometry.translate(0, -0.06, 0); // hinge at the top edge (exit slot)
  g.add(lbl); g.label = lbl;
  g.scale.setScalar(1.25);
  return g;
}
function plcCabinet(parent, x, z, ry = 0) {
  const g = group(parent, x, 0, z, ry);
  box(0.9, 1.9, 0.5, mat(0xd9dde2, { roughness: 0.5, metalness: 0.2 }), g, 0, 0.95, 0);
  box(0.8, 1.7, 0.02, mat(0xcfd5dc, { roughness: 0.45, metalness: 0.2 }), g, 0, 1.0, 0.26);
  box(0.05, 0.3, 0.04, dark, g, 0.3, 1.1, 0.28);
  for (let i = 0; i < 4; i++) box(0.06, 0.06, 0.02, glow([0x22c55e, 0x22c55e, 0x38bdf8, 0xf59e0b][i], 1.4), g, -0.25 + i * 0.1, 1.65, 0.28);
  sign('PLC', 0.4, 0.16, '#111827', '#fbbf24', g, 0, 1.4, 0.275, 0, 'bold 80px system-ui');
  return g;
}
/** Assembly / test machine: painted base, aluminium-profile guard with polycarbonate, control panel, light tower. */
function machine(parent, x, z, side) {
  const g = group(parent, x + side * 1.75, 0, z);
  box(1.9, 0.95, 2.0, mat(C.machine, { roughness: 0.45, metalness: 0.1 }), g, 0, 0.475, 0);
  box(1.92, 0.08, 2.02, mat(C.machineTrim), g, 0, 0.97, 0);
  // aluminium frame + clear guards
  for (const sx of [-0.92, 0.92]) for (const sz of [-0.97, 0.97]) box(0.05, 1.05, 0.05, alu, g, sx, 1.5, sz);
  box(1.9, 0.05, 2.0, alu, g, 0, 2.02, 0);
  const gd = box(1.82, 0.98, 1.92, glass, g, 0, 1.5, 0); gd.castShadow = false;
  // internal fixture
  box(0.6, 0.3, 0.6, mat(0x64748b, { roughness: 0.3, metalness: 0.7 }), g, 0, 1.15, 0);
  cyl(0.06, 0.6, steel, g, 0, 1.6, 0, 12);
  // control panel facing the aisle
  const p = box(0.5, 0.4, 0.08, mat(C.panel), g, -side * 0.55, 1.25, 1.02);
  p.rotation.x = -0.3;
  box(0.06, 0.06, 0.03, glow(0x22c55e, 1.2), g, -side * 0.55 - 0.12, 1.25, 1.07);
  box(0.06, 0.06, 0.03, glow(0xef4444, 1.0), g, -side * 0.55 + 0.12, 1.25, 1.07);
  g.tower = lightTower(g, side * 0.75, 2.05, -0.8);
  return g;
}

const products = [];
const boosterGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 32);
const boosterMat = mat(0x3a3f47, { roughness: 0.3, metalness: 0.85 });
const studMat = mat(0xa8b0ba, { roughness: 0.3, metalness: 0.9 });
function booster() {
  const g = new THREE.Group();
  const b = new THREE.Mesh(boosterGeo, boosterMat); b.castShadow = true; b.position.y = 0.13; g.add(b);
  cyl(0.07, 0.22, studMat, g, 0, 0.36, 0, 12);
  return g;
}

const towers = [], wis = [], tracePrinters = [];
const planObjs = []; // roadmap-only objects (hidden in the 'current' video part)
const rfidPads = [];
const rfidMat = glow(0xf59e0b, 0.9);
const rfidPanelMat = mat(0xeef0f2, { roughness: 0.55, metalness: 0 });
const rfidReaderMat = mat(0x3a3f47, { roughness: 0.45, metalness: 0.3 });
LINES.forEach((lx, li) => {
  conveyor(lx, (LINE_Z0 + LINE_Z1) / 2, LINE_Z1 - LINE_Z0);
  sign(`LINE ${li + 1}`, 3, 0.8, '#0f4c81', '#ffffff', scene, lx, 4.6, LINE_Z0 - 1.6, 0);
  { const p = group(scene, lx, 0, LINE_Z0 - 1.6); box(0.1, 4.2, 0.1, alu, p, -1.3, 2.1, 0); box(0.1, 4.2, 0.1, alu, p, 1.3, 2.1, 0); }
  STATIONS.forEach((sz, si) => {
    const side = si % 2 === 0 ? -1 : 1;
    const m = machine(scene, lx, sz, side);
    towers.push(m.tower);
    const os = -side; // operator side
    const w = digitalWI(scene, lx + os * 1.2, 1.6, sz + 0.9, os * Math.PI / 2, li + 1, si + 1);
    wis.push(w);
    // RFID e-Kanban (planned): panel antenna on an arm facing the operator + fixed reader box on the post
    const ax = lx + os * 1.25, az = sz - 0.3;
    const pad = group(scene, ax, 0, az, os * Math.PI / 2);
    planObjs.push(pad);
    box(0.06, 1.55, 0.06, alu, pad, 0, 0.775, -0.05);                    // aluminium profile post
    box(0.24, 0.32, 0.03, rfidReaderMat, pad, 0, 0.95, -0.02);           // fixed reader (in front of the post)
    box(0.05, 0.02, 0.005, glow(0x22c55e, 1.2), pad, -0.06, 1.06, 0.0);
    box(0.05, 0.02, 0.005, rfidMat, pad, 0.02, 1.06, 0.0);               // amber = planned
    const ant = group(pad, 0, 1.5, 0.02); ant.rotation.x = -0.35;
    box(0.27, 0.27, 0.045, rfidPanelMat, ant, 0, 0, 0);                  // panel antenna (white radome)
    box(0.2, 0.012, 0.004, rfidMat, ant, 0, -0.11, 0.024);               // planned status strip
    { const cbl = cyl(0.008, 0.5, rubber, pad, 0.1, 1.22, -0.03, 6); cbl.rotation.z = 0.05; } // coax to reader
    const nrm = new THREE.Vector3(os, 0, 0);
    rfidPads.push({ position: new THREE.Vector3(ax + os * 0.04, 1.5, az), normal: nrm, os });
    if (si !== 0) person(scene, lx + os * 2.0, sz + 0.2, os > 0 ? -Math.PI / 2 : Math.PI / 2, [0x3b6ea5, 0x4a7fb0, 0x3b6ea5][li]);
  });
  const tp = printer(scene, lx + 1.25, 1.0, LINE_Z0 + 0.6, -Math.PI / 2);
  box(0.8, 1.0, 0.8, steel, scene, lx + 1.25, 0.5, LINE_Z0 + 0.6);
  tracePrinters.push(tp);
  if (li === 1) smallLabel('SATO · QR', lx + 1.25, 1.75, LINE_Z0 + 0.6, ['trace']);
  plcCabinet(scene, lx - 2.4, LINE_Z0 - 0.4, 0);
  box(1.6, 0.85, 1.4, mat(C.stainless, { roughness: 0.3, metalness: 0.7 }), scene, lx, 0.425, LINE_Z1 + 1.0);
  for (let k = 0; k < 9; k++) {
    const p = booster(); scene.add(p);
    products.push({ obj: p, x: lx, off: k / 9, speed: 0.02 + li * 0.002 });
  }
});

/* ---------------- Digital checklist: leader with a handheld tablet walks the lines ---------------- */
const CK_A = new THREE.Vector3(-10.35, 0, -9), CK_B = new THREE.Vector3(-3.35, 0, -2); // L1 ST2 (faces -X) · L2 ST3 (faces +X)
const inspector = person(null, 0, 0, 0, 0x0f766e);
const tablet = group(inspector, 0, 1.18, 0.34);
tablet.rotation.x = -1.25;
box(0.27, 0.19, 0.012, mat(0x1f2328, { roughness: 0.4, metalness: 0.3 }), tablet, 0, 0, 0);
const ckItems = [['Air pressure', 'Safety cover closed', 'Light curtain test', 'E-stop test', 'Tooling condition'],
  ['Area clean (5S)', 'Walkway clear', 'PPE worn', 'Labels in place', 'Fire extinguisher']];
const drawChecklist = (c, W, H, set = 0, done = 0) => {
  c.fillStyle = '#f8fafc'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#0f766e'; c.fillRect(0, 0, W, 30);
  c.fillStyle = '#fff'; c.font = 'bold 15px Arial';
  c.fillText(set ? 'DIGITAL CHECKLIST · 5S / SAFETY' : 'DIGITAL CHECKLIST · START-UP', 8, 20);
  c.font = '14px Arial';
  ckItems[set].forEach((it, i) => {
    const y = 50 + i * 22, ok = i < done;
    c.strokeStyle = '#94a3b8'; c.lineWidth = 2; c.strokeRect(10, y - 13, 15, 15);
    if (ok) { c.fillStyle = '#16a34a'; c.fillRect(12, y - 11, 11, 11); }
    c.fillStyle = '#0f172a'; c.fillText(it, 34, y);
    c.fillStyle = ok ? '#16a34a' : '#94a3b8'; c.textAlign = 'right'; c.fillText(ok ? 'OK' : '—', W - 10, y); c.textAlign = 'left';
  });
  c.fillStyle = done >= 5 ? '#16a34a' : '#cbd5e1'; c.fillRect(8, H - 18, W - 16, 12);
  c.fillStyle = done >= 5 ? '#fff' : '#334155'; c.font = 'bold 11px Arial';
  c.fillText(done >= 5 ? 'SAVED TO SERVER ✓' : `${done} / 5 checked`, 14, H - 8);
};
const tabletScreen = screen(0.25, 0.17, drawChecklist, tablet, 0, 0, 0.007, 0, 256);
// enlarged callout of the tablet screen (billboard), only in the checklist scene
const ckCallout = screen(1.05, 0.714, drawChecklist, scene, 0, 0, 0, 0, 256);
ckCallout.material.transparent = true;
const ckLeader = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x0d9488 }));
scene.add(ckLeader);

const rfidCards = LINES.map(() => {
  const c = box(0.012, 0.18, 0.12, mat(0xfef3c7, { roughness: 0.8, metalness: 0 }), scene); // kanban card with RFID tag
  c.castShadow = false;
  c.ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.19, 32), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  c.ring.rotation.y = Math.PI / 2; scene.add(c.ring);
  planObjs.push(c, c.ring);
  return c;
});

/* ---------------- network cabinet + traceability dashboard (left) ---------------- */
const rackPos = new THREE.Vector3(-35.5, 0, -20);
{
  const g = group(scene, rackPos.x, 0, rackPos.z, Math.PI / 2);
  for (let i = 0; i < 3; i++) {
    const r = group(g, (i - 1) * 0.75, 0, 0);
    box(0.7, 2.1, 1.0, mat(0x1c2027, { roughness: 0.5, metalness: 0.4 }), r, 0, 1.05, 0);
    for (let u = 0; u < 9; u++) {
      box(0.58, 0.12, 0.02, 0x374151, r, 0, 0.35 + u * 0.18, 0.51);
      box(0.03, 0.03, 0.01, glow(u % 3 ? 0x22c55e : 0x38bdf8, 1.6), r, 0.22, 0.35 + u * 0.18, 0.525);
    }
  }
  screen(3.2, 1.8, (c, W, H) => {
    c.fillStyle = '#0b1f33'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0f4c81'; c.fillRect(0, 0, W, 44);
    c.fillStyle = '#fff'; c.font = 'bold 26px system-ui'; c.fillText('TRACEABILITY · UNIT HISTORY', 14, 31);
    c.font = '20px system-ui';
    const rows = [['Serial (QR)', 'PN-2-0001'], ['Line', 'Line 2'], ['Leak test', 'OK'], ['Process values (PLC)', 'OK'], ['Digital WI steps', '4 / 4'], ['Customer label', 'Printed']];
    rows.forEach((r, i) => { c.fillStyle = '#94a3b8'; c.fillText(r[0], 18, 82 + i * 34); c.fillStyle = r[1] === 'OK' ? '#4ade80' : '#e2e8f0'; c.textAlign = 'right'; c.fillText(r[1], W - 18, 82 + i * 34); c.textAlign = 'left'; });
    c.fillStyle = '#64748b'; c.font = '15px system-ui'; c.fillText('Sample screen — illustrative data', 18, H - 12);
  }, scene, HALL.x0 + 0.25, 3.4, -15, Math.PI / 2, 512);
}

/* ---------------- infrastructure: cable trays + wireless APs ---------------- */
const rings = [];
const ringMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });
const trayY = 6.2;
{
  const trayMat = mat(0xa9b4c0, { roughness: 0.4, metalness: 0.7 });
  box(72, 0.12, 0.5, trayMat, scene, -2, trayY, -23.5);
  for (const lx of LINES) box(0.5, 0.12, 34, trayMat, scene, lx + 3.2, trayY, -6);
  box(0.5, 0.12, 4, trayMat, scene, rackPos.x + 1.0, trayY, -21.5);
  const drop = mat(0x38bdf8, { roughness: 0.5, metalness: 0 });
  for (const lx of LINES) for (const sz of STATIONS) cyl(0.025, trayY - 2.2, drop, scene, lx + 3.2, (trayY + 2.2) / 2, sz + 0.9, 6);
  const apPos = [[-15, -10], [-15, 6], [0, -10], [0, 6], [15, -10], [15, 6], [29, -16], [29, 0], [-30, 0], [0, 17]];
  apPos.forEach(([x, z]) => {
    const g = group(scene, x + 3.2, trayY - 0.25, z);
    cyl(0.22, 0.06, mat(0xf8fafc, { roughness: 0.4, metalness: 0 }), g, 0, 0, 0, 24);
    box(0.05, 0.03, 0.02, glow(0x38bdf8, 2), g, 0, -0.04, 0.18);
    for (let r = 0; r < 2; r++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.0, 40), ringMat.clone());
      ring.rotation.x = -Math.PI / 2; ring.position.set(x + 3.2, trayY - 0.4, z); ring.userData.phase = r * 0.5;
      scene.add(ring); rings.push(ring);
    }
  });
}

/* ---------------- AEP: one PLC drives 3 SATO printers (Line 3, station 3) ---------------- */
const cableMat = mat(0x1f2937, { roughness: 0.7, metalness: 0 });
function cable(pts, parent = scene, r = 0.012) {
  const c = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
  const m = new THREE.Mesh(new THREE.TubeGeometry(c, 24, r, 5, false), cableMat); parent.add(m); return m;
}
const aepPrinters = [];
{
  const x = 16.2, zs = [-3.6, -4.6, -5.6];
  box(0.8, 1.0, 2.9, steel, scene, x, 0.5, -4.6);
  zs.forEach((z) => {
    aepPrinters.push(printer(scene, x, 1.0, z, -Math.PI / 2));
    cable([[17.72, 1.55, -4.6], [17.2, 1.75, (z - 4.6) / 2], [16.55, 1.2, z]]);           // Ethernet PLC → printer
  });
  smallLabel('PLC → AEP · 3 SATO printers (TCP/IP)', x, 1.95, -4.6, ['aep']);
  plcCabinet(scene, 18.0, -4.6, -Math.PI / 2);
}

/* ---------------- small helpers for the label stations ---------------- */
const deskMat = mat(0xe7e5e4, { roughness: 0.6, metalness: 0 });
function desk(parent, x, z, w = 1.6, d = 0.8, ry = 0) {
  const g = group(parent, x, 0, z, ry);
  box(w, 0.05, d, deskMat, g, 0, 0.76, 0);
  for (const sx of [-w / 2 + 0.05, w / 2 - 0.05]) for (const sz of [-d / 2 + 0.05, d / 2 - 0.05]) box(0.04, 0.74, 0.04, steel, g, sx, 0.37, sz);
  return g;
}
function monitor(parent, x, y, z, ry, w, h, draw, px = 512) {
  const g = group(parent, x, y, z, ry);
  box(w + 0.05, h + 0.05, 0.04, dark, g, 0, 0, -0.025);
  box(0.05, 0.3, 0.05, dark, g, 0, -h / 2 - 0.12, -0.05);
  box(0.28, 0.02, 0.18, dark, g, 0, -h / 2 - 0.27, -0.05);
  g.screen = screen(w, h, draw, g, 0, 0, 0.001, 0, px);
  return g;
}
const barcode = (c, x, y, w, h) => { c.fillStyle = '#000'; for (let b = 0, bx = x; bx < x + w; b++) { const bw = (b * 7) % 3 + 1; c.fillRect(bx, y, bw, h); bx += bw + ((b * 5) % 2) + 1; } };
const qr = (c, x, y, s) => { c.fillStyle = '#000'; const n = 11, u = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if ((i * 7 + j * 13 + i * j) % 3 === 0 || ((i < 3 || i > 7) && (j < 3 || j > 7) && !(i % 10 && j % 10 && i !== 1 && j !== 1 && i !== 9 && j !== 9))) c.fillRect(x + i * u, y + j * u, u, u); };
function handheld(parent, x, y, z, rugged = false) {
  const g = group(parent, x, y, z);
  box(0.08, 0.2, 0.035, mat(rugged ? 0x2b3138 : 0x1f2937, { roughness: 0.6, metalness: 0.1 }), g, 0, 0, 0);
  if (rugged) { box(0.09, 0.03, 0.045, mat(0xf59e0b), g, 0, 0.1, 0); box(0.09, 0.03, 0.045, mat(0xf59e0b), g, 0, -0.1, 0); }
  box(0.06, 0.08, 0.004, glow(0x38bdf8, 0.8), g, 0, 0.04, 0.019);
  return g;
}
/** Sample label artwork (generic data only). */
function drawLabel(c, W, H, title, rows, hdr = '#0B2A5B') {
  c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.fillStyle = hdr; c.fillRect(0, 0, W, H * 0.16);
  c.fillStyle = '#fff'; c.font = `bold ${Math.round(H * 0.1)}px Arial`; c.fillText(title, W * 0.05, H * 0.115);
  c.fillStyle = '#111'; c.font = `${Math.round(H * 0.065)}px Arial`;
  rows.forEach((r, i) => c.fillText(r, W * 0.05, H * (0.27 + i * 0.09)));
  qr(c, W * 0.66, H * 0.21, W * 0.28);
  barcode(c, W * 0.05, H * 0.72, W * 0.9, H * 0.2);
  c.strokeStyle = '#111'; c.lineWidth = 3; c.strokeRect(1, 1, W - 2, H - 2);
}
const SAMPLE = ['Part No. 12345-AB', 'Lot No. L2026-001', 'Qty 24'];

/* ---------------- 7 · Shipping label from Excel (shipping desk, left of packing) ---------------- */
let shipPrinter, shipMon;
{
  const x0 = -18.6, z0 = 20.7;
  desk(scene, x0, z0, 2.4, 0.85);
  shipMon = monitor(scene, x0 - 0.45, 1.3, z0 + 0.1, Math.PI, 1.0, 0.58, (c, W, H, sel = 1) => {
    c.fillStyle = '#f1f5f9'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0B5ED7'; c.fillRect(0, 0, W, 30);
    c.fillStyle = '#fff'; c.font = 'bold 17px Arial'; c.fillText('Label design software · Print from Excel', 10, 21);
    // Excel table
    const cols = ['Part Name', 'Part No.', 'Lot No.', 'Date'], cw = [92, 86, 92, 66], x = 8, y = 40;
    c.font = 'bold 12px Arial'; c.fillStyle = '#107c41'; c.fillRect(x, y, 336, 20);
    c.fillStyle = '#fff'; let cx = x + 4; cols.forEach((t, i) => { c.fillText(t, cx, y + 14); cx += cw[i]; });
    c.font = '12px Arial';
    for (let r = 0; r < 6; r++) {
      const ry = y + 20 + r * 20;
      c.fillStyle = r === sel ? '#cfe2ff' : r % 2 ? '#fff' : '#f8fafc'; c.fillRect(x, ry, 336, 20);
      c.fillStyle = '#0B2A5B'; cx = x + 4;
      [`Booster ${['A', 'B', 'C', 'D', 'E', 'F'][r]}`, `1234${r}-AB`, `L2026-00${r + 1}`, '11/11'].forEach((t, i) => { c.fillText(t, cx, ry + 14); cx += cw[i]; });
    }
    c.strokeStyle = '#cbd5e1'; c.strokeRect(x, y, 336, 140);
    // preview + print
    c.fillStyle = '#fff'; c.fillRect(356, 40, 148, 100); c.strokeStyle = '#94a3b8'; c.strokeRect(356, 40, 148, 100);
    c.fillStyle = '#0B2A5B'; c.font = 'bold 12px Arial'; c.fillText('SHIPPING LABEL', 364, 56);
    c.font = '11px Arial'; c.fillText(`Part No. 1234${sel}-AB`, 364, 74); c.fillText(`Lot No. L2026-00${sel + 1}`, 364, 90); c.fillText('Qty 24', 364, 106);
    barcode(c, 364, 114, 130, 18);
    c.fillStyle = '#e2e8f0'; c.fillRect(356, 148, 70, 22); c.fillRect(434, 148, 70, 22);
    c.fillStyle = '#0B2A5B'; c.font = 'bold 11px Arial'; c.fillText('4 x 2 inch', 362, 163); c.fillText('4 x 6 inch ✓', 437, 163);
    c.fillStyle = '#0B5ED7'; c.fillRect(356, 178, 148, 30); c.fillStyle = '#fff'; c.font = 'bold 15px Arial'; c.fillText('PRINT', 408, 198);
    c.fillStyle = '#16a34a'; c.font = 'bold 12px Arial'; c.fillText('✓ User master', 10, H - 30); c.fillText('✓ Log file', 130, H - 30);
    c.fillStyle = '#64748b'; c.font = '11px Arial'; c.fillText('Sample data', 10, H - 10);
  });
  box(0.45, 0.02, 0.15, dark, scene, x0 - 0.45, 0.8, z0 - 0.2);                 // keyboard
  box(0.2, 0.42, 0.42, dark, scene, x0 - 1.0, 0.21, z0 + 0.1);                  // PC under the desk
  shipPrinter = printer(scene, x0 + 0.65, 0.785, z0 - 0.05, Math.PI);
  person(scene, x0 - 0.2, z0 + 0.85, Math.PI, 0x3b6ea5);
  // pallet of cartons with 4 x 6 shipping labels, plus a small 4 x 2 label box on the desk
  const pg = group(scene, x0 + 2.4, 0, z0 - 1.0);
  box(1.2, 0.15, 1.0, palletMat, pg, 0, 0.075, 0);
  const shipLbl = (() => { const cv = document.createElement('canvas'); cv.width = 200; cv.height = 300; drawLabel(cv.getContext('2d'), 200, 300, 'SHIPPING', SAMPLE); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); })();
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let l = 0; l < 2; l++) {
    box(0.55, 0.42, 0.45, cardMat, pg, -0.28 + a * 0.56, 0.36 + l * 0.43, -0.23 + b * 0.46);
    if (b === 0) { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), shipLbl); m.position.set(-0.28 + a * 0.56, 0.36 + l * 0.43, -0.462); m.rotation.y = Math.PI; pg.add(m); }
  }
  smallLabel('Shipping desk · Excel → SATO', x0, 2.05, z0, ['shipping']);
}

/* ---------------- 8 · Front label for the new model (Line 1, beside station 1–2) ---------------- */
let frontPrinter, frontHmi;
{
  const x0 = -18.3, z0 = -12.5;
  box(1.5, 0.85, 0.7, mat(C.stainless, { roughness: 0.3, metalness: 0.7 }), scene, x0, 0.425, z0);
  frontPrinter = printer(scene, x0 + 0.42, 0.85, z0, 0);
  frontHmi = group(scene, x0 - 0.35, 1.5, z0 - 0.1);
  cyl(0.025, 0.6, steel, frontHmi, 0, -0.33, 0, 8);
  box(0.66, 0.46, 0.05, dark, frontHmi, 0, 0.05, -0.03);
  frontHmi.screen = screen(0.6, 0.4, (c, W, H, k = 0) => {
    c.fillStyle = '#f8fafc'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0B5ED7'; c.fillRect(0, 0, W, 34);
    c.fillStyle = '#fff'; c.font = 'bold 20px Arial'; c.fillText('FRONT LABEL', 10, 24);
    const rows = [['Scan Kanban', k ? 'K-0012 ✓' : '— scan —'], ['Line', 'Line 1'], ['Qty', '24'], ['Shift', 'D'], ['Master check', k ? 'OK' : '…']];
    c.font = '16px Arial';
    rows.forEach((r, i) => { c.fillStyle = '#334155'; c.fillText(r[0], 10, 60 + i * 24); c.fillStyle = r[1] === 'OK' || r[1].includes('✓') ? '#16a34a' : '#0B2A5B'; c.textAlign = 'right'; c.fillText(r[1], W - 10, 60 + i * 24); c.textAlign = 'left'; });
    c.fillStyle = k ? '#0B5ED7' : '#94a3b8'; c.fillRect(10, H - 40, W - 20, 30);
    c.fillStyle = '#fff'; c.font = 'bold 16px Arial'; c.textAlign = 'center'; c.fillText(k > 1 ? 'PRINTED ✓' : 'PRINT', W / 2, H - 19); c.textAlign = 'left';
  }, frontHmi, 0, 0.05, 0, 0, 320);
  const op = person(scene, x0 - 0.1, z0 + 0.95, Math.PI, 0x3b6ea5);
  handheld(op, -0.28, 1.0, 0.3);
  box(0.12, 0.18, 0.01, mat(0xfef9c3, { roughness: 0.8, metalness: 0 }), op, 0.28, 1.0, 0.3);   // kanban card
  smallLabel('Front label · new model', x0, 2.2, z0, ['frontlabel']);
}

/* ---------------- 9 · Reprint lot card / label (between Line 2 and Line 3) ---------------- */
let reprintPrinter, reprintMon;
{
  const x0 = 7.6, z0 = 8.3;
  desk(scene, x0, z0, 1.7, 0.8);
  reprintMon = monitor(scene, x0 - 0.35, 1.28, z0 - 0.1, 0, 0.72, 0.44, (c, W, H, k = 0) => {
    c.fillStyle = '#f8fafc'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0B5ED7'; c.fillRect(0, 0, W, 34);
    c.fillStyle = '#fff'; c.font = 'bold 19px Arial'; c.fillText('REPRINT LOT CARD', 10, 24);
    c.font = '16px Arial';
    const rows = [['Scanned', k ? 'L2026-001 ✓' : '— scan —'], ['Part No.', k ? '12345-AB' : ''], ['Lot No.', k ? 'L2026-001' : ''], ['Qty', k ? '24' : '']];
    rows.forEach((r, i) => { c.fillStyle = '#334155'; c.fillText(r[0], 10, 64 + i * 28); c.fillStyle = r[1].includes('✓') ? '#16a34a' : '#0B2A5B'; c.textAlign = 'right'; c.fillText(r[1], W - 10, 64 + i * 28); c.textAlign = 'left'; });
    c.fillStyle = k ? '#0B5ED7' : '#94a3b8'; c.fillRect(10, H - 46, W - 20, 34);
    c.fillStyle = '#fff'; c.font = 'bold 18px Arial'; c.textAlign = 'center'; c.fillText(k > 1 ? 'REPRINTED ✓' : 'REPRINT', W / 2, H - 22); c.textAlign = 'left';
  });
  reprintPrinter = printer(scene, x0 + 0.5, 0.785, z0 - 0.05, 0);
  // tote with a lot card on the side of the desk
  tote(scene, x0 - 1.25, 0, z0 + 0.1, 0.6, 0.26, 0.42);
  { const lc = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.13), (() => { const cv = document.createElement('canvas'); cv.width = 200; cv.height = 130; drawLabel(cv.getContext('2d'), 200, 130, 'LOT CARD', ['L2026-001']); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshBasicMaterial({ map: t, toneMapped: false }); })());
    lc.position.set(x0 - 1.25, 0.2, z0 + 0.1 + 0.215); scene.add(lc); }
  const op = person(scene, x0 - 0.5, z0 + 0.9, Math.PI, 0x4a7fb0);
  handheld(op, -0.28, 1.05, 0.3, true);
  smallLabel('Reprint station · rugged handheld', x0, 2.05, z0, ['reprint']);
}

/* ---------------- 10 · OEE monitoring (Line 3, station 4) ---------------- */
let oeeBoard;
{
  const sbx = 17.76, z = 5;                                                       // signal box on the machine side
  box(0.12, 0.26, 0.22, mat(0xcbd5e1, { roughness: 0.5, metalness: 0.3 }), scene, sbx, 1.35, z + 0.4);
  box(0.005, 0.03, 0.03, glow(0x22c55e, 1.6), scene, sbx + 0.062, 1.42, z + 0.4);
  cable([[sbx, 1.5, z + 0.4], [sbx - 0.3, 2.3, z + 0.1], [16.75 + 0.75, 2.1, z - 0.8]], scene, 0.008);   // to the light tower
  // OEE dashboard on a stand
  const dg = group(scene, 21.4, 0, 3.6, 0.4);
  for (const sx of [-1.0, 1.0]) box(0.07, 2.2, 0.07, alu, dg, sx, 1.1, -0.05);
  box(2.3, 1.35, 0.06, dark, dg, 0, 2.55, -0.04);
  oeeBoard = screen(2.2, 1.25, (c, W, H, act = 412) => {
    c.fillStyle = '#0b1f33'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#0B5ED7'; c.fillRect(0, 0, W, 40);
    c.fillStyle = '#fff'; c.font = 'bold 24px Arial'; c.fillText('OEE · LINE 3 · ST4', 14, 28);
    c.textAlign = 'right'; c.font = '15px Arial'; c.fillStyle = '#cbd5e1'; c.fillText('Sample data', W - 14, 27); c.textAlign = 'left';
    // gauge
    const gx = 120, gy = 165, r = 78;
    c.lineWidth = 18; c.strokeStyle = '#1e3a5f'; c.beginPath(); c.arc(gx, gy, r, Math.PI, 0); c.stroke();
    c.strokeStyle = '#22c55e'; c.beginPath(); c.arc(gx, gy, r, Math.PI, Math.PI + Math.PI * 0.85); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 34px Arial'; c.textAlign = 'center'; c.fillText('85%', gx, gy - 8);
    c.font = '15px Arial'; c.fillStyle = '#94a3b8'; c.fillText('OEE', gx, gy + 16); c.textAlign = 'left';
    // bar chart (hourly)
    const bx = 240, by = 60, bh = 130;
    c.fillStyle = '#94a3b8'; c.font = '13px Arial'; c.fillText('Output / hour', bx, by + 10);
    [0.7, 0.85, 0.9, 0.6, 0.88, 0.92, 0.8].forEach((v, i) => { c.fillStyle = v < 0.7 ? '#f59e0b' : '#3b82f6'; c.fillRect(bx + i * 34, by + 20 + bh * (1 - v), 24, bh * v); });
    // tiles
    const tgt = 450, diff = act - tgt;
    [['RUN', '85%', '#16a34a'], ['STOP', '10%', '#f59e0b']].forEach((tl, i) => {
      const tx = 14 + i * 120, ty = H - 66;
      c.fillStyle = tl[2]; c.fillRect(tx, ty, 110, 54);
      c.fillStyle = '#fff'; c.font = 'bold 15px Arial'; c.fillText(tl[0], tx + 10, ty + 20); c.font = 'bold 22px Arial'; c.fillText(tl[1], tx + 10, ty + 45);
    });
    { const tx = 254, ty = H - 66, w = W - tx - 14;
      c.fillStyle = '#1e3a5f'; c.fillRect(tx, ty, w, 54);
      [['ACTUAL', String(act), '#fff'], ['TARGET', String(tgt), '#cbd5e1'], ['DIFF', (diff > 0 ? '+' : '') + diff, diff < 0 ? '#fbbf24' : '#4ade80']].forEach((v, i) => {
        const x = tx + 10 + i * (w / 3);
        c.fillStyle = '#94a3b8'; c.font = 'bold 13px Arial'; c.fillText(v[0], x, ty + 20);
        c.fillStyle = v[2]; c.font = 'bold 22px Arial'; c.fillText(v[1], x, ty + 45);
      }); }
  }, dg, 0, 2.55, 0.0, 0, 512);
  smallLabel('Signal box', sbx + 0.1, 1.75, z + 0.4, ['oee']);
}

/* ---------------- material flow (right side) ----------------
 * Tail (z≈+9):  operator pushes a trolley of stacked totes (4–5 high) in → X-lift raises the stack to belt level
 *               → lane switch shifts it to unit 1 / 2 / 3.
 * Units:        3 belt conveyors carry the stacks towards the head (−Z).
 * Head (z≈−9):  AMR + karakuri cart waits; totes are loaded shelf by shelf, then the AMR serves the Line 2 station. */
const UNIT_X = [30.6, 31.7, 32.8];
const UNIT_Z0 = 5.0, UNIT_Z1 = -8.6;            // tail → head (stacks travel towards −Z)
const SWITCH_Z = 6.0;                            // lane switch (shuttle) slides along X
const LIFT = new THREE.Vector3(31.7, 0, 7.5);    // X-lift inside the yellow safety cage
const TROLLEY_Z0 = 11.8, TROLLEY_Z1 = 8.75;      // operator pushes the trolley from z0 to z1
const PICK = new THREE.Vector3(31.7, 0, -9.4);   // AMR stops at the conveyor head (cart side faces the belts)
const DOCK = new THREE.Vector3(9.6, 0, -9);      // AMR docks at Line 2
const STACK_N = 4;
const unitStacks = [];
let laneSwitch, xlift, trolley, inStack;
/** Stack of N totes (simple meshes; top one keeps its label). */
function toteStack(parent, n = STACK_N) {
  const g = group(parent);
  for (let i = 0; i < n; i++) tote(g, 0, i * 0.265, 0, 0.6, 0.26, 0.42, i < n - 1);
  return g;
}
{
  UNIT_X.forEach((ux, i) => {
    conveyor(ux, (UNIT_Z0 + UNIT_Z1) / 2, UNIT_Z0 - UNIT_Z1, 0.82, 0, 0.8, 'belt');
    sign(`UNIT ${i + 1}`, 0.8, 0.3, '#0f4c81', '#fff', scene, ux, 0.5, UNIT_Z1 - 0.06, Math.PI, 'bold 90px system-ui');
    for (let k = 0; k < 3; k++) unitStacks.push({ obj: toteStack(scene), x: ux, off: (k / 3 + i * 0.11) % 1 });
  });
  // lane switch: short belt on a shuttle that slides across the 3 unit entries
  laneSwitch = group(scene, UNIT_X[1], 0, SWITCH_Z);
  box(3.6, 0.08, 0.12, steel, scene, UNIT_X[1], 0.3, SWITCH_Z - 0.45);
  box(3.6, 0.08, 0.12, steel, scene, UNIT_X[1], 0.3, SWITCH_Z + 0.45);
  box(0.86, 0.12, 1.0, mat(C.belt, { roughness: 0.7, metalness: 0 }), laneSwitch, 0, 0.8, 0);
  box(0.9, 0.5, 0.9, alu, laneSwitch, 0, 0.5, 0);
  box(0.92, 0.04, 0.04, mat(C.safety), laneSwitch, 0, 0.9, 0.5);
  // X-lift (scissor lift): low position receives the trolley stack, rises to belt level
  xlift = group(scene, LIFT.x, 0, LIFT.z);
  box(1.0, 0.12, 1.0, steel, xlift, 0, 0.06, 0);
  xlift.platform = group(xlift, 0, 0.2, 0);
  box(0.95, 0.08, 0.95, mat(C.belt, { roughness: 0.7, metalness: 0 }), xlift.platform, 0, 0, 0);
  xlift.arms = [];
  for (const sx of [-0.4, 0.4]) for (const dir of [1, -1]) {
    const a = box(0.05, 0.05, 1.0, mat(0x475569, { roughness: 0.4, metalness: 0.6 }), xlift, sx, 0.15, 0);
    a.userData.dir = dir; xlift.arms.push(a);
  }
  // yellow mesh safety cage: side panels only, open at the tail (trolley in) and towards the switch
  const cageMat = new THREE.MeshStandardMaterial({ color: C.safety, transparent: true, opacity: 0.35, roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide, depthWrite: false });
  const cage = group(scene, LIFT.x, 0, LIFT.z);
  for (const [px, pz] of [[-0.75, -0.65], [0.75, -0.65], [-0.75, 0.65], [0.75, 0.65]]) box(0.07, 2.4, 0.07, mat(C.safety, { roughness: 0.45, metalness: 0.2 }), cage, px, 1.2, pz);
  for (const sx of [-0.75, 0.75]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.2), cageMat); pn.position.set(sx, 1.25, 0); pn.rotation.y = Math.PI / 2; cage.add(pn); }
  for (const sz of [-0.65, 0.65]) box(1.55, 0.06, 0.06, mat(C.safety), cage, 0, 2.4, sz);
  // light curtain at the person entry + red floor tape (person access zone)
  box(0.05, 1.6, 0.05, glow(0xef4444, 0.6), scene, LIFT.x - 0.75, 0.8, LIFT.z + 0.75);
  box(0.05, 1.6, 0.05, glow(0xef4444, 0.6), scene, LIFT.x + 0.75, 0.8, LIFT.z + 0.75);
  const tape = mat(0xdc2626, { roughness: 0.5, metalness: 0 });
  plane(0.08, 5, tape, LIFT.x - 1.0, 0.014, LIFT.z + 2.2); plane(0.08, 5, tape, LIFT.x + 1.0, 0.014, LIFT.z + 2.2);
  // operator + push trolley (stack of totes rides on it until the X-lift takes it)
  trolley = group(scene, LIFT.x, 0, TROLLEY_Z0);
  box(0.75, 0.05, 0.6, alu, trolley, 0, 0.2, 0);
  for (const [wx, wz] of [[-0.3, -0.24], [0.3, -0.24], [-0.3, 0.24], [0.3, 0.24]]) cyl(0.06, 0.04, rubber, trolley, wx, 0.07, wz, 12).rotation.z = Math.PI / 2;
  for (const hx of [-0.3, 0.3]) cyl(0.018, 0.9, alu, trolley, hx, 0.65, 0.3, 8);
  { const h = cyl(0.018, 0.62, rubber, trolley, 0, 1.1, 0.3, 8); h.rotation.z = Math.PI / 2; }
  trolley.add(person(null, 0, 0.85, Math.PI, 0x3b6ea5));
  inStack = toteStack(scene);
  smallLabel('Trolley in · stacked totes', LIFT.x + 1.9, 1.8, TROLLEY_Z0 - 0.6, ['amr']);
  smallLabel('X-lift (raise to belt)', LIFT.x - 1.9, 2.6, LIFT.z, ['amr']);
  smallLabel('Lane switch', UNIT_X[2] + 1.7, 1.3, SWITCH_Z, ['amr']);
  smallLabel('Head · AMR + karakuri', PICK.x - 2.6, 2.6, PICK.z, ['amr']);
  // AMR docking: line-side green belt conveyor into the Line 2 process station
  conveyor(6.2, DOCK.z, 5.4, 1.3, Math.PI / 2, 0.8, 'belt');
  smallLabel('Line 2 process station', 4.5, 2.4, DOCK.z, ['amr']);
}
const dockTotes = [0, 1, 2, 3].map((k) => ({ obj: tote(scene), off: k / 4, z: k % 2 ? -9.3 : -8.7 }));

// AMR loop path (closed). Pick at the conveyor head (heading -X), dock at Line 2 (heading +Z).
const amrCurve = new THREE.CatmullRomCurve3([
  new THREE.Vector3(PICK.x, 0, PICK.z), new THREE.Vector3(28.6, 0, -9.5), new THREE.Vector3(26.4, 0, -11.6),
  new THREE.Vector3(25.4, 0, -16), new THREE.Vector3(24.4, 0, -20.5), new THREE.Vector3(21.5, 0, -23.6), new THREE.Vector3(13, 0, -23.8),
  new THREE.Vector3(9.8, 0, -21.5), new THREE.Vector3(9.6, 0, -15), new THREE.Vector3(DOCK.x, 0, DOCK.z),
  new THREE.Vector3(9.7, 0, -6.4), new THREE.Vector3(10.6, 0, -5.4), new THREE.Vector3(11.1, 0, -7.5),
  new THREE.Vector3(11.1, 0, -18.5), new THREE.Vector3(13.5, 0, -21.6), new THREE.Vector3(33.5, 0, -21.6),
  new THREE.Vector3(36.4, 0, -19.6), new THREE.Vector3(36.5, 0, -12.5), new THREE.Vector3(35.6, 0, -9.9), new THREE.Vector3(34.2, 0, -9.45),
], true, 'catmullrom', 0.35);
const AMR_LEN = amrCurve.getLength();
const nearestU = (p) => { let best = 0, bd = 1e9; const v = new THREE.Vector3(); for (let i = 0; i < 2000; i++) { amrCurve.getPointAt(i / 2000, v); const d = v.distanceToSquared(p); if (d < bd) { bd = d; best = i / 2000; } } return best; };
const PICK_U = nearestU(PICK), DOCK_U = nearestU(DOCK);
{ // dashed route on floor
  const pts = amrCurve.getSpacedPoints(300).map((p) => new THREE.Vector3(p.x, 0.03, p.z));
  const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineDashedMaterial({ color: 0x8b5cf6, dashSize: 0.5, gapSize: 0.35 }));
  route.computeLineDistances(); scene.add(route);
}

/** Latent (lift-type) AMR carrying a karakuri cart: aluminium pipe frame, tilted shelves, 2 × 5 blue totes. */
function amrWithCart() {
  const g = new THREE.Group();
  // AMR body: dark chassis, white top, red side accent, wheels, bumper LEDs
  box(0.78, 0.22, 1.1, mat(C.amrBody, { roughness: 0.5, metalness: 0.3 }), g, 0, 0.15, 0);
  box(0.74, 0.08, 1.04, mat(C.amrTop, { roughness: 0.35, metalness: 0.05 }), g, 0, 0.29, 0);
  box(0.79, 0.05, 0.5, mat(C.amrAccent, { roughness: 0.4, metalness: 0.1 }), g, 0, 0.19, -0.2);
  for (const s of [-1, 1]) {
    const w = cyl(0.09, 0.06, rubber, g, s * 0.4, 0.09, 0.1, 20); w.rotation.z = Math.PI / 2;
    const hub = cyl(0.05, 0.065, mat(0xd97706, { roughness: 0.4, metalness: 0.3 }), g, s * 0.4, 0.09, 0.1, 16); hub.rotation.z = Math.PI / 2;
  }
  g.led = box(0.5, 0.04, 0.02, glow(0xfde68a, 2), g, 0, 0.17, 0.56);
  box(0.12, 0.08, 0.04, rubber, g, 0, 0.22, 0.56); // lidar window
  // karakuri cart (sits on the AMR lift)
  const cart = group(g, 0, 0.34, 0);
  const W = 1.3, D = 1.0, H = 1.95; // cart footprint: X across, Z along travel
  for (const sx of [-W / 2, W / 2]) for (const sz of [-D / 2, D / 2]) cyl(0.022, H, alu, cart, sx, H / 2, sz, 10);
  for (const sz of [-D / 2, D / 2]) { const r = cyl(0.022, W, alu, cart, 0, H, sz, 10); r.rotation.z = Math.PI / 2; }
  for (const sx of [-W / 2, W / 2]) { const r = cyl(0.022, D, alu, cart, sx, H, 0, 10); r.rotation.x = Math.PI / 2; }
  // yellow/black bumpers + push handle like the site photo
  box(0.06, 0.25, 0.25, mat(C.safety), cart, W / 2 + 0.03, 0.12, D / 2 - 0.12);
  box(0.06, 0.25, 0.25, mat(C.safety), cart, -W / 2 - 0.03, 0.12, D / 2 - 0.12);
  { const hnd = cyl(0.018, 0.35, rubber, cart, W / 2 + 0.12, 0.35, -D / 2, 8); hnd.rotation.z = Math.PI / 2; }
  // 5 tilted shelves (karakuri: slope towards -X so totes roll out at the dock)
  g.totes = [];
  for (let lv = 0; lv < 5; lv++) {
    const shelf = group(cart, 0, 0.12 + lv * 0.36, 0);
    shelf.rotation.z = 0.07;
    for (const sz of [-D / 2, D / 2]) { const r = cyl(0.018, W, alu, shelf, 0, 0, sz, 8); r.rotation.z = Math.PI / 2; }
    for (const sz of [-0.22, 0.22]) box(W - 0.05, 0.02, 0.04, steel, shelf, 0, 0.0, sz); // roller tracks
    for (const col of [-0.24, 0.24]) g.totes.push(tote(shelf, 0, 0.02, col, 0.62, 0.26, 0.44));
  }
  // rotate each tote so its long side runs along X (columns along Z)
  g.totes.forEach((t) => { t.rotation.y = Math.PI / 2; });
  g.castShadow = true;
  scene.add(g);
  return g;
}
const amrs = [0, 1, 2].map((i) => {
  const u = (PICK_U + i / 3) % 1;
  const a = { obj: amrWithCart(), u, dwell: 0, mode: '' };
  // loaded if between pick and dock
  const rel = (u - PICK_U + 1) % 1, relDock = (DOCK_U - PICK_U + 1) % 1;
  a.loaded = rel > 0 && rel < relDock ? 10 : 0;
  return a;
});

/* ---------------- end of line: 3 SATO label printers + packing ---------------- */
const labelPrinters = [];
{
  const z = 15.2;
  LINES.forEach((lx, i) => {
    box(1.4, 0.9, 0.8, mat(C.stainless, { roughness: 0.3, metalness: 0.7 }), scene, lx + 2.4, 0.45, z);
    labelPrinters.push(printer(scene, lx + 2.4, 0.9, z, Math.PI));
    smallLabel('SATO CL4NX Plus', lx + 2.4, 1.55, z, ['label']);
    hmi(scene, lx + 3.4, 1.7, z - 0.1, Math.PI, 'LABEL PRINT', [['Format', 'Customer'], ['Part No.', 'PN-' + (i + 1)], ['Tag card', 'Printed'], ['Verify', 'OK']]);
    person(scene, lx + 2.6, z + 1.3, Math.PI, 0x3b6ea5);
  });
  // generic label sample board (no customer names)
  screen(6, 1.3, (c, W, H) => {
    c.fillStyle = '#1e293b'; c.fillRect(0, 0, W, H);
    ['FORMAT A', 'FORMAT B', 'FORMAT C'].forEach((n, i) => {
      const x = 12 + i * (W - 24) / 3, w = (W - 24) / 3 - 12;
      c.fillStyle = '#fff'; c.fillRect(x, 14, w, H - 28);
      c.fillStyle = '#111'; c.font = 'bold 30px system-ui'; c.fillText('CUSTOMER LABEL', x + 14, 54);
      c.font = '20px system-ui'; c.fillText(n + ' · tag card', x + 14, 84);
      for (let b = 0; b < 26; b++) c.fillRect(x + 14 + b * 6, 100, b % 3 ? 2 : 4, 28);
      c.fillRect(x + w - 70, 92, 50, 50); c.fillStyle = '#fff'; c.fillRect(x + w - 62, 100, 34, 34); c.fillStyle = '#111'; c.fillRect(x + w - 54, 108, 18, 18);
    });
  }, scene, 0, 3.3, 18.6, Math.PI, 768);
  { const p = group(scene, 0, 0, 18.6); box(0.1, 4, 0.1, alu, p, -3.1, 2, 0); box(0.1, 4, 0.1, alu, p, 3.1, 2, 0); }
  for (const [x, zz] of [[-20, 18.5], [-9, 18.5], [9, 18.5], [20, 18.5]]) {
    box(1.2, 0.15, 1.0, palletMat, scene, x, 0.075, zz);
    for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) box(0.55, 0.45, 0.45, cardMat, scene, x - 0.28 + a * 0.56, 0.38, zz - 0.23 + b * 0.46);
  }
  sign('PACKING', 3, 0.7, '#1e293b', '#fde68a', scene, -14.5, 3, 20.5, Math.PI);
}

/* ---------------- ROADMAP: RFID e-Kanban + ESL flow rack (left) ---------------- */
const planMark = scene.children.length;
const esls = [];
let kanbanBoard;
{
  const g = group(scene, -31, 0, 0, Math.PI / 2);
  for (let r = 0; r < 2; r++) {
    const rx = (r - 0.5) * 3.6;
    for (const sx of [-1.6, 1.6]) for (const sz of [-0.6, 0.6]) box(0.06, 1.9, 0.06, alu, g, rx + sx, 0.95, sz);
    for (let lv = 0; lv < 3; lv++) {
      const y = 0.45 + lv * 0.55;
      const shelf = box(3.2, 0.04, 1.2, alu, g, rx, y, 0); shelf.rotation.x = 0.08;
      for (let b = 0; b < 4; b++) {
        tote(g, rx - 1.2 + b * 0.8, y + 0.03, 0, 0.6, 0.24, 0.9, true);
        const tag = screen(0.3, 0.13, (c, W, H, low = false) => {   // 2.9" e-paper ESL (black / white / red)
          c.fillStyle = '#e9e9e4'; c.fillRect(0, 0, W, H);
          c.fillStyle = '#111'; c.font = 'bold 24px Arial'; c.fillText('P-' + (lv + 1) + (b + 1), 8, 26);
          c.font = '15px Arial'; c.fillText('Booster part · bin ' + (b + 1), 8, 46);
          for (let k = 0; k < 22; k++) c.fillRect(8 + k * 3, H - 16, k % 3 ? 1 : 2, 10);
          c.fillStyle = low ? '#c81e1e' : '#111'; c.font = 'bold 20px Arial'; c.textAlign = 'right';
          c.fillText(low ? 'REFILL' : 'QTY 24', W - 8, H - 8); c.textAlign = 'left';
        }, g, rx - 1.2 + b * 0.8, y - 0.05, 0.645, 0, 160);
        box(0.33, 0.16, 0.02, mat(0xf3f4f6, { roughness: 0.5, metalness: 0 }), g, rx - 1.2 + b * 0.8, y - 0.05, 0.625).castShadow = false;
        esls.push(tag);
      }
    }
    planBox(3.4, 2.1, 1.4, g, rx, 1.05, 0);
  }
  kanbanBoard = screen(2.6, 1.5, (c, W, H, n = 0) => {
    c.fillStyle = '#1c1206'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#f59e0b'; c.fillRect(0, 0, W, 40);
    c.fillStyle = '#1c1206'; c.font = 'bold 22px system-ui'; c.fillText('RFID e-KANBAN · ORDERS (PLANNED)', 12, 28);
    c.font = '19px system-ui';
    ['L1 ST1 card read → start order', 'L2 ST1 card read → start order', 'L3 ST2 → in progress', 'L1 ST4 → order complete'].forEach((t, i) => {
      c.fillStyle = i < 1 + (n % 3) ? '#fbbf24' : '#64748b'; c.fillText(t, 16, 76 + i * 32);
    });
  }, scene, -36.5, 2.7, 4.6, Math.PI / 2, 384);
  { const p = group(scene, -36.5, 0, 4.6); box(0.1, 3.4, 0.1, alu, p, 0, 1.7, -1.35); box(0.1, 3.4, 0.1, alu, p, 0, 1.7, 1.35); }
  // ESL access point (ceiling / wall base station that updates the tags)
  const ap = group(scene, -36.4, 3.2, -0.2);
  box(0.12, 0.3, 0.22, mat(0xf3f4f6, { roughness: 0.5, metalness: 0 }), ap, 0, 0, 0);
  box(0.01, 0.04, 0.04, glow(0x22c55e, 1.4), ap, 0.065, 0.1, 0);
  smallLabel('ESL access point', -36.2, 3.7, -0.2, ['esl']);
  smallLabel('ESL flow rack', -31, 2.6, 2.4, ['esl']);
}

/* ---------------- ROADMAP: RFID gate + FG warehouse ---------------- */
let rfidGate, rfidPallet;
{
  const gx = -8, gz = HALL.z1;
  rfidGate = group(scene, gx, 0, gz);
  for (const s of [-1, 1]) {
    const post = group(rfidGate, s * 1.9, 0, 0);
    box(0.5, 0.06, 0.5, steel, post, 0, 0.03, 0);                         // base plate
    box(0.1, 2.4, 0.1, mat(0x9aa1a9, { roughness: 0.35, metalness: 0.7 }), post, 0, 1.2, 0);
    for (const ay of [0.85, 1.75]) {                                      // upper + lower panel antennas, facing the lane
      box(0.06, 0.45, 0.45, rfidPanelMat, post, -s * 0.09, ay, 0);
      box(0.004, 0.03, 0.3, rfidMat, post, -s * 0.122, ay - 0.18, 0);     // planned strip
    }
    const sl = group(post, 0, 2.4, 0);                                    // stack light: green / red
    cyl(0.05, 0.1, glow(0x22c55e, 1.4), sl, 0, 0.1, 0, 16); cyl(0.05, 0.1, glow(0xef4444, 0.15), sl, 0, 0.21, 0, 16);
    if (s === 1) box(0.3, 0.4, 0.12, rfidReaderMat, post, 0.12, 1.3, -0.12); // fixed reader
  }
  // amber floor marking for the planned read zone
  plane(3.4, 0.1, rfidMat, gx, 0.015, gz - 1.2); plane(3.4, 0.1, rfidMat, gx, 0.015, gz + 1.2);
  rfidGate.waves = [0, 1, 2].map((i) => {
    const w = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.03, 8, 40, Math.PI), new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.6, depthWrite: false }));
    w.position.set(0, 0.2, 0); w.userData.phase = i / 3; rfidGate.add(w); return w;
  });
  const fg = group(scene, -8, 0, 30);
  planBox(24, 4.2, 12, fg, 0, 2.1, 0);
  for (let r = 0; r < 3; r++) for (let lv = 0; lv < 3; lv++) {
    box(7, 0.1, 1.2, mat(0xf97316), fg, -7 + r * 7, 0.2 + lv * 1.25, 3);
    for (let b = 0; b < 3; b++) box(1.1, 0.9, 1.0, cardMat, fg, -9.2 + r * 7 + b * 2.2, 0.72 + lv * 1.25, 3);
  }
  sign('FG WAREHOUSE (PLANNED)', 8, 1.1, '#f59e0b', '#1c1206', scene, -8, 4.9, 23.9, 0);
  rfidPallet = group(scene, gx, 0, 18);
  box(1.2, 0.15, 1.0, palletMat, rfidPallet, 0, 0.075, 0);
  for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) box(0.55, 0.45, 0.45, cardMat, rfidPallet, -0.28 + a * 0.56, 0.38, -0.23 + b * 0.46);
  box(0.2, 0.12, 0.02, 0xfbbf24, rfidPallet, 0, 0.35, 0.51).castShadow = false;
  rfidPallet.add(person(null, 0, -1.0, 0, 0x3b6ea5));
}

planObjs.push(...scene.children.slice(planMark));

/* ---------------- data flows (shown in "connected" + relevant scenes) ---------------- */
const flows = [];
function flow(points, color, tags) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.05);
  const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 0.035, 6, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  scene.add(line);
  const dots = [0, 1, 2].map(() => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color })); scene.add(d); return d; });
  flows.push({ curve, line, dots, tags, vis: 0 });
}
const R = [rackPos.x + 1, 6.2, rackPos.z];
LINES.forEach((lx) => {
  flow([[lx + 1.25, 1.6, LINE_Z0 + 0.6], [lx + 1.6, 6.0, LINE_Z0 - 1], [lx + 3.2, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0x0ea5e9, ['trace', 'connected']);
  flow([[lx - 2.4, 2.0, LINE_Z0 - 0.4], [lx - 2.4, 6.0, -22.5], [lx - 2.4, 6.3, -23.6], [R[0], 6.3, -23.6], [R[0] + 0.3, 2.2, R[2]]], 0x16a34a, ['trace', 'connected']);
  flow([[lx + 3.2, 6.2, 5.9], [lx + 3.2, 6.2, -23.5], [R[0], 6.25, -23.5], [R[0], 2.2, R[2] + 0.3]], 0x3b82f6, ['infra', 'connected']);
  flow([[lx + 2.4, 1.4, 15.2], [lx + 3.2, 6.2, 13], [lx + 3.2, 6.2, -23.4], [R[0], 6.2, -23.4], [R[0], 2.2, R[2] - 0.3]], 0xdb2777, ['label', 'connected']);
});
flow([[18.0, 2.0, -4.6], [18.2, 6.0, -4.6], [18.2, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0x65a30d, ['aep', 'connected']);
flow([[CK_A.x, 1.3, CK_A.z], [-11.8, 5.9, -10], [-11.8, 6.25, -23.4], [R[0], 6.25, -23.4], [R[0], 2.3, R[2] + 0.2]], 0x0d9488, ['checklist', 'connected']);
flow([[-13.75, 1.2, -2.25], [-11.8, 6.2, -2.25], [-11.8, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0xf59e0b, ['ekanban', 'connected']);
flow([[-36.4, 3.2, -0.2], [-36.4, 6.2, -10], [R[0], 6.2, -20], [R[0], 2.3, R[2]]], 0xf59e0b, ['esl', 'connected']);
flow([[-8, 3.8, 22], [-8, 6.2, 14], [-12, 6.2, -23.5], [R[0], 6.2, -23.5], [R[0], 2.2, R[2]]], 0xf59e0b, ['rfid', 'connected']);

flow([[-18.6, 1.4, 21.0], [-18.6, 6.2, 19.5], [-18.6, 6.2, -23.4], [R[0], 6.2, -23.4], [R[0], 2.2, R[2] - 0.2]], 0x7c3aed, ['shipping', 'connected']);
flow([[-18.3, 1.8, -12.6], [-18.3, 6.2, -13.5], [-18.3, 6.25, -23.5], [R[0], 6.25, -23.5], [R[0], 2.2, R[2] + 0.1]], 0x0891b2, ['frontlabel', 'connected']);
flow([[7.25, 1.4, 8.2], [7.25, 6.2, 8.2], [3.2, 6.2, 8.2], [3.2, 6.2, -23.45], [R[0], 6.2, -23.45], [R[0], 2.2, R[2]]], 0xea580c, ['reprint', 'connected']);
flow([[17.76, 1.5, 5.4], [18.2, 6.2, 5.4], [18.2, 6.2, -23.45], [R[0], 6.2, -23.45], [R[0], 2.25, R[2]]], 0x16a34a, ['oee', 'connected']);
flow([[17.76, 1.5, 5.4], [19.6, 3.0, 4.6], [21.4, 2.6, 3.6]], 0x16a34a, ['oee']);

/* ---------------- labels (numbered hotspots) ---------------- */
label('amr', '1', 'done', 31.7, 4.0, -9);
label('trace', '2', 'done', -15, 4.0, LINE_Z0 + 0.6);
label('infra', '3', 'done', rackPos.x + 1, 4.4, rackPos.z + 2);
label('aep', '4', 'done', 16.4, 3.0, -4.6);
label('label', '5', 'done', 0, 5.4, 18.6);
label('checklist', '6', 'done', -7.4, 2.6, -6.4);
label('shipping', '7', 'done', -18.6, 2.9, 20.7);
label('frontlabel', '8', 'done', -18.3, 2.9, -12.5);
label('reprint', '9', 'done', 7.6, 2.9, 8.3);
label('oee', '10', 'done', 20.2, 4.3, 3.1);
label('ekanban', '11', 'plan', -13.75, 2.6, -2.25);
label('esl', '12', 'plan', -31, 3.6, 0);
label('rfid', '13', 'plan', -8, 3.6, HALL.z1);
for (const [i, lx] of LINES.entries()) smallLabel(`Line ${i + 1}`, lx, 1.8, LINE_Z1 + 1.6, ['overview', 'label', 'connected']);

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
    li.tabIndex = 0; li.setAttribute('role', 'button');
    li.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.onclick(); } };
    if (i === current) li.setAttribute('aria-current', 'step');
    if (i === current) li.classList.add('active');
    $(s.kind === 'done' ? 'listDone' : s.kind === 'plan' ? 'listPlan' : 'listMisc').appendChild(li);
  });
  for (const [id, l] of Object.entries(labels)) l.el.querySelector('span').textContent = SCENES.find((x) => x.id === id)[lang].name;
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
  const cam = isMobile ? s.cam.map((v, k) => (k === 1 ? v * 1.2 : v + (v - s.tgt[k]) * 0.35)) : s.cam;
  gsap.to(camera.position, { x: cam[0], y: cam[1], z: cam[2], duration: reduceMotion ? 0.3 : 2.2, ease: 'power2.inOut' });
  gsap.to(controls.target, { x: s.tgt[0], y: s.tgt[1], z: s.tgt[2], duration: reduceMotion ? 0.3 : 2.2, ease: 'power2.inOut' });
  for (const [id, l] of Object.entries(labels)) {
    const on = s.focus.includes(id);
    l.el.classList.toggle('focus', on && s.focus.length === 1);
    l.el.classList.toggle('dim', !on);
    l.el.style.visibility = on || s.focus.length > 1 ? '' : 'hidden';
  }
  for (const sl of smallLabels) sl.o.visible = !sl.scenes || sl.scenes.includes(s.id);
  renderUI();
};
function stopTour() { if (tourTimer) { clearInterval(tourTimer); tourTimer = null; renderUI(); } }
$('btnTour').onclick = () => {
  if (tourTimer) return stopTour();
  tourTimer = setInterval(() => goTo((current + 1) % SCENES.length), 11000);
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
  const capH = h - $('caption').getBoundingClientRect().top;
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
const smooth = (x) => x * x * (3 - 2 * x);
const AMR_SPEED = 1.1, DWELL = 6;
function tick(vdt, vt, noRender) {
  const dt = vdt ?? Math.min(clock.getDelta(), 0.05);
  const t = vt ?? clock.elapsedTime;
  for (const r of movingTexes) r.offset.y -= dt * 0.8;
  // products on the lines
  for (const p of products) {
    p.off = (p.off + dt * p.speed) % 1;
    p.obj.position.set(p.x, 0.86, LINE_Z0 + 0.4 + p.off * (LINE_Z1 - LINE_Z0 - 0.8));
    p.obj.visible = p.off > 0.02 && p.off < 0.98;
  }
  // tote stacks on the 3 conveyor units (tail → head)
  for (const b of unitStacks) {
    b.off = (b.off + dt * 0.045) % 1;
    b.obj.position.set(b.x, 0.8, UNIT_Z0 - 0.4 - b.off * (UNIT_Z0 - UNIT_Z1 - 0.8));
    b.obj.visible = b.off > 0.03 && b.off < 0.97;
  }
  // tail cycle (7.2 s): trolley in → stack onto X-lift → lift to belt → lane switch → chosen unit
  const CY = 7.2, cp = (t % CY) / CY, lane = Math.floor(t / CY) % 3;
  const lowY = 0.2, beltY = 0.8;
  let liftY = lowY, swX = UNIT_X[1];
  if (cp < 0.35) {                                   // operator pushes the trolley in
    trolley.position.z = TROLLEY_Z0 - smooth(cp / 0.35) * (TROLLEY_Z0 - TROLLEY_Z1);
    inStack.position.set(LIFT.x, 0.23, trolley.position.z);
  } else if (cp < 0.45) {                            // stack slides onto the lowered X-lift
    trolley.position.z = TROLLEY_Z1;
    inStack.position.set(LIFT.x, lowY + 0.04, TROLLEY_Z1 - smooth((cp - 0.35) / 0.1) * (TROLLEY_Z1 - LIFT.z));
  } else if (cp < 0.65) {                            // X-lift raises the stack to belt level
    liftY = lowY + smooth((cp - 0.45) / 0.2) * (beltY - lowY);
    inStack.position.set(LIFT.x, liftY + 0.04, LIFT.z);
  } else if (cp < 0.78) {                            // onto the lane switch
    liftY = beltY;
    inStack.position.set(LIFT.x, beltY + 0.06, LIFT.z - smooth((cp - 0.65) / 0.13) * (LIFT.z - SWITCH_Z));
  } else {                                           // switch shifts to the chosen unit
    liftY = beltY - smooth((cp - 0.78) / 0.22) * (beltY - lowY);
    swX = UNIT_X[1] + smooth(Math.min(1, (cp - 0.78) / 0.12)) * (UNIT_X[lane] - UNIT_X[1]);
    inStack.position.set(swX, beltY + 0.06, SWITCH_Z - (cp > 0.9 ? smooth((cp - 0.9) / 0.1) * 0.9 : 0));
  }
  if (cp >= 0.35) trolley.position.z = cp < 0.5 ? TROLLEY_Z1 : TROLLEY_Z1 + smooth((cp - 0.5) / 0.5) * (TROLLEY_Z0 - TROLLEY_Z1);
  inStack.visible = cp < 0.985;
  laneSwitch.position.x = swX;
  xlift.platform.position.y = liftY;
  const ang = Math.asin(Math.min(0.98, (liftY - 0.06) / 1.0));
  for (const a of xlift.arms) { a.rotation.x = a.userData.dir * ang; a.position.y = 0.06 + (liftY - 0.06) / 2; }
  // AMRs on the loop, dwelling to load at the X-lift and unload at Line 2
  for (const a of amrs) {
    if (a.dwell > 0) {
      a.dwell -= dt;
      const k = Math.max(0, a.dwell / DWELL);
      a.loaded = a.mode === 'pick' ? Math.round(10 * (1 - k)) : Math.round(10 * k);
    } else {
      const prev = a.u;
      a.u = (a.u + dt * AMR_SPEED / AMR_LEN) % 1;
      const crossed = (target) => (prev <= target && a.u >= target) || (prev > a.u && (target >= prev || target <= a.u));
      if (crossed(PICK_U)) { a.u = PICK_U; a.dwell = DWELL; a.mode = 'pick'; }
      else if (crossed(DOCK_U)) { a.u = DOCK_U; a.dwell = DWELL; a.mode = 'dock'; }
    }
    amrCurve.getPointAt(a.u, tmp);
    amrCurve.getTangentAt(a.u, tmp2);
    a.obj.position.copy(tmp);
    a.obj.rotation.y = Math.atan2(tmp2.x, tmp2.z);
    a.obj.totes.forEach((tt, i) => { tt.visible = i < a.loaded; });
    a.obj.led.material.emissiveIntensity = a.dwell > 0 ? 0.6 + Math.sin(t * 8) * 0.5 : 2;
  }
  // totes leaving the karakuri cart onto the line-side conveyor at Line 2
  for (const d of dockTotes) {
    d.off = (d.off + dt * 0.09) % 1;
    d.obj.position.set(8.6 - d.off * 5.0, 0.8, d.z);
    d.obj.rotation.y = Math.PI / 2;
    d.obj.visible = d.off < 0.96;
  }
  // light towers: occasional amber blink
  towers.forEach((tw, i) => {
    const amber = Math.sin(t * 0.7 + i * 1.9) > 0.93;
    tw.lamps[0].material.emissiveIntensity = amber ? 0.1 : 1.6;
    tw.lamps[1].material.emissiveIntensity = amber ? (Math.sin(t * 10) > 0 ? 2 : 0.2) : 0.06;
  });
  // printers: label feed loop
  const feed = (pr, ph) => { const s = Math.min(1, Math.max(0.01, (ph - 0.1) / 0.5)); pr.label.scale.y = s; pr.led.material.emissiveIntensity = ph < 0.6 ? 2.5 : 0.6; };
  const pp = (t % 3) / 3;
  tracePrinters.forEach((p, i) => feed(p, (pp + i * 0.33) % 1));
  labelPrinters.forEach((p, i) => feed(p, (pp + 0.5 + i * 0.33) % 1));
  aepPrinters.forEach((p, i) => feed(p, ((t / 4) + i / 3) % 1));
  feed(shipPrinter, (t % 6) / 6);
  // front label: scan → master check → print (6 s)
  { const k = (t % 6) / 6, st = k < 0.25 ? 0 : k < 0.55 ? 1 : 2; if (st !== tick.lastFront) { tick.lastFront = st; frontHmi.screen.redraw(st); } feed(frontPrinter, st === 2 ? (k - 0.55) / 0.45 * 0.7 : 0.99); }
  // reprint: scan lot card → data → reprint (7 s)
  { const k = (t % 7) / 7, st = k < 0.3 ? 0 : k < 0.6 ? 1 : 2; if (st !== tick.lastRe) { tick.lastRe = st; reprintMon.screen.redraw(st); } feed(reprintPrinter, st === 2 ? (k - 0.6) / 0.4 * 0.7 : 0.99); }
  // shipping desk: step the selected Excel row
  { const r = Math.floor(t / 6) % 6; if (r !== tick.lastShip) { tick.lastShip = r; shipMon.screen.redraw(r); } }
  // OEE: actual count climbs towards the target (sample data)
  { const act = 400 + Math.floor((t / 2) % 60); if (act !== tick.lastOee) { tick.lastOee = act; oeeBoard.redraw(act); } }
  // Digital WI screens: step through the instruction (one screen redrawn per tick)
  const wk = Math.floor(t * 2);
  if (wk !== tick.lastWi) { tick.lastWi = wk; const w = wis[wk % wis.length]; w.screen.redraw(Math.floor(t / 3 + wk) % 4); }
  // wireless rings
  const sid = SCENES[current].id;
  for (const r of rings) {
    const ph = (t * 0.5 + r.userData.phase) % 1;
    r.scale.setScalar(0.3 + ph * 3.2);
    r.material.opacity = 0.45 * (1 - ph) * (sid === 'infra' || sid === 'connected' || sid === 'checklist' ? 1.6 : 0.4);
  }
  // Digital checklist: stand at A (start-up check) → walk → stand at B (5S / safety) → walk back (20 s loop)
  {
    const cp = (t % 20) / 20; let pos, face, set = 0, done = 0, walking = false;
    if (cp < 0.4) { pos = CK_A; face = -Math.PI / 2; set = 0; done = Math.min(5, Math.floor(cp / 0.4 * 6.5)); }
    else if (cp < 0.55) { walking = true; const k = smooth((cp - 0.4) / 0.15); pos = tmp.copy(CK_A).lerp(CK_B, k); face = Math.atan2(CK_B.x - CK_A.x, CK_B.z - CK_A.z); }
    else if (cp < 0.8) { pos = CK_B; face = Math.PI / 2; set = 1; done = Math.min(5, Math.floor((cp - 0.55) / 0.25 * 6.5)); }
    else { walking = true; const k = smooth((cp - 0.8) / 0.2); pos = tmp.copy(CK_B).lerp(CK_A, k); face = Math.atan2(CK_A.x - CK_B.x, CK_A.z - CK_B.z); }
    inspector.position.set(pos.x, walking ? Math.abs(Math.sin(t * 7)) * 0.03 : 0, pos.z);
    inspector.rotation.y = face;
    const key = set * 10 + done;
    if (key !== tick.lastCk) { tick.lastCk = key; tabletScreen.redraw(set, done); ckCallout.redraw(set, done); }
    const showCk = SCENES[current].id === 'checklist';
    ckCallout.visible = ckLeader.visible = showCk;
    if (showCk) {
      tablet.getWorldPosition(tmp2);
      ckCallout.position.set(tmp2.x + 0.25, 2.35, tmp2.z + 0.55);
      ckCallout.quaternion.copy(camera.quaternion);
      const lp = ckLeader.geometry.attributes.position;
      lp.setXYZ(0, tmp2.x, tmp2.y + 0.02, tmp2.z); lp.setXYZ(1, ckCallout.position.x, ckCallout.position.y - 0.36, ckCallout.position.z); lp.needsUpdate = true;
    }
  }
  // RFID e-Kanban: on each line a kanban card is tapped on the station antenna, station by station
  rfidCards.forEach((cd, li) => {
    const kt = t / 3 + li * 0.7, st = Math.floor(kt) % STATIONS.length, kp = kt % 1;
    const pad = rfidPads[li * STATIONS.length + st];
    const d = 0.05 + (kp < 0.35 ? (1 - smooth(kp / 0.35)) * 0.45 : kp > 0.7 ? smooth((kp - 0.7) / 0.3) * 0.45 : 0);
    cd.position.set(pad.position.x + pad.os * d, pad.position.y - 0.05 + d * 0.3, pad.position.z);
    const pulse = kp > 0.3 && kp < 0.75 ? (kp - 0.3) / 0.45 : 0;
    cd.ring.position.set(pad.position.x + pad.os * 0.03, pad.position.y, pad.position.z);
    cd.ring.scale.setScalar(0.4 + pulse * 2.2);
    cd.ring.material.opacity = pulse ? 0.9 * (1 - pulse) : 0;
  });
  if (Math.floor(t / 5) !== tick.lastEsl) {
    tick.lastEsl = Math.floor(t / 5);
    esls.forEach((e, i) => e.redraw(((i * 5 + tick.lastEsl) % 9) === 0));
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
  for (const fl of flows) {
    const want = fl.tags.includes(sid) && !(VIDEO === 'current' && fl.tags.some((x) => PLAN_IDS.includes(x))) ? 1 : 0;
    fl.vis += (want - fl.vis) * Math.min(1, dt * 3);
    const on = fl.vis > 0.02;
    fl.line.visible = on; fl.line.material.opacity = 0.5 * fl.vis;
    fl.dots.forEach((d, i) => { d.visible = on; if (on) { fl.curve.getPointAt((t * 0.18 + i / 3) % 1, tmp); d.position.copy(tmp); } });
  }
  if (noRender) return;
  if (!VIDEO) controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  if (!VIDEO) requestAnimationFrame(() => tick());
}

/* ---------------- video mode (?video=current | ?video=future [&lang=th]) ----------------
 * Deterministic, frame-by-frame: an external recorder calls __bb.videoFrame(seconds) for every frame,
 * so the result is smooth even when rendering is slow. No audio. */
const PLAN_IDS = SCENES.filter((x) => x.kind === 'plan').map((x) => x.id);
const DONE_IDS = SCENES.filter((x) => x.kind === 'done').map((x) => x.id);
const VCOPY = {
  en: {
    current: { kicker: 'PART 1', title: 'Delivered solutions', sub: 'Brake booster plant · running on the shop floor today', endTitle: 'Delivered · in operation', endSub: 'Next: Part 2 — Future plan', chip: 'PART 1 · DELIVERED' },
    future: { kicker: 'PART 2', title: 'Future plan', sub: 'Roadmap items under planning', endTitle: 'Thank you', endSub: 'Questions & discussion', chip: 'PART 2 · FUTURE PLAN' },
  },
  th: {
    current: { kicker: 'PART 1', title: 'โซลูชันที่ส่งมอบแล้ว', sub: 'โรงงานหม้อลมเบรก · ใช้งานจริงในไลน์ผลิตวันนี้', endTitle: 'ส่งมอบแล้ว · ใช้งานจริง', endSub: 'ต่อไป: Part 2 — แผนงานในอนาคต', chip: 'PART 1 · ส่งมอบแล้ว' },
    future: { kicker: 'PART 2', title: 'แผนงานในอนาคต', sub: 'รายการที่อยู่ระหว่างวางแผน', endTitle: 'ขอบคุณครับ', endSub: 'ถาม-ตอบ / พูดคุย', chip: 'PART 2 · แผนงาน' },
  },
};
const VPART = { current: ['overview', ...DONE_IDS], future: PLAN_IDS };
const VIDEO_FPS = 30;
let vSegs = [], vTotal = 0, vSeg = -1, vLastT = 0;
function sceneIndex(id) { return SCENES.findIndex((x) => x.id === id); }
const V3 = (a) => new THREE.Vector3(...a);
const DOCK_VIEW = new THREE.Vector3(7.6, 0.8, -9);
/** AMR + karakuri sub-shots (video Part 1). follow = camera tracks the delivering AMR. */
const AMR_SHOTS = [
  { dur: 7, cam: [36.6, 3.4, 12.6], tgt: [31.6, 0.9, 7.0],
    en: ['Tail: trolley in → X-lift → lane switch', ['Totes arrive stacked 4–5 high on a trolley', 'X-lift raises the stack to belt level', 'Lane switch sends it to unit 1 / 2 / 3']],
    th: ['ท้าย Conveyor: เข็นรถเข้า → X-Lift → Lane switch', ['กล่องซ้อน 4–5 ชั้นมาบนรถเข็น', 'X-Lift ยกกล่องขึ้นระดับสายพาน', 'Lane switch ส่งเข้า Unit 1 / 2 / 3']] },
  { dur: 6, cam: [25.6, 3.4, 1.0], tgt: [31.7, 0.9, -2.2],
    en: ['Three conveyor units carry the stacks to the head', ['3 belt conveyor units side by side', 'Stacks buffered on the way to the head']],
    th: ['Conveyor 3 Unit ลำเลียงกล่องไปหัว Conveyor', ['สายพาน 3 Unit วางคู่ขนาน', 'พักกล่องระหว่างทางไปหัว Conveyor']] },
  { dur: 7, cam: [27.2, 3.3, -14.6], tgt: [31.5, 0.8, -9.3],
    en: ['Head: the AMR loads totes onto the karakuri cart', ['AMR parks at the conveyor head', 'Totes loaded shelf by shelf onto the cart', '3 AMRs share one loop']],
    th: ['หัว Conveyor: AMR รับกล่องขึ้นรถ Karakuri', ['AMR จอดที่หัว Conveyor', 'รับกล่องเข้ารถทีละชั้น', 'AMR 3 ตัว วิ่งลูปเดียวกัน']] },
  { dur: 8, follow: true,
    en: ['AMR delivers to Line 2 — gravity unload', ['AMR docks at the Line 2 process station', 'Karakuri: totes roll off by gravity, no power', 'Line-side conveyor feeds the station']],
    th: ['AMR ส่งของที่ Line 2 — ปล่อยกล่องด้วยแรงโน้มถ่วง', ['AMR จอดที่สเตชัน Line 2', 'Karakuri: กล่องไหลลงเอง ไม่ใช้ไฟฟ้า', 'สายพานข้างไลน์ส่งเข้าสเตชัน']] },
];
function poseOf(id, k = 0, sg = null) { // k: 0..1 slow dolly-in during a hold
  if (sg && sg.shot != null) {
    const sh = AMR_SHOTS[sg.shot];
    if (sh.follow) {
      const a = amrs[1].obj.position;
      const g = new THREE.Vector3(a.x, 0.8, a.z).lerp(DOCK_VIEW, 0.45);
      return { cam: g.clone().add(new THREE.Vector3(4.6, 3.4, 4.2)), tgt: g };
    }
    const c = V3(sh.cam), g = V3(sh.tgt);
    return { cam: c.lerp(g, 0.08 * k), tgt: g };
  }
  const sc = SCENES[sceneIndex(id)];
  const c = new THREE.Vector3(...sc.cam), g = new THREE.Vector3(...sc.tgt);
  return { cam: c.lerp(g, 0.08 * k), tgt: g };
}
function buildVideo() {
  const ids = VPART[VIDEO];
  vSegs = [{ type: 'card', id: ids[0], dur: 5, end: false }];
  ids.forEach((id) => {
    if (id === 'amr' && VIDEO === 'current') AMR_SHOTS.forEach((sh, k) => vSegs.push({ type: 'scene', id, shot: k, dur: sh.dur }));
    else vSegs.push({ type: 'scene', id, dur: id === 'overview' ? 7 : 9.5 });
  });
  vSegs.push({ type: 'scene', id: 'connected', dur: 7 });
  vSegs.push({ type: 'card', id: 'connected', dur: 4, end: true });
  let t0 = 0;
  for (const sg of vSegs) { sg.t0 = t0; t0 += sg.dur; }
  vTotal = t0;
}
function cardHTML(sg) {
  const c = VCOPY[lang][VIDEO];
  const items = VPART[VIDEO].filter((id) => id !== 'overview').map((id) => SCENES[sceneIndex(id)]);
  const list = items.map((x) => `<li><b class="${x.kind}">${x.num}</b>${x[lang].name}</li>`).join('');
  return sg.end
    ? `<div class="vk">${c.kicker}</div><h1>${c.endTitle}</h1><p>${c.endSub}</p>`
    : `<div class="vk">${c.kicker}</div><h1>${c.title}</h1><p>${c.sub}</p><ol>${list}</ol>`;
}
function applyVideoSegment(i) {
  const sg = vSegs[i];
  current = sceneIndex(sg.id);
  const sc = SCENES[current];
  const focus = sc.id === 'connected' ? (VIDEO === 'current' ? DONE_IDS : PLAN_IDS) : sc.focus;
  for (const [id, l] of Object.entries(labels)) {
    const on = focus.includes(id) && !(VIDEO === 'current' && PLAN_IDS.includes(id));
    l.el.classList.toggle('focus', on && focus.length === 1);
    l.el.classList.remove('dim');
    l.el.style.visibility = on ? '' : 'hidden';
  }
  for (const sl of smallLabels) sl.o.visible = !sl.scenes || sl.scenes.includes(sc.id);
  for (const o of planObjs) o.visible = VIDEO !== 'current';
  renderUI();
  $('vchip').textContent = VCOPY[lang][VIDEO].chip;
  $('vcard').innerHTML = sg.type === 'card' ? cardHTML(sg) : '';
  if (sg.shot != null) {
    const [title, pts] = AMR_SHOTS[sg.shot][lang];
    $('capTitle').textContent = title;
    $('capPoints').innerHTML = pts.map((p) => `<li>${p}</li>`).join('');
  }
  if (sg.shot === 0) {
    // stage the AMRs so the shots show a full cycle: AMR 0 reaches the head for shot 3,
    // AMR 1 (loaded) docks at Line 2 early in shot 4
    const toHead = AMR_SHOTS[0].dur + AMR_SHOTS[1].dur + 1;
    const toDock = toHead + AMR_SHOTS[2].dur - 1 + 3;
    const set = (a, u, loaded) => { a.u = (u + 1) % 1; a.dwell = 0; a.mode = ''; a.loaded = loaded; };
    set(amrs[0], PICK_U - toHead * AMR_SPEED / AMR_LEN, 0);
    set(amrs[1], DOCK_U - toDock * AMR_SPEED / AMR_LEN, 10);
    set(amrs[2], DOCK_U + 0.2, 0);
  }
}
function videoFrame(T, noRender = false) {
  let i = vSegs.findIndex((sg) => T < sg.t0 + sg.dur);
  if (i < 0) i = vSegs.length - 1;
  if (i !== vSeg) { vSeg = i; applyVideoSegment(i); }
  const sg = vSegs[i], lt = T - sg.t0;
  // camera: ease from the previous segment's end pose, then a slow dolly-in
  const TR = 2.6;
  const endPose = (j) => poseOf(vSegs[j].id, 1, vSegs[j]);
  let pose;
  if (sg.type === 'card') {
    const k = lt / sg.dur, a = 0.12 * (k - 0.5);
    const p = poseOf(sg.id, 0, sg), off = p.cam.clone().sub(p.tgt);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    pose = { cam: p.tgt.clone().add(off), tgt: p.tgt };
  } else {
    const target = poseOf(sg.id, Math.max(0, (lt - TR) / (sg.dur - TR)), sg);
    if (i > 0 && lt < TR) {
      const from = vSegs[i - 1].type === 'card' ? (() => { const p = poseOf(vSegs[i - 1].id, 0), off = p.cam.clone().sub(p.tgt); off.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.06); return { cam: p.tgt.clone().add(off), tgt: p.tgt }; })() : endPose(i - 1);
      const e = smooth(lt / TR);
      pose = { cam: from.cam.clone().lerp(target.cam, e), tgt: from.tgt.clone().lerp(target.tgt, e) };
      // fly over, not through the floor: arc the camera up and back mid-transition
      const hop = Math.sin(Math.PI * e) * Math.min(from.tgt.distanceTo(target.tgt) * 0.55, 16);
      const back = pose.cam.clone().sub(pose.tgt).setY(0);
      if (back.lengthSq() > 1e-6) pose.cam.addScaledVector(back.normalize(), hop * 0.6);
      pose.cam.y += hop;
    } else pose = target;
  }
  camera.position.copy(pose.cam); controls.target.copy(pose.tgt); camera.lookAt(pose.tgt);
  // overlays: card fades in/out; caption + chip only on scene segments
  const fade = (x) => Math.max(0, Math.min(1, x));
  const cardA = sg.type === 'card' ? fade(Math.min(lt / 0.6, (sg.dur - lt) / 0.6)) : 0;
  $('vcard').style.opacity = cardA;
  labelRenderer.domElement.style.opacity = String(1 - cardA);
  const capA = sg.type === 'scene' ? fade(Math.min((lt - 0.8) / 0.6, (sg.dur - lt) / 0.4)) : 0;
  $('caption').style.opacity = capA;
  $('vchip').style.opacity = sg.type === 'scene' ? 1 : 0;
  const dt = Math.min(Math.max(T - vLastT, 0), 0.05);
  vLastT = T;
  tick(dt, T, noRender);
}

renderUI();
resize();
if (VIDEO) {
  document.body.classList.add('video');
  controls.enabled = false;
  const lp = new URLSearchParams(location.search).get('lang');
  if (lp === 'th') lang = 'th';
  buildVideo();
  resize();
  videoFrame(0);
} else {
  goTo(0);
  tick();
}
$('loading').classList.add('hide');
window.__bb = { scene, camera, controls, renderer, goTo, videoFrame, video: () => ({ total: vTotal, fps: VIDEO_FPS, segs: vSegs.map((sg) => [sg.type, sg.id, sg.t0, sg.dur]) }) };
