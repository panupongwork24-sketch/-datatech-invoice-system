// Shared helpers: materials, primitives, canvas screens, RF waves, data flows, path movers.
import * as THREE from 'three';

export const gsap = window.gsap;
export const FLOOR = 0.34; // top of the factory floor tiles

// Zone footprints (x/z ranges in metres) and signature colours.
export const ZONES = {
  gate:       { color: 0xf5a623, x: [-62, -38], z: [41, 54] },
  dock:       { color: 0x38bdf8, x: [-62, -22], z: [10, 24] },
  warehouse:  { color: 0x3b82f6, x: [-62, -22], z: [-22, 8] },
  amr:        { color: 0xa855f7, x: [-20, -6],  z: [-22, 24] },
  production: { color: 0x22c55e, x: [-4, 62],   z: [-22, 24] },
  office:     { color: 0xec4899, x: [-62, 8],   z: [-44, -27] },
  infra:      { color: 0x14b8a6, x: [10, 62],   z: [-44, -27] },
};

export const hex = (c) => '#' + new THREE.Color(c).getHexString();

/* ---------- materials & geometry caches ---------- */
const matCache = new Map();
export function mat(color, o = {}) {
  const k = color + JSON.stringify(o);
  if (!matCache.has(k)) {
    matCache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.12, flatShading: true, ...o }));
  }
  return matCache.get(k);
}
export function basic(color, o = {}) {
  const k = 'b' + color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ color, ...o }));
  return matCache.get(k);
}
/** Unique (non-cached) emissive material for parts that animate (lights, LEDs). */
export function glowMat(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, flatShading: true });
}

const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
export function box(w, h, d, color, o) {
  const g = cachedGeo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function cyl(rt, rb, h, seg, color, o) {
  const g = cachedGeo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function sphere(r, color, seg = 10) {
  const g = cachedGeo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)));
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color));
  m.castShadow = true;
  return m;
}
/** Position an object and add it to a parent. Returns the object. */
export function at(obj, x, y, z, parent) {
  obj.position.set(x, y, z);
  if (parent) parent.add(obj);
  return obj;
}
export const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ---------- instanced batches (static clutter: rack parts, cartons, legs) ---------- */
export class Batcher {
  constructor() { this.groups = new Map(); }
  add(w, h, d, color, x, y, z, rotY = 0) {
    if (!this.groups.has(color)) this.groups.set(color, []);
    this.groups.get(color).push([w, h, d, x, y, z, rotY]);
  }
  build(parent) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (const [color, items] of this.groups) {
      const im = new THREE.InstancedMesh(geo, mat(color), items.length);
      items.forEach(([w, h, d, x, y, z, r], i) => {
        q.setFromEuler(e.set(0, r, 0));
        m4.compose(p.set(x, y, z), q, s.set(w, h, d));
        im.setMatrixAt(i, m4);
      });
      im.castShadow = im.receiveShadow = true;
      parent.add(im);
    }
    this.groups.clear();
  }
}

/* ---------- canvas-driven screens (ESL, dashboards, kiosks) ---------- */
export const screens = [];
export class Screen {
  /** w/h in world units, pw/ph canvas pixels, draw(ctx, W, H, state) */
  constructor(w, h, pw, ph, draw, state = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = pw; this.canvas.height = ph;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false, transparent: !!state.transparent }));
    this.mesh.userData.noOutline = true;
    this.draw = draw;
    this.state = state;
    this.dirty = true;
    screens.push(this);
  }
  set(patch) { Object.assign(this.state, patch); this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    this.dirty = false;
    this.draw(this.ctx, this.canvas.width, this.canvas.height, this.state);
    this.tex.needsUpdate = true;
  }
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export const FONT = '"Inter","Noto Sans Thai",system-ui,sans-serif';
export function txt(ctx, s, x, y, size, color = '#e2e8f0', weight = 600, align = 'left') {
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(s, x, y);
}

/* ---------- RF / signal waves (pooled rings) ---------- */
export class WavePool {
  constructor(parent, n = 40) {
    this.items = [];
    this.i = 0;
    const g = new THREE.RingGeometry(0.82, 1, 40);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide,
        depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
      }));
      m.visible = false;
      m.renderOrder = 5;
      parent.add(m);
      this.items.push(m);
    }
  }
  /** normal: 'y' (flat on floor), 'x' or 'z' (vertical ring facing that axis) */
  spawn(pos, color, { normal = 'y', size = 4, dur = 1.3, delay = 0 } = {}) {
    const m = this.items[this.i++ % this.items.length];
    gsap.killTweensOf(m.scale); gsap.killTweensOf(m.material);
    m.position.copy(pos);
    m.rotation.set(0, 0, 0);
    if (normal === 'y') m.rotation.x = -Math.PI / 2;
    else if (normal === 'x') m.rotation.y = Math.PI / 2;
    m.material.color.set(color);
    m.material.opacity = 0;
    m.scale.setScalar(0.05);
    m.visible = true;
    gsap.to(m.material, { opacity: 0.95, duration: 0.08, delay });
    gsap.to(m.scale, { x: size, y: size, z: size, duration: dur, delay, ease: 'power1.out' });
    gsap.to(m.material, { opacity: 0, duration: dur * 0.9, delay: delay + dur * 0.1, ease: 'power1.in', onComplete: () => { m.visible = false; } });
  }
}

/* ---------- data flows: glowing packets travelling along a curve ---------- */
export const flows = [];
const dotGeo = new THREE.SphereGeometry(1, 8, 6);
export class Flow {
  constructor(parent, curve, color, { count = 5, speed = 0.18, size = 0.28, tube = 0.05, lineOpacity = 0.28 } = {}) {
    this.curve = curve;
    this.speed = speed;
    this.group = new THREE.Group();
    parent.add(this.group);
    if (tube > 0) {
      const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, tube, 5, false),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: lineOpacity, depthWrite: false, toneMapped: false }));
      this.line = line;
      this.group.add(line);
    }
    this.dotMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.dots = [];
    for (let i = 0; i < count; i++) {
      const d = new THREE.Mesh(dotGeo, this.dotMat);
      d.scale.setScalar(size);
      d.userData.u = i / count;
      this.group.add(d);
      this.dots.push(d);
    }
    flows.push(this);
  }
  update(dt) {
    if (!this.group.visible) return;
    for (const d of this.dots) {
      d.userData.u = (d.userData.u + this.speed * dt) % 1;
      this.curve.getPointAt(d.userData.u, d.position);
    }
  }
}
/** One-shot packet along a curve (used for the event chain in the highlight scene). */
export function sendPacket(parent, curve, color, dur = 1.4, size = 0.55) {
  const m = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({ color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false }));
  m.scale.setScalar(size);
  parent.add(m);
  const trail = new THREE.Mesh(new THREE.TubeGeometry(curve, 60, 0.07, 5, false),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
  parent.add(trail);
  const o = { u: 0 };
  curve.getPointAt(0, m.position);
  return gsap.to(o, {
    u: 1, duration: dur, ease: 'power1.inOut',
    onUpdate: () => curve.getPointAt(o.u, m.position),
    onComplete: () => {
      parent.remove(m);
      gsap.to(trail.material, { opacity: 0, duration: 0.6, onComplete: () => { parent.remove(trail); trail.geometry.dispose(); } });
    },
  });
}
export function arc(a, b, h) {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += h;
  return new THREE.QuadraticBezierCurve3(a.clone(), mid, b.clone());
}

/* ---------- path following ---------- */
/** Replace each interior corner with two points so a centripetal Catmull-Rom makes tidy turns. */
export function rounded(pts, r = 1.6) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1];
    const da = a.clone().sub(p), db = b.clone().sub(p);
    const ra = Math.min(r, da.length() / 2), rb = Math.min(r, db.length() / 2);
    out.push(p.clone().add(da.setLength(ra)), p.clone().add(db.setLength(rb)));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function pathCurve(points, r = 1.6, closed = false) {
  const pts = points.map((p) => (p.isVector3 ? p : v3(p[0], p[1] ?? 0, p[2] ?? p[1])));
  return new THREE.CatmullRomCurve3(r > 0 ? rounded(pts, r) : pts, closed, 'centripetal');
}
const _t = new THREE.Vector3();
/** Place obj on curve at arc-length param u, facing along the tangent (models face +Z). */
export function placeOn(obj, curve, u, reverse = false) {
  u = Math.min(1, Math.max(0, u));
  curve.getPointAt(u, obj.position);
  curve.getTangentAt(u, _t);
  if (reverse) _t.negate();
  obj.rotation.y = Math.atan2(_t.x, _t.z);
}
