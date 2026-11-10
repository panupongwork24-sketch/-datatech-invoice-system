// Bundle everything into one self-contained file: dist/brake-booster-line.html (opens by double-click).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR = resolve(ROOT, '../smart-factory/vendor');
const p = (f) => resolve(ROOT, f);
const read = (f) => readFileSync(f, 'utf8');

const out = await build({
  entryPoints: [p('js/main.js')], bundle: true, format: 'esm', minify: true, write: false, target: 'es2022', legalComments: 'none',
  plugins: [{ name: 'vendor-three', setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(VENDOR, 'three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: resolve(VENDOR, 'addons/' + a.path.slice('three/addons/'.length)) }));
  } }],
});
const esc = (s) => s.replace(/<\/script/gi, '<\\/script');
let html = read(p('index.html'));
const swap = (from, to) => { if (!html.includes(from)) throw new Error('index.html changed: ' + from); html = html.replace(from, () => to); };
swap('<link rel="stylesheet" href="styles.css">', `<style>\n${read(p('styles.css'))}\n</style>`);
html = html.replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '');
swap('<script src="../smart-factory/vendor/gsap.min.js"></script>', `<script>${esc(read(resolve(VENDOR, 'gsap.min.js')))}</script>`);
swap('<script type="module" src="js/main.js"></script>', `<script type="module">${esc(out.outputFiles[0].text)}</script>`);
mkdirSync(p('dist'), { recursive: true });
writeFileSync(p('dist/brake-booster-line.html'), html);
console.log(`dist/brake-booster-line.html  ${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB`);
