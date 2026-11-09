// Shared helpers: materials, primitives, canvas screens, RF waves, data flows, path movers.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

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
    // Realistic defaults: smooth shading, PBR values picked from the colour family (see pbrFor)
    matCache.set(k, new THREE.MeshStandardMaterial({ color, ...pbrFor(color), ...o }));
  }
  return matCache.get(k);
}
/** Rough PBR guess per colour so plain colour calls still look like real materials. */
function pbrFor(color) {
  const c = new THREE.Color(color);
  const hsl = {}; c.getHSL(hsl);
  if (hsl.h > 0.04 && hsl.h < 0.13 && hsl.s > 0.25 && hsl.l < 0.72) return { roughness: 0.92, metalness: 0 }; // cardboard / wood
  if (hsl.s < 0.12 && hsl.l > 0.45) return { roughness: 0.38, metalness: 0.55 };   // brushed steel / aluminium
  if (hsl.s < 0.12 && hsl.l < 0.12) return { roughness: 0.55, metalness: 0.25 };   // black powder-coat / rubber
  if (hsl.s < 0.15) return { roughness: 0.5, metalness: 0.35 };                     // grey painted metal
  return { roughness: 0.45, metalness: 0.15 };                                       // painted / plastic parts
}
export function basic(color, o = {}) {
  const k = 'b' + color + JSON.stringify(o);
  if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ color, ...o }));
  return matCache.get(k);
}
/** Unique (non-cached) emissive material for parts that animate (lights, LEDs). */
export function glowMat(color, intensity = 1) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.35 });
}

const geoCache = new Map();
function cachedGeo(key, make) {
  if (!geoCache.has(key)) geoCache.set(key, make());
  return geoCache.get(key);
}
export function box(w, h, d, color, o) {
  // Bevelled edges catch highlights and read as manufactured parts instead of flat blocks
  const r = Math.min(w, h, d) * 0.12;
  const g = cachedGeo(`b${w},${h},${d}`, () => (r > 0.012 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(r, 0.06)) : new THREE.BoxGeometry(w, h, d)));
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function cyl(rt, rb, h, seg, color, o) {
  const g = cachedGeo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, Math.max(seg, 16)));
  const m = new THREE.Mesh(g, color instanceof THREE.Material ? color : mat(color, o));
  m.castShadow = m.receiveShadow = true;
  return m;
}
export function sphere(r, color, seg = 10) {
  const g = cachedGeo(`s${r},${seg}`, () => new THREE.SphereGeometry(r, Math.max(seg, 16), 12));
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
/** Canvas resolution multiplier for in-scene screens (set by main.js before the factory is built). */
export const screenRes = { k: 1 };
export class Screen {
  /** w/h in world units, pw/ph canvas pixels, draw(ctx, W, H, state) */
  constructor(w, h, pw, ph, draw, state = {}) {
    this.canvas = document.createElement('canvas');
    this.k = screenRes.k; this.pw = pw; this.ph = ph;
    this.canvas.width = Math.round(pw * this.k); this.canvas.height = Math.round(ph * this.k);
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
    this.ctx.setTransform(this.k, 0, 0, this.k, 0, 0);   // draw code works in logical pixels
    this.draw(this.ctx, this.pw, this.ph, this.state);
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

/* ---------- procedural surface textures (no image files needed) ---------- */
const texCache = new Map();
/** Concrete / epoxy floor: base colour + fine noise + soft stains + optional slab joints. */
export function floorTexture(base = '#6b7280', { size = 512, joints = true, noise = 18, stains = 26 } = {}) {
  const key = base + joints + noise + stains;
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, size, size);
  const img = x.getImageData(0, 0, size, size), d = img.data;
  let seed = 1234;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * noise; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  for (let i = 0; i < stains; i++) {
    const r = 20 + rnd() * 90, px = rnd() * size, py = rnd() * size;
    const g = x.createRadialGradient(px, py, 0, px, py, r);
    const a = 0.04 + rnd() * 0.06, dark = rnd() < 0.6;
    g.addColorStop(0, dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(px - r, py - r, r * 2, r * 2);
  }
  if (joints) { x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 2; x.strokeRect(1, 1, size - 2, size - 2); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  texCache.set(key, t);
  return t;
}

/* ---------- photo textures (CC0 Poly Haven, assets/tex) ---------- */
// Dev mode loads assets/tex/<name>.jpg; the single-file build embeds them in window.__SF_TEX.
const texLoader = new THREE.TextureLoader();
export function photoTex(name, rx = 1, ry = 1, srgb = true) {
  const src = (window.__SF_TEX && window.__SF_TEX[name]) || `assets/tex/${name}.jpg`;
  const t = texLoader.load(src);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Asphalt / concrete material from a Poly Haven texture set, tiled every `tile` metres. */
export function photoMat(set, w, d, { tile = 6, color = 0xffffff, roughness = 0.95, normal = 0.6 } = {}) {
  return new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0,
    map: photoTex(set + '_diff', w / tile, d / tile),
    normalMap: photoTex(set + '_nor', w / tile, d / tile, false),
    normalScale: new THREE.Vector2(normal, normal),
  });
}
