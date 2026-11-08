// Usage: OUT=<dir> NODE_PATH=$(npm root -g) node test_dist.cjs <url> ... (Chromium via preinstalled Playwright, SwiftShader)
const { chromium, devices } = require('playwright');
(async()=>{ const OUT=process.env.OUT; const [,, url, tag, mobile]=process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const c = await b.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 800 } });
const p = await c.newPage(); const errs=[];
p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); }); p.on('pageerror', e=>errs.push('PE '+e.message));
await p.goto(url); await p.waitForFunction('window.__sf', null, { timeout: 240000 });
const n = await p.evaluate(()=>Object.keys(window.__SF_MODELS||{}).length);
for (const [i,nm] of [[0,'overview'],[2,'dock']]) { await p.evaluate(i=>window.__sf.goTo(i,{instant:true}), i); await p.waitForTimeout(3000); await p.screenshot({ path: `${OUT}/${tag}_${nm}.png`, timeout: 120000 }); }
console.log(tag, 'embedded models', n, 'errors:', errs.length ? errs.join(' | ') : 'none');
await b.close(); })();
