// App bootstrap: renderer, camera, interaction, scenes, UI and i18n.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { gsap, ZONES, hex, screens, screenRes, flows, WavePool } from './core.js';
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
const QS = new URLSearchParams(location.search);
// Dynamic resolution: sharp (slightly supersampled) while the camera rests, lighter while it moves.
const DPR = devicePixelRatio || 1;
let prStill = coarse || small ? Math.min(DPR, 1.6) : Math.min(2, Math.max(1.5, DPR * 1.25));
const prMove = () => Math.min(prStill, coarse || small ? 1.2 : Math.max(1, DPR * 0.85));
let pixelRatio = prStill;
// In-scene screens (MES, WMS, SCADA…) get 2× canvases on desktop so their text stays crisp
screenRes.k = coarse || small ? 1.5 : 2;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The sun never moves: refresh the shadow map every 3rd frame instead of every frame (moving
// forklifts / AMRs / people still get shadows, updated at ~20 Hz).
renderer.shadowMap.autoUpdate = false;
stage.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
stage.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.Fog(0x0b1020, 180, 460);
// Image-based lighting: a real warehouse HDRI (Poly Haven, CC0) gives metals, plastics and the
// epoxy floors realistic reflections. Falls back to a procedural studio room if it cannot load.
const pmrem = new THREE.PMREMGenerator(renderer);
try {
  const hdr = await new RGBELoader().loadAsync(window.__SF_ENV || 'assets/env/warehouse_env.hdr');
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  hdr.dispose();
  scene.environmentIntensity = 0.55;
} catch (e) {
  console.warn('HDR environment failed, using RoomEnvironment', e);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  scene.environmentIntensity = 0.4;
}

const camera = new THREE.PerspectiveCamera(32, 1, 0.5, 900);
camera.position.set(110, 100, 140);

scene.add(new THREE.HemisphereLight(0xdbe7ff, 0x1a1f2b, 0.35));
const sun = new THREE.DirectionalLight(0xfff4e0, 2.0);
sun.position.set(45, 90, 40);
sun.castShadow = true;
const SH = QS.has('hq') ? 4096 : coarse || small ? 1024 : 2048;
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
// Post-processing target (multisampled only with ?hq)
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: QS.has('hq') ? 4 : 0 }));
composer.addPass(new RenderPass(scene, camera));
// Ambient occlusion: soft contact shadows where objects meet the floor and each other (desktop only;
// switched off first by the adaptive-quality loop on slower GPUs).
const ao = new GTAOPass(scene, camera, innerWidth, innerHeight);
ao.updateGtaoMaterial({ radius: 2.6, distanceExponent: 1.4, thickness: 3, scale: 1.4, samples: 12 });
ao.updatePdMaterial({ radius: 6, rings: 2, samples: 12 });
ao.blendIntensity = 1;
// Off by default (it re-renders the whole scene); ?hq or ?ao turns it on for high-end machines.
ao.enabled = !(coarse || small) && (QS.has('hq') || QS.has('ao')) && !QS.has('noao');
composer.addPass(ao);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.35, 0.4, 0.96);
composer.addPass(bloom);
composer.addPass(new OutputPass());
// FXAA: cheap edge smoothing for the post-processed image (MSAA only with ?hq — it is costly on laptop GPUs)
const fxaa = new ShaderPass(FXAAShader);
fxaa.enabled = !QS.has('hq');
composer.addPass(fxaa);
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
// Small parts (LEDs, keys, screens, bolts) do not cast shadows: fewer draw calls in the shadow pass.
{
  const ws = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.castShadow) return;
    if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
    o.getWorldScale(ws);
    if (o.geometry.boundingSphere.radius * Math.max(ws.x, ws.y, ws.z) < 0.35) o.castShadow = false;
  });
}
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

function camFor(s, aspect = camera.aspect) {
  const target = new THREE.Vector3(...s.target);
  const dir = new THREE.Vector3(...s.cam).sub(target).multiplyScalar(s.dist ?? 1.5);
  if (aspect < 1.3) dir.multiplyScalar(Math.min(2.2, 1.35 / aspect));
  return { pos: target.clone().add(dir), target };
}

function goTo(i, { instant = false } = {}) {
  current = (i + SCENES.length) % SCENES.length;
  sceneTime = 0;
  const s = SCENES[current];
  sceneDevices = new Set(s.devices);
  renderCaption(); measureFrame();
  const { pos, target } = camFor(s, frame.tw / frame.th);
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

let userMoving = false, restAt = 0;
controls.addEventListener('end', () => { userMoving = false; restAt = performance.now(); });
controls.addEventListener('start', () => {
  userMoving = true;
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

/* ---------------- resize / framing ---------------- */
// The camera is framed for the part of the screen that the top bar, sidebar and caption leave free
// (camera.aspect = free area's aspect); the projection is then widened through setViewOffset so the
// rest of the canvas still renders around it. Values ease each frame so caption changes glide.
const frame = { l: 0, t: 0, w: 1, h: 1, tl: 0, tt: 0, tw: 1, th: 1, init: false };
function measureFrame() {
  const w = stage.clientWidth, h = stage.clientHeight;
  const top = Math.min(h * 0.15, $('#topbar').getBoundingClientRect().bottom);
  const sb = $('#sidebar').getBoundingClientRect();
  const left = w > 900 && sb.width ? sb.right + 8 : 0;
  const cap = $('#caption').getBoundingClientRect();
  let bottom = cap.height ? Math.max(0, h - cap.top + 8) : 0;
  if (w <= 900 && h <= 500) bottom = 0;                    // landscape phone: caption sits beside the scene
  const fh = Math.max(h * 0.5, h - top - bottom);
  Object.assign(frame, { tl: left, tt: Math.min(top, h - fh), tw: w - left, th: fh });
  if (!frame.init) { frame.init = true; frame.l = frame.tl; frame.t = frame.tt; frame.w = frame.tw; frame.h = frame.th; }
}
function applyFrame(k = 1) {
  const w = stage.clientWidth, h = stage.clientHeight;
  for (const key of ['l', 't', 'w', 'h']) frame[key] += (frame['t' + key] - frame[key]) * k;
  camera.aspect = frame.w / frame.h;
  camera.setViewOffset(frame.w, frame.h, -frame.l, -frame.t, w, h);
  camera.updateProjectionMatrix();
}
function frameMoving() { return Math.abs(frame.tl - frame.l) + Math.abs(frame.tt - frame.t) + Math.abs(frame.tw - frame.w) + Math.abs(frame.th - frame.h) > 0.5; }
function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  measureFrame(); applyFrame(1);
  renderer.setSize(w, h, false);
  composer.setPixelRatio(pixelRatio);
  composer.setSize(w, h);
  fxaa.material.uniforms.resolution.value.set(1 / (w * pixelRatio), 1 / (h * pixelRatio));
  labelRenderer.setSize(w, h);
}
new ResizeObserver(() => { measureFrame(); }).observe($('#caption'));
new ResizeObserver(resize).observe(stage);
resize();

/* ---------------- main loop ---------------- */
const clock = new THREE.Clock();
let shadowTick = 0;
let screenAcc = 0, fpsFrames = 0, fpsAcc = 0, quality = 0;
const fpsEl = new URLSearchParams(location.search).has('fps') ? $('#fps') : null;
const HQ = QS.has('hq'); // keep full quality (no auto-downgrade)
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
  if (frameMoving()) applyFrame(Math.min(1, dt * 5));
  if (++shadowTick % 3 === 0) renderer.shadowMap.needsUpdate = true;
  // Dynamic resolution: drop while the camera flies / is dragged, back to sharp 0.35 s after it rests
  const wantPR = (flying || userMoving || performance.now() - restAt < 350) ? prMove() : prStill;
  if (Math.abs(wantPR - pixelRatio) > 0.01) { pixelRatio = wantPR; renderer.setPixelRatio(pixelRatio); resize(); }
  controls.update();
  syncLabels();
  if (bloomOn || ao.enabled) { bloom.enabled = bloomOn; composer.render(); } else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);

  // Adaptive quality: keep the frame rate up on weaker GPUs
  fpsFrames++; fpsAcc += dt;
  if (fpsAcc > 1.5) {
    const fps = fpsFrames / fpsAcc;
    if (fpsEl) fpsEl.textContent = `${fps.toFixed(0)} fps · q${quality} · pr ${pixelRatio}`;
    if (fps < 45 && ao.enabled && t > 2 && !HQ) ao.enabled = false; // ambient occlusion goes first
    else if (fps < 45 && quality < 4 && t > 2 && !HQ) {
      quality++;
      // Degrade in order of cost/benefit: bloom → pixel ratio → shadows → pixel ratio again
      if (quality === 1 && bloomOn) bloomOn = false;
      else if (quality <= 2 && prStill > 1.25) { prStill = Math.max(1, prStill - 0.5); quality = 2; }
      else if (quality <= 3) { sun.castShadow = false; quality = 3; }
      else { prStill = Math.max(0.75, prStill - 0.25); }
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
window.__sf = { ctx: Object.assign(ctx, { renderer, controls }), goTo, openModal, closeModal, setXray, get current() { return current; } };
