import {MIRA_CELL} from './sky-model.js';
const regionUrl=`/explore/?hpx=${MIRA_CELL}&order=9&channel=0`;
export function comparisonPreview(){
 return `<section class="proof-section home-comparison" aria-labelledby="comparison-heading"><div class="shell home-comparison-layout">
  <div class="home-comparison-copy"><p class="home-comparison-eyebrow">Real SPHEREx observations</p><h2 id="comparison-heading">See the sky<br>change over time.</h2><p class="section-copy">Compare real SPHEREx observations of the same region across dates and infrared wavelengths.</p><a class="button" href="/explore/">Explore the sky map <span class="arrow" aria-hidden="true">↗</span></a></div>
  <figure class="observation-comparison"><a class="observation-comparison-link" href="${regionUrl}" aria-label="Open the variable star’s region in the sky map"><header><div><span class="observation-comparison-kicker">Known variable star · SPHEREx</span><h3 data-comparison-name>Known variable star</h3></div></header><div class="observation-pair">
   <div><div class="observation-image"><img src="/assets/mira-1.png" width="41" height="41" loading="lazy" alt="Earlier SPHEREx image of the known variable star"></div><div class="observation-period"><span>Earlier</span><strong data-comparison-date="0">First observing period</strong></div></div>
   <div><div class="observation-image"><img src="/assets/mira-2.png" width="41" height="41" loading="lazy" alt="Later SPHEREx image of the same star, appearing fainter on the shared display scale"></div><div class="observation-period"><span>Later</span><strong data-comparison-date="1">Second observing period</strong></div></div>
  </div><div class="observation-comparison-bottom"><div><strong>Fainter in the later observations.</strong><span data-comparison-method>Same sky area · Shared display scale</span></div><span>Open this region ↗</span></div></a><figcaption><span>Each image combines two SPHEREx observations.</span><a href="/assets/mira.json" target="_blank" rel="noreferrer">Source records ↗</a></figcaption></figure>
 </div></section>`;
}
export function mountComparisonPreview(){
 const root=document.querySelector('.home-comparison'),controller=new AbortController();if(!root)return()=>{};
 fetch('/assets/mira.json',{signal:controller.signal}).then(r=>{if(!r.ok)throw Error('Source records unavailable');return r.json();}).then(data=>{
  if(controller.signal.aborted||!root.isConnected)return;
  if(typeof data.name==='string')root.querySelector('[data-comparison-name]').textContent=data.name;
  for(const [i,date]of(data.dates||[]).entries()){const el=root.querySelector(`[data-comparison-date="${i}"]`);if(el&&typeof date==='string'){el.textContent=date;root.querySelectorAll('.observation-image img')[i].alt=`SPHEREx image of ${data.name}, ${date}, on the shared display scale`;}}
  const waves=(data.observations||[]).map(o=>o.wcs_wave_approx_um?.[0]).filter(Number.isFinite);if(waves.length)root.querySelector('[data-comparison-method]').textContent=`${Math.min(...waves).toFixed(2)}–${Math.max(...waves).toFixed(2)} µm · Shared display scale`;
 }).catch(()=>{});
 return()=>controller.abort();
}
