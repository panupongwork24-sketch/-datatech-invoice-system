// Build a single self-contained HTML file: dist/smart-factory.html
// Inlines CSS, GSAP, the bundled app (Three.js included), content.json and all images (base64),
// so the presentation opens by double-click (file://) with no web server.
//
// Usage:  npm install   (once)
//         npm run build:html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (f) => resolve(ROOT, f);
const read = (f) => readFileSync(p(f), 'utf8');

// 1. Bundle the app (ES module) with Three.js resolved from vendor/
const vendorThree = {
  name: 'vendor-three',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: p('vendor/three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: p('vendor/addons/' + a.path.slice('three/addons/'.length)) }));
  },
};
const out = await build({
  entryPoints: [p('js/main.js')],
  bundle: true,
  format: 'esm',
  minify: true,
  write: false,
  target: 'es2022',
  plugins: [vendorThree],
  legalComments: 'none',
});
const appJs = out.outputFiles[0].text;

// 2. Content with images embedded as data URIs
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const content = JSON.parse(read('content.json'));
let embedded = 0;
const missing = [];
for (const [id, d] of Object.entries(content.devices)) {
  const img = d.image || `assets/img/${id}.jpg`;
  if (existsSync(p(img))) {
    d.image = `data:${MIME[extname(img).toLowerCase()] || 'image/jpeg'};base64,${readFileSync(p(img)).toString('base64')}`;
    d.imageName = img; // keep the file name for the placeholder text
    embedded++;
  } else {
    missing.push(img);
  }
}
// Safe to place inside <script>: escape "</" and line separators
const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029);
const contentJs = 'window.__SF_CONTENT=' + JSON.stringify(content).replace(/<\//g, '<\\/').split(LS).join('\\u2028').split(PS).join('\\u2029') + ';';

// 3. Assemble the HTML from index.html
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = read('index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('index.html changed; cannot find: ' + from);
  html = html.replace(from, () => to);
};
swap('<link rel="stylesheet" href="styles.css">', `<style>\n${read('styles.css')}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
swap('<script src="vendor/gsap.min.js"></script>', `<script>${esc(read('vendor/gsap.min.js'))}</script>`);
swap('<script type="module" src="js/main.js"></script>',
  `<script>${contentJs}</script>\n  <script type="module">${esc(appJs)}</script>`);

mkdirSync(p('dist'), { recursive: true });
writeFileSync(p('dist/smart-factory.html'), html);
const mb = (Buffer.byteLength(html) / 1048576).toFixed(1);
console.log(`dist/smart-factory.html  ${mb} MB  ·  ${embedded} images embedded` + (missing.length ? `  ·  placeholders: ${missing.join(', ')}` : ''));
