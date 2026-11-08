// Usage: OUT=<dir> NODE_PATH=$(npm root -g) node closeups.cjs <url> ... (Chromium via preinstalled Playwright, SwiftShader)
const { chromium } = require('playwright');
(async()=>{ const OUT=process.env.OUT; const [,, url, tag] = process.argv;
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage(); const errs=[];
p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.text()); }); p.on('pageerror', e=>errs.push(e.message));
await p.goto(url); await p.waitForFunction('window.__sf', null, { timeout: 240000 });
await p.addStyleTag({content:'#topbar,#sidebar,#caption,.labels{visibility:hidden}'});
const shots = { gate: [1, [-40.5,4.5,39.5], [-46,1,44]], amr: [4, [-12,3.5,-15], [-12.5,0.6,-19.5]], infra: [0, [33,4.2,-29], [30,1.5,-36]] };
for (const [n,[sc,cam,t]] of Object.entries(shots)) {
  await p.evaluate(i=>window.__sf.goTo(i,{instant:true}), sc); await p.waitForTimeout(1500);
  await p.evaluate(([cam,t])=>{ const x=window.__sf.ctx; x.controls.minDistance=1; x.camera.position.set(...cam); x.controls.target.set(...t); x.controls.update(); }, [cam,t]);
  await p.waitForTimeout(1500); await p.screenshot({ path: `${OUT}/${tag}_${n}.png`, timeout: 180000 });
}
console.log(tag,'errors:', errs.length?errs.join(' | '):'none'); await b.close(); })();
