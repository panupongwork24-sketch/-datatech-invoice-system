// Every interactive device: geometry, working animation, and cross-system events.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/CSS2DRenderer.js';
import {
  ZONES, FLOOR, gsap, mat, basic, glowMat, box, cyl, sphere, at, v3, Batcher, Screen, rr, txt, hex,
  Flow, sendPacket, arc, pathCurve, placeOn,
} from './core.js';
import { person, car } from './world.js';
import { model, instanced, hasModel } from './models.js';
/** Real model if loaded, otherwise the primitive fallback. */
const M = (name, opts, fallback) => model(name, opts) || fallback();
// Forklift model (width 1.25 m, turned to face +Z): driver seat [y, z] and pallet centre z on its forks
const FK_SEAT = [0.55, -0.35];
const FK_PALLET_Z = 1.3;

/* =====================================================================
   Registry: maps meshes → device ids, builds outline hulls + labels.
   ===================================================================== */
const hullMats = {};
export class Registry {
  constructor() { this.items = new Map(); this.roots = []; }
  add(id, root, { zone, label = [0, 2.5, 0], primary = true } = {}) {
    let it = this.items.get(id);
    if (!it) { it = { id, zone, roots: [], hulls: [], label: null, labelRoot: null }; this.items.set(id, it); }
    root.userData.deviceId = id;
    it.roots.push(root);
    this.roots.push(root);
    const hm = hullMats[zone] || (hullMats[zone] = new THREE.MeshBasicMaterial({
      color: ZONES[zone].color, side: THREE.BackSide, toneMapped: false,
    }));
    const meshes = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.noOutline || o.userData.noPick) return;
      const t = o.geometry.type;
      if (t === 'PlaneGeometry' || t === 'RingGeometry' || t === 'TubeGeometry') return;
      if (o.material && o.material.visible === false) return;
      meshes.push(o);
    });
    const T = 0.05;
    for (const m of meshes) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const s = new THREE.Vector3();
      m.geometry.boundingBox.getSize(s);
      const h = new THREE.Mesh(m.geometry, hm);
      h.scale.set((s.x + 2 * T) / Math.max(s.x, 0.01), (s.y + 2 * T) / Math.max(s.y, 0.01), (s.z + 2 * T) / Math.max(s.z, 0.01));
      h.visible = false;
      h.raycast = () => {};
      h.userData.noOutline = true;
      m.add(h);
      it.hulls.push(h);
    }
    if (primary && !it.label) {
      const el = document.createElement('button');
      el.className = 'dev-label';
      el.style.setProperty('--zc', hex(ZONES[zone].color));
      el.dataset.id = id;
      el.textContent = id;
      const obj = new CSS2DObject(el);
      obj.position.set(...label);
      obj.visible = false;
      root.add(obj);
      it.label = obj;
      it.labelRoot = root;
    }
    return root;
  }
  highlight(id, on) {
    const it = this.items.get(id);
    if (!it) return;
    for (const h of it.hulls) h.visible = on;
    it.hovered = on;
  }
}
/** Invisible but raycastable box: makes tiny devices easy to point at / tap. */
export function pickProxy(w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({ visible: false }));
  m.userData.noOutline = true;
  return m;
}
export function visibleChain(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

/* =====================================================================
   Shared drawing helpers for screens
   ===================================================================== */
function panelBg(c, W, H, accent, alpha = 1) {
  c.clearRect(0, 0, W, H);
  c.globalAlpha = alpha;
  c.fillStyle = '#0b1324';
  rr(c, 2, 2, W - 4, H - 4, 14); c.fill();
  c.globalAlpha = 1;
  c.strokeStyle = accent; c.lineWidth = 4;
  rr(c, 2, 2, W - 4, H - 4, 14); c.stroke();
}
function eslDraw(c, W, H, s) {
  c.fillStyle = '#eef2ea'; c.fillRect(0, 0, W, H);
  c.fillStyle = s.low ? '#dc2626' : '#16a34a'; c.fillRect(0, 0, W, 18);
  txt(c, s.low ? 'LOW STOCK' : 'IN STOCK', 8, 9, 13, '#fff', 800);
  txt(c, s.sku, 8, 38, 19, '#0f172a', 800);
  txt(c, 'QTY', 8, H - 22, 15, '#475569', 700);
  txt(c, String(Math.round(s.qty)), W - 10, H - 30, 46, s.low ? '#dc2626' : '#0f172a', 800, 'right');
}
const nf = (n) => Math.round(n).toLocaleString('en-US');

/* =====================================================================
   Build everything
   ===================================================================== */
export function buildDevices(ctx) {
  const { root, waves, reg } = ctx;
  const up = ctx.updaters;
  const S = ctx.state = {
    pallets: 17, ok: 1204, ng: 37, fg: 36, labels: 1204, shots: 12345, cartons: 0,
    line: { qty: 12, low: false }, alert: false, chainPTL: false, mesFlash: 0,
  };
  const C = Object.fromEntries(Object.entries(ZONES).map(([k, z]) => [k, z.color]));
  const refs = ctx.refs = {};

  /* ------------------------------ ① GATE ------------------------------ */
  {
    const Z = 'gate';
    const booth = at(new THREE.Group(), -43.5, FLOOR, 46.5, root);
    at(box(2.6, 2.6, 2.6, 0xe2e8f0), 0, 1.3, 0, booth);
    at(box(3.0, 0.22, 3.0, C.gate), 0, 2.71, 0, booth);
    at(box(2.64, 0.9, 1.8, 0x0f172a), 0, 1.75, 0, booth);
    const guard = at(person(0x1e3a8a), 0, 0, 0.2, booth);
    guard.scale.setScalar(0.95);

    // Boom barrier
    const bar = at(new THREE.Group(), -46.6, FLOOR, 43, root);
    // Barrier housing: Sketchfab model (arm removed; our striped arm below animates), else a box
    at(M('boom_barrier_housing', { height: 1.2 }, () => at(box(0.6, 1.15, 0.6, C.gate), 0, 0.575, 0)), 0, 0, 0, bar);
    const lamp = glowMat(0xef4444, 1.4);
    at(box(0.3, 0.22, 0.3, lamp), 0, 1.27, 0, bar);
    const arm = at(new THREE.Group(), 0, 1.0, 0, bar);
    for (let i = 0; i < 8; i++) at(box(0.62, 0.14, 0.14, i % 2 ? 0xffffff : 0xef4444), -0.45 - i * 0.62, 0, 0, arm);
    const lpr = at(new THREE.Group(), 0.0, 0, 3.0, bar); // plate-reading camera post
    at(cyl(0.06, 0.06, 1.6, 6, 0x475569), 0, 0.8, 0, lpr);
    at(M('security_camera_02', { depth: 0.5 }, () => box(0.25, 0.2, 0.45, 0x0f172a)), -0.1, 1.55, 0.1, lpr);
    reg.add('boom-barrier', bar, { zone: Z, label: [-2.4, 2.4, 0] });

    // Visitor kiosk
    const k = at(new THREE.Group(), -44.4, FLOOR, 50.4, root);
    const STEEL = 0xd1d5db, DARK = 0x111827;
    at(box(0.8, 0.04, 0.6, 0x6b7280), 0, 0.02, 0, k);                               // floor plate
    at(box(0.56, 1.05, 0.42, STEEL), 0, 0.565, -0.02, k);                           // brushed-steel pedestal
    at(box(0.5, 0.36, 0.02, C.gate, { roughness: 0.4, metalness: 0.1 }), 0, 0.3, 0.2, k); // accent panel
    // Desk with ID / QR scanner window and the badge printer slot
    const desk = at(new THREE.Group(), 0, 1.0, 0.08, k);
    desk.rotation.x = -0.18;
    at(box(0.66, 0.08, 0.46, STEEL), 0, 0, 0, desk);
    at(box(0.22, 0.012, 0.16, basic(0x0ea5e9, { toneMapped: false, transparent: true, opacity: 0.85 })), -0.14, 0.045, 0.05, desk); // scanner glass
    at(box(0.2, 0.01, 0.12, DARK), 0.16, 0.045, 0.05, desk);                         // card reader pad
    at(box(0.46, 0.03, 0.03, DARK), 0, -0.07, 0.24, k);                              // badge slot
    const head = at(new THREE.Group(), 0, 1.5, 0.02, k);
    head.rotation.x = -0.3;
    at(box(0.12, 0.5, 0.1, STEEL), 0, -0.3, -0.06, head);                            // neck
    at(box(1.02, 0.8, 0.08, DARK), 0, 0, 0, head);                                   // bezel
    at(box(1.04, 0.82, 0.04, STEEL), 0, 0, -0.05, head);                             // back shell
    at(cyl(0.025, 0.025, 0.02, 10, DARK), 0, 0.37, 0.045, head).rotation.x = Math.PI / 2; // camera
    at(cyl(0.012, 0.012, 0.022, 8, basic(0x22c55e, { toneMapped: false })), 0.06, 0.37, 0.045, head).rotation.x = Math.PI / 2;
    const KSTEPS = [['WELCOME', 'Tap to check in'], ['SCAN ID', 'Hold ID card to reader'], ['PHOTO', 'Look at the camera'], ['PRINTING', 'Your badge is printing'], ['DONE ✓', 'Host has been notified']];
    const ks = new Screen(0.88, 0.64, 256, 186, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.gate));
      const [a, b] = KSTEPS[s.step];
      txt(c, 'VISITOR CHECK-IN', 16, 24, 15, '#94a3b8', 700);
      txt(c, a, W / 2, 80, 34, s.step === 4 ? '#4ade80' : '#fbbf24', 800, 'center');
      txt(c, b, W / 2, 118, 16, '#e2e8f0', 500, 'center');
      for (let i = 0; i < 5; i++) { c.fillStyle = i <= s.step ? hex(C.gate) : '#334155'; c.fillRect(40 + i * 38, 150, 30, 8); }
    }, { step: 0 });
    at(ks.mesh, 0, 0, 0.045, head);
    reg.add('visitor-kiosk', k, { zone: Z, label: [0, 2.4, 0] });

    // Visitor badge (card slides out + floating badge hologram)
    const badgeG = at(new THREE.Group(), -44.4, FLOOR, 50.4, root);
    const badgeMat = glowMat(C.gate, 0.2);
    const card = at(box(0.42, 0.03, 0.3, badgeMat), 0, 0.95, 0.15, badgeG);
    const holo = new Screen(1.3, 0.8, 260, 160, (c, W, H, s) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(15,23,42,.92)'; rr(c, 4, 4, W - 8, H - 8, 14); c.fill();
      c.fillStyle = hex(C.gate); rr(c, 4, 4, W - 8, 34, 14); c.fill();
      txt(c, 'VISITOR PASS', 16, 22, 17, '#111827', 800);
      c.fillStyle = '#334155'; c.fillRect(16, 50, 56, 64);
      txt(c, 'Guest  #V-0281', 84, 62, 16, '#f8fafc', 700);
      txt(c, 'Host: QA Dept.', 84, 86, 14, '#cbd5e1', 500);
      txt(c, 'Zone: Office', 84, 108, 14, '#cbd5e1', 500);
      for (let i = 0; i < 14; i++) { c.fillStyle = (i * 7) % 3 ? '#e2e8f0' : '#0f172a'; c.fillRect(16 + i * 8, 126, 6, 18); }
    }, { transparent: true });
    holo.mesh.material.opacity = 0;
    at(holo.mesh, 0, 2.9, 0.2, badgeG);
    at(pickProxy(0.7, 0.4, 0.7), 0, 1.0, 0.3, badgeG);
    reg.add('visitor-badge', badgeG, { zone: Z, label: [0.9, 3.6, 0] });

    const visitor = at(person(0xf8fafc, { helmet: false }), -41, FLOOR, 54, root);
    const vCurve = pathCurve([[-41, FLOOR, 54.5], [-44.4, FLOOR, 51.5]], 0);
    const vOut = pathCurve([[-44.4, FLOOR, 51.5], [-42.2, FLOOR, 49], [-42.2, FLOOR, 44.5]], 1.2);
    const vo = { u: 0 };
    const tl = gsap.timeline({ repeat: -1 });
    tl.set(visitor, { visible: true })
      .call(() => ks.set({ step: 0 }))
      .fromTo(vo, { u: 0 }, { u: 1, duration: 2.2, ease: 'none', onUpdate: () => placeOn(visitor, vCurve, vo.u) })
      .call(() => { ks.set({ step: 1 }); waves.spawn(v3(-44.4, FLOOR + 1.5, 50.8), C.gate, { normal: 'z', size: 1.4, dur: 0.9 }); })
      .to({}, { duration: 1.5 })
      .call(() => ks.set({ step: 2 }))
      .to({}, { duration: 1.3 })
      .call(() => ks.set({ step: 3 }))
      .to(card.position, { z: 0.5, duration: 0.8, ease: 'power2.out' })
      .to(badgeMat, { emissiveIntensity: 1.6, duration: 0.3 }, '<')
      .to(holo.mesh.material, { opacity: 1, duration: 0.4 }, '<')
      .fromTo(holo.mesh.position, { y: 2.3 }, { y: 2.9, duration: 0.8, ease: 'power2.out' }, '<')
      .call(() => ks.set({ step: 4 }))
      .to({}, { duration: 1.8 })
      .to(card.position, { z: 0.15, duration: 0.4 })
      .to(badgeMat, { emissiveIntensity: 0.2, duration: 0.3 }, '<')
      .to(holo.mesh.material, { opacity: 0, duration: 0.6 }, '<+0.6')
      .add(() => { vo.u = 0; })
      .to(vo, { u: 1, duration: 3, ease: 'none', onUpdate: () => placeOn(visitor, vOut, vo.u) }, '<')
      .set(visitor, { visible: false })
      .to({}, { duration: 1 });

    // Car arriving at the barrier
    const gcar = car(0x16a34a);
    root.add(gcar);
    const cCurve = pathCurve([[-48.3, FLOOR - 0.04, 57], [-48.3, FLOOR - 0.04, 38.5], [66, FLOOR - 0.04, 38.5]], 3);
    const L = cCurve.getLength();
    const uStop = (57 - 45.8) / L, uClear = (57 - 40.5) / L;
    const co = { u: 0 };
    const place = () => placeOn(gcar, cCurve, co.u);
    gsap.timeline({ repeat: -1, delay: 2 })
      .set(gcar, { visible: true }).set(co, { u: 0 }).call(place)
      .to(co, { u: uStop, duration: 2.4, ease: 'power2.out', onUpdate: place })
      .call(() => { waves.spawn(v3(-46.7, FLOOR + 1.6, 45.6), C.gate, { normal: 'z', size: 2, dur: 0.8 }); waves.spawn(v3(-46.7, FLOOR + 1.6, 45.6), C.gate, { normal: 'z', size: 2, dur: 0.8, delay: 0.25 }); })
      .to(arm.rotation, { z: -Math.PI / 2 * 0.94, duration: 0.9, ease: 'power2.inOut', delay: 0.5 })
      .call(() => { lamp.color.set(0x22c55e); lamp.emissive.set(0x22c55e); })
      .to(co, { u: uClear, duration: 1.6, ease: 'power1.in', onUpdate: place })
      .to(co, { u: 1, duration: 8, ease: 'none', onUpdate: place })
      .to(arm.rotation, { z: 0, duration: 1, ease: 'power2.inOut' }, '<+0.4')
      .call(() => { lamp.color.set(0xef4444); lamp.emissive.set(0xef4444); }, null, '<+1')
      .set(gcar, { visible: false })
      .to({}, { duration: 2 });
  }

  /* ------------------------------ ② DOCK ------------------------------ */
  {
    const Z = 'dock';
    // RFID portal
    const portal = at(new THREE.Group(), -40, FLOOR, 9, root);
    const antMat = glowMat(C.dock, 0.25);           // LED strip on each antenna (flashes on read)
    const ants = [];
    const POST = 0x9ca3af, ABS = { roughness: 0.55, metalness: 0 };
    for (const s of [-1, 1]) {
      const x = s * 2.55;
      // Square steel post on a bolted base plate
      at(box(0.5, 0.03, 0.5, 0x6b7280), x, 0.015, 0, portal);
      for (const [bx, bz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) at(cyl(0.025, 0.025, 0.04, 6, 0x374151), x + bx, 0.05, bz, portal);
      at(box(0.16, 3.5, 0.16, POST), x, 1.75, 0, portal);
      // Yellow/black impact bollard on the outside of each post (forklift protection)
      const bol = at(new THREE.Group(), x + s * 0.32, 0, 0.55, portal);
      at(cyl(0.09, 0.09, 1.1, 14, 0xfacc15), 0, 0.55, 0, bol);
      for (const y of [0.35, 0.75]) at(cyl(0.092, 0.092, 0.12, 14, 0x111827), 0, y, 0, bol);
      // Two flat-panel UHF antennas per side, facing the lane
      for (const y of [1.05, 2.15]) {
        const a = at(new THREE.Group(), x - s * 0.17, y, 0, portal);
        at(box(0.06, 0.34, 0.08, 0x4b5563), s * 0.06, 0, 0, a);                  // bracket
        at(box(0.07, 0.62, 0.62, 0xf1f5f9, ABS), 0, 0, 0, a);                    // radome
        at(box(0.075, 0.045, 0.4, 0x94a3b8, ABS), 0, -0.24, 0, a);               // logo-free label plate
        ants.push(at(box(0.02, 0.5, 0.03, antMat), -s * 0.04, 0, 0.27, a));     // LED strip
      }
      // Cable running down the post
      at(cyl(0.015, 0.015, 3.3, 6, 0x111827), x + s * 0.1, 1.7, -0.1, portal);
    }
    // Top beam with two down-facing antennas and a status light bar
    at(box(5.3, 0.18, 0.18, POST), 0, 3.5, 0, portal);
    for (const x of [-1.1, 1.1]) {
      at(box(0.62, 0.07, 0.62, 0xf1f5f9, ABS), x, 3.35, 0, portal);
      at(box(0.4, 0.02, 0.03, antMat), x, 3.31, 0.27, portal);
    }
    at(box(1.4, 0.1, 0.12, antMat), 0, 3.66, 0.02, portal);
    // RFID reader enclosure with cable glands on the left post
    const rd = at(new THREE.Group(), -2.55 + 0.02, 1.55, 0.2, portal);
    at(box(0.42, 0.5, 0.16, 0xd1d5db, ABS), 0, 0, 0, rd);
    at(box(0.3, 0.06, 0.02, 0x111827), 0, 0.12, 0.085, rd);
    for (const [lx, c] of [[-0.1, 0x22c55e], [0, 0x38bdf8], [0.1, 0xf59e0b]]) at(cyl(0.018, 0.018, 0.02, 8, basic(c, { toneMapped: false })), lx, -0.05, 0.085, rd).rotation.x = Math.PI / 2;
    for (const gx of [-0.12, 0, 0.12]) at(cyl(0.025, 0.025, 0.05, 8, 0x111827), gx, -0.27, 0, rd);
    reg.add('rfid-dock-portal', portal, { zone: Z, label: [0, 4.6, 0] });

    // Forklift with RFID-tagged pallet
    const fk = new THREE.Group();
    root.add(fk);
    // Sketchfab forklift (CC-BY): its forks point -Z, so turn it to face +Z like the rest of this rig.
    // Its forks are part of the body mesh, so with the model the pallet sits on them and is not lifted.
    const fkModel = model('forklift_truck', { width: 1.25 });
    const LIFT = fkModel ? 0 : 0.35;
    if (fkModel) {
      fkModel.rotation.y = Math.PI;
      fk.add(fkModel);
    } else {
      at(box(1.2, 0.75, 1.6, 0xf59e0b), 0, 0.6, -0.1, fk);
      at(box(1.22, 0.7, 0.5, 0x1f2937), 0, 0.65, -0.95, fk);
      for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.45], [0.5, 0.45]]) at(box(0.06, 1.25, 0.06, 0x111827), x, 1.6, z, fk);
      at(box(1.12, 0.06, 1.05, 0x111827), 0, 2.24, 0, fk);
      for (const x of [-0.4, 0.4]) at(box(0.09, 2.3, 0.12, 0x374151), x, 1.3, 0.78, fk);
      for (const [x, z] of [[-0.62, 0.45], [0.62, 0.45], [-0.62, -0.75], [0.62, -0.75]]) {
        const w = cyl(0.25, 0.25, 0.2, 8, 0x0b0f19); w.rotation.z = Math.PI / 2; at(w, x, 0.25, z, fk);
      }
    }
    const drv = at(person(0x0ea5e9, { seated: true }), 0, fkModel ? FK_SEAT[0] : 0.45, fkModel ? FK_SEAT[1] : -0.2, fk);
    drv.scale.setScalar(0.9);
    const carriage = at(new THREE.Group(), 0, fkModel ? 0 : 0.15, 0, fk);
    if (!fkModel) {
      at(box(1.0, 0.5, 0.06, 0x111827), 0, 0.3, 0.88, carriage);
      for (const x of [-0.3, 0.3]) at(box(0.12, 0.05, 1.15, 0x111827), x, 0.06, 1.45, carriage);
    }
    const pallet = at(new THREE.Group(), 0, 0, fkModel ? FK_PALLET_Z : 1.45, carriage);
    at(box(1.2, 0.14, 1.2, 0x92400e), 0, 0.15, 0, pallet);
    at(M('cardboard_box_01', { fit: [1.1, 0.9, 1.1] }, () => box(1.1, 0.9, 1.1, 0xc8a26b)), 0, hasModel('cardboard_box_01') ? 0.23 : 0.68, 0, pallet);
    at(box(1.12, 0.1, 1.12, 0xa16207), 0, 0.9, 0, pallet);
    const tagG = at(new THREE.Group(), 0.25, 0.55, 0.57, pallet);
    const tagMat = glowMat(0xef4444, 0.9);
    at(box(0.32, 0.2, 0.03, tagMat), 0, 0, 0, tagG);
    at(pickProxy(0.9, 0.9, 0.4), 0, 0, 0, tagG);
    reg.add('pallet-rfid-tag', tagG, { zone: Z, label: [0, 1.6, 0] });
    carriage.userData.y0 = carriage.position.y;
    refs.forklift = fk;

    // Dock status: stack light + board
    const st = at(new THREE.Group(), -44.2, FLOOR, 10.6, root);
    at(cyl(0.07, 0.07, 2.4, 6, 0x475569), 0, 1.2, 0, st);
    const Ls = { red: glowMat(0xef4444, 0.1), amber: glowMat(0xf59e0b, 0.1), green: glowMat(0x22c55e, 1.4) };
    at(cyl(0.18, 0.18, 0.28, 10, Ls.green), 0, 2.55, 0, st);
    at(cyl(0.18, 0.18, 0.28, 10, Ls.amber), 0, 2.84, 0, st);
    at(cyl(0.18, 0.18, 0.28, 10, Ls.red), 0, 3.13, 0, st);
    const brd = new Screen(3.2, 1.6, 320, 160, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.dock));
      txt(c, 'DOCK 01 · INBOUND', 14, 24, 17, '#7dd3fc', 800);
      txt(c, 'ASN #4471  ·  Supplier A', 14, 52, 14, '#94a3b8', 600);
      txt(c, `${s.pallets}/24`, 14, 98, 44, '#f8fafc', 800);
      txt(c, 'pallets received', 132, 104, 14, '#94a3b8', 600);
      const col = s.mode === 'read' ? '#22c55e' : s.mode === 'approach' ? '#f59e0b' : '#334155';
      c.fillStyle = col; rr(c, 14, 124, W - 28, 26, 8); c.fill();
      txt(c, s.mode === 'read' ? 'TAGS READ ✓  STOCK UPDATED' : s.mode === 'approach' ? 'PALLET APPROACHING…' : 'READY', W / 2, 137, 14, '#0b1324', 800, 'center');
    }, { pallets: S.pallets, mode: 'idle' });
    const brdG = at(new THREE.Group(), -1.8, 0, 0.2, st);
    at(box(0.08, 2.2, 0.08, 0x475569), 0, 1.1, -0.05, brdG);
    at(brd.mesh, 0, 2.9, 0, brdG);
    reg.add('dock-status-light', st, { zone: Z, label: [-1, 4.0, 0] });
    const setLights = (mode) => {
      Ls.red.emissiveIntensity = 0.08;
      Ls.amber.emissiveIntensity = mode === 'approach' ? 1.6 : 0.08;
      Ls.green.emissiveIntensity = mode === 'read' ? 2.2 : mode === 'idle' ? 0.9 : 0.1;
      brd.set({ mode, pallets: S.pallets });
    };

    // Staging pallet that appears after drop
    const staged = at(new THREE.Group(), -40, FLOOR, 2.4, root);
    at(box(1.2, 0.14, 1.2, 0x92400e), 0, 0.07, 0, staged);
    at(M('cardboard_box_01', { fit: [1.1, 0.9, 1.1] }, () => box(1.1, 0.9, 1.1, 0xc8a26b)), 0, hasModel('cardboard_box_01') ? 0.15 : 0.6, 0, staged);
    at(box(0.32, 0.2, 0.03, basic(0x22c55e, { toneMapped: false })), 0.25, 0.45, 0.57, staged);
    staged.visible = false;

    const fo = { z: 22.6 };
    fk.rotation.y = Math.PI;
    let carrying = true, read = false;
    const placeFk = () => { fk.position.set(-40, FLOOR, fo.z); };
    placeFk();
    gsap.timeline({ repeat: -1 })
      .call(() => { carrying = true; read = false; pallet.visible = true; tagMat.color.set(0xef4444); tagMat.emissive.set(0xef4444); setLights('idle'); })
      .to(carriage.position, { y: LIFT, duration: 0.6 })
      .to(fo, { z: 2.6 + pallet.position.z, duration: 6, ease: 'power1.inOut', onUpdate: placeFk })
      .to(carriage.position, { y: carriage.userData.y0, duration: 0.6 })
      .call(() => { pallet.visible = false; carrying = false; staged.visible = true; })
      .to(fo, { z: 22.6, duration: 4.6, ease: 'power1.inOut', onUpdate: placeFk })
      .call(() => { staged.visible = false; })
      .to({}, { duration: 0.8 });

    up.push(() => {
      if (!carrying) return;
      if (!read && fo.z < 17 && fo.z > 9.3) { if (brd.state.mode !== 'approach') setLights('approach'); }
      if (!read && fo.z <= 9.4) {
        read = true;
        for (const a of ants) {
          const p = a.getWorldPosition(new THREE.Vector3());
          for (let i = 0; i < 3; i++) waves.spawn(p, C.dock, { normal: 'x', size: 2.6, dur: 1.1, delay: i * 0.22 });
        }
        waves.spawn(tagG.getWorldPosition(new THREE.Vector3()), 0x22c55e, { normal: 'z', size: 1.2, dur: 0.8, delay: 0.3 });
        gsap.to(antMat, { emissiveIntensity: 2.2, duration: 0.15, yoyo: true, repeat: 5 });
        gsap.delayedCall(0.35, () => { tagMat.color.set(0x22c55e); tagMat.emissive.set(0x22c55e); });
        S.pallets = S.pallets >= 24 ? 1 : S.pallets + 1;
        setLights('read');
        gsap.delayedCall(2.6, () => setLights('idle'));
      }
    });

    // RFID label printer (encodes the pallet tags)
    const pr = at(new THREE.Group(), -55, FLOOR, 15.2, root);
    at(box(2.2, 0.08, 1.1, 0x94a3b8), 0, 0.86, 0, pr);
    for (const [x, z] of [[-1, -0.45], [1, -0.45], [-1, 0.45], [1, 0.45]]) at(box(0.07, 0.86, 0.07, 0x475569), x, 0.43, z, pr);
    // Industrial thermal-transfer RFID printer (metal case, black touch-panel column, side media window)
    const body = at(new THREE.Group(), -0.3, 0.9, 0, pr);
    const SILV = { roughness: 0.32, metalness: 0.65 }, BLK = { roughness: 0.5, metalness: 0.1 };
    const W = 0.56, H = 0.66, D = 0.86, fz = D / 2;                                 // case size, front face at +z
    at(box(W, 0.03, D - 0.04, 0x1f2937, BLK), 0, 0.015, 0, body);                    // rubber feet plinth
    at(box(W, H - 0.03, D, 0x9ca3af, SILV), 0, 0.03 + (H - 0.03) / 2, 0, body);      // silver main case
    at(box(0.21, H - 0.02, 0.12, 0x1f2937, BLK), -W / 2 + 0.1, 0.03 + (H - 0.02) / 2, fz - 0.055, body); // black front panel column
    at(box(W - 0.2, 0.012, D - 0.02, 0x6b7280, SILV), 0.1, H + 0.006, 0, body);     // lid seam line
    // Side media window (smoked glass in a black frame) on the right side
    at(box(0.012, 0.3, 0.44, 0x111827, BLK), W / 2 + 0.002, H - 0.22, -0.08, body);
    at(box(0.006, 0.24, 0.38, basic(0x334155, { transparent: true, opacity: 0.55 })), W / 2 + 0.01, H - 0.22, -0.08, body);
    const roll = at(cyl(0.11, 0.11, 0.3, 20, 0xf8fafc, ABS), 0.12, H - 0.22, -0.1, body);
    roll.rotation.z = Math.PI / 2;
    at(cyl(0.035, 0.035, 0.34, 12, 0x6b7280), 0.12, H - 0.22, -0.1, body).rotation.z = Math.PI / 2;
    // Front: black touch panel column — power key, portrait touchscreen, three keys, USB port
    at(box(0.12, 0.05, 0.012, 0x0b0f17, BLK), -W / 2 + 0.1, H - 0.06, fz + 0.006, body);
    const prLed = glowMat(0x38bdf8, 0.4);
    at(box(0.025, 0.025, 0.006, prLed), -W / 2 + 0.1, H - 0.06, fz + 0.014, body);
    at(box(0.15, 0.23, 0.01, 0x0b0f17, BLK), -W / 2 + 0.1, H - 0.24, fz + 0.005, body);
    for (const kx of [-0.045, 0, 0.045]) at(box(0.03, 0.025, 0.008, 0x374151, BLK), -W / 2 + 0.1 + kx, H - 0.39, fz + 0.004, body);
    at(box(0.03, 0.012, 0.006, 0x4b5563), -W / 2 + 0.06, 0.08, fz + 0.003, body);
    at(box(0.008, 0.12, 0.01, glowMat(0x38bdf8, 0.5)), -W / 2 + 0.195, H - 0.2, fz + 0.005, body); // blue accent strip
    // Front: silver upper door, label exit slot with tear bar, lower panel, blue latch
    at(box(W - 0.22, 0.26, 0.012, 0xb4bac2, SILV), 0.1, H - 0.17, fz + 0.006, body);
    at(box(W - 0.24, 0.04, 0.02, 0x111827, BLK), 0.1, 0.3, fz + 0.005, body);         // exit slot
    at(box(W - 0.24, 0.012, 0.03, 0x6b7280, SILV), 0.1, 0.275, fz + 0.012, body);      // tear bar
    at(box(W - 0.22, 0.2, 0.012, 0x8b9199, SILV), 0.1, 0.14, fz + 0.006, body);
    at(box(0.012, 0.06, 0.05, glowMat(0x38bdf8, 0.35)), W / 2 + 0.006, 0.1, fz - 0.1, body);
    // Rear cables
    at(cyl(0.015, 0.015, 0.5, 6, 0x111827), -0.15, 0.1, -fz - 0.2, body).rotation.x = Math.PI / 2;
    const prScr = new Screen(0.13, 0.2, 78, 120, (c, W2, H2, s) => {
      c.fillStyle = '#e0f2fe'; c.fillRect(0, 0, W2, H2);
      c.fillStyle = '#0ea5e9'; c.fillRect(0, 0, 10, H2);
      c.beginPath(); c.arc(26, 22, 9, 0, Math.PI * 2); c.fill();
      txt(c, s.t, W2 / 2 + 6, H2 / 2 + 4, 13, '#0c4a6e', 800, 'center');
      txt(c, 'QTY ' + (S.labels % 1000), W2 / 2 + 6, H2 / 2 + 24, 10, '#334155', 600, 'center');
    }, { t: 'READY' });
    at(prScr.mesh, -W / 2 + 0.1, H - 0.24, fz + 0.011, body);
    const lbl = at(box(0.3, 0.008, 0.36, 0xffffff), 0.1, 0.3, 0.3, body);
    lbl.visible = false;
    const op = at(person(0x0ea5e9), 0.6, 0, 1.2, pr);
    op.rotation.y = Math.PI;
    reg.add('rfid-label-printer', pr, { zone: Z, label: [-0.3, 2.6, 0] });
    gsap.timeline({ repeat: -1, repeatDelay: 2.5 })
      .call(() => { prScr.set({ t: 'ENCODE…' }); prLed.emissiveIntensity = 2; })
      .call(() => { const p = body.getWorldPosition(new THREE.Vector3()); p.y += 0.3; waves.spawn(p, C.dock, { normal: 'y', size: 1.6, dur: 0.9 }); waves.spawn(p, C.dock, { normal: 'y', size: 1.6, dur: 0.9, delay: 0.3 }); })
      .to({}, { duration: 1 })
      .call(() => { prScr.set({ t: 'EPC ✓' }); lbl.visible = true; lbl.position.z = 0.42; })
      .to(lbl.position, { z: 0.72, duration: 0.9, ease: 'none' })
      .to({}, { duration: 0.8 })
      .call(() => { lbl.visible = false; prScr.set({ t: 'READY' }); prLed.emissiveIntensity = 0.4; });
  }

  /* ---------------------------- ③ WAREHOUSE ---------------------------- */
  {
    const Z = 'warehouse';
    const b = new Batcher();
    const cartonItems = [];
    const rows = [-19, -13, -7];
    const levels = [0, 1.6, 3.1];
    for (const rz of rows) {
      for (let x = -58; x <= -30.1; x += 2.8) {
        for (const dz of [-0.55, 0.55]) b.add(0.12, 4.5, 0.12, 0x1d4ed8, x, FLOOR + 2.25, rz + dz);
        if (x + 2.8 > -30.1) continue;
        const cx = x + 1.4;
        for (const ly of levels.slice(1)) for (const dz of [-0.58, 0.58]) b.add(2.8, 0.14, 0.08, 0xf97316, cx, FLOOR + ly, rz + dz);
        for (const ly of levels) {
          const n = (Math.abs(cx * 7 + rz * 3 + ly * 11) % 3) | 0;
          for (let i = 0; i < Math.max(1, n); i++) {
            const ox = (i - 0.5 * (Math.max(1, n) - 1)) * 1.25;
            const hh = 0.7 + ((cx * 13 + ly * 5 + i) % 4 + 4) % 4 * 0.12;
            b.add(1.1, 0.12, 1.0, 0x92400e, cx + ox, FLOOR + ly + 0.13, rz);
            if (hasModel('cardboard_box_01')) cartonItems.push({ x: cx + ox, y: FLOOR + ly + 0.19, z: rz, rotY: ((i + ly) % 2) * Math.PI, size: [1.0, hh, 0.95] });
            else b.add(1.0, hh, 0.95, (i + (cx | 0)) % 3 ? 0xc8a26b : 0x94a3b8, cx + ox, FLOOR + ly + 0.19 + hh / 2, rz);
          }
        }
      }
    }
    // Staging marking
    for (const [w, d, x, z] of [[8, 0.12, -40, 0.4], [8, 0.12, -40, 4.6], [0.12, 4.2, -44, 2.5], [0.12, 4.2, -36, 2.5]]) b.add(w, 0.02, d, 0xfacc15, x, FLOOR + 0.01, z);
    for (const x of [-43, -37.2]) {
      b.add(1.2, 0.14, 1.2, 0x92400e, x, FLOOR + 0.07, 2.4);
      if (hasModel('cardboard_box_01')) cartonItems.push({ x, y: FLOOR + 0.14, z: 2.4, size: [1.1, 0.95, 1.1] });
      else b.add(1.1, 0.95, 1.1, 0xc8a26b, x, FLOOR + 0.62, 2.4);
    }
    b.build(root);
    instanced('cardboard_box_01', cartonItems, root);

    // ESL tags on the front rack
    const eslRoots = [];
    const skus = ['A-102', 'A-115', 'B-207', 'C-031', 'C-044', 'D-310'];
    const eslScreens = [];
    let si = 0;
    for (const ly of [1.6, 3.1]) {
      for (const cx of [-56.6, -53.8, -51.0]) {
        const g = at(new THREE.Group(), cx, FLOOR + ly - 0.02, -7 + 0.64, root);
        at(box(0.62, 0.36, 0.04, 0x1f2937), 0, 0, 0, g);
        const sc = new Screen(0.56, 0.3, 192, 104, eslDraw, { sku: skus[si], qty: 20 + si * 7, low: false });
        at(sc.mesh, 0, 0, 0.022, g);
        at(pickProxy(0.9, 0.6, 0.3), 0, 0, 0, g);
        eslScreens.push(sc);
        reg.add('esl-shelf', g, { zone: Z, label: [0, 1.0, 0], primary: si === 1 });
        eslRoots.push(g);
        si++;
      }
    }
    gsap.timeline({ repeat: -1 }).to({}, { duration: 1.6 }).call(() => {
      const sc = eslScreens[(Math.random() * eslScreens.length) | 0];
      const q = Math.max(4, sc.state.qty + (Math.random() < 0.6 ? -((Math.random() * 6) | 0) - 1 : 12));
      sc.set({ qty: q });
      waves.spawn(sc.mesh.getWorldPosition(new THREE.Vector3()), C.warehouse, { normal: 'z', size: 0.9, dur: 0.7 });
    });

    // Pick-to-Light modules on the lower beam of the front rack
    const ptl = [];
    const ptlXs = [-46.6, -43.8, -41.0, -38.2, -35.4, -32.6];
    ptlXs.forEach((x, i) => {
      const g = at(new THREE.Group(), x, FLOOR + 1.6 + 0.2, -7 + 0.66, root);
      at(box(0.46, 0.24, 0.12, 0x111827), 0, 0, 0, g);
      const cap = glowMat(0x22c55e, 0.0);
      cap.color.set(0x334155);
      at(box(0.44, 0.1, 0.14, cap), 0, 0.17, 0, g);
      const sc = new Screen(0.3, 0.16, 96, 52, (c, W, H, s) => {
        c.fillStyle = '#050a14'; c.fillRect(0, 0, W, H);
        txt(c, s.on ? String(s.n) : '–', W / 2, H / 2 + 2, 40, s.on ? s.col : '#1e293b', 800, 'center');
      }, { on: false, n: 0, col: '#4ade80' });
      at(sc.mesh, -0.02, 0, 0.065, g);
      at(pickProxy(0.7, 0.7, 0.4), 0, 0, 0, g);
      reg.add('pick-to-light', g, { zone: Z, label: [0, 1.2, 0], primary: i === 2 });
      ptl.push({ g, cap, sc, x });
    });
    const picker = at(person(0x3b82f6), -40, FLOOR, -4.6, root);
    picker.rotation.y = Math.PI;
    refs.picker = picker;
    const lightPTL = (i, n, col = 0x22c55e) => {
      const p = ptl[i];
      p.cap.color.set(col); p.cap.emissive.set(col); p.cap.emissiveIntensity = 1.8;
      p.sc.set({ on: true, n, col: hex(col) });
      gsap.to(p.cap, { emissiveIntensity: 0.6, duration: 0.35, yoyo: true, repeat: 5 });
    };
    const offPTL = (i) => {
      const p = ptl[i];
      gsap.killTweensOf(p.cap);
      p.cap.color.set(0x334155); p.cap.emissiveIntensity = 0;
      p.sc.set({ on: false });
    };
    refs.ptl = { list: ptl, light: lightPTL, off: offPTL };
    gsap.timeline({ repeat: -1, repeatDelay: 0.8 }).call(() => {
      if (S.chainPTL) return;
      const i = (Math.random() * ptl.length) | 0;
      lightPTL(i, 1 + ((Math.random() * 6) | 0));
      gsap.to(picker.position, { x: ptl[i].x, duration: 1.1, ease: 'power1.inOut' });
      gsap.delayedCall(2.0, () => { if (!S.chainPTL) offPTL(i); });
    }).to({}, { duration: 2.6 });

    // RTLS anchors (RFID) at the warehouse corners
    const anchors = [];
    [[-61.2, -21.2], [-23.8, -21.2], [-61.2, 6.6], [-23.8, 6.6]].forEach(([x, z], i) => {
      const g = at(new THREE.Group(), x, FLOOR, z, root);
      at(cyl(0.08, 0.1, 6, 6, 0x64748b), 0, 3, 0, g);
      at(box(0.5, 0.5, 0.2, 0xf8fafc), 0, 6.1, 0, g);
      const led = glowMat(C.warehouse, 1.5);
      at(box(0.18, 0.06, 0.05, led), 0, 5.95, 0.12, g);
      reg.add('rtls-rfid-anchor', g, { zone: Z, label: [0, 7.0, 0], primary: i === 3 });
      anchors.push(g);
      gsap.timeline({ repeat: -1, delay: i * 0.55 }).call(() => waves.spawn(v3(x, FLOOR + 6.1, z), C.warehouse, { normal: 'y', size: 5, dur: 1.6 })).to({}, { duration: 2.4 });
    });
    // Trilateration lines from anchors to the tracked forklift + location pin
    const lineMat = new THREE.LineBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.5, toneMapped: false });
    const lines = anchors.map((a) => {
      const g = new THREE.BufferGeometry().setFromPoints([a.position.clone().setY(FLOOR + 6.1), v3()]);
      const l = new THREE.Line(g, lineMat);
      root.add(l);
      return l;
    });
    const pin = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), basic(0x60a5fa, { toneMapped: false }));
    pin.rotation.x = Math.PI;
    root.add(pin);
    const fk = refs.forklift;
    up.push((t) => {
      const inside = fk.position.z < 8.4;
      lineMat.opacity = inside ? 0.25 + 0.25 * Math.abs(Math.sin(t * 3)) : 0;
      pin.visible = inside;
      if (!inside) return;
      for (const l of lines) {
        const arr = l.geometry.attributes.position.array;
        arr[3] = fk.position.x; arr[4] = FLOOR + 2.6; arr[5] = fk.position.z;
        l.geometry.attributes.position.needsUpdate = true;
      }
      pin.position.set(fk.position.x, FLOOR + 3.4 + Math.sin(t * 4) * 0.15, fk.position.z);
      pin.rotation.y = t * 2;
    });

    // AI Vision camera (second half of hybrid RTLS)
    const cam = at(new THREE.Group(), -24.6, FLOOR, 4.6, root);
    at(cyl(0.09, 0.11, 5.2, 6, 0x64748b), 0, 2.6, 0, cam);
    const head = at(new THREE.Group(), 0, 5.3, 0, cam);
    if (hasModel('security_camera_01')) at(model('security_camera_01', { depth: 0.9 }), 0, -0.25, 0, head);
    else {
      at(box(0.45, 0.4, 0.8, 0x0f172a), 0, 0, 0, head);
      at(cyl(0.14, 0.14, 0.18, 10, 0x1e3a8a), 0, 0, 0.45, head).rotation.x = Math.PI / 2;
    }
    const camLed = glowMat(C.warehouse, 1.6);
    at(box(0.08, 0.08, 0.04, camLed), 0.14, 0.12, 0.41, head);
    const target = v3(-40, FLOOR + 0.8, 4);
    head.lookAt(target);
    const coneG = new THREE.ConeGeometry(3.4, 16, 20, 1, true);
    coneG.translate(0, -8, 0); coneG.rotateX(-Math.PI / 2);
    const cone = new THREE.Mesh(coneG, new THREE.MeshBasicMaterial({ color: 0x60a5fa, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    cone.userData.noPick = true;
    head.add(cone);
    reg.add('ai-vision-camera-wh', cam, { zone: Z, label: [0, 6.4, 0] });
    const bb = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.7, 2.4, 3.4)), new THREE.LineBasicMaterial({ color: 0x93c5fd, toneMapped: false }));
    root.add(bb);
    const bbTag = new Screen(1.8, 0.45, 220, 56, (c, W, H) => {
      c.clearRect(0, 0, W, H); c.fillStyle = '#2563eb'; rr(c, 0, 0, W, H, 10); c.fill();
      txt(c, 'FORKLIFT 03 · 98%', W / 2, H / 2, 22, '#fff', 800, 'center');
    }, { transparent: true });
    bb.add(bbTag.mesh);
    bbTag.mesh.position.set(0, 1.55, 0);
    up.push((t) => {
      const inView = fk.position.z < 12;
      bb.visible = inView;
      if (inView) {
        bb.position.set(fk.position.x, FLOOR + 1.2, fk.position.z + 0.3);
        bb.material.opacity = 1;
        bbTag.mesh.quaternion.copy(ctx.camera.quaternion);
      }
      cone.material.opacity = 0.05 + 0.03 * Math.sin(t * 2);
    });
  }

  /* -------------------------- ④ INTRALOGISTICS -------------------------- */
  function makeAMR() {
    const g = new THREE.Group();
    // Body: Sketchfab AGV model squeezed to the AMR footprint, else a box with wheels
    const body = model('amr_agv', { fit: [1.0, 0.4, 1.45] });
    if (body) g.add(body); else at(box(1.0, 0.34, 1.45, 0xe2e8f0), 0, 0.27, 0, g);
    const lampM = glowMat(C.amr, 1.4);
    at(box(1.02, 0.05, 1.47, lampM), 0, body ? 0.12 : 0.2, 0, g);
    const lidar = at(cyl(0.13, 0.13, 0.14, 8, 0x111827), 0, 0.51, 0.52, g);
    at(box(0.12, 0.05, 0.05, basic(0xf472b6, { toneMapped: false })), 0.08, 0.06, 0, lidar);
    const tote = at(new THREE.Group(), 0, 0.44, -0.1, g);
    at(M('plastic_crate_02', { fit: [0.8, 0.4, 0.95] }, () => at(box(0.8, 0.38, 0.95, 0x2563eb), 0, 0.19, 0)), 0, 0, 0, tote);
    if (!body) for (const [x, z] of [[-0.5, 0.5], [0.5, 0.5], [-0.5, -0.5], [0.5, -0.5]]) {
      const w = cyl(0.11, 0.11, 0.08, 8, 0x0b0f19); w.rotation.z = Math.PI / 2; at(w, x, 0.11, z, g);
    }
    up.push((t, dt) => { lidar.rotation.y += dt * 9; });
    return { g, tote, lampM };
  }
  ctx.makeAMR = makeAMR;
  const BELT_Y = FLOOR + 0.95;
  {
    const Z = 'amr';
    // Corridor floor guidance lines
    const b = new Batcher();
    b.add(22, 0.02, 0.12, 0xa855f7, -24, FLOOR + 0.01, -0.5);
    b.add(0.12, 0.02, 7.5, 0xa855f7, -13, FLOOR + 0.01, 1.2);
    b.build(root);

    // AMR B: warehouse → conveyor transfer station (scene 4)
    const B = makeAMR();
    root.add(B.g);
    reg.add('amr', B.g, { zone: Z, label: [0, 1.9, 0] });
    const bCurve = pathCurve([[-34, FLOOR, -0.5], [-13, FLOOR, -0.5], [-13, FLOOR, 4], [-6.3, FLOOR, 4]], 2.2);
    const bo = { u: 0 };
    const pB = (rev) => () => placeOn(B.g, bCurve, bo.u, rev);
    placeOn(B.g, bCurve, 0);
    gsap.timeline({ repeat: -1 })
      .call(() => { B.tote.visible = true; })
      .to({}, { duration: 1.4 })
      .to(bo, { u: 1, duration: 7, ease: 'power1.inOut', onUpdate: pB(false) })
      .call(() => { ctx.transfer(); B.tote.visible = false; })
      .to({}, { duration: 2.4 })
      .to(bo, { u: 0, duration: 6, ease: 'power1.inOut', onUpdate: pB(true) });

    // AMR A: hero AMR for the highlight scene (warehouse → line-side rack)
    const A = makeAMR();
    root.add(A.g);
    A.tote.visible = false;
    reg.add('amr', A.g, { zone: Z, primary: false });
    refs.amrA = A;
    refs.amrACurve = pathCurve([[-29, FLOOR, -4.4], [-16.5, FLOOR, -4.4], [-16.5, FLOOR, -11.6], [16, FLOOR, -11.6], [16, FLOOR, -12.6]], 2.2);
    placeOn(A.g, refs.amrACurve, 0);

    // Roaming AMRs (overview life)
    const loops = [
      [[[-18, FLOOR, 21], [-8, FLOOR, 21], [-8, FLOOR, 9], [-18, FLOOR, 9]], 40],
      [[[0, FLOOR, 13], [58, FLOOR, 13], [58, FLOOR, 20], [0, FLOOR, 20]], 75],
    ];
    for (const [pts, dur] of loops) {
      const R = makeAMR();
      root.add(R.g);
      reg.add('amr', R.g, { zone: Z, primary: false });
      const cv = pathCurve(pts, 2.5, true);
      const o = { u: Math.random() };
      gsap.to(o, { u: '+=1', duration: dur, repeat: -1, ease: 'none', onUpdate: () => placeOn(R.g, cv, o.u % 1) });
    }

    // Charging station + docked AMR
    const ch = at(new THREE.Group(), -12.5, FLOOR, -20.2, root);
    at(box(1.4, 1.2, 0.5, 0x334155), 0, 0.6, 0, ch);
    const chLed = glowMat(C.amr, 1.2);
    at(box(0.8, 0.08, 0.1, chLed), 0, 0.25, 0.28, ch);
    const bat = new Screen(1.0, 0.5, 200, 100, (c, W, H, s) => {
      c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
      c.strokeStyle = '#c084fc'; c.lineWidth = 5; c.strokeRect(14, 22, W - 44, H - 44); c.fillStyle = '#c084fc'; c.fillRect(W - 30, H / 2 - 10, 10, 20);
      c.fillStyle = s.p > 0.95 ? '#4ade80' : '#a855f7'; c.fillRect(20, 28, (W - 56) * s.p, H - 56);
      txt(c, Math.round(s.p * 100) + '%', W / 2 - 10, H / 2, 26, '#fff', 800, 'center');
    }, { p: 0.4 });
    at(bat.mesh, 0, 0.85, 0.26, ch);
    const Cg = makeAMR();
    Cg.tote.visible = false;
    at(Cg.g, 0, 0, 1.3, ch);
    Cg.g.rotation.y = Math.PI;
    reg.add('amr-charging', ch, { zone: Z, label: [0, 2.2, 0] });
    const bo2 = { p: 0.35 };
    gsap.to(bo2, { p: 1, duration: 10, repeat: -1, repeatDelay: 1.5, ease: 'none', onUpdate: () => bat.set({ p: bo2.p }) });
    gsap.to(chLed, { emissiveIntensity: 0.3, duration: 0.6, yoyo: true, repeat: -1 });

    // Conveyor transfer station (AMR → line)
    const cd = at(new THREE.Group(), -4.7, FLOOR, 4, root);
    at(box(2.0, 0.85, 1.3, 0x334155), 0, 0.425, 0, cd);
    const rollers = [];
    for (let i = 0; i < 6; i++) {
      const r = cyl(0.07, 0.07, 1.1, 8, 0x94a3b8); r.rotation.x = Math.PI / 2;
      rollers.push(at(r, -0.8 + i * 0.32, 0.92, 0, cd));
    }
    const cdLed = glowMat(C.amr, 0.4);
    at(box(2.02, 0.08, 1.32, cdLed), 0, 0.7, 0, cd);
    reg.add('conveyor-dock', cd, { zone: Z, label: [0, 2.2, 0] });
    let spinning = 0;
    up.push((t, dt) => { if (spinning > 0) { spinning -= dt; for (const r of rollers) r.rotation.y += dt * 12; } });
    refs.cdPulse = () => {
      spinning = 2.4;
      gsap.fromTo(cdLed, { emissiveIntensity: 2 }, { emissiveIntensity: 0.4, duration: 2.4 });
      waves.spawn(v3(-4.7, FLOOR + 1.0, 4), C.amr, { normal: 'y', size: 2.4, dur: 1 });
    };
  }

  /* --------------------------- ⑤ PRODUCTION --------------------------- */
  {
    const Z = 'production';
    const b = new Batcher();
    // Belt texture
    const bc = document.createElement('canvas'); bc.width = 64; bc.height = 16;
    const bx = bc.getContext('2d'); bx.fillStyle = '#1f2937'; bx.fillRect(0, 0, 64, 16); bx.fillStyle = '#374151'; bx.fillRect(0, 0, 10, 16);
    const beltTex = new THREE.CanvasTexture(bc);
    beltTex.wrapS = THREE.RepeatWrapping; beltTex.colorSpace = THREE.SRGBColorSpace;
    const belts = [];
    const segment = (x0, x1) => {
      const len = x1 - x0, cx = (x0 + x1) / 2;
      at(box(len, 0.25, 1.3, 0x475569), cx, FLOOR + 0.8, 4, root);
      const t = beltTex.clone(); t.needsUpdate = true; t.repeat.set(len, 1);
      const belt = at(new THREE.Mesh(new THREE.BoxGeometry(len, 0.04, 1.1), new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 })), cx, FLOOR + 0.94, 4, root);
      belt.receiveShadow = true;
      belts.push(t);
      for (const dz of [-0.68, 0.68]) b.add(len, 0.12, 0.06, 0x94a3b8, cx, FLOOR + 1.02, 4 + dz);
      for (let x = x0 + 0.4; x < x1; x += 2.6) for (const dz of [-0.55, 0.55]) b.add(0.1, 0.7, 0.1, 0x334155, x, FLOOR + 0.35, 4 + dz);
    };
    segment(-3.7, 3.6);
    segment(7.4, 47);
    const V = 1.4;
    up.push((t, dt) => { for (const bt of belts) bt.offset.x -= V * dt; });

    // Press with mold
    const press = at(new THREE.Group(), 5.5, FLOOR, 4, root);
    for (const [x, z] of [[-1.5, -1.3], [1.5, -1.3], [-1.5, 1.3], [1.5, 1.3]]) at(box(0.4, 4.6, 0.4, 0x15803d), x, 2.3, z, press);
    at(box(3.8, 0.95, 3.2, 0x166534), 0, 4.9, 0, press);
    at(box(3.4, 0.95, 2.9, 0x14532d), 0, 0.475, 0, press);
    const ram = at(new THREE.Group(), 0, 3.4, 0, press);
    at(box(2.8, 0.6, 2.4, 0x334155), 0, 0.3, 0, ram);
    at(box(2.0, 0.35, 1.6, 0x64748b), 0, -0.17, 0, ram);
    const ramLed = glowMat(0x22c55e, 0.6);
    at(box(3.82, 0.12, 0.05, ramLed), 0, 4.9, 1.62, press);

    // Mold QR traceability
    const mq = at(new THREE.Group(), 5.5, FLOOR, 4, root);
    at(box(2.0, 0.42, 1.6, 0x94a3b8), 0, 1.16, 0, mq);
    const qr = new Screen(0.36, 0.36, 84, 84, (c, W, H, s) => {
      c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#000';
      let seed = 7;
      for (let y = 0; y < 21; y++) for (let x = 0; x < 21; x++) { seed = (seed * 9301 + 49297) % 233280; if (seed / 233280 > 0.52) c.fillRect(x * 4, y * 4, 4, 4); }
      for (const [px, py] of [[0, 0], [14, 0], [0, 14]]) { c.fillStyle = '#000'; c.fillRect(px * 4, py * 4, 28, 28); c.fillStyle = '#fff'; c.fillRect(px * 4 + 4, py * 4 + 4, 20, 20); c.fillStyle = '#000'; c.fillRect(px * 4 + 8, py * 4 + 8, 12, 12); }
      if (s.scan) { c.fillStyle = 'rgba(239,68,68,.5)'; c.fillRect(0, s.scan * H, W, 4); }
    }, { scan: 0 });
    at(qr.mesh, 0.5, 1.16, 0.805, mq);
    const scanner = at(new THREE.Group(), 1.6, 0, 2.4, mq);
    at(cyl(0.06, 0.08, 1.4, 6, 0x475569), 0, 0.7, 0, scanner);
    const sh = at(box(0.3, 0.22, 0.4, 0x111827), 0, 1.45, 0, scanner);
    sh.rotation.y = -0.6;
    const laser = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 1.9), basic(0xef4444, { transparent: true, opacity: 0, toneMapped: false, side: THREE.DoubleSide }));
    laser.userData.noPick = true;
    laser.position.set(1.05, 1.3, 1.6); laser.rotation.set(Math.PI / 2, 0, -0.95);
    mq.add(laser);
    const md = new Screen(1.7, 0.95, 300, 168, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.production));
      txt(c, 'MOLD  M-07', 14, 24, 19, '#86efac', 800);
      txt(c, 'Shots', 14, 60, 14, '#94a3b8'); txt(c, nf(s.shots), W - 14, 60, 22, '#f8fafc', 800, 'right');
      txt(c, 'Next PM in', 14, 92, 14, '#94a3b8'); txt(c, nf(15000 - s.shots % 15000), W - 14, 92, 18, '#fbbf24', 800, 'right');
      c.fillStyle = '#1e293b'; c.fillRect(14, 116, W - 28, 10); c.fillStyle = '#22c55e'; c.fillRect(14, 116, (W - 28) * ((s.shots % 15000) / 15000), 10);
      txt(c, s.scanned ? 'QR SCANNED ✓  traced to lot 2611-A' : 'Waiting for scan…', 14, 146, 13, s.scanned ? '#4ade80' : '#64748b', 700);
    }, { shots: S.shots, scanned: false });
    at(md.mesh, 0, 2.15, 0.05, scanner);
    md.mesh.rotation.y = -0.4;
    at(pickProxy(1.2, 1.0, 1.2), 0, 1.5, 0, scanner);
    reg.add('mold-qr', mq, { zone: Z, label: [1.6, 3.6, 2.4] });
    gsap.timeline({ repeat: -1, repeatDelay: 3 })
      .to(laser.material, { opacity: 0.9, duration: 0.1 })
      .to(qr.state, { scan: 1, duration: 0.8, ease: 'none', onUpdate: () => qr.set({}) })
      .to(laser.material, { opacity: 0, duration: 0.15 })
      .call(() => { qr.set({ scan: 0 }); md.set({ scanned: true }); waves.spawn(qr.mesh.getWorldPosition(new THREE.Vector3()), C.production, { normal: 'z', size: 1, dur: 0.7 }); })
      .to({}, { duration: 2 })
      .call(() => md.set({ scanned: false }));

    // Line items: feed totes + product trays
    const items = [];
    const makeTray = () => {
      const g = new THREE.Group();
      at(box(0.9, 0.12, 0.7, 0x334155), 0, 0.06, 0, g);
      for (const [x, z] of [[-0.22, -0.16], [0.22, -0.16], [-0.22, 0.16], [0.22, 0.16]]) at(box(0.28, 0.14, 0.24, 0xcbd5e1), x, 0.19, z, g);
      const marker = at(box(0.18, 0.06, 0.18, basic(0x22c55e, { toneMapped: false }).clone()), 0.32, 0.3, 0.22, g);
      const label = at(box(0.36, 0.015, 0.22, 0xffffff), 0, 0.27, 0, g);
      g.userData = { marker, label };
      g.visible = false;
      root.add(g);
      return g;
    };
    const makeTote = () => {
      const g = new THREE.Group();
      at(M('plastic_crate_03', { fit: [0.75, 0.36, 0.6] }, () => at(box(0.75, 0.36, 0.6, 0x2563eb), 0, 0.18, 0)), 0, -0.18, 0, g);
      g.visible = false; root.add(g); return g;
    };
    const trays = Array.from({ length: 16 }, makeTray);
    const totes = Array.from({ length: 4 }, makeTote);
    const spawn = (pool, kind, x) => {
      const o = pool.find((p) => !p.visible);
      if (!o) return;
      o.visible = true;
      o.position.set(x, BELT_Y + (kind === 'tote' ? 0.18 : 0), 4);
      if (kind === 'tray') { o.userData.marker.visible = false; o.userData.label.visible = false; }
      items.push({ o, kind, flags: {}, divert: false });
    };
    ctx.transfer = () => {
      refs.cdPulse();
      spawn(totes, 'tote', -3.3);
      gsap.delayedCall(0.9, () => spawn(totes, 'tote', -3.3));
    };

    // Press cycle → spawn trays
    gsap.timeline({ repeat: -1 })
      .to(ram.position, { y: 2.3, duration: 0.45, ease: 'power2.in' })
      .call(() => { S.shots++; md.set({ shots: S.shots }); ramLed.emissiveIntensity = 2; waves.spawn(v3(5.5, FLOOR + 1.4, 4), 0x86efac, { normal: 'y', size: 2.2, dur: 0.5 }); })
      .to(ram.position, { y: 3.4, duration: 0.9, ease: 'power2.out' })
      .call(() => { ramLed.emissiveIntensity = 0.6; spawn(trays, 'tray', 7.7); })
      .to({}, { duration: 1.25 });

    // AI vision gantry
    const av = at(new THREE.Group(), 22, FLOOR, 4, root);
    for (const z of [-1.0, 1.0]) at(box(0.18, 2.9, 0.18, 0x334155), 0, 1.45, z, av);
    at(box(0.3, 0.25, 2.3, 0x334155), 0, 2.95, 0, av);
    at(box(0.5, 0.45, 0.5, 0x0f172a), 0, 2.6, 0, av);
    const ringM = glowMat(0xffffff, 0.4);
    const ring = at(new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 6, 20), ringM), 0, 2.32, 0, av);
    ring.rotation.x = Math.PI / 2;
    const vcone = new THREE.Mesh(new THREE.ConeGeometry(0.75, 1.3, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x86efac, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
    vcone.userData.noPick = true;
    at(vcone, 0, 1.65, 0, av);
    const vs = new Screen(1.9, 1.0, 320, 168, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.production));
      txt(c, 'AI VISION · TRAY CHECK', 14, 22, 15, '#86efac', 800);
      txt(c, 'OK', 14, 62, 15, '#94a3b8'); txt(c, nf(s.ok), 150, 62, 28, '#4ade80', 800, 'right');
      txt(c, 'NG', 172, 62, 15, '#94a3b8'); txt(c, nf(s.ng), W - 14, 62, 28, '#f87171', 800, 'right');
      txt(c, 'Yield', 14, 102, 15, '#94a3b8'); txt(c, ((s.ok / (s.ok + s.ng)) * 100).toFixed(1) + '%', W - 14, 102, 24, '#f8fafc', 800, 'right');
      c.fillStyle = s.last === 'NG' ? '#dc2626' : '#16a34a'; rr(c, 14, 126, W - 28, 30, 8); c.fill();
      txt(c, s.last === 'NG' ? 'LAST: NG – scratch detected' : 'LAST: OK – 4/4 parts', W / 2, 141, 15, '#fff', 800, 'center');
    }, { ok: S.ok, ng: S.ng, last: 'OK' });
    at(vs.mesh, 0, 3.75, 0.1, av);
    reg.add('ai-vision-inspection', av, { zone: Z, label: [0, 4.7, 0] });
    const vbb = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.05, 0.5, 0.85)), new THREE.LineBasicMaterial({ color: 0x4ade80, toneMapped: false }));
    vbb.visible = false;
    root.add(vbb);
    const rejectBin = at(new THREE.Group(), 26.2, FLOOR, 6.0, root);
    at(box(1.4, 0.7, 1.0, 0xb91c1c), 0, 0.35, 0, rejectBin);
    const pusher = at(box(0.2, 0.3, 0.9, 0x64748b), 26.2, BELT_Y + 0.2, 2.6, root);

    // Auto label printer (OK parts only)
    const al = at(new THREE.Group(), 31, FLOOR, 2.3, root);
    at(box(0.6, 1.0, 0.6, 0x334155), 0, 0.5, 0, al);
    at(box(0.95, 0.75, 0.9, 0xe5e7eb), 0, 1.38, 0, al);
    at(box(0.96, 0.1, 0.5, 0x475569), 0, 1.78, -0.1, al);
    const alLed = glowMat(C.production, 0.4);
    at(box(0.14, 0.07, 0.03, alLed), 0.28, 1.5, 0.46, al);
    const alScr = new Screen(0.34, 0.18, 120, 64, (c, W, H, s) => {
      c.fillStyle = '#0f2a1a'; c.fillRect(0, 0, W, H);
      txt(c, '#' + String(s.n).padStart(6, '0'), W / 2, H / 2, 20, '#86efac', 700, 'center');
    }, { n: S.labels });
    at(alScr.mesh, -0.15, 1.5, 0.455, al);
    const appl = at(new THREE.Group(), 0, 1.15, 0.45, al);
    at(box(0.14, 0.14, 1.0, 0x94a3b8), 0, 0, 0.5, appl);
    at(box(0.4, 0.06, 0.3, 0x111827), 0, -0.07, 1.0, appl);
    reg.add('auto-label', al, { zone: Z, label: [0, 2.7, 0] });

    // Line-side supermarket rack with ESL
    const lr = at(new THREE.Group(), 16, FLOOR, -15, root);
    for (const x of [-6, -2, 2, 6]) for (const z of [-0.5, 0.5]) at(box(0.1, 2.4, 0.1, 0x1d4ed8), x, 1.2, z, lr);
    for (const y of [0.9, 1.9]) {
      at(box(12.1, 0.08, 1.1, 0x64748b), 0, y, 0, lr);
      if (hasModel('plastic_crate_02')) {
        const bins = [];
        for (let x = -5.4; x < 6; x += 1.2) bins.push({ x, y: y + 0.05, z: 0, size: [1.0, 0.45, 0.85] });
        instanced('plastic_crate_02', bins, lr);
      } else for (let x = -5.4; x < 6; x += 1.2) at(box(1.0, 0.45, 0.9, (x * 10) % 3 > 1 ? 0x2563eb : 0x0ea5e9), x, y + 0.27, 0, lr);
    }
    const lineTags = [];
    [[-4, 'B-118'], [0, 'B-220'], [4, 'B-305']].forEach(([x, sku], i) => {
      const g = at(new THREE.Group(), 16 + x, FLOOR + 0.78, -15 + 0.6, root);
      at(box(0.62, 0.36, 0.04, 0x1f2937), 0, 0, 0, g);
      const sc = new Screen(0.56, 0.3, 192, 104, eslDraw, i === 1 ? { sku, qty: S.line.qty, low: false } : { sku, qty: 18 + i * 9, low: false });
      at(sc.mesh, 0, 0, 0.022, g);
      at(pickProxy(1.0, 0.7, 0.4), 0, 0, 0, g);
      reg.add('esl-lineside', g, { zone: Z, label: [0, 1.1, 0], primary: i === 1 });
      lineTags.push(sc);
    });
    refs.lineEsl = lineTags[1];
    refs.lineEslPos = v3(16, FLOOR + 0.9, -14.3);

    // Digital Work Instruction station
    const wi = at(new THREE.Group(), 14, FLOOR, 5.7, root);
    at(cyl(0.06, 0.09, 1.3, 6, 0x475569), 0, 0.65, 0, wi);
    const tab = at(new THREE.Group(), 0, 1.5, 0, wi);
    tab.rotation.set(-0.3, -0.35, 0);
    at(box(1.1, 0.78, 0.06, 0x0f172a), 0, 0, 0, tab);
    const WIS = [['Load blank', 'Align to pins A/B'], ['Check gate area', 'No burr > 0.2 mm'], ['Torque 4 screws', '2.5 N·m, cross order'], ['Scan & release', 'Tray to vision cell']];
    const wis = new Screen(1.0, 0.7, 300, 210, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.production));
      txt(c, 'WI-LN1-ST02 · Rev C', 14, 22, 14, '#86efac', 700);
      txt(c, `STEP ${s.i + 1}/4`, W - 14, 22, 14, '#fbbf24', 800, 'right');
      c.fillStyle = '#1e293b'; rr(c, 14, 40, 110, 110, 8); c.fill();
      c.fillStyle = '#94a3b8'; c.fillRect(34, 70 + (s.i % 2) * 10, 70, 40);
      c.strokeStyle = '#fbbf24'; c.lineWidth = 3; c.strokeRect(30 + s.i * 12, 64, 30, 30);
      txt(c, WIS[s.i][0], 136, 64, 18, '#f8fafc', 800);
      txt(c, WIS[s.i][1], 136, 92, 13, '#cbd5e1', 500);
      for (let k = 0; k < 4; k++) { c.fillStyle = k < s.i ? '#22c55e' : k === s.i ? '#fbbf24' : '#334155'; rr(c, 136 + k * 38, 120, 30, 22, 5); c.fill(); }
      txt(c, 'Operator: certified ✓', 14, 178, 13, '#4ade80', 700);
    }, { i: 0 });
    at(wis.mesh, 0, 0, 0.035, tab);
    const wop = at(person(0x22c55e), -1.3, 0, 0.6, wi);
    wop.rotation.y = Math.PI;
    reg.add('digital-wi', wi, { zone: Z, label: [0, 2.6, 0] });
    gsap.timeline({ repeat: -1 }).to({}, { duration: 3.2 }).call(() => { wis.set({ i: (wis.state.i + 1) % 4 }); });
    up.push((t) => { wop.children[0].rotation.y = Math.sin(t * 1.5) * 0.3; });

    // FG packing + RFID Kanban
    const pk = at(new THREE.Group(), 49, FLOOR, 6.9, root);
    at(box(3.2, 0.9, 1.4, 0x64748b), 0, 0.45, 0, pk);
    const pkop = at(person(0x22c55e), 0, 0, 1.2, pk);
    pkop.rotation.y = Math.PI;
    const fgp = at(new THREE.Group(), 54.6, FLOOR, 6.4, root);
    at(box(1.4, 0.15, 1.4, 0x92400e), 0, 0.075, 0, fgp);
    const cartons = [];
    for (let i = 0; i < 8; i++) {
      const c = hasModel('cardboard_box_01')
        ? at(model('cardboard_box_01', { fit: [0.62, 0.45, 0.62] }), (i % 2 - 0.5) * 0.66, 0.155 + Math.floor(i / 4) * 0.47, ((i >> 1) % 2 - 0.5) * 0.66, fgp)
        : at(box(0.62, 0.45, 0.62, 0xc8a26b), (i % 2 - 0.5) * 0.66, 0.38 + Math.floor(i / 4) * 0.47, ((i >> 1) % 2 - 0.5) * 0.66, fgp);
      c.visible = false;
      cartons.push(c);
    }
    const kb = at(new THREE.Group(), 51.8, FLOOR, 8.6, root);
    at(cyl(0.07, 0.09, 1.2, 6, 0x475569), 0, 0.6, 0, kb);
    const kbPad = glowMat(C.production, 0.3);
    at(box(0.7, 0.5, 0.12, 0x111827), 0, 1.35, 0, kb);
    at(box(0.6, 0.06, 0.13, kbPad), 0, 1.13, 0, kb);
    const kcard = at(box(0.3, 0.42, 0.03, 0xfacc15), 0.6, 1.3, 0.3, kb);
    const kscr = new Screen(1.6, 0.95, 300, 178, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.production));
      txt(c, 'FG KANBAN · RFID', 14, 22, 15, '#86efac', 800);
      txt(c, 'Part FG-118 · Lot 2611-A', 14, 50, 13, '#94a3b8', 600);
      txt(c, nf(s.fg), 14, 100, 46, '#f8fafc', 800);
      txt(c, 'boxes packed today', 120, 106, 13, '#94a3b8', 600);
      c.fillStyle = s.sent ? '#16a34a' : '#334155'; rr(c, 14, 134, W - 28, 30, 8); c.fill();
      txt(c, s.sent ? 'KANBAN READ ✓ → WMS / MES' : 'Waiting for card…', W / 2, 149, 14, '#fff', 800, 'center');
    }, { fg: S.fg, sent: false });
    at(kscr.mesh, 0, 2.25, 0.05, kb);
    reg.add('rfid-kanban', kb, { zone: Z, label: [0, 3.2, 0] });
    let packCount = 0;
    const fgEvent = () => {
      const n = S.cartons % 8;
      if (n === 0) cartons.forEach((c) => (c.visible = false));
      cartons[n].visible = true;
      S.cartons++;
      gsap.timeline()
        .to(kcard.position, { x: 0, z: 0.1, duration: 0.5, ease: 'power2.out' })
        .call(() => {
          S.fg++;
          kscr.set({ fg: S.fg, sent: true });
          const p = kb.localToWorld(v3(0, 1.35, 0.1));
          waves.spawn(p, C.production, { normal: 'z', size: 1.6, dur: 0.9 });
          waves.spawn(p, C.production, { normal: 'z', size: 1.6, dur: 0.9, delay: 0.25 });
          gsap.fromTo(kbPad, { emissiveIntensity: 2.5 }, { emissiveIntensity: 0.3, duration: 1.2 });
          ctx.mesDirty();
        })
        .to(kcard.position, { x: 0.6, z: 0.3, duration: 0.6, delay: 0.6 })
        .call(() => kscr.set({ sent: false }), null, '+=1.5');
    };

    // Line item logic
    up.push((t, dt) => {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const o = it.o;
        if (it.divert) continue;
        o.position.x += V * dt;
        const x = o.position.x;
        if (it.kind === 'tote') {
          if (x > 3.3) { o.visible = false; items.splice(i, 1); }
          continue;
        }
        if (!it.flags.vision && x > 21.6) {
          it.flags.vision = true;
          const ng = Math.random() < 0.14;
          it.ng = ng;
          const col = ng ? 0xef4444 : 0x22c55e;
          o.userData.marker.material.color.set(col);
          o.userData.marker.visible = true;
          if (ng) S.ng++; else S.ok++;
          vs.set({ ok: S.ok, ng: S.ng, last: ng ? 'NG' : 'OK' });
          gsap.fromTo(ringM, { emissiveIntensity: 3 }, { emissiveIntensity: 0.4, duration: 0.5 });
          vbb.visible = true; vbb.material.color.set(col);
          gsap.delayedCall(0.7, () => (vbb.visible = false));
          ctx.mesDirty();
        }
        if (vbb.visible && it.flags.vision && !it.flags.vbbDone) { vbb.position.set(x, BELT_Y + 0.25, 4); if (x > 23) it.flags.vbbDone = true; }
        if (it.ng && x > 26.2) {
          it.divert = true;
          o.position.x = 26.2;
          gsap.timeline()
            .to(pusher.position, { z: 3.4, duration: 0.25 })
            .to(o.position, { z: 6.0, duration: 0.5, ease: 'power1.in' }, '<')
            .to(o.position, { y: FLOOR + 0.5, duration: 0.3 })
            .to(pusher.position, { z: 2.6, duration: 0.3 }, '<')
            .call(() => { o.visible = false; items.splice(items.indexOf(it), 1); });
          continue;
        }
        if (!it.ng && !it.flags.label && x > 30.6) {
          it.flags.label = true;
          gsap.timeline()
            .to(appl.position, { y: 1.0, duration: 0.15 })
            .call(() => { o.userData.label.visible = true; S.labels++; alScr.set({ n: S.labels }); alLed.emissiveIntensity = 2; })
            .to(appl.position, { y: 1.15, duration: 0.25 })
            .call(() => (alLed.emissiveIntensity = 0.4));
        }
        if (x > 46.4) {
          o.visible = false; items.splice(i, 1);
          if (++packCount % 3 === 0) fgEvent();
        }
      }
    });

    // MES dashboard floating above the line
    const mesG = at(new THREE.Group(), 24, FLOOR + 9.2, -2.5, root);
    mesG.rotation.x = -0.12;
    const hourly = Array.from({ length: 11 }, () => 0.55 + Math.random() * 0.4);
    let cur = 0.2;
    const mes = new Screen(10, 5.6, 1024, 574, (c, W, H, s) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(8,14,28,0.94)'; rr(c, 4, 4, W - 8, H - 8, 22); c.fill();
      c.strokeStyle = s.flash > 0 ? '#fbbf24' : '#22c55e'; c.lineWidth = 6; rr(c, 4, 4, W - 8, H - 8, 22); c.stroke();
      txt(c, 'MES  ·  LINE 01  ·  SHIFT A', 34, 46, 30, '#86efac', 800);
      txt(c, 'LIVE ●', W - 34, 46, 24, '#4ade80', 800, 'right');
      const yld = (S.ok / (S.ok + S.ng)) * 100;
      const tiles = [['OEE', '86.4%', '#f8fafc'], ['OUTPUT', nf(S.ok), '#4ade80'], ['NG', nf(S.ng), '#f87171'], ['YIELD', yld.toFixed(1) + '%', '#f8fafc'], ['FG BOXES', nf(S.fg), '#7dd3fc']];
      tiles.forEach(([k, v, col], i) => {
        const x = 34 + i * 194;
        c.fillStyle = '#111c33'; rr(c, x, 80, 180, 110, 14); c.fill();
        txt(c, k, x + 16, 108, 18, '#94a3b8', 700);
        txt(c, v, x + 16, 154, 40, col, 800);
      });
      // hourly output bars
      c.fillStyle = '#111c33'; rr(c, 34, 208, 600, 240, 14); c.fill();
      txt(c, 'Output / hour', 52, 234, 18, '#94a3b8', 700);
      const bars = [...hourly, s.cur];
      bars.forEach((v, i) => {
        const bh = v * 170, x = 56 + i * 47;
        c.fillStyle = i === bars.length - 1 ? '#4ade80' : '#22c55e88';
        c.fillRect(x, 430 - bh, 32, bh);
      });
      // station status
      c.fillStyle = '#111c33'; rr(c, 650, 208, 340, 240, 14); c.fill();
      txt(c, 'Stations', 668, 234, 18, '#94a3b8', 700);
      ['Press P-01', 'WI Station 02', 'AI Vision', 'Auto Label', 'FG Pack'].forEach((n, i) => {
        const on = (Math.floor(s.blink) + i) % 5 !== 0;
        c.fillStyle = on ? '#22c55e' : '#166534'; c.beginPath(); c.arc(680, 274 + i * 36, 9, 0, 7); c.fill();
        txt(c, n, 700, 274 + i * 36, 20, '#e2e8f0', 600);
        txt(c, 'RUN', 970, 274 + i * 36, 18, '#4ade80', 800, 'right');
      });
      // alert banner
      if (s.alert) {
        c.fillStyle = s.flash > 0 ? '#f59e0b' : '#b45309'; rr(c, 34, 466, W - 68, 80, 14); c.fill();
        txt(c, '⚠  LINE-SIDE B-220 LOW  →  Replenish order R-1043 sent to WMS + AMR', W / 2, 506, 26, '#111827', 800, 'center');
      } else {
        c.fillStyle = '#0f2a1a'; rr(c, 34, 466, W - 68, 80, 14); c.fill();
        txt(c, 'All systems connected · Data synced with ERP, WMS, CMMS', W / 2, 506, 24, '#86efac', 700, 'center');
      }
    }, { cur, blink: 0, alert: false, flash: 0 });
    mesG.add(mes.mesh);
    const frame = glowMat(0x22c55e, 1.2);
    at(box(10.2, 0.12, 0.12, frame), 0, -2.9, -0.05, mesG);
    at(pickProxy(10, 5.6, 0.4), 0, 0, 0, mesG);
    reg.add('mes-dashboard', mesG, { zone: Z, label: [0, 3.4, 0] });
    refs.mes = mes;
    refs.mesPos = v3(24, FLOOR + 6.4, -2.4);
    ctx.mesDirty = () => mes.set({});
    let acc = 0;
    up.push((t, dt) => {
      mesG.position.y = FLOOR + 9.2 + Math.sin(t * 0.8) * 0.18;
      acc += dt;
      if (acc > 0.5) {
        acc = 0;
        cur = Math.min(0.95, cur + 0.01);
        if (cur >= 0.95) { hourly.shift(); hourly.push(0.6 + Math.random() * 0.35); cur = 0.1; }
        mes.set({ cur, blink: t * 2, flash: Math.max(0, mes.state.flash - 1) });
      }
    });
    // Station → MES data uplinks
    for (const x of [5.5, 14, 22, 31, 51.8]) {
      const a = v3(x, FLOOR + 3, 4.2), bp = v3(24 + (x - 24) * 0.38, FLOOR + 6.4, -2.4);
      new Flow(root, arc(a, bp, 1.2), 0x4ade80, { count: 3, speed: 0.45, size: 0.14, tube: 0.025, lineOpacity: 0.18 });
    }

    // Network access point (production, plus others registered in infra)
    refs.beltY = BELT_Y;
  }

  /* ------------------------- ③b WAREHOUSE · WMS ------------------------- */
  {
    const Z = 'warehouse';
    const wms = at(new THREE.Group(), -53, FLOOR, 1.6, root);
    wms.rotation.y = 0.55;                                            // turned toward the warehouse camera
    // Supervisor workstation: desk, twin monitors, mini tower, operator
    at(box(2.6, 0.07, 1.15, 0x9aa5b1), 0, 0.78, 0, wms);
    for (const [dx, dz] of [[-1.22, -0.5], [1.22, -0.5], [-1.22, 0.5], [1.22, 0.5]]) at(box(0.07, 0.78, 0.07, 0x334155), dx, 0.39, dz, wms);
    at(box(0.45, 0.5, 0.5, 0x1f2937), 1.0, 0.25, -0.1, wms);
    const wmsDraw = (c, W, H, s) => {
      c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
      c.fillStyle = '#1d4ed8'; c.fillRect(0, 0, W, H * 0.16);
      txt(c, 'WMS · ' + (s.view || 'INVENTORY'), 10, H * 0.08, H * 0.09, '#fff', 800);
      const cols = 10, rows = 3, gx = 10, gy = H * 0.24, cw = (W - 20) / cols, ch = (H * 0.48) / rows;
      for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
        const v = (r * 7 + k * 3 + (s.tick || 0)) % 11;
        c.fillStyle = v < 2 ? '#334155' : v < 3 ? '#f59e0b' : '#22c55e';
        c.fillRect(gx + k * cw + 1.5, gy + r * ch + 1.5, cw - 3, ch - 3);
      }
      txt(c, `IN ${S.pallets}`, 10, H * 0.84, H * 0.1, '#7dd3fc', 800);
      txt(c, `OUT ${18 + ((s.tick || 0) % 9)}`, W / 2, H * 0.84, H * 0.1, '#86efac', 800, 'center');
      txt(c, '99.8%', W - 10, H * 0.84, H * 0.1, '#facc15', 800, 'right');
    };
    const mons = [];
    for (const dx of [-0.48, 0.48]) {
      at(box(0.1, 0.36, 0.1, 0x334155), dx, 0.98, -0.32, wms);
      at(box(0.86, 0.52, 0.04, 0x0f172a), dx, 1.3, -0.34, wms);
      const sc = new Screen(0.8, 0.46, 220, 126, wmsDraw, { view: dx < 0 ? 'INVENTORY' : 'TASKS', tick: 0 });
      at(sc.mesh, dx, 1.3, -0.317, wms);
      sc.mesh.rotation.y = dx < 0 ? 0.12 : -0.12;
      mons.push(sc);
    }
    const op = at(person(C.warehouse, { seated: true, helmet: false }), 0, 0, 0.85, wms);
    op.rotation.y = Math.PI;
    at(box(0.6, 0.45, 0.6, 0x1e293b), 0, 0.22, 0.9, wms);
    // Big floating WMS board: rack map, task queue and accuracy
    const board = new Screen(4.4, 2.4, 640, 350, (c, W, H, s) => {
      panelBg(c, W, H, hex(C.warehouse), 0.94);
      txt(c, 'WMS · Warehouse Management', 22, 34, 26, '#93c5fd', 800);
      txt(c, 'Live from RFID / RTLS / ESL', 22, 66, 17, '#94a3b8', 600);
      const cols = 12, gx = 22, gy = 92, cw = 30, ch = 24;
      ['A', 'B', 'C'].forEach((rw, r) => {
        txt(c, rw, gx, gy + r * (ch + 6) + ch / 2, 16, '#cbd5e1', 800);
        for (let k = 0; k < cols; k++) {
          const v = (r * 5 + k * 7 + s.tick) % 13;
          c.fillStyle = v < 2 ? '#334155' : v < 3 ? '#f59e0b' : '#22c55e';
          rr(c, gx + 20 + k * cw, gy + r * (ch + 6), cw - 5, ch, 4); c.fill();
        }
      });
      txt(c, 'Occupancy 87%', gx, 205, 17, '#cbd5e1', 700);
      const tasks = [[`PUTAWAY  PLT-${String(S.pallets).padStart(4, '0')} → A-0${(S.pallets % 9) + 1}-2`, '#7dd3fc'],
        [`PICK  ORD-${2400 + s.tick % 50} · 6 lines`, '#86efac'], [`REPLENISH  LINE-1 · ${S.line.low ? 'URGENT' : 'planned'}`, S.line.low ? '#fca5a5' : '#cbd5e1']];
      tasks.forEach(([t, col], i) => txt(c, t, gx, 240 + i * 28, 18, col, 700));
      txt(c, '99.8%', W - 26, 120, 52, '#f8fafc', 800, 'right');
      txt(c, 'stock accuracy', W - 26, 160, 16, '#94a3b8', 600, 'right');
      txt(c, `${S.pallets} in · ${18 + s.tick % 9} out`, W - 26, 200, 18, '#facc15', 700, 'right');
    }, { tick: 0 });
    board.mesh.material.transparent = true;
    at(board.mesh, 0, 4.4, -0.5, wms);
    board.mesh.rotation.x = -0.15;
    at(pickProxy(4.4, 2.4, 0.3), 0, 4.4, -0.5, wms);
    reg.add('wms', wms, { zone: Z, label: [0, 6.0, 0] });
    for (const tp of [v3(-55, FLOOR + 2.6, 15.2), v3(-53.8, FLOOR + 1.6, -6.4), v3(-40, FLOOR + 2, -6.4), v3(-40, FLOOR + 1, 3)])
      new Flow(root, arc(v3(-53, FLOOR + 4.4, 1.6), tp, 3.5), C.warehouse, { count: 3, speed: 0.25, size: 0.18, tube: 0.03, lineOpacity: 0.2 });
    let tick = 0;
    gsap.timeline({ repeat: -1 }).to({}, { duration: 1.6 }).call(() => { tick++; board.set({ tick }); for (const m of mons) m.set({ tick }); });
  }

  /* --------------------- ⑤b PROCESS CONTROL (PLC / SCADA) --------------------- */
  {
    const Z = 'production';
    const pc = at(new THREE.Group(), 24, FLOOR, 16.5, root);
    const STEEL = { roughness: 0.22, metalness: 0.85 };
    const b = new Batcher();
    // Concrete bund (spill containment) under the tanks
    at(box(14.5, 0.18, 6.2, 0x9ca3af, { roughness: 0.9, metalness: 0 }), -4, 0.09, 1.2, pc);
    const tanks = [];
    const names = [['T-101', 'DEGREASE', 55], ['T-102', 'PHOSPHATE', 48], ['T-103', 'RINSE', 32]];
    names.forEach(([tag, name, temp], i) => {
      const x = -9 + i * 3.6;
      const g = at(new THREE.Group(), x, 0.18, 1.6, pc);
      at(cyl(1.25, 1.25, 3.2, 28, 0xd4d8de, STEEL), 0, 2.0, 0, g);
      const dome = at(sphere(1.25, 0xd4d8de, 24), 0, 3.6, 0, g); dome.scale.y = 0.35; dome.material = mat(0xd4d8de, STEEL);
      at(cyl(1.0, 0.25, 0.45, 20, 0xd4d8de, STEEL), 0, 0.22, 0, g);   // cone bottom
      for (const [lx, lz] of [[-0.88, -0.88], [0.88, -0.88], [-0.88, 0.88], [0.88, 0.88]]) at(box(0.12, 0.6, 0.12, 0x64748b), lx, 0.3, lz, g);
      at(box(2.55, 0.08, 0.06, 0x0ea5e9), 0, 3.3, 1.22, g);             // colour band
      // Level sight glass with a glowing liquid column (animated)
      at(box(0.18, 2.5, 0.06, 0x334155), 0.75, 2.0, 1.02, g).rotation.y = 0.6;
      const liq = glowMat(i === 1 ? 0x22d3ee : 0x38bdf8, 0.9);
      const col = at(box(0.1, 2.3, 0.07, liq), 0.75, 0.85, 1.04, g); col.rotation.y = 0.6;
      col.geometry = col.geometry.clone(); col.geometry.translate(0, 1.15, 0);
      // Name plate
      const plate = new Screen(1.3, 0.5, 200, 76, (c, W, H) => {
        c.fillStyle = '#f8fafc'; c.fillRect(0, 0, W, H);
        txt(c, tag, W / 2, 22, 22, '#0f172a', 800, 'center'); txt(c, name, W / 2, 54, 18, '#0369a1', 800, 'center');
      });
      at(plate.mesh, 0, 2.5, 1.27, g);
      // Temperature transmitter
      at(cyl(0.12, 0.12, 0.2, 12, 0x1d4ed8), -0.7, 1.4, 1.08, g).rotation.x = Math.PI / 2;
      const tLed = glowMat(0x22c55e, 1.2);
      at(box(0.1, 0.06, 0.04, tLed), -0.7, 1.62, 1.12, g);
      // Ladder
      for (let y = 0.6; y < 3.6; y += 0.35) b.add(0.05, 0.04, 0.5, 0xfacc15, 24 + x + 1.34, FLOOR + 0.18 + y, 18.1);
      tanks.push({ g, col, tLed, temp, set: temp, level: 0.6 + i * 0.1 });
    });
    // Pipe header on a rack, drops into every tank, pumps and valves
    const pipe = (len, x, y, z, rot) => { const p = at(cyl(0.11, 0.11, len, 12, 0xb8c0ca, STEEL), x, y, z, pc); if (rot === 'x') p.rotation.z = Math.PI / 2; if (rot === 'z') p.rotation.x = Math.PI / 2; return p; };
    pipe(12.5, -3.2, 4.6, -1.1, 'x');
    pipe(12.5, -3.2, 4.3, -1.4, 'x');
    for (let i = 0; i < 3; i++) { const x = -9 + i * 3.6; pipe(0.9, x, 4.25, -0.75, 'z'); pipe(0.7, x, 4.05, -0.3); }
    for (const x of [-10.2, -6.6, -3.0, 0.6, 3.0]) { at(box(0.16, 4.7, 0.16, 0x2f5d8a), x, 2.35, -1.25, pc); }
    at(box(13.6, 0.14, 0.7, 0x2f5d8a), -3.6, 4.85, -1.25, pc);
    const valves = [];
    for (let i = 0; i < 3; i++) {
      const v = at(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 20), mat(0xdc2626)), -9 + i * 3.6 + 0.6, 4.6, -0.86, pc);
      valves.push(v);
    }
    const pumps = [];
    for (const px of [1.6, 3.2]) {
      const g = at(new THREE.Group(), px, 0.18, 2.6, pc);
      at(box(1.2, 0.12, 0.6, 0x475569), 0, 0.06, 0, g);
      at(cyl(0.22, 0.22, 0.6, 16, 0x1d4ed8), -0.25, 0.38, 0, g).rotation.z = Math.PI / 2;
      const fan = at(cyl(0.2, 0.2, 0.05, 6, 0x0f172a), -0.58, 0.38, 0, g); fan.rotation.z = Math.PI / 2;
      at(cyl(0.2, 0.24, 0.3, 16, 0x9ca3af, STEEL), 0.25, 0.38, 0, g);
      pipe(2.2, px + 0.25, 1.6, 2.6);
      pumps.push(fan);
    }
    pipe(4.6, 2.4, 2.7, 2.6, 'x');
    // PLC control cabinet with stack light
    const plc = at(new THREE.Group(), 5.6, 0, 1.6, pc);
    at(box(1.8, 2.1, 0.6, 0xd1d5db, { roughness: 0.45, metalness: 0.3 }), 0, 1.15, 0, plc);
    at(box(0.02, 1.9, 0.02, 0x6b7280), 0, 1.15, 0.31, plc);
    for (const dx of [-0.75, 0.75]) at(box(0.05, 0.25, 0.05, 0x111827), dx * 0.9, 1.2, 0.32, plc);
    at(box(1.9, 0.1, 0.1, 0x4b5563), 0, 0.05, 0, plc);
    const stack = { g: glowMat(0x22c55e, 1.5), a: glowMat(0xf59e0b, 0.08), r: glowMat(0xef4444, 0.08) };
    at(cyl(0.03, 0.03, 0.3, 8, 0x4b5563), 0.7, 2.35, 0, plc);
    [['g', 2.55], ['a', 2.72], ['r', 2.89]].forEach(([k, y]) => at(cyl(0.08, 0.08, 0.16, 14, stack[k]), 0.7, y, 0, plc));
    const plcScr = new Screen(0.5, 0.32, 140, 90, (c, W, H, s) => {
      c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
      txt(c, 'PLC RUN', 8, 16, 14, '#4ade80', 800);
      txt(c, s.alarm ? 'AUTO-CORRECT' : 'I/O OK', 8, 44, 13, s.alarm ? '#fbbf24' : '#cbd5e1', 700);
      txt(c, 'SCAN 10 ms', 8, 72, 12, '#94a3b8', 600);
    }, { alarm: false });
    at(plcScr.mesh, -0.45, 1.6, 0.31, plc);
    // Operator HMI panel on a pedestal
    const hmi = at(new THREE.Group(), 3.0, 0, 5.0, pc);
    at(box(0.4, 0.1, 0.4, 0x334155), 0, 0.05, 0, hmi);
    at(cyl(0.06, 0.06, 1.2, 10, 0x64748b), 0, 0.65, 0, hmi);
    const hp = at(box(1.0, 0.68, 0.1, 0x111827), 0, 1.45, 0, hmi); hp.rotation.x = -0.35;
    const trend = [];
    const hmiDraw = (c, W, H, s) => {
      c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
      c.fillStyle = s.alarm ? '#b45309' : '#15803d'; c.fillRect(0, 0, W, 26);
      txt(c, s.alarm ? '⚠ T-102 TEMP HIGH · auto-correcting' : 'PROCESS OK · all loops in spec', 10, 13, 15, '#fff', 800);
      tanks.forEach((t, i) => {
        const x = 14 + i * (W - 28) / 3, w = (W - 28) / 3 - 12;
        c.strokeStyle = '#475569'; c.lineWidth = 2; rr(c, x, 40, w, 92, 8); c.stroke();
        c.fillStyle = i === 1 && s.alarm ? '#f59e0b' : '#0ea5e9';
        const lh = 84 * t.level; rr(c, x + 4, 128 - lh, w - 8, lh, 5); c.fill();
        txt(c, names[i][0], x + w / 2, 148, 14, '#cbd5e1', 800, 'center');
        txt(c, `${t.temp.toFixed(1)}°C`, x + w / 2, 170, 19, i === 1 && s.alarm ? '#fbbf24' : '#f8fafc', 800, 'center');
      });
      c.strokeStyle = '#38bdf8'; c.lineWidth = 2.5; c.beginPath();
      trend.forEach((v, k) => { const x = 14 + k * (W - 28) / 59, y = H - 14 - (v - 40) * 3.2; k ? c.lineTo(x, y) : c.moveTo(x, y); });
      c.stroke();
      txt(c, 'T-102 trend', 14, 196, 12, '#94a3b8', 600);
    };
    const hs = new Screen(0.9, 0.58, 300, 290, hmiDraw, { alarm: false });
    at(hs.mesh, 0, 0, 0.051, hp);
    const tech = at(person(C.production), 0.15, 0, 0.75, hmi);
    tech.rotation.y = Math.PI;
    // Large SCADA board above the process
    const scada = new Screen(6.4, 3.2, 640, 320, (c, W, H, s) => { panelBg(c, W, H, hex(C.production), 0.94); c.save(); c.translate(10, 30); c.scale((W - 20) / 300, (H - 40) / 290); hmiDraw(c, 300, 290, s); c.restore(); txt(c, 'SCADA · Process Control', 18, 18, 18, '#86efac', 800); }, { alarm: false });
    scada.mesh.material.transparent = true;
    at(scada.mesh, -3.4, 7.6, -0.6, pc);
    scada.mesh.rotation.x = -0.12;
    at(pickProxy(6.4, 3.2, 0.3), -3.4, 7.6, -0.6, pc);
    b.build(root);
    reg.add('process-control', pc, { zone: Z, label: [5.6, 3.6, 1.6] });
    // Data: tank sensors → PLC → MES
    const plcW = v3(24 + 5.6, FLOOR + 2.4, 16.5 + 1.6);
    for (let i = 0; i < 3; i++) new Flow(root, arc(v3(24 - 9 + i * 3.6 - 0.7, FLOOR + 1.9, 16.5 + 2.7), plcW, 2.5), C.production, { count: 2, speed: 0.4, size: 0.14, tube: 0.025, lineOpacity: 0.2 });
    new Flow(root, arc(plcW, v3(24, FLOOR + 9.2, -2.5), 4), C.production, { count: 4, speed: 0.25, size: 0.2, tube: 0.035, lineOpacity: 0.22 });
    // Live values + a recurring "temperature drift → PLC corrects it" story
    let tAcc = 0;
    up.push((t, dt) => {
      for (const [i, tk] of tanks.entries()) {
        tk.temp += (tk.set - tk.temp) * Math.min(1, dt * 0.6) + Math.sin(t * 0.7 + i) * 0.01;
        tk.level = 0.62 + i * 0.08 + Math.sin(t * 0.25 + i * 2) * 0.08;
        tk.col.scale.y = tk.level;
      }
      for (const f of pumps) f.rotation.x += dt * 14;
      tAcc += dt;
      if (tAcc > 0.5) { tAcc = 0; trend.push(tanks[1].temp); if (trend.length > 60) trend.shift(); }
    });
    const setAlarm = (on) => {
      for (const sc of [hs, scada, plcScr]) sc.set({ alarm: on });
      stack.g.emissiveIntensity = on ? 0.08 : 1.5; stack.a.emissiveIntensity = on ? 2 : 0.08;
      tanks[1].tLed.color.set(on ? 0xf59e0b : 0x22c55e); tanks[1].tLed.emissive.set(on ? 0xf59e0b : 0x22c55e);
    };
    gsap.timeline({ repeat: -1, repeatDelay: 4 })
      .call(() => { tanks[1].set = 58; })
      .to({}, { duration: 4 })
      .call(() => { setAlarm(true); const p = tanks[1].g.getWorldPosition(new THREE.Vector3()); p.y += 2; for (let k = 0; k < 3; k++) waves.spawn(p, 0xf59e0b, { normal: 'z', size: 2.6, dur: 1, delay: k * 0.25 }); })
      .to({}, { duration: 1.2 })
      .call(() => { tanks[1].set = 48; waves.spawn(plcW, C.production, { normal: 'y', size: 2, dur: 0.9 }); })
      .to(valves[1].rotation, { z: '+=' + Math.PI * 4, duration: 2.4, ease: 'power1.inOut' })
      .to({}, { duration: 4 })
      .call(() => setAlarm(false))
      .to({}, { duration: 6 });
    for (let i = 0; i < 60; i++) trend.push(48);
  }

  /* ------------------ ⑤c PRODUCTION · machining cell (scenery) ------------------ */
  {
    const b = new Batcher();
    [34, 40.5, 47].forEach((x, i) => {
      const g = at(new THREE.Group(), x, FLOOR, -15, root);
      at(box(4.2, 2.7, 2.6, 0xe5e7eb, { roughness: 0.4, metalness: 0.25 }), 0, 1.45, 0, g);  // enclosure
      at(box(4.24, 0.3, 2.64, 0x1e3a8a), 0, 0.15, 0, g);                                      // base band
      at(box(1.9, 1.3, 0.04, basic(0x1e293b, { transparent: true, opacity: 0.7 })), -0.4, 1.7, 1.31, g); // door window
      at(box(0.06, 1.0, 0.06, 0x6b7280), 0.62, 1.6, 1.34, g);                                  // door handle
      at(box(0.7, 1.0, 0.25, 0x111827), 1.65, 1.6, 1.35, g);                                   // control pendant
      const sc = new Screen(0.55, 0.4, 120, 88, (c, W, H, s) => {
        c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
        txt(c, `CNC-0${i + 1}`, 8, 16, 15, '#93c5fd', 800);
        txt(c, i === 2 ? 'SETUP' : 'RUN', 8, 46, 22, i === 2 ? '#fbbf24' : '#4ade80', 800);
        txt(c, `${(s.n || 0) + 120 + i * 37} pcs`, 8, 74, 14, '#cbd5e1', 600);
      }, { n: 0 });
      at(sc.mesh, 1.65, 1.75, 1.48, g);
      [[0x22c55e, i === 2 ? 0.1 : 1.6], [0xf59e0b, i === 2 ? 1.6 : 0.1]].forEach(([c0, e], k) => at(cyl(0.07, 0.07, 0.14, 12, glowMat(c0, e)), 2.0, 2.95 + k * 0.15, 0.8, g));
      at(box(1.2, 0.5, 1.8, 0x374151), -2.7, 0.25, 0.2, g);                                  // chip conveyor / coolant tank
      const w = at(person(C.production), 0.6, 0, 2.2, g); w.rotation.y = Math.PI;
      if (i === 2) w.visible = false;
      gsap.timeline({ repeat: -1 }).to({}, { duration: 3 + i }).call(() => sc.set({ n: (sc.state.n || 0) + 1 }));
      // parts bins beside each machine
      b.add(1.0, 0.6, 0.8, 0x2563eb, x + 2.9, FLOOR + 0.3, -13.6);
      b.add(1.0, 0.12, 0.8, 0x92400e, x + 2.9, FLOOR + 0.06, -13.6);
    });
    // Walkway markings in front of the cell
    for (const z of [-12.3, -11.1]) b.add(20, 0.012, 0.1, 0xfacc15, 40.5, FLOOR + 0.006, z);
    b.build(root);
  }

  /* ------------------ ⑥b OFFICE + ⑦b SERVER ROOM · scenery ------------------ */
  {
    const b = new Batcher();
    // Meeting room at the east end of the office: table, chairs, wall display
    b.add(4.4, 0.08, 1.8, 0x8b6b4a, 0, FLOOR + 0.76, -36);
    for (const dx of [-1.9, 1.9]) b.add(0.12, 0.74, 1.4, 0x475569, dx, FLOOR + 0.37, -36);
    for (const dx of [-1.5, -0.5, 0.5, 1.5]) for (const dz of [-1.3, 1.3]) { b.add(0.5, 0.08, 0.5, 0x1e293b, dx, FLOOR + 0.46, -36 + dz); b.add(0.5, 0.5, 0.08, 0x1e293b, dx, FLOOR + 0.75, -36 + dz * 1.2); }
    b.add(3.4, 0.08, 0.08, 0x334155, 0, FLOOR + 0.9, -40.2);
    b.add(0.12, 1.6, 0.12, 0x334155, 0, FLOOR + 0.8, -40.3);
    const tv = new Screen(3.0, 1.7, 400, 226, (c, W, H) => {
      c.fillStyle = '#0b1324'; c.fillRect(0, 0, W, H);
      txt(c, 'Daily Tier Meeting', 16, 24, 22, '#f9a8d4', 800);
      [['OEE', '86%', '#4ade80'], ['Quality', '99.2%', '#4ade80'], ['Delivery', '100%', '#4ade80'], ['Safety', '0 LTI', '#93c5fd']].forEach(([k, v, col], i) => {
        const x = 16 + (i % 2) * 190, y = 70 + Math.floor(i / 2) * 76;
        txt(c, k, x, y, 16, '#94a3b8', 700); txt(c, v, x, y + 32, 32, col, 800);
      });
    });
    at(tv.mesh, 0, FLOOR + 1.9, -40.25, root);
    // Glass partition around the meeting room
    const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.16, roughness: 0.05, depthWrite: false });
    at(new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.6, 13), glass), -4.6, FLOOR + 1.3, -37.5, root);
    for (let z = -44; z <= -31; z += 2.6) b.add(0.08, 2.6, 0.08, 0x64748b, -4.6, FLOOR + 1.3, z);
    // Open-plan desk rows between the system desks
    for (const cx of [-41, -23]) for (const dx of [-1.6, 0, 1.6]) {
      b.add(1.5, 0.06, 1.0, 0xe7e5e4, cx + dx, FLOOR + 0.74, -30);
      b.add(0.06, 0.72, 0.9, 0x64748b, cx + dx - 0.7, FLOOR + 0.36, -30);
      b.add(0.62, 0.4, 0.04, 0x0f172a, cx + dx, FLOOR + 1.05, -30.4);
      b.add(0.56, 0.34, 0.01, 0x1e40af, cx + dx, FLOOR + 1.05, -30.375);
      if (dx !== 1.6) { const w = at(person(0xec4899, { seated: true, helmet: false }), cx + dx, FLOOR, -29.2, root); w.rotation.y = Math.PI; }
    }
    // Plants
    const leaf = mat(0x2e7d32, { roughness: 0.8, metalness: 0 });
    for (const [x, z] of [[-60, -28.5], [-44, -43.5], [-26, -43.5], [-6, -28.5], [6, -43.5]]) {
      at(cyl(0.3, 0.24, 0.5, 12, 0xf5f5f4), x, FLOOR + 0.25, z, root);
      at(sphere(0.55, leaf, 10), x, FLOOR + 1.0, z, root).scale.y = 1.3;
    }
    // Server room: second rack row, UPS, precision cooling, NOC desk, fire suppression
    for (let r = 0; r < 4; r++) {
      b.add(1.0, 2.3, 1.1, 0x0b1220, 39 + r * 1.1, FLOOR + 1.15, -40);
      b.add(0.9, 0.04, 0.02, 0x14b8a6, 39 + r * 1.1, FLOOR + 2.2, -39.44);
      for (let k = 0; k < 6; k++) b.add(0.8, 0.03, 0.02, k % 3 ? 0x22c55e : 0x2dd4bf, 39 + r * 1.1, FLOOR + 0.5 + k * 0.3, -39.44);
    }
    for (let r = 0; r < 2; r++) { b.add(0.9, 2.0, 0.9, 0xe2e8f0, 24 + r, FLOOR + 1.0, -36); b.add(0.4, 0.25, 0.02, 0x0f172a, 24 + r, FLOOR + 1.5, -35.54); }
    b.add(2.0, 2.2, 0.9, 0xf1f5f9, 17, FLOOR + 1.1, -43.5);
    for (let k = 0; k < 8; k++) b.add(1.8, 0.04, 0.02, 0x94a3b8, 17, FLOOR + 0.4 + k * 0.22, -43.03);
    for (let k = 0; k < 3; k++) { b.add(0.35, 1.5, 0.35, 0xdc2626, 57 + k * 0.5, FLOOR + 0.75, -44.5); }
    b.add(3.0, 0.07, 1.1, 0x9aa5b1, 50, FLOOR + 0.76, -33);
    for (const dx of [-1.4, 1.4]) b.add(0.08, 0.76, 1.0, 0x334155, 50 + dx, FLOOR + 0.38, -33);
    const noc = new Screen(2.4, 0.5, 480, 100, (c, W, H) => {
      c.fillStyle = '#04141a'; c.fillRect(0, 0, W, H);
      ['GATE', 'DOCK', 'WH', 'LINE', 'OFFICE'].forEach((n, i) => { c.fillStyle = '#14b8a6'; rr(c, 10 + i * 94, 18, 84, 64, 8); c.fill(); txt(c, n, 52 + i * 94, 50, 16, '#04141a', 800, 'center'); });
    });
    at(noc.mesh, 50, FLOOR + 1.25, -33.5, root);
    b.add(2.5, 0.6, 0.06, 0x0f172a, 50, FLOOR + 1.25, -33.54);
    const nocOp = at(person(C.infra, { seated: true, helmet: false }), 50, FLOOR, -32.3, root);
    nocOp.rotation.y = Math.PI;
    b.build(root);
  }

  /* ----------------------------- ⑥ OFFICE ----------------------------- */
  {
    const Z = 'office';
    const desk = (x, z, id, drawFn, targetPts) => {
      const g = at(new THREE.Group(), x, FLOOR, z, root);
      if (hasModel('metal_office_desk')) at(model('metal_office_desk', { fit: [2.6, 0.8, 1.3] }), 0, 0, 0, g);
      else {
        at(box(2.6, 0.08, 1.3, 0xcbd5e1), 0, 0.78, 0, g);
        for (const [dx, dz] of [[-1.2, -0.55], [1.2, -0.55], [-1.2, 0.55], [1.2, 0.55]]) at(box(0.07, 0.78, 0.07, 0x475569), dx, 0.39, dz, g);
      }
      at(box(1.6, 1.0, 0.06, 0x0f172a), 0, 1.45, -0.35, g);
      at(box(0.1, 0.4, 0.1, 0x334155), 0, 1.0, -0.4, g);
      const small = new Screen(1.5, 0.9, 300, 180, drawFn, { mini: true, i: 0 });
      at(small.mesh, 0, 1.45, -0.315, g);
      const seat = at(person(0xec4899, { seated: true, helmet: false }), 0, 0, 0.95, g);
      seat.rotation.y = Math.PI;
      at(box(0.6, 0.45, 0.6, 0x1e293b), 0, 0.22, 1.0, g);
      // Floating holo card (big readable version)
      const holo = new Screen(3.6, 2.0, 600, 334, drawFn, { i: 0 });
      holo.mesh.material.transparent = true;
      at(holo.mesh, 0, 4.2, -0.4, g);
      holo.mesh.rotation.x = -0.18;
      at(pickProxy(3.6, 2.0, 0.3), 0, 4.2, -0.4, g);
      reg.add(id, g, { zone: Z, label: [0, 5.7, 0] });
      for (const tp of targetPts) new Flow(root, arc(v3(x, FLOOR + 4.2, z), tp, 9), C.office, { count: 4, speed: 0.22, size: 0.22, tube: 0.04, lineOpacity: 0.22 });
      return [small, holo];
    };
    const office = (c, W, H, title) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(15,10,30,0.93)'; rr(c, 3, 3, W - 6, H - 6, 18); c.fill();
      c.strokeStyle = hex(C.office); c.lineWidth = 5; rr(c, 3, 3, W - 6, H - 6, 18); c.stroke();
      txt(c, title, 26, 36, 26, '#f9a8d4', 800);
      return W / 600;
    };
    const st = (c, x, y, w, label, on, done) => {
      c.fillStyle = done ? '#16a34a' : on ? '#db2777' : '#1e293b'; rr(c, x, y, w, 46, 10); c.fill();
      txt(c, label, x + w / 2, y + 23, 18, '#fff', 700, 'center');
    };
    const cmmsSteps = ['OPEN', 'ASSIGNED', 'IN PROGRESS', 'DONE'];
    const cm = desk(-50, -36, 'cmms', (c, W, H, s) => {
      c.save(); const k = W / 600; c.scale(k, k);
      office(c, 600, 334, 'CMMS · Maintenance');
      txt(c, 'WO-2291  Press P-01 · Preventive', 26, 82, 20, '#f8fafc', 700);
      cmmsSteps.forEach((n, i) => st(c, 26 + i * 140, 110, 128, n, i === s.i, i < s.i));
      txt(c, 'MTBF', 26, 200, 18, '#94a3b8'); txt(c, '412 h', 26, 236, 32, '#f8fafc', 800);
      txt(c, 'PM compliance', 230, 200, 18, '#94a3b8'); txt(c, '98%', 230, 236, 32, '#4ade80', 800);
      txt(c, 'Spare parts', 430, 200, 18, '#94a3b8'); txt(c, 'OK', 430, 236, 32, '#4ade80', 800);
      txt(c, '→ Work order pushed to line tablet', 26, 290, 18, '#f9a8d4', 600);
      c.restore();
    }, [v3(5.5, FLOOR + 5.4, 4)]);
    const prSteps = ['PR-0457', 'APPROVED', 'PO-8812', 'SENT'];
    const pp = desk(-32, -36, 'paperless-pr-po', (c, W, H, s) => {
      c.save(); const k = W / 600; c.scale(k, k);
      office(c, 600, 334, 'Paperless PR → PO');
      txt(c, 'Line-side parts B-220 × 500 pcs', 26, 82, 20, '#f8fafc', 700);
      prSteps.forEach((n, i) => st(c, 26 + i * 140, 110, 128, n, i === s.i, i < s.i));
      txt(c, 'Approver', 26, 200, 18, '#94a3b8'); txt(c, 'Manager ✓ (mobile)', 26, 234, 24, '#f8fafc', 700);
      txt(c, 'Lead time', 330, 200, 18, '#94a3b8'); txt(c, '2 h  (was 3 days)', 330, 234, 24, '#4ade80', 700);
      txt(c, '→ PO status visible to warehouse & line', 26, 290, 18, '#f9a8d4', 600);
      c.restore();
    }, [v3(16, FLOOR + 2.6, -15), v3(-40, FLOOR + 3.6, 12)]);
    const hr = desk(-14, -36, 'hr-system', (c, W, H, s) => {
      c.save(); const k = W / 600; c.scale(k, k);
      office(c, 600, 334, 'Skill Management');
      txt(c, 'Skill matrix · Line 01 · Shift A', 26, 76, 18, '#f8fafc', 700);
      // Mini skill matrix: 5 operators × 4 stations, colour = skill level
      const LV = ['#22c55e', '#3b82f6', '#facc15', '#334155'];
      ['ST-01', 'ST-02', 'ST-03', 'ST-04'].forEach((n, j) => txt(c, n, 132 + j * 64, 104, 13, '#94a3b8', 700, 'center'));
      for (let r = 0; r < 5; r++) {
        txt(c, 'OP-' + (r + 1), 26, 130 + r * 22, 13, '#cbd5e1', 600);
        for (let j = 0; j < 4; j++) { c.fillStyle = LV[(r * 3 + j * 2 + (r === s.i ? 1 : 0)) % 4]; rr(c, 106 + j * 64, 120 + r * 22, 52, 16, 4); c.fill(); }
      }
      txt(c, 'ST-02 → certified operator ✓', 380, 150, 18, '#4ade80', 700);
      txt(c, 'Cross-training: 3 due', 380, 182, 16, '#facc15', 600);
      txt(c, '→ Assignment synced to Digital WI', 26, 290, 18, '#f9a8d4', 600);
      c.restore();
    }, [v3(14, FLOOR + 2.4, 5.7)]);
    gsap.timeline({ repeat: -1 }).to({}, { duration: 2.2 }).call(() => {
      for (const s of [...cm, ...pp]) s.set({ i: (s.state.i + 1) % 4 });
      for (const s of hr) s.set({ i: (s.state.i + 1) % 5 });
    });
    // Decor: meeting table + plants
    at(box(4, 0.1, 2, 0xe2e8f0), -2, FLOOR + 0.75, -36, root);
    at(box(0.3, 0.7, 0.3, 0x475569), -2, FLOOR + 0.35, -36, root);
    for (const [x, z] of [[-60, -29], [-60, -42], [6, -29], [6, -42]]) {
      const pl = model(x < 0 ? 'potted_plant_01' : 'potted_plant_02', { height: 1.4 });
      if (pl) at(pl, x, FLOOR, z, root);
      else {
        at(cyl(0.3, 0.25, 0.5, 6, 0x78350f), x, FLOOR + 0.25, z, root);
        at(new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 6), mat(0x15803d)), x, FLOOR + 1.2, z, root);
      }
    }
  }

  /* -------------------------- ⑦ INFRASTRUCTURE -------------------------- */
  {
    const Z = 'infra';
    const rk = at(new THREE.Group(), 30, FLOOR, -36, root);
    const ledCount = 3 * 30;
    const leds = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.05, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), ledCount);
    const m4 = new THREE.Matrix4();
    const ledCols = [new THREE.Color(0x22c55e), new THREE.Color(0x2dd4bf), new THREE.Color(0xf59e0b), new THREE.Color(0x0b1220)];
    let li = 0;
    // Three racks: Sketchfab model (racks stand along its X, fronts face +X → turn to face +Z), else boxes
    const racks = model('network_racks', { fit: [1.1, 2.4, 3.4] });
    if (racks) { racks.rotation.y = -Math.PI / 2; rk.add(racks); }
    for (let r = 0; r < 3; r++) {
      const x = (r - 1) * 1.15;
      if (!racks) at(box(1.0, 2.4, 1.1, 0x0b1220), x, 1.2, 0, rk);
      if (racks) at(box(1.0, 0.025, 0.04, glowMat(C.infra, 0.8)), x, 2.3, 0.56, rk); // thin status strip on the front
      else at(box(1.02, 0.08, 1.12, glowMat(C.infra, 0.8)), x, 2.42, 0, rk);
      for (let k = 0; k < 30; k++) {
        m4.makeTranslation(x - 0.36 + (k % 6) * 0.14, 0.4 + Math.floor(k / 6) * 0.38, 0.56);
        leds.setMatrixAt(li, m4); leds.setColorAt(li, ledCols[k % 4]); li++;
      }
    }
    rk.add(leds);
    at(box(3.6, 0.14, 0.5, 0x334155), 0, 2.9, 0, rk);
    const nh = new Screen(3.4, 1.7, 560, 280, (c, W, H, s) => {
      c.clearRect(0, 0, W, H);
      c.fillStyle = 'rgba(4,20,24,.93)'; rr(c, 3, 3, W - 6, H - 6, 18); c.fill();
      c.strokeStyle = hex(C.infra); c.lineWidth = 5; rr(c, 3, 3, W - 6, H - 6, 18); c.stroke();
      txt(c, 'CORE NETWORK', 24, 36, 26, '#5eead4', 800);
      txt(c, '10G fiber backbone · 7 zones', 24, 76, 20, '#cbd5e1', 600);
      txt(c, `${(s.t % 3 + 7.1).toFixed(1)} Gbps`, 24, 136, 46, '#f8fafc', 800);
      txt(c, 'Uptime 99.99%', 24, 196, 22, '#4ade80', 700);
      ['GATE', 'DOCK', 'WH', 'AMR', 'LINE', 'OFFICE', 'SRV'].forEach((n, i) => {
        c.fillStyle = '#14b8a6'; rr(c, 24 + i * 74, 222, 66, 34, 8); c.fill();
        txt(c, n, 57 + i * 74, 239, 14, '#042f2e', 800, 'center');
      });
    }, { t: 0 });
    nh.mesh.material.transparent = true;
    at(nh.mesh, 0, 4.6, 0, rk);
    at(pickProxy(3.4, 1.7, 0.3), 0, 4.6, 0, rk);
    reg.add('network-rack', rk, { zone: Z, label: [0, 6.0, 0] });
    let la = 0;
    up.push((t, dt) => {
      la += dt;
      if (la < 0.12) return;
      la = 0;
      for (let k = 0; k < 14; k++) leds.setColorAt((Math.random() * ledCount) | 0, ledCols[(Math.random() * 4) | 0]);
      leds.instanceColor.needsUpdate = true;
      nh.set({ t: t * 0.3 });
    });

    // Fiber backbone (under floor; visible in X-ray mode)
    const fiber = new THREE.Group();
    root.add(fiber);
    fiber.visible = false;
    const Y = 0.17;
    const core = [31, Y, -34.4];
    const routes = {
      production: [core, [31, Y, -24.6], [24, Y, -24.6], [24, Y, 2]],
      office: [core, [12, Y, -34.4], [-28, Y, -34.4]],
      amr: [core, [31, Y, -24.6], [-13, Y, -24.6], [-13, Y, 1]],
      warehouse: [core, [31, Y, -24.6], [-21, Y, -24.6], [-21, Y, -10], [-42, Y, -10]],
      dock: [core, [31, Y, -24.6], [-21, Y, -24.6], [-21, Y, 16], [-44, Y, 16]],
      gate: [core, [31, Y, -24.6], [-21, Y, -24.6], [-21, Y, 9], [-21, Y, 39.8], [-44, Y, 39.8], [-44, Y, 46]],
    };
    const fmat = new THREE.MeshBasicMaterial({ color: 0x2dd4bf, toneMapped: false });
    const hubs = [];
    for (const [k, pts] of Object.entries(routes)) {
      const cv = pathCurve(pts, 1.2);
      fiber.add(new THREE.Mesh(new THREE.TubeGeometry(cv, Math.max(40, pts.length * 30), 0.13, 5, false), fmat));
      const f = new Flow(fiber, cv, 0xccfbf1, { count: 8, speed: 0.07, size: 0.26, tube: 0 });
      const end = pts[pts.length - 1];
      hubs.push(end);
      at(box(0.9, 0.5, 0.6, glowMat(C.infra, 1.2)), end[0], FLOOR + 0.25, end[2], fiber);
    }
    // LAN branches from each hub (amber)
    const lanTargets = {
      production: [[5.5, 4], [22, 4], [31, 2.3], [51.8, 8.6], [16, -15]],
      office: [[-50, -36], [-14, -36]],
      amr: [[-12.5, -20.2], [-4.7, 4]],
      warehouse: [[-24.6, 4.6], [-50, -6.4], [-38, -6.4]],
      dock: [[-40, 9], [-55, 15.2], [-44.2, 10.6]],
      gate: [[-46.6, 43], [-44.4, 50.4]],
    };
    const lmat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, toneMapped: false });
    Object.entries(lanTargets).forEach(([k, ts], i) => {
      const h = hubs[Object.keys(routes).indexOf(k)];
      for (const [x, z] of ts) {
        const cv = pathCurve([[h[0], Y + 0.03, h[2]], [x, Y + 0.03, h[2]], [x, Y + 0.03, z]], 0.8);
        fiber.add(new THREE.Mesh(new THREE.TubeGeometry(cv, 30, 0.07, 4, false), lmat));
        new Flow(fiber, cv, 0xfef3c7, { count: 2, speed: 0.3, size: 0.16, tube: 0 });
      }
    });
    reg.add('fiber-backbone', fiber, { zone: Z, label: [-21, 2.0, 0] });
    ctx.fiber = fiber;

    // Wi-Fi / LAN access points on poles
    [[36, 12.5], [-27.5, -2], [-60, 22], [-40, -31], [-6, 22]].forEach(([x, z], i) => {
      const g = at(new THREE.Group(), x, FLOOR, z, root);
      at(cyl(0.07, 0.09, 5.4, 6, 0x64748b), 0, 2.7, 0, g);
      at(cyl(0.45, 0.5, 0.14, 12, 0xf8fafc), 0, 5.45, 0, g);
      const l = glowMat(C.infra, 1.6);
      at(cyl(0.2, 0.2, 0.03, 12, l), 0, 5.37, 0, g);
      reg.add('lan-access', g, { zone: Z, label: [0, 6.4, 0], primary: i === 0 });
      gsap.timeline({ repeat: -1, delay: i * 0.7 }).call(() => waves.spawn(v3(x, FLOOR + 5.4, z), C.infra, { normal: 'y', size: 4.5, dur: 1.5 })).to({}, { duration: 3.2 });
    });
  }

  /* ===================== ⑧ HIGHLIGHT EVENT CHAIN ===================== */
  {
    const A = refs.amrA, curve = refs.amrACurve;
    const esl = refs.lineEsl, mes = refs.mes, ptl = refs.ptl, picker = refs.picker;
    const K = 4; // PTL module index used for replenishment
    const ptlPos = ptl.list[K].g.getWorldPosition(new THREE.Vector3());
    const ao = { u: 0 };
    const step = (i) => { S.step = i; ctx.onChainStep && ctx.onChainStep(i); };
    const q = { v: 12 };
    ctx.chain = gsap.timeline({ repeat: -1, repeatDelay: 2, delay: 1 })
      .call(() => { step(0); q.v = 12; esl.set({ qty: 12, low: false }); })
      .to(q, { v: 3, duration: 2.6, ease: 'steps(9)', onUpdate: () => esl.set({ qty: q.v, low: q.v < 10 }) })
      .call(() => { waves.spawn(refs.lineEslPos, 0xef4444, { normal: 'z', size: 1.8 }); waves.spawn(refs.lineEslPos, 0xef4444, { normal: 'z', size: 1.8, delay: 0.3 }); })
      .call(() => { step(1); sendPacket(root, arc(refs.lineEslPos, refs.mesPos, 3), 0xef4444, 1.2); }, null, '+=0.4')
      .call(() => { mes.set({ alert: true, flash: 6 }); }, null, '+=1.2')
      .call(() => { step(2); S.chainPTL = true; sendPacket(root, arc(refs.mesPos, ptlPos, 8), 0xfbbf24, 1.6); }, null, '+=0.8')
      .call(() => { ptl.light(K, 4, 0x22c55e); gsap.to(picker.position, { x: ptl.list[K].x, duration: 0.9 }); }, null, '+=1.6')
      .call(() => { ptl.off(K); A.tote.visible = true; step(3); waves.spawn(A.g.position.clone().setY(FLOOR + 1), C.amr, { normal: 'y', size: 2 }); }, null, '+=1.8')
      .to(ao, { u: 1, duration: 8, ease: 'power1.inOut', onUpdate: () => placeOn(A.g, curve, ao.u) })
      .call(() => { A.tote.visible = false; S.chainPTL = false; step(4); waves.spawn(refs.lineEslPos, 0x22c55e, { normal: 'z', size: 1.8 }); })
      .to(q, { v: 15, duration: 0.8, ease: 'steps(12)', onUpdate: () => esl.set({ qty: q.v, low: q.v < 10 }) }, '<')
      .call(() => mes.set({ alert: false }))
      .to({}, { duration: 1.4 })
      .to(ao, { u: 0, duration: 6.5, ease: 'power1.inOut', onUpdate: () => placeOn(A.g, curve, ao.u, true) });
  }
}
