// Controlled browser regression: generated survey pixels and cached exposure
// fixtures. Live cold-load timing is measured separately with no interception.
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'),base=process.env.SATE_BASE||'http://127.0.0.1:4196';
for(const [name,engine,launch]of[['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 const browser=await engine.launch({headless:true,...launch}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const activate=locator=>name==='webkit'?locator.press('Enter'):locator.click();
 try{
  await page.goto(base+'/about/');
  const setup=await page.evaluate(async()=>{
   const {cellAt}=await import('/sky-model.js'),{createSkyGrid}=await import('/science/spectral.js'),{createFrameCache}=await import('/cell-frame-cache.js');const meta=await(await fetch('/assets/spherex-survey.json')).json(),p={ra:269.4485,dec:4.7394,size:.2},g=createSkyGrid(p.ra,p.dec,p.size),cache=createFrameCache(),observations=[];
   for(const channel of [32,33])for(const i of [0,1]){const obs={id:`first-${channel}-${i}`,path:`/ibe/data/spherex/dr1/level2/first-${channel}-${i}.fits`,date:new Date((60000+i-40587)*86400000).toISOString(),mjd:60000+i,band:'SPHEREx-D2',wavelength:meta.wavelengths[channel]};observations.push(obs);const n=g.pixels,frame={width:n,height:n,values:Float32Array.from({length:n*n},(_,i)=>2+Math.sin(i)*.1),variance:new Float64Array(n*n).fill(.1),quality:new Uint8Array(n*n).fill(1),wavelengths:new Float64Array(n*n).fill(obs.wavelength),wavelength:obs.wavelength,unit:'MJy/sr',aligned:true};await cache.set(`${p.ra}|${p.dec}|${p.size}|${obs.path}`,{raw:frame,clean:frame});}await cache.flush();
   const tile=document.createElement('canvas');tile.width=tile.height=512;tile.getContext('2d').fillStyle='#888';tile.getContext('2d').fillRect(0,0,512,512);
   return {observations,wave:meta.wavelengths[32],tile:tile.toDataURL(),url:'/explore/?'+new URLSearchParams({hpx:cellAt(p.ra,p.dec),order:9,view:'cell',channel:32,sourceRa:p.ra,sourceDec:p.dec,size:p.size,zoom:1})};
  });
  let releaseSearch,releaseHeaders,holdSearch=true,holdHeaders=true;
  const searchGate=new Promise(r=>releaseSearch=r),headerGate=new Promise(r=>releaseHeaders=r);
  await page.route('**/spherex_allsky_cube/Norder5/**',r=>r.fulfill({contentType:'image/png',body:Buffer.from(setup.tile.split(',')[1],'base64')}));
  await page.route('**/api/observations?**',async r=>{if(holdSearch)await searchGate;const wave=Number(new URL(r.request().url()).searchParams.get('wavelength'));await r.fulfill({json:{observations:setup.observations.filter(o=>o.wavelength===wave)}});});
  await page.route('**/api/frame-info?**',async r=>{if(holdHeaders)await headerGate;const obs=setup.observations.find(o=>o.path===new URL(r.request().url()).searchParams.get('image'));await r.fulfill({json:{wavelength:obs.wavelength,coverage:1,covered:true}});});
  await page.goto(base+setup.url);const canvas=page.locator('#cell-canvas-left');await page.locator('#cell-canvas-left[aria-label*="survey preview"]:not([hidden])').waitFor();
  assert(await page.locator('#cell-nearby').isChecked());assert(await page.locator('#cell-play').isDisabled());assert(await page.locator('#cell-document').isDisabled());assert.match(await page.locator('#cell-date-left').textContent(),/Survey view/);const preview=await canvas.evaluate(c=>c.toDataURL());
  holdSearch=false;releaseSearch();await page.waitForFunction(()=>document.querySelector('#cell-index-progress').textContent.includes('/ 2'));
  assert.equal(await canvas.evaluate(c=>c.toDataURL()),preview);assert(await page.locator('.cell-image-message').first().isHidden(),'survey remains visible while exposure metadata is pending');
  holdHeaders=false;releaseHeaders();await page.locator('#cell-canvas-left[aria-label*="SPHEREx view"]:not([hidden])').waitFor();assert(!((await page.locator('#cell-date-left').textContent()).includes('Survey')));assert(await page.locator('#cell-document').isEnabled());assert(await page.locator('.cell-image-caption').first().isHidden());
  await activate(page.locator('#cell-add-wavelength'));await page.locator('#cell-canvas-left[aria-label*="Layer 2"]:not([hidden])').waitFor();const extra=page.locator('.cell-layer-card').last();await activate(extra.locator('summary'));assert(await extra.locator('.cell-layer-nearby').isChecked());if(name==='webkit')await extra.locator('.cell-layer-nearby').press('Space');else await extra.locator('.cell-layer-nearby').uncheck();
  await activate(page.locator('.cell-base-options summary'));if(name==='webkit')await page.locator('#cell-nearby').press('Space');else await page.locator('#cell-nearby').uncheck();await page.waitForFunction(()=>new URLSearchParams(location.search).get('nearby')==='0');assert.equal(new URL(page.url()).searchParams.get('layerNearby'),'');
  await page.reload();await page.locator('#cell-wave:not([disabled])').waitFor();assert.equal(await page.locator('#cell-nearby').isChecked(),false);assert.equal(await page.locator('.cell-layer-nearby').isChecked(),false);
  await page.unroute('**/api/observations?**');await page.route('**/api/observations?**',r=>r.fulfill({status:502,json:{error:'Fixture outage'}}));await page.goto(base+setup.url);await page.locator('#cell-canvas-left[aria-label*="survey preview"]:not([hidden])').waitFor();await page.locator('#cell-archive-retry').waitFor({state:'visible'});assert(await page.locator('.cell-image-message').first().isHidden());
  await page.unroute('**/api/observations?**');await page.route('**/api/observations?**',r=>r.fulfill({json:{observations:setup.observations.filter(o=>o.wavelength===setup.wave)}}));await activate(page.locator('#cell-archive-retry'));await page.locator('#cell-canvas-left[aria-label*="SPHEREx view"]:not([hidden])').waitFor();
  for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);}
  assert.deepEqual(errors,[]);console.log(name,'PASS: first survey image, truthful loading state, exposure transition, nearby defaults and explicit off reload, caption removal, mobile');
 }finally{await browser.close();}
}
