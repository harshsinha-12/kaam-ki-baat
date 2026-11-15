const { chromium } = require("/opt/node22/lib/node_modules/playwright");
const [,, w, nw, fps, total] = process.argv; const W=+w, NW=+nw, FPS=+fps, N=Math.round(+total*FPS);
(async()=>{ const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1920,height:1080}});
await p.goto("file:///home/claude/video/film2.html"); await p.waitForTimeout(400);
for(let f=W; f<N; f+=NW){ await p.evaluate(t=>window.render(t), f/FPS); await p.screenshot({path:`/home/claude/video/frames2/f${String(f).padStart(5,"0")}.jpg`,type:"jpeg",quality:90}); if(f%300<NW) console.log(W, f); }
await b.close(); })();
