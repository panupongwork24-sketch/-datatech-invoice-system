// Usage: node glb_tree.mjs file.glb [depth]   (needs @gltf-transform/core, extensions, functions in node_modules)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { getBounds } from '@gltf-transform/functions';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
const r = doc.getRoot();
const sc = r.listScenes()[0];
const b = getBounds(sc); console.log('scene bounds', b.min.map(v=>v.toFixed(2)), b.max.map(v=>v.toFixed(2)));
const depthMax = +process.argv[3] || 6;
function walk(n, d) {
  if (d > depthMax) return;
  const m = n.getMesh();
  let s = '  '.repeat(d) + n.getName();
  if (m) { const bb = getBounds(n); s += ` [mesh ${m.getName()} prims=${m.listPrimitives().length}] ` + bb.min.map(v=>v.toFixed(2)) + ' → ' + bb.max.map(v=>v.toFixed(2)); }
  console.log(s);
  n.listChildren().forEach(c => walk(c, d + 1));
}
sc.listChildren().forEach(c => walk(c, 0));
console.log('materials:', r.listMaterials().map(m=>m.getName()).join(', '));
