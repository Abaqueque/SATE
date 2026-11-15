// Run against the preview or deployed site with SATE_BASE; supply PLAYWRIGHT_MODULE
// when Playwright is installed outside this checkout. All archive data is a fixture.
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SATE_BASE||'http://127.0.0.1:4194';
for(const [name,engine,options] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 if(process.env.QA_BROWSER&&process.env.QA_BROWSER!==name)continue;
 const browser=await engine.launch({headless:true,...options});
 try{
  for(const dual of [false,true]){
   const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/about/');
   const setup=await page.evaluate(async()=>{
    const {cellAt}=await import('/sky-model.js'),{createFrameCache}=await import('/cell-frame-cache.js'),{createSkyGrid}=await import('/science/spectral.js');
    const waves=(await(await fetch('/assets/spherex-survey.json')).json()).wavelengths,p={ra:269.4485,dec:4.7394},size=.2,grid=createSkyGrid(p.ra,p.dec,size),cache=createFrameCache();
    const observations=Array.from({length:5},(_,i)=>({id:'loading-'+i,path:'/ibe/data/spherex/dr1/level2/loading-'+i+'.fits',mjd:60000+i,date:new Date((60000+i-40587)*86400000).toISOString(),band:'D2'}));
    for(const extra of [false,true])for(const obs of observations){const n=grid.pixels,wavelength=waves[extra?33:32],frame={width:n,height:n,values:Float32Array.from({length:n*n},(_,i)=>2+Math.sin(i*123)*.3+50*Math.exp(-((i%n-n/2)**2+(Math.floor(i/n)-n/2)**2)/4)),variance:new Float64Array(n*n).fill(.1),quality:new Uint8Array(n*n).fill(1),wavelengths:new Float64Array(n*n).fill(wavelength),wavelength,unit:'MJy/sr',gridKey:JSON.stringify([p.ra,p.dec,size,n]),aligned:true};await cache.set(`${p.ra}|${p.dec}|${size}|${obs.path.replace('.fits',extra?'-extra.fits':'.fits')}`,{clean:frame,raw:frame});}
    await cache.flush();return {waves,observations,url:'/explore/?'+new URLSearchParams({hpx:cellAt(p.ra,p.dec),order:9,view:'cell',sourceRa:p.ra,sourceDec:p.dec,size,channel:32,nearby:0,zoom:1})};
   });
   let held=new Map(),hold=true;const jsonInfo=extra=>({covered:true,coverage:1,wavelength:setup.waves[extra?33:32]});
   await page.route('**/api/observations?**',route=>{const extra=Number(new URL(route.request().url()).searchParams.get('wavelength'))===setup.waves[33];return route.fulfill({json:{observations:setup.observations.map(o=>extra?{...o,id:o.id+'-extra',path:o.path.replace('.fits','-extra.fits')}:o)}});});
   await page.route('**/api/frame-info?**',async route=>{const path=new URL(route.request().url()).searchParams.get('image'),extra=path.includes('-extra');if(hold&&!extra){await new Promise(resolve=>held.set(path,resolve));}await route.fulfill({json:jsonInfo(extra)});});
   const release=async i=>{const path=setup.observations[i].path;for(let n=0;!held.has(path)&&n<100;n++)await new Promise(r=>setTimeout(r,20));assert(held.has(path),'header request must start');held.get(path)();held.delete(path);};
   const date=side=>page.locator('#cell-handle-'+side+' .cell-timeline-date').textContent();
   const ready=async()=>{for(const side of dual?['left','right']:['left'])await page.locator('#cell-canvas-'+side+':not([hidden]):not([aria-label*="survey preview"])').waitFor();};
   await page.goto(base+setup.url+(dual?'&dual=1':''));await release(2);await ready();
   const first=await date('left'),firstRight=await date('right');
   await page.getByRole('button',{name:'Add layer',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cell-layer-status')?.textContent==='');await ready();
   const beforePixels=await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));
   await page.evaluate(()=>{window.hiddenEvents=0;window.canvasWatcher=new MutationObserver(records=>{window.hiddenEvents+=records.filter(r=>r.attributeName==='hidden'&&r.oldValue===null).length;});document.querySelectorAll('.cell-stage canvas').forEach(c=>window.canvasWatcher.observe(c,{attributes:true,attributeOldValue:true,attributeFilter:['hidden']}));});
   for(const i of [3,1,4,0]){await release(i);await page.waitForFunction(n=>document.querySelector('#cell-count').textContent.startsWith(n+' exposures'),5-held.size);await page.waitForTimeout(100);assert.equal(await date('left'),first,'background arrivals must preserve the displayed date');if(dual)assert.equal(await date('right'),firstRight,'background arrivals must preserve right date');}
   await ready();assert.equal(await page.evaluate(()=>window.hiddenEvents),0,'background arrivals must not hide loaded images');assert.deepEqual(await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.toDataURL())),beforePixels,'background arrivals preserve displayed pixels');
   assert.match(await page.locator('#cell-count').textContent(),/^5 exposures/);
   const play=page.locator('#cell-play');assert(await play.isEnabled());
   await page.locator('#cell-scrub-left').focus();await page.keyboard.press('Home');await ready();const start=await date('left');
   await play.click();await page.waitForFunction(()=>document.querySelector('#cell-play').getAttribute('aria-pressed')==='true');assert.match(await play.textContent(),/Pause/);await page.waitForFunction(s=>document.querySelector('#cell-handle-left .cell-timeline-date').textContent!==s,start);await ready();const firstStep=await date('left');await page.waitForFunction(s=>document.querySelector('#cell-handle-left .cell-timeline-date').textContent!==s,firstStep);await ready();
   await play.click();assert.equal(await play.getAttribute('aria-pressed'),'false');assert.match(await play.textContent(),/Play/);const paused=await date('left');await page.waitForTimeout(1800);assert.equal(await date('left'),paused,'Pause must stop advancement');
   await page.locator('#cell-scrub-left').focus();await page.keyboard.press('End');await ready();await play.click();await ready();assert.notEqual(await date('left'),paused,'Play from last exposure wraps to first');await play.click();
   if(process.env.SATE_QA_SCREENSHOTS)await page.screenshot({path:process.env.SATE_QA_SCREENSHOTS+'/'+name+'-'+(dual?'dual':'single')+'.png',fullPage:true});
   for(const width of [390,320]){await page.setViewportSize({width,height:844});await play.scrollIntoViewIfNeeded();assert(await play.isVisible());const r=await play.boundingBox();assert(r.x>=0&&r.x+r.width<=width,'Play remains inside mobile viewport');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
   // Saved dates are allowed to wait for their preferred headers, without falling
   // back to an unrelated ready frame or changing again when indexing finishes.
   hold=true;held=new Map();await page.goto(base+setup.url+'&exposure=loading-0'+(dual?'&dual=1&compare=loading-4':''));await release(2);await page.waitForTimeout(100);assert(await page.locator('#cell-canvas-left').evaluate(c=>c.hidden||c.getAttribute('aria-label').includes('survey preview')));await release(0);await page.locator('#cell-canvas-left:not([hidden]):not([aria-label*="survey preview"])').waitFor();const savedLeft=await date('left');await release(4);await ready();const savedRight=await date('right');await release(1);await release(3);await page.waitForFunction(()=>document.querySelector('#cell-count').textContent.startsWith('5 exposures'));assert.equal(await date('left'),savedLeft);if(dual)assert.equal(await date('right'),savedRight);
   assert.deepEqual(errors,[]);hold=false;for(const resolve of held.values())resolve();await page.close();console.log(name,dual?'dual':'single','PASS: progressive loading, layers, stable dates/pixels, Play/Pause, saved dates, mobile');
  }
 }finally{await browser.close();}
}
