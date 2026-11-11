# Brake Booster Line — 3D walkthrough (draft)

Interactive 3D overview of the brake-booster plant: solutions delivered (AMR + conveyor, traceability with SATO QR + PLC,
infrastructure + WI Traceability, AEP Print, customer label printing) and the roadmap (e-Kanban + ESL, RFID to FG warehouse).

- Text (EN / TH): `js/content.js` · 3D scene + animation: `js/main.js`
- Dev: serve the repo root (`python3 -m http.server`) and open `/brake-booster-line/` (uses `../smart-factory/vendor`)
- Single file: `npm install && npm run build:html` → `dist/brake-booster-line.html` (opens by double-click)

All geometry is built in code (no external models, no logos, no company or customer names). Screens show illustrative sample data only.
- Lighting: Poly Haven `empty_warehouse_01` HDRI (CC0), shared from `smart-factory/assets/env/`.
