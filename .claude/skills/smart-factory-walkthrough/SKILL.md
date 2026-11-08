---
name: smart-factory-walkthrough
description: Build, extend and polish the interactive 3D "Smart Factory Walkthrough" sales demo (Three.js + GSAP, single-file HTML in smart-factory/). Use this skill whenever the user wants to change the factory demo in any way - add or replace 3D models (forklift, trucks, cars, AMR, racks, barrier, devices), make the 3D more realistic (lighting, HDRI, ambient occlusion, floors), replace or source popup images (Sketchfab, Poly Haven, Wikimedia, Google Drive, Canva AI), edit device/scene text in content.json (EN/TH, problem/result), rename a device, rebuild dist/smart-factory.html, or test it on desktop/iPhone - even when they just say "เพิ่มรูป", "ทำ 3D ให้สมจริง", "เปลี่ยนโมเดล", "แก้ popup", "build ใหม่", "ส่งไฟล์ HTML" or mention the smart factory / walkthrough / หน้าป้อม / dock / AMR / MES scenes.
---

# Smart Factory Walkthrough

Interactive 3D tour of a connected automotive-parts factory (gate → dock → warehouse → AMR → production → office → infrastructure → "everything connected"). It is a **sales demo**, so every change should make it more believable to a factory prospect, stay fast on a phone, and stay legally clean (licences, no logos, no customer names).

The user writes in **Thai**: reply in Thai, keep code/commit messages in English.

## Project map (smart-factory/)

| Path | What it is |
|---|---|
| `index.html`, `styles.css` | UI shell (topbar, sidebar, caption, modal) |
| `js/main.js` | renderer, lighting (HDRI env), post-processing (GTAO + bloom), adaptive quality, i18n, popups. Exposes `window.__sf = { ctx, goTo, openModal, closeModal, setXray }` with `ctx.camera`, `ctx.controls`, `ctx.refs` |
| `js/core.js` | helpers: `box` (bevelled), `cyl`, `mat` (PBR guessed from colour), `glowMat`, `basic`, `Screen` (canvas screens), `txt`, `rr`, `placeOn`, `pathCurve`, `ZONES`, `FLOOR` |
| `js/world.js` | site, zone floors, roads, trees, parked/moving cars & trucks (`car()`, `truck()`), people |
| `js/devices.js` | every clickable device + its animation (`reg.add(id, group, {zone,label})`), forklift, AMRs, portal, kiosk, printer, racks |
| `js/props.js` | decorative Poly Haven props |
| `js/models.js` | GLB loader; `MODEL_NAMES` list; `model(name, {node,height,width,depth,fit})` clones + normalises (centred, stands on y=0); `instanced()` |
| `js/scenes.js` | camera choreography per scene |
| `content.json` | all text: `zones`, `scenes`, `devices.<id>.{zone,image,credit,en,th}` with `name, function, how[3], problem, result` |
| `assets/models/*.glb`, `assets/img/*.jpg`, `assets/env/warehouse_env.hdr` | assets |
| `credits.md` | every external asset with source/author/licence (keep it complete even when popups show no credit) |
| `tools/build-html.mjs` | bundles everything (models, images, HDR as base64) into `dist/smart-factory.html` |

Orientation convention: **models face +Z** (`placeOn` uses `atan2(t.x, t.z)`).

## Hard rules (learned from the user)

1. **No customer names or customer material.** Drive files named after customers (e.g. Suntory, King, Pepsi, HIKROBOT…) are never used, not even blurred.
2. **No company name in the demo.** The demo is not presented under the user's company: no "Datatech"/"Corelogic" text in content, popups, credits shown on screen. `credits.md` says "presentation owner".
3. **No "AI-generated" captions in popups.** Leave `credit` empty for AI/own images; record the source only in `credits.md`. Wikimedia CC BY / BY-SA images must keep their on-screen credit (licence requires it).
4. **No brand logos** on models or images (render/inspect every asset first; reject e.g. a forklift with "SQUIRE" on it, partner logos, LINE logo). Licences: CC0 or CC-BY only (no NC/ND).
5. **Never bypass bot checks** (no fake browser UA on Unsplash/Pexels). Use official APIs with the user's key, or ask the user to download.
6. **Secrets**: never ask for tokens in chat — use `request_credential` (e.g. Sketchfab: host `api.sketchfab.com`, header `Authorization`, prefix `Token`).
7. Keep primitive fallbacks for every model (`model(...) || boxes`) so a missing GLB never breaks the scene.
8. Single HTML must stay < ~20 MB (currently ~13 MB).

## Workflows

### A. Add / replace a 3D model
Read `references/models.md` for the full recipe. Short version:
1. Search Sketchfab (`/v3/search?type=models&downloadable=true&license=by|cc0&max_face_count=…`) or Poly Haven; build a thumbnail contact sheet and pick candidates.
2. Download GLB (`/v3/models/{uid}/download` → signed S3 URL), render 6 views with `scripts/render_glb_views.cjs` + `scripts/viewer.html`, check logos, orientation and units.
3. If needed, prune nodes (`scripts/prune_nodes.mjs`) or split a pack into named child nodes (car pack → `car_sedan`, …) and re-orient to +Z.
4. Optimise: `npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress webp --texture-size 512` (add `--flatten false --join false` when node names must survive). Use `@gltf-transform/cli@4.1.1` in a scratch dir.
5. Copy to `assets/models/`, add the name to `MODEL_NAMES`, use it in code with a fallback, add a row to `credits.md` (title, author display name + username, link, licence, changes).

### B. Popup images
Read `references/images.md`. Priority: real screenshots / own photos supplied by the user → Canva AI images (generate with `mcp__Canva__generate-image`, **the connector only returns a 199 px preview**, so give the user the Canva links to download and send/upload the full-size files) → Unsplash/Pexels via official API key → Wikimedia (needs on-screen credit).
Process: inspect full image → crop for the portrait-ish popup (`object-fit: cover`, ~436×520) → max 960 px JPG q82 → `assets/img/<device-id>.jpg` → `content.json` credit (empty for own/AI) → `credits.md`.

### C. Realism
Already in place: Poly Haven `empty_warehouse_01` HDRI downsampled to 512×256 (`scripts/hdr_downsample.py`) as `scene.environment`; GTAO pass (desktop only, first thing the adaptive-quality loop disables; `?noao` to disable, `?hq` to keep full quality); epoxy floors (roughness 0.3/0.45, envMapIntensity 1.1). For devices with no clean model, build detailed parts in code (bevelled `box`, steel/ABS materials via `mat(color, {roughness, metalness})`, glow strips with `glowMat`), and keep every animated object/material the existing timeline references (e.g. `ants`, `antMat`, `ks`, `card`, `body`, `lbl`, `prScr`, `prLed`).

### D. Text / devices
Edit `content.json` with a Python json round-trip (`ensure_ascii=False, indent=2`, trailing newline) so diffs stay small. Each device needs EN + TH: `name`, `function`, 3 `how` steps, `problem`, `result`. Results are qualitative unless the user supplies real, approved numbers - never invent figures. Renaming a device also means: scene title/caption in `content.json` and the canvas text drawn in `js/devices.js`.

### E. Build, test, deliver
1. `cd smart-factory && npm install && npm run build:html` (prints size, image/model counts, placeholders).
2. Test with Playwright (Chromium preinstalled, `--use-angle=swiftshader --enable-unsafe-swiftshader`) - see `scripts/test_dist.cjs` (desktop + iPhone 13, console errors, screenshots), `scripts/closeups.cjs` (camera close-ups via `__sf.ctx.controls`), `scripts/modal_shots.cjs` (popups). SwiftShader is slow: use long screenshot timeouts, never pause `gsap.globalTimeline` (it hangs evaluate), and run long jobs in the background.
3. For dev-mode tests serve with `python3 -m http.server` (background, long timeout).
4. Look at the screenshots yourself before reporting.
5. Commit with a clear message, `git push -u origin <branch>`, then send `dist/smart-factory.html` (+ a screenshot) with `SendUserFile`.
6. Report in Thai: what changed, what was rejected and why, credits added, final file size, open questions.

## Things that went wrong before (avoid)
- `gltf-transform optimize` flattens/joins nodes by default → named sub-models vanish.
- Some Sketchfab GLBs are in cm or have huge units - `model()` normalises by bbox, but stray geometry breaks the bbox; check with `scripts/viewer.html`.
- Model forks/arms are often fused into one mesh: animate a separate code-built part instead (barrier arm, forklift pallet).
- Google Drive downloads arrive as large base64 JSON saved to a tool-results file: decode with Python (`json.load` → `base64.b64decode`) into a fresh scratch dir; images > ~5 MB can crash the connector.
- `rm -f *` after `cd` is blocked by the safety check - write into new empty dirs instead.
