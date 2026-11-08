# Smart Factory Walkthrough

Interactive 3D presentation of a connected factory (Three.js r160 + GSAP 3.12.5, low-poly, no build step).

## Run

The page loads `content.json` with `fetch`, so it must be served over HTTP (opening `index.html` as a file will not work):

```bash
cd smart-factory
python3 -m http.server 8080      # or: npx serve .
# open http://localhost:8080
```

It can also be deployed as-is to any static host (Netlify, GitHub Pages, S3, an internal web server).
Three.js and GSAP are vendored in `vendor/`, so the presentation works offline at a customer site
(only the Google Fonts request needs internet; system fonts are used as a fallback).

### Single HTML file (double-click, no server)

`dist/smart-factory.html` is the whole presentation in **one file** (≈4 MB): code, Three.js, GSAP,
content and all photos are embedded. Open it directly in Chrome / Edge / Safari or send it to a customer.

After editing `content.json` or adding photos, rebuild it:

```bash
cd smart-factory
npm install          # once
npm run build:html   # → dist/smart-factory.html
```

URL options: `?autoplay=1` starts in Auto-play mode, `?fps` shows a frame-rate counter.

## Controls

| Action | Desktop | Touch |
|---|---|---|
| Orbit / zoom / pan | drag / wheel / right-drag | 1-finger drag / pinch / 2-finger drag |
| Device details | hover (highlight + name), click (popup) | tap |
| Next / previous scene | → / ← or buttons | buttons |
| Auto-play on/off | Space or ▶ | ▶ |
| Show all device labels | `L` or "Show all devices" | tag button |

Interacting with the 3D view during Auto-play switches to Free explore.

## Editing content (no code)

All text is in **`content.json`**:

- `ui.en` / `ui.th` – button and label text
- `zones` – zone names (also painted on the floor)
- `scenes.<id>.en|th` – scene `title`, `caption` (and `steps` for the highlight scene)
- `devices.<id>` – per device:
  - `image` – path of the popup photo (default `assets/img/<id>.jpg`)
  - `credit` – photo credit shown on the image (keep in sync with `credits.md`)
  - `brand` – optional brand tag shown in the popup (empty / removed = no tag)
  - `en|th.name`, `function`, `how` (3 steps), `problem`, `result`

If an image file is missing, the popup shows a placeholder with the expected file name.
Drop a JPG/PNG with that name into `assets/img/` (≈ 1200×800, landscape works best).

Camera positions and scene timing are in `js/scenes.js` (`cam`, `target`, `duration`).

## Files

```
index.html  styles.css  content.json  credits.md
js/core.js      helpers: materials, canvas screens, RF waves, data flows, path movers
js/world.js     site, zones, roads, people, cars, trucks
js/devices.js   all devices, their animations and the scene-8 event chain
js/scenes.js    camera choreography
js/main.js      renderer, raycasting, UI, i18n, auto-play, adaptive quality
vendor/         three.module.min.js r160, OrbitControls, CSS2DRenderer, gsap 3.12.5
assets/img/     popup photos
```

## Performance

~200 draw calls, instanced racks and cartons, canvas screens refreshed at 10 Hz. The frame rate is
monitored: if it drops below 45 fps the app lowers pixel ratio, then turns off shadows.
