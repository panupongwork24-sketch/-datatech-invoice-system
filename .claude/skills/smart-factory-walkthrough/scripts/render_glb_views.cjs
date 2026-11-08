// Usage: OUT=<dir> NODE_PATH=$(npm root -g) node render_glb_views.cjs <url> ... (Chromium via preinstalled Playwright, SwiftShader)
const { chromium } = require('playwright');
(async()=>{
const [,, base, ...files] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
p.on('console', m => m.type()==='error' && console.log('ERR', m.text()));
for (const f of files) {
  const [file, node] = f.split('#');
  await p.goto(`${base}/v.html?f=${file}` + (node ? `&node=${node}` : ''));
  await p.waitForFunction('window.done', null, { timeout: 120000 });
  console.log(f, JSON.stringify(await p.evaluate('window.info')));
  await p.screenshot({ path: `${process.env.OUT}/${file.split('/').pop()}${node?'_'+node:''}.png` });
}
await b.close();
})();
