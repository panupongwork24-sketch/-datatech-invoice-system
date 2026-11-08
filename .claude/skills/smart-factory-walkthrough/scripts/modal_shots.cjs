// Usage: OUT=<dir> NODE_PATH=$(npm root -g) node modal_shots.cjs <url> ... (Chromium via preinstalled Playwright, SwiftShader)
const { chromium } = require('playwright');
(async()=>{ const OUT=process.env.OUT;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs=[];
p.on('console', m => { if (m.type()==='error') errs.push(m.text()); }); p.on('pageerror', e=>errs.push(e.message));
await p.goto(process.argv[2]); await p.waitForFunction('window.__sf', null, { timeout: 240000 });
for (const id of (process.env.IDS||'').split(',')) { await p.evaluate(id=>window.__sf.openModal(id), id); await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/modal_${id}.png`, timeout: 120000 }); await p.evaluate(()=>window.__sf.closeModal()); }
console.log('errors:', errs.length?errs.join(' | '):'none'); await b.close(); })();
