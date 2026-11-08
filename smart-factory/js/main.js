// App bootstrap: renderer, camera, interaction, scenes, UI and i18n.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { gsap, ZONES, hex, screens, flows, WavePool } from './core.js';
import { buildWorld } from './world.js';
import { buildDevices, Registry, visibleChain } from './devices.js';
import { SCENES } from './scenes.js';
import { loadModels } from './models.js';
import { buildProps } from './props.js';

const $ = (s) => document.querySelector(s);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

// Single-file build embeds the content as window.__SF_CONTENT; otherwise load content.json.
const content = window.__SF_CONTENT || await fetch('content.json').then((r) => r.json());
let lang = store.get('sf-lang') || content.meta.defaultLang || 'en';

/* ---------------- renderer / scene ---------------- */
const stage = $('#stage');
const coarse = matchMedia('(pointer: coarse)').matches;
const small = Math.min(innerWidth, innerHeight) < 700;
let pixelRatio = Math.min(devicePixelRatio || 1, coarse || small ? 1.6 : 2);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 180, 460);
// Image-based lighting: a procedural studio room gives metals and plastics realistic reflections.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
scene.environmentIntensity = 0.4;

const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
camera.position.set(110, 100, 140);

scene.add(new THREE.HemisphereLight(0xdbe7ff, 0x1a1f2b, 0.35));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(45, 90, 40);
sun.castShadow = true;
const SH = coarse || small ? 2048 : 4096;
sun.shadow.mapSize.set(SH, SH);
sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 70, bottom: -70, near: 10, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun);
const fill = new THREE.DirectionalLight(0x93c5fd, 0.35);
fill.position.set(-60, 40, -50);
scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = 1.32;
controls.minDistance = 6;
controls.maxDistance = 280;
controls.autoRotateSpeed = 0.55;
controls.screenSpacePanning = false;

// Post-processing: soft bloom on emissive parts (screens, status lights, RF waves).
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.4, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
let bloomOn = !(coarse && small);

/* ---------------- build factory ---------------- */
const root = new THREE.Group();
scene.add(root);
const ctx = { scene, root, camera, updaters: [], reg: new Registry() };
ctx.waves = new WavePool(root, 48);
const loadTxt = document.querySelector('#loading span');
await loadModels((p) => { if (loadTxt) loadTxt.textContent = `Loading factory… ${Math.round(p * 100)}%`; });
const world = buildWorld(ctx);
ctx.updaters.push(...world.updaters);
buildDevices(ctx);
buildProps(root);
const reg = ctx.reg;

/* ---------------- i18n ---------------- */
const T = (k) => content.ui[lang]?.[k] ?? content.ui.en[k] ?? k;
const dev = (id) => content.devices[id] || {};
const devText = (id) => dev(id)[lang] || dev(id).en || { name: id };
const sceneText = (id) => content.scenes[id]?.[lang] || content.scenes[id]?.en || { title: id, caption: '' };

function applyLang() {
  document.documentElement.lang = lang;
  document.title = content.meta.title[lang] || content.meta.title.en;
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
  $('#langBtn .v').textContent = lang === 'en' ? 'TH' : 'EN';
  for (const [id, it] of reg.items) if (it.label) it.label.element.textContent = devText(id).name;
  for (const [id, s] of Object.entries(world.zoneLabels)) s.set({ text: content.zones[id]?.[lang] || id });
  buildSidebar();
  renderCaption();
  if (modalId) openModal(modalId);
  updateButtons();
}

/* ---------------- scene state ---------------- */
let current = 0;
let playing = false;
let sceneTime = 0;
let showAll = false;
let xrayManual = false;
let xrayOn = false;
let chainStep = -1;
let modalId = null;
let flying = false;

function setXray(on) {
  if (on === xrayOn) return;
  xrayOn = on;
  world.setXray(on);
  ctx.fiber.visible = on;
  document.body.classList.toggle('xray', on);
  updateButtons();
}

function camFor(s) {
  const target = new THREE.Vector3(...s.target);
  const dir = new THREE.Vector3(...s.cam).sub(target).multiplyScalar(s.dist ?? 1.5);
  const aspect = camera.aspect;
  if (aspect < 1.3) dir.multiplyScalar(Math.min(2.2, 1.35 / aspect));
  return { pos: target.clone().add(dir), target };
}

function goTo(i, { instant = false } = {}) {
  current = (i + SCENES.length) % SCENES.length;
  sceneTime = 0;
  const s = SCENES[current];
  const { pos, target } = camFor(s);
  controls.autoRotate = false;
  gsap.killTweensOf(camera.position); gsap.killTweensOf(controls.target);
  if (instant) {
    camera.position.copy(pos); controls.target.copy(target);
    controls.autoRotate = !!s.orbit;
  } else {
    flying = true;
    const d = 2.2;
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: d, ease: 'power2.inOut' });
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: d, ease: 'power2.inOut',
      onComplete: () => { flying = false; controls.autoRotate = !!s.orbit && current === SCENES.indexOf(s); } });
  }
  setXray(!!s.xray || xrayManual);
  if (s.chain && ctx.chain) { ctx.chain.restart(true); chainStep = -1; }
  sceneDevices = new Set(s.devices);
  renderCaption();
  document.querySelectorAll('#sceneList li').forEach((li, k) => li.classList.toggle('active', k === current));
  closeDrawer();
}
let sceneDevices = new Set();

/* ---------------- UI: sidebar ---------------- */
function buildSidebar() {
  const ol = $('#sceneList');
  ol.innerHTML = '';
  SCENES.forEach((s, i) => {
    const li = document.createElement('li');
    const color = s.zone ? hex(ZONES[s.zone].color) : '#e2e8f0';
    li.innerHTML = `<button><span class="num" style="--zc:${color}">${i}</span><span class="t"></span></button>`;
    li.querySelector('.t').textContent = sceneText(s.id).title;
    li.classList.toggle('active', i === current);
    li.querySelector('button').addEventListener('click', () => { setPlaying(false); goTo(i); });
    ol.appendChild(li);
  });
}

/* ---------------- UI: caption ---------------- */
function renderCaption() {
  const s = SCENES[current];
  const t = sceneText(s.id);
  $('#capKicker').textContent = `${T('scene')} ${current} / ${SCENES.length - 1}`;
  $('#capTitle').textContent = t.title;
  $('#capText').textContent = t.caption;
  const color = s.zone ? hex(ZONES[s.zone].color) : '#38bdf8';
  $('#caption').style.setProperty('--zc', color);
  const steps = $('#capSteps');
  steps.innerHTML = '';
  if (t.steps) {
    t.steps.forEach((st, i) => {
      const li = document.createElement('li');
      li.textContent = st;
      li.classList.toggle('on', i === chainStep);
      li.classList.toggle('done', i < chainStep);
      steps.appendChild(li);
    });
  }
  const chips = $('#capDevices');
  chips.innerHTML = '';
  for (const id of s.devices) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.style.setProperty('--zc', hex(ZONES[dev(id).zone || s.zone || 'production'].color));
    b.textContent = devText(id).name;
    b.addEventListener('click', () => openModal(id));
    b.addEventListener('pointerenter', () => setHover(id));
    b.addEventListener('pointerleave', () => setHover(null));
    chips.appendChild(b);
  }
}
ctx.onChainStep = (i) => {
  chainStep = i;
  if (SCENES[current].chain) {
    document.querySelectorAll('#capSteps li').forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); });
  }
};

/* ---------------- UI: modal ---------------- */
function openModal(id) {
  modalId = id;
  const d = dev(id), t = devText(id);
  const m = $('#modal');
  m.style.setProperty('--zc', hex(ZONES[d.zone || 'production'].color));
  $('#mZone').textContent = content.zones[d.zone]?.[lang] || d.zone || '';
  const brand = $('#mBrand');
  brand.hidden = !d.brand;
  brand.textContent = d.brand || '';
  $('#mName').textContent = t.name;
  $('#mFunc').textContent = t.function || '';
  const how = $('#mHow');
  how.innerHTML = '';
  (t.how || []).forEach((h) => { const li = document.createElement('li'); li.textContent = h; how.appendChild(li); });
  $('#mProblem').textContent = t.problem || '';
  $('#mResult').textContent = t.result || '';
  const img = $('#mImg'), ph = $('#mPh');
  const path = d.image || `assets/img/${id}.jpg`;
  ph.querySelector('code').textContent = path;
  ph.hidden = true;
  img.hidden = false;
  img.alt = t.name;
  img.onerror = () => { img.hidden = true; ph.hidden = false; };
  img.onload = () => { ph.hidden = true; };
  if (img.getAttribute('src') !== path) img.src = path;
  else if (img.complete && !img.naturalWidth) img.onerror();
  const cr = $('#mCredit');
  cr.textContent = d.credit ? `${T('photo')}: ${d.credit}` : '';
  m.hidden = false;
  requestAnimationFrame(() => m.classList.add('open'));
  setHover(id);
  $('#mClose').focus({ preventScroll: true });
}
function closeModal() {
  const m = $('#modal');
  m.classList.remove('open');
  modalId = null;
  setHover(null);
  setTimeout(() => { if (!modalId) m.hidden = true; }, 220);
}
$('#mClose').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

/* ---------------- buttons ---------------- */
function setPlaying(p) {
  playing = p;
  sceneTime = 0;
  if (p && SCENES[current].orbit) controls.autoRotate = true;
  updateButtons();
}
function updateButtons() {
  $('#playBtn').classList.toggle('on', playing);
  $('#exploreBtn').classList.toggle('on', !playing);
  $('#labelsBtn').classList.toggle('on', showAll);
  $('#labelsBtn .v').textContent = T(showAll ? 'hideAll' : 'showAll');
  $('#xrayBtn').classList.toggle('on', xrayOn);
  $('#ppBtn').innerHTML = playing ? '<svg viewBox="0 0 24 24"><path d="M7 5h3v14H7zM14 5h3v14h-3z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
  $('#ppBtn').setAttribute('aria-label', T(playing ? 'pause' : 'play'));
}
$('#playBtn').addEventListener('click', () => { setPlaying(true); });
$('#exploreBtn').addEventListener('click', () => setPlaying(false));
$('#ppBtn').addEventListener('click', () => setPlaying(!playing));
$('#prevBtn').addEventListener('click', () => { goTo(current - 1); sceneTime = 0; });
$('#nextBtn').addEventListener('click', () => { goTo(current + 1); sceneTime = 0; });
$('#labelsBtn').addEventListener('click', () => { showAll = !showAll; updateButtons(); });
$('#xrayBtn').addEventListener('click', () => { xrayManual = !xrayOn; setXray(xrayManual); });
$('#langBtn').addEventListener('click', () => { lang = lang === 'en' ? 'th' : 'en'; store.set('sf-lang', lang); applyLang(); });
function closeDrawer() { document.body.classList.remove('drawer'); }
$('#menuBtn').addEventListener('click', () => document.body.classList.toggle('drawer'));
$('#scrim').addEventListener('click', closeDrawer);
$('#capToggle').addEventListener('click', () => document.body.classList.toggle('cap-min'));

addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input,textarea')) return;
  if (e.key === 'Escape') { if (modalId) closeModal(); else closeDrawer(); }
  else if (modalId) return;
  else if (e.key === 'ArrowRight' || e.key === 'PageDown') goTo(current + 1);
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goTo(current - 1);
  else if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
  else if (e.key.toLowerCase() === 'l') { showAll = !showAll; updateButtons(); }
});

controls.addEventListener('start', () => {
  if (flying) { gsap.killTweensOf(camera.position); gsap.killTweensOf(controls.target); flying = false; }
  controls.autoRotate = false;
  if (playing) setPlaying(false);
});

/* ---------------- pointing: hover + click via raycasting ---------------- */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pick(x, y) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(reg.roots, true);
  for (const h of hits) {
    if (h.object.userData.noPick || !visibleChain(h.object)) continue;
    let o = h.object;
    while (o && !o.userData.deviceId) o = o.parent;
    if (o) return o.userData.deviceId;
  }
  return null;
}
let hovered = null;
function setHover(id) {
  if (id === hovered) return;
  if (hovered) reg.highlight(hovered, false);
  hovered = id;
  if (id) reg.highlight(id, true);
  renderer.domElement.style.cursor = id ? 'pointer' : '';
}
let pendingMove = null;
const canvas = renderer.domElement;
canvas.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') pendingMove = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerleave', () => { pendingMove = null; if (!modalId) setHover(null); });
let down = null;
canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  const dt = performance.now() - down.t;
  down = null;
  if (moved > 8 || dt > 600) return;
  const id = pick(e.clientX, e.clientY);
  if (id) openModal(id);
});
labelRenderer.domElement.addEventListener('click', (e) => {
  const b = e.target.closest('.dev-label');
  if (b) openModal(b.dataset.id);
});
labelRenderer.domElement.addEventListener('pointerover', (e) => { const b = e.target.closest('.dev-label'); if (b) setHover(b.dataset.id); });
labelRenderer.domElement.addEventListener('pointerout', (e) => { const b = e.target.closest('.dev-label'); if (b && !modalId) setHover(null); });

function syncLabels() {
  for (const [id, it] of reg.items) {
    if (!it.label) continue;
    const want = (showAll || id === hovered || sceneDevices.has(id)) && visibleChain(it.labelRoot) && !(it.id === 'fiber-backbone' && !xrayOn);
    if (it.label.visible !== want) it.label.visible = want;
    const hot = id === hovered;
    if (it._hot !== hot) { it._hot = hot; it.label.element.classList.toggle('hot', hot); }
  }
}

/* ---------------- resize ---------------- */
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  camera.aspect = w / h;
  // Keep the subject centred in the space not covered by the sidebar / caption.
  if (w > 900) camera.setViewOffset(w, h, -(248 + 16) / 2, 70, w, h);
  else camera.setViewOffset(w, h, 0, h > w ? h * 0.17 : h * 0.06, w, h); // lift above the caption sheet
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  labelRenderer.setSize(w, h);
}
new ResizeObserver(resize).observe(stage);
resize();

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let screenAcc = 0, fpsFrames = 0, fpsAcc = 0, quality = 0;
const fpsEl = new URLSearchParams(location.search).has('fps') ? $('#fps') : null;
const HQ = new URLSearchParams(location.search).has('hq'); // keep full quality (no auto-downgrade)
if (fpsEl) fpsEl.hidden = false;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  for (const u of ctx.updaters) u(t, dt);
  for (const f of flows) f.update(dt);
  screenAcc += dt;
  if (screenAcc > 0.1) { screenAcc = 0; for (const s of screens) s.flush(); }
  if (pendingMove) { setHover(pick(...pendingMove)); pendingMove = null; }
  if (playing && !modalId) {
    sceneTime += dt;
    const dur = SCENES[current].duration;
    $('#progress i').style.transform = `scaleX(${Math.min(1, sceneTime / dur)})`;
    if (sceneTime >= dur) goTo(current + 1);
  } else {
    $('#progress i').style.transform = 'scaleX(0)';
  }
  controls.update();
  syncLabels();
  if (bloomOn) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  // Adaptive quality: keep the frame rate up on weaker GPUs
  fpsFrames++; fpsAcc += dt;
  if (fpsAcc > 2.5) {
    const fps = fpsFrames / fpsAcc;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · q${quality} · pr ${pixelRatio}`;
    if (fps < 45 && quality < 4 && t > 4 && !HQ) {
      quality++;
      // Degrade in order of cost/benefit: bloom → pixel ratio → shadows → pixel ratio again
      if (quality === 1 && bloomOn) bloomOn = false;
      else if (quality <= 2 && pixelRatio > 1.25) { pixelRatio = Math.max(1, pixelRatio - 0.5); renderer.setPixelRatio(pixelRatio); resize(); quality = 2; }
      else if (quality <= 3) { sun.castShadow = false; quality = 3; }
      else { pixelRatio = Math.max(0.75, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); resize(); }
    }
    fpsFrames = 0; fpsAcc = 0;
  }
});

/* ---------------- start ---------------- */
applyLang();
goTo(0, { instant: true });
camera.position.multiplyScalar(1.4);
goTo(0);
setPlaying(new URLSearchParams(location.search).get('autoplay') === '1');
$('#loading').classList.add('done');
setTimeout(() => $('#loading').remove(), 800);
window.__sf = { ctx: Object.assign(ctx, { renderer }), goTo, openModal, closeModal, setXray, get current() { return current; } };
