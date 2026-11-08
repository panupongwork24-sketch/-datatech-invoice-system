# 3D models – detailed recipe

## Sources
- **Poly Haven** (CC0): `https://api.polyhaven.com/assets?t=models|hdris&c=<category>`, files via `https://api.polyhaven.com/files/<id>` (gltf/hdr URLs on dl.polyhaven.org). No attribution needed, credit as courtesy.
- **Sketchfab** (CC-BY / CC0 only): needs the user's API token for downloads (saved with `request_credential`, host `api.sketchfab.com`, header `Authorization`, prefix `Token`; test `GET /v3/me`).
  - Search: `GET /v3/search?type=models&q=<q>&downloadable=true&license=by` (or `cc0`) `&max_face_count=50000&sort_by=-likeCount&count=8`
  - Metadata/licence: `GET /v3/models/<uid>` → `license.label`, `user.displayName`, `user.username`, `viewerUrl`
  - Download: `GET /v3/models/<uid>/download` → `glb.url` (signed S3, host sketchfab-prod-media.s3.amazonaws.com)
  - Network: allowed hosts live in the cloud environment; add new ones with `update_environment` (user approves).

## Pick
1. Contact sheet of thumbnails (`thumbnails.images` closest to 640 px) labelled with uid + name + licence.
2. Skip: NC/ND licences, brand names/logos (forklift "SQUIRE", "LN" logo AGV, logo on rack top), sci-fi/cartoon looks, broken files (huge units, render fails).

## Inspect
- `node scripts/glb_tree.mjs file.glb [depth]` – node hierarchy, mesh bounds, materials (gltf-transform core).
- Render 6 views: serve a scratch dir containing `viewer.html` + three r160 (`vendor/` copied from smart-factory) + the GLBs, then
  `OUT=shots NODE_PATH=$(npm root -g) node scripts/render_glb_views.cjs http://localhost:8811 dir/file.glb[#nodeFilter]`.
  Views: [1,.5,1], [-1,.5,-1], +Z, +X, -Z, -X. The +Z view tells you which way the model faces.

## Fix
- Remove parts (e.g. a barrier arm you will animate in code): `node scripts/prune_nodes.mjs in.glb out.glb pCube3 pCylinder`.
- Split a multi-object pack into named, re-oriented children (car pack): load in three.js, group body + wheels by bbox, PCA heading → rotate to +Z, flip the ones facing backwards, export with GLTFExporter (copy `examples/jsm/exporters/GLTFExporter.js` + `utils/TextureUtils.js` from `three@0.160.0`). Then `model('passenger_cars', { node: 'car_sedan' })`.
- Optimise (see SKILL.md). Typical results: 1–11 MB → 20–750 KB.

## Use in code
- `MODEL_NAMES` in `js/models.js`; `model(name, opts)` returns a wrapper Group or `null`.
- Size with `height` / `width` / `depth` or non-uniform `fit: [w,h,d]` (fit uses the model's own axes, so rotate the wrapper afterwards when the model's long axis differs).
- Rotate the wrapper (`rotation.y = Math.PI` etc.) to face +Z; keep animated parts (carriage, pallet, tote, lidar, lamp strip) as separate code groups.
- Examples in this project: forklift (`width 1.25`, rotated π, pallet on fused forks), box truck (`width 2.3`, rear against dock at z≈24.4), cars (native metres), AMR (`fit [1,0.4,1.45]`), racks (`fit [1.1,2.4,3.4]`, `rotation.y=-π/2`), barrier housing (`height 1.2`).

## Credits row (credits.md → "Sketchfab models (CC-BY)")
`| file | title | [Display Name (username)](https://sketchfab.com/username) | [viewer url](...) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | changes |`
