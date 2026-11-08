// Usage: node prune_nodes.mjs in.glb out.glb <nodeNamePrefix>...   (removes nodes whose name starts with a prefix)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
const [,, src, out, ...names] = process.argv;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(src);
for (const n of doc.getRoot().listNodes()) if (names.some(x => n.getName().startsWith(x))) n.dispose();
await doc.transform(prune());
await io.write(out, doc);
