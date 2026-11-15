// Controlled browser checks: actual preset links/manifests, synthetic cached pixels,
// and a failing/recovering archive. Run separately from the live-image audit.
import assert from 'node:assert/strict';
const {chromium,webkit}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.SATE_BASE||'http://127.0.0.1:4194';
// Use native keyboard activation in WebKit as a separate accessibility path.
const activate=(locator,name)=>name==='webkit'?locator.press('Enter'):locator.click();
for(const [name,engine,launch] of [['chrome',chromium,{channel:'chrome'}],['webkit',webkit,{}]]){
 if(process.env.QA_BROWSER&&process.env.QA_BROWSER!==name)continue;
 const browser=await engine.launch({headless:true,...launch});
 try{
  for(const key of ['0','1','2','3','4','5','6','7','kapteyn','groombridge','3i-atlas','vesta','ceres','swan']){
   const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/about/');
   const setup=await page.evaluate(async key=>{
    const {demoTargetUrl}=await import('/demo-targets.js'),{motionExample,motionExampleUrl}=await import('/motion-examples.js'),{exampleSequenceUrl}=await import('/example-sequences.js'),{createFrameCache}=await import('/cell-frame-cache.js'),{createSkyGrid}=await import('/science/spectral.js');
    const m=await(await fetch('/assets/spherex-survey.json')).json(),url=/^\d$/.test(key)?demoTargetUrl(key,m):motionExampleUrl(key),q=new URLSearchParams(url.split('?')[1]),curated=motionExample(key)?.curated,manifest=await(await fetch(curated||exampleSequenceUrl(q))).json(),p={ra:Number(q.get('sourceRa')),dec:Number(q.get('sourceDec')),size:Number(q.get('size')||.2)},wave=m.wavelengths[Number(q.get('channel'))],grid=createSkyGrid(p.ra,p.dec,p.size),cache=createFrameCache();
    const wavelengthComparison=q.has('waves'),layerObservations=wavelengthComparison?(await(await fetch(exampleSequenceUrl(q).replace('.json','-wavelength.json'))).json()).observations:[];
    const extra={id:'fixture-new-date',path:'/ibe/data/spherex/dr1/level2/fixture-new-date.fits',mjd:65000,date:new Date((65000-40587)*86400000).toISOString(),band:manifest.observations[0].band,wavelength:wave};
    for(const obs of [...manifest.observations,...layerObservations,extra]){const n=grid.pixels,wavelength=obs.wavelength||wave,frame={width:n,height:n,values:Float32Array.from({length:n*n},(_,i)=>2+Math.sin(i*123*wavelength)*.3+50*Math.exp(-((i%n-n/2-wavelength*2)**2+(Math.floor(i/n)-n/2)**2)/4)),variance:new Float64Array(n*n).fill(.1),quality:new Uint8Array(n*n).fill(1),wavelengths:new Float64Array(n*n).fill(wavelength),wavelength,unit:'MJy/sr',gridKey:JSON.stringify([p.ra,p.dec,p.size,n]),aligned:true};await cache.set(`${p.ra}|${p.dec}|${p.size}|${obs.path}`,{clean:frame,raw:frame});}await cache.flush();
    return {url,curated,wavelengthComparison,layerObservations,observations:manifest.observations,extra,wave,dual:q.get('dual')==='1',tracking:q.get('tracking')==='1',known:q.get('known')==='1',stretch:q.get('stretch')||'sources'};
   },key);
   let recovering=false;
   await page.route('**/api/observations?**',route=>route.fulfill(recovering?{json:{observations:[...setup.observations,setup.extra]}}:{status:502,json:{error:'Fixture archive outage'}}));
   await page.route('**/api/frame-info?**',route=>{const path=new URL(route.request().url()).searchParams.get('image'),obs=[...setup.observations,...setup.layerObservations].find(o=>o.path===path);return route.fulfill({json:{coverage:1,covered:true,wavelength:obs?.wavelength||setup.wave}});});
   await page.route('**/api/known-objects?**',route=>route.fulfill({json:{sources:[],mjd:60000,date:'2023-02-25T00:00:00Z'}}));
   await page.goto(base+setup.url);for(const side of setup.dual?['left','right']:['left'])await page.locator('#cell-canvas-'+side+':not([hidden])').waitFor();
   assert.equal(await page.locator('#cell-dual').isChecked(),setup.dual);assert.equal(await page.locator('#motion-mark').isChecked(),setup.tracking);assert.equal(await page.locator('#cell-known').isChecked(),setup.known);assert.equal(await page.locator('#cell-stretch').inputValue(),setup.stretch);
   if(setup.dual&&!setup.wavelengthComparison)assert.notEqual(await page.locator('#cell-date-left').textContent(),await page.locator('#cell-date-right').textContent(),'comparison dates must differ');
   if(!setup.curated){await page.locator('#cell-archive-retry:not([hidden])').waitFor();const before=await page.locator('.cell-pane-heading time').allTextContents();const beforePixels=await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));recovering=true;await activate(page.locator('#cell-archive-retry'),name);await page.waitForFunction(n=>document.querySelector('#cell-count').textContent.startsWith(n+' exposures'),setup.observations.length+1);assert.deepEqual(await page.locator('.cell-pane-heading time').allTextContents(),before);assert.deepEqual(await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.toDataURL())),beforePixels);assert(await page.locator('#cell-play').isEnabled());}
   if(setup.wavelengthComparison){
    const bands=await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.getAttribute('aria-label').match(/[0-9.]+ µm/g)?.join(', ')));assert.notEqual(bands[0],bands[1]);
    assert.equal(await page.locator('[aria-label="Layer 1: Left viewer"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[aria-label="Layer 2: Right viewer"]').getAttribute('aria-pressed'),'true');
    await activate(page.locator('[data-active="right"]'),name);assert((await page.locator('#cell-fits').getAttribute('href')).includes(setup.layerObservations[0].path));
    const pixels=await page.locator('.cell-stage canvas').evaluateAll(nodes=>nodes.map(c=>c.toDataURL()));await activate(page.locator('#cell-compare'),name);
    for(const [opacity,index] of [['0',0],['100',1]]){await page.locator('#cell-compare-opacity').fill(opacity);await page.waitForFunction(expected=>document.querySelector('#cell-canvas-left').toDataURL()===expected,pixels[index]);}
    assert((await page.locator('#cell-compare-dates').textContent()).includes(setup.layerObservations[0].wavelength.toFixed(3)+' µm'));
    await activate(page.locator('#cell-compare'),name);await activate(page.locator('#cell-play'),name);assert.equal(await page.locator('#cell-play').getAttribute('aria-pressed'),'true');await activate(page.locator('#cell-play'),name);
    await page.locator('#cell-canvas-right:not([hidden])').waitFor();await activate(page.locator('#cell-document'),name);await page.waitForURL(url=>url.pathname==='/saved-cells/');
    const record=await page.evaluate(async()=>{const {listDocuments}=await import('/cell-documents-store.js');return(await listDocuments())[0].snapshots[0];});assert.equal(record.layers[1].nearby,true);assert.equal(record.layers[1].target,'right');assert(record.layers[1].observations.right.path.includes('/'+setup.layerObservations[0].band.slice(-1)+'/'));
    await page.goto(base+record.viewerUrl);for(const side of ['left','right'])await page.locator('#cell-canvas-'+side+':not([hidden])').waitFor();assert.equal(await page.locator('[aria-label="Layer 2: Right viewer"]').getAttribute('aria-pressed'),'true');
   }
   if(key==='0'){
    if(name==='webkit')await page.locator('#cell-known').press('Space');else await page.locator('#cell-known').uncheck();assert.equal(new URL(page.url()).searchParams.has('known'),false);await page.reload();await page.locator('#cell-canvas-left:not([hidden])').waitFor();assert.equal(await page.locator('#cell-known').isChecked(),false);if(name==='webkit')await page.locator('#cell-known').press('Space');else await page.locator('#cell-known').check();assert.equal(new URL(page.url()).searchParams.get('known'),'1');
   }
   for(const width of [390,320]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),width);await page.locator('#cell-play').scrollIntoViewIfNeeded();assert(await page.locator('#cell-play').isVisible());}
   assert.deepEqual(errors,[]);console.log(name,key,'PASS: preset tools, valid date pair, outage fallback, archive merge, mobile');await page.close();
  }
 }finally{await browser.close();}
}
